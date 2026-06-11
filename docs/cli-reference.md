# CLI Reference

The `af` CLI is a thin control surface for the Aesthetic Function system. It delegates all work to existing watcher and server modules — it does not own reconciliation logic.

## Installation

The CLI is available after installing the monorepo:

```bash
pnpm install
```

Commands are run from the repository root.

## Global Flags

| Flag | Description |
|------|-------------|
| `--help, -h` | Show help message |
| `--version` | Show version |

---

## `af init`

Generate an `af.config.json` configuration file.

```bash
af init [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--profile <name>` | string | `designer-first` | Policy profile (`designer-first`, `code-first`, `balanced`, `strict-review`) |
| `--force, -f` | boolean | `false` | Overwrite existing af.config.json |
| `--json` | boolean | `false` | Output generated config as JSON (no file write) |

**Behavior:**
- Detects project context (framework, existing artifacts like `component-map.json`, `design-overrides.json`)
- Generates minimal valid config with framework-specific defaults
- Interactive prompts if running in a TTY; non-interactive defaults to `designer-first`
- Only writes `af.config.json` — does not start any processes

**Examples:**

```bash
# Generate default config
af init

# Generate with balanced profile, overwriting existing
af init --profile balanced --force

# Preview config without writing
af init --json
```

---

## `af run`

Start the watcher and server as child processes.

```bash
af run [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--server-only` | boolean | `false` | Start server only |
| `--watcher-only` | boolean | `false` | Start watcher only |
| `--verbose, -v` | boolean | `false` | Verbose output |

**Behavior:**
- Loads `af.config.json` and passes config-derived environment variables to child processes
- Spawns server (`packages/server/src/index.ts`) and watcher (`packages/watcher/src/index.ts`) as independent processes
- Handles SIGINT/SIGTERM gracefully (kills all children)
- Returns the maximum exit code from children

**Examples:**

```bash
# Start both
af run

# Start server only
af run --server-only

# Start watcher only with verbose output
af run --watcher-only --verbose
```

---

## `af reconcile <file>`

Run the full reconciliation pipeline on a source file.

```bash
af reconcile <file> [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--profile <name>` | string | from config | Override policy profile |
| `--repo-root <path>` | string | auto-detect | Repository root path |
| `--format <fmt>` | string | `human` | Output format (`human`, `json`, `ci`) |
| `--json` | boolean | `false` | Shorthand for `--format json` |
| `--write` | boolean | `true` | Write artifacts to `design-materializations/` |
| `--no-write` | boolean | — | Skip artifact writes |
| `--record` | boolean | `false` | Record run in the timeline ledger |
| `--strict` | boolean | `false` | Strict CI mode (exit 1 on FAIL verdict) |
| `--verbose, -v` | boolean | `false` | Verbose output |
| `--limit <n>` | number | — | Drift window limit |

**Pipeline steps:** Parse → Resolve → Diff → Report

**Examples:**

```bash
# Reconcile a component
af reconcile demos/react-demo-app/src/App.tsx

# JSON output, no file writes
af reconcile demos/react-demo-app/src/App.tsx --json --no-write

# Record in ledger with strict mode
af reconcile demos/react-demo-app/src/App.tsx --record --strict

# Override profile for this run
af reconcile demos/react-demo-app/src/App.tsx --profile code-first
```

---

## `af status <file>`

Show reconciliation status for a source file.

```bash
af status <file> [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo-root <path>` | string | auto-detect | Repository root path |
| `--json` | boolean | `false` | Output JSON format |
| `--write` | boolean | `false` | Write status artifact |
| `--verbose, -v` | boolean | `false` | Verbose output |

**Examples:**

```bash
af status demos/react-demo-app/src/App.tsx
af status demos/react-demo-app/src/App.tsx --json
```

---

## `af dashboard <file>`

Show the drift dashboard for a source file or project.

```bash
af dashboard <file-or-dir> [options]
```

### File Mode (default)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit <n>` | number | — | Run window limit |
| `--from <runId>` | string | — | Start from specific run |
| `--to <runId>` | string | — | End at specific run |
| `--strict` | boolean | `false` | Strict CI mode (exit 1 on FAIL) |
| `--json` | boolean | `false` | Output JSON format |
| `--write` | boolean | `false` | Write dashboard artifact |
| `--verbose` | boolean | `false` | Verbose output |
| `--repo-root <path>` | string | auto-detect | Repository root path |

### Project Mode (`--project`)

All file mode flags, plus:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project` | boolean | `false` | Enable project-level dashboard (aggregates all files in directory) |
| `--fail-score <n>` | number | — | Score below which verdict is FAIL |
| `--warn-score <n>` | number | — | Score at or above which verdict is PASS |
| `--max-signals <n>` | number | — | Max signals to display |

**Examples:**

```bash
# File-level dashboard
af dashboard demos/react-demo-app/src/App.tsx

# Project-level dashboard
af dashboard --project demos/react-demo-app/src/

# With score thresholds
af dashboard --project demos/react-demo-app/src/ --fail-score 40 --warn-score 70

# Last 5 runs only
af dashboard demos/react-demo-app/src/App.tsx --limit 5
```

---

## `af ci [dir]`

Run the CI gate summary for a directory.

```bash
af ci [dir] [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit <n>` | number | — | Scan file limit |
| `--window <n>` | number | — | Trend window size |
| `--improving-delta <n>` | number | — | Improving trend threshold |
| `--worsening-delta <n>` | number | — | Worsening trend threshold |
| `--fail-on-worsening` | boolean | `false` | Exit 1 on worsening trend |
| `--no-fail-on-worsening` | boolean | — | Do not fail on worsening |
| `--max-files <n>` | number | — | Maximum files to process |
| `--strict` | boolean | `false` | Strict CI mode |
| `--json` | boolean | `false` | Output JSON format |
| `--write` | boolean | `false` | Write CI gate artifact |
| `--verbose` | boolean | `false` | Verbose output |
| `--repo-root <path>` | string | auto-detect | Repository root path |

**Examples:**

```bash
# Basic CI gate
af ci demos/react-demo-app/src/

# Strict mode for CI pipelines
af ci demos/react-demo-app/src/ --strict --fail-on-worsening

# JSON output with custom thresholds
af ci demos/react-demo-app/src/ --json --window 5 --worsening-delta 10
```

---

## `af artifacts <subcommand>`

Inspect reconciliation artifacts.

### `af artifacts list <source-file>`

List all artifacts for a source file.

```bash
af artifacts list demos/react-demo-app/src/App.tsx [options]
```

### `af artifacts inspect <artifact-path>`

Inspect a specific artifact file.

```bash
af artifacts inspect design-materializations/demos__react-demo-app__src__App.figma-reconcile.json [options]
```

### `af artifacts trace <source-file>`

Trace the full pipeline for a source file.

```bash
af artifacts trace demos/react-demo-app/src/App.tsx [options]
```

### Common Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo-root <path>` | string | auto-detect | Repository root path |
| `--json` | boolean | `false` | Output JSON format |
| `--verbose, -v` | boolean | `false` | Verbose output |

---

## `af design <subcommand>`

Design adapter commands. **All commands are read-only** — they do not write to Figma or trigger reconciliation.

### Common Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | `false` | Output JSON format |
| `--verbose, -v` | boolean | `false` | Verbose output with trace details |
| `--adapter <id>` | string | first available | Use a specific adapter |

### `af design pull`

Pull full design data (tokens, components, and styles).

```bash
af design pull [options]
```

### `af design tokens`

Pull and normalize design tokens to canonical vocabulary.

```bash
af design tokens [options]
```

### `af design inspect <name>`

Inspect a specific design component.

```bash
af design inspect ButtonPrimary [options]

# Inspect all components
af design inspect --all [options]
```

### `af design screenshot`

Capture a design screenshot (PNG).

```bash
af design screenshot [options]

# Screenshot a specific node
af design screenshot --node 123:456

# Save to file
af design screenshot --out screenshot.png
```

### `af design component [name]`

List or inspect design components.

```bash
# List all components
af design component

# Inspect a specific component
af design component ButtonPrimary
```

### `af design drift [name]`

Cross-surface drift analysis — compares component metadata across Figma,
Storybook, code (AST), and an optional dspack contract file. Read-only: it
does not modify reconciliation, and the contract file is never written.

```bash
af design drift [component-name] [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | `false` | Output JSON format |
| `--verbose`, `-v` | boolean | `false` | Verbose output with trace details |
| `--include-uncorroborated` | boolean | `false` | Include uncorroborated story-derived variants |
| `--dspack <file>` | string | — | dspack contract file to compare against (overrides `contract.dspackPath` in `af.config.json`) |

**Contract surface:** when a dspack file is supplied (flag or config), its
declared components, props, and enum variants participate in the comparison.
Findings where the contract declares something code lacks are genuine drift
(warn). Findings where code has something the contract lacks are tagged
`contract-staleness:` (info) — the snapshot may be out of date; regenerate it
with [dspack-export](https://github.com/aestheticfunction/dspack-export).
Relative paths resolve against the current directory, then the repo root.

**Examples:**

```bash
# Compare a component across all available surfaces
af design drift Button

# Compare against a dspack contract (works even with Figma/Storybook down)
af design drift Button --dspack ./my-system.dspack.json

# Analyze every component the contract declares
af design drift --dspack ./my-system.dspack.json --json
```

```json
// af.config.json
{
  "contract": {
    "dspackPath": "./my-system.dspack.json"
  }
}
```

---

## pnpm Scripts

These scripts are available at the monorepo root alongside the `af` CLI:

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

### Direct Watcher Commands

These bypass the CLI and run watcher modules directly:

| Command | Description |
|---------|-------------|
| `pnpm --filter @aesthetic-function/watcher figma:reconcile <file>` | Full reconciliation (primary entry point) |
| `pnpm --filter @aesthetic-function/watcher figma:status <file>` | Reconciliation status |
| `pnpm --filter @aesthetic-function/watcher figma:dashboard <file>` | Drift dashboard |
| `pnpm --filter @aesthetic-function/watcher figma:ci <dir>` | CI gate summary |
| `pnpm --filter @aesthetic-function/watcher figma:sources` | Discover sources for multi-file reconciliation |
| `pnpm --filter @aesthetic-function/watcher figma:index <file>` | Index existing artifacts |
| `pnpm --filter @aesthetic-function/watcher figma:timeline <file>` | Show/record timeline ledger |
| `pnpm --filter @aesthetic-function/watcher figma:drift <file>` | Compute drift diffs |
| `pnpm --filter @aesthetic-function/watcher figma:project-dashboard <dir>` | Project-level dashboard |

---

## Architecture Notes

- The CLI is a **thin dispatcher**. It delegates all commands to existing watcher/server modules via `fork()` with TypeScript execution (`tsx`).
- Config resolution: `af.config.json` → env vars → child processes. Environment variables already set by the user take precedence over config file values.
- The CLI requires a monorepo context (must find `pnpm-workspace.yaml` in a parent directory).
- All delegated modules are independently runnable via the `pnpm --filter` commands above.

For full architectural details, see [architecture-reference.md](architecture-reference.md).
