# Aesthetic Function

A bidirectional Code ↔ Design synchronization system for React and Figma. The pipeline is deterministic by default, using `@figma` comment markers to extract design intent. An optional LLM-based analyzer can be enabled via feature flag, with automatic fallback to marker parsing on failure.

This is an **MVP / patent prototype**. It prioritizes determinism, testability, and safety over feature completeness.

---

## What Works Today (Phase 13F)

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
| **Figma Composition Suggestions (Phase 11A)** | |
| Read-only Figma composition guidance | ✅ |
| Component Set suggestions (missing from map) | ✅ |
| Explicit-only variant suggestions (markers/overrides) | ✅ |
| Property suggestions (Fill, Auto Layout, Corner Radius) | ✅ |
| Token usage suggestions | ✅ |
| Coverage gap suggestions | ✅ |
| Deterministic, sorted output | ✅ |
| CLI integration (`ast:report` output) | ✅ |
| **Figma Composition Application (Phase 11B)** | |
| Compose operations from suggestions | ✅ |
| Opt-in apply mode (dry-run default) | ✅ |
| Feature flags (mode, allow-list) | ✅ |
| Deterministic opId hashing | ✅ |
| Server /compose endpoint | ✅ |
| Plugin COMPOSE_OPERATIONS handler | ✅ |
| Full audit trail logging | ✅ |
| CLI `figma:compose` command | ✅ |
| **Figma Property Application (Phase 11C)** | |
| Apply properties to existing Figma nodes | ✅ |
| Opt-in apply mode (artifact-only default) | ✅ |
| Feature flags (mode, dry-run, allow-list) | ✅ |
| Property categories (fill, spacing, typography) | ✅ |
| Deterministic opId hashing | ✅ |
| Server /apply-properties endpoint | ✅ |
| Plugin APPLY_PROPERTIES handler | ✅ |
| CLI `figma:apply` command | ✅ |
| Variant-aware apply targeting (Phase 11C.1) | ✅ |
| Text-descendant resolution for text props | ✅ |
| **Figma → Code Delta Detection (Phase 12A)** | |
| Delta detection: Figma state vs code baseline | ✅ |
| Canonical token resolution for both sides | ✅ |
| Normalization notes for aliased values | ✅ |
| Confidence scoring (high/medium/low) | ✅ |
| Per-property delta types (fill, padding, gap) | ✅ |
| Batch processing for multiple components | ✅ |
| Delta artifact generation | ✅ |
| CLI output (read-only, no file writes) | ✅ |
| **Figma Delta Suggestions (Phase 12B)** | |
| Suggestion layer for delta application | ✅ |
| Target selection: AST / marker / override / blocked | ✅ |
| Non-base state policy (never AST writes) | ✅ |
| Base state AST write detection (auto-writable) | ✅ |
| Deterministic, sorted output | ✅ |
| Suggestion artifact generation | ✅ |
| CLI integration (`ast:report` output) | ✅ |
| **Figma Delta Application (Phase 12C)** | |
| Apply delta suggestions to storage targets | ✅ |
| Target routing: AST / marker / override / blocked | ✅ |
| Override writes (state-aware keys) | ✅ |
| Marker updates (existing markers only) | ✅ |
| AST writes (auto-writable literals only) | ✅ |
| Confidence threshold filtering | ✅ |
| Allow-list based target filtering | ✅ |
| Dry-run mode (default, no writes) | ✅ |
| Opt-in apply mode (requires env flags) | ✅ |
| Delta apply artifact generation | ✅ |
| Audit trail logging | ✅ |
| CLI `figma:delta-apply` command | ✅ |
| **Conflict Surfacing & Preview (Phase 12D)** | |
| Conflict detection: AST vs Figma vs markers vs overrides | ✅ |
| Conflict types: AST_VS_FIGMA, MARKER_VS_FIGMA, OVERRIDE_VS_FIGMA | ✅ |
| Canonical mismatch detection | ✅ |
| Non-base state blocking | ✅ |
| Low confidence blocking | ✅ |
| Conflict evidence with source locations | ✅ |
| Policy rule explanations | ✅ |
| Conflict artifact generation (.figma-conflicts.json) | ✅ |
| CLI conflict preview section | ✅ |
| Read-only (no file modifications) | ✅ |
| **Guided Conflict Resolution (Phase 12E)** | |
| Resolution plan generation from conflicts | ✅ |
| Resolution actions: APPLY_TO_AST, APPLY_TO_MARKER, APPLY_TO_OVERRIDE, IGNORE, BLOCK | ✅ |
| Human-readable reason explanations | ✅ |
| Deterministic decision ordering | ✅ |
| Resolution artifact generation (.figma-resolution-plan.json) | ✅ |
| CLI `figma:resolve` command | ✅ |
| Read-only (produces plan, does NOT apply) | ✅ |
| **Apply Resolution Plans (Phase 12F)** | |
| Execute resolution plans from Phase 12E | ✅ |
| Target routing: AST / marker / override / blocked | ✅ |
| Opt-in apply mode (artifact-only default) | ✅ |
| Multi-flag gate (ON + MODE=apply + DRY_RUN=false) | ✅ |
| Allow-list based target filtering | ✅ |
| Non-base state AST blocking | ✅ |
| Confidence threshold filtering | ✅ |
| Decision ID traceability | ✅ |
| Apply artifact generation (.figma-resolve-apply.json) | ✅ |
| Audit trail logging | ✅ |
| CLI `figma:resolve-apply` command | ✅ |
| **Post-Apply Verification (Phase 12G)** | |
| Verify applied resolutions landed as intended | ✅ |
| AST/marker/override target verification | ✅ |
| Optional Figma read-only verification | ✅ |
| Mismatch and missing detection | ✅ |
| Rollback information capture | ✅ |
| Verification artifact generation (.figma-verification.json) | ✅ |
| CI-safe exit codes (0 = pass, 1 = fail) | ✅ |
| CLI `figma:verify` command | ✅ |
| **Post-Apply Auto-Verification + CI Gate (Phase 12H)** | |
| Automatic verification after apply operations | ✅ |
| POST_APPLY_VERIFY environment variable control | ✅ |
| Strict mode CI gating (exit 1 on mismatch/missing) | ✅ |
| Non-strict mode for advisory-only verification | ✅ |
| Bidirectional artifact linking (apply ↔ verify) | ✅ |
| Seamless CLI integration (`figma:resolve-apply`) | ✅ |
| **Rollback Preview & Safety Envelope (Phase 12I)** | |
| Read-only rollback preview generation | ✅ |
| Derive rollback actions from verification failures | ✅ |
| Deterministic ordering (componentKey → state → property) | ✅ |
| Mixed target support (ast, marker, override) | ✅ |
| Rollback preview artifact (.figma-rollback-preview.json) | ✅ |
| CLI `figma:rollback-preview` command | ✅ |
| Always exit 0 (never fails CI, diagnostic only) | ✅ |
| **Reconciliation Status Artifact (Phase 12J)** | |
| Single deterministic status artifact per file | ✅ |
| Auto-discover artifacts from Phases 12F-12I | ✅ |
| OverallStatus: CLEAN, APPLIED_UNVERIFIED, VERIFIED_OK, VERIFY_FAILED, ROLLBACK_AVAILABLE | ✅ |
| CI Verdict: PASS, WARN, FAIL with exit codes | ✅ |
| CLI `figma:status` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| Rule-table only, no heuristics | ✅ |
| **Reconciliation Run Index (Phase 13A)** | |
| Read-only indexing of reconciliation artifacts | ✅ |
| Indexes all phases: delta, suggestions, conflicts, plans, apply, verify, rollback, status | ✅ |
| One-shot snapshot (NOT timeline/history) | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| Deterministic output (sorted, stable, canonical paths) | ✅ |
| Metadata extraction (timestamps, modes, counts) | ✅ |
| Best-candidate selection for multiple artifacts | ✅ |
| Legacy artifact name support | ✅ |
| CLI `figma:index` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| **Design Drift Timeline (Phase 13B)** | |
| Append-only run ledger (.figma-run-ledger.json) | ✅ |
| Deterministic run ID hashing (djb2) | ✅ |
| Longitudinal run history per file | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| Feature flag gated (RECONCILIATION_TIMELINE_ON) | ✅ |
| Automatic recording on command completion | ✅ |
| CLI `figma:timeline` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| **Drift Diffs (Phase 13C)** | |
| Run-to-run comparison (.figma-drift-diff.json) | ✅ |
| Severity classification (info/warn/fail) | ✅ |
| Status worsening detection | ✅ |
| Metric delta computation | ✅ |
| Run selection (latest vs previous, explicit IDs) | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| CLI `figma:drift` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| **Drift Diff UX Hardening (Phase 13C.1)** | |
| Preconditions banner (repo root, source paths, ledger, runs) | ✅ |
| Run selection explanation (--explain flag) | ✅ |
| Deterministic "no material drift" messaging | ✅ |
| Strict exit code (--strict: exit 1 if 'fail' severity) | ✅ |
| Presentation ordering (severity → field → deterministic) | ✅ |
| **Drift Summary Dashboard (Phase 13D)** | |
| Aggregated drift dashboard (.figma-drift-dashboard.json) | ✅ |
| Stability score (0-100, deterministic rule-table) | ✅ |
| Severity counts (info/warn/fail across run window) | ✅ |
| Top drift signals (sorted by severity, delta) | ✅ |
| CI verdict (PASS/WARN/FAIL) with configurable thresholds | ✅ |
| Configurable run window (--limit, --from, --to) | ✅ |
| CI strict mode (--strict, exit 1 on FAIL) | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| CLI `figma:dashboard` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| **Project Drift Dashboard (Phase 13E)** | |
| Directory-level drift aggregation (.figma-project-dashboard.json) | ✅ |
| File discovery with configurable patterns (**/*.tsx) | ✅ |
| Exclusion of node_modules, dist, build, .next, .turbo, .git, coverage | ✅ |
| Per-file dashboard status (OK, NO_DATA, ERROR) | ✅ |
| Project stability score (average of files with data) | ✅ |
| Project verdict (FAIL if any file FAIL, else WARN if any file WARN, else PASS) | ✅ |
| Top signals across project (sorted by severity → magnitude → file → key) | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| CI strict mode (--strict, exit 1 on FAIL) | ✅ |
| CLI `figma:project-dashboard` command | ✅ |
| Human-readable and JSON output formats | ✅ |
| **CI Gate Summary (Phase 13F)** | |
| CI-focused gate command (.figma-ci-gate.json) | ✅ |
| Reuses Phase 13E project dashboard data | ✅ |
| Trend window from Phase 13B ledgers (default: 5 runs) | ✅ |
| Trend direction classification (improving/stable/worsening) | ✅ |
| File trend counts (improving, stable, worsening, insufficient data) | ✅ |
| Configurable window size (--window, env: RECONCILIATION_CI_WINDOW) | ✅ |
| CI strict mode (--strict, exit 1 on FAIL) | ✅ |
| Repo-root invariant (works from any working directory) | ✅ |
| CLI `figma:ci` command | ✅ |
| Human-readable and JSON output formats | ✅ |
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
| **Phase 10F** | Canonical Resolver + Coverage Reporting | ✅ |
| **Phase 10G** | Resolution Policy + Project-Level Coverage | ✅ |
| **Phase 11A** | Figma Composition Suggestions (Read-Only) | ✅ |
| **Phase 11B** | Figma Composition Application (Opt-In, Auditable) | ✅ |
| **Phase 11C** | Figma Property Application (Opt-In, Scoped, Auditable) | ✅ |
| **Phase 12A** | Figma → Code Delta Detection (Read-Only) | ✅ |
| **Phase 12B** | Figma Delta Suggestions (Target Selection) | ✅ |
| **Phase 12C** | Figma Delta Application (Opt-In, Auditable) | ✅ |
| **Phase 12D** | Conflict Surfacing & Resolution Preview (Read-Only) | ✅ |
| **Phase 12E** | Guided Conflict Resolution Plans (Read-Only) | ✅ |
| **Phase 12F** | Apply Resolution Plans (Opt-In, Auditable) | ✅ |
| **Phase 12G** | Post-Apply Verification (CI-Safe) | ✅ |
| **Phase 12H** | Post-Apply Auto-Verification + CI Gate | ✅ |
| **Phase 12I** | Rollback Preview & Safety Envelope (Read-Only) | ✅ |
| **Phase 12J** | Reconciliation Lifecycle Status Artifact | ✅ |
| **Phase 13A** | Reconciliation Run Index (Read-Only, Deterministic) | ✅ |
| **Phase 13B** | Design Drift Timeline (Append-Only Run Ledger) | ✅ |
| **Phase 13C** | Drift Diffs (Run-to-Run Comparison) | ✅ |
| **Phase 13D** | Drift Summary Dashboard (Aggregated + CI-friendly) | ✅ |
| **Phase 13E** | Project Drift Dashboard (Multi-File Aggregation) | ✅ |
| **Phase 13F** | CI Gate Summary + Trend Window (Read-Only) | ✅ |

### Not Implemented Yet

| Feature | Status |
|---------|--------|
| Conflict resolution UI | ❌ |
| Layout/spacing operations | ❌ |
| Background reconciliation | ❌ |

The current implementation includes full AST-based mutation (Phase 7A/7B) with unified reconciliation policy (Phase 7C), variant/state mapping (Phase 8A), native Figma variant targeting (Phase 8B), stable ID mapping via component-map.json (Phase 8C), Feature Orchestrator with immediate Figma refresh (Phase 9A/9B), production hardening with test stability guardrails (Phase 9C/9D), framework-agnostic semantic adapter architecture with Vuetify support (Phase 10A), Ant Design adapter proving registry extensibility (Phase 10B), read-only component map suggestions (Phase 10C), bootstrap artifacts with safe apply mode (Phase 10D), canonical token layer for cross-adapter normalization (Phase 10E), canonical resolver with coverage reporting (Phase 10F), resolution policy with project-level coverage (Phase 10G), read-only Figma composition suggestions (Phase 11A), controlled Figma composition application with opt-in apply mode (Phase 11B), property application to existing Figma nodes with category-scoped allow-lists (Phase 11C), Figma → Code delta detection with canonical token resolution (Phase 12A), delta suggestion layer with target selection (Phase 12B), delta application with confidence-based filtering (Phase 12C), conflict surfacing with resolution preview (Phase 12D), guided conflict resolution plans with human-reviewable decisions (Phase 12E), and controlled resolution plan application with multi-flag gate (Phase 12F). Echo suppression prevents feedback loops when AST writes trigger file save events.

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

### Figma Composition Suggestions (Phase 11A)

Phase 11A adds **read-only Figma composition guidance** that translates canonical design semantics into actionable suggestions for Figma.

This phase answers: **"Given what the code semantically expresses, what should exist in Figma?"**

It does NOT create anything—only describes it deterministically.

#### Suggestion Types

| Type | Description | Example |
|------|-------------|---------|
| `component-set` | Suggest creating a new Component Set | "Create LoginButton for componentKey auth/LoginButton" |
| `variant` | Suggest adding a variant (explicit-only) | "Component Set LoginButton should include variant hover" |
| `property` | Suggest Figma property mapping | "Component uses color.primary → map to Fill style" |
| `token-usage` | Suggest using design token | "Use token color.primary instead of hard-coded #3B82F6" |
| `coverage-gap` | Highlight missing coverage | "No spacing token resolved for space.xl" |

#### Suggestion Rules

**Component Set Suggestions**
- Component has canonical semantics
- Component NOT in component-map.json
- → Suggest creating a Component Set

**Variant Suggestions (Explicit Only)**
- ONLY from `@figma state=X` markers
- ONLY from `design-overrides.json ::state` keys
- NEVER inferred from disabled booleans or hover styles

**Property Suggestions**
- From canonical semantics:
  - color → Fill property
  - spacing → Auto Layout Gap/Padding
  - radius → Corner Radius
  - typography → Text Style

**Token Usage Suggestions**
- When canonical tokens resolve cleanly with high confidence
- Suggests using token instead of hard-coded values

**Coverage Gap Suggestions**
- From Phase 10F/10G gaps
- From policy violations

#### CLI Output

The `ast:report` command now includes Figma composition suggestions:

```
============================================================
FIGMA COMPOSITION SUGGESTIONS (Phase 11A)
============================================================
  [NEW COMPONENT SET]
    - Login Button (LoginButton)

  [VARIANTS]
    - LoginButton: [hover, disabled]

  [TOKEN USAGE]
    - Fill → color.primary
    - Auto Layout → space.md

  [PROPERTIES]
    - [LoginButton] Fill: color.primary
    - [Container] Auto Layout Gap: space.lg

  [COVERAGE GAPS]
    - Missing typography token for text.size.3xl

  Summary: 8 suggestions
    By type: 1 component-sets, 2 variants, 2 properties, 2 token-usage, 1 coverage-gaps
    By source: 7 canonical, 0 adapter, 1 policy, 0 coverage
```

#### Suggestion Sources

| Source | Description |
|--------|-------------|
| `canonical` | From canonical semantic normalization (Phase 10E) |
| `adapter` | From framework adapter semantics (Phase 10A) |
| `policy` | From resolution policy analysis (Phase 10G) |
| `coverage` | From coverage gap detection (Phase 10F) |

#### Scope & Constraints

Phase 11A is **read-only** and does NOT:
- Modify TSX/JSX source files
- Write markers or overrides
- Modify component-map.json
- Emit Figma operations
- Call materializers
- Change orchestrator behavior
- Change canonical normalization or resolution logic

---

## Figma Composition Application (Phase 11B)

Phase 11B transforms Phase 11A's read-only suggestions into actionable **compose operations** that can be applied to Figma with explicit opt-in and full audit logging.

### Overview

Building on Phase 11A suggestions, this phase provides:

1. **Compose Operations** - Deterministic, auditable operations for Figma modifications
2. **Opt-In Apply Mode** - Dry-run by default, apply only with explicit flags
3. **Feature Flags** - Fine-grained control over what can be composed
4. **Audit Trail** - Full logging of all compose operations to sync-log.md
5. **CLI Integration** - `figma:compose` command for automation

### Compose Operation Types

| Type | Description | Payload |
|------|-------------|---------|
| `ENSURE_COMPONENT_SET` | Create missing Component Set | `{ name }` |
| `ENSURE_VARIANT` | Add variant to Component Set | `{ setName, variantProps }` |
| `ENSURE_PROPERTY_DEF` | Define property on Component Set | `{ setName, propertyName, propertyType, defaultValue? }` |

### Feature Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `FIGMA_COMPOSE_ON` | `true`/`false` | `false` | Master enable switch |
| `FIGMA_COMPOSE_MODE` | `off`/`dry-run`/`apply` | `off` | Execution mode |
| `FIGMA_COMPOSE_ALLOW` | comma-separated | (all allowed) | Operation type allow-list |
| `FIGMA_COMPOSE_SERVER` | URL | `http://localhost:3001` | Server endpoint |

**Allow-list values:** `component-set`, `variant`, `property`

### CLI Usage

```bash
# Generate compose artifact (dry-run, no Figma changes)
pnpm --filter @aesthetic-function/watcher figma:compose demo-app/src/App.tsx

# Apply operations to Figma (requires FIGMA_COMPOSE_ON=true, server + plugin running)
FIGMA_COMPOSE_ON=true FIGMA_COMPOSE_MODE=apply \
  pnpm --filter @aesthetic-function/watcher figma:compose demo-app/src/App.tsx --apply

# Restrict to only component-set operations
FIGMA_COMPOSE_ALLOW=component-set \
  pnpm --filter @aesthetic-function/watcher figma:compose demo-app/src/App.tsx --apply
```

### Compose Artifact

Artifacts are written to `design-materializations/` with naming:

```
<file-path>.compose.json
```

Example artifact structure:

```json
{
  "sourceFile": "demo-app/src/App.tsx",
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "mode": "dry-run",
  "operations": [
    {
      "opId": "abc123def",
      "type": "ENSURE_COMPONENT_SET",
      "componentKey": "PrimaryButton",
      "figmaName": "PrimaryButton",
      "payload": { "name": "PrimaryButton" },
      "reason": "Component in code missing from component-map",
      "source": "figma-suggestions"
    }
  ],
  "summary": {
    "total": 1,
    "byType": { "ENSURE_COMPONENT_SET": 1 }
  }
}
```

### Deterministic Operation IDs

Each operation receives a deterministic `opId` generated via djb2 hash of:
- Operation type
- Component key
- Figma name
- Stringified payload

This ensures:
- **Idempotency** - Same inputs produce same opId
- **Deduplication** - Operations can be compared across runs
- **Traceability** - Operations can be tracked through the system

### Server Endpoint

The `/compose` endpoint accepts compose artifacts:

```bash
curl -X POST http://localhost:3001/compose \
  -H "Content-Type: application/json" \
  -d @design-materializations/demo-app__src__App.compose.json
```

The endpoint:
1. Validates the artifact structure
2. Logs the request to sync-log.md via `logCompose()`
3. Broadcasts `COMPOSE_OPERATIONS` to connected Figma plugins
4. Returns the number of operations dispatched

### Plugin Behavior

When the Figma plugin receives `COMPOSE_OPERATIONS`:

1. **ENSURE_COMPONENT_SET** - Searches for existing Component Set by name, creates if missing using `combineAsVariants()`
2. **ENSURE_VARIANT** - Finds target Component Set, checks for existing variant by props, adds if missing
3. **ENSURE_PROPERTY_DEF** - Adds component property definition if not present

The plugin returns `COMPOSE_RESULT` with per-operation success/failure status.

### Audit Logging

All compose operations are logged to sync-log.md:

```markdown
| 2025-01-15T10:30:00.000Z | compose | demo-app/src/App.tsx | dry-run | 3 ops | ENSURE_COMPONENT_SET,ENSURE_VARIANT |
```

Fields logged:
- Timestamp
- Event type (`compose`)
- Source file
- Mode (`dry-run` or `apply`)
- Operation count
- Operation types

### Safety Guarantees

1. **Dry-run by default** - No Figma changes without explicit `--apply` flag
2. **Master switch** - `FIGMA_COMPOSE_ON` must be `true` for server dispatch
3. **Allow-list** - `FIGMA_COMPOSE_ALLOW` restricts operation types
4. **Idempotent** - Operations check for existing elements before creating
5. **Auditable** - Full trail in sync-log.md and compose artifacts

---

## Figma Property Application (Phase 11C)

Phase 11C applies resolved canonical semantics (from Phase 10F/10G) to existing Figma structures. Unlike Phase 11B which creates new Component Sets and variants, this phase **only applies properties** to nodes that already exist.

### Overview

Building on the canonical resolution pipeline:

1. **Property Application** - Apply colors, spacing, and typography to existing nodes
2. **Explicit Targeting** - Only nodes with stable IDs in component-map.json
3. **Category Allow-List** - Fine-grained control over property types
4. **Opt-In Apply Mode** - Artifact-only by default
5. **Audit Trail** - Full logging of all apply operations
6. **Variant-Aware Targeting** - Ops target variant nodeIds, never Component Sets (Phase 11C.1)
7. **Text-Descendant Resolution** - Text props auto-resolve to TEXT node descendants (Phase 11C.1)

### Variant-Aware Targeting (Phase 11C.1)

Apply operations target the correct variant nodeId rather than the Component Set:

- **Component Sets** are containers and should never receive visual properties directly
- When `ComponentKey::state` is specified (e.g., `LoginButton::hover`), the variant nodeId for that state is used
- `getVariantNodeId(componentMap, componentKey, state?)` returns `{ nodeId, state, fromVariant }`
- If no variant exists for the requested state, a `missing-variant-id` violation is created (no fallback to Component Set)
- State name fallback: `base` ↔ `default` for compatibility

### Text-Descendant Resolution (Phase 11C.1)

Text properties (`fontSize`, `fontWeight`, `textColor`) require a TEXT node, but apply ops often target containers:

- **Plugin auto-resolution**: `findTextDescendant(node)` finds the first TEXT node within a container (depth-first)
- If the target node is not a TEXT node, the plugin searches for a TEXT descendant
- Console logs show which TEXT node was actually modified: `Applied fontSize to TEXT node 23:45 (target was 23:27)`
- Falls back gracefully if no TEXT node is found

### Property Types

| Property | Category | Figma Operation |
|----------|----------|-----------------|
| `fill` | fill | Set background/foreground color |
| `textColor` | fill | Set text fill color |
| `padding` | spacing | Set Auto Layout padding |
| `gap` | spacing | Set Auto Layout item spacing |
| `width` | spacing | Set node width (if already defined) |
| `height` | spacing | Set node height (if already defined) |
| `fontSize` | typography | Set text font size |
| `fontWeight` | typography | Set text font weight |

### Feature Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `FIGMA_APPLY_ON` | `true`/`false` | `false` | Master enable switch |
| `FIGMA_APPLY_MODE` | `artifact`/`apply` | `artifact` | Execution mode |
| `FIGMA_APPLY_DRY_RUN` | `true`/`false` | `true` | Dry-run mode (apply only) |
| `FIGMA_APPLY_ALLOW` | comma-separated | (none) | Property category allow-list |
| `FIGMA_APPLY_SERVER` | URL | `http://localhost:3001` | Server endpoint |
| `FIGMA_APPLY_MIN_CONFIDENCE` | `low`/`medium`/`high` | `high` | Minimum confidence threshold |

**Allow-list values:** `fill`, `spacing`, `typography`

### CLI Usage

```bash
# Generate apply artifact (artifact-only, no Figma changes)
pnpm --filter @aesthetic-function/watcher figma:apply demo-app/src/App.tsx

# Apply properties to Figma (requires full opt-in)
FIGMA_APPLY_ON=true FIGMA_APPLY_MODE=apply FIGMA_APPLY_DRY_RUN=false \
  FIGMA_APPLY_ALLOW=fill,spacing \
  pnpm --filter @aesthetic-function/watcher figma:apply demo-app/src/App.tsx --apply

# Verbose output
pnpm --filter @aesthetic-function/watcher figma:apply demo-app/src/App.tsx --verbose
```

### Apply Artifact

Artifacts are written to `design-materializations/` with naming:

```
<file-path>.figma-apply.json
```

Example artifact structure:

```json
{
  "version": "1.0",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "sourceFile": "demo-app/src/App.tsx",
  "mode": "artifact",
  "dryRun": true,
  "operations": [
    {
      "opId": "apply-abc123",
      "nodeId": "CS:btn-123",
      "componentKey": "Button",
      "property": "fill",
      "to": "#3498db",
      "canonicalSource": "color.primary.500",
      "confidence": "high",
      "source": "canonical-resolution",
      "reason": "Apply resolved color color.primary.500"
    }
  ],
  "violations": [
    {
      "type": "property-not-allowed",
      "componentKey": "Card",
      "property": "padding",
      "message": "Property category 'spacing' not in FIGMA_APPLY_ALLOW"
    }
  ],
  "summary": {
    "totalOperations": 1,
    "byProperty": { "fill": 1 },
    "totalViolations": 1,
    "byViolationType": { "property-not-allowed": 1 }
  }
}
```

### Policy Violations

Operations may be rejected for several reasons:

| Violation Type | Description |
|----------------|-------------|
| `missing-node-id` | Node not found in component-map.json |
| `property-not-allowed` | Property category not in FIGMA_APPLY_ALLOW |
| `no-canonical-source` | No canonical token for this property |
| `low-confidence` | Confidence below FIGMA_APPLY_MIN_CONFIDENCE |
| `value-unchanged` | Current value matches target (idempotency) |

### Server Endpoint

The `/apply-properties` endpoint accepts apply operations:

```bash
curl -X POST http://localhost:3001/apply-properties \
  -H "Content-Type: application/json" \
  -d '{"operations": [...], "mode": "apply"}'
```

The endpoint:
1. Validates the request
2. Logs to sync-log.md via `logApplyProperties()`
3. In dry-run mode: returns operations without sending to plugin
4. In apply mode: broadcasts `APPLY_PROPERTIES` to connected plugins
5. Returns operation results

### Plugin Behavior

When the Figma plugin receives `APPLY_PROPERTIES`:

1. **Locate Node** - Uses `figma.getNodeById()` with the nodeId
2. **Validate Node Type** - Ensures node supports the property
3. **Apply Property** - Sets the appropriate property value:
   - `fill`: Sets fills array with solid color
   - `textColor`: Sets fills on TextNode
   - `padding/gap`: Sets Auto Layout properties
   - `fontSize/fontWeight`: Sets text style properties
4. **Return Result** - Reports success/failure per operation

The plugin returns `APPLY_PROPERTIES_RESULT` with per-operation status.

### Audit Logging

Apply operations are logged to sync-log.md:

```markdown
| 2025-01-15T10:30:00.000Z | apply-properties | demo-app/src/App.tsx | apply | 3 ops | fill(2),fontSize(1) |
```

### Safety Guarantees

1. **Artifact-only by default** - Mode defaults to 'artifact'
2. **Dry-run by default** - FIGMA_APPLY_DRY_RUN defaults to true
3. **Master switch** - FIGMA_APPLY_ON must be true for server dispatch
4. **Category allow-list** - FIGMA_APPLY_ALLOW restricts property types
5. **Explicit targeting only** - Only nodes in component-map.json
6. **Confidence threshold** - FIGMA_APPLY_MIN_CONFIDENCE filters low-confidence
7. **Idempotent** - Repeated runs produce same opIds, no duplicate changes
8. **Auditable** - Full trail in sync-log.md and apply artifacts

### Differences from Phase 11B

| Aspect | Phase 11B (Compose) | Phase 11C (Apply) |
|--------|---------------------|-------------------|
| Purpose | Create new structure | Apply properties to existing |
| Target | Missing Component Sets/Variants | Existing nodes with stable IDs |
| Operations | ENSURE_* | Property assignments |
| Allow-list | Operation types | Property categories |
| Creates nodes | Yes | No |

---

## Guided Conflict Resolution (Phase 12D/12E)

Phase 12D/12E introduces a guided resolution layer that surfaces conflicts between Figma and code, then proposes explicit, auditable resolution plans.

### Key Principles

- **No automatic resolution** - Plans are proposals, not executions
- **No silent writes** - All changes require explicit approval
- **No inference beyond existing policy** - Uses same rules as Phase 12B/12C
- **Everything explicit, reviewable, and reversible**

### Conflict Types (Phase 12D)

| Type | Description |
|------|-------------|
| `AST_VS_FIGMA` | AST literal differs from Figma value |
| `MARKER_VS_FIGMA` | Marker attribute differs from Figma value |
| `OVERRIDE_VS_FIGMA` | Override entry differs from Figma value |
| `CANONICAL_MISMATCH` | Raw values match but canonical tokens differ |
| `UNMAPPED_VARIANT` | Variant nodeId not found in component map |
| `NON_BASE_STATE_BLOCKED` | Non-base state without explicit data |
| `LOW_CONFIDENCE_BLOCKED` | Delta confidence too low for auto-apply |

### Resolution Actions (Phase 12E)

| Action | Description |
|--------|-------------|
| `APPLY_TO_AST` | Write value directly to AST literal |
| `APPLY_TO_MARKER` | Update @figma marker line |
| `APPLY_TO_OVERRIDE` | Write to design-overrides.json |
| `IGNORE` | Skip this conflict (user must decide) |
| `BLOCK` | Cannot resolve automatically |

### Default Resolution Rules

| Conflict Scenario | Default Resolution |
|-------------------|--------------------|
| AST auto-writable base state | APPLY_TO_AST |
| Non-base state with explicit marker | APPLY_TO_MARKER |
| Non-base state with existing override | APPLY_TO_OVERRIDE |
| Non-base state, no explicit data | BLOCK |
| Unsafe AST write | APPLY_TO_OVERRIDE |
| Canonical mismatch | IGNORE |
| Low confidence | BLOCK |

### CLI Commands

```bash
# Generate resolution plan for a file
pnpm --filter @aesthetic-function/watcher figma:resolve demo-app/src/App.tsx

# Full report including conflict preview (in ast:report)
pnpm --filter @aesthetic-function/watcher ast:report demo-app/src/App.tsx
```

### CLI Output

```
=== CONFLICT RESOLUTION PLAN (Phase 12E) ===

  Component: LoginButton
  State: hover

    Property: fill
    Conflict: LoginButton::hover::fill
    Suggested Resolution: APPLY_TO_MARKER
    Reason: Non-base state (hover) with explicit marker present

  Summary:
    - Apply to AST: 1
    - Apply to Marker: 2
    - Apply to Override: 0
    - Ignored: 1
    - Blocked: 1

  Resolution plan written to:
    design-materializations/demo-app__src__App.figma-resolution-plan.json
```

### Artifact Files

| File Pattern | Phase | Content |
|--------------|-------|---------|
| `*.figma-conflicts.json` | 12D | Conflict analysis with evidence |
| `*.figma-resolution-plan.json` | 12E | Resolution decisions with reasons |

### Example Resolution Plan Artifact

```json
{
  "version": "1.0",
  "source": "figma-resolution-plan",
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "sourceFile": "demo-app/src/App.tsx",
  "summary": {
    "applyAst": 1,
    "applyMarker": 2,
    "applyOverride": 0,
    "ignored": 0,
    "blocked": 1
  },
  "decisions": [
    {
      "componentKey": "LoginButton",
      "targetState": "base",
      "property": "fill",
      "action": "APPLY_TO_AST",
      "reason": "Base state with auto-writable fill literal in AST",
      "sourceConflictId": "LoginButton::base::fill"
    }
  ]
}
```

### What Phase 12E Does NOT Do

- **Does NOT modify TSX/JSX** - Resolution plans are proposals only
- **Does NOT modify markers** - No automatic marker updates
- **Does NOT modify design-overrides.json** - No override writes
- **Does NOT emit Figma operations** - Read-only analysis
- **Does NOT apply changes** - Phase 12F is the executor

---

## Apply Resolution Plans (Phase 12F)

Phase 12F provides the controlled execution layer that takes Phase 12E resolution plans and applies them to the correct targets.

### Key Principles

- **Artifact-only by default** - No mutations without explicit opt-in
- **Multi-flag gate** - Requires all three flags: ON + MODE=apply + DRY_RUN=false
- **Allow-list enforcement** - Only enabled targets can be written
- **Non-base state AST blocking** - Hover/pressed/disabled states never get AST writes
- **Deterministic execution** - Same plan → same operations → same artifacts
- **Full traceability** - Decision IDs link artifacts to source conflicts

### Environment Variables

| Variable | Default | Values | Description |
|----------|---------|--------|-------------|
| `FIGMA_RESOLVE_APPLY_ON` | `false` | `true`/`false` | Master switch |
| `FIGMA_RESOLVE_APPLY_MODE` | `artifact` | `artifact`/`apply` | Artifact-only or apply |
| `FIGMA_RESOLVE_APPLY_DRY_RUN` | `true` | `true`/`false` | Dry-run mode |
| `FIGMA_RESOLVE_APPLY_ALLOW` | `ast,marker,override` | CSV list | Allowed targets |
| `FIGMA_RESOLVE_APPLY_MIN_CONFIDENCE` | `high` | `low`/`medium`/`high` | Min confidence |
| `FIGMA_RESOLVE_PLAN_PATH` | (auto) | File path | Custom plan path |

### CLI Commands

```bash
# Preview what would be applied (artifact-only, default)
pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx

# Apply with explicit flags (still respects env var gates)
pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# Full apply (all flags enabled)
FIGMA_RESOLVE_APPLY_ON=true FIGMA_RESOLVE_APPLY_MODE=apply FIGMA_RESOLVE_APPLY_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# Apply from custom plan artifact
pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx \
  --from .aesthetic-function/artifacts/my-custom-plan.json

# Filter by component or state
pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx \
  --component LoginButton --state base
```

### Apply Result Statuses

| Status | Description |
|--------|-------------|
| `applied` | Successfully written to target |
| `noop` | Target already matches intended value |
| `skipped` | Skipped due to IGNORE/BLOCK or filter |
| `blocked` | Policy/precondition prevented apply |
| `failed` | Attempted but errored |

### Professional Runbook

Complete workflow for resolving conflicts:

```bash
# 1. Generate conflict report and resolution plan
pnpm --filter @aesthetic-function/watcher figma:resolve demo-app/src/App.tsx

# 2. Review the generated plan artifact
cat .aesthetic-function/artifacts/demo-app/App.figma-resolution-plan.json

# 3. Preview what would be applied (artifact-only)
pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx

# 4. Apply with full flags (when ready)
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
FIGMA_RESOLVE_APPLY_ALLOW=override,marker \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# 5. Verify applied changes
git diff demo-app/src/App.tsx
cat .aesthetic-function/design-overrides.json
```

### Artifact Files

| File Pattern | Phase | Content |
|--------------|-------|---------|
| `*.figma-resolution-plan.json` | 12E | Resolution decisions with reasons |
| `*.figma-resolve-apply.json` | 12F | Apply results with decision IDs |

### Example Apply Artifact

```json
{
  "version": "1.0",
  "source": "figma-resolution-apply",
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "sourceFile": "demo-app/src/App.tsx",
  "planPath": ".aesthetic-function/artifacts/demo-app/App.figma-resolution-plan.json",
  "mode": "apply",
  "dryRun": false,
  "summary": {
    "decisionsTotal": 4,
    "attempted": 4,
    "applied": 2,
    "noop": 1,
    "skipped": 0,
    "blocked": 0,
    "failed": 1
  },
  "results": [
    {
      "decisionId": "a1b2c3d4e5f6g7h8",
      "componentKey": "LoginButton",
      "targetState": "base",
      "property": "fill",
      "action": "APPLY_TO_AST",
      "target": "ast",
      "success": true,
      "status": "applied",
      "appliedValue": "#FF0000"
    }
  ]
}
```

---

## Post-Apply Verification (Phase 12G)

Phase 12G provides the verification layer that confirms whether applied resolution plans landed as intended.

### Key Principles

- **Verification-only** - No mutations, only observes and records
- **Apply ≠ Trust** - System proves it did what it claimed
- **Detect drift** - Identifies partial failures or external changes
- **CI-safe** - Exit codes suitable for CI gates
- **Rollback preparation** - Captures previous values for future use

### Environment Variables

| Variable | Default | Values | Description |
|----------|---------|--------|-------------|
| `FIGMA_VERIFY_INCLUDE_FIGMA` | `false` | `true`/`false` | Include Figma verification (read-only) |
| `FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT` | `false` | `true`/`false` | Write artifact even on success |
| `FIGMA_SERVER_URL` | `http://localhost:3001` | URL | Server for Figma queries |

### CLI Commands

```bash
# Verify most recent apply (auto-discovers artifacts)
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx

# Verify specific apply artifact
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx \
  --apply-artifact .aesthetic-function/artifacts/demo-app/App.figma-resolve-apply.json

# Always write verification artifact (even on success)
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx --always-write

# Include Figma verification (requires server running)
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx --include-figma
```

### Exit Codes

| Code | Meaning | CI Behavior |
|------|---------|-------------|
| 0 | All verified or skipped | Pass |
| 1 | Any mismatch, missing, or blocked | Fail |

### Verification Statuses

| Status | Description |
|--------|-------------|
| `verified` | Actual value matches expected |
| `mismatch` | Values differ (drift detected) |
| `missing` | Target not found (file, marker, or override) |
| `skipped` | Verification not applicable |
| `blocked` | Could not verify (network error, etc.) |

### Verification Targets

| Target | What is Verified |
|--------|------------------|
| `ast` | Re-read source file and check JSX value at expected location |
| `marker` | Parse markers and verify property value |
| `override` | Parse design-overrides.json and check property |
| `figma` | Query Figma server for current value (optional) |

### Professional Runbook

Complete workflow with verification:

```bash
# 1. Generate and apply resolution plan
pnpm --filter @aesthetic-function/watcher figma:resolve demo-app/src/App.tsx
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# 2. Verify the apply succeeded
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx

# 3. Check verification artifact if failures
cat .aesthetic-function/artifacts/demo-app/App.figma-verification.json

# 4. Use in CI (exit code gates the build)
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx || exit 1
```

### Artifact Files

| File Pattern | Phase | Content |
|--------------|-------|---------|
| `*.figma-resolve-apply.json` | 12F | Apply results with decision IDs |
| `*.figma-verification.json` | 12G | Verification results with evidence |

### Example Verification Artifact

```json
{
  "version": 1,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "file": "demo-app/src/App.tsx",
  "items": [
    {
      "decisionId": "a1b2c3d4e5f6g7h8",
      "componentKey": "LoginButton",
      "targetState": "base",
      "property": "fill",
      "target": "ast",
      "status": "verified",
      "expected": "#FF0000",
      "actual": "#FF0000"
    },
    {
      "decisionId": "b2c3d4e5f6g7h8i9",
      "componentKey": "LoginButton",
      "targetState": "hover",
      "property": "fill",
      "target": "marker",
      "status": "mismatch",
      "expected": "#CC0000",
      "actual": "#00FF00",
      "evidence": {
        "markerText": "// @figma node=LoginButton::hover fill=#00FF00",
        "location": "demo-app/src/App.tsx:42"
      }
    }
  ],
  "summary": {
    "total": 2,
    "verified": 1,
    "mismatch": 1,
    "missing": 0,
    "skipped": 0,
    "blocked": 0
  },
  "rollbackInfo": {
    "a1b2c3d4e5f6g7h8": {
      "previousValue": "#0000FF",
      "target": "ast",
      "location": "demo-app/src/App.tsx:35"
    }
  }
}
```

---

## Post-Apply Auto-Verification + CI Gate (Phase 12H)

Phase 12H introduces an orchestration layer that automatically runs verification after apply operations when explicitly enabled. This creates a seamless apply → verify → exit-code pipeline for CI integration.

### Key Principles

- **Orchestration + Policy only** - No new mutation capabilities beyond Phase 12F
- **Opt-in via environment variable** - Nothing changes unless explicitly enabled
- **CI-safe** - Clear exit semantics for CI gates
- **Artifact linking** - Bidirectional linking between apply and verification artifacts

### Environment Variables

| Variable | Default | Values | Description |
|----------|---------|--------|-------------|
| `POST_APPLY_VERIFY` | `false` | `true`/`false` | Enable automatic verification after apply |
| `POST_APPLY_VERIFY_INCLUDE_FIGMA` | `false` | `true`/`false` | Include Figma verification (read-only) |
| `POST_APPLY_VERIFY_STRICT` | `true` | `true`/`false` | Exit 1 on mismatch/missing (CI gate) |

### When Verification Runs

Verification only runs when **all** conditions are met:

1. `POST_APPLY_VERIFY=true`
2. `FIGMA_RESOLVE_APPLY_MODE=apply` (not artifact-only)
3. `FIGMA_RESOLVE_APPLY_DRY_RUN=false` (actual mutations occurred)

If any condition is not met, verification is skipped with exit code 0.

### Exit Codes

| Scenario | Exit Code | Description |
|----------|-----------|-------------|
| Verification passed | 0 | All items verified or skipped |
| Verification not enabled | 0 | POST_APPLY_VERIFY=false |
| Artifact-only mode | 0 | Mode is 'artifact', no verification |
| Dry-run mode | 0 | DRY_RUN=true, no verification |
| Strict mode + mismatch | 1 | Found mismatches with strict=true |
| Strict mode + missing | 1 | Found missing targets with strict=true |
| Non-strict mode + failure | 0 | Advisory only, no CI failure |

### CLI Usage

Post-apply verification integrates seamlessly with `figma:resolve-apply`:

```bash
# Apply without verification (default)
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# Apply WITH automatic verification (CI mode)
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
POST_APPLY_VERIFY=true \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# Apply with verification but don't fail CI on mismatches (advisory)
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
POST_APPLY_VERIFY=true \
POST_APPLY_VERIFY_STRICT=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# Include Figma verification (requires server)
POST_APPLY_VERIFY=true \
POST_APPLY_VERIFY_INCLUDE_FIGMA=true \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply
```

### Artifact Linking

When post-apply verification runs, artifacts are linked:

**Apply Artifact** includes verification path:
```json
{
  "version": "1.0",
  "source": "figma-resolution-apply",
  "verificationArtifactPath": "design-materializations/src__App.figma-verification.json",
  ...
}
```

**Verification Artifact** includes apply path:
```json
{
  "version": "1.0",
  "source": "figma-verification",
  "applyArtifactPath": "design-materializations/src__App.figma-resolve-apply.json",
  ...
}
```

### CI Integration Example

```yaml
# GitHub Actions example
jobs:
  sync-design:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Apply resolution plan with verification
        run: |
          FIGMA_RESOLVE_APPLY_ON=true \
          FIGMA_RESOLVE_APPLY_MODE=apply \
          FIGMA_RESOLVE_APPLY_DRY_RUN=false \
          POST_APPLY_VERIFY=true \
          POST_APPLY_VERIFY_STRICT=true \
            pnpm --filter @aesthetic-function/watcher figma:resolve-apply src/App.tsx --apply
        # CI will fail if verification finds mismatches

      - name: Upload verification artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: verification-report
          path: design-materializations/*.figma-verification.json
```

### CLI Output

When verification runs:

```
--- Post-Apply Verification (Phase 12H) ---
  enabled:      YES
  includeFigma: NO
  strict:       YES (exit 1 on mismatch)

POST-APPLY VERIFICATION
=======================
  Status: PASSED ✓

  ✓ Verified: 5
  ⚠ Mismatch: 0
  ✗ Missing:  0
  ⏭ Skipped:  1
  ⊘ Blocked:  0

  Artifact: design-materializations/src__App.figma-verification.json

  Exit Code: 0
```

When verification is skipped:

```
--- Post-Apply Verification (Phase 12H) ---
  Status: SKIPPED
  Reason: POST_APPLY_VERIFY is not enabled
```

---

## Rollback Preview & Safety Envelope (Phase 12I)

Phase 12I introduces a read-only rollback preview layer that shows exactly what would be undone if a verification failure were to trigger a rollback — without performing any rollback.

This phase completes the safety triangle:

**Apply → Verify → Rollback Preview**

Rollback execution itself is explicitly out of scope.

### Key Principles

- **Read-only only** - No mutations, only observes and records
- **Deterministic** - Same inputs → same outputs
- **Explicit** - No automatic behavior
- **Diagnostic** - Improves human confidence and CI auditability
- **Always exit 0** - Never fails CI (purely informational)

### CLI Commands

```bash
# Generate rollback preview (auto-discovers artifacts)
pnpm --filter @aesthetic-function/watcher figma:rollback-preview demo-app/src/App.tsx

# Use specific artifact paths
pnpm --filter @aesthetic-function/watcher figma:rollback-preview demo-app/src/App.tsx \
  --apply-artifact design-materializations/custom-apply.json \
  --verify-artifact design-materializations/custom-verify.json
```

### CLI Output

```
=== ROLLBACK PREVIEW (Phase 12I) ===

LoginButton::hover
  fill:
    applied  → #00FF00
    previous → #2563EB
    target   → override
    reason   → mismatch

Summary:
  Total rollback actions: 1
  Targets: override (1)
```

When no rollback is needed:

```
=== ROLLBACK PREVIEW (Phase 12I) ===

No rollback actions needed.
All verification items passed or were skipped.
```

### Rollback Preview Artifact

Pattern: `design-materializations/<file>.figma-rollback-preview.json`

Only written when rollback actions exist.

```json
{
  "version": "1.0",
  "source": "figma-rollback-preview",
  "sourceFile": "src/App.tsx",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "applyArtifactPath": "design-materializations/src__App.figma-resolve-apply.json",
  "verificationArtifactPath": "design-materializations/src__App.figma-verification.json",
  "actions": [
    {
      "actionId": "a1b2c3d4e5f6g7h8",
      "target": "override",
      "componentKey": "LoginButton",
      "targetState": "hover",
      "property": "fill",
      "appliedValue": "#00FF00",
      "previousValue": "#2563EB",
      "sourceApplyOpId": "x1y2z3w4...",
      "verificationStatus": "mismatch",
      "reason": "Verification mismatch: expected #00FF00, observed #FF0000"
    }
  ],
  "summary": {
    "total": 1,
    "byTarget": { "override": 1 },
    "byProperty": { "fill": 1 }
  }
}
```

### Professional Runbook

Complete workflow with rollback preview:

```bash
# 1. Generate and apply resolution plan
pnpm --filter @aesthetic-function/watcher figma:resolve demo-app/src/App.tsx
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# 2. Verify the apply succeeded
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx

# 3. If verification failed, preview what would be rolled back
pnpm --filter @aesthetic-function/watcher figma:rollback-preview demo-app/src/App.tsx

# 4. Review rollback preview artifact
cat design-materializations/demo-app__src__App.figma-rollback-preview.json
```

### Safety Triangle

| Phase | Purpose | Exit Code |
|-------|---------|-----------|
| 12F: Apply | Execute resolution plan | 0 or 1 |
| 12G: Verify | Confirm apply succeeded | 0 or 1 |
| 12I: Rollback Preview | Show what would be undone | Always 0 |
| 12J: Status | Summarize reconciliation lifecycle | 0 (PASS/WARN) or 1 (FAIL) |

---

## Reconciliation Status Artifact (Phase 12J)

Phase 12J completes the reconciliation lifecycle by producing a single, deterministic, human- and CI-readable artifact summarizing the end-to-end reconciliation state for any source file.

### Key Question

**"What is the reconciliation status of this file, right now?"**

The `figma:status` command answers this by:
1. Auto-discovering artifacts from Phases 12F-12I
2. Computing status using a fixed rule-table (no heuristics)
3. Producing a deterministic verdict and exit code

### Status Values

| OverallStatus | Meaning | CiVerdict | Exit Code |
|---------------|---------|-----------|-----------|
| `CLEAN` | No reconciliation artifacts found | PASS | 0 |
| `APPLIED_UNVERIFIED` | Apply attempted, verification not run | WARN | 0 |
| `VERIFIED_OK` | Apply + verification both succeeded | PASS | 0 |
| `VERIFY_FAILED` | Verification failed, no rollback preview | FAIL | 1 |
| `ROLLBACK_AVAILABLE` | Verification failed, rollback preview exists | FAIL | 1 |
| `INCOMPLETE` | Missing or inconsistent artifacts | WARN | 0 |

### Status Determination Rules

| Condition | overallStatus | ciVerdict |
|-----------|---------------|-----------|
| No apply, no deltas | CLEAN | PASS |
| Apply attempted, no verify | APPLIED_UNVERIFIED | WARN |
| Apply + verify success | VERIFIED_OK | PASS |
| Verify failed, rollback preview exists | ROLLBACK_AVAILABLE | FAIL |
| Verify failed, no rollback preview | VERIFY_FAILED | FAIL |
| Missing or inconsistent artifacts | INCOMPLETE | WARN |

### CLI Usage

```bash
# Check status of a file
pnpm --filter @aesthetic-function/watcher figma:status demo-app/src/App.tsx

# JSON output
pnpm --filter @aesthetic-function/watcher figma:status demo-app/src/App.tsx --json

# Write status artifact (only if non-CLEAN)
pnpm --filter @aesthetic-function/watcher figma:status demo-app/src/App.tsx --write
```

### Example Output

```
✅ Reconciliation Status: ✓ VERIFIED_OK

Source: demo-app/src/App.tsx
Timestamp: 2025-01-15T12:00:00.000Z

Phases:
  • Apply: ✓ 5 operation(s)
  • Verify: ✓ 0 mismatch(es), 0 missing
  • Rollback Preview: not generated

Explanation: Apply succeeded and verification passed.

CI Verdict: PASS
Exit Code: 0
```

### Status Artifact

When `--write` is provided and status is non-CLEAN:

```json
{
  "version": "1.0",
  "sourceFile": "demo-app/src/App.tsx",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "phases": {
    "apply": {
      "attempted": true,
      "dryRun": false,
      "success": true,
      "operationCount": 5
    },
    "verify": {
      "attempted": true,
      "success": true,
      "mismatchCount": 0,
      "missingCount": 0
    }
  },
  "overallStatus": "VERIFIED_OK",
  "ciVerdict": "PASS",
  "explanation": "Apply succeeded and verification passed."
}
```

### Complete Workflow

```bash
# 1. Generate and apply resolution plan
FIGMA_RESOLVE_APPLY_ON=true \
FIGMA_RESOLVE_APPLY_MODE=apply \
FIGMA_RESOLVE_APPLY_DRY_RUN=false \
  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply

# 2. Verify the apply succeeded
pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx

# 3. If verification failed, preview what would be rolled back
pnpm --filter @aesthetic-function/watcher figma:rollback-preview demo-app/src/App.tsx

# 4. Get comprehensive status summary
pnpm --filter @aesthetic-function/watcher figma:status demo-app/src/App.tsx --write

# 5. Use status exit code in CI
if pnpm --filter @aesthetic-function/watcher figma:status demo-app/src/App.tsx; then
  echo "Reconciliation OK"
else
  echo "Reconciliation FAILED - review status artifact"
fi
```

### CI Integration

```yaml
# .github/workflows/figma-reconciliation.yml
- name: Check Reconciliation Status
  run: |
    pnpm --filter @aesthetic-function/watcher figma:status ${{ matrix.file }} --write
  # Exit 1 on FAIL verdict, 0 on PASS/WARN
```

### Guarantees

- **Deterministic**: Same artifacts → same status, always
- **Rule-table only**: No heuristics, no inference
- **Read-only**: Reads artifacts, never mutates them
- **Single artifact**: One status file per source file
- **CI-friendly**: Exit codes map directly to verdict

### Non-Goals (Explicit)

- ❌ Executing rollback
- ❌ Auto-rollback
- ❌ Background watchers
- ❌ Implicit behavior
- ❌ Any mutation

---

## Reconciliation Run Index (Phase 13A)

Phase 13A provides a single, deterministic "run index" artifact that summarizes what reconciliation artifacts exist for a given source file and their key metadata. This is **NOT** a timeline/history feature (that is Phase 13B). This phase is one-shot indexing of current/latest artifacts.

### Key Question

**"What reconciliation artifacts exist for this file, and what are their key details?"**

The `figma:index` command answers this by:
1. Auto-discovering all artifacts from Phases 12A-12J
2. Extracting key metadata (timestamps, modes, counts)
3. Producing a deterministic, sorted index

### Indexed Artifact Types

| Artifact Type | Phase | File Pattern |
|---------------|-------|--------------|
| delta | 12A | `*.figma-delta.json` |
| deltaSuggestions | 12B | `*.figma-delta-suggestions.json` |
| conflicts | 12D | `*.figma-conflicts.json` |
| resolutionPlan | 12E | `*.figma-resolution-plan.json` |
| resolutionApply | 12F | `*.figma-resolution-apply.json` |
| verification | 12G | `*.figma-verification.json` |
| rollbackPreview | 12I | `*.figma-rollback-preview.json` |
| status | 12J | `*.figma-reconciliation-status.json` |

### CLI Usage

```bash
# Index artifacts for a file
pnpm --filter @aesthetic-function/watcher figma:index demo-app/src/App.tsx

# JSON output
pnpm --filter @aesthetic-function/watcher figma:index demo-app/src/App.tsx --json

# Write run index artifact
pnpm --filter @aesthetic-function/watcher figma:index demo-app/src/App.tsx --write

# Verbose mode (show discovery paths)
pnpm --filter @aesthetic-function/watcher figma:index demo-app/src/App.tsx --verbose
```

### Example Output

```
=== FIGMA RUN INDEX (Phase 13A) ===
Repo Root: /path/to/repo
Source: demo-app/src/App.tsx (canonical)

Artifacts:
  ✗ delta
  ✗ delta-suggestions
  ✓ conflicts (3 conflicts, 1 blocked) 2025-12-30T10:00:00.000Z
  ✓ resolution-plan (2 decisions) 2025-12-30T11:00:00.000Z
  ✓ resolution-apply (1 op, dry-run) 2025-12-30T12:00:00.000Z
  ✗ verification
  ✗ rollback-preview
  ✗ status

Notes: none
```

### Run Index Artifact

Pattern: `design-materializations/<file>.figma-run-index.json`

```json
{
  "version": "1.0",
  "repoRoot": "/abs/path/to/repo",
  "sourceFile": "demo-app/src/App.tsx",
  "generatedAt": "2025-12-30T18:10:00.000Z",
  "artifacts": {
    "delta": { "found": false },
    "deltaSuggestions": { "found": false },
    "conflicts": {
      "found": true,
      "path": "design-materializations/demo-app__src__App.figma-conflicts.json",
      "timestamp": "2025-12-30T10:00:00.000Z",
      "summary": { "conflicts": 3, "blocked": 1 }
    },
    "resolutionPlan": {
      "found": true,
      "path": "design-materializations/demo-app__src__App.figma-resolution-plan.json",
      "timestamp": "2025-12-30T11:00:00.000Z",
      "summary": { "decisions": 2 }
    },
    "resolutionApply": {
      "found": true,
      "path": "design-materializations/demo-app__src__App.figma-resolution-apply.json",
      "timestamp": "2025-12-30T12:00:00.000Z",
      "summary": { "ops": 1, "dryRun": true, "applied": 0, "skipped": 1, "failed": 0 }
    },
    "verification": { "found": false },
    "rollbackPreview": { "found": false },
    "status": { "found": false }
  },
  "notes": []
}
```

### Summary Fields by Artifact Type

| Artifact | Summary Fields |
|----------|----------------|
| delta | `deltas` |
| deltaSuggestions | `suggestions` |
| conflicts | `conflicts`, `blocked` |
| resolutionPlan | `decisions` |
| resolutionApply | `ops`, `dryRun`, `applied`, `skipped`, `failed` |
| verification | `verified`, `mismatch`, `missing` |
| rollbackPreview | `actions` |
| status | `overallStatus`, `ciVerdict` |

### Best-Candidate Selection

If multiple matching artifacts exist for a type (e.g., legacy and current naming):
1. Prefer canonical current naming
2. If still multiple, pick newest by timestamp inside artifact
3. Fallback to file mtime if timestamp field missing
4. Log a warning in `notes` array

### Repo-Root Invariance

The command behaves identically when run from:
- Repository root
- `packages/watcher`
- Any subdirectory

All input paths (relative, `../`, absolute) normalize to the same canonical form.

### Relation to Other Phases

| Phase | Purpose |
|-------|---------|
| 12J: Status | Single lifecycle status (CLEAN, VERIFIED_OK, etc.) |
| 13A: Index | Snapshot of all artifact presence + metadata |
| 13B: Timeline (future) | Historical run-over-run tracking |

### Guarantees

- **Deterministic**: Same artifacts → same index output, always
- **Read-only**: Never generates, applies, or mutates artifacts
- **Repo-root invariant**: Works identically from any working directory
- **Single artifact**: One index file per source file
- **Always exit 0**: Read-only indexing never fails CI

---

## Design Drift Timeline (Phase 13B)

Phase 13B turns the one-shot index from Phase 13A into **longitudinal history**. Every reconciliation command run (apply, verify, resolve-apply, etc.) is recorded as an immutable entry in an append-only ledger.

### Key Question

**"What reconciliation runs have occurred for this file over time, and what was the artifact state at each run?"**

This enables:
- **Drift detection**: Tracking how design/code synchronization evolves
- **Debugging**: Understanding what happened before a failure
- **Audit trails**: Recording who/what/when for compliance

### Feature Flag

Recording is **off by default** and gated by:

```bash
RECONCILIATION_TIMELINE_ON=true
```

When enabled, runs are automatically recorded after successful completion of:
- `figma:apply`
- `figma:verify`
- `figma:resolve-apply`
- `figma:rollback-preview`
- `figma:status`
- `figma:index`

### Run Ledger Artifact

Pattern: `design-materializations/<file>.figma-run-ledger.json`

```json
{
  "version": 1,
  "sourceFile": "demo-app/src/App.tsx",
  "runs": [
    {
      "runId": "abc12345",
      "sourceFile": "demo-app/src/App.tsx",
      "timestamp": "2025-12-30T10:00:00.000Z",
      "cwd": "/repo",
      "repoRoot": "/repo",
      "command": "figma:status",
      "artifacts": {
        "conflicts": "design-materializations/demo-app__src__App.figma-conflicts.json"
      },
      "summary": {
        "conflicts": 3,
        "decisions": 2
      }
    },
    {
      "runId": "def67890",
      "sourceFile": "demo-app/src/App.tsx",
      "timestamp": "2025-12-30T11:00:00.000Z",
      "cwd": "/repo/packages/watcher",
      "repoRoot": "/repo",
      "command": "figma:apply",
      "mode": "artifact",
      "artifacts": {},
      "summary": {}
    }
  ]
}
```

### Run ID Generation

Run IDs are deterministic 8-character hex strings generated via djb2 hash:

```
runId = djb2(sourceFile + timestamp + command + sortedArtifactPaths)
```

This ensures:
- Same inputs → same ID (deterministic)
- Different inputs → different ID (unique per run)
- Collision-resistant for practical purposes

### CLI Usage

```bash
# View timeline for a file (read-only mode)
pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx

# JSON output
pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx --json

# Limit results
pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx --limit 5

# Verbose mode (show artifact paths)
pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx --verbose

# Explicitly record a run to the ledger (requires feature flag)
RECONCILIATION_TIMELINE_ON=true pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx --record

# Force write ledger artifact (for testing only)
pnpm --filter @aesthetic-function/watcher figma:timeline demo-app/src/App.tsx --write
```

### Recording Runs (Phase 13B.1)

**Recording is explicit and opt-in.** No command automatically records runs to the ledger.

To record a run, BOTH conditions must be met:
1. The `--record` flag is present
2. The `RECONCILIATION_TIMELINE_ON=true` environment variable is set

```bash
# This will record a run:
RECONCILIATION_TIMELINE_ON=true pnpm figma:timeline demo-app/src/App.tsx --record

# This will NOT record (no feature flag):
pnpm figma:timeline demo-app/src/App.tsx --record
# Output: ⚠️  Recording disabled: RECONCILIATION_TIMELINE_ON is not set to "true"

# This will NOT record (no --record flag):
RECONCILIATION_TIMELINE_ON=true pnpm figma:timeline demo-app/src/App.tsx
# Output: ℹ️ Read-only mode (use --record to append a run)
```

### Example Output

```
=== FIGMA RUN TIMELINE (Phase 13B) ===
Repo Root: /path/to/repo
Source: demo-app/src/App.tsx (canonical)

Runs (newest first, showing 3 of 3):

[def67890] 2025-12-30 11:00:00
  Command: figma:apply
  Mode: artifact
  Summary: (none)

[abc12345] 2025-12-30 10:00:00
  Command: figma:status
  Summary: 3 conflicts, 2 decisions

[xyz99999] 2025-12-29 15:30:00
  Command: figma:verify
  Summary: 5 verified, 1 mismatch, 0 missing
```

### Relation to Phase 13A

| Phase | Purpose | Type |
|-------|---------|------|
| 13A: Index | Current artifact snapshot | One-shot |
| 13B: Timeline | Historical run ledger | Append-only |

Phase 13B uses Phase 13A's artifact discovery to populate each run entry's artifacts and summary fields.

### Guarantees

- **Append-only**: Runs are only ever added, never modified or deleted
- **Deterministic IDs**: Same run → same runId
- **Repo-root invariant**: Works identically from any working directory
- **Explicit recording**: Recording ONLY when `--record` flag + `RECONCILIATION_TIMELINE_ON=true`
- **No implicit side effects**: Other commands never record runs; user must explicitly opt-in
- **Read-only default**: Timeline CLI reads ledger unless `--record` is specified

---

## Drift Diffs (Phase 13C)

Phase 13C adds run-to-run comparison capability, turning the timeline ledger from Phase 13B into actionable drift detection. It compares two runs and summarizes what changed between them.

### Key Question

**"What changed between this run and the previous run?"**

This enables:
- **Regression detection**: Catching status worsening (VERIFIED_OK → VERIFY_FAILED)
- **Trend analysis**: Tracking verification mismatches over time
- **Debugging**: Understanding what triggered a failure

### Drift Diff Artifact

Pattern: `design-materializations/<file>.figma-drift-diff.json`

```json
{
  "version": "1.0",
  "sourceFile": "demo-app/src/App.tsx",
  "fromRunId": "abc12345",
  "toRunId": "def67890",
  "generatedAt": "2025-12-30T12:00:00.000Z",
  "summary": {
    "totalChanges": 2,
    "infoCount": 1,
    "warnCount": 0,
    "failCount": 1,
    "insufficientHistory": false,
    "message": "1 regression(s), 0 warning(s), 1 info change(s)"
  },
  "changes": [
    {
      "field": "overallStatus",
      "from": "VERIFIED_OK",
      "to": "VERIFY_FAILED",
      "severity": "fail",
      "reason": "Status worsened from VERIFIED_OK to VERIFY_FAILED"
    },
    {
      "field": "verifyMismatch",
      "from": 0,
      "to": 2,
      "delta": 2,
      "severity": "fail",
      "reason": "Verification mismatches increased by 2"
    }
  ],
  "from": { "runId": "abc12345", "timestamp": "...", "command": "...", ... },
  "to": { "runId": "def67890", "timestamp": "...", "command": "...", ... }
}
```

### Severity Rules

| Change | Severity | Condition |
|--------|----------|-----------|
| Status worsening | fail | To VERIFY_FAILED or worse |
| Status worsening | warn | To APPLIED_UNVERIFIED |
| verifyMismatch increase | fail | Any increase > 0 |
| verifyMissing increase | fail | Any increase > 0 |
| conflictsTotal increase | warn | Any increase > 0 |
| deltasTotal increase | warn | Any increase > 0 |
| applyDryRun toggle | info | Any change |
| Status improving | info | Level decreasing |
| CLEAN ↔ VERIFIED_OK | info | Both good states |

### CLI Usage

```bash
# Compare latest vs previous run
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx

# JSON output
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --json

# Compare specific runs
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --from abc12345 --to def67890

# Write artifact to disk
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --write

# Verbose mode (show artifact paths and reasons)
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --verbose

# Explain run selection (Phase 13C.1)
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --explain

# Strict mode for CI: exit 1 if any 'fail' severity (Phase 13C.1)
pnpm --filter @aesthetic-function/watcher figma:drift demo-app/src/App.tsx --strict
```

### Preconditions Banner (Phase 13C.1)

Every drift command now prints a preconditions header before results:

```
=== DRIFT DIFF PRECONDITIONS ===
Repo Root: /path/to/repo
Source (input): ../../demo-app/src/App.tsx
Source (canonical): demo-app/src/App.tsx
Ledger: ✓ found
Run selection:
  from: abc12345 (2025-12-30T10:00:00.000Z)
  to:   def67890 (2025-12-30T11:00:00.000Z)
```

### Run Selection Explanation (--explain)

The `--explain` flag provides detailed reasoning about run selection:

```bash
pnpm figma:drift demo-app/src/App.tsx --explain
```

Output:
```
=== RUN SELECTION EXPLANATION ===
From Run:
  Method: previous
  Reason: Auto-selected as second-to-last run (default comparison baseline)
  Explicit: no (auto-selected)

To Run:
  Method: latest
  Reason: Auto-selected as latest run (most recent in ledger)
  Explicit: no (auto-selected)
```

### No Material Drift Message (Phase 13C.1)

When no significant changes exist (empty changes or all 'info' with zero deltas):

```
✓ No material drift detected between runs.
```

### Example Output

```
=== DRIFT DIFF PRECONDITIONS ===
Repo Root: /path/to/repo
Source (input): demo-app/src/App.tsx
Source (canonical): demo-app/src/App.tsx
Ledger: ✓ found
Run selection:
  from: abc12345 (2025-12-30T10:00:00.000Z)
  to:   def67890 (2025-12-30T11:00:00.000Z)

=== FIGMA DRIFT DIFF (Phase 13C) ===
Repo Root: /path/to/repo
Source: demo-app/src/App.tsx (canonical)

Comparing: [abc12345] → [def67890]

From:
  Run ID: abc12345
  Timestamp: 2025-12-30T10:00:00.000Z
  Command: figma:status
  Status: VERIFIED_OK

To:
  Run ID: def67890
  Timestamp: 2025-12-30T11:00:00.000Z
  Command: figma:status
  Status: VERIFY_FAILED

Summary: 1 regression(s), 0 warning(s), 1 info change(s)

Changes (2):
  [FAIL] overallStatus: VERIFIED_OK → VERIFY_FAILED
  [FAIL] verifyMismatch: 0 → 2 (+2)
```

### Run Selection

By default, compares the latest run vs the previous run:
- **Default**: `runs[n-2]` (from) vs `runs[n-1]` (to)
- **Explicit**: Use `--from` and/or `--to` with run IDs

If fewer than 2 runs exist, produces an artifact with `insufficientHistory: true`.

### Relation to Other Phases

| Phase | Purpose | Type |
|-------|---------|------|
| 13A: Index | Current artifact snapshot | One-shot |
| 13B: Timeline | Historical run ledger | Append-only |
| 13C: Drift | Run-to-run comparison | Read-only diff |

### Guarantees

- **Deterministic**: Same runs → same diff output
- **Deterministic ordering**: Changes sorted by severity (fail > warn > info), then field name
- **Read-only**: Never modifies any artifacts or source files
- **Repo-root invariant**: Works identically from any working directory
- **Preconditions visible**: Always shows source paths, ledger status, run selection
- **Exit code 0**: Default success (even with insufficient history)
- **Exit code 1**: With `--strict`, if any drift item has 'fail' severity
- **Exit code 2**: Usage error (invalid arguments)

---

## Drift Summary Dashboard (Phase 13D)

Phase 13D adds an aggregated dashboard that summarizes drift across multiple reconciliation runs. It provides an "at a glance" view of design drift over time for a source file, with a stability score, severity counts, top drift signals, and a CI-friendly verdict.

### Artifact

```
design-materializations/<file>.figma-drift-dashboard.json
```

Example path: `design-materializations/demo-app__src__App.figma-drift-dashboard.json`

### Structure

```json
{
  "version": 1,
  "generatedAt": "2025-12-30T12:00:00.000Z",
  "repoRoot": "/path/to/repo",
  "sourceFile": "demo-app/src/App.tsx",
  "runWindow": {
    "limit": 10,
    "fromRunId": null,
    "toRunId": null
  },
  "counts": {
    "runsConsidered": 5,
    "bySeverity": {
      "info": 3,
      "warn": 1,
      "fail": 0
    }
  },
  "stabilityScore": {
    "value": 84,
    "rationale": [
      "-10 (1 warn-severity drift)",
      "-6 (3 info-severity drifts)"
    ]
  },
  "topSignals": [
    {
      "key": "conflicts.total",
      "label": "Conflicts",
      "delta": 2,
      "from": 0,
      "to": 2,
      "severity": "warn"
    }
  ],
  "recentRuns": [
    {
      "runId": "def67890",
      "timestamp": "2025-12-30T11:00:00.000Z",
      "command": "figma:status",
      "overallStatus": "VERIFIED_OK",
      "driftSeverity": "info",
      "highlights": ["Status: VERIFIED_OK", "Drift: info"]
    }
  ],
  "ciVerdict": "WARN",
  "exitCode": 0,
  "explanation": "1 warn-severity drift detected"
}
```

### Stability Score

The stability score starts at 100 and deducts points based on drift severity:

| Severity | Deduction |
|----------|-----------|
| fail | -25 per event |
| warn | -10 per event |
| info | -2 per event |

The score is clamped to the range 0-100.

### CI Verdict

| Verdict | Condition |
|---------|-----------|
| PASS | No significant drift detected |
| WARN | Warn-severity drifts but no failures |
| FAIL | Fail-severity drift or threshold exceeded |

### Thresholds

Configurable via environment variables or CLI flags:

| Threshold | Default | Environment Variable |
|-----------|---------|---------------------|
| Fail on fail severity | true | `DASHBOARD_FAIL_ON_FAIL_SEVERITY` |
| Max fail count | 1 | `DASHBOARD_MAX_FAIL` |
| Max warn count | none | `DASHBOARD_MAX_WARN` |
| Max verify mismatch increase | none | `DASHBOARD_MAX_VERIFY_MISMATCH_INCREASE` |
| Max conflict increase | none | `DASHBOARD_MAX_CONFLICT_INCREASE` |

### Exit Code

- **exit 0**: Default behavior (even for WARN or FAIL verdicts)
- **exit 1**: Only when `--strict` flag or `DASHBOARD_CI_STRICT=true` AND verdict is FAIL

### CLI Usage

```bash
# Basic usage
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx

# JSON output
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --json

# Custom run window
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --limit 20

# Specific run range
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --from abc12345 --to def67890

# Write artifact to disk
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --write

# CI strict mode (exit 1 on FAIL)
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --strict

# Verbose mode (show rationale and highlights)
pnpm --filter @aesthetic-function/watcher figma:dashboard demo-app/src/App.tsx --verbose
```

### Example Output

```
=== FIGMA DRIFT DASHBOARD (Phase 13D) ===
Repo Root: /path/to/repo
Source: demo-app/src/App.tsx (canonical)
Generated: 2025-12-30T12:00:00.000Z

Run Window:
  Runs considered: 5
  Limit: 10

Drift Counts:
  Fail: 0
  Warn: 1
  Info: 3

Stability Score:
  ████████░░ 84/100

Top Signals (1):
  [WARN] Conflicts: +2 (0 → 2)

Recent Runs (newest first, 5):
  1. [def67890] figma:status - VERIFIED_OK (info)
  2. [abc12345] figma:apply - APPLIED_UNVERIFIED
  3. [xyz99999] figma:verify - VERIFIED_OK
  4. [pqr88888] figma:status - CLEAN
  5. [mno77777] figma:apply - APPLIED_UNVERIFIED

CI Verdict:
  ⚠ WARN
  1 warn-severity drift detected
  Exit code: 0
```

### Relation to Other Phases

| Phase | Purpose | Type |
|-------|---------|------|
| 13A: Index | Current artifact snapshot | One-shot |
| 13B: Timeline | Historical run ledger | Append-only |
| 13C: Drift | Run-to-run comparison | Read-only diff |
| 13D: Dashboard | Aggregated summary | Read-only |

### Guarantees

- **Deterministic**: Same runs → same dashboard output
- **Read-only**: Never modifies any artifacts or source files
- **Repo-root invariant**: Works identically from any working directory
- **CI-friendly**: Configurable exit codes for build gates
- **Feature-flagged**: `RECONCILIATION_DASHBOARD_ON` (default: true)

---

## Project Drift Dashboard (Phase 13E)

Phase 13E adds directory-level aggregation of Phase 13D dashboards. It scans a directory for source files, computes or loads dashboards for each file, and produces a project-level summary with an overall verdict, stability score, and top drift signals across all files.

### Artifact

```
design-materializations/<scanRoot>.figma-project-dashboard.json
```

Example path: `design-materializations/demo-app__src.figma-project-dashboard.json`

### Structure

```json
{
  "version": 1,
  "generatedAt": "2025-12-30T12:00:00.000Z",
  "repoRoot": "/path/to/repo",
  "scanRoot": "demo-app/src",
  "filePattern": "**/*.tsx",
  "counts": {
    "totalFiles": 10,
    "filesWithData": 8,
    "filesNoData": 2,
    "filesWithErrors": 0,
    "byVerdict": { "PASS": 5, "WARN": 2, "FAIL": 1 },
    "bySeverity": { "fail": 3, "warn": 5, "info": 12 }
  },
  "stabilityScore": {
    "value": 72,
    "filesIncluded": 8,
    "filesExcluded": 2
  },
  "topSignals": [
    {
      "key": "conflicts.total",
      "label": "Conflicts",
      "delta": 2,
      "from": 0,
      "to": 2,
      "severity": "warn",
      "magnitude": 2,
      "sourceFile": "demo-app/src/Card.tsx"
    }
  ],
  "files": [
    {
      "sourceFile": "demo-app/src/App.tsx",
      "status": "OK",
      "verdict": "PASS",
      "stabilityScore": 84,
      "runsConsidered": 5,
      "severityCounts": { "fail": 0, "warn": 1, "info": 3 }
    }
  ],
  "projectVerdict": "FAIL",
  "exitCode": 0,
  "explanation": "1 file with FAIL verdict"
}
```

### File Discovery

The scanner searches for `**/*.tsx` files in the scan root, excluding:

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- `.turbo/`
- `.git/`
- `coverage/`

Files are processed in lexicographically sorted order for determinism.

### Per-File Dashboard Loading

For each discovered file, the project dashboard:

1. Attempts to load an existing Phase 13D dashboard artifact
2. If no artifact exists, attempts to compute a dashboard in-memory (requires run ledger)
3. If no data is available, records the file as `NO_DATA`
4. On any error, records the file as `ERROR` with the error message

### Project Verdict

The project verdict is the worst verdict across all files:

| Condition | Project Verdict |
|-----------|-----------------|
| Any file has FAIL verdict | FAIL |
| No FAIL but any file has WARN verdict | WARN |
| All files are PASS or NO_DATA | PASS |

### Project Stability Score

The project stability score is the average of file stability scores, excluding files with NO_DATA or ERROR status:

```
projectScore = sum(file.stabilityScore) / filesWithData
```

### Top Signals

Project-level signals are merged from all file dashboards and sorted deterministically:

1. Severity (fail → warn → info)
2. Magnitude (descending absolute delta)
3. File path (ascending lexicographic)
4. Signal key (ascending lexicographic)

### CLI Usage

```bash
# Basic usage (scan demo-app/src)
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src

# JSON output
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --json

# Limit top signals
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --limit 10

# Write artifact to disk
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --write

# CI strict mode (exit 1 on FAIL)
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --strict

# Custom repo root
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --repo-root /path/to/repo

# Verbose mode (show all files)
pnpm --filter @aesthetic-function/watcher figma:project-dashboard demo-app/src --verbose
```

### Example Output

```
=== FIGMA PROJECT DASHBOARD (Phase 13E) ===
Repo Root: /path/to/repo
Scan Root: demo-app/src (canonical)
File Pattern: **/*.tsx
Generated: 2025-12-30T12:00:00.000Z

File Counts:
  Total: 10
  With data: 8
  No data: 2
  Errors: 0

By Verdict:
  PASS: 5
  WARN: 2
  FAIL: 1

Severity Counts (all files):
  Fail: 3
  Warn: 5
  Info: 12

Project Stability Score:
  ███████░░░ 72/100 (8 files)

Top Signals (3):
  [FAIL] Card.tsx: Conflicts: +2 (0 → 2)
  [WARN] App.tsx: Status worsened: CLEAN → APPLIED_UNVERIFIED
  [INFO] Button.tsx: Verify mismatches: +1 (0 → 1)

Project Verdict:
  ✗ FAIL
  1 file with FAIL verdict
  Exit code: 0
```

### Exit Code

- **exit 0**: Default behavior (even for WARN or FAIL verdicts)
- **exit 1**: Only when `--strict` flag or `PROJECT_DASHBOARD_CI_STRICT=true` AND verdict is FAIL

### Relation to Other Phases

| Phase | Scope | Purpose |
|-------|-------|---------|
| 13D: Dashboard | Per-file | Aggregated drift summary for one file |
| 13E: Project Dashboard | Directory | Aggregated summary across many files |

### Guarantees

- **Deterministic**: Same files → same output (sorted, stable)
- **Read-only**: Never modifies any source files or artifacts
- **Repo-root invariant**: Works identically from any working directory
- **CI-friendly**: Configurable exit codes for build gates

---

## CI Gate Summary (Phase 13F)

Phase 13F adds a CI-focused command that computes a pass/warn/fail decision from Phase 13E project dashboard data, with a small trend window derived from Phase 13B ledgers.

### Artifact

```
design-materializations/<scanRoot>.figma-ci-gate.json
```

Example path: `design-materializations/demo-app__src.figma-ci-gate.json`

### Structure

```json
{
  "version": 1,
  "generatedAt": "2025-12-30T12:00:00.000Z",
  "repoRoot": "/path/to/repo",
  "scanRoot": "demo-app/src",
  "filePattern": "**/*.tsx",
  "counts": {
    "totalFiles": 10,
    "filesWithData": 8,
    "filesNoData": 2,
    "filesWithErrors": 0,
    "byVerdict": { "pass": 5, "warn": 2, "fail": 1 },
    "bySeverity": { "fail": 3, "warn": 5, "info": 12 }
  },
  "stabilityScore": {
    "value": 72,
    "filesIncluded": 8,
    "filesExcluded": 2
  },
  "trend": {
    "improving": 3,
    "stable": 4,
    "worsening": 1,
    "insufficientData": 2,
    "windowSize": 5,
    "files": [
      {
        "sourceFile": "demo-app/src/App.tsx",
        "runsInWindow": 5,
        "direction": "improving",
        "startScore": 80,
        "endScore": 90,
        "scoreDelta": 10
      }
    ]
  },
  "topSignals": [...],
  "files": [...],
  "verdict": "FAIL",
  "exitCode": 0,
  "explanation": "1 file with FAIL verdict"
}
```

### Trend Window

The trend summary looks at the last N runs (default: 5) for each file to determine direction:

| Direction | Condition |
|-----------|-----------|
| improving | Score increased by ≥5 points |
| stable | Score changed by <5 points |
| worsening | Score decreased by ≥5 points |

Files with fewer than 2 runs in the window are marked as "insufficient data".

### CLI Usage

```bash
# Basic usage
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src

# JSON output
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src --json

# Custom trend window
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src --window 10

# Write artifact to disk
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src --write

# CI strict mode (exit 1 on FAIL)
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src --strict

# Verbose mode (show all files and trends)
pnpm --filter @aesthetic-function/watcher figma:ci demo-app/src --verbose
```

### Example Output

```
=== FIGMA CI GATE (Phase 13F) ===
Repo Root: /path/to/repo
Scan Root: demo-app/src
Generated: 2025-12-30T12:00:00.000Z

Files:
  Total discovered: 10
  With data: 8
  No data: 2
  Errors: 0

Verdict Breakdown:
  PASS: 5
  WARN: 2
  FAIL: 1

Project Stability Score:
  ███████░░░ 72/100

Trend Summary (window: 5 runs):
  ↑ Improving: 3
  → Stable: 4
  ↓ Worsening: 1
  ? Insufficient data: 2

CI Verdict:
  ✗ FAIL
  1 file with FAIL verdict
  Exit code: 0
```

### Exit Code

- **exit 0**: Default behavior (even for WARN or FAIL verdicts)
- **exit 1**: Only when `--strict` flag or `RECONCILIATION_CI_STRICT=true` AND verdict is FAIL

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RECONCILIATION_CI_STRICT` | `false` | Exit 1 on FAIL verdict |
| `RECONCILIATION_CI_WINDOW` | `5` | Trend window size (runs per file) |
| `DASHBOARD_LIMIT` | `10` | Max runs to consider per file for dashboard |

### Relation to Other Phases

| Phase | Purpose |
|-------|---------|
| 13B: Timeline | Provides run ledger for trend computation |
| 13D: Dashboard | Per-file drift aggregation |
| 13E: Project Dashboard | Multi-file aggregation (reused by 13F) |
| 13F: CI Gate | CI-focused gate with trend window |

### Guarantees

- **Deterministic**: Same inputs → same output
- **Read-only**: Never modifies any source files or artifacts
- **Repo-root invariant**: Works identically from any working directory
- **CI-friendly**: Only `--strict` can cause non-zero exit

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
