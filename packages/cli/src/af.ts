#!/usr/bin/env node
/**
 * @aesthetic-function/cli - af.ts
 *
 * Phase 15C: Unified CLI Control Surface.
 *
 * WHY: Thin convenience layer that delegates every command to existing
 * watcher/server modules. The CLI does NOT own reconciliation, policy,
 * persistence, or audit — those remain in their respective packages.
 *
 * ARCHITECTURE:
 * - Subcommand dispatcher (init, run, reconcile, status, dashboard, ci, artifacts)
 * - Config resolution via loadAfConfig() from shared
 * - Delegation via fork() + tsx to watcher/server .ts entry points
 * - Config-derived env vars passed to child processes via envBridge.ts
 * - `af run` spawns watcher + server as child processes
 *
 * CONSTRAINTS:
 * - No reconciliation logic
 * - No server bypass
 * - No override writes
 * - Node built-ins only (node:util parseArgs)
 */

import { init } from './commands/init.js';
import { run } from './commands/run.js';
import { reconcile } from './commands/reconcile.js';
import { status } from './commands/status.js';
import { dashboard } from './commands/dashboard.js';
import { ci } from './commands/ci.js';
import { artifacts } from './commands/artifacts.js';
import { design } from './commands/design.js';

// =============================================================================
// SUBCOMMAND DISPATCH
// =============================================================================

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  init,
  run,
  reconcile,
  status,
  dashboard,
  ci,
  artifacts,
  design,
};

function printUsage(): void {
  console.log(`af — Aesthetic Function CLI

Usage: af <command> [options]

Commands:
  init                    Generate af.config.json for project setup
  run                     Start watcher + server (launcher, not runtime)
  reconcile <file>        Run reconciliation pipeline on a source file
  status <file>           Show reconciliation status for a source file
  dashboard <file>        Show drift dashboard for a source file
                         Use --project <dir> for project-level dashboard
  ci [dir]                Run CI gate summary
  artifacts <sub> [args]  Inspect reconciliation artifacts
    artifacts list <file>      List all artifacts for a source file
    artifacts inspect <path>   Pretty-print a single artifact
    artifacts trace <file>     End-to-end lifecycle trace
  design <sub> [args]     Design adapter commands (read-only)
    design pull                Pull full design data
    design tokens              Pull and normalize design tokens
    design inspect <name>      Inspect a design component

Options:
  --help, -h              Show this help message
  --version               Show version

All commands delegate to existing watcher/server modules.
The CLI is a control surface — it does not own the runtime.`);
}

function printVersion(): void {
  console.log('af 0.1.0');
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  // Handle global flags
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return 0;
  }

  if (args[0] === '--version') {
    printVersion();
    return 0;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "af --help" for usage information.');
    return 2;
  }

  return handler(commandArgs);
}

// Run
main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
