# Getting Started

This guide walks through setting up Aesthetic Function from a fresh clone to your first reconciliation run.

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **pnpm** — `npm install -g pnpm`
- **Figma desktop app** — required for the plugin (optional for CLI-only usage)

## 1. Install

```bash
git clone <repo-url>
cd aesthetic-function
pnpm install
```

This installs all five packages: `shared`, `watcher`, `server`, `figma-plugin`, and `cli`.

## 2. Configure (Optional)

Generate a project config file:

```bash
af init
```

This creates `af.config.json` with defaults. You can also specify a policy profile:

```bash
af init --profile balanced
```

Available profiles:

| Profile | Behavior |
|---------|----------|
| `designer-first` | Preserves design overrides aggressively (default) |
| `code-first` | Code wins on all conflicts |
| `balanced` | Equal weight to code and design signals |
| `strict-review` | Requires explicit approval for drift |

If you skip this step, AF uses built-in defaults.

## 3. Start the System

You need two processes running: the **server** (message relay) and the **watcher** (reconciliation engine).

### Option A: Start Both

```bash
af run
```

### Option B: Start Individually

```bash
# Terminal 1: relay server on port 3001
pnpm dev:server

# Terminal 2: file watcher
pnpm dev:watcher
```

## 4. Connect Figma (Optional)

The Figma plugin cannot reach localhost directly. You need a tunnel.

### Start a Tunnel

```bash
# Terminal 3
pnpm tunnel
```

This runs `cloudflared` and prints a public URL (e.g., `https://random-words.trycloudflare.com`). Copy this URL.

Alternative: use ngrok (`ngrok http 3001`).

### Load the Plugin

1. In Figma, go to **Plugins → Development → Import plugin from manifest...**
2. Select: `packages/figma-plugin/manifest.json`
3. Run the plugin: **Plugins → Development → Aesthetic Function**

### Connect

1. In the plugin UI, paste the tunnel URL (not `localhost`)
2. Click **Connect**
3. You should see "Connected (WebSocket)" or "Connected (Polling)"

## 5. Prepare a Component File

AF analyzes React component files that contain `@figma` comment markers. The `demo-app/` directory has examples:

```tsx
// demo-app/src/App.tsx
function App() {
  return (
    // @figma layout:column gap:16 padding:24
    <div className="app-container">
      {/* @figma font:heading color:#1a1a1a */}
      <h1>Welcome</h1>
    </div>
  );
}
```

Markers follow the pattern `@figma property:value`. These tell AF what the code *intends* the design to look like.

## 6. Run Reconciliation

Reconcile a single file:

```bash
af reconcile demo-app/src/App.tsx
```

This runs the full analysis pipeline:
1. **Parse** — Extract `@figma` markers and AST structure
2. **Resolve** — Apply precedence rules (`override > marker > ast > code`)
3. **Diff** — Compare resolved values against current design state
4. **Report** — Output drift summary with field-level detail

### Check Status

```bash
af status demo-app/src/App.tsx
```

### View the Drift Dashboard

```bash
af dashboard demo-app/src/App.tsx
```

### Project-Wide Dashboard

```bash
af dashboard --project demo-app/src/
```

## 7. Inspect Artifacts

Every reconciliation produces artifacts in `design-materializations/`. Inspect them:

```bash
# List all artifacts for a file
af artifacts list demo-app/src/App.tsx

# Inspect a specific artifact
af artifacts inspect design-materializations/demo-app__src__App.figma-reconcile.json

# Trace the full pipeline for a file
af artifacts trace demo-app/src/App.tsx
```

## 8. Pull Design Data (Requires Figma Token)

If you have a Figma access token, you can pull design data:

```bash
export FIGMA_ACCESS_TOKEN=your-token-here
export FIGMA_FILE_KEY=your-file-key

# Pull tokens, components, and styles
af design pull

# Pull and normalize design tokens
af design tokens

# Inspect a specific component
af design inspect ButtonPrimary
```

## 9. CI Integration

Run the CI gate summary on a directory:

```bash
af ci demo-app/src/
```

In strict mode (for CI pipelines):

```bash
af ci demo-app/src/ --strict --fail-on-worsening
```

This exits with code 1 if drift exceeds thresholds, suitable for GitHub Actions or other CI systems.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_ACCESS_TOKEN` | — | Figma Personal Access Token |
| `FIGMA_FILE_KEY` | — | Figma file key |
| `USE_LLM_ANALYZER` | `false` | Enable LLM intent parsing (optional, with fallback) |
| `TRACE` | `false` | Enable trace logging |
| `PORT` | `3001` | Server port |
| `SERVER_URL` | `http://localhost:3001` | Server URL for watcher |

For the complete environment variable reference, see [architecture-reference.md](architecture-reference.md).

## Next Steps

- [CLI Reference](cli-reference.md) — All commands, flags, and examples
- [Architecture Reference](architecture-reference.md) — Runtime boundaries, reconciliation model, invariants
- [README](../README.md) — Product overview
