# Aesthetic Function

A bidirectional synchronization system between a local React codebase and a live Figma document. The current implementation (Phase 2B) enables **Code → Design** sync: saving a React file with `@figma` markers automatically updates the corresponding Figma nodes in real-time.

---

## What Works Today (Phase 2B)

| Feature | Status |
|---------|--------|
| File save detection via chokidar | ✅ |
| `@figma` marker parsing (regex-based) | ✅ |
| IntentModel → FigmaOperation transformer | ✅ |
| Design token resolution | ✅ |
| WebSocket + HTTP polling server relay | ✅ |
| Figma plugin with SET_TEXT / SET_FILL operations | ✅ |
| Live Figma updates on file save | ✅ |

---

## Architecture

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
| `@aesthetic-function/watcher` | Local Node.js | Watches files, parses `@figma` markers, transforms to operations, sends to server |
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

2. **Save the file** — chokidar detects the change (300ms debounce)

3. **Watcher parses markers** — extracts `node`, `text`, and `fill` attributes

4. **IntentModel created** — structured representation of design intent

5. **FigmaOperations generated** — transforms intent + design tokens into operations:
   ```json
   [
     { "op": "SET_TEXT", "nodeQuery": "LoginButton", "value": "Sign In" },
     { "op": "SET_FILL", "nodeQuery": "LoginButton", "value": "#3B82F6" }
   ]
   ```

6. **Server relays operations** — broadcasts to connected Figma plugin clients

7. **Figma plugin executes** — finds nodes by name, applies SET_TEXT/SET_FILL

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

## What Is NOT Implemented Yet

The following features are intentionally deferred to future phases:

| Feature | Status |
|---------|--------|
| AST parsing (Babel/TypeScript) | ❌ Not implemented |
| LLM-based intent reasoning | ❌ Not implemented |
| Design → Code sync (Figma → React) | ❌ Not implemented |
| Background reconciliation | ❌ Not implemented |
| Conflict resolution | ❌ Not implemented |
| Component-level mapping | ❌ Not implemented |
| Variant/state handling | ❌ Not implemented |
| Layout/spacing operations | ❌ Not implemented |

The current implementation uses simple regex parsing of `@figma` comment markers. There is no semantic understanding of React component structure.

---

## Project Structure

```
aesthetic-function/
├── packages/
│   ├── shared/           # Protocol definitions
│   ├── watcher/          # File watcher + transformer
│   │   ├── src/
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
| `pnpm dev:watcher` | Start the file watcher |
| `pnpm dev` | Start all packages in parallel |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm build` | Build all packages |
| `pnpm tunnel` | Expose server via cloudflared |

---

## Protocol Version

Current: `0.1.0`

All messages include a `protocolVersion` field for compatibility checking.
