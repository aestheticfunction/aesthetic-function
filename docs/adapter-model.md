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

## Safety Model

- Adapters use a **default-deny tool policy** — only explicitly allowed tools may be called
- Write tools (e.g., `create_*`, `update_*`, `delete_*`) are blocked architecturally, not by omission
- The MCP adapter validates tool names against an allow-list before every call
- Blocked tools are rejected with a descriptive error, never silently dropped

## Detailed Reference

The full adapter model, including MCP transport configuration, tool policies, and Phase 16A/16B implementation details, is documented in [architecture-reference.md](architecture-reference.md).
