/**
 * @aesthetic-function/cli - commands/run.ts
 *
 * Phase 15C: `af run` — Spawn watcher + server as child processes.
 *
 * WHY: Convenience launcher that starts both the server and watcher.
 * This is a process launcher, NOT a runtime. The watcher and server
 * are still independently runnable via `pnpm dev:watcher` / `pnpm dev:server`.
 *
 * CONSTRAINTS:
 * - Spawns existing entry points as child processes
 * - Passes config-derived env vars — does NOT duplicate logic
 * - ctrl-C kills both processes
 * - Does NOT own the runtime loop
 */

import { fork } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { loadAfConfig } from '@aesthetic-function/shared/configLoader';
import { buildChildEnv } from '../envBridge.js';
import { findRepoRoot } from '../delegate.js';

// =============================================================================
// ARGS
// =============================================================================

interface RunOptions {
  serverOnly?: boolean;
  watcherOnly?: boolean;
  verbose?: boolean;
}

function parseArgs(args: string[]): RunOptions {
  const options: RunOptions = {};

  for (const arg of args) {
    if (arg === '--server-only') options.serverOnly = true;
    else if (arg === '--watcher-only') options.watcherOnly = true;
    else if (arg === '--verbose' || arg === '-v') options.verbose = true;
  }

  return options;
}

// =============================================================================
// MAIN
// =============================================================================

export async function run(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af run — Start watcher + server

Usage: af run [options]

Options:
  --server-only     Start server only
  --watcher-only    Start watcher only
  --verbose, -v     Verbose output
  -h, --help        Show this help

This command spawns the server and watcher as child processes.
Both remain independently runnable via pnpm dev:server / pnpm dev:watcher.`);
    return 0;
  }

  const options = parseArgs(args);
  const config = loadAfConfig();
  const mergedEnv = buildChildEnv(config);
  const repoRoot = findRepoRoot();

  if (options.verbose) {
    console.log(`Config source: ${config._source ?? 'defaults'}`);
    console.log(`Profile: ${config.profile}`);
    console.log(`Server port: ${config.server.port}`);
    console.log('');
  }

  const children: ReturnType<typeof fork>[] = [];

  // Spawn server
  if (!options.watcherOnly) {
    const serverEntry = join(repoRoot, 'packages', 'server', 'src', 'index.ts');
    if (!existsSync(serverEntry)) {
      console.error(`Server entry not found: ${serverEntry}`);
      return 1;
    }

    const server = fork(serverEntry, [], {
      cwd: join(repoRoot, 'packages', 'server'),
      env: mergedEnv,
      execArgv: ['--import', 'tsx'],
      stdio: 'inherit',
    });
    children.push(server);
    console.log(`[af] Server started (port ${config.server.port})`);
  }

  // Spawn watcher
  if (!options.serverOnly) {
    const watcherEntry = join(repoRoot, 'packages', 'watcher', 'src', 'index.ts');
    if (!existsSync(watcherEntry)) {
      console.error(`Watcher entry not found: ${watcherEntry}`);
      return 1;
    }

    const watchPaths = config.watcher.watchPaths;
    const watcher = fork(watcherEntry, watchPaths, {
      cwd: join(repoRoot, 'packages', 'watcher'),
      env: mergedEnv,
      execArgv: ['--import', 'tsx'],
      stdio: 'inherit',
    });
    children.push(watcher);
    console.log(`[af] Watcher started (watching: ${watchPaths.join(', ')})`);
  }

  // Handle ctrl-C: kill all children
  const cleanup = () => {
    console.log('\n[af] Shutting down...');
    for (const child of children) {
      child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Wait for all children to exit
  const exits = children.map(
    (child) =>
      new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0));
        child.on('error', () => resolve(1));
      }),
  );

  const codes = await Promise.all(exits);
  return Math.max(...codes, 0);
}
