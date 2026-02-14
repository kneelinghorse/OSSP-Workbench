#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { importAsyncAPI } from '../../packages/runtime/importers/asyncapi/importer.js';
import { generateEventConsumer } from '../../packages/runtime/generators/consumers/index.js';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'reports');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'artifacts', 'real-world-asyncapi-validation');

const SUPPORTED_TRANSPORTS = new Set(['kafka', 'amqp', 'mqtt']);

const SPECS = [
  {
    id: 'streetlights-kafka',
    source: 'AsyncAPI community examples',
    url: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-kafka.yml'
  },
  {
    id: 'streetlights-mqtt',
    source: 'AsyncAPI community examples',
    url: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-mqtt.yml'
  },
  {
    id: 'streetlights-operation-security',
    source: 'AsyncAPI community examples',
    url: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-operation-security.yml'
  },
  {
    id: 'rpc-client-amqp',
    source: 'AsyncAPI community examples',
    url: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/rpc-client.yml'
  }
];

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function cleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${String(value).trimEnd()}\n`, 'utf8');
}

async function checkSyntax(filePath) {
  try {
    await execFile('node', ['--check', filePath], {
      cwd: PROJECT_ROOT
    });
    return { ok: true, filePath, error: null };
  } catch (error) {
    return {
      ok: false,
      filePath,
      error: error?.stderr || error?.message || 'node --check failed'
    };
  }
}

async function fetchSpec(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function createMarkdownReport(report) {
  const lines = [];
  lines.push('# Real-World AsyncAPI Validation');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Specs tested: ${report.summary.specsTested}`);
  lines.push(`- Specs passed: ${report.summary.specsPassed}`);
  lines.push(`- Import failures: ${report.summary.importFailures}`);
  lines.push(`- Generation failures: ${report.summary.generationFailures}`);
  lines.push(`- Syntax failures: ${report.summary.syntaxFailures}`);
  lines.push(
    `- Supported manifests generated: ${report.summary.generatedManifests}/${report.summary.supportedManifests}`
  );
  lines.push('');
  lines.push('## Spec Results');
  lines.push('');
  lines.push('| Spec | Source | AsyncAPI | Channels | Messages | Manifests | Supported | Generated | Syntax | Status |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---|');

  for (const result of report.specResults) {
    const status = result.success ? 'PASS' : 'FAIL';
    lines.push(
      `| ${result.id} | ${result.source} | ${result.asyncapiVersion || 'n/a'} | ${result.channelCount} | ${result.messageCount} | ${result.manifestCount} | ${result.supportedManifestCount} | ${result.generatedCount} | ${result.syntaxPassCount}/${result.generatedCount} | ${status} |`
    );
  }

  lines.push('');
  lines.push('## Failures');
  lines.push('');

  const allFailures = report.specResults
    .flatMap((result) =>
      (result.failures || []).map((failure) => ({ spec: result.id, ...failure }))
    );

  if (allFailures.length === 0) {
    lines.push('- None');
  } else {
    for (const failure of allFailures) {
      lines.push(`- ${failure.spec}: ${failure.type} - ${failure.message}`);
    }
  }

  lines.push('');
  lines.push('## Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run validate:asyncapi:realworld');
  lines.push('```');
  lines.push('');
  lines.push('Artifacts:');
  lines.push(`- JSON: ${path.relative(PROJECT_ROOT, report.jsonPath)}`);
  lines.push(`- Markdown: ${path.relative(PROJECT_ROOT, report.markdownPath)}`);
  lines.push(`- Generated outputs: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}`);

  return lines.join('\n');
}

async function run() {
  await cleanDir(OUTPUT_DIR);
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const downloadDir = path.join(OUTPUT_DIR, 'specs');
  const generatedDir = path.join(OUTPUT_DIR, 'generated');
  await fs.mkdir(downloadDir, { recursive: true });
  await fs.mkdir(generatedDir, { recursive: true });

  const specResults = [];
  let importFailures = 0;
  let generationFailures = 0;
  let syntaxFailures = 0;
  let supportedManifests = 0;
  let generatedManifests = 0;

  for (const spec of SPECS) {
    const specResult = {
      id: spec.id,
      source: spec.source,
      url: spec.url,
      asyncapiVersion: null,
      channelCount: 0,
      messageCount: 0,
      manifestCount: 0,
      supportedManifestCount: 0,
      generatedCount: 0,
      syntaxPassCount: 0,
      success: false,
      failures: []
    };

    try {
      const raw = await fetchSpec(spec.url);
      const localSpecPath = path.join(downloadDir, `${spec.id}.yml`);
      await writeText(localSpecPath, raw);

      const imported = await importAsyncAPI(localSpecPath, { timeout: 60000 });
      specResult.asyncapiVersion = imported.metadata?.asyncapi_version || null;
      specResult.channelCount = imported.metadata?.channel_count || 0;
      specResult.messageCount = imported.metadata?.message_count || 0;
      specResult.manifestCount = imported.manifests?.length || 0;

      const manifests = imported.manifests || [];
      const supported = manifests.filter((manifest) =>
        SUPPORTED_TRANSPORTS.has(manifest?.delivery?.contract?.transport)
      );

      specResult.supportedManifestCount = supported.length;
      supportedManifests += supported.length;

      for (const manifest of supported) {
        const eventSlug = slug(manifest?.event?.name || 'event');
        const transport = manifest?.delivery?.contract?.transport || 'unknown';
        const targetDir = path.join(generatedDir, spec.id, eventSlug);
        await fs.mkdir(targetDir, { recursive: true });

        try {
          const generated = generateEventConsumer(manifest, {
            typescript: false,
            includeTests: true,
            includePIIUtil: true
          });

          const consumerPath = path.join(targetDir, `${eventSlug}-consumer.js`);
          await writeText(consumerPath, generated.consumer);

          if (generated.test) {
            await writeText(path.join(targetDir, `${eventSlug}-consumer.test.js`), generated.test);
          }

          if (generated.piiUtil) {
            const utilsDir = path.join(targetDir, 'utils');
            await fs.mkdir(utilsDir, { recursive: true });
            await writeText(path.join(utilsDir, 'pii-masking.js'), generated.piiUtil);
          }

          const syntax = await checkSyntax(consumerPath);
          specResult.generatedCount += 1;
          generatedManifests += 1;

          if (syntax.ok) {
            specResult.syntaxPassCount += 1;
          } else {
            syntaxFailures += 1;
            specResult.failures.push({
              type: 'syntax',
              message: `${transport}/${eventSlug}: ${syntax.error}`
            });
          }
        } catch (error) {
          generationFailures += 1;
          specResult.failures.push({
            type: 'generation',
            message: `${transport}/${eventSlug}: ${error.message}`
          });
        }
      }

      if (supported.length === 0) {
        generationFailures += 1;
        specResult.failures.push({
          type: 'generation',
          message: 'No supported transport manifests (kafka/amqp/mqtt) produced by importer'
        });
      }

      specResult.success = specResult.failures.length === 0;
    } catch (error) {
      importFailures += 1;
      specResult.failures.push({
        type: 'import',
        message: error.message
      });
      specResult.success = false;
    }

    specResults.push(specResult);
  }

  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    summary: {
      specsTested: SPECS.length,
      specsPassed: specResults.filter((item) => item.success).length,
      importFailures,
      generationFailures,
      syntaxFailures,
      supportedManifests,
      generatedManifests
    },
    specResults
  };

  const jsonPath = path.join(REPORT_DIR, 'real-world-asyncapi-validation.json');
  const markdownPath = path.join(REPORT_DIR, 'real-world-asyncapi-validation.md');
  report.jsonPath = jsonPath;
  report.markdownPath = markdownPath;

  await writeJson(jsonPath, report);
  const markdown = createMarkdownReport(report);
  await writeText(markdownPath, markdown);

  console.log(`Validation complete: ${jsonPath}`);
  console.log(`Markdown summary:   ${markdownPath}`);

  if (
    report.summary.importFailures > 0 ||
    report.summary.generationFailures > 0 ||
    report.summary.syntaxFailures > 0
  ) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`Validation failed: ${error.message}`);
  process.exit(1);
});
