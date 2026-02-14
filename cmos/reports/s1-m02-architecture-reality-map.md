# S1-M02: Architecture Reality Map

**Mission**: Architecture Coherence Assessment
**Date**: 2026-02-09
**Depends on**: S1-M01 Component Status Matrix

---

## Executive Summary

The OSSP-Workbench architecture is **coherent but tiered**. It is not fragmented - there is a clear design pattern - but only 4 of 18 protocols complete the full pipeline end-to-end with catalog integration. The remaining 14 operate as standalone validation/generation modules connected via a suite wiring layer.

**Architecture Verdict**: COHERENT with intentional scope limitations.

---

## Claimed vs Actual Architecture

### What the README Claims
> 18 protocol types flowing through Protocol → Importer → Catalog → Validator → Generator → CLI → Visualization

### What Actually Exists

```
                    ACTUAL ARCHITECTURE

    ┌──────────────────────────────────────────────┐
    │           CLI Layer (all 18 listed)            │
    │   discover | generate | validate | scaffold   │
    └─────────┬────────────┬───────────┬───────────┘
              │            │           │
    ┌─────────▼─────┐  ┌──▼────────┐  │
    │ Visualization │  │ Generator │  │
    │ Cytoscape/DIO │  │ Consumer  │  │
    └─────────┬─────┘  │ Scaffold  │  │
              │        └──┬────────┘  │
    ┌─────────▼───────────▼───────────▼───────────┐
    │              Catalog System                   │
    │    URN Index | Query | Graph | Dependencies   │
    │    Supports: api | data | event | ui ONLY     │
    └─────────┬───────────────────────┬────────────┘
              │                       │
    ┌─────────▼──────┐   ┌───────────▼────────────┐
    │   Importers     │   │   Suite Wiring Layer   │
    │ OpenAPI→API     │   │  Patches 13 standalone  │
    │ AsyncAPI→Event  │   │  protocols with agent   │
    │ Postgres→Data   │   │  URN + capabilities     │
    └─────────┬──────┘   └───────────┬────────────┘
              │                       │
    ┌─────────▼──────────────────────▼────────────┐
    │           Protocol Definitions                │
    │                                               │
    │  ┌────────────────┐  ┌─────────────────────┐  │
    │  │ TIER 1 (4)     │  │ TIER 3 (13)         │  │
    │  │ api, data,     │  │ workflow, ai/ml,    │  │
    │  │ event, ui      │  │ analytics, config,  │  │
    │  │                │  │ docs, iam, infra,   │  │
    │  │ Full catalog   │  │ integration, obs,   │  │
    │  │ URN support    │  │ release, semantic,  │  │
    │  └────────────────┘  │ testing, hardware   │  │
    │                      │                     │  │
    │  ┌────────────────┐  │ Standalone validate │  │
    │  │ TIER 2 (1)     │  │ + generate only     │  │
    │  │ agent          │  └─────────────────────┘  │
    │  │ Custom indexes │                           │
    │  └────────────────┘                           │
    └───────────────────────────────────────────────┘
```

---

## Pipeline Layer Analysis

### Layer 1: Protocol Definitions
**Status**: COMPLETE (18/18)
**Location**: `packages/protocols/src/`

All 18 protocols have definition files with:
- Manifest shape definitions
- `validateManifest()` functions
- Code generators
- Query helpers

**Quality**: Production-grade. Each file is 200-600 lines with comprehensive validation logic.

### Layer 2: Importers
**Status**: PARTIAL (3/18 have importers)
**Location**: `packages/runtime/importers/`

| Importer | Source | Target | Test Coverage |
|----------|--------|--------|--------------|
| OpenAPI | OpenAPI 3.x specs | API Protocol | 26/26 tests pass |
| AsyncAPI | AsyncAPI 2.x specs | Event Protocol | 63/63 tests pass |
| Postgres | PostgreSQL schemas | Data Protocol | All tests pass |

**Gap**: 15 protocols have no automated import path. Users must create manifests manually or via CLI scaffold.

### Layer 3: Catalog
**Status**: PARTIAL (4/18 officially supported)
**Location**: `packages/protocols/src/catalog/`

The `catalog/schema.js` ProtocolType enum only includes:
- `event-protocol`
- `data-protocol`
- `api-protocol`
- `ui-protocol`

**Special case**: Agent protocol has custom indexes in the catalog (`agentToolIndex`, `agentResourceIndex`, etc.) but is not a registered ProtocolType.

**Gap**: 13 Tier 3 protocols cannot be stored in or queried from the URN catalog. They exist as standalone validated objects.

### Layer 4: Validators
**Status**: COMPLETE (18/18)

Every protocol has built-in validation. The `cross-validator.js` provides cross-protocol boundary validation but only works with cataloged types.

`suite_wiring_v_1_1.js` adds cross-protocol validators:
- AI/ML context capabilities
- IAM delegation validation
- Integration agent mapping
- Agent node workflow validation

### Layer 5: Generators
**Status**: NEAR-COMPLETE (17/18, 1 stubbed)

| Generator Type | Coverage |
|---------------|---------|
| Consumer code (Kafka/AMQP/MQTT) | Event Protocol only |
| Protocol scaffolding | API, Data, Event, Workflow, UI |
| Framework generators (React/Vue/Svelte) | UI Component |
| IaC generators (Terraform/CloudFormation) | Infrastructure |
| Config generators (YAML/JSON/HCL) | Configuration |
| Device driver stubs | Hardware (STUBBED) |

### Layer 6: CLI
**Status**: COMPLETE (18/18 listed)
**Location**: `packages/runtime/cli/commands/protocols.js`

All 18 protocols are listed in the CLI's protocol directory. Users can:
- List/browse protocols
- Validate manifests
- Scaffold new manifests (for supported types)
- Generate code

### Layer 7: Visualization
**Status**: COMPLETE for cataloged types

Two exporters:
- **Cytoscape** (`src/visualization/cytoscape/exporter.js`): JSON graph format
- **DrawIO** (`src/visualization/drawio/exporter.js`): XML diagrams with guardrails

Visualization requires catalog data, so only Tier 1 protocols get automatic graph visualization. Tier 3 protocols generate visualization artifacts through their own generators but not through the unified catalog graph.

---

## Complete End-to-End Paths

### Path 1: OpenAPI → API Manifest → Catalog → Graph → Visualization
```
OpenAPI 3.x spec
  → openapi/importer.js (parse, extract endpoints, auth, patterns)
  → API Protocol manifest (validated)
  → catalog/index.js (URN indexed, queryable)
  → catalog/graph.js (dependency graph)
  → cytoscape/exporter.js OR drawio/exporter.js
  → Visualization artifact (.json or .xml)
```
**Status**: FULLY WORKING. Tested end-to-end.

### Path 2: AsyncAPI → Event Manifest → Consumer Code
```
AsyncAPI 2.x spec
  → asyncapi/importer.js (parse, detect bindings, PII, patterns)
  → Event Protocol manifest (validated)
  → catalog/index.js (URN indexed)
  → generators/consumers/index.js (route by transport)
  → kafka/amqp/mqtt-consumer-generator.js
  → Production consumer code (TypeScript)
```
**Status**: FULLY WORKING. 63+ tests pass.

### Path 3: Postgres → Data Manifest → Catalog
```
PostgreSQL schema
  → postgres/importer.js (introspect, detect PII, analyze performance)
  → Data Protocol manifest (validated)
  → catalog/index.js (URN indexed)
```
**Status**: FULLY WORKING. All tests pass.

### Path 4: CLI Scaffold → Manifest → Catalog → Visualization
```
User runs `protocol-discover scaffold --type api`
  → scaffold/protocol-scaffolder.js (template processing)
  → Generated manifest (validated against schema)
  → catalog/index.js (can be indexed)
  → drawio/exporter.js (diagramming)
```
**Status**: WORKING for api/data/event types. Scaffold tests have ESM issues.

### Path 5: Agent Discovery → Capability Indexing
```
Agent registers via well-known endpoint
  → agent-discovery-service.js (discover, register)
  → Agent Protocol manifest
  → catalog/index.js (custom agent indexes)
  → findAgentsByTool/Resource/Workflow/API queries
```
**Status**: WORKING. Agent-specific indexes functional.

---

## Broken/Incomplete Chains

### Chain 1: Tier 3 Protocols → Catalog
**Gap**: 13 protocols have no catalog type registration
**Impact**: Cannot be URN-indexed, queried, or included in dependency graphs
**Fix**: Add types to `catalog/schema.js` ProtocolType enum

### Chain 2: Workflow → Full Generation
**Gap**: Workflow scaffolding is limited compared to API/Event
**Impact**: Workflow manifests can be validated but not fully scaffolded
**Fix**: Extend `protocol-scaffolder.js` with workflow templates

### Chain 3: Hardware → Driver Generation
**Gap**: `generateDeviceDriver()` produces placeholder code with TODOs
**Impact**: Hardware protocol cannot generate real driver code
**Fix**: Implement device-specific generator templates

### Chain 4: Cross-Validator → All Protocols
**Gap**: `cross-validator.js` only validates cataloged types
**Impact**: Tier 3 protocol boundaries are not validated across each other
**Fix**: Extend cross-validator to accept standalone manifests

### Chain 5: Visualization → Tier 3 Protocols
**Gap**: Catalog graph visualization only shows Tier 1 types
**Impact**: 13 protocols are invisible in architecture diagrams
**Fix**: Allow standalone manifests to be included in graph exports

---

## Architecture Coherence Assessment

### Is the Architecture Coherent?
**YES** - The architecture follows a clear, intentional pattern:

1. **Core protocols** (API, Data, Event) have full pipeline support because they represent the most common integration points
2. **Extended protocols** (13 types) provide domain-specific validation and generation without needing full catalog infrastructure
3. **Suite wiring** provides cross-protocol integration where needed
4. **Agent protocol** has a custom integration path appropriate for its discovery-based model

### Is the Architecture Fragmented?
**NO** - While the catalog only supports 4 types, this is a deliberate scoping decision, not fragmentation. All 18 protocols share:
- Common manifest patterns
- Built-in validators
- CLI accessibility
- Generator capabilities

### Key Architectural Strengths
1. **Clean layer boundaries** - No circular cross-layer dependencies
2. **Lazy loading** - AsyncAPI parser (2.85MB) loaded on demand
3. **Performance-conscious** - O(1) URN lookups, <5ms validation, cached operations
4. **Extensible** - New protocol types can be added as standalone files
5. **Three real importers** producing validated manifests from industry-standard specs

### Key Architectural Risks
1. **Catalog bottleneck** - Extending beyond 4 types requires schema changes
2. **Suite wiring complexity** - Monkey-patching protocol definitions is fragile
3. **ESM/CJS inconsistency** - Mixed module systems cause test failures
4. **13 protocols without import automation** - Manual manifest creation is friction

---

## Recommendations for S1-M05 (Vision & Roadmap)

If the project continues:
1. **Focus on Tier 1 protocols** - They're production-ready and well-tested
2. **Promote Workflow and Agent to Tier 1** - They have the most real-world utility
3. **Consider cutting Hardware protocol** - Only one with stubbed generators
4. **Fix ESM consistency** - Single biggest source of test failures
5. **Extend catalog schema** - At minimum add `workflow-protocol` and `agent-protocol`
6. **Delete stale scaffolds** - 33 broken smoke tests add noise
