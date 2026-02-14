# Release Governance

This project enforces release governance before npm publication.

## Release Gate Command

Run the full local release gate:

```bash
npm run release:gate
```

`release:gate` runs:

1. Packaging tests (`npm run test:packaging`)
2. Golden compatibility checks (`npm run test:golden:compat`)
3. Real-world AsyncAPI corpus validation (`npm run validate:asyncapi:realworld`)
4. Soak benchmark (`SOAK_ITERATIONS=3 npm run validate:soak:performance`)
5. Soak budget enforcement (`npm run check:soak:budget`)
6. Security audit (`npm audit --omit=dev --audit-level=high`)
7. SBOM generation (`npm run release:sbom`)
8. npm tarball verification (`npm pack --dry-run`)

## SBOM

SBOM is generated in CycloneDX JSON format:

- Command: `npm run release:sbom`
- Output: `reports/sbom.cdx.json`

## CI Enforcement

Release workflow: `.github/workflows/npm-publish.yml`

- `validate` job runs `npm run release:gate` and uploads governance artifacts.
- `publish` job is allowed only after the gate passes.
- Publish uses npm provenance: `npm publish --provenance --access public`.

Security gate policy: release gate enforces `npm audit --omit=dev --audit-level=high` to block high/critical issues in production dependencies.

## Release Checklist

1. Confirm intended version in `package.json` and `CHANGELOG.md`.
2. Run `npm run release:gate` locally.
3. Push release tag `v<version>`.
4. Confirm `npm Publish` workflow completed gate + publish jobs.
5. Archive governance artifacts from workflow run (SBOM + soak + real-world validation reports).
