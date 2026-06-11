# Vendored dspack schemas

These JSON Schemas are vendored copies from the dspack specification repository,
following the same pattern used by ds-mcp and dspack-export (the dspack schema
is not published as an npm package).

- Source: https://github.com/aestheticfunction/dspack/tree/main/schema
- Vendored at commit: `7008c3e1c136038bf112a517bde4a69c16443590` (2026-06-10)
- Files: `dspack.v0.1.schema.json`, `dspack.v0.2.schema.json` (draft 2020-12)

The dspack spec is pre-1.0; pinning to a known commit is intentional. When the
spec adds a version, re-vendor both schemas and update this provenance note.
