# Aesthetic Function

A bidirectional Code ↔ Design synchronization system for React and Figma. The pipeline is deterministic by default, using `@figma` comment markers to extract design intent. An optional LLM-based analyzer can be enabled via feature flag, with automatic fallback to marker parsing on failure.

This is an **MVP / patent prototype**. It prioritizes determinism, testability, and safety over feature completeness.

---

## What Works Today (Phase 10G)

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
| **Component Mapping Registry (Phase 8C)** | |
| component-map.json for stable node IDs | ✅ |
| Automatic map updates on Send Selection | ✅ |
| Watcher prefers mapped IDs over names | ✅ |
| Plugin resolves `id:<nodeId>` queries | ✅ |
| Idempotent server map merging | ✅ |
| **Feature Orchestrator (Phase 9A)** | |
| Prompt → Code → Figma pipeline | ✅ |
| LLM context bundle (AST, intents, overrides, tokens) | ✅ |
| Patch artifact generation + validation | ✅ |
| State-aware apply routing (markers/overrides for non-base) | ✅ |
| **Post-Apply Emit (Phase 9B)** | |
| Immediate Figma refresh after apply | ✅ |
| Watcher suppression (prevents duplicate sends) | ✅ |
| Debounced emit for rapid writes | ✅ |
| **Observability & DX (Phase 9C)** | |
| TraceSummary structured logging | ✅ |
| Ops-hash based suppression (smarter dedup) | ✅ |
| OPERATION_RESULT failure logging | ✅ |
| Demo scripts (demo:server, demo:watcher, etc.) | ✅ |
| TRACE/TRACE_JSON/TRACE_VERBOSE env vars | ✅ |
| **Test Stability (Phase 9D)** | |
| Deterministic test fixtures | ✅ |
| CI guardrails for demo-app isolation | ✅ |
| CONTRIBUTING.md test policy | ✅ |
| **Semantic Adapter Architecture (Phase 10A)** | |
| Generic SemanticAdapter interface | ✅ |
| Adapter registry with priority ordering | ✅ |
| Vuetify adapter (v-btn, v-card, v-text-field, v-chip) | ✅ |
| Confidence-based prop extraction | ✅ |
| Adapter/JSX semantics merging | ✅ |
| Fixture-based adapter tests | ✅ |
| **Ant Design Adapter (Phase 10B)** | |
| Import-based component detection | ✅ |
| AntD Button, Input, Card, Tag extraction | ✅ |
| Semantic hints (antd:primary, antd:danger) | ✅ |
| Registry extensibility proof | ✅ |
| **Component Map Suggestions (Phase 10C)** | |
| AST-based suggestion derivation | ✅ |
| Adapter-augmented Figma name hints | ✅ |
| Explicit-only variant states (markers/overrides) | ✅ |
| CLI output (read-only, no file writes) | ✅ |
| Existing map entry detection | ✅ |
| **Component Map Bootstrap (Phase 10D)** | |
| Bootstrap artifact generation | ✅ |
| Safe apply mode (behind env flags) | ✅ |
| Never overwrites existing nodeIds | ✅ |
| Atomic file writes | ✅ |
| **Canonical Token Layer (Phase 10E)** | |
| Design-system-agnostic token vocabulary | ✅ |
| Vuetify → canonical color mapping | ✅ |
| AntD → canonical color mapping | ✅ |
| Hex → canonical via design tokens | ✅ |
| Spacing normalization (T-shirt sizes) | ✅ |
| Extensible hint mapper registry | ✅ |
| CLI canonical semantics output | ✅ |
| **Canonical Resolver + Coverage (Phase 10F)** | |
| Canonical → design system value resolution | ✅ |
| Color token → hex resolution | ✅ |
| Spacing token → pixel resolution | ✅ |
| Radius/typography token resolution | ✅ |
| Coverage report with gap detection | ✅ |
| CLI resolution + coverage output | ✅ |
| **Resolution Policy + Project Coverage (Phase 10G)** | |
| Policy strategies (token-first, token-only, hex-allowed) | ✅ |
| Project-level coverage aggregation | ✅ |
| `canonical:coverage` CLI command | ✅ |
| Policy violations detection | ✅ |
| Strict mode for CI gates | ✅ |
| JSON output for automation | ✅ |
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
| **Phase 8C** | Component Mapping Registry (Stable IDs) | ✅ |
| **Phase 9A** | Feature Orchestrator (Prompt → Code → Figma) | ✅ |
| **Phase 9B** | Orchestrator "Apply → Re-emit Ops" (Immediate Figma Refresh) | ✅ |
| **Phase 9C** | Production Hardening, Observability & Demo DX | ✅ |
| **Phase 9D** | Test Stability & CI Guardrails | ✅ |
| **Phase 10A** | Semantic Adapter Architecture + Vuetify Adapter | ✅ |
| **Phase 10B** | Ant Design Adapter (Read-Only Semantic Extraction) | ✅ |
| **Phase 10C** | Component Map Bootstrap Suggestions (Read-Only) | ✅ |
| **Phase 10D** | Component Map Bootstrap Artifacts (CLI + Apply Mode) | ✅ |
| **Phase 10E** | Canonical Token Layer + Cross-Adapter Normalization | ✅ |

### Not Implemented Yet

| Feature | Status |
|---------|--------|
| Conflict resolution UI | ❌ |
| Layout/spacing operations | ❌ |
| Background reconciliation | ❌ |

The current implementation includes full AST-based mutation (Phase 7A/7B) with unified reconciliation policy (Phase 7C), variant/state mapping (Phase 8A), native Figma variant targeting (Phase 8B), stable ID mapping via component-map.json (Phase 8C), Feature Orchestrator with immediate Figma refresh (Phase 9A/9B), production hardening with test stability guardrails (Phase 9C/9D), framework-agnostic semantic adapter architecture with Vuetify support (Phase 10A), Ant Design adapter proving registry extensibility (Phase 10B), read-only component map suggestions (Phase 10C), bootstrap artifacts with safe apply mode (Phase 10D), and canonical token layer for cross-adapter normalization (Phase 10E). Echo suppression prevents feedback loops when AST writes trigger file save events.

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

## Component Mapping Registry (Phase 8C)

Phase 8C adds a deterministic mapping registry (`component-map.json`) that stores stable Figma node IDs for components and their variants. This enables sync targets to remain stable across renames and refactors.

### Why Stable IDs?

Figma node IDs remain constant for the lifetime of a node, even if:
- The node is renamed
- The node is moved to a different page
- The Component Set is reorganized

Without stable IDs, renaming a button from "LoginButton" to "SignInButton" would break all sync mappings. With stable IDs, the watcher uses the stored node ID directly.

### How It Works

1. **Send Selection**: When a designer selects a variant and clicks "Send Selection", the plugin sends both the DESIGN_CHANGE and a map update to the server
2. **Map Storage**: The server merges the update into `component-map.json` at the repo root
3. **Watcher Resolution**: On file save, the watcher checks `component-map.json` for a mapped node ID and uses `id:<nodeId>` format if found
4. **Plugin Resolution**: The plugin resolves `id:` prefixed queries using `figma.getNodeById()` for direct lookup

### Registry Format

```json
{
  "version": 1,
  "components": {
    "LoginButton": {
      "figma": {
        "componentSetNodeId": "12:34",
        "name": "LoginButton",
        "variants": {
          "base": { "nodeId": "12:35" },
          "hover": { "nodeId": "12:36" },
          "pressed": { "nodeId": "12:37" },
          "disabled": { "nodeId": "12:38" }
        }
      }
    }
  }
}
```

### Resolution Flow

```
Marker: @figma node=LoginButton::hover
          ↓
Watcher: Check component-map.json
          ↓
Found: LoginButton.figma.variants.hover.nodeId = "12:36"
          ↓
Emit: nodeQuery = "id:12:36"
          ↓
Plugin: figma.getNodeById("12:36") → direct node access
```

If no mapping exists, the watcher falls back to name-based resolution (`LoginButton::hover`).

### Git Configuration

By default, `component-map.json` is gitignored (local state). To commit it for team sharing:

```bash
# Remove from .gitignore or add exception
echo '!component-map.json' >> .gitignore

# Commit the map
git add component-map.json
git commit -m "Add component mapping for stable Figma IDs"
```

**Pros of committing**:
- Team members get the same stable mappings
- Mappings survive local file deletion

**Pros of ignoring**:
- Each developer has their own Figma document
- No merge conflicts on mapping files

### Environment Variable

Control component map usage:

```bash
# Disable component map resolution
USE_COMPONENT_MAP=false pnpm watcher

# Enable explicitly (default if file exists)
USE_COMPONENT_MAP=true pnpm watcher
```

### Fallback Behavior

- If `component-map.json` doesn't exist: name-based resolution only
- If component exists but variant missing: warns and falls back to name
- If `id:` query fails (node deleted): warns and tries name-based resolution
- If multiple Component Sets share a name: fails loudly (ambiguous)

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
| `AST_WRITE_MODE` | `off` | `off`, `patch`, or `write` — Controls AST-based code writes |
| `AST_WRITE_DRY_RUN` | `true` | When true, log what would change without writing. Set to `false` to actually write. |
| `AST_WRITE_ALLOW` | `SET_TEXT,SET_FILL,SET_LAYOUT` | Comma-separated list of allowed write operations |
| `POST_APPLY_EMIT` | `false` | Immediately emit to Figma after Feature Orchestrator apply |
| `POST_APPLY_EMIT_DEBOUNCE_MS` | `200` | Debounce delay for post-apply emit (ms) |
| `ENABLE_AUDIT_LOG` | `false` | Enable sync-log.md audit trail |
| `ECHO_GUARD` | `true` | Enable echo suppression after AST writes |
| `ECHO_GUARD_TTL_MS` | `5000` | Echo cache TTL in milliseconds |
| `TRACE` | `true` | Enable structured trace logging |
| `TRACE_JSON` | `false` | Output traces as JSON (one per line) |
| `TRACE_VERBOSE` | `false` | Include detailed timings and resolution info |

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

# Feature Orchestrator: Generate a patch artifact (dry-run by default)
pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --component LoginButton \
  --state hover \
  --prompt "Make the hover state button use the success green token"

# Feature Orchestrator: Preview what would be applied
AST_WRITE_MODE=write pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --prompt "Change the Card title to 'Welcome'" \
  --apply --dry-run

# Feature Orchestrator: Actually apply the patch to source code
AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --prompt "Change the Card title to 'Welcome'" \
  --apply

# Or use the --no-dry-run CLI flag (same as AST_WRITE_DRY_RUN=false)
AST_WRITE_MODE=write pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --prompt "Change the Card title to 'Welcome'" \
  --apply --no-dry-run

# Feature Orchestrator: Apply AND immediately push to Figma (Phase 9B)
POST_APPLY_EMIT=true AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --component LoginButton \
  --state hover \
  --prompt "Make the hover state button use the success green token and change its label to 'Continue'" \
  --apply
```

### Precedence Modes

| Mode | Behavior |
|------|----------|
| `always` | Overrides always win over code values (default) |
| `if_newer_than_code` | Only apply overrides where `lastUpdated` > file mtime |

---

## Fast Demo: Immediate Figma Refresh (Phase 9B)

This section shows how to use the Feature Orchestrator with immediate Figma updates.

### Prerequisites

1. **Start the server** (with optional tunnel for remote Figma access):
   ```bash
   pnpm dev:server
   ```

2. **Start the watcher** (for normal file-change sync):
   ```bash
   pnpm dev:watcher
   ```

3. **Load the Figma plugin**:
   - Open Figma Desktop
   - Run the plugin from `Plugins > Development > Import plugin from manifest...`
   - Point to `packages/figma-plugin/manifest.json`

4. **Ensure your Figma document has matching nodes**:
   - Create a frame named `LoginButton` (or `LoginButton::hover` for state variants)
   - Alternatively, create a Component Set named `LoginButton` with `State=Hover` variant

### Run Feature Orchestrator with POST_APPLY_EMIT

```bash
POST_APPLY_EMIT=true AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher feature \
  --file demo-app/src/App.tsx \
  --component LoginButton \
  --state hover \
  --prompt "Make the hover state button use the success green token and change its label to 'Continue'" \
  --apply
```

### What Happens

1. **LLM generates changes**: The orchestrator calls the LLM with the prompt and code context
2. **State-aware apply**: Hover state changes go to markers/overrides (not base JSX)
3. **Post-apply emit**: Immediately after apply, the system:
   - Reads the updated file from disk
   - Parses the intent model
   - Applies reconciliation and overrides
   - Transforms to FigmaOperations
   - Sends to the server
4. **Figma updates**: Connected Figma plugin receives operations and updates the document

### Expected Output

```
[Orchestrator] Processing feature request for demo-app/src/App.tsx
[Orchestrator] Prompt: "Make the hover state button use the success green token..."
...
[Orchestrator] Successfully applied changes
[Orchestrator] Post-apply emit: enabled
[PostApplyEmit] Starting emit for demo-app/src/App.tsx
[PostApplyEmit] Component: LoginButton, State: hover
[PostApplyEmit] Using marker parser...
[PostApplyEmit] Generated 2 operation(s)
[PostApplyEmit] ✓ Sent 2 ops (1 client(s))
[Orchestrator] Post-apply emit: ops=2 sent=true clients=1
```

### Watcher Suppression

When `POST_APPLY_EMIT` is enabled:
- The feature orchestrator records the file path after emit
- The watcher detects the file change but **suppresses** the duplicate send
- Logs show: `[Watcher] Suppressed: demo-app/src/App.tsx (recently emitted by Feature Orchestrator)`

This prevents double-updates to Figma.

---

## Observability (Phase 9C)

Phase 9C adds production-grade observability with structured logging to answer "what happened and why?" when debugging sync issues.

### TraceSummary

Every pipeline run (watcher or orchestrator) generates a `TraceSummary` with:

- **requestId**: Unique identifier for tracing
- **source**: Origin (`watcher`, `feature-emit-marker`, `feature-emit-llm`)
- **parseMode**: How intents were extracted (`markers`, `llm`, `ast`)
- **intentsCount**: Number of intents found
- **opsCount**: Number of Figma operations generated
- **resolution**: Override/marker/ast precedence details
- **emit**: Whether operations were sent and to how many clients

### Example Trace Output

```
[Trace] requestId=feature-emit-1234 file=demo-app/src/App.tsx parse=markers intents=4 ops=6
[Trace] resolution: override=2 marker=2 ast=0 code=2 map: used=true mappedOps=6
[Trace] emit: enabled=true sent=true clients=1 suppressedWatcher=true
```

### Trace Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRACE` | `true` | Enable trace logging (human-readable) |
| `TRACE_JSON` | `false` | Output traces as JSON (for log aggregation) |
| `TRACE_VERBOSE` | `false` | Include detailed timings and resolution info |

### Usage

```bash
# Default human-readable traces
TRACE=true pnpm dev:watcher

# JSON output for log aggregation
TRACE_JSON=true pnpm dev:watcher

# Verbose mode with timing details
TRACE_VERBOSE=true pnpm dev:watcher
```

### Suppression Logging

The enhanced suppression system logs decisions:

```
[Trace] [suppression] demo-app/src/App.tsx: SUPPRESSED (same-ops)
[Trace] [suppression] demo-app/src/App.tsx: not suppressed (different-ops)
```

The ops-hash comparison prevents suppression of genuinely different changes that happen within the TTL window.

---

## Semantic Adapter Architecture (Phase 10A/10B/10C)

Phase 10A introduces a generic adapter system for extracting semantic intent from framework-specific UI components. Phase 10B adds the Ant Design adapter, proving the registry is framework-agnostic. Phase 10C adds read-only component map bootstrap suggestions, helping users bootstrap `component-map.json` for new projects. This allows the system to understand Vuetify, Ant Design, MUI, Chakra, and other UI frameworks without contaminating the core AST analysis pipeline.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AST Analysis Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  JSX Source ─→ Babel Parse ─→ Generic Extraction                 │
│                                     │                             │
│                                     ▼                             │
│                            ┌────────────────┐                    │
│                            │ Adapter Registry│                    │
│                            └────────────────┘                    │
│                                     │                             │
│                    ┌────────────────┼────────────────┐           │
│                    ▼                ▼                ▼           │
│              ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│              │ Vuetify  │    │  Antd    │    │   MUI    │       │
│              │ Adapter  │    │ Adapter  │    │ Adapter  │       │
│              └──────────┘    └──────────┘    └──────────┘       │
│                    │                │                │           │
│                    └────────────────┼────────────────┘           │
│                                     ▼                             │
│                            Merged Semantics                       │
│                                     │                             │
│                                     ▼                             │
│                        ┌─────────────────────┐                   │
│                        │ Suggestion Generator│  (Phase 10C)      │
│                        │   (READ-ONLY)       │                   │
│                        └─────────────────────┘                   │
│                                     │                             │
│                                     ▼                             │
│                      Component Map Suggestions                    │
│                        (CLI output only)                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Supported Frameworks (Phase 10A/10B)

| Framework | Components | Detection | Status |
|-----------|-----------|-----------|--------|
| **Vuetify** | v-btn, v-card, v-text-field, v-chip | Tag name (`v-*`) | ✅ |
| **Ant Design** | Button, Input, Card, Tag | Import source (`antd`) | ✅ |
| MUI | - | - | Planned |
| Chakra UI | - | - | Planned |

### Vuetify Adapter

The Vuetify adapter extracts semantics from Vuetify's `v-*` components:

| Component | Extracted Semantics |
|-----------|---------------------|
| `v-btn` | color → fills, disabled, size, variant |
| `v-card` | width, height, title, subtitle, elevation |
| `v-text-field` | label → placeholder, disabled |
| `v-chip` | color → fills, variant |

### Ant Design Adapter (Phase 10B)

The Ant Design adapter uses **import-based detection** - components are only recognized if imported from `antd` or `antd/es/*`. This proves the adapter system is framework-agnostic.

| Component | Extracted Semantics |
|-----------|---------------------|
| `Button` | type → fills (antd:primary, etc.), danger, disabled, children |
| `Input` | placeholder, disabled |
| `Card` | title |
| `Tag` | color → fills (antd:color:green, etc.), children |

**Key Differences from Vuetify:**
- Uses **semantic hints** (`antd:primary`) instead of hex colors
- Detection via **import source**, not tag name
- PascalCase component names (Button, not v-btn)

### Component Map Suggestions (Phase 10C)

Phase 10C adds **read-only** suggestions for bootstrapping `component-map.json`. When analyzing a file, the system derives suggested entries based on AST anchors and adapter semantics.

**Key Characteristics:**
- **READ-ONLY**: Suggestions are printed to CLI only, no files are written
- **No Figma node IDs**: Code-only analysis, users must map to Figma manually
- **Explicit-only variant states**: Variant suggestions (`variantStatesSuggested`) are derived ONLY from explicit sources:
  - `@figma state=X` markers in code (e.g., `// @figma node="Button" state=hover`)
  - `design-overrides.json` keys with `::state` suffix (e.g., `"LoginButton::disabled"`)
  - **Never** inferred from semantics (disabled boolean, hover style hints, etc.)
- **Adapter-aware naming**: Uses framework metadata for better Figma name suggestions

**Example CLI Output:**
```
=== COMPONENT MAP SUGGESTIONS (READ-ONLY) ===
  NOTE: These suggestions are READ-ONLY. To use them, manually
  add entries to component-map.json or use Figma plugin "Send Selection".

  NEW (not in component-map.json):
    components/LoginButton
      → Suggested name: "Ant Design Button"
      → Variants: [hover]  (explicit: state=hover marker found)
      → Source: combined (antd)
      → Reason: Ant Design adapter: Button

    components/InfoCard
      → Suggested name: "Ant Design Card"
      → Variants: []
      → Source: combined (antd)
      → Reason: Ant Design adapter: Card

  Summary: 2 new, 0 existing, 0 skipped
```

**Suggestion Sources:**
| Source | Description |
|--------|-------------|
| `ast-anchor` | Derived from AST analysis only, no adapter match |
| `combined` | AST anchor + adapter semantics |

### Component Map Bootstrap Artifacts (Phase 10D)

Phase 10D adds a **safe, review-first workflow** to bootstrap `component-map.json` from Phase 10C suggestions. It generates deterministic, auditable artifacts that humans can review before applying.

#### Why It Exists

- **Safe by default**: Generates review artifacts only, never auto-writes `component-map.json`
- **Deterministic**: Same inputs produce identical outputs (testable, auditable)
- **Explicit-only**: Respects Phase 10C rule — variant states from markers/overrides only
- **Never overwrites node IDs**: Existing Figma mappings are always preserved

#### How to Run

```bash
pnpm --filter @aesthetic-function/watcher map:bootstrap demo-app/src/App.tsx
```

**Output:**
1. Writes artifact to: `design-materializations/<file>.component-map-bootstrap.json`
2. Prints terminal summary with counts and manual fields

#### Artifact Format

```json
{
  "version": 1,
  "generatedAt": "2025-12-20T12:00:00.000Z",
  "file": "demo-app/src/App.tsx",
  "policy": {
    "variantStates": "explicit-only",
    "writes": "artifact-only"
  },
  "proposed": [
    {
      "componentKey": "auth/LoginButton",
      "figmaNameSuggestion": "Login Button",
      "variantStatesSuggested": ["hover"],
      "status": "new",
      "diff": {
        "before": null,
        "after": {
          "version": 2,
          "components": {
            "auth/LoginButton": {
              "figma": {
                "name": "Login Button",
                "componentSetNodeId": null,
                "variants": {
                  "base": { "nodeId": null },
                  "hover": { "nodeId": null }
                }
              }
            }
          }
        }
      },
      "manualFields": [
        "figma.componentSetNodeId",
        "figma.variants.base.nodeId",
        "figma.variants.hover.nodeId"
      ],
      "reason": "AST anchor: LoginButton + Ant Design adapter"
    }
  ],
  "skipped": []
}
```

#### How to Use the Artifact

1. **Review proposed entries** in the artifact JSON
2. **Copy entries** you want into `component-map.json`
3. **Fill in node IDs** manually using Figma plugin "Send Selection"
4. The `manualFields` array tells you exactly what needs filling

#### Enable Apply Mode (Advanced)

To let the CLI merge entries into `component-map.json`:

```bash
# Dry run (shows what would change, doesn't modify)
MAP_BOOTSTRAP_MODE=apply pnpm --filter @aesthetic-function/watcher map:bootstrap demo-app/src/App.tsx

# Actually apply (creates scaffolding, never fills node IDs)
MAP_BOOTSTRAP_MODE=apply MAP_BOOTSTRAP_DRY_RUN=false pnpm --filter @aesthetic-function/watcher map:bootstrap demo-app/src/App.tsx
```

**Environment Variables:**
| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `MAP_BOOTSTRAP_MODE` | `artifact` \| `apply` | `artifact` | What to write |
| `MAP_BOOTSTRAP_DRY_RUN` | `true` \| `false` | `true` | Prevent actual writes |

#### What's Never Auto-Filled

Even in apply mode, these fields are **never** auto-filled:
- `figma.componentSetNodeId` — Requires Figma plugin
- `figma.variants.*.nodeId` — Requires Figma plugin
- Existing node IDs are **never overwritten**

#### Merge Rules

| Scenario | Behavior |
|----------|----------|
| New component | Add entry with null nodeIds |
| Existing component, same config | Skip (already present) |
| Existing component, new variants | Add variant keys only |
| Existing component, different name | Mark as "manual decision required" |
| Existing nodeIds | **Never overwritten** |

---

### Canonical Token Layer (Phase 10E)

Phase 10E introduces a **design-system-agnostic semantic token layer** that normalizes adapter-specific values (Vuetify, Ant Design) and generic JSX values into portable canonical tokens.

#### Why It Exists

- **Cross-adapter portability**: Same canonical tokens regardless of UI library
- **Figma mapping consistency**: Canonical tokens → consistent Figma component mappings
- **Future MCP negotiation**: Standard vocabulary for AI-driven design token exchange
- **Observability**: Clear audit trail showing raw values → canonical tokens

#### Canonical Token Vocabulary

The canonical layer uses a hierarchical token naming convention:

```
color.primary      ← Vuetify "primary", AntD type="primary", hex #3B82F6
color.danger       ← Vuetify "error", AntD danger={true}
color.success      ← Vuetify "success", hex #10B981
color.warning      ← Vuetify "warning", hex #F59E0B
color.neutral.100  ← AntD type="default"

space.none         ← 0px
space.xs           ← 1-4px
space.sm           ← 5-8px
space.md           ← 9-16px
space.lg           ← 17-24px
space.xl           ← 25-32px
space.2xl          ← 33-48px
space.3xl          ← 49px+
```

#### How Normalization Works

```
┌──────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Adapter Semantics   │────▶│  Canonical Layer    │────▶│ Normalized Output│
│  (antd:primary)      │     │  (normalize.ts)     │     │ (color.primary)  │
└──────────────────────┘     └─────────────────────┘     └──────────────────┘
         ▲                            │
         │                            │ Hint Mappers
┌──────────────────────┐              │ (per-adapter)
│  Generic JSX         │              ▼
│  (#3B82F6)           │────▶ ┌───────────────────┐
└──────────────────────┘      │ Design Token Match│
                              │ (designTokens.ts) │
                              └───────────────────┘
```

1. **Adapter hints** → Look up in adapter-specific hint mapper
2. **Hex colors** → Check design tokens for known values
3. **Unknown values** → Preserved as raw + note generated

#### CLI Output

The `ast:report` command now shows canonical semantics:

```
============================================================
CANONICAL SEMANTICS (Phase 10E)
============================================================
  LoginButton:
    fill: color.primary (confidence=high, source=vuetify)
      raw: #1976D2
  DisabledButton:
    fill: color.danger (confidence=high, source=vuetify)
      raw: #FF5252
  RegularButton:
    fill: color.primary (confidence=high, source=generic-jsx)
      raw: #3B82F6

  Summary: 7 canonical fields, 0 raw fields, 0 notes
```

#### Normalization Notes

When values can't be mapped to canonical tokens, notes explain why:

| Note Type | Meaning |
|-----------|---------|
| `unmapped_color_hex` | Hex color not in design tokens |
| `unmapped_adapter_hint` | Adapter hint has no canonical mapping |
| `ambiguous_mapping` | Multiple possible canonical tokens |
| `raw_value_preserved` | Value kept as-is (informational) |

#### Extensibility: Custom Hint Mappers

Future adapters can register custom hint mappings:

```typescript
import { registerCanonicalHintMapper } from './tokens/canonical/index.js';

// Register MUI hint mapper
registerCanonicalHintMapper('mui', (hint: string) => {
  if (hint === 'mui:primary') return 'color.primary';
  if (hint === 'mui:error') return 'color.danger';
  return null;
});
```

#### Supported Mappings

**Vuetify → Canonical:**

| Vuetify | Canonical |
|---------|-----------|
| `primary` | `color.primary` |
| `secondary` | `color.secondary` |
| `success` | `color.success` |
| `error` | `color.danger` |
| `warning` | `color.warning` |
| `info` | `color.info` |
| `red`, `blue`, etc. | `color.red`, `color.blue`, etc. |

**Ant Design → Canonical:**

| AntD | Canonical |
|------|-----------|
| `antd:primary` | `color.primary` |
| `antd:danger` | `color.danger` |
| `antd:default` | `color.neutral.100` |
| `antd:link` | `color.primary` |

**Design Token Hex → Canonical:**

| Hex | Token Name | Canonical |
|-----|------------|-----------|
| `#3B82F6` | `Primary/Blue500` | `color.primary` |
| `#10B981` | `Success/Green500` | `color.success` |
| `#EF4444` | `Error/Red500` | `color.danger` |
| `#F59E0B` | `Warning/Yellow500` | `color.warning` |

#### Scope & Constraints

Phase 10E is **read-only** and does not:
- Modify JSX/TSX source files
- Write markers or overrides
- Emit Figma operations
- Change watcher sync behavior
- Affect server/plugin/protocol

---

### Canonical Resolver + Coverage Report (Phase 10F)

Phase 10F builds on the canonical layer (10E) by **resolving canonical tokens to concrete design system values** (hex colors, pixel measurements) and producing a **deterministic coverage report**.

#### Why It Exists

- **Bridge canonical → concrete**: Convert abstract tokens to actual values for Figma operations
- **Coverage visibility**: See exactly which canonical tokens resolve and which have gaps
- **Adapter-agnostic**: Same resolution logic for Vuetify, AntD, and generic JSX
- **Deterministic**: Same canonical input always produces same resolution output

#### How Resolution Works

```
┌──────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Canonical Semantics │────▶│  Canonical Resolver │────▶│  Resolved Values │
│  (color.primary)     │     │  (resolve.ts)       │     │  (#3B82F6)       │
└──────────────────────┘     └─────────────────────┘     └──────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Coverage Report  │
                              │ (totals, gaps)   │
                              └──────────────────┘
```

1. **Color resolution**: Canonical token → design token name → hex value
2. **Spacing resolution**: Canonical token → pixel value (8-point grid)
3. **Radius resolution**: Canonical token → pixel value
4. **Typography resolution**: Canonical token → fontSize/fontWeight values

#### CLI Output

The `ast:report` command now includes resolution and coverage:

```
============================================================
CANONICAL RESOLUTION (Phase 10F)
============================================================
  LoginButton:
    fill: color.primary → #3B82F6
  DisabledButton:
    fill: color.danger → #EF4444
  CardComponent:
    padding: space.lg → 24px
    borderRadius: radius.md → 8px

  Coverage: 4/4 resolved (100%)
```

When tokens cannot be resolved, notes explain why:

```
  UnknownComponent:
    fill: color.custom → (unresolved)
      ⚠ Canonical token "color.custom" not mapped to design system
    gap: space.weird → (unresolved)
      ⚠ Spacing token "space.weird" not found in scale

  Coverage: 0/2 resolved (0%)
```

#### Resolution Scales

**Spacing Scale (8-point grid):**

| Canonical | Pixels |
|-----------|--------|
| `space.none` | 0 |
| `space.xs` | 4 |
| `space.sm` | 8 |
| `space.md` | 16 |
| `space.lg` | 24 |
| `space.xl` | 32 |
| `space.2xl` | 48 |
| `space.3xl` | 64 |

**Radius Scale:**

| Canonical | Pixels |
|-----------|--------|
| `radius.none` | 0 |
| `radius.sm` | 4 |
| `radius.md` | 8 |
| `radius.lg` | 16 |
| `radius.full` | 9999 |

**Typography Scale:**

| Canonical | Value |
|-----------|-------|
| `text.size.xs` | 12px |
| `text.size.sm` | 14px |
| `text.size.md` | 16px |
| `text.size.lg` | 18px |
| `text.size.xl` | 20px |
| `text.size.2xl` | 24px |
| `text.weight.light` | 300 |
| `text.weight.normal` | 400 |
| `text.weight.medium` | 500 |
| `text.weight.semibold` | 600 |
| `text.weight.bold` | 700 |

#### Coverage Report Structure

```typescript
interface CoverageReport {
  totals: {
    canonicalFields: number;  // Total fields analyzed
    resolved: number;         // Successfully resolved
    unresolved: number;       // Gaps (not resolved)
  };
  byCategory: {
    colors: CategoryCoverage;
    spacing: CategoryCoverage;
    radius: CategoryCoverage;
    typography: CategoryCoverage;
  };
  gaps: CoverageGap[];  // List of unresolved tokens with notes
}
```

#### Scope & Constraints

Phase 10F is **read-only** and does not:
- Modify JSX/TSX source files
- Write markers or overrides
- Emit Figma operations
- Change watcher sync behavior
- Affect server/plugin/protocol

---

### Resolution Policy + Project Coverage (Phase 10G)

Phase 10G adds **policy controls** and **project-level coverage reporting** for canonical resolution.

#### Why It Exists

- **Policy flexibility**: Different teams have different strictness requirements
- **CI integration**: Optional strict mode fails builds on policy violations
- **Project visibility**: Aggregate coverage across all source files
- **Actionable gaps**: See which canonical tokens need attention

#### CLI Command

```bash
# Scan a directory for TSX files
pnpm --filter @aesthetic-function/watcher canonical:coverage src

# JSON output for automation
pnpm --filter @aesthetic-function/watcher canonical:coverage src --json

# Strict mode (fails CI if violations exist)
CANONICAL_STRICT=true pnpm --filter @aesthetic-function/watcher canonical:coverage src
```

#### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `CANONICAL_STRICT` | `true`, `false` | `false` | Enable strict mode (violations fail CI) |
| `CANONICAL_COLOR_STRATEGY` | `token-first`, `hex-allowed`, `token-only` | `token-first` | Color resolution policy |
| `CANONICAL_SPACING_SCALE` | `8pt`, `token-only`, `custom` | `8pt` | Spacing scale policy |
| `CANONICAL_RADIUS_SCALE` | `default`, `token-only`, `custom` | `default` | Radius scale policy |
| `CANONICAL_TYPOGRAPHY_SCALE` | `default`, `token-only`, `custom` | `default` | Typography scale policy |

#### Policy Strategies

**Color Strategies:**

| Strategy | Behavior |
|----------|----------|
| `token-first` | Prefer tokens, allow raw hex passthrough (default) |
| `hex-allowed` | Same as token-first, no violations for hex |
| `token-only` | Raw hex values are policy violations |

**Other Strategies:**

| Strategy | Behavior |
|----------|----------|
| `8pt` / `default` | Use default scales (default) |
| `token-only` | Only canonical tokens allowed, raw values are violations |
| `custom` | Use custom scale from config (future) |

#### CLI Output

```
┌─────────────────────────────────────────────────────────────────┐
│           PROJECT CANONICAL COVERAGE (Phase 10G)                │
├─────────────────────────────────────────────────────────────────┤
│ Files scanned:    3                                             │
│ Components:       47                                            │
│ Canonical fields: 11                                            │
│ Resolved:         10                                            │
│ Unresolved:       1                                             │
│ Coverage:         91%                                           │
├─────────────────────────────────────────────────────────────────┤
│ Policy:           color=token-first, spacing=8pt, ...           │
├─────────────────────────────────────────────────────────────────┤
│ Top Gaps:                                                       │
│   color.info (colors): 1 file(s)                                │
├─────────────────────────────────────────────────────────────────┤
│ ℹ️  CI: strict mode disabled (violations are informational)     │
└─────────────────────────────────────────────────────────────────┘
```

#### CI Gate (Optional)

To enable strict mode in CI, add to your CI config:

```yaml
# Example GitHub Actions
- name: Check canonical coverage
  run: |
    CANONICAL_STRICT=true pnpm --filter @aesthetic-function/watcher canonical:coverage src
```

This will fail the build if any policy violations exist.

#### Scope & Constraints

Phase 10G is **read-only** and does not:
- Modify JSX/TSX source files
- Write markers or overrides
- Emit Figma operations
- Change watcher sync behavior
- Affect server/plugin/protocol

---

### Color Mapping

Vuetify semantic colors are mapped to hex values:

| Vuetify Color | Hex Value |
|---------------|-----------|
| `primary` | #1976D2 |
| `success` | #4CAF50 |
| `error` | #FF5252 |
| `warning` | #FB8C00 |
| `info` | #2196F3 |

### Confidence Levels

| Prop Type | Confidence | Example |
|-----------|------------|---------|
| String literal | `high` | `color="primary"` |
| Static template | `high` | `` color={`primary`} `` |
| Boolean shorthand | `high` | `disabled` |
| Variable/expression | `low` | `color={buttonColor}` |

### SemanticAdapter Interface

Custom adapters implement this interface:

```typescript
interface SemanticAdapter {
  readonly id: string;           // e.g., 'vuetify'
  readonly displayName: string;  // e.g., 'Vuetify'
  readonly priority?: number;    // Lower = runs earlier

  supports(node: JSXElement, ctx: AdapterContext): boolean;
  extract(node: JSXElement, ctx: AdapterContext): AdapterResult;
}
```

### Merge Rules

When adapter semantics are merged with generic JSX semantics:

1. **Adapter wins** for fields it explicitly sets
2. **Generic JSX preserved** for fields adapter doesn't set
3. **No erasure** - adapters cannot remove existing values
4. **Provenance tracked** - each value knows its source

### CLI Output

The `pnpm ast:report` command now includes adapter semantics:

```
=== ADAPTER SEMANTICS (Phase 10A) ===
Components with adapter matches: 3

  LoginButton
    Adapter: Vuetify
    Fields: visual.fills, booleans.disabled
    Confidence: high
    Metadata: { component: 'v-btn', vuetifyColor: 'primary' }
```

---

## Troubleshooting

Common issues and solutions:

### "Figma doesn't update when I save a file"

1. **Check server is running**: `pnpm dev:server` should show "HTTP server listening on http://localhost:3001"
2. **Check watcher is running**: `pnpm dev:watcher` should show "Watcher started"
3. **Check plugin is connected**: Plugin UI should show "Connected" status
4. **Check for markers**: File must contain `// @figma node=...` markers
5. **Check node names match**: Figma nodes must be named exactly as specified in markers

### "Operations sent but node not found in Figma"

Look for this log in the server:
```
[Server] ✗ OPERATION_RESULT failed for requestId=...
[Server]   Error: Node not found: "LoginButton"
```

Solutions:
- Verify node exists with exact name in Figma
- Use `component-map.json` for stable ID mapping
- Enable `DEBUG_LIST_VARIANTS=true` in plugin to see available nodes

### "Duplicate operations sent"

The suppression system should prevent this. If it happens:

1. Check suppression logs: `TRACE=true pnpm dev:watcher`
2. Look for: `[Trace] [suppression]` entries
3. If different ops are being incorrectly suppressed, the ops-hash may need debugging

### "Override changes not reflected"

1. Check `design-overrides.json` exists with the node entry
2. Verify `USE_OVERRIDES=true` (default)
3. Check precedence: `OVERRIDES_PRECEDENCE=always` means overrides always win
4. If using `if_newer_than_code`, ensure override timestamp is newer than file mtime

### "LLM mode returns empty intents"

1. Verify API key is set: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
2. Check provider setting: `LLM_PROVIDER=openai` or `anthropic`
3. Look for fallback: `[Watcher] LLM failed, falling back to markers`
4. Try with markers first to verify basic pipeline works

### Enable Verbose Diagnostics

```bash
# Full trace output with timing details
TRACE=true TRACE_VERBOSE=true ENABLE_AUDIT_LOG=true pnpm dev:watcher
```

---

## Demo Scripts (Phase 9C)

Quick-start scripts for demos and development:

| Command | Description |
|---------|-------------|
| `pnpm demo:server` | Start the relay server with pretty logging |
| `pnpm demo:watcher` | Start the file watcher with trace output |
| `pnpm demo:feature` | Run the feature orchestrator CLI |
| `pnpm demo:fast` | Start server + watcher concurrently |
| `pnpm demo:tunnel` | Expose server via cloudflared for Figma access |

### Professional Demo Runbook

**Setup (5 minutes before demo):**

1. Start server and watcher:
   ```bash
   pnpm demo:fast
   ```

2. In a separate terminal, start the tunnel:
   ```bash
   pnpm demo:tunnel
   ```
   Copy the HTTPS URL.

3. Open Figma, run the plugin, paste the tunnel URL, click Connect.

4. Verify connection by saving a file with `@figma` markers and watching Figma update.

**During Demo:**

1. **Show Code → Design**: Edit a file, save, watch Figma update in real-time.

2. **Show Design → Code**: In Figma, select a node, click "Send Selection" in the plugin.
   Show `design-overrides.json` updating.

3. **Show Feature Orchestrator**:
   ```bash
   pnpm demo:feature --file demo-app/src/App.tsx \
     --prompt "Change the Card background to success green"
   ```
   Show the patch artifact generated.

4. **Show Immediate Apply** (Phase 9B):
   ```bash
   POST_APPLY_EMIT=true AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false \
     pnpm demo:feature --file demo-app/src/App.tsx \
     --prompt "Change the button text to Submit" --apply
   ```
   Watch Figma update immediately without waiting for file-save detection.

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
| `component-map.json` | Stable Figma node ID mappings (Phase 8C) |
| `sync-log.md` | Audit trail (debug artifact) |
| `design-materializations/` | Generated patch artifacts (Phase 5B) |

These files are machine-local and should not be committed by default. Each developer/environment maintains their own override state. However, `component-map.json` can optionally be committed for team sharing of stable ID mappings.

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
├── component-map.json    # (gitignored) Stable Figma node ID mappings
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
| `pnpm demo:server` | Start server with pretty logging |
| `pnpm demo:watcher` | Start watcher with trace output |
| `pnpm demo:feature` | Run feature orchestrator CLI |
| `pnpm demo:fast` | Start server + watcher concurrently |
| `pnpm demo:tunnel` | Expose server for Figma access |
| `pnpm --filter @aesthetic-function/watcher ast:report <file>` | Run AST diff report |
| `pnpm --filter @aesthetic-function/watcher feasibility:report <file>` | Run feasibility analysis |

---

## Protocol Version

Current: `0.1.0`

All messages include a `protocolVersion` field for compatibility checking.
