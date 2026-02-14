# OSSP-Workbench Roadmap

*Last updated: 2026-02-14 (end-of-sprint review)*

## Product Direction

OSSP-Workbench converts AsyncAPI/OpenAPI/database specs into validated governance manifests and production-ready consumer runtime code.

## Delivery Status

### Completed Program (s4-s7)

| Sprint | Focus | Status | Delivered |
|---|---|---|---|
| `s4` | Generator foundation | Completed | Handlebars-based consumer templates, template overrides, `ossp generate consumer` CLI, Kafka auth support |
| `s5` | Schema and reliability | Completed | Schema registry integration paths, hardened error handling (DLQ/backoff/circuit-breaker paths), deeper consumer config controls |
| `s6` | Observability and transport parity | Completed | Monitoring hooks, AMQP hardening (auth/reconnect/pooling), MQTT hardening (auth/reconnect/LWT) |
| `s7` | Ship and validate | Completed | npm packaging/distribution, broker integration tests, real-world AsyncAPI validation, README rewrite |

### CMOS Verification

- `cmos_mission_status`: no `inProgress`, `current`, `queued`, or `blocked` missions.
- `cmos_sprint_list`: `s4`, `s5`, `s6`, and `s7` all marked `Completed`.

## What Is Complete vs Remaining

### Complete

- AsyncAPI 2.x and 3.x import with version normalization.
- Pattern detection and confidence scoring for delivery/governance behaviors.
- PII detection and governance metadata extraction.
- Template-driven consumer generation for Kafka/AMQP/MQTT.
- Production-grade Kafka auth/config/reliability/observability baseline.
- AMQP and MQTT generator hardening to parity target.
- Installable package and CLI execution path.
- Integration and real-world spec validation coverage.

### Remaining (Optional / Next-Phase)

No committed CMOS sprint backlog remains for the s4-s7 program. Any further work is enhancement scope, for example:

1. Expand generated output customization presets by team/domain.
2. Add long-run soak/performance benchmarks for generated consumers.
3. Add more real-world spec fixtures and transport edge-case suites.
4. Strengthen release automation (publish gating/signing/provenance policies).

## Next Roadmap Trigger

Start a new sprint only when one of the optional enhancements above is promoted to committed scope with explicit success criteria and mission IDs.
