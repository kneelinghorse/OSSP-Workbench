# S1-M02: Protocol Coverage Matrix

**Mission**: Architecture Coherence Assessment
**Date**: 2026-02-09
**Depends on**: S1-M01 Component Status Matrix

---

## Protocol Pipeline Coverage

Legend: ✅ Full | ⚠️ Partial | ❌ None

| # | Protocol | Definition | Importer | Catalog | Validator | Generator | CLI | Viz | Tier |
|---|----------|-----------|----------|---------|-----------|-----------|-----|-----|------|
| 1 | **API** | ✅ `api_protocol_v_1_1_1.js` | ✅ OpenAPI | ✅ Official | ✅ | ✅ | ✅ | ✅ | 1 |
| 2 | **Data** | ✅ `data_protocol_v_1_1_1.js` | ✅ Postgres | ✅ Official | ✅ | ✅ | ✅ | ✅ | 1 |
| 3 | **Event** | ✅ `event_protocol_v_1_1_1.js` | ✅ AsyncAPI | ✅ Official | ✅ | ✅ | ✅ | ✅ | 1 |
| 4 | **UI Component** | ✅ `ui_component_protocol_v_1_1_1.js` | ❌ | ✅ Official | ✅ | ✅ | ✅ | ✅ | 1 |
| 5 | **Agent** | ✅ `agent_protocol_v_1_1_1.js` | ❌ (discovered) | ⚠️ Custom indexes | ✅ | ✅ | ✅ | ✅ | 2 |
| 6 | **Workflow** | ✅ `workflow_protocol_v_1_1_1.js` | ❌ | ❌ Standalone | ✅ | ⚠️ | ✅ | ✅ | 3 |
| 7 | **AI/ML** | ✅ `AI:ML Protocol v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 8 | **Analytics** | ✅ `Analytics & Metrics v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 9 | **Configuration** | ✅ `Configuration v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 10 | **Documentation** | ✅ `Documentation v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 11 | **Identity & Access** | ✅ `Identity & Access v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 12 | **Infrastructure** | ✅ `Infrastructure v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 13 | **Integration** | ✅ `Integration v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 14 | **Observability** | ✅ `Observability v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 15 | **Release/Deploy** | ✅ `Release:Deployment v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 16 | **Semantic** | ✅ `Semantic Protocol v3.2.0.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 17 | **Testing/Quality** | ✅ `Testing:Quality v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ✅ | ✅ | ✅ | 3 |
| 18 | **Hardware** | ✅ `Hardware Device v1.1.1.js` | ❌ | ❌ Standalone | ✅ | ⚠️ STUBBED | ✅ | ✅ | 3 |

---

## Tier Classification

### Tier 1: Full Pipeline (4 protocols)
**API, Data, Event, UI Component**

These have the complete chain: Definition → Importer → Catalog (with URN indexing) → Validator → Generator → CLI → Visualization.

- Official catalog support in `catalog/schema.js` (ProtocolType enum)
- Contract testing coverage in `contract-tester.js`
- Scaffold generation via `protocol-scaffolder.js`
- **3 of 4 have dedicated importers** (API←OpenAPI, Data←Postgres, Event←AsyncAPI)
- UI Component lacks an importer but is otherwise fully supported

### Tier 2: Custom Integration (1 protocol)
**Agent**

Has custom catalog indexes (`agentToolIndex`, `agentResourceIndex`, `agentWorkflowIndex`, `agentApiIndex`) but not the standard URN catalog type. Agents are discovered rather than imported, so the lack of an importer is by design.

### Tier 3: Standalone Protocols (13 protocols)
**Workflow, AI/ML, Analytics, Configuration, Documentation, Identity, Infrastructure, Integration, Observability, Release, Semantic, Testing, Hardware**

Each has:
- ✅ Protocol definition with `validateManifest()` and generators
- ✅ Listed in CLI (`protocols.js` command)
- ✅ Self-contained validation
- ❌ No dedicated importer
- ❌ Not in the official catalog URN type system
- Integrated via `suite_wiring_v_1_1.js` patches (agent URN support, context capabilities)

---

## Importer Coverage

| Source Format | Target Protocol | Importer Location |
|---------------|----------------|-------------------|
| OpenAPI 3.x | API Protocol | `packages/runtime/importers/openapi/importer.js` |
| AsyncAPI 2.x | Event Protocol | `packages/runtime/importers/asyncapi/importer.js` |
| PostgreSQL Schema | Data Protocol | `packages/runtime/importers/postgres/importer.js` |
| *(none)* | 15 other protocols | No importers exist |

**Gap**: Only 3 of 18 protocols have automated import from external specs.

---

## Cross-Protocol Validation

The `suite_wiring_v_1_1.js` file provides cross-protocol integration:

| Patch | Protocols Affected | What It Does |
|-------|-------------------|-------------|
| `patchAimlContextCapabilities()` | AI/ML | Adds tools, resources, prompts, sampling to manifest |
| `registerIamDelegationValidators()` | Identity & Access | Validates principal URN, delegate URN, scope |
| `registerIntegrationAgentMapping()` | Integration | Adds conversation context, artifact mapping, task chaining |
| URN regex updates | Documentation, Observability, Release, Semantic | Adds `agent` to supported URN patterns |
| Agent node support | Workflow | Validates agent nodes in workflow DAGs |

The `cross-validator.js` provides validation across protocol boundaries but is limited to protocols in the catalog.

---

## End-to-End Path Status

### Complete Paths (input → output)
1. **OpenAPI spec → API manifest → catalog → graph → DrawIO/Cytoscape**: WORKS
2. **AsyncAPI spec → Event manifest → catalog → graph → DrawIO/Cytoscape**: WORKS
3. **Postgres schema → Data manifest → catalog → graph → DrawIO/Cytoscape**: WORKS
4. **Event manifest → Kafka/AMQP/MQTT consumer code**: WORKS
5. **CLI scaffold → manifest → catalog → visualization**: WORKS (for api/data/event types)

### Broken/Incomplete Paths
1. **13 Tier 3 protocols → catalog**: No catalog type registration
2. **Workflow → generators**: Limited scaffold support
3. **Hardware → generators**: Stubbed driver generation
4. **Any protocol → cross-validator**: Only works for cataloged types
