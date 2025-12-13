# Claude Project Instructions

This repository implements an AI-driven Code → Design synchronization system.

## Core Principles
- Code is the source of truth (optimistic UI model)
- Design is synchronized to code
- This is a distributed system with strict runtime boundaries

## Runtimes
1. Watcher (Node.js)
   - Can read filesystem
   - Can call LLMs
   - Produces Intent Models and Figma Operations

2. Server (Bridge)
   - Relays messages only
   - Owns logging and audit
   - No UI interpretation

3. Figma Plugin
   - ui.html: network allowed
   - code.ts: NO network, NO filesystem

## Protocol Rules
- All cross-process communication uses shared TypeScript interfaces
- Single canonical protocol file: `/packages/shared/src/protocol.ts`
- Every message must include:
  `{ version, type, requestId, payload }`

## LLM Safety Rules
- When JSON is requested, output JSON only
- Never mix explanation with structured output
- Retry with repair prompts if validation fails

## Design Token Rules
- Prefer semantic tokens over raw values
- Token resolution happens before Figma operations

## Build Philosophy
- MVP first
- Deterministic plumbing before AI intelligence
- No overengineering

---

## Phase 1 Plumbing Test: "Red Box" Validation

### Prerequisites
1. Node.js 18+ installed
2. Figma desktop app

### Step 1: Start the Server
```bash
cd ~/Desktop/aesthetic-function
pnpm dev:server
```
Server runs on http://localhost:3001

### Step 2: Start a Tunnel (REQUIRED for Figma)
Figma plugins cannot reach localhost. Open a new terminal:
```bash
pnpm tunnel
# or manually:
npx cloudflared tunnel --url http://localhost:3001
```
Copy the tunnel URL (e.g., `https://random-words.trycloudflare.com`)

Alternative: Use ngrok
```bash
ngrok http 3001
```

### Step 3: Load the Figma Plugin
1. In Figma, go to **Plugins → Development → Import plugin from manifest...**
2. Select: `~/Desktop/aesthetic-function/packages/figma-plugin/manifest.json`
3. Run the plugin: **Plugins → Development → Aesthetic Function**

### Step 4: Connect Plugin to Server
1. In the plugin UI, paste the tunnel URL (not localhost!)
2. Click **Connect**
3. Should show "Connected (WebSocket)" or "Connected (Polling)"

### Step 5: Create Test Elements in Figma
1. Create a rectangle, name it `TestBox`
2. (Optional) Create a text node, name it `TestText`
3. Select the `TestBox` node

### Step 6: Send Test Command
In a new terminal:
```bash
pnpm test:red
```
This sends a SET_FILL operation with color `#FF0000`

### Expected Result
- The `TestBox` rectangle turns **red**
- Plugin log shows "Forwarding 1 operation(s)..."
- Plugin log shows "✓ Success"

### Other Test Commands
```bash
pnpm test:blue    # Turn TestBox blue (#3B82F6)
pnpm test:text    # Update TestText content
```

### With Custom Server URL
```bash
SERVER_URL=https://your-tunnel.trycloudflare.com pnpm test:red
```

### Troubleshooting
- **Connection failed**: Make sure tunnel is running and URL is correct
- **No target node found**: Select a node in Figma or create one named `TestBox`
- **Node is not TEXT**: For SET_TEXT, target must be a text node