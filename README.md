# OSSP Workbench

OSSP Workbench turns API/event/database contracts into usable engineering artifacts.

Core value:
- Import contracts from OpenAPI, AsyncAPI, and PostgreSQL
- Generate concrete outputs (catalog manifests, dependency graphs, visualizations, consumer code)
- Keep protocol relationships traceable via URNs and catalog graph metadata

## Quickstart (<5 minutes)

### Prerequisites

- Node.js 18+
- npm

### 1. Install

```bash
git clone <your-repo-url>
cd OSSP-Workbench
npm install
```

### 2. Run OpenAPI end-to-end demo

```bash
npm run demo:openapi-viz
```

Outputs:
- `examples/demos/openapi-to-viz/output/catalog-graph.json`
- `examples/demos/openapi-to-viz/output/openapi-cytoscape.json`
- `examples/demos/openapi-to-viz/output/openapi-diagram.drawio`

### 3. Run AsyncAPI end-to-end demo

```bash
npm run demo:asyncapi-consumer
```

Outputs:
- `examples/demos/asyncapi-to-consumer/output/manifests/event-manifest.json`
- `examples/demos/asyncapi-to-consumer/output/generated/customer-events-profile-updated-consumer.ts`
- `examples/demos/asyncapi-to-consumer/output/demo-summary.json`

## Import Paths (All 3)

### OpenAPI import path

Command (verified):

```bash
npm run demo:openapi-viz
```

What it does:
- Imports `examples/demos/openapi-to-viz/sample-spec.json`
- Registers manifests
- Builds catalog graph
- Exports Cytoscape JSON + DrawIO XML

### AsyncAPI import path

Command (verified):

```bash
npm run demo:asyncapi-consumer
```

What it does:
- Imports `examples/demos/asyncapi-to-consumer/sample-spec.yaml`
- Registers manifest + catalog graph
- Generates Kafka consumer code with DLQ/error/PII handling hooks
- Validates generated JS equivalents with `node --check`

### PostgreSQL import path

Verified example flow (local PostgreSQL):

1. Create a demo schema/table:

```bash
psql -h localhost -p 5432 -U <user> -d <db> -c "CREATE SCHEMA IF NOT EXISTS ossp_demo; CREATE TABLE IF NOT EXISTS ossp_demo.customers (id SERIAL PRIMARY KEY, email TEXT NOT NULL, full_name TEXT, phone TEXT);"
```

2. Run importer and write manifest:

```bash
OSSP_PG_URL='postgresql://<user>@localhost:5432/<db>' node --input-type=module -e "import fs from 'fs/promises'; import { PostgresImporter } from './packages/runtime/importers/postgres/importer.js'; const importer = new PostgresImporter(); const manifest = await importer.import(process.env.OSSP_PG_URL, 'ossp_demo'); await fs.mkdir('artifacts/quickstart/postgres', { recursive: true }); await fs.writeFile('artifacts/quickstart/postgres/postgres-manifest.draft.json', JSON.stringify(manifest, null, 2) + '\n'); console.log('datasets', manifest.datasets?.length ?? 0);"
```

3. Optional cleanup:

```bash
psql -h localhost -p 5432 -U <user> -d <db> -c "DROP SCHEMA IF EXISTS ossp_demo CASCADE;"
```

## End-to-End Demo Directories

- OpenAPI -> Visualization: `examples/demos/openapi-to-viz`
- AsyncAPI -> Consumer: `examples/demos/asyncapi-to-consumer`

Each demo directory includes:
- sample contract file
- one-command runner
- generated output artifacts
- local README

## Validation Commands

Run focused validation for Sprint 3 demo work:

```bash
npx jest --runTestsByPath tests/e2e/openapi-to-viz-demo.test.ts tests/e2e/asyncapi-to-consumer-demo.test.ts tests/generators/kafka-consumer-generator.test.js
```

## Notes

- `npm run cli -- discover ...` exists but currently has runtime option parsing issues in this workspace.
- The demo commands above are the verified path for onboarding and reproducible outputs.
