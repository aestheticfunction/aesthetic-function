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

### Cross-Surface Drift Analysis

The `af design drift` command compares component data across available surfaces:
- **Figma** — variants, properties from Figma adapter
- **Storybook** — props, stories, variant axes from Storybook MCP
- **Code** — props, union types from AST analysis

Drift findings use **corroboration rules** to filter noise: a story-derived variant is only reported if (1) the variant axis maps to a real prop, (2) the value appears in the prop's type definition. Findings carry `confidence: 'high'` (constrained union match) or `'low'` (unconstrained type like `string`).

## Detailed Reference

The full adapter model, including MCP transport configuration, tool policies, and Phase 16A/16B/16C implementation details, is documented in [architecture-reference.md](architecture-reference.md).
