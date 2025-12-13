# Aesthetic Function

A Code → Design synchronization system that watches local React source files and applies changes to a live Figma document in real-time. The pipeline is deterministic by default, using `@figma` comment markers to extract design intent. An optional LLM-based analyzer can be enabled via feature flag, with automatic fallback to marker parsing on failure.

---

## What Works Today (Phase 4A)

| Feature | Status |
|---------|--------|
| File save detection via chokidar | ✅ |
| `@figma` marker parsing (regex-based, default) | ✅ |
| IntentModel → FigmaOperation transformer | ✅ |
| Design token resolution | ✅ |
| WebSocket + HTTP polling server relay | ✅ |
| Figma plugin with SET_TEXT / SET_FILL operations | ✅ |
| Live Figma updates on file save | ✅ |
| Optional LLM-based intent analyzer (feature flag) | ✅ |
| Automatic fallback to markers on LLM failure | ✅ |
| Async audit trail logging (sync-log.md) | ✅ |

---

## Architecture

```
File Change → Watcher → IntentModel → FigmaOperations → Server → Figma Plugin
```

```
┌─────────────────┐     HTTP POST     ┌─────────────────┐    WebSocket/Poll   ┌─────────────────┐
│                 │  ─────────────▶   │                 │  ─────────────────▶ │                 │
│     Watcher     │                   │     Server      │                     │  Figma Plugin   │
│   (Local Node)  │                   │  (Relay Bridge) │                     │   (Sandbox)     │
│                 │                   │                 │                     │                 │
└─────────────────┘                   └─────────────────┘                     └─────────────────┘
        │                                                                              │
        │ watches                                                                      │ mutates
        ▼                                                                              ▼
┌─────────────────┐                                                           ┌─────────────────┐
│  React Source   │                                                           │  Figma Document │
│   (demo-app/)   │                                                           │                 │
└─────────────────┘                                                           └─────────────────┘
```

### Packages

| Package | Runtime | Responsibility |
|---------|---------|----------------|
| `@aesthetic-function/watcher` | Local Node.js | Watches files, extracts intent (markers or LLM), transforms to operations, sends to server |
| `@aesthetic-function/server` | Local Node.js | HTTP/WebSocket relay bridge between watcher and Figma plugin |
| `@aesthetic-function/figma-plugin` | Figma Sandbox | Receives operations, executes scene graph mutations (SET_TEXT, SET_FILL) |
| `@aesthetic-function/shared` | Shared | Protocol definitions, message types, version constants |

---

## How It Works (End-to-End)

1. **Edit a React file** with `@figma` markers:
   ```tsx
   // @figma node=LoginButton text="Sign In" fill=Primary/Blue500
   export function LoginButton() {
     return <button>Sign In</button>;
   }
   ```

2. **Watcher detects change** — chokidar monitors the file system (300ms debounce)

3. **Intent is extracted**:
   - **Marker mode (default)**: Regex parses `@figma` comments
   - **LLM mode (opt-in)**: Sends code to LLM for semantic analysis

4. **IntentModel transformed** — design tokens resolved, FigmaOperations generated:
   ```json
   [
     { "op": "SET_TEXT", "nodeQuery": "LoginButton", "value": "Sign In" },
     { "op": "SET_FILL", "nodeQuery": "LoginButton", "value": "#3B82F6" }
   ]
   ```

5. **Server relays operations** — broadcasts to connected Figma plugin clients

6. **Figma plugin executes** — finds nodes by name, applies SET_TEXT/SET_FILL

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

### Start the Watcher (Marker Mode)

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

### Expected Result

When you save a file with `@figma` markers:
1. Watcher logs: `Found X intent(s) from markers`
2. Server logs: `Received X operation(s)`
3. Figma plugin updates the matching nodes

### Connect Figma Plugin

1. In Figma, run the plugin
2. Enter the server URL (use a tunnel like cloudflared for remote access)
3. Click Connect

### Test Without Figma

```bash
pnpm test:send          # Send test operations
pnpm test:red           # Red box test
pnpm test:blue          # Blue token test
pnpm test:text          # Text update test
```

---

## Optional LLM Mode

The watcher supports an optional LLM-based intent analyzer that can extract design intent from React code without explicit `@figma` markers.

### Enable LLM Mode

```bash
USE_LLM_ANALYZER=true OPENAI_API_KEY=sk-... pnpm dev:watcher
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `USE_LLM_ANALYZER` | Set to `true` to enable LLM mode |
| `LLM_PROVIDER` | `openai` (default) or `anthropic` |
| `OPENAI_API_KEY` | OpenAI API key (required for openai provider) |
| `ANTHROPIC_API_KEY` | Anthropic API key (required for anthropic provider) |
| `OPENAI_MODEL` | Model name (default: `gpt-4o`) |
| `ANTHROPIC_MODEL` | Model name (default: `claude-3-5-sonnet-20241022`) |
| `LLM_ANALYZE_ALL` | Set to `true` to analyze files without `@figma` markers |
| `ENABLE_AUDIT_LOG` | Set to `true` to log all broadcasts to `sync-log.md` |

### Behavior

- **Default**: LLM mode only processes files that contain `@figma` markers
- **LLM_ANALYZE_ALL=true**: Processes all `.tsx`/`.ts` files regardless of markers
- **Fallback**: If LLM fails (network error, invalid JSON, timeout), automatically falls back to marker-based parsing

### Fallback Rules

1. If `USE_LLM_ANALYZER=true` but no API key is configured → marker parsing
2. If LLM call throws an error → marker parsing (if markers exist)
3. If file has no `@figma` markers and `LLM_ANALYZE_ALL!=true` → skip file

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

The server can log all broadcast operations to `sync-log.md` at the repository root for debugging and traceability.

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

## What Is NOT Implemented Yet

| Feature | Status |
|---------|--------|
| AST parsing (Babel/TypeScript) | ❌ Not implemented |
| Design → Code sync (Figma → React) | ❌ Not implemented |
| Background reconciliation | ❌ Not implemented |
| Conflict resolution | ❌ Not implemented |
| Component-level mapping | ❌ Not implemented |
| Variant/state handling | ❌ Not implemented |
| Layout/spacing operations | ❌ Not implemented |
| Autonomous multi-agent loops | ❌ Not implemented |

The current implementation uses regex parsing of `@figma` comment markers or optional LLM analysis. There is no AST-level semantic understanding of React component structure.

---

## Project Structure

```
aesthetic-function/
├── packages/
│   ├── shared/           # Protocol definitions
│   ├── watcher/          # File watcher + transformer
│   │   ├── src/
│   │   │   ├── analyze/  # LLM-based intent analyzer
│   │   │   ├── parse/    # @figma marker parser
│   │   │   ├── tokens/   # Design token resolution
│   │   │   └── transform/# IntentModel → FigmaOps
│   ├── server/           # WebSocket + HTTP relay
│   └── figma-plugin/     # Figma sandbox plugin
├── demo-app/             # Sample React app with markers
└── README.md
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm dev:server` | Start the relay server |
| `pnpm dev:watcher` | Start the file watcher (marker mode) |
| `pnpm dev` | Start all packages in parallel |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm build` | Build all packages |
| `pnpm tunnel` | Expose server via cloudflared |
| `pnpm test:analyze` | Run LLM analyzer tests |

---

## Protocol Version

Current: `0.3.0`

All messages include a `protocolVersion` field for compatibility checking.
