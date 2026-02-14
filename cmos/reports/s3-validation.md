# Sprint 3 Validation Report

**Sprint:** sprint-3 — Practical Utility & Quality Gate  
**Date:** 2026-02-12  
**Status:** PASS

---

## Sprint Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Test suite pass rate | >= 90% | 100.0% (113/113 executed suites passed, 1 skipped) | PASS |
| Individual test pass rate | — | 100.0% (2027/2027 executed tests passed, 2 skipped) | — |
| OpenAPI demo (s3-m02) | end-to-end output valid | PASS | PASS |
| AsyncAPI demo (s3-m03) | end-to-end output valid | PASS | PASS |
| README quickstart (s3-m04) | verified from clean output state | PASS | PASS |

---

## Full Validation Run (s3-m05)

Command:

```bash
npx jest --ci --maxWorkers=2 --testTimeout=30000 --json --outputFile=artifacts/s3-validation-jest.json
```

Result summary:
- Test suites: `113 passed`, `1 skipped`, `0 failed` (`114 total`)
- Tests: `2027 passed`, `2 skipped`, `0 failed` (`2029 total`)
- Wall time: `139.961s`
- JSON artifact: `artifacts/s3-validation-jest.json`

Extracted metrics:
- Executed suite pass rate: `113 / (113 + 0) = 100.00%`
- Executed test pass rate: `2027 / (2027 + 0) = 100.00%`

Notes:
- Jest reported one worker process forced exit warning (likely open handle leak), but run exit code was `0` and all executed suites/tests passed.

---

## Demo Verification Evidence

### OpenAPI -> Visualization (s3-m02)

Command:

```bash
npm run demo:openapi-viz
```

Validated outputs:
- `examples/demos/openapi-to-viz/output/catalog-graph.json`
- `examples/demos/openapi-to-viz/output/openapi-cytoscape.json`
- `examples/demos/openapi-to-viz/output/openapi-diagram.drawio`
- `examples/demos/openapi-to-viz/output/manifests/*.json`

Observed runtime and shape:
- Duration: `112ms`
- Graph: `14 nodes / 32 edges`

### AsyncAPI -> Consumer (s3-m03)

Command:

```bash
npm run demo:asyncapi-consumer
```

Validated outputs:
- `examples/demos/asyncapi-to-consumer/output/manifests/event-manifest.json`
- `examples/demos/asyncapi-to-consumer/output/catalog-graph.json`
- `examples/demos/asyncapi-to-consumer/output/generated/customer-events-profile-updated-consumer.ts`
- `examples/demos/asyncapi-to-consumer/output/generated/customer-events-profile-updated-consumer.js`
- `examples/demos/asyncapi-to-consumer/output/generated/utils/pii-masking.ts`
- `examples/demos/asyncapi-to-consumer/output/generated/utils/pii-masking.js`
- `examples/demos/asyncapi-to-consumer/output/demo-summary.json`

Observed runtime and generation checks:
- Duration: `1326ms`
- Detected governance patterns: `dlq_configured`, `user_keyed_ordering`, `backward_compatible_schema`, `high_fanout`
- `node --check` passed for generated JS files

---

## README Quickstart Verification (s3-m04)

Verification approach:
1. Cleared both demo output directories to empty state:
   - `examples/demos/openapi-to-viz/output`
   - `examples/demos/asyncapi-to-consumer/output`
2. Re-ran quickstart demo commands from README:
   - `npm run demo:openapi-viz`
   - `npm run demo:asyncapi-consumer`
3. Ran focused README validation command:

```bash
npx jest --runTestsByPath tests/e2e/openapi-to-viz-demo.test.ts tests/e2e/asyncapi-to-consumer-demo.test.ts tests/generators/kafka-consumer-generator.test.js
```

Focused test result:
- Suites: `3 passed / 3 total`
- Tests: `12 passed / 12 total`

PostgreSQL path verification (README import path section):
- Local role used: `systemsystems`
- URL: `postgresql://systemsystems@localhost:5432/postgres`
- Flow executed: create `ossp_demo` schema/table -> importer run -> write artifact -> cleanup
- Result: `datasets: 1`
- Manifest artifact: `artifacts/quickstart/postgres/postgres-manifest.draft.json`

---

## Comparison to Sprint 2 Baseline

Reference: `cmos/reports/s2-validation.md`

| Metric | Sprint 2 | Sprint 3 | Delta |
|--------|----------|----------|-------|
| Suite pass rate (executed) | 87.4% (97/111) | 100.0% (113/113) | +12.6 pts |
| Test pass rate (executed) | 97.5% (1919/1969) | 100.0% (2027/2027) | +2.5 pts |
| Executed suites passed | 97 | 113 | +16 |
| Executed tests passed | 1919 | 2027 | +108 |

Sprint 3 outcome: all previously targeted quality-gate objectives for practical utility and onboarding readiness are validated as passing.

---

## Mission Criteria Traceability (s3-m05)

- [x] Test suite pass rate >= 90% confirmed by full test run
- [x] OpenAPI demo runs end-to-end and produces valid output
- [x] AsyncAPI demo runs end-to-end and produces valid output
- [x] README quickstart verified from clean state
- [x] Baseline metrics recorded in `cmos/reports/s3-validation.md`
- [x] Context snapshot operation executed in CMOS (duplicate hash detected; no new row created)
