/**
 * CLI Generate Command (ESM)
 * Generate event consumers from Event Protocol manifests or AsyncAPI specs.
 */

import fs from 'fs/promises';
import path from 'path';
import { generateEventConsumers } from '../../generators/consumers/index.js';
import { importAsyncAPI } from '../../importers/asyncapi/importer.js';

const SUPPORTED_TRANSPORTS = new Set(['kafka', 'amqp', 'mqtt']);
const SUPPORTED_LANGS = new Set(['ts', 'js']);

/**
 * Execute legacy generate command (manifest input)
 * @param {object} args - Command arguments
 * @param {string} args.input - Input manifest file or directory
 * @param {string} args.output - Output directory for generated code
 * @param {boolean} args.typescript - Generate TypeScript (default: true)
 * @param {boolean} args.tests - Generate test scaffolds (default: true)
 * @param {boolean} args.piiUtil - Generate PII masking utility (default: true)
 * @param {boolean} args.batch - Batch mode for multiple manifests
 */
async function executeGenerateCommand(args) {
  const {
    input,
    output = './generated-consumers',
    typescript = true,
    tests = true,
    piiUtil = true,
    batch = false
  } = args;

  if (!input) {
    throw new Error('--input is required');
  }

  const manifests = await loadManifests(input, batch);

  if (manifests.length === 0) {
    throw new Error('No manifests found to generate consumers from');
  }

  return runGeneration(manifests, {
    output,
    typescript,
    tests,
    piiUtil,
    sourceLabel: input,
    transportLabel: 'as-defined-in-manifest'
  });
}

/**
 * Dynamic-registry command: ossp generate consumer --spec <file>
 * @param {string} target - Generate target (currently only "consumer")
 * @param {object} options - Command options
 */
async function generateCommand(target, options = {}) {
  const normalizedTarget = String(target || '').toLowerCase();
  if (normalizedTarget !== 'consumer') {
    throw new Error(`Unsupported generate target: ${target}. Supported target: consumer`);
  }

  if (!options.spec) {
    throw new Error('--spec is required for "ossp generate consumer"');
  }

  const transport = normalizeTransport(options.transport || 'kafka');
  const lang = normalizeLanguage(options.lang || 'ts');

  const imported = await importAsyncAPI(options.spec, { timeout: 30000 });
  if (!Array.isArray(imported.manifests) || imported.manifests.length === 0) {
    throw new Error('No event channels found in AsyncAPI specification');
  }

  const manifests = imported.manifests.map((manifest) => ({
    ...manifest,
    delivery: {
      ...(manifest.delivery || {}),
      contract: {
        ...(manifest.delivery?.contract || {}),
        transport
      }
    }
  }));

  return runGeneration(manifests, {
    output: options.output || 'generated-consumers',
    typescript: lang === 'ts',
    tests: options.tests !== false,
    piiUtil: options.piiUtil !== false,
    sourceLabel: options.spec,
    transportLabel: transport
  });
}

function normalizeTransport(transport) {
  const normalized = String(transport || '').toLowerCase();
  if (!SUPPORTED_TRANSPORTS.has(normalized)) {
    throw new Error(`Unsupported transport: ${transport}. Supported: kafka, amqp, mqtt`);
  }
  return normalized;
}

function normalizeLanguage(lang) {
  const normalized = String(lang || '').toLowerCase();
  if (!SUPPORTED_LANGS.has(normalized)) {
    throw new Error(`Unsupported language: ${lang}. Supported: ts, js`);
  }
  return normalized;
}

async function runGeneration(manifests, options) {
  const {
    output,
    typescript,
    tests,
    piiUtil,
    sourceLabel,
    transportLabel
  } = options;

  console.log('🚀 Event Consumer Generator');
  console.log('─'.repeat(50));
  console.log(`Source: ${sourceLabel}`);
  console.log(`Output: ${output}`);
  console.log(`Transport: ${transportLabel}`);
  console.log(`Language: ${typescript ? 'ts' : 'js'}`);
  console.log(`Tests: ${tests}`);
  console.log(`PII Util: ${piiUtil}`);
  console.log('─'.repeat(50));

  const startTime = Date.now();
  const results = generateEventConsumers(manifests, {
    typescript,
    includeTests: tests,
    includePIIUtil: piiUtil
  });
  const duration = Date.now() - startTime;

  if (results.results.length > 0) {
    await writeGeneratedFiles(results.results, output, typescript);
  }

  console.log('\n✅ Generation Complete');
  console.log('─'.repeat(50));
  console.log(`Total: ${results.summary.total}`);
  console.log(`Successful: ${results.summary.successful}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Duration: ${duration}ms`);
  console.log('─'.repeat(50));

  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    for (const error of results.errors) {
      console.log(`  - ${error.eventName}: ${error.error}`);
    }
  }

  console.log(`\n📁 Output: ${output}`);

  return results;
}

/**
 * Load manifests from file or directory
 * @param {string} inputPath - Input file or directory path
 * @param {boolean} batch - Batch mode flag
 * @returns {Promise<object[]>} - Array of manifests
 */
async function loadManifests(inputPath, batch) {
  const stat = await fs.stat(inputPath);

  if (stat.isDirectory()) {
    if (!batch) {
      throw new Error('Input is a directory. Use --batch to generate from all manifest files.');
    }

    const files = await fs.readdir(inputPath);
    const manifests = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(inputPath, file), 'utf-8');
        manifests.push(JSON.parse(content));
      }
    }

    return manifests;
  }

  const content = await fs.readFile(inputPath, 'utf-8');
  return [JSON.parse(content)];
}

/**
 * Write generated files to output directory
 * @param {object[]} results - Generation results
 * @param {string} outputDir - Output directory
 * @param {boolean} typescript - TypeScript flag
 */
async function writeGeneratedFiles(results, outputDir, typescript) {
  const ext = typescript ? '.ts' : '.js';

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'utils'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'tests'), { recursive: true });

  let piiUtilWritten = false;

  for (const result of results) {
    const eventName = result.eventName;
    const consumerFile = path.join(outputDir, `${eventName}-consumer${ext}`);

    await fs.writeFile(consumerFile, result.consumer, 'utf-8');
    console.log(`  ✓ ${eventName}-consumer${ext}`);

    if (result.test) {
      const testFile = path.join(outputDir, 'tests', `${eventName}-consumer.test${ext}`);
      await fs.writeFile(testFile, result.test, 'utf-8');
      console.log(`  ✓ tests/${eventName}-consumer.test${ext}`);
    }

    if (result.piiUtil && !piiUtilWritten) {
      const piiUtilFile = path.join(outputDir, 'utils', `pii-masking${ext}`);
      await fs.writeFile(piiUtilFile, result.piiUtil, 'utf-8');
      console.log(`  ✓ utils/pii-masking${ext}`);
      piiUtilWritten = true;
    }
  }
}

export { executeGenerateCommand, generateCommand };
