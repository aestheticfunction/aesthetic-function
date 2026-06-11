# Contract surface test fixtures

- `shadcn-demo.dspack.json` — copy of the dspack-export golden fixture
  (`dspack-export/fixtures/shadcn-demo/shadcn-demo.dspack.json`, exporter
  0.1.0-alpha.1). Committed locally so AF tests are self-contained; do not
  reference the dspack-export repo at test time.
- `invalid-version.dspack.json` — unsupported `dspack` version, loader must reject.
- `invalid-schema.dspack.json` — violates the v0.2 schema (`values` not an
  array), loader must reject with instance paths.
