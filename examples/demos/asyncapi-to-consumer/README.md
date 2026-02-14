# AsyncAPI to Consumer Demo

This demo runs an end-to-end pipeline:

1. Import an AsyncAPI 3.x spec
2. Register the event manifest into a local catalog
3. Build a canonical catalog graph
4. Generate Kafka consumer code with governance annotations
5. Validate generated code using `node --check`

## Run

```bash
npm run demo:asyncapi-consumer
```

## What It Produces

All output is written to `examples/demos/asyncapi-to-consumer/output`:

- `manifests/event-manifest.json`
- `catalog-graph.json`
- `generated/*-consumer.ts`
- `generated/utils/pii-masking.ts` (when PII fields are detected)
- `demo-summary.json`

## Guarantees in This Demo

- Single command generation from AsyncAPI to consumer code
- Generated consumer includes DLQ routing and error-handling hooks
- Generated consumer includes PII redaction hook (`maskPII`)
- Governance comments include ordering, fanout, and schema evolution annotations
- Syntax validation via `node --check`
