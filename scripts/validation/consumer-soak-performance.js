#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { importAsyncAPI } from '../../packages/runtime/importers/asyncapi/importer.js';
import { generateEventConsumer } from '../../packages/runtime/generators/consumers/index.js';
import { FIXTURE_CORPUS } from './asyncapi-fixture-corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const SUPPORTED_TRANSPORTS = new Set(['kafka', 'amqp', 'mqtt']);
const DEFAULT_ITERATIONS = Number.parseInt(process.env.SOAK_ITERATIONS ?? '5', 10);
const DEFAULT_IMPORT_TIMEOUT_MS = Number.parseInt(process.env.SOAK_IMPORT_TIMEOUT_MS ?? '60000', 10);
const DEFAULT_OUTPUT = process.env.SOAK_OUTPUT
  ? path.resolve(process.env.SOAK_OUTPUT)
  : path.join(PROJECT_ROOT, 'reports', 'consumer-soak-performance.json');

function printHelp() {
  console.log(`
Usage: node scripts/validation/consumer-soak-performance.js [options]

Options:
  --iterations, -n <count>   Number of soak iterations (default: ${DEFAULT_ITERATIONS})
  --output, -o <path>        Output JSON path (default: ${DEFAULT_OUTPUT})
  --help, -h                 Show help

Environment variables:
  SOAK_ITERATIONS
  SOAK_OUTPUT
  SOAK_IMPORT_TIMEOUT_MS
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    iterations: Number.isFinite(DEFAULT_ITERATIONS) ? DEFAULT_ITERATIONS : 5,
    outputPath: DEFAULT_OUTPUT,
    importTimeoutMs: Number.isFinite(DEFAULT_IMPORT_TIMEOUT_MS) ? DEFAULT_IMPORT_TIMEOUT_MS : 60000
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if ((arg === '--iterations' || arg === '-n') && args[i + 1]) {
      options.iterations = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.outputPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error(`Invalid iterations value: ${options.iterations}`);
  }

  return options;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function summarizeLatency(values) {
  if (!values.length) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0
    };
  }

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: mean(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95)
  };
}

async function fetchRemoteFixture(url, timeoutMs = 60000) {
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

function inferFixtureExtension(fixture) {
  if (fixture.inputPath) {
    const ext = path.extname(fixture.inputPath);
    if (ext) {
      return ext;
    }
  }
  return '.yml';
}

async function resolveFixtureSources() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-soak-fixtures-'));
  const resolved = [];

  for (const fixture of FIXTURE_CORPUS) {
    if (fixture.inputPath) {
      const absolutePath = path.resolve(PROJECT_ROOT, fixture.inputPath);
      await fs.access(absolutePath);
      resolved.push({
        ...fixture,
        sourceType: 'local',
        resolvedPath: absolutePath
      });
      continue;
    }

    if (fixture.url) {
      const raw = await fetchRemoteFixture(fixture.url);
      const filePath = path.join(tempDir, `${fixture.id}${inferFixtureExtension(fixture)}`);
      await fs.writeFile(filePath, raw, 'utf8');
      resolved.push({
        ...fixture,
        sourceType: 'remote',
        resolvedPath: filePath
      });
      continue;
    }

    throw new Error(`Fixture ${fixture.id} does not define inputPath or url.`);
  }

  return {
    fixtures: resolved,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

export async function runSoakBenchmark(options = {}) {
  const iterations = options.iterations;
  const importTimeoutMs = options.importTimeoutMs;
  const outputPath = options.outputPath;

  const { fixtures, cleanup } = await resolveFixtureSources();

  const importLatencies = [];
  const generationLatencies = [];
  const heapSamplesMb = [];
  const failures = [];
  const perIteration = [];

  let fixtureRuns = 0;
  let generatedManifests = 0;

  try {
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const iterationSummary = {
        iteration,
        fixtureRuns: 0,
        importMsTotal: 0,
        generationMsTotal: 0,
        generatedManifests: 0,
        failures: 0
      };

      for (const fixture of fixtures) {
        fixtureRuns += 1;
        iterationSummary.fixtureRuns += 1;

        const importStart = performance.now();
        let imported;

        try {
          imported = await importAsyncAPI(fixture.resolvedPath, { timeout: importTimeoutMs });
          const importDurationMs = performance.now() - importStart;
          importLatencies.push(importDurationMs);
          iterationSummary.importMsTotal += importDurationMs;
        } catch (error) {
          failures.push({
            iteration,
            fixtureId: fixture.id,
            phase: 'import',
            message: error.message
          });
          iterationSummary.failures += 1;
          continue;
        }

        const supportedManifests = (imported.manifests || []).filter((manifest) =>
          SUPPORTED_TRANSPORTS.has(manifest?.delivery?.contract?.transport)
        );

        if (!supportedManifests.length) {
          failures.push({
            iteration,
            fixtureId: fixture.id,
            phase: 'generation',
            message: 'No supported kafka/amqp/mqtt manifests generated from importer output'
          });
          iterationSummary.failures += 1;
          continue;
        }

        for (const manifest of supportedManifests) {
          const generationStart = performance.now();

          try {
            const generated = generateEventConsumer(manifest, {
              typescript: false,
              includeTests: false,
              includePIIUtil: false
            });

            if (!generated?.consumer || typeof generated.consumer !== 'string') {
              throw new Error('Generator returned empty consumer output');
            }

            const generationDurationMs = performance.now() - generationStart;
            generationLatencies.push(generationDurationMs);
            iterationSummary.generationMsTotal += generationDurationMs;
            iterationSummary.generatedManifests += 1;
            generatedManifests += 1;
          } catch (error) {
            failures.push({
              iteration,
              fixtureId: fixture.id,
              phase: 'generation',
              message: error.message
            });
            iterationSummary.failures += 1;
          }
        }

        const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
        heapSamplesMb.push(heapMb);
      }

      perIteration.push(iterationSummary);
    }
  } finally {
    await cleanup();
  }

  const failureRate = fixtureRuns === 0 ? 0 : failures.length / fixtureRuns;
  const report = {
    generatedAt: new Date().toISOString(),
    fixtureCorpus: {
      fixtureCount: FIXTURE_CORPUS.length,
      fixtureIds: FIXTURE_CORPUS.map((fixture) => fixture.id)
    },
    soak: {
      iterations,
      fixtureRuns,
      generatedManifests,
      importTimeoutMs
    },
    metrics: {
      importMs: summarizeLatency(importLatencies),
      generationMs: summarizeLatency(generationLatencies),
      memoryMb: {
        count: heapSamplesMb.length,
        min: heapSamplesMb.length ? Math.min(...heapSamplesMb) : 0,
        max: heapSamplesMb.length ? Math.max(...heapSamplesMb) : 0,
        mean: mean(heapSamplesMb),
        p95: percentile(heapSamplesMb, 95)
      },
      failures: {
        count: failures.length,
        rate: failureRate,
        samples: failures.slice(0, 100)
      }
    },
    perIteration,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return {
    outputPath,
    report
  };
}

async function main() {
  const options = parseArgs();
  const { outputPath, report } = await runSoakBenchmark(options);

  console.log(`Soak report: ${path.relative(PROJECT_ROOT, outputPath)}`);
  console.log(`Iterations: ${report.soak.iterations}`);
  console.log(`Fixture runs: ${report.soak.fixtureRuns}`);
  console.log(`Generated manifests: ${report.soak.generatedManifests}`);
  console.log(`Import p95: ${report.metrics.importMs.p95.toFixed(2)}ms`);
  console.log(`Generation p95: ${report.metrics.generationMs.p95.toFixed(2)}ms`);
  console.log(`Max heap: ${report.metrics.memoryMb.max.toFixed(2)}MB`);
  console.log(`Failures: ${report.metrics.failures.count}`);

  if (report.metrics.failures.count > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Soak benchmark failed: ${error.message}`);
  process.exit(1);
});
