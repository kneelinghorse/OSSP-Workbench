# OSSP-Workbench — Roadmap

*Grounded in M01-M04 findings (2026-02-09). Replaces previous Gemini-authored roadmap.*

## Product Statement

OSSP-Workbench converts API and event specifications into validated protocol manifests, generates production consumer code, and exports architecture visualizations — replacing manual service documentation with automated discovery.

## Current State (Post Sprint 1)

### What Works
- 3 importers (OpenAPI 3.x, AsyncAPI 2.x, PostgreSQL) → validated manifests
- URN catalog with O(1) lookups and secondary indexes
- 3 consumer generators (Kafka, AMQP, MQTT) → production TypeScript
- Cytoscape + DrawIO visualization exporters
- CLI with 8 commands
- 927/966 individual tests passing (95.9%)
- 142/150 modules working (94.7%)

### What Doesn't
- 42 test suites fail due to ESM/CJS module boundary (Jest limitation)
- 33 test suites fail due to stale scaffold artifacts
- Only 4 of 18 protocols have catalog support
- Hardware protocol generator is stubbed

### Architecture Verdict
Coherent with intentional scope limitations. Three-tier protocol design is sound.

---

## Sprint 2: Cleanup & Foundation Hardening

**Focus**: Remove noise, fix the module boundary, establish a clean baseline.

### Session 1: Artifact Cleanup
- Delete `artifacts/scaffold-smoke/` (33 stale test failures)
- Delete `artifacts/scaffolds/` (5 missing module tests)
- Delete unused doc templates from `cmos/foundational-docs/`
- Delete legacy files already staged for removal (AI_HANDOFF.md, PROJECT_CONTEXT.json, etc.)
- **Exit criteria**: Test suite failures reduced by ~38 suites

### Session 2: ESM Boundary Fix
- Audit all CJS modules in `packages/runtime/`
- Create ESM wrapper layer or migrate critical CJS to ESM
- Target: resolve "module already linked" failures for governance, workflow, runtime test suites
- **Exit criteria**: 80%+ test suite pass rate (up from 41%)

### Session 3: Catalog Schema Extension
- Add `workflow-protocol` and `agent-protocol` to `catalog/schema.js` ProtocolType enum
- Update cross-validator to handle new types
- Extend visualization exporters to include workflow/agent nodes
- **Exit criteria**: 6 protocol types cataloged (api, data, event, ui, workflow, agent)

**Sprint 2 success metric**: Test suite pass rate >= 85%. 6 protocols in catalog.

---

## Sprint 3: End-to-End Demo & Documentation

**Focus**: Prove the full pipeline works as a coherent product with real-world examples.

### Session 1: End-to-End Pipeline Demo
- Create a demo that runs: OpenAPI spec → import → catalog → dependency graph → Cytoscape export
- Create a demo that runs: AsyncAPI spec → import → catalog → Kafka consumer generation
- Both demos executable via single CLI command
- **Exit criteria**: Two working end-to-end demos with reproducible results

### Session 2: README & Developer Experience
- Rewrite root README.md with actual getting-started instructions
- Add `npx` quickstart or install instructions
- Document the 3 working import paths with real examples
- **Exit criteria**: New developer can run the tool in <5 minutes

### Session 3: Architecture Graph Demo
- Generate a real architecture diagram from a sample microservice ecosystem (3+ services)
- Export to both Cytoscape JSON and DrawIO XML
- Demonstrate dependency tracking and PII flagging in the graph
- **Exit criteria**: Publishable architecture diagram from real specs

**Sprint 3 success metric**: Complete end-to-end demos. README with working quickstart.

---

## Sprint 4: Polish & Release (Conditional)

**Focus**: Package for external use if Sprint 2-3 succeed.

### Potential Sessions
- npm package publication readiness
- CI/CD pipeline (GitHub Actions)
- Performance regression tests as CI gates
- Changelog and versioning

**Sprint 4 decision point**: Only proceed if Sprint 2-3 deliver clean results.

---

## Explicit Non-Goals (Cut from Roadmap)

These items are explicitly deferred with no planned sprint:

1. **Tier 3 catalog integration** — 13 standalone protocols stay standalone
2. **Hardware protocol generator** — remains stubbed
3. **Web viewer** — no investment in browser UI
4. **Distributed concurrency** — file-based catalog is sufficient
5. **OpenAPI 2.0 support** — 3.x only
6. **Agent-vitals integration** — Python dependency not justified
7. **A2A handshake verification** — runtime agents not on critical path
8. **18-protocol expansion** — focus on 6 protocols with depth

---

## Success Metrics

| Metric | Current | Sprint 2 Target | Sprint 3 Target |
|--------|---------|-----------------|-----------------|
| Test suite pass rate | 41.3% | 85%+ | 90%+ |
| Individual test pass rate | 95.9% | 97%+ | 98%+ |
| Cataloged protocol types | 4 | 6 | 6 |
| Working end-to-end demos | 0 | 0 | 2+ |
| Time to first run (new dev) | Unknown | N/A | <5 min |

---

## Historical Context

12 sprints of prior development produced the current codebase. Key milestones:
- **Sprint 1-3**: Foundation (importers, CLI, workflow)
- **Sprint 4**: AsyncAPI + event governance
- **Sprint 5**: Production readiness (catalog, redaction, scaffolding, CI)
- **Sprint 7-8**: Parser extensions, agent registration, runtime integration
- **Sprint 9-10**: Performance optimization, protocol suite completion
- **Sprint 11-12**: Architecture refinement, ESM migration

Full history preserved in `archives/cmos-old-bak_20260206/` and CMOS database.
