# Vue 3 Adapter

> **Status:** Read-only (Phase 1 complete). Write-back deferred to Phase 3.

## Overview

The Vue 3 adapter enables aesthetic-function to read `@figma` markers from Vue Single File Components (`.vue`) and forward them to Figma — just like the existing React adapter does for `.tsx`/`.jsx` files.

Source `.vue` files are **never mutated** by the watcher. Write-back is a planned Phase 3 feature, gated behind a safety spike.

## Supported Marker Syntax

Vue 3 SFCs support markers in two locations:

### Template markers (HTML comment form)

Place before the element you want to annotate. The marker binds to the **immediately following sibling element** in the template:

```html
<template>
  <!-- @figma node=AuthCard fill=#FFFFFF -->
  <div class="card">

    <!-- @figma node=SignInButton fill=#2C2C2C text="Sign in" -->
    <button @click="signIn">Sign in</button>
  </div>
</template>
```

### Script markers (comment form)

Place in `<script setup>` or `<script>`. These anchor to the **SFC component as a whole** (useful for top-level component metadata and hover/focus state variants):

```typescript
<script setup lang="ts">
// @figma node=AuthCard fill=#FFFFFF
// @figma node=SignInButton fill=#2C2C2C text="Sign in"
// @figma node=SignInButton::hover fill=#1E1E1E

import { ref } from 'vue';
// ...
</script>
```

### Supported marker properties

| Property | Example | Description |
|---|---|---|
| `node` | `node=AuthCard` | Maps to a Figma node name. Supports pseudo-states (`::hover`, `::focus`). |
| `fill` | `fill=#3B82F6` | Sets the fill color (hex). |
| `text` | `text="Sign in"` | Sets the text content of a text node. |
| `opacity` | `opacity=0.5` | Sets the node opacity. |

Properties exactly mirror the [React marker syntax](../packages/watcher/src/__fixtures__/). Any marker property valid in `.tsx` is valid in `.vue`.

## Watcher Setup

Start the watcher pointed at your Vue source directory:

```bash
WATCH_PATH=demos/vue-demo-app/src pnpm dev:watcher
```

The watcher automatically dispatches `.vue` files to `Vue3FrameworkAnalyzer` via the [FrameworkAnalyzer registry](framework-analyzers.md).

## Demo App

`demos/vue-demo-app/` is the canonical Vue 3 demo. It mirrors `demos/react-demo-app/` (React) component-for-component:

| Vue component | React equivalent | Figma nodes |
|---|---|---|
| `App.vue` | `App.tsx` | AuthCard, AuthCardTitle, EmailInput, PasswordInput, SignInButton |
| `components/Card.vue` | `Card.tsx` | — |
| `components/Button.vue` | `Button.tsx` | — |
| `components/Input.vue` | `Input.tsx` | — |

Run the demo app:

```bash
cd demos/vue-demo-app
pnpm install
pnpm dev      # starts Vite on http://localhost:5173
```

## Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Read @figma markers from .vue files → Figma | ✅ Complete |
| Phase 2 | Cross-surface drift via Storybook MCP adapter | ✅ (separate feature) |
| Phase 3 | **Write-back**: overrides from Figma → .vue source | ❌ Deferred (spike pending) |

### Phase 3 Deferred

Write-back for Vue source files is blocked until the **Phase 3 round-trip write-back spike** passes. The spike must verify:

1. Marker edit round-trips without corrupting Vue template syntax.
2. `<script setup>` marker replacement does not break TypeScript compilation.
3. Scoped `<style>` blocks are left untouched.

Until the spike passes, `isMaterializeEnabled() + .vue` → watcher logs a warning and skips `materialize()`. Set `enableWriteBack = true` in `Vue3FrameworkAnalyzer` after the spike is approved.

## Architecture

```
.vue file on disk
  ↓
Vue3FrameworkAnalyzer
  │
  ├─ parseSfcSync()         → { template, script, styles }
  ├─ extractVueMarkers()    → VueMarker[]   (from template + script)
  ├─ parseVueAst()          → AstIntentReport
  └─ anchorVueMarkers()     → AnchoredAstReport
         ↓
    IntentModel { intents[] }
         ↓
[Write-back BLOCKED for .vue]
         ↓
    intentToFigmaOps()      → FigmaOperation[]
         ↓
    sendOperationsToServer() → Figma Plugin
```

## `af reconcile` and Vue files

`af reconcile demos/vue-demo-app/src/App.vue` is safe at all times:

- `af reconcile` (read-only): compares Figma state to code markers. No writes.
- `af reconcile --write`: writes a JSON bundle to `design-materializations/`. **Never modifies source files.** Safe for `.vue`.

The `materialize()` call blocked for `.vue` is the _file-save_ hot-path in `watch.ts` only, not the reconcile command.

## Testing

```bash
# All Vue adapter tests
pnpm --filter @aesthetic-function/watcher test --reporter=verbose -- vue

# Specific test suites
pnpm --filter @aesthetic-function/watcher test extractMarkers
pnpm --filter @aesthetic-function/watcher test parseAst
pnpm --filter @aesthetic-function/watcher test vueWriteBackGuard
```

Test fixtures live in `packages/watcher/src/__fixtures__/vue/`.
