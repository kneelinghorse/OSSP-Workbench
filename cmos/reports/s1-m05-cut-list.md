# S1-M05: Cut List

**Mission**: Vision & Roadmap
**Date**: 2026-02-09
**Based on**: M01-M04 findings

---

## One-Sentence Product Definition

> **OSSP-Workbench is a CLI tool that converts OpenAPI, AsyncAPI, and database schemas into validated protocol manifests, generates production consumer code, and exports architecture visualizations — replacing manual service documentation with automated discovery.**

---

## Cut List

### DELETE NOW (Sprint 2, Session 1)

| Item | Location | Reason | Impact |
|------|----------|--------|--------|
| Scaffold smoke artifacts | `artifacts/scaffold-smoke/` | 33 stale test failures, export name mismatch | Removes 33/84 failing suites |
| Old scaffold artifacts | `artifacts/scaffolds/` | 5 missing module references | Removes 5 failing suites |
| Foundational doc templates | `cmos/foundational-docs/*_template.md` | Unused boilerplate | Cleanup |
| Legacy project files | `AI_HANDOFF.md`, `PROJECT_CONTEXT.json`, `PROJECT_README.md`, `README_VIEWER.md` | Superseded by CMOS | Already staged for deletion in git |
| Old app directory | `app/` | Entire old application tree staged for deletion | Already in git status |

### DEFER INDEFINITELY (Do Not Invest)

| Item | Reason |
|------|--------|
| **Hardware protocol generator** | `generateDeviceDriver()` produces placeholder TODOs. No demonstrated use case. |
| **Tier 3 catalog integration** | 13 standalone protocols work fine without URN indexing. Cost of catalog schema extension exceeds value for: workflow-ai-ml, analytics, config, docs, iam, infra, integration, observability, release, semantic, testing, hardware. |
| **Web viewer** | 3 test files reference missing modules. No evidence of working viewer in current codebase. |
| **Distributed concurrency** | Multi-process locking for CI/CD. File-based catalog is sufficient for single-developer use. |
| **OpenAPI 2.0 support** | Parser targets 3.x only. Legacy spec support adds complexity without clear demand. |

### KEEP BUT DEPRIORITIZE

| Item | Reason |
|------|--------|
| **Agent discovery service** | Works but not on the critical path for core pipeline value. |
| **Cross-validator** | Only validates 4 cataloged types. Extend only if Workflow/Agent promoted to catalog. |
| **Workflow adapters** (HTTP, Event, Tool) | 6/9 test suites fail on module linking. Fix as part of ESM cleanup, not independently. |
| **Diff engine** | Working and tested but not part of the core import→generate→visualize pipeline. |
| **Override system** | Working (4/4 tests pass) but niche. Only relevant for multi-team governance scenarios. |

### PROMOTE TO TIER 1 (Sprint 2-3)

| Item | Reason |
|------|--------|
| **Workflow protocol** | Add `workflow-protocol` to catalog ProtocolType enum. Most real-world utility after API/Data/Event. |
| **Agent protocol** | Already has custom indexes in catalog. Formalize with ProtocolType registration. |

---

## Impact of Cuts

### Before Cuts
- 143 test suites (59 pass, 84 fail) = 41.3% suite pass rate
- 18 protocols × 7 pipeline stages = 126 potential integration points, ~30 actually working

### After Cuts (Projected)
- ~105 test suites (92 pass, 13 fail) = 87.6% suite pass rate
- 6 protocols (API, Data, Event, UI, Workflow, Agent) × 7 pipeline stages = 42 integration points, ~35 working
- Clear scope: "6 protocols with full pipeline" instead of "18 protocols with partial everything"

### Lines of Code Removed
- `artifacts/scaffold-smoke/`: ~28 directories, ~200+ generated files
- `artifacts/scaffolds/`: ~5 directories, ~50+ generated files
- Net reduction: ~250+ auto-generated files that add zero value

---

## Decision: What This Product Is NOT

To prevent scope creep, explicitly declare what OSSP-Workbench is **not**:

1. **Not a spec validator** — tools like `spectral` do that. OSSP converts specs into manifests.
2. **Not an API gateway** — OSSP generates artifacts, not runtime middleware.
3. **Not a service mesh** — OSSP produces architecture graphs, not network proxies.
4. **Not an all-protocols platform** — 6 protocols with depth beats 18 with breadth.
5. **Not a cloud service** — local-first, offline-first, always.
