# Aesthetic Function

A bidirectional Code ↔ Design synchronization system for React and Figma. The pipeline is deterministic by default, using `@figma` comment markers to extract design intent. An optional LLM-based analyzer can be enabled via feature flag, with automatic fallback to marker parsing on failure.

This is an **MVP / patent prototype**. It prioritizes determinism, testability, and safety over feature completeness.

---

## What Works Today (Phase 8B)

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
| **AST Semantic Extraction (Phase 6B/6C)** | |
| Semantic color/layout extraction from JSX | ✅ |
| AST write feasibility analysis | ✅ |
| Token-to-style reverse mapping | ✅ |
| Feasibility CLI (`feasibility:report`) | ✅ |
| **AST Writes (Phase 7A/7B)** | |
| AST-based source mutation via Babel | ✅ |
| Marker-line edits via AST | ✅ |
| Style object patching | ✅ |
| Dry-run mode for AST writes | ✅ |
| **Reconciliation Policy (Phase 7C)** | |
| Unified precedence: override > marker > ast > code | ✅ |
| Echo suppression guard (prevents feedback loops) | ✅ |
| Resolution summary logging | ✅ |
| **Variant/State Mapping (Phase 8A)** | |
| Component state dimension (base/disabled/hover/pressed) | ✅ |
| State-aware marker parsing (`state=hover`) | ✅ |
| State-aware Figma node targeting (`NodeName::hover`) | ✅ |
| Per-state override keys in design-overrides.json | ✅ |
| State-aware echo suppression cache | ✅ |
| Disabled state inference from AST (`disabled={true}`) | ✅ |
| **Native Figma Variant Targeting (Phase 8B)** | |
| Component Set variant resolution | ✅ |
| Variant query parsing (`NodeName::state`) | ✅ |
| State → Figma property mapping | ✅ |
| Variant info in DESIGN_CHANGE | ✅ |
| DEBUG_LIST_VARIANTS diagnostic | ✅ |
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
| **Phase 6B** | Semantic extraction from JSX (colors, layout) | ✅ |
| **Phase 6C** | AST write feasibility analysis | ✅ |
| **Phase 7A** | AST-based source mutation | ✅ |
| **Phase 7B** | Marker + style patching via AST | ✅ |
| **Phase 7C** | Reconciliation policy + echo suppression | ✅ |
| **Phase 8A** | Variant/state mapping (base/disabled/hover/pressed) | ✅ |
| **Phase 8B** | Native Figma Variant Targeting (Component Sets) | ✅ |

### Not Implemented Yet

| Feature | Status |
|---------|--------|
| Conflict resolution UI | ❌ |
| Layout/spacing operations | ❌ |
| Background reconciliation | ❌ |

The current implementation includes full AST-based mutation (Phase 7A/7B) with unified reconciliation policy (Phase 7C), variant/state mapping (Phase 8A), and native Figma variant targeting (Phase 8B). Echo suppression prevents feedback loops when AST writes trigger file save events.

---

## Variant/State Mapping (Phase 8A)

Phase 8A adds a state dimension to the intent pipeline, enabling synchronization of different component states (base, disabled, hover, pressed) to Figma.

### Component States

| State | Description | Figma Node Name |
|-------|-------------|-----------------|
| `base` | Default state (no suffix) | `LoginButton` |
| `hover` | Mouse hover state | `LoginButton::hover` |
| `disabled` | Disabled/inactive state | `LoginButton::disabled` |
| `pressed` | Active/pressed state | `LoginButton::pressed` |

### Marker Syntax

Use the `state=` attribute to specify component state:

```tsx
// @figma node=LoginButton fill=#3B82F6 text="Login"
// @figma node=LoginButton state=hover fill=#2563EB text="Login"
// @figma node=LoginButton state=disabled fill=#9CA3AF text="Login"
// @figma node=LoginButton state=pressed fill=#1E40AF text="Login"
```

### Figma Naming Convention

Operations target nodes using a `::` suffix for non-base states:

- **Base state**: `LoginButton` (no suffix)
- **Hover state**: `LoginButton::hover`
- **Disabled state**: `LoginButton::disabled`
- **Pressed state**: `LoginButton::pressed`

In your Figma document, name nodes to match this convention or use component variants.

### Override Keys

Design overrides support per-state keys:

```json
{
  "LoginButton": {
    "nodeId": "4:7",
    "lastUpdated": "2025-01-15T10:30:00.000Z",
    "fill": "#3B82F6",
    "text": "Sign In"
  },
  "LoginButton::hover": {
    "nodeId": "4:8",
    "lastUpdated": "2025-01-15T10:30:00.000Z",
    "fill": "#2563EB"
  },
  "LoginButton::disabled": {
    "nodeId": "4:9",
    "lastUpdated": "2025-01-15T10:30:00.000Z",
    "fill": "#9CA3AF"
  }
}
```

### AST State Inference

The system can infer `disabled` state from JSX with high confidence:

```tsx
<Button disabled={true}>Submit</Button>  // → state: 'disabled'
```

Note: `hover` and `pressed` states cannot be inferred from static JSX and must be explicitly declared via markers.

---

## Native Figma Variant Targeting (Phase 8B)

Phase 8B adds first-class support for Figma Component Sets with variants. Instead of requiring designers to manually name nodes like `LoginButton::hover`, the plugin can now resolve variant components directly from Component Sets.

### How It Works

When an operation targets `LoginButton::hover`:

1. **Parse variant query**: Extract `baseName=LoginButton`, `state=hover`
2. **Find Component Set**: Search current page for a Component Set named `LoginButton`
3. **Resolve variant**: Find the variant with `State=Hover` property
4. **Execute operation**: Apply changes to the resolved variant component

If no Component Set is found, it falls back to finding a node literally named `LoginButton::hover`.

### Figma Component Set Setup

For variant targeting to work, your Figma document needs:

1. **Component Set** named after your component (e.g., `LoginButton`)
2. **Variants** with a `State` property containing values like:
   - `Base` or `Default` (for base state)
   - `Hover` (for hover state)
   - `Disabled` (for disabled state)
   - `Pressed` (for pressed state)

Example Component Set structure in Figma:
```
LoginButton (Component Set)
├── State=Base (variant component)
├── State=Hover (variant component)
├── State=Disabled (variant component)
└── State=Pressed (variant component)
```

### State Mapping

The plugin maps code states to Figma property values:

| Code State | Figma Property Values |
|------------|----------------------|
| `base` | Base, Default |
| `hover` | Hover |
| `disabled` | Disabled |
| `pressed` | Pressed |

Property names checked: `State`, `state`, `Variant` (in that order).

### Variant Info in DESIGN_CHANGE

When a designer selects a variant component and clicks "Send Selection", the plugin now detects the variant context and includes the `NodeName::state` format in the message:

```json
{
  "type": "DESIGN_CHANGE",
  "payload": {
    "nodeName": "LoginButton::hover",
    "changes": [{ "changeType": "fill", "value": "#2563EB" }]
  }
}
```

This enables the reconciliation layer to store overrides with the correct state key.

### Diagnostic: DEBUG_LIST_VARIANTS

Set `DEBUG_LIST_VARIANTS = true` in `packages/figma-plugin/src/code.ts` to log all Component Sets and their variants on plugin startup:

```
[Figma Plugin] Found 2 Component Set(s):
  - "LoginButton" with 4 variant(s):
      • State=Base (State=Base)
      • State=Hover (State=Hover)
      • State=Disabled (State=Disabled)
      • State=Pressed (State=Pressed)
  - "IconButton" with 2 variant(s):
      • State=Default (State=Default)
      • State=Hover (State=Hover)
```

### Example Markers

Target specific variants with the standard `::state` syntax:

```tsx
// @figma node=LoginButton fill=#3B82F6 text="Login"
// @figma node=LoginButton::hover fill=#2563EB
// @figma node=LoginButton::disabled fill=#9CA3AF
// @figma node=LoginButton::pressed fill=#1E40AF
```

The plugin will:
1. Look for a Component Set named `LoginButton`
2. Resolve the variant with the matching state
3. Apply the fill color to that variant

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

## AST Semantic Extraction (Phase 6B/6C)

Phase 6B adds deeper semantic extraction from JSX to understand colors, layout, and style patterns. Phase 6C adds feasibility analysis to determine which values can be safely mutated.

### Semantic Categories

| Category | Extraction |
|----------|------------|
| **Fill Colors** | Inline `backgroundColor`, `color` from style objects |
| **Layout** | `gap`, `padding`, `margin` from style objects |
| **Token Mapping** | Reverse-map hex values to design tokens |

### Feasibility Analysis

The feasibility analyzer determines which AST nodes can be safely modified:

| Feasibility | Meaning |
|-------------|---------|
| `LITERAL_EASY` | Direct string/number literal, safe to modify |
| `PROPERTY_SPREAD` | Style object needs spread handling |
| `DYNAMIC_UNSAFE` | Expression/variable, cannot safely modify |
| `NOT_FOUND` | Target not found in AST |

### CLI Report

```bash
pnpm --filter @aesthetic-function/watcher feasibility:report demo-app/src/App.tsx
```

---

## AST Writes (Phase 7A/7B)

Phase 7A/7B implements AST-based source mutation using Babel. This enables direct modification of JSX literals and style objects while preserving formatting.

### What It Can Mutate

| Target | Example |
|--------|---------|
| **Marker text** | `// @figma node=X text="Old"` → `text="New"` |
| **Marker fill** | `// @figma node=X fill=#OLD` → `fill=#NEW` |
| **Style properties** | `style={{ backgroundColor: "#OLD" }}` → `"#NEW"` |
| **JSX text** | `<Button>Old</Button>` → `<Button>New</Button>` |

### Dry-Run Mode

By default, AST writes are in dry-run mode (`MATERIALIZE_DRY_RUN=true`):

```
AST Write: Would write the following changes:
  File: demo-app/src/App.tsx
  Changes:
    - LoginButton.text: "Login" → "Sign In"
    - LoginButton.fill: "#3B82F6" → "#FF5500"
```

### AST Write Mode

Set `MATERIALIZE_MODE=ast` and `MATERIALIZE_DRY_RUN=false` for actual writes.

---

## Reconciliation Policy (Phase 7C)

Phase 7C defines a unified precedence policy to prevent "source of truth fights" between markers, AST values, and design overrides.

### Precedence Order

When determining the final value for a field:

```
1. override (design-overrides.json)  ← Highest priority
2. marker   (@figma comment)
3. ast      (JSX literal extracted by Babel)
4. code     (fallback)               ← Lowest priority
```

### Resolution Example

```
LoginButton.text resolution:
  code:     "Submit" (from JSX)
  marker:   "Login"  (from @figma comment)
  override: "Sign In" (from design-overrides.json)
  → WINNER: "Sign In" (source: override)
```

### Echo Suppression

After an AST write modifies a file, the watcher may re-trigger from the file save. Echo suppression prevents sending duplicate operations:

1. When AST writes `LoginButton.text = "Sign In"`, record in cache
2. When file save triggers re-parse, check cache
3. If same value detected within TTL (5s default), suppress operation
4. After TTL expires, allow new operations

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ECHO_GUARD` | `true` | Enable echo suppression |
| `ECHO_GUARD_TTL_MS` | `5000` | Cache TTL in milliseconds |
| `OVERRIDES_PRECEDENCE` | `always` | `always` or `if_newer_than_code` |

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
| `ECHO_GUARD` | `true` | Enable echo suppression after AST writes |
| `ECHO_GUARD_TTL_MS` | `5000` | Echo cache TTL in milliseconds |

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
│   │       ├── ast/      # Babel-based AST parser + feasibility analysis
│   │       ├── parse/    # @figma marker parser
│   │       ├── reconcile/# Override reconciliation + precedence policy
│   │       ├── materialize/ # Design → Code materialization + AST writes
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
| `pnpm --filter @aesthetic-function/watcher feasibility:report <file>` | Run feasibility analysis |

---

## Protocol Version

Current: `0.1.0`

All messages include a `protocolVersion` field for compatibility checking.
