# S1-M04: Viability Assessment

**Mission**: CMOS History Restoration & Value Assessment
**Date**: 2026-02-09
**Depends on**: S1-M01 Component Status Matrix, S1-M02 Architecture Reality Map, S1-M03 Functional Capability Inventory

---

## Recommendation: GO

**Confidence**: HIGH

The OSSP-Workbench is viable for continued development. The core pipeline is production-capable, the architecture is coherent, and 12 sprints of accumulated work represent real, tested functionality — not theoretical scaffolding.

---

## Evidence Summary

### What M01 Proved (Codebase Archaeology)
- **142 of 150 modules are working** (94.7%). Zero dead code.
- **927 of 966 individual tests pass** (95.9%). Failures are infrastructure (Jest ESM), not logic.
- **3 importers produce validated manifests** from industry-standard specs.
- **18 protocol definitions** with validators, generators, and CLI integration.

### What M02 Proved (Architecture Coherence)
- Architecture is **coherent with intentional scope limitations**, not fragmented.
- **4 protocols** complete the full pipeline end-to-end (API, Data, Event, UI).
- **Clear three-tier design**: Tier 1 (full catalog), Tier 2 (Agent, custom), Tier 3 (13 standalone).
- No circular cross-layer dependencies. Clean layer boundaries.

### What M03 Proved (Functional Capability)
- **MCP server starts and runs** with performance optimizations.
- **CLI registers 8 commands** and responds to all help/validation requests.
- **OpenAPI importer** parses real 3.0.3 specs: extracts 6 endpoints, auth schemes, URNs.
- **AsyncAPI importer** parses real 2.6.0 Kafka specs: produces 2 event manifests in 112ms.
- **Kafka consumer generator** produces 90 lines of production TypeScript with PII masking, DLQ, error handling.
- **Cytoscape exporter** produces valid graph with elements, style, and layout.
- **URN catalog** indexes artifacts with O(1) lookups and secondary indexes.

### What M04 Revealed (History)
- **100+ build missions completed** across 12 sprints.
- **Strategic decisions are sound**: local-first, PII-first, governance-as-code, protocol suite locked.
- **Performance baselines consistently met**: <1s parse, <1ms lookup, <100ms generation.
- **Vision matured**: "capabilities proof" → "practical utility".

---

## Viability Scorecard

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Code Quality** | 8/10 | 94.7% modules working, 95.9% tests pass. Deducted for ESM/CJS inconsistency. |
| **Architecture** | 8/10 | Coherent, layered, extensible. Deducted for catalog bottleneck (4/18 types). |
| **Functional Capability** | 9/10 | Core pipeline fully operational end-to-end. Only Hardware protocol stubbed. |
| **Test Coverage** | 7/10 | 927 passing tests. Deducted for 42 suites blocked by Jest ESM issues and 33 stale scaffolds. |
| **Technical Debt** | 6/10 | ESM/CJS boundary is significant. Stale artifacts add noise. Suite wiring is fragile. |
| **Strategic Direction** | 8/10 | Clear vision shift to practical utility. Protocol suite locked. Local-first. |
| **Development Velocity** | 7/10 | 12 sprints of consistent delivery. CMOS provides session continuity. |
| **Overall** | **7.6/10** | **Strong foundation. Needs focused cleanup before new features.** |

---

## What's Worth Continuing

### High-Value Capabilities (Keep and Invest)
1. **OpenAPI → API Manifest → Catalog → Visualization** pipeline
2. **AsyncAPI → Event Manifest → Kafka/AMQP/MQTT Consumer Generation** pipeline
3. **URN Catalog** with O(1) lookups and secondary indexes
4. **PII detection and redaction** across all importers/generators
5. **Cytoscape + DrawIO visualization exporters**
6. **CLI with discover/validate/scaffold/generate commands**

### Medium-Value Capabilities (Keep, Low Priority)
7. Agent discovery service and agent protocol
8. Workflow library and adapter system
9. Diff engine and migration suggester
10. Override system

### Low-Value Capabilities (Defer or Cut)
11. 13 Tier 3 standalone protocols — useful as validation/generation templates but not worth catalog integration effort
12. Hardware protocol — stubbed generator, no real use case demonstrated
13. Web viewer (3 test files reference missing modules)
14. 33 stale scaffold smoke tests — delete, don't fix

---

## What Needs Fixing Before New Features

### Priority 1: ESM Consistency (Unblocks 42 test suites)
- **Problem**: Mixed ESM/CJS causes "module already linked" in Jest
- **Fix**: Either migrate all CJS to ESM or create systematic CJS shim layer
- **Impact**: Restores 42 test suites (50% of failures)
- **Effort**: Medium (2-3 focused sessions)

### Priority 2: Stale Artifact Cleanup (Noise reduction)
- **Problem**: 33 scaffold smoke tests fail on export name mismatch
- **Fix**: Delete `artifacts/scaffold-smoke/` directory
- **Impact**: Test results go from 59/143 → ~92/110 suites passing (84%)
- **Effort**: Low (1 session)

### Priority 3: Catalog Schema Extension (Unlocks Tier 2)
- **Problem**: Only 4 protocol types registered in catalog
- **Fix**: Add `workflow-protocol` and `agent-protocol` to ProtocolType enum
- **Impact**: Workflow and Agent manifests become URN-indexable and graphable
- **Effort**: Low (1 session)

---

## Risk Assessment

### Risks to Continuing
1. **ESM/CJS debt compounds**: New code in ESM hits CJS walls in runtime modules
2. **Scope creep to 18 protocols**: Pressure to "complete" all 18 when only 4 need catalog
3. **Solo developer**: No external contributors; all context in CMOS and archive
4. **Market positioning unclear**: "Protocol-Driven Discovery" is descriptive but not a product pitch

### Mitigations
1. Fix ESM first — don't build on a broken module system
2. Explicitly cut Tier 3 protocols from roadmap scope
3. CMOS provides session continuity; archive provides historical context
4. M05 should define the one-sentence product pitch

---

## Go/No-Go Decision Matrix

| Question | Answer | Confidence |
|----------|--------|------------|
| Does the core pipeline work? | **Yes** — OpenAPI, AsyncAPI, Postgres all produce valid manifests | HIGH |
| Is the architecture sound? | **Yes** — coherent, layered, no circular deps | HIGH |
| Is there real functionality? | **Yes** — 927 passing tests, production code generation | HIGH |
| Is the technical debt manageable? | **Yes** — ESM fix is scoped, stale artifacts are deletable | HIGH |
| Is the vision clear? | **Mostly** — "practical utility" is directionally right, needs sharpening | MEDIUM |
| Is continued investment justified? | **Yes** — the core pipeline uniquely converts specs to manifests to code | HIGH |

---

## Recommended Next Steps (for S1-M05)

1. **Define the product in one sentence** — what problem does OSSP-Workbench solve, for whom, better than what?
2. **Scope Sprint 2 to max 3 sessions of work**:
   - Session 1: Delete stale artifacts, fix ESM boundary
   - Session 2: Extend catalog schema for Workflow + Agent
   - Session 3: End-to-end demo: OpenAPI → manifest → catalog → Cytoscape graph
3. **Cut list**: Hardware protocol, Tier 3 catalog integration, web viewer, scaffold smoke tests
4. **Rewrite technical-architecture.md and roadmap.md** to reflect actual system state per M01-M03 findings

---

## Archive Reconciliation Summary

### Decisions Captured in CMOS
| Decision | Sprint | Status |
|----------|--------|--------|
| Vision shift: capabilities proof → practical utility | 12→13 | Active |
| Protocol suite locked at 18 types | 12 | Active |
| Local-first architecture | Early | Active |
| PII-first security (pattern+entropy+redaction) | 4-5 | Implemented |
| Governance-as-code (patterns → consumer code) | 4 | Implemented |

### Sprint Metadata Updated
7 historical sprints updated with titles and focus areas (sprints 4, 5, 7, 8, 9, 10, 11).

### Legacy Missions
5 legacy queued missions (M12.4, M12.5, B9.3, B7.1.0, B5.5) identified as orphans from completed sprints with no success criteria. Recommend archiving — their objectives are superseded by Sprint 1 reassessment.
