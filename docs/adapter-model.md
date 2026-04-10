# Adapter Model

> **Placeholder** — This document will contain the full adapter model reference.
> For now, see the adapter sections in [architecture-reference.md](architecture-reference.md).

## Overview

AF uses design adapters to read data from external design systems. Adapters are **read-only by default** — AF is the only mutation authority.

## Adapter Types

| Adapter | Transport | Capability | Phase |
|---------|-----------|------------|-------|
| **Figma REST** | HTTP (Figma API) | Tokens, components, styles | 16A |
| **Figma Console MCP** | stdio / SSE / REST fallback | Screenshots, component inspection | 16B |
| **Storybook MCP** | StreamableHTTP / SSE / HTTP fallback | Component metadata, stories, props | 16C |

## Safety Model

- Adapters use a **default-deny tool policy** — only explicitly allowed tools may be called
- Write tools (e.g., `create_*`, `update_*`, `delete_*`) are blocked architecturally, not by omission
- The MCP adapter validates tool names against an allow-list before every call
- Blocked tools are rejected with a descriptive error, never silently dropped

## Storybook MCP Adapter (Phase 16C)

The Storybook MCP adapter connects to `@storybook/addon-mcp` running inside a local Storybook dev server. It enables **cross-surface drift analysis** — comparing component metadata across Figma, Storybook, and code AST.

### Transport

Connects via HTTP to the Storybook dev server's `/mcp` endpoint (not stdio). Falls back to direct HTTP (`/manifests/components.json`) if MCP is unavailable.

### Operating Modes

| Mode | Condition | Capabilities |
|------|-----------|-------------|
| `mcp` | MCP endpoint responds | Full: component metadata, stories, props, screenshots |
| `http-fallback` | Server up, MCP unavailable | Reduced: component metadata from manifest only |
| `unavailable` | Server unreachable | None — `isAvailable()` returns false |

The capability manifest (`getCapabilities()`) reflects the actual operating mode. MCP-only capabilities (e.g., `readScreenshots`) report `false` in HTTP-fallback mode.

### Tool Policy

Same default-deny pattern as Figma Console MCP:

| Tool | Status | Reason |
|------|--------|--------|
| `list-all-documentation` | Allowed | Read-only component listing |
| `get-documentation` | Allowed | Read-only component metadata |
| `get-documentation-for-story` | Allowed | Read-only story metadata |
| `get-storybook-story-instructions` | Allowed | Read-only story instructions |
| `run-story-tests` | **Blocked** | Side-effects (test execution) |
| `preview-stories` | **Blocked** | May trigger renders |
| *(any unlisted tool)* | **Blocked** | Default-deny |

### Framework Guard

The adapter validates that the Storybook instance is React-based. Non-React frameworks (Vue, Angular, Svelte) cause `isAvailable()` to return `false` with an explicit error.

## Figma Console MCP Adapter — Component Search

`getComponent(name)` searches the entire Figma file tree recursively across all pages.

**Node types matched** (case-insensitive name match):

| Figma node type | AF `DesignComponent.type` | Notes |
|-----------------|--------------------------|-------|
| `COMPONENT` | `component` | Published design-system component |
| `COMPONENT_SET` | `component-set` | Published component set with variants |
| `INSTANCE` | `instance` | Placed instance of a component |
| `FRAME` | `frame` | Named frame (e.g., an artboard representing the component) |
| `GROUP` | `frame` | Named group containing the component |
| `SECTION` | `frame` | Figma section node |
| `TEXT` | `frame` | Top-level text layer (rarely, but possible) |

The raw Figma node type is always stored in `properties.figmaType` for caller diagnostics. When a node is found but is not a `COMPONENT` or `COMPONENT_SET`, the adapter adds a warning to the result: `Node "X" found as FRAME (not a COMPONENT or COMPONENT_SET)`.

The `getComponents()` method (list all) continues to return only `COMPONENT` and `COMPONENT_SET` nodes — the broader search applies only to `getComponent()` (find one by name).

**Search depth**: The MCP path fetches with `depth=3` and `verbosity='full'` (the MCP tool's maximum depth is 3). The REST fallback fetches with `depth=8`. Both are sufficient — component sets are typically at depth 2-3 in the file tree (Document → Page → Component). The MCP tool requires `verbosity='full'` to include `componentPropertyDefinitions` and visual properties on nodes; the default `'summary'` verbosity strips all properties.

**MCP-to-REST fallback**: If the MCP call fails (e.g., schema validation, network error), the adapter falls through to the REST API rather than returning empty data. This ensures the Figma surface is always populated when credentials are valid, regardless of whether the figma-console MCP plugin is running.

### Cross-Surface Drift Analysis

The `af design drift` command compares component data across available surfaces:
- **Figma** — variants, properties from Figma adapter; matches any named node (not just published components)
- **Storybook** — props, stories, variant axes from Storybook MCP
- **Code** — props, union types from AST analysis

Drift findings use **corroboration rules** to filter noise: a story-derived variant is only reported if (1) the variant axis maps to a real prop, (2) the value appears in the prop's type definition. Findings carry `confidence: 'high'` (constrained union match) or `'low'` (unconstrained type like `string`).

#### Normalization Layer (Phase 16D)

Before comparison, surface snapshots pass through a **deterministic normalization layer** (`crossSurfaceDrift/normalize.ts`) that:

1. **Filters design-only fields** from Figma (e.g., `fills`, `cornerRadius`, `width`, `height`) that have no API-level counterpart
2. **Normalizes prop aliases** across surfaces (e.g., Figma `State` → canonical `variant`, Figma `text` → canonical `label`)
3. **Deduplicates** props that collide after renaming

This eliminates false-positive drift caused by naming differences between surfaces. The normalization config is deterministic and configurable via `NormalizationConfig` — see [architecture-reference.md](architecture-reference.md) for full details.

## Detailed Reference

The full adapter model, including MCP transport configuration, tool policies, and Phase 16A/16B/16C implementation details, is documented in [architecture-reference.md](architecture-reference.md).
