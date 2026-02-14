# OpenAPI to Visualization Demo

This demo runs an end-to-end pipeline:

1. Import an OpenAPI 3.x spec
2. Register generated manifests (service + schema nodes)
3. Build a canonical catalog dependency graph
4. Export Cytoscape JSON and DrawIO XML

## Run

```bash
npm run demo:openapi-viz
```

## What It Produces

All output is written to `examples/demos/openapi-to-viz/output`:

- `manifests/service-manifest.json`
- `manifests/*-schema-manifest.json`
- `catalog-graph.json`
- `openapi-cytoscape.json`
- `openapi-diagram.drawio`

## Why This Demo Is Useful

- Uses a realistic sample OpenAPI spec with 5 endpoints and multiple schemas
- Preserves service and endpoint URNs from import
- Includes external service dependencies from `x-dependencies`
- Materializes schema relationships as graph edges
- Runs in a single command for reproducibility
