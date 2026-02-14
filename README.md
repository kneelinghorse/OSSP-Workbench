# OSSP Consumer Gen

`ossp-consumer-gen` turns AsyncAPI contracts into runnable consumer code for Kafka, AMQP, and MQTT.

## Value Proposition

- Import AsyncAPI specs and normalize them into event manifests.
- Generate transport-specific consumer implementations with governance hints.
- Keep protocol metadata traceable (URNs, detected patterns, contract context).
- Validate generation quality against real-world public AsyncAPI specs.

## Install

### Run without installing

```bash
npx ossp-consumer-gen --help
```

### Global install

```bash
npm install -g ossp-consumer-gen
```

### Local development

```bash
git clone <repo-url>
cd OSSP-Workbench
npm install
```

## CLI Usage

Primary workflow (AsyncAPI spec to consumer code):

```bash
ossp generate consumer --spec ./asyncapi.yaml --output ./generated
```

Transport and language selection:

```bash
ossp generate consumer --spec ./asyncapi.yaml --transport amqp --lang js --output ./generated
```

Flags:

- `--spec` AsyncAPI 2.x/3.x YAML or JSON file (required)
- `--output` output directory (default: `generated-consumers`)
- `--transport` `kafka` (default), `amqp`, or `mqtt`
- `--lang` `ts` (default) or `js`
- `--no-tests` skip test scaffolds
- `--no-pii-util` skip PII utility generation

Legacy manifest-based workflow (still supported):

```bash
ossp-consumer-gen consumer <manifest.json> --output ./generated
```

### Template Customization

Consumer generators load templates from `templates/consumers/` by default:

- `templates/consumers/kafka.hbs`
- `templates/consumers/amqp.hbs`
- `templates/consumers/mqtt.hbs`

Programmatic generation can override templates:

```js
import { generateEventConsumer } from './packages/runtime/generators/consumers/index.js';

const result = generateEventConsumer(manifest, {
  templateDir: '/path/to/custom/templates', // expects kafka.hbs/amqp.hbs/mqtt.hbs
  templateOverrides: {
    kafka: '/path/to/one-off/custom-kafka.hbs'
  }
});
```

Example output:

```text
✓ order-created-consumer.ts
✓ tests/order-created-consumer.test.ts
✓ utils/pii-masking.ts
```

## Real-World AsyncAPI Validation

Run public-spec validation:

```bash
npm run validate:asyncapi:realworld
```

Validation corpus is tracked in:

- `scripts/validation/asyncapi-fixture-corpus.js`

Latest run summary (`reports/real-world-asyncapi-validation.md`):

- Tracked fixture corpus: `11`
- Specs tested: `11`
- Specs passed: `11`
- Import failures: `0`
- Generation failures: `0`
- Syntax failures: `0`
- Supported manifests generated: `31/31`

Validated public/community pinned examples:

- AsyncAPI `streetlights-kafka` (`v2.6.0`)
- AsyncAPI `streetlights-mqtt` (`v2.6.0`)
- AsyncAPI `streetlights-operation-security` (`v2.6.0`)
- AsyncAPI `rpc-client` (`v2.6.0`)

Validated OSSP edge-case fixtures:

- `kafka-events-fixture`
- `kafka-patterns-fixture`
- `kafka-schema-registry-fixture`
- `amqp-notifications-fixture`
- `amqp-patterns-fixture`
- `mqtt-patterns-fixture`
- `mqtt-telemetry-fixture`

## Architecture

Pipeline:

1. AsyncAPI import (`packages/runtime/importers/asyncapi/importer.js`)
2. Transport + pattern detection (`kafka`/`amqp`/`mqtt`)
3. Consumer generation (`packages/runtime/generators/consumers/`)
4. Syntax and packaging validation (Jest + `node --check` + npm pack checks)

Key directories:

- `packages/runtime/importers/asyncapi/` importer and heuristics
- `packages/runtime/generators/consumers/` code generation for Kafka/AMQP/MQTT
- `tests/generators/` transport generator unit tests
- `tests/integration/broker-testcontainers.integration.test.ts` real broker integration suite
- `reports/real-world-asyncapi-validation.md` latest public-spec validation report

## Comparison To Alternatives

| Approach | Strength | Gap | OSSP Consumer Gen Advantage |
|---|---|---|---|
| Generic AsyncAPI docs tooling | Great for schema browsing | No production-ready consumer scaffolds | Generates transport-specific consumer code with operational hints |
| Hand-written consumer templates | Flexible | Inconsistent and error-prone at scale | Repeatable generation from contract source of truth |
| Broker-specific starter kits | Fast per transport | Weak cross-transport standardization | One pipeline for Kafka, AMQP, and MQTT |

## Validation And CI Commands

```bash
npm run test:packaging
npm run validate:asyncapi:realworld
npm run validate:soak:performance
npm run check:soak:budget
npm run test:golden:compat
npm run test:integration:brokers
```

`test:integration:brokers` requires a running Docker-compatible container runtime for Testcontainers.
Soak budget thresholds are defined in `config/soak-performance-budgets.json`.
Nightly soak CI runs in `.github/workflows/nightly-soak.yml`.
Golden fixtures are in `tests/fixtures/golden/consumers/`; refresh intentionally changed outputs with `npm run test:golden:update`.
Release governance checklist and gates are documented in `docs/release-governance.md`.
