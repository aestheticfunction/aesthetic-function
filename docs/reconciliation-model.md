# Reconciliation Model

> **Placeholder** — This document will contain the full reconciliation model reference.
> For now, see the reconciliation sections in [architecture-reference.md](architecture-reference.md).

## Overview

AF's reconciliation engine resolves design intent from multiple sources using deterministic precedence:

```
override > marker > ast > code
```

The four levels are: explicit designer overrides, `@figma` code markers, values extracted from the AST, and finally `code`, the default code behavior when no explicit signal exists.

Each field in a component (color, spacing, typography, layout) is resolved independently through this chain. The result is a canonical representation that can be compared against the current design state to produce a drift diff.

## Key Concepts

- **Field resolution** — `resolveField()` / `resolveWithPolicy()` apply the precedence chain per-field
- **Design overrides** — Intentional design deviations captured via the plugin, persisted in `design-overrides.json`
- **`@figma` markers** — Comment annotations in UI source files that declare design intent
- **AST extraction** — Structural properties extracted from JSX (className, style props, component hierarchy)
- **Drift diff** — Field-level comparison between resolved values and current design state
- **Reconciliation status** — Aggregate verdict (PASS/WARN/FAIL) based on drift thresholds

## Detailed Reference

The full reconciliation model, including Phase 12–14 pipeline stages, field resolution semantics, and artifact formats, is documented in [architecture-reference.md](architecture-reference.md).
