# Safety and Control

> **Placeholder** — This document will contain the full safety and control reference.
> For now, see the relevant sections in [architecture-reference.md](architecture-reference.md).

## Overview

AF is designed with safety as a structural property, not an afterthought. Every operation is auditable, reversible, and opt-in by default.

## Safety Properties

| Property | Implementation |
|----------|---------------|
| **Dry-run by default** | Reconciliation reports drift without writing unless `--write` is specified |
| **Echo suppression** | AST writes trigger file saves that re-trigger the watcher; the echo guard cache suppresses duplicate operations |
| **Rollback previews** | Destructive changes show a preview before execution |
| **Audit trail** | Every operation produces artifacts in `design-materializations/`; the server persists audit logs |
| **CI gates** | Drift thresholds are enforced in CI via `af ci --strict` |
| **Read-only adapters** | External integrations use default-deny tool policies; AF is the only mutation authority |
| **Deterministic precedence** | `override > marker > ast > code` — same inputs always produce the same outputs |

## Control Surfaces

- **Policy profiles** — `designer-first`, `code-first`, `balanced`, `strict-review` control how conflicts are resolved
- **`af.config.json`** — Central configuration with env var overrides
- **`design-overrides.json`** — Captured design overrides that take highest precedence
- **CI integration** — GitHub Actions matrix workflows for automated drift checks

## Detailed Reference

The full safety model, including echo suppression mechanics, rollback preview semantics, and CI gate configuration, is documented in [architecture-reference.md](architecture-reference.md).
