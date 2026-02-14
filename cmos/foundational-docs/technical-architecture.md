# OSSP-Workbench Technical Architecture

*Last updated: 2026-02-14 (post s4-s7 completion review)*

## System Intent

OSSP-Workbench ingests API/event specifications, extracts governance intelligence, and generates production-ready consumer runtime code for platform teams.

## Current Architecture (Implemented)

```text
AsyncAPI/OpenAPI/DB Specs
  -> Import + Normalize
  -> Pattern + PII + Governance Analysis
  -> Validated Manifest(s)
  -> Transport Consumer Generation (Kafka/AMQP/MQTT)
  -> Runtime Concerns (auth/schema/error handling/observability)
  -> CLI + npm Distribution + Test/Validation Pipelines
```

## Core Layers

### 1. Ingestion and Normalization

- AsyncAPI importer supports 2.x and 3.x and normalizes schema/channel structure for downstream generation.
- Import path outputs validated manifests with governance metadata and URN-based identity.

### 2. Intelligence and Governance Extraction

- Pattern engine detects delivery and operations patterns (retry, DLQ, ordering, fanout, schema evolution) with confidence scoring.
- Multi-signal PII detection combines field-name heuristics, value pattern checks, and schema analysis.
- Governance metadata is attached at manifest and generated-code annotation points.

### 3. Consumer Generation Engine

- Template engine (`templates/consumers/*.hbs`) replaces direct string concatenation.
- Template overrides are supported for team customization (`templateDir`, `templateOverrides`).
- Output targets TypeScript/JavaScript across Kafka, AMQP, and MQTT.

### 4. Transport Runtime Hardening

#### Kafka

- Auth and connection support: SASL/SCRAM-256, SASL/SCRAM-512, SASL/PLAIN, mTLS, OAuth.
- Schema-aware paths for registry-backed serialization/deserialization.
- Consumer controls for offsets, group behavior, and batching.
- Reliability: retry/backoff and DLQ routing paths.

#### AMQP

- Authentication-aware connection setup.
- Channel pooling and reconnect strategies.
- Hardened failure paths for operational resilience.

#### MQTT

- Auth/TLS-aware connection setup.
- Reconnect handling and LWT configuration paths.
- Hardened runtime behavior aligned with parity goals.

### 5. Observability and Operations

- Structured logging hooks in generated consumers.
- Metrics/telemetry hook points for Prometheus/OpenTelemetry integration.
- Governance comments and PII masking utilities preserved in generated output.

### 6. Distribution and Execution Surface

- Primary command: `ossp generate consumer --spec <file> --output <dir> [--transport kafka|amqp|mqtt] [--lang ts|js]`.
- Package is buildable/distributable for CLI execution (`npx`/npm package workflow).
- CI workflows include packaging and broker integration validation paths.

## Validation Evidence

- Generator test suites for Kafka, AMQP, and MQTT executed and passing.
- CLI generation command tests passing.
- Broker integration suite executed with passing scenarios.
- Real-world AsyncAPI validation artifacts generated and passing.

## Operational State (CMOS)

- No active or queued missions in the current queue.
- Sprints `s4`, `s5`, `s6`, and `s7` are `Completed` in CMOS.

## Remaining Work Classification

No committed architecture backlog remains for the current program plan. Remaining work is enhancement-oriented (not gap-closure), such as:

1. Additional transport/provider presets and opinionated templates.
2. Deeper performance soak benchmarks for generated consumers.
3. Extended fixture corpus for edge-case real-world specs.
4. Release governance hardening (provenance/signing/policy gates).
