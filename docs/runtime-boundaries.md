# Runtime Boundaries

> **Placeholder** — This document will contain the full runtime boundary reference.
> For now, see the runtime boundary sections in [architecture-reference.md](architecture-reference.md).

## Overview

AF operates across three independent runtimes with strict responsibility boundaries. No runtime may assume another's responsibilities.

```
┌─────────────────┐   HTTP/WS   ┌─────────────────┐   WebSocket   ┌─────────────────┐
│     Watcher      │ ──────────▶ │     Server       │ ────────────▶ │  Figma Plugin    │
│  (Reconciliation │ ◀────────── │  (Relay + Audit) │ ◀──────────── │  (Mutation Only) │
│   + Analysis)    │             │                  │               │                  │
└─────────────────┘             └─────────────────┘               └─────────────────┘
```

## Runtimes

| Runtime | Responsibility | Cannot do |
|---------|---------------|-----------|
| **Watcher** (Node.js) | Reconciliation, AST analysis, adapter reads, token resolution | Write to Figma directly |
| **Server** (Node.js) | Message relay, audit logging, override persistence | Interpret UI meaning |
| **Plugin** (Figma sandbox) | Execute Figma mutations, report selections | Access filesystem, make network calls (in code.ts) |

## Boundary Constraints

- Figma `code.ts` has **no network and no filesystem access** — this is enforced by the Figma sandbox
- Figma `ui.html` can make network requests but **must not assume localhost is reachable** — always support configurable `SERVER_URL` and polling fallback
- The watcher is the only runtime that runs adapters and resolves fields
- The server never interprets message content — it relays and logs

## Detailed Reference

The full runtime boundary specification, including protocol definitions, message formats, and cross-process communication rules, is documented in [architecture-reference.md](architecture-reference.md).
