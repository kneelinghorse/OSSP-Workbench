# OSSP-Workbench — Technical Architecture

*Grounded in M01-M04 findings (2026-02-09). This document describes what actually exists, not aspirations.*

## Product Definition

OSSP-Workbench is a CLI tool that converts OpenAPI, AsyncAPI, and database schemas into validated protocol manifests, generates production consumer code, and exports architecture visualizations — replacing manual service documentation with automated discovery.

**Target users**: Platform engineering teams managing microservice ecosystems.

## Architecture

```
                        ACTUAL SYSTEM ARCHITECTURE

    ┌───────────────────────────────────────────────────┐
    │                   CLI Layer                        │
    │   discover | generate | validate | scaffold |     │
    │   diff | governance | serve | review              │
    └──────┬──────────┬──────────┬──────────┬──────────┘
           │          │          │          │
    ┌──────▼──────┐ ┌─▼────────┐│   ┌──────▼──────┐
    │ Visualization│ │Generator ││   │  MCP Server │
    │ Cytoscape   │ │ Consumer ││   │  (optional) │
    │ DrawIO      │ │ Scaffold ││   └─────────────┘
    └──────┬──────┘ │ IaC      ││
           │        └──┬───────┘│
    ┌──────▼───────────▼────────▼───────────────────┐
    │              URN Catalog                        │
    │  Primary: O(1) URN lookup (Map)                │
    │  Secondary: byType, byTag, byOwner, byPII     │
    │  Graph: dependency tracking, cycle detection    │
    │  Supports: api, data, event, ui protocols       │
    └──────┬───────────────────────┬─────────────────┘
           │                       │
    ┌──────▼──────┐   ┌───────────▼──────────────┐
    │  Importers   │   │  Protocol Definitions    │
    │ OpenAPI 3.x  │   │                          │
    │ AsyncAPI 2.x │   │  Tier 1: api, data,     │
    │ PostgreSQL   │   │    event, ui (cataloged) │
    │              │   │  Tier 2: agent (custom)  │
    │  → Validated │   │  Tier 3: 13 standalone   │
    │    manifests │   │    (validate+generate)   │
    └──────────────┘   └──────────────────────────┘
```

## Core Components

### 1. Protocol Definitions (18 types)
**Location**: `packages/protocols/src/`
**Status**: Complete

Each protocol file (200-600 lines) provides:
- Manifest shape definition
- `validateManifest()` function
- Code generators
- Query helpers

Protocols are organized in three tiers:
- **Tier 1** (4): api, data, event, ui — full catalog URN support
- **Tier 2** (1): agent — custom catalog indexes (tool, resource, workflow, API)
- **Tier 3** (13): workflow, ai-ml, analytics, config, docs, iam, infra, integration, observability, release, semantic, testing, hardware — standalone validation and generation

### 2. Importers (3 working)
**Location**: `packages/runtime/importers/`
**Status**: Production-grade

| Importer | Input | Output | Tests |
|----------|-------|--------|-------|
| OpenAPI | OpenAPI 3.x JSON/YAML | API protocol manifest with URNs, endpoints, auth | 26/26 pass |
| AsyncAPI | AsyncAPI 2.x YAML | Event protocol manifests with PII, delivery, governance | 63/63 pass |
| PostgreSQL | PostgreSQL schemas | Data protocol manifest with PII detection | All pass |

Each importer produces validated manifests that can be indexed in the URN catalog.

### 3. URN Catalog
**Location**: `packages/protocols/src/catalog/`
**Status**: Fully working (5/5 test suites pass)

- **Primary index**: O(1) URN lookups via Map
- **Secondary indexes**: byType, byTag, byOwner, byPII, byClassification, byNamespace
- **Dependency graph**: Kahn's topological sort, Tarjan's cycle detection
- **Agent indexes**: byTool, byResource, byWorkflow, byAPI
- **Query system**: CatalogQuery class for complex queries

### 4. Generators
**Location**: `packages/runtime/generators/`
**Status**: Near-complete (17/18, hardware stubbed)

| Generator | Protocol | Output |
|-----------|----------|--------|
| Kafka consumer | Event | Production TypeScript with PII masking, DLQ, error handling |
| AMQP consumer | Event | Production TypeScript |
| MQTT consumer | Event | Production TypeScript |
| Protocol scaffolder | API, Data, Event, Workflow, UI | Manifest templates |
| Framework generators | UI | React, Vue, Svelte components |
| IaC generators | Infrastructure | Terraform, CloudFormation |
| Config generators | Configuration | YAML, JSON, HCL |
| Device driver stubs | Hardware | Placeholder only (STUBBED) |

### 5. Visualization
**Location**: `src/visualization/`
**Status**: Complete (4/4 test suites pass)

- **Cytoscape exporter**: Produces Cytoscape.js-compatible JSON with elements, style, layout
- **DrawIO exporter**: Produces mxGraphModel XML with guardrails and domain styling
- **Theme system**: Light/dark themes with serializer

Input: Canonical graph format `{ nodes[], edges[] }` validated via AJV schema.

### 6. CLI
**Location**: `packages/runtime/cli/`
**Status**: 8 commands operational

Commands: `discover`, `generate`, `validate`, `scaffold`, `diff`, `governance`, `serve`, `review`

Entry points:
- `protocol-discover` — main CLI
- `protocol-generate` — code generation
- `protocol-mcp-server` — MCP server

### 7. MCP Server
**Location**: `packages/runtime/mcp/`
**Status**: Starts and runs with performance optimizations

Optional component for IDE/agent integration. Starts in <1s with lazy loading.

## Data Flow: End-to-End Paths

### Path 1: OpenAPI → Visualization
```
OpenAPI 3.x spec → OpenAPIImporter.import() → API manifest (URN-addressed)
  → catalog.add() → secondary indexes built → exportCytoscape() → graph JSON
```

### Path 2: AsyncAPI → Consumer Code
```
AsyncAPI 2.x spec → importAsyncAPI() → Event manifests (2+ per spec)
  → catalog.add() → generateKafkaConsumer() → 90+ lines TypeScript
```

### Path 3: CLI Scaffold → Manifest
```
protocol-discover scaffold --type api → template processing
  → validated manifest → catalog indexing → visualization
```

## Performance Characteristics

| Operation | Target | Actual |
|-----------|--------|--------|
| OpenAPI parse | <1s | <400ms for 10k lines |
| AsyncAPI parse | <4s (first run) | 112ms (warm) |
| URN catalog lookup | O(1) | <1ms |
| Consumer generation | <100ms | <100ms |
| Template render | <10ms | <10ms |
| Graph operations | <10ms for 1k nodes | <10ms |

## Module System

- **Package type**: ESM (`"type": "module"` in package.json)
- **Runtime**: Node.js >= 18
- **Test runner**: Jest 29.7 with `--experimental-vm-modules`
- **Known issue**: Mixed ESM/CJS boundary causes 42 test suite failures (Jest "module already linked"). Core functionality unaffected.

## Dependencies (Runtime)

| Package | Purpose |
|---------|---------|
| graphology | In-memory dependency graphs |
| ajv | JSON Schema validation |
| commander | CLI framework |
| express | MCP server, viewer |
| pg | PostgreSQL schema introspection |
| xmlbuilder2 | DrawIO XML generation |
| xxhash-addon | Fast content hashing |
| js-yaml | YAML parsing |

## Security

- **PII detection**: Pattern-based (11 credential types) + entropy-based (>4.5 bits, >20 chars)
- **Redaction**: Immutable clone-based; original manifests never modified
- **Precompiled patterns**: RegExp compiled at module load for <1ms scans

## Constraints

1. **Catalog supports 4 protocol types** — extending requires schema.js ProtocolType enum changes
2. **File-based persistence** — no distributed locking; single-process updates only
3. **OpenAPI 3.x only** — no 2.0/Swagger support
4. **Local $refs** — external HTTP $refs supported in parser extensions but not default path
