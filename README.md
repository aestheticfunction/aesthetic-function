# Aesthetic Function

**Deterministic Code ↔ Design synchronization for React and Figma.**

### Patent Notice

This repository contains a prototype implementation of systems and methods described in U.S. Patent Application No. XX/XXX,XXX (filed [date]), which is currently pending.

This code is provided for research and evaluation purposes. Certain commercial uses may be restricted by patent rights.

---

Aesthetic Function is a deterministic UI control plane for synchronizing code and design systems.

AF keeps your React codebase and Figma designs in sync — bidirectionally, deterministically, and without prompt engineering. As AI-generated UI accelerates, maintaining alignment between code and design becomes harder — not easier. AF provides the structural layer that makes that alignment reliable.

## The Problem

Design–dev drift is the slow divergence between what designers build in Figma and what developers ship in code. Every team experiences it. Most "solutions" are either:

- **Manual** — designers and developers eyeball differences and file tickets
- **Prompt-to-code** — AI generates code from screenshots, losing fidelity and context
- **One-shot exports** — tools export design tokens once, with no ongoing sync

None of these are *systems*. They don't reconcile. They don't detect drift. They don't provide a continuous, auditable loop.

## What AF Does Differently

AF treats code as the execution source of truth while preserving intentional design overrides. Code drives structure; design overrides drive aesthetics. Both are reconciled through explicit precedence rules.

```
Code Change → Watcher → Reconciliation → Server → Figma Plugin → Figma Update
                                ↑
Design Change → Plugin → Server → Override Capture → Reconciliation (next save)
```

This is a **continuous bidirectional loop**, not a one-shot export.

### Key Properties

| Property | What it means |
|----------|---------------|
| **Deterministic** | Same inputs always produce the same outputs. No LLM in the critical path (optional, with fallback). |
| **Reconciled** | Design overrides, code markers, AST values, and defaults are merged with explicit precedence: `override > marker > ast > code`. |
| **Auditable** | Every operation produces artifacts. Every decision is traceable. CI gates enforce drift thresholds. |
| **Safe** | Dry-run by default. Opt-in writes. Echo suppression prevents feedback loops. Rollback previews before destructive changes. |
| **Read-only adapters** | External integrations (e.g., Figma MCP) are read-only with default-deny tool policies. AF is the only mutation authority. |

### How It Differs From…

| Approach | AF's difference |
|----------|-----------------|
| **Prompt-to-code** (v0, Bolt, etc.) | AF doesn't generate code from designs. It *reconciles* code and design as a continuous system. |
| **Design token export** (Style Dictionary, etc.) | AF goes beyond tokens — it syncs component structure, variants, states, and properties bidirectionally. |
| **MCP integrations** (figma-console-mcp, etc.) | AF uses MCP as a *read-only data source*, never as a mutation path. AF's control plane is watcher → server → plugin. |
| **Figma plugins** (code-gen plugins) | AF's plugin is a *mutation executor*, not a decision-maker. Reconciliation happens in the watcher. |

## Architecture

Three runtimes with strict boundaries:

```
┌─────────────────┐   HTTP/WS   ┌─────────────────┐   WebSocket   ┌─────────────────┐
│     Watcher      │ ──────────▶ │     Server       │ ────────────▶ │  Figma Plugin    │
│  (Reconciliation │ ◀────────── │  (Relay + Audit) │ ◀──────────── │  (Mutation Only) │
│   + Analysis)    │             │                  │               │                  │
└─────────────────┘             └─────────────────┘               └─────────────────┘
       │                                │                                  │
   watches code                   persists audit                    mutates Figma
   resolves fields                logs + overrides                  scene graph
   runs adapters
```

| Runtime | Responsibility | Cannot do |
|---------|---------------|-----------|
| **Watcher** | Reconciliation, AST analysis, adapter reads, token resolution | Write to Figma directly |
| **Server** | Message relay, audit logging, override persistence | Interpret UI meaning |
| **Plugin** | Execute Figma mutations, report selections | Access filesystem, make network calls (in code.ts) |

> For detailed runtime boundaries, reconciliation semantics, and phase-by-phase implementation details, see [docs/architecture-reference.md](docs/architecture-reference.md).

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Figma desktop app

### Install and Run

```bash
git clone <repo-url>
cd aesthetic-function
pnpm install

# Start the system
pnpm dev:server     # Terminal 1: relay server on :3001
pnpm dev:watcher    # Terminal 2: file watcher

# For Figma plugin access (plugins can't reach localhost):
pnpm tunnel         # Terminal 3: cloudflared tunnel
```

### Load the Figma Plugin

1. In Figma: **Plugins → Development → Import plugin from manifest...**
2. Select `packages/figma-plugin/manifest.json`
3. Run the plugin, paste your tunnel URL, click **Connect**

### Run Reconciliation

```bash
# Analyze a component file
af reconcile demo-app/src/App.tsx

# Check drift status
af status demo-app/src/App.tsx

# Project-wide dashboard
af dashboard --project demo-app/src/
```

### Configure

```bash
# Generate config file
af init

# Set a policy profile
af init --profile balanced
```

Available profiles: `designer-first`, `code-first`, `balanced`, `strict-review`.

## CLI Reference

| Command | Description |
|---------|-------------|
| `af init` | Generate `af.config.json` |
| `af run` | Start watcher + server |
| `af reconcile <file>` | Run full reconciliation pipeline |
| `af status <file>` | Reconciliation status |
| `af dashboard [--project] <path>` | Drift dashboard |
| `af ci <dir>` | CI gate summary |
| `af artifacts list\|inspect\|trace` | Artifact inspection |
| `af design pull` | Pull design data (tokens + components + styles) |
| `af design screenshot` | Capture design screenshot |
| `af design component [name]` | List or inspect components |

## Project Structure

```
aesthetic-function/
├── packages/
│   ├── shared/          # Protocol definitions, shared types
│   ├── watcher/         # Reconciliation engine, AST analysis, adapters
│   ├── server/          # WebSocket/HTTP relay, audit logging
│   ├── figma-plugin/    # Figma sandbox plugin (mutation executor)
│   └── cli/             # `af` CLI control surface
├── demo-app/            # Sample React app with @figma markers
├── docs/
│   └── architecture-reference.md  # Full internal reference
├── .github/
│   ├── workflows/       # CI workflows (reconciliation matrix)
│   └── instructions/    # AI agent instructions
└── claude.md            # Claude project context
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_ACCESS_TOKEN` | — | Figma Personal Access Token |
| `FIGMA_FILE_KEY` | — | Figma file key |
| `USE_LLM_ANALYZER` | `false` | Enable LLM intent parsing (optional) |
| `TRACE` | `false` | Enable trace logging |

See [docs/architecture-reference.md](docs/architecture-reference.md) for the complete environment variable reference.

## Documentation

| Document | Audience | Content |
|----------|----------|---------|
| [README.md](README.md) | Everyone | Product overview, quick start, CLI reference |
| [docs/getting-started.md](docs/getting-started.md) | New users | Full step-by-step setup guide |
| [docs/cli-reference.md](docs/cli-reference.md) | Users | All commands, flags, and examples |
| [docs/architecture-reference.md](docs/architecture-reference.md) | Contributors, AI agents | Full phase history, runtime boundaries, reconciliation model, invariants |
| [docs/reconciliation-model.md](docs/reconciliation-model.md) | Contributors | Precedence rules, field resolution, drift semantics |
| [docs/runtime-boundaries.md](docs/runtime-boundaries.md) | Contributors | Three-runtime model, boundary constraints |
| [docs/adapter-model.md](docs/adapter-model.md) | Contributors | Design adapters, MCP integration, tool policies |
| [docs/safety-and-control.md](docs/safety-and-control.md) | Contributors | Safety properties, CI gates, rollback model |
| [claude.md](claude.md) | Claude AI | Project context for AI-assisted development |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Test policy, code standards |
| [.github/instructions/](/.github/instructions/) | VS Code Copilot | Coding style, architecture rules |

## License

Patent prototype. All rights reserved.
