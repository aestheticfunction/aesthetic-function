# Framework Analyzers

> **Scope:** `packages/watcher/src/framework/`

## Overview

The `FrameworkAnalyzer` interface is the extension point for adding new source-language support to the aesthetic-function watcher. Each analyzer understands one framework's file format and produces the same canonical outputs (IntentModel, AstIntentReport, AnchoredAstReport) that the rest of the pipeline consumes unchanged.

## Why This Exists

The watcher originally only understood React/TypeScript (`.tsx`, `.jsx`, `.ts`, `.js`). Adding Vue 3 required a pluggable dispatch layer so:

1. A single hot-path in `watch.ts` handles all file types without conditionals scattered everywhere.
2. New frameworks (Svelte, Solid, Astro) can be added by registering one module — no other files need changing.
3. The React analyzer's existing behavior is unchanged — it was wrapped in the same interface.

## Interface

```typescript
// packages/watcher/src/framework/types.ts

interface FrameworkAnalyzer {
  /** Unique analyzer ID (e.g., 'react', 'vue3'). */
  readonly id: string;

  /** File extensions this analyzer handles (e.g., ['.vue']). */
  readonly extensions: ReadonlyArray<string>;

  /** Parse file source → AstIntentReport (component structure, props, semantics). */
  parseAst(code: string, filePath: string, opts?: AnalyzerOpts): AstIntentReport;

  /** Parse file source → IntentModel (marker-driven Figma operations). */
  parseIntent(code: string, filePath: string, opts?: AnalyzerOpts): IntentModel;

  /** Anchor @figma markers to their nearest code element → AnchoredAstReport. */
  anchorMarkers(code: string, filePath: string, opts?: AnalyzerOpts): AnchoredAstReport;

  /** Quick check: does this file contain any @figma markers? */
  hasMarkers(code: string): boolean;
}
```

## Registry

`packages/watcher/src/framework/registry.ts` maintains an `extension → FrameworkAnalyzer` map. The registry is initialized once at watcher startup via `initializeDefaultAnalyzers()`.

```typescript
import { initializeDefaultAnalyzers, resolveByPath } from './framework/index.js';

initializeDefaultAnalyzers(); // registers React + Vue 3

const analyzer = resolveByPath('src/App.vue'); // → Vue3FrameworkAnalyzer
const analyzer2 = resolveByPath('src/Button.tsx'); // → ReactFrameworkAnalyzer
```

- Last registration wins for any given extension.
- Extension matching is case-insensitive (`.VUE` → `.vue`).
- `resolveByPath` returns `undefined` for unsupported extensions — the watcher logs "Unsupported extension" and skips.

## Registered Analyzers

| Analyzer | ID | Extensions | Write-back |
|---|---|---|---|
| `ReactFrameworkAnalyzer` | `react` | `.tsx`, `.jsx`, `.ts`, `.js` | ✅ Enabled (existing behavior) |
| `Vue3FrameworkAnalyzer` | `vue3` | `.vue` | ❌ Disabled (Phase 3 spike pending) |

## Adding a New Framework

1. Create `packages/watcher/src/framework/<name>/index.ts`.
2. Implement `FrameworkAnalyzer`.
3. Add to `packages/watcher/src/framework/index.ts`:

```typescript
import { svelte3Analyzer } from './svelte3/index.js';

registerFrameworkAnalyzer(svelte3Analyzer);
```

4. Update the watcher glob in `watch.ts` to include the new extension (e.g., `.svelte`).
5. Add fixtures under `packages/watcher/src/__fixtures__/<name>/`.
6. Add tests.

No other files need to change.

## Watch Pipeline Integration

```
File change (.vue or .tsx etc.)
  ↓
resolveByPath(relativePath)       → finds the right FrameworkAnalyzer
  ↓
analyzer.hasMarkers(content)      → quick skip if no @figma markers
  ↓
analyzer.parseIntent(content, ...) → IntentModel
  ↓
[Vue write-back blocked]          → if .vue, materialize() is skipped
  ↓
intentToFigmaOps(model)           → FigmaOperation[]
  ↓
applyComponentMapResolution()     → stable ID mapping
  ↓
sendOperationsToServer()          → → Figma Plugin
```

## Write-Back Safety

Source file mutation (`materialize()`) is gated by extension:

- **React files** (`.tsx`, `.jsx`): materialize() runs normally per existing behavior.
- **Vue files** (`.vue`): materialize() is **always skipped** with a warning until the Phase 3 round-trip spike passes. This prevents `.vue` source corruption.
- **`af reconcile --write`**: writes JSON artifacts to `design-materializations/` — not source files — and is safe for all extensions at all times.

See [vue3-adapter.md](vue3-adapter.md) for Vue-specific details.
