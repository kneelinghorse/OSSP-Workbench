#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import YAML from 'yaml';

import { importAsyncAPI } from '../../../packages/runtime/importers/asyncapi/importer.js';
import { buildCatalogGraph } from '../../../src/catalog/graph/builder.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SPEC_PATH = path.join(__dirname, 'sample-spec.yaml');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'output');

function printHelp() {
  console.log(`
AsyncAPI -> Consumer Demo

Usage:
  node examples/demos/asyncapi-to-consumer/run-demo.js [options]

Options:
  --spec <path>     AsyncAPI spec file path (default: sample-spec.yaml)
  --output <path>   Output directory (default: examples/demos/asyncapi-to-consumer/output)
  --quiet           Suppress summary output
  --help            Show this help message
`);
}

function parseArgs(argv) {
  const options = {
    specPath: DEFAULT_SPEC_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    quiet: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--spec':
        options.specPath = argv[++i];
        break;
      case '--output':
        options.outputDir = argv[++i];
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

async function writeJson(targetPath, payload) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeText(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${content.trimEnd()}\n`, 'utf8');
}

async function runNodeSyntaxCheck(filePath) {
  try {
    await execFileAsync('node', ['--check', filePath]);
    return { filePath, ok: true, error: null };
  } catch (error) {
    return {
      filePath,
      ok: false,
      error: error?.stderr || error?.message || 'node --check failed'
    };
  }
}

function ensureKafkaManifest(manifests) {
  const kafkaManifests = manifests.filter(
    (manifest) => manifest?.delivery?.contract?.transport === 'kafka'
  );

  if (kafkaManifests.length === 0) {
    throw new Error('No Kafka manifests detected in AsyncAPI import results.');
  }

  return kafkaManifests[0];
}

function normalizeManifestForCatalog(manifest) {
  return {
    ...manifest,
    metadata: {
      ...(manifest.metadata || {}),
      kind: 'event',
      status: manifest.metadata?.status || 'draft'
    }
  };
}

function toClassName(eventName) {
  return String(eventName || 'UnknownEvent')
    .split(/[.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function countSchemaFields(schema, counts = { optional: 0, required: 0 }) {
  if (!schema || schema.type !== 'object') {
    return counts;
  }

  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  for (const [name, value] of Object.entries(properties)) {
    if (required.has(name)) {
      counts.required += 1;
    } else {
      counts.optional += 1;
    }

    if (value && typeof value === 'object' && value.type === 'object') {
      countSchemaFields(value, counts);
    }
  }

  return counts;
}

function inferEvolutionFromSchema(schema) {
  const counts = countSchemaFields(schema);
  const total = counts.optional + counts.required;

  if (total === 0) {
    return null;
  }

  const optionalRatio = counts.optional / total;
  if (optionalRatio > 0.7) {
    return {
      pattern: 'backward_compatible_schema',
      message: `${Math.round(optionalRatio * 100)}% optional fields suggests backward compatibility`
    };
  }

  if (optionalRatio < 0.2) {
    return {
      pattern: 'rigid_schema',
      message: `${Math.round((1 - optionalRatio) * 100)}% required fields limits evolution`
    };
  }

  return {
    pattern: 'balanced_schema',
    message: `${Math.round(optionalRatio * 100)}% optional fields provides moderate flexibility`
  };
}

function resolveGovernanceNotes(manifest, context = {}) {
  const patterns = manifest?.patterns?.detected || [];
  let orderingPattern = patterns.find(
    (pattern) => pattern.pattern === 'user_keyed_ordering' || pattern.pattern === 'keyed_ordering'
  );
  const retryPattern = patterns.find((pattern) => pattern.pattern === 'exponential_backoff');
  let fanoutPattern = patterns.find(
    (pattern) => pattern.pattern === 'high_fanout' || pattern.pattern === 'moderate_fanout'
  );
  let evolutionPattern = patterns.find(
    (pattern) =>
      pattern.pattern === 'backward_compatible_schema' ||
      pattern.pattern === 'balanced_schema' ||
      pattern.pattern === 'rigid_schema'
  );

  if (!orderingPattern) {
    const partitions = manifest?.delivery?.contract?.metadata?.partitions || 0;
    const hasUserKey = Boolean(manifest?.schema?.payload?.properties?.user_id);
    if (partitions > 1 && hasUserKey) {
      orderingPattern = {
        pattern: 'user_keyed_ordering',
        message: 'Events are likely ordered per user (partition heuristic)'
      };
    }
  }

  if (!fanoutPattern && Number(context.subscriberCount || 0) >= 2) {
    const subscriberCount = Number(context.subscriberCount);
    fanoutPattern = {
      pattern: subscriberCount > 3 ? 'high_fanout' : 'moderate_fanout',
      message: `${subscriberCount} subscribers detected`
    };
  }

  if (!evolutionPattern) {
    evolutionPattern = inferEvolutionFromSchema(manifest?.schema?.payload);
  }

  return {
    orderingPattern,
    retryPattern,
    fanoutPattern,
    evolutionPattern
  };
}

async function loadAsyncApiDocument(specPath) {
  const payload = await fs.readFile(specPath, 'utf8');
  const extension = path.extname(specPath).toLowerCase();

  if (extension === '.json') {
    return JSON.parse(payload);
  }

  try {
    return YAML.parse(payload);
  } catch {
    return JSON.parse(payload);
  }
}

function resolveSubscriberCount(specDocument, manifest) {
  const channels = specDocument?.channels || {};
  const eventName = manifest?.event?.name;
  const directChannel = channels[eventName];
  const matchedChannel = directChannel || Object.values(channels).find((candidate) => candidate?.address === eventName);

  if (!matchedChannel) {
    return 0;
  }

  const subscribers = matchedChannel['x-subscribers'] || matchedChannel['x-consumers'];
  if (Array.isArray(subscribers)) {
    return subscribers.length;
  }

  return 0;
}

function generateKafkaConsumerCode(manifest, context = {}) {
  const eventName = manifest.event?.name || 'unknown.event';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract || {};
  const topic = delivery.topic || eventName;
  const dlq = delivery.dlq;
  const piiFields = (manifest.schema?.fields || [])
    .filter((field) => field.pii)
    .map((field) => field.name);

  const governance = resolveGovernanceNotes(manifest, context);
  const governanceComments = [
    ` * - PII fields: ${piiFields.length > 0 ? `[${piiFields.join(', ')}]` : 'None'}`,
    ` * - DLQ configured: ${dlq ? 'Yes' : 'No'}`
  ];

  if (governance.orderingPattern) {
    governanceComments.push(` * - Ordering: ${governance.orderingPattern.message}`);
  }
  if (governance.fanoutPattern) {
    governanceComments.push(` * - Fanout: ${governance.fanoutPattern.message}`);
  }
  if (governance.evolutionPattern) {
    governanceComments.push(` * - Evolution: ${governance.evolutionPattern.message}`);
  }
  if (governance.retryPattern) {
    governanceComments.push(` * - Retry: ${governance.retryPattern.message}`);
  }

  const piiImport = piiFields.length > 0 ? "import { maskPII } from './utils/pii-masking.js';\n" : '';
  const piiLogBlock =
    piiFields.length > 0
      ? `const safeEvent = maskPII(event, [${piiFields.map((field) => `'${field}'`).join(', ')}]);\n    console.log('Processing event:', safeEvent);`
      : `console.log('Processing event:', event);`;

  const dlqSection = dlq
    ? `    await this.sendToDLQ(payload, error);\n  }\n\n  async sendToDLQ(payload, error) {\n    const producer = this.kafka.producer();\n    await producer.connect();\n\n    await producer.send({\n      topic: '${dlq}',\n      messages: [{\n        key: payload.message.key,\n        value: payload.message.value,\n        headers: {\n          ...payload.message.headers,\n          'x-error': error.message,\n          'x-original-topic': '${topic}'\n        }\n      }]\n    });\n\n    await producer.disconnect();\n  }\n`
    : `    // No DLQ configured - message retry strategy should be defined by the platform.\n  }\n`;

  return `import { Kafka } from 'kafkajs';\n${piiImport}\n/**\n * Consumer for ${eventName}\n *\n * Governance:\n${governanceComments.join('\n')}\n */\nexport class ${className}Consumer {\n  constructor(config) {\n    this.kafka = new Kafka({\n      clientId: '${eventName}-consumer',\n      brokers: config.brokers\n    });\n\n    this.consumer = this.kafka.consumer({\n      groupId: config.groupId\n    });\n  }\n\n  async start() {\n    await this.consumer.connect();\n    await this.consumer.subscribe({\n      topic: '${topic}',\n      fromBeginning: false\n    });\n\n    await this.consumer.run({\n      eachMessage: async (payload) => {\n        try {\n          await this.handleMessage(payload);\n        } catch (error) {\n          await this.handleError(error, payload);\n        }\n      }\n    });\n  }\n\n  async handleMessage(payload) {\n    const { message } = payload;\n    const event = JSON.parse(message.value?.toString() || '{}');\n\n    ${piiLogBlock}\n\n    // TODO: Insert business logic for processing ${eventName}.\n  }\n\n  async handleError(error, payload) {\n    console.error('Error processing message:', error);\n\n${dlqSection}\n  async stop() {\n    await this.consumer.disconnect();\n  }\n}\n`;
}
function generatePiiMaskingUtilCode() {
  return `export function maskPII(value, piiPaths) {\n  if (!value || typeof value !== 'object') {\n    return value;\n  }\n\n  const clone = JSON.parse(JSON.stringify(value));\n\n  for (const path of piiPaths || []) {\n    if (!path) {\n      continue;\n    }\n\n    const segments = String(path).split('.');\n    let node = clone;\n\n    for (let index = 0; index < segments.length - 1; index += 1) {\n      const segment = segments[index];\n      if (!node || typeof node !== 'object' || !(segment in node)) {\n        node = null;\n        break;\n      }\n      node = node[segment];\n    }\n\n    if (!node || typeof node !== 'object') {\n      continue;\n    }\n\n    const finalKey = segments[segments.length - 1];\n    if (!(finalKey in node)) {\n      continue;\n    }\n\n    const original = String(node[finalKey] ?? '');\n    node[finalKey] = original.length <= 4 ? '****' : original.slice(0, 2) + '***' + original.slice(-2);\n  }\n\n  return clone;\n}\n`;
}

export async function runAsyncApiToConsumerDemo(options = {}) {
  const startedAt = Date.now();
  const specPath = path.resolve(options.specPath || DEFAULT_SPEC_PATH);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const specDocument = await loadAsyncApiDocument(specPath);

  const manifestsDir = path.join(outputDir, 'manifests');
  const generatedDir = path.join(outputDir, 'generated');
  const utilsDir = path.join(generatedDir, 'utils');

  await resetDirectory(outputDir);

  const importResult = await importAsyncAPI(specPath, { timeout: 30000 });
  const kafkaManifest = ensureKafkaManifest(importResult.manifests);
  const catalogManifest = normalizeManifestForCatalog(kafkaManifest);

  const manifestPath = path.join(manifestsDir, 'event-manifest.json');
  await writeJson(manifestPath, catalogManifest);

  const graph = await buildCatalogGraph({
    workspace: outputDir,
    catalogPaths: [manifestsDir],
    graphName: 'AsyncAPI Consumer Demo Catalog Graph',
    graphDescription: 'AsyncAPI event manifest registration used for consumer generation demo.'
  });

  const graphPath = path.join(outputDir, 'catalog-graph.json');
  await writeJson(graphPath, graph);

  const subscriberCount = resolveSubscriberCount(specDocument, kafkaManifest);
  const governanceNotes = resolveGovernanceNotes(kafkaManifest, { subscriberCount });
  const generatedConsumer = generateKafkaConsumerCode(kafkaManifest, { subscriberCount });
  const piiFields = (kafkaManifest.schema?.fields || []).filter((field) => field.pii);
  const generatedPiiUtil = piiFields.length > 0 ? generatePiiMaskingUtilCode() : null;

  const baseName = `${slugify(kafkaManifest.event?.name || 'event')}-consumer`;
  const consumerTsPath = path.join(generatedDir, `${baseName}.ts`);
  const consumerJsPath = path.join(generatedDir, `${baseName}.js`);

  await writeText(consumerTsPath, generatedConsumer);
  await writeText(consumerJsPath, generatedConsumer);

  let piiUtilTsPath = null;
  let piiUtilJsPath = null;

  if (generatedPiiUtil) {
    piiUtilTsPath = path.join(utilsDir, 'pii-masking.ts');
    piiUtilJsPath = path.join(utilsDir, 'pii-masking.js');
    await writeText(piiUtilTsPath, generatedPiiUtil);
    await writeText(piiUtilJsPath, generatedPiiUtil);
  }

  const syntaxChecks = [await runNodeSyntaxCheck(consumerJsPath)];
  if (piiUtilJsPath) {
    syntaxChecks.push(await runNodeSyntaxCheck(piiUtilJsPath));
  }

  const failedChecks = syntaxChecks.filter((result) => !result.ok);
  if (failedChecks.length > 0) {
    const details = failedChecks
      .map((check) => `${check.filePath}: ${check.error}`)
      .join('\n');
    throw new Error(`Generated code failed node --check:\n${details}`);
  }

  const detectedPatterns = new Set((kafkaManifest.patterns?.detected || []).map((pattern) => pattern.pattern));
  if (governanceNotes.orderingPattern?.pattern) {
    detectedPatterns.add(governanceNotes.orderingPattern.pattern);
  }
  if (governanceNotes.fanoutPattern?.pattern) {
    detectedPatterns.add(governanceNotes.fanoutPattern.pattern);
  }
  if (governanceNotes.evolutionPattern?.pattern) {
    detectedPatterns.add(governanceNotes.evolutionPattern.pattern);
  }

  const summary = {
    specPath,
    outputDir,
    manifestPath,
    graphPath,
    consumerTsPath,
    consumerJsPath,
    piiUtilTsPath,
    piiUtilJsPath,
    detectedPatterns: Array.from(detectedPatterns),
    syntaxChecks,
    durationMs: Date.now() - startedAt
  };

  const summaryPath = path.join(outputDir, 'demo-summary.json');
  await writeJson(summaryPath, summary);
  summary.summaryPath = summaryPath;

  if (!options.quiet) {
    console.log('\nAsyncAPI consumer demo complete');
    console.log(`Spec:        ${summary.specPath}`);
    console.log(`Output:      ${summary.outputDir}`);
    console.log(`Manifest:    ${summary.manifestPath}`);
    console.log(`Graph:       ${summary.graphPath}`);
    console.log(`Consumer TS: ${summary.consumerTsPath}`);
    if (summary.piiUtilTsPath) {
      console.log(`PII Util TS: ${summary.piiUtilTsPath}`);
    }
    console.log(`Patterns:    ${summary.detectedPatterns.join(', ') || 'none'}`);
    console.log(`Duration:    ${summary.durationMs}ms`);
  }

  return summary;
}

async function runFromCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await runAsyncApiToConsumerDemo(options);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === __filename) {
  runFromCli().catch((error) => {
    console.error(`\nAsyncAPI demo failed: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
