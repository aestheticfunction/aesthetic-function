# Aesthetic Function

A bidirectional Code ↔ Design synchronization system for React and Figma. The pipeline is deterministic by default, using `@figma` comment markers to extract design intent. An optional LLM-based analyzer can be enabled via feature flag, with automatic fallback to marker parsing on failure.

This is an **MVP / patent prototype**. It prioritizes determinism, testability, and safety over feature completeness.

---

## What Works Today (Phase 6A)

| Feature | Status |
|---------|--------|
| **Code → Design (Core Pipeline)** | |
| File save detection via chokidar | ✅ |
| `@figma` marker parsing (regex-based, default) | ✅ |
| IntentModel → FigmaOperation transformer | ✅ |
| Design token resolution | ✅ |
| WebSocket + HTTP polling server relay | ✅ |
| Figma plugin with SET_TEXT / SET_FILL operations | ✅ |
| Live Figma updates on file save | ✅ |
| **LLM Mode (Optional)** | |
| LLM-based intent analyzer (feature flag) | ✅ |
| Automatic fallback to markers on LLM failure | ✅ |
| **Design → Code Capture** | |
| DESIGN_CHANGE message from Figma plugin | ✅ |
| `design-overrides.json` persistence | ✅ |
| Override reconciliation layer | ✅ |
| Override precedence controls | ✅ |
| **Design → Code Materialization** | |
| Patch artifact generation (reviewable diffs) | ✅ |
| Marker line updates (direct source edits) | ✅ |
| Dry-run mode (default, no writes) | ✅ |
| **AST Analysis (Read-Only)** | |
| Babel-based JSX literal extraction | ✅ |
| Component detection (function + arrow) | ✅ |
| Marker-to-component anchoring | ✅ |
| Diff report: JSX vs Markers vs Overrides | ✅ |
| **Observability** | |
| Async audit trail logging (sync-log.md) | ✅ |

---

## Architecture

The system follows a **three-legged stool** design with strict runtime boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BIDIRECTIONAL SYNC FLOW                                │
└─────────────────────────────────────────────────────────────────────────────────┘

  CODE → DESIGN:
  ┌─────────────────┐     HTTP POST     ┌─────────────────┐    WebSocket/Poll   ┌─────────────────┐
  │                 │  ─────────────▶   │                 │  ─────────────────▶ │                 │
  │     Watcher     │                   │     Server      │                     │  Figma Plugin   │
  │   (Local Node)  │                   │  (Relay Bridge) │                     │   (Sandbox)     │
  │                 │  ◀─────────────   │                 │  ◀───────────────── │                 │
  └─────────────────┘   DESIGN_CHANGE   └─────────────────┘     Selection Msg   └─────────────────┘
          │                   │                                                          │
          │ watches           │ writes                                                   │ mutates
          ▼                   ▼                                                          ▼
  ┌─────────────────┐ ┌──────────────────┐                                     ┌─────────────────┐
  │  React Source   │ │ design-overrides │                                     │  Figma Document │
  │   (demo-app/)   │ │      .json       │                                     │                 │
  └─────────────────┘ └──────────────────┘                                     └─────────────────┘
```

### Data Flow

1. **Code → Design**: `File Change → Watcher → IntentModel → FigmaOperations → Server → Plugin → Figma`
2. **Design → Code**: `Figma Selection → Plugin → Server → DESIGN_CHANGE → design-overrides.json`
3. **Reconciliation**: On next file save, overrides are merged with code-derived intents before sending to Figma

### Packages

| Package | Runtime | Responsibility |
|---------|---------|----------------|
| `@aesthetic-function/watcher` | Local Node.js | Watches files, extracts intent (markers or LLM), reconciles with overrides, transforms to operations, sends to server |
| `@aesthetic-function/server` | Local Node.js | HTTP/WebSocket relay bridge, persists design changes to `design-overrides.json`, audit logging |
| `@aesthetic-function/figma-plugin` | Figma Sandbox | Receives operations, executes scene graph mutations, sends selection changes back |
| `@aesthetic-function/shared` | Shared | Protocol definitions, message types, version constants |

### Runtime Boundaries (Critical)

- **Watcher** CAN access disk and LLMs
- **Server** CAN access disk and network
- **Figma `code.ts`** CANNOT access disk or network
- **Figma `ui.html`** CAN access network but MUST NOT assume localhost is reachable

---

## Implemented Phases

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Protocol + plumbing (WebSocket, HTTP polling, message types) | ✅ |
| **Phase 2** | Marker-based + LLM intent parsing | ✅ |
| **Phase 3** | LLM analyzer with safety + fallback | ✅ |
| **Phase 4** | Audit trail (sync-log.md) | ✅ |
| **Phase 5A** | Bidirectional sync (Design → Code capture via DESIGN_CHANGE) | ✅ |
| **Phase 5A.1** | Override reconciliation layer | ✅ |
| **Phase 5A.2** | Override precedence controls (feature flags) | ✅ |
| **Phase 5B** | Design → Code materialization (patch + marker writes) | ✅ |
| **Phase 6A** | Read-only AST parsing with Babel | ✅ |

### Not Implemented Yet

| Feature | Status |
|---------|--------|
| AST-based JSX mutation (write mode) | ❌ |
| Design → JSX rewriting | ❌ |
| Conflict resolution UI | ❌ |
| Variant/state mapping | ❌ |
| Layout/spacing operations | ❌ |
| Background reconciliation | ❌ |

The current implementation includes read-only AST parsing via Babel (Phase 6A), but does not perform AST-level mutations. Source file modifications are done via regex-based marker line edits.

---

## AST Analysis (Phase 6A)

Phase 6A adds read-only AST-based analysis using Babel to extract literal semantics from JSX. This enables deeper code understanding and produces structured reports for diffing against markers and design overrides.

### What It Extracts

| Category | Examples |
|----------|----------|
| **JSX Text Literals** | `<h1>Welcome</h1>` → "Welcome" |
| **JSX Prop Literals** | `<button disabled={true}>` → disabled: true |
| **Inline Style Literals** | `style={{ backgroundColor: "#FF0000" }}` → backgroundColor: "#FF0000" |

**Scope**: Literals only. No inference from variables, no className parsing, no evaluation.

### Marker Anchoring

The AST analyzer maps `@figma` markers to components:

1. Finds all `// @figma node=...` markers with their line numbers
2. For each marker, finds the nearest following exported component
3. Extracts text and fill literals from that component
4. Produces an anchored report linking markers to actual JSX content

### CLI Report

Run a diff report on any TSX file:

```bash
pnpm --filter @aesthetic-function/watcher ast:report demo-app/src/App.tsx
```

Output includes:
- **Marker Summary**: Nodes and their text/fill values from markers
- **AST Anchored Summary**: Marker → Component → Extracted literals
- **Diff: JSX vs Marker**: Mismatches between JSX code and marker declarations
- **Diff: JSX vs Overrides**: Mismatches between JSX code and design-overrides.json

Example output:
```
AST REPORT
File: demo-app/src/App.tsx

============================================================
MARKER SUMMARY
============================================================
  [L25] LoginButton
    text: "Login"
    fill: #883BF5

============================================================
AST ANCHORED SUMMARY
============================================================
  [L25] LoginButton
    → LoginButton (L26-43)
    text: ["Sign In"]
    fills: [#3B82F6]

============================================================
DIFF: JSX vs MARKER
============================================================
  ✗ LoginButton.text
    JSX: Sign In
    Marker: Login
  ✗ LoginButton.fill
    JSX: #3B82F6
    Marker: #883BF5

Summary: 3 markers, 4 components, 4 mismatches
```

### Use Cases

- **Auditing**: See drift between markers and actual code
- **Validation**: Ensure markers match component content
- **Pre-commit checks**: Detect undeclared changes before sync

---

## Override System

### What is `design-overrides.json`?

When a designer makes changes in Figma and sends them back via the plugin's "Send Selection" feature, those changes are captured in `design-overrides.json` at the repository root.

```json
{
  "LoginButton": {
    "nodeId": "4:7",
    "lastUpdated": "2025-01-15T10:30:00.000Z",
    "text": "Sign In",
    "fill": "#3B82F6"
  }
}
```

### When is it written?

The server writes to this file when it receives a `DESIGN_CHANGE` message from the Figma plugin. Each entry captures:
- `nodeId`: The Figma node ID
- `lastUpdated`: ISO timestamp of when the change was captured
- `text`: Text content (if applicable)
- `fill`: Fill color (if applicable)

### How does reconciliation work?

On each file save, the watcher:
1. Extracts intents from code (markers or LLM)
2. Loads `design-overrides.json` (if it exists)
3. For each intent, checks if an override exists for that node name
4. Applies the override values (text, fill) on top of code-derived values
5. Sends the merged result to Figma

### Override Precedence

By default, **overrides always win** over code values. This ensures designer intent is preserved.

You can control this behavior with environment variables (see below).

> ⚠️ **Warning**: If code edits appear "stuck" (changes not reflected in Figma), check whether an override exists for that node. Delete or edit `design-overrides.json` to reset.

---

## Design → Code Materialization (Phase 5B)

Materialization converts design overrides into reviewable code artifacts. This is an optional feature that must be explicitly enabled.

### Materialization Modes

| Mode | Output | Description |
|------|--------|-------------|
| `off` | None | Default. No materialization occurs. |
| `patch` | `design-materializations/*.patch.json` | Generates JSON patch artifacts for review |
| `markers` | Updated `@figma` marker lines | Edits source files directly |

### Patch Mode

Generates a reviewable artifact without modifying source files:

```json
{
  "file": "demo-app/src/App.tsx",
  "generatedAt": "2025-12-14T00:00:00.000Z",
  "changes": [
    {
      "node": "LoginButton",
      "before": { "text": "Login", "fill": "Primary/Blue500" },
      "after": { "text": "Sign in", "fill": "#FF5500" },
      "source": "design-overrides.json",
      "nodeId": "4:7"
    }
  ]
}
```

### Markers Mode

Updates existing `@figma` marker lines in source files:

- Replaces `text="..."` and `fill=...` values
- Only modifies lines that already contain `// @figma node=<NodeName>`
- Does not insert new markers (unapplied overrides are logged)
- Preserves formatting and indentation

### Safety Defaults

- **Dry-run by default**: `MATERIALIZE_DRY_RUN=true` means no files are written
- **Atomic writes**: Uses temp file + rename for safe writes
- **Clear logging**: `Materialize: mode=patch dryRun=true changes=2 unapplied=1`

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_LLM_ANALYZER` | `false` | Enable LLM-based intent parsing |
| `LLM_ANALYZE_ALL` | `false` | Analyze files without `@figma` markers |
| `LLM_PROVIDER` | `openai` | LLM provider (`openai` or `anthropic`) |
| `OPENAI_API_KEY` | — | OpenAI API key (required for openai provider) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required for anthropic provider) |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model name |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic model name |
| `USE_OVERRIDES` | `true` | Enable design override reconciliation |
| `OVERRIDES_PRECEDENCE` | `always` | `always` or `if_newer_than_code` |
| `MATERIALIZE_MODE` | `off` | `off`, `patch`, or `markers` |
| `MATERIALIZE_ON` | `design_change` | `design_change` or `file_save` |
| `MATERIALIZE_DRY_RUN` | `true` | When true, log changes without writing files |
| `ENABLE_AUDIT_LOG` | `false` | Enable sync-log.md audit trail |

### Examples

```bash
# Disable overrides entirely (code always wins)
USE_OVERRIDES=false pnpm dev:watcher

# Only apply overrides newer than the source file
OVERRIDES_PRECEDENCE=if_newer_than_code pnpm dev:watcher

# Enable LLM mode with audit logging
USE_LLM_ANALYZER=true ENABLE_AUDIT_LOG=true OPENAI_API_KEY=sk-... pnpm dev:watcher

# Patch-only materialization (dry run - see what would change)
MATERIALIZE_MODE=patch MATERIALIZE_ON=file_save pnpm dev:watcher

# Patch-only materialization (write artifacts)
MATERIALIZE_MODE=patch MATERIALIZE_ON=file_save MATERIALIZE_DRY_RUN=false pnpm dev:watcher

# Marker edits (dry run)
MATERIALIZE_MODE=markers MATERIALIZE_ON=file_save pnpm dev:watcher

# Marker edits (write actual changes to source files)
MATERIALIZE_MODE=markers MATERIALIZE_ON=file_save MATERIALIZE_DRY_RUN=false pnpm dev:watcher
```

### Precedence Modes

| Mode | Behavior |
|------|----------|
| `always` | Overrides always win over code values (default) |
| `if_newer_than_code` | Only apply overrides where `lastUpdated` > file mtime |

---

## Quick Start (Demo)

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9

### Install

```bash
pnpm install
```

### Start the Server

```bash
pnpm dev:server
```

Server runs at `http://localhost:3001` with:
- WebSocket: `ws://localhost:3001/ws`
- HTTP polling: `GET /poll`
- Test endpoint: `POST /test`

### Start the Watcher

```bash
pnpm dev:watcher
```

Watches `demo-app/src/` for changes by default.

### Add @figma Markers

In any `.tsx` or `.ts` file:

```tsx
// @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
```

Examples:
```tsx
// @figma node=LoginButton text="Sign In" fill=Primary/Blue500
// @figma node=ErrorMessage text="Something went wrong" fill=#EF4444
// @figma node=CardBackground fill=Neutral/Gray50
```

---

## Human Test Walkthrough

### 1. Start the Server

```bash
pnpm dev:server
```

### 2. Start the Watcher

```bash
pnpm dev:watcher
```

### 3. Expose Server via Tunnel (for Figma access)

```bash
pnpm tunnel
```

Copy the tunnel URL (e.g., `https://xxx.trycloudflare.com`).

### 4. Connect Figma Plugin

1. In Figma, run the Aesthetic Function plugin
2. Enter the tunnel URL
3. Click "Connect"
4. Status should show "Connected"

### 5. Code → Figma Sync

1. Edit a file in `demo-app/src/` with `@figma` markers
2. Save the file
3. Watch the Figma document update in real-time

### 6. Figma → Code Capture

1. In Figma, select a node (text or frame)
2. In the plugin, click "Send Selection"
3. The server logs `DESIGN_CHANGE` and writes to `design-overrides.json`

### 7. Reconciliation Behavior

On the next file save:
- The watcher loads overrides from `design-overrides.json`
- Override values are merged with code-derived intents
- The merged result is sent to Figma
- Watcher logs show: `Overrides: precedence=always applied=N ignored=M`

### 8. Resetting Overrides

To clear all overrides and let code take precedence:

```bash
rm design-overrides.json
```

Or disable overrides temporarily:

```bash
USE_OVERRIDES=false pnpm dev:watcher
```

---

## Design Tokens

The watcher resolves semantic tokens to hex values:

| Token | Hex |
|-------|-----|
| `Primary/Blue500` | `#3B82F6` |
| `Success/Green500` | `#10B981` |
| `Error/Red500` | `#EF4444` |
| `Warning/Yellow500` | `#F59E0B` |
| `Neutral/Gray50` | `#F9FAFB` |
| `Neutral/Gray900` | `#111827` |

Raw hex values (e.g., `#FF0000`) pass through unchanged.

---

## Audit Trail

The server can log all broadcast operations to `sync-log.md` for debugging and traceability.

### Enable Audit Logging

```bash
ENABLE_AUDIT_LOG=true pnpm dev:server
```

### Log Format

```markdown
## [2025-01-15T10:30:00.000Z] [req-abc123] type=APPLY_OPERATIONS source=watcher
file=demo-app/src/Card.tsx
ops=2
- node="LoginButton" action=SET_FILL value="#3B82F6"
- node="LoginButton" action=SET_TEXT value="Sign In"
```

### Behavior

- **Default**: Audit logging is disabled
- **Async**: Logging is non-blocking with an in-memory queue (100ms flush interval)
- **Graceful shutdown**: Queue is flushed on SIGINT/SIGTERM

---

## Git Hygiene

The following files are **intentionally gitignored** as runtime artifacts:

| File/Directory | Purpose |
|----------------|---------|
| `design-overrides.json` | Captured design changes (local state) |
| `sync-log.md` | Audit trail (debug artifact) |
| `design-materializations/` | Generated patch artifacts (Phase 5B) |

These files are machine-local and should not be committed. Each developer/environment maintains their own override state.

---

## Project Structure

```
aesthetic-function/
├── packages/
│   ├── shared/           # Protocol definitions
│   ├── watcher/          # File watcher + transformer
│   │   └── src/
│   │       ├── analyze/  # LLM-based intent analyzer
│   │       ├── ast/      # Babel-based AST parser (Phase 6A)
│   │       ├── parse/    # @figma marker parser
│   │       ├── reconcile/# Override reconciliation
│   │       ├── materialize/ # Design → Code materialization
│   │       ├── tokens/   # Design token resolution
│   │       └── transform/# IntentModel → FigmaOps
│   ├── server/           # WebSocket + HTTP relay
│   └── figma-plugin/     # Figma sandbox plugin
├── demo-app/             # Sample React app with markers
├── design-overrides.json # (gitignored) Captured design changes
├── design-materializations/ # (gitignored) Patch artifacts
├── sync-log.md           # (gitignored) Audit trail
└── README.md
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm dev:server` | Start the relay server |
| `pnpm dev:watcher` | Start the file watcher |
| `pnpm dev` | Start all packages in parallel |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm tunnel` | Expose server via cloudflared |
| `pnpm test:send` | Send test operations |
| `pnpm --filter @aesthetic-function/watcher ast:report <file>` | Run AST diff report |

---

## Protocol Version

Current: `0.1.0`

All messages include a `protocolVersion` field for compatibility checking.
