#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

import { OpenAPIImporter } from '../../../packages/runtime/importers/openapi/importer.js';
import { buildCatalogGraph } from '../../../src/catalog/graph/builder.js';
import { writeCytoscape } from '../../../src/visualization/cytoscape/exporter.js';
import { writeDrawio } from '../../../src/visualization/drawio/exporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SPEC_PATH = path.join(__dirname, 'sample-spec.json');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'output');

function printHelp() {
  console.log(`
OpenAPI -> Visualization Demo

Usage:
  node examples/demos/openapi-to-viz/run-demo.js [options]

Options:
  --spec <path>     OpenAPI spec file path (default: sample-spec.json)
  --output <path>   Output directory (default: examples/demos/openapi-to-viz/output)
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

async function loadOpenApiSpec(specPath) {
  const content = await fs.readFile(specPath, 'utf8');
  const ext = path.extname(specPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return YAML.parse(content);
  }

  try {
    return JSON.parse(content);
  } catch {
    return YAML.parse(content);
  }
}

function normalizeVersion(version) {
  if (typeof version !== 'string') {
    return '1.0.0';
  }
  const normalized = version.trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : '1.0.0';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSchemaNameFromRef(ref) {
  if (typeof ref !== 'string') {
    return null;
  }
  const prefix = '#/components/schemas/';
  if (!ref.startsWith(prefix)) {
    return null;
  }
  return ref.slice(prefix.length);
}

function collectSchemaRefs(value, refs = new Set(), seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return refs;
  }
  if (seen.has(value)) {
    return refs;
  }
  seen.add(value);

  if (typeof value.$ref === 'string') {
    const name = extractSchemaNameFromRef(value.$ref);
    if (name) {
      refs.add(name);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaRefs(item, refs, seen);
    }
    return refs;
  }

  for (const nested of Object.values(value)) {
    collectSchemaRefs(nested, refs, seen);
  }

  return refs;
}

function buildSchemaDependencyMap(spec) {
  const schemas = spec?.components?.schemas || {};
  const dependencies = new Map();

  for (const [schemaName, schemaDef] of Object.entries(schemas)) {
    const refs = Array.from(collectSchemaRefs(schemaDef)).filter((candidate) => candidate !== schemaName);
    dependencies.set(schemaName, refs);
  }

  return dependencies;
}

function buildSchemaUrn(serviceSlug, version, schemaName) {
  return `urn:proto:data:${serviceSlug}/schema/${slugify(schemaName)}@${version}`;
}

function dedupeArray(values) {
  return Array.from(new Set((values || []).filter((value) => typeof value === 'string' && value.length > 0)));
}

function mergeRelationships(baseRelationships = {}, extraRelationships = {}) {
  const merged = { ...(baseRelationships || {}) };

  for (const [key, values] of Object.entries(extraRelationships)) {
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    const existing = Array.isArray(merged[key]) ? merged[key] : [];
    merged[key] = dedupeArray([...existing, ...values]);
  }

  return merged;
}

function buildSchemaManifests(spec, serviceUrn, serviceSlug, version) {
  const schemas = spec?.components?.schemas || {};
  const dependencyMap = buildSchemaDependencyMap(spec);
  const schemaUrnMap = new Map();

  for (const schemaName of Object.keys(schemas)) {
    schemaUrnMap.set(schemaName, buildSchemaUrn(serviceSlug, version, schemaName));
  }

  const schemaManifests = [];
  for (const [schemaName, schemaDef] of Object.entries(schemas)) {
    const schemaUrn = schemaUrnMap.get(schemaName);
    const schemaDeps = (dependencyMap.get(schemaName) || [])
      .map((depName) => schemaUrnMap.get(depName))
      .filter(Boolean);

    schemaManifests.push({
      urn: schemaUrn,
      metadata: {
        kind: 'data',
        name: `${schemaName} Schema`,
        version,
        status: 'derived',
        description: schemaDef?.description || `Schema extracted from OpenAPI component: ${schemaName}`,
        tags: ['openapi', 'schema', 'demo']
      },
      schema: {
        name: schemaName,
        source: 'openapi-component',
        ownerServiceUrn: serviceUrn,
        definition: schemaDef
      },
      relationships: {
        dependencies: dedupeArray(schemaDeps),
        consumers: [serviceUrn]
      }
    });
  }

  return {
    schemaManifests,
    schemaUrns: Array.from(schemaUrnMap.values())
  };
}

function extractDependencyUrns(spec) {
  if (!Array.isArray(spec?.['x-dependencies'])) {
    return [];
  }
  return dedupeArray(spec['x-dependencies']);
}

function buildServiceManifest(importedManifest, schemaUrns, dependencyUrns) {
  const serviceUrn = importedManifest?.service?.urn || importedManifest?.urn;
  if (!serviceUrn) {
    throw new Error('Imported manifest is missing service URN.');
  }

  const mergedRelationships = mergeRelationships(importedManifest.relationships, {
    dependencies: dependencyUrns,
    schemas: schemaUrns
  });

  return {
    ...importedManifest,
    urn: serviceUrn,
    metadata: {
      ...(importedManifest.metadata || {}),
      kind: 'api'
    },
    relationships: mergedRelationships
  };
}

async function writeJson(targetPath, payload) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

export async function runOpenApiToVizDemo(options = {}) {
  const startedAt = Date.now();
  const specPath = path.resolve(options.specPath || DEFAULT_SPEC_PATH);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);

  const manifestsDir = path.join(outputDir, 'manifests');
  const serviceManifestPath = path.join(manifestsDir, 'service-manifest.json');
  const graphPath = path.join(outputDir, 'catalog-graph.json');
  const cytoscapePath = path.join(outputDir, 'openapi-cytoscape.json');
  const drawioPath = path.join(outputDir, 'openapi-diagram.drawio');

  const spec = await loadOpenApiSpec(specPath);
  const importer = new OpenAPIImporter({ generateURNs: true, inferPatterns: true });
  const importedManifest = await importer.import(specPath);

  if (!importedManifest || importedManifest?.metadata?.status === 'error') {
    throw new Error(`OpenAPI import failed for ${specPath}`);
  }

  const serviceName = importedManifest.service?.name || 'openapi-service';
  const serviceVersion = normalizeVersion(importedManifest.service?.version);
  const serviceSlug = slugify(serviceName) || 'openapi-service';

  const dependencyUrns = extractDependencyUrns(spec);
  const { schemaManifests, schemaUrns } = buildSchemaManifests(
    spec,
    importedManifest.service.urn,
    serviceSlug,
    serviceVersion
  );

  const serviceManifest = buildServiceManifest(importedManifest, schemaUrns, dependencyUrns);

  await resetDirectory(outputDir);
  await fs.mkdir(manifestsDir, { recursive: true });

  await writeJson(serviceManifestPath, serviceManifest);

  for (const schemaManifest of schemaManifests) {
    const schemaFile = `${slugify(schemaManifest.schema.name)}-schema-manifest.json`;
    await writeJson(path.join(manifestsDir, schemaFile), schemaManifest);
  }

  const graph = await buildCatalogGraph({
    workspace: outputDir,
    catalogPaths: [manifestsDir],
    graphName: 'OpenAPI Demo Catalog Graph',
    graphDescription: 'OpenAPI 3.x import demo graph with service and schema relationships.'
  });

  await writeJson(graphPath, graph);

  const cytoscapeResult = await writeCytoscape(graph, cytoscapePath, {
    overwrite: true,
    includeMetadata: true
  });

  const drawioResult = await writeDrawio(graph, drawioPath, {
    overwrite: true
  });

  const durationMs = Date.now() - startedAt;

  const summary = {
    specPath,
    outputDir,
    manifestsDir,
    serviceManifestPath,
    graphPath,
    cytoscapePath: cytoscapeResult.outputPath,
    drawioPath: drawioResult.outputPath,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    durationMs
  };

  if (!options.quiet) {
    console.log('\nOpenAPI demo complete');
    console.log(`Spec:       ${summary.specPath}`);
    console.log(`Output:     ${summary.outputDir}`);
    console.log(`Manifests:  ${summary.manifestsDir}`);
    console.log(`Graph:      ${summary.graphPath}`);
    console.log(`Cytoscape:  ${summary.cytoscapePath}`);
    console.log(`DrawIO:     ${summary.drawioPath}`);
    console.log(`Nodes/Edges:${summary.nodeCount}/${summary.edgeCount}`);
    console.log(`Duration:   ${summary.durationMs}ms`);
  }

  return summary;
}

async function runFromCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await runOpenApiToVizDemo(options);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === __filename) {
  runFromCli().catch((error) => {
    console.error(`\nOpenAPI demo failed: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
