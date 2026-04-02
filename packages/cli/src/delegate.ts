/**
 * @aesthetic-function/cli - delegate.ts
 *
 * Phase 15C: Generic CLI Module Delegation.
 *
 * WHY: All `af` subcommands delegate to existing watcher CLI modules.
 * This utility spawns a watcher CLI module via fork() with config-derived
 * env vars — exactly what `pnpm figma:reconcile` does, but config-aware.
 *
 * RUNTIME REQUIREMENTS:
 * - Must run from within the aesthetic-function monorepo (workspace-only)
 * - Requires `tsx` available in node_modules (used via --import tsx)
 * - Targets .ts source files directly — no pre-build step
 * - Monorepo layout: packages/watcher/src/<module>.ts must exist
 *
 * CONSTRAINTS:
 * - Spawns existing modules as-is — no logic duplication
 * - Passes args through unmodified
 * - Uses fork() + tsx for TypeScript execution
 */

import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadAfConfig } from '@aesthetic-function/shared/configLoader';
import { buildChildEnv } from './envBridge.js';

// =============================================================================
// REPO ROOT
// =============================================================================

/**
 * Find the monorepo root by walking up looking for pnpm-workspace.yaml.
 * Returns cwd as fallback if no workspace root is found.
 */
export function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

// =============================================================================
// PREFLIGHT
// =============================================================================

/**
 * Verify that the monorepo layout and tsx are available.
 * Returns an error message string, or null if everything is OK.
 */
export function checkDelegationPrereqs(repoRoot: string): string | null {
  const watcherSrc = join(repoRoot, 'packages', 'watcher', 'src');
  if (!existsSync(watcherSrc)) {
    return (
      `Watcher source not found at ${watcherSrc}.\n` +
      'The af CLI must be run from within the aesthetic-function monorepo.'
    );
  }

  // Check for tsx — needed by the watcher package at runtime.
  // tsx is a devDependency of the watcher package, so check there.
  const watcherTsxBin = join(repoRoot, 'packages', 'watcher', 'node_modules', '.bin', 'tsx');
  if (!existsSync(watcherTsxBin)) {
    return (
      'tsx is not installed in packages/watcher/. The af CLI requires tsx for TypeScript execution.\n' +
      'Run: pnpm --filter @aesthetic-function/watcher install'
    );
  }

  return null;
}

// =============================================================================
// DELEGATION
// =============================================================================

/**
 * Delegate to a watcher CLI module.
 *
 * Resolves af.config.json → env vars, then forks the target .ts module
 * with `--import tsx` so Node can execute TypeScript directly.
 * Returns the module's exit code.
 *
 * @param modulePath - Path relative to packages/watcher/src/
 *                     (e.g., 'reconciliationReconcile/cliReconcile.ts')
 * @param args - CLI arguments passed through unmodified
 */
export async function delegateToWatcher(
  modulePath: string,
  args: string[],
): Promise<number> {
  const config = loadAfConfig();
  const env = buildChildEnv(config);
  const repoRoot = findRepoRoot();

  // Preflight check
  const prereqError = checkDelegationPrereqs(repoRoot);
  if (prereqError) {
    console.error(prereqError);
    return 2;
  }

  const fullPath = join(repoRoot, 'packages', 'watcher', 'src', modulePath);
  if (!existsSync(fullPath)) {
    console.error(`Module not found: ${fullPath}`);
    return 2;
  }

  return new Promise<number>((resolveP) => {
    const child = fork(fullPath, args, {
      cwd: join(repoRoot, 'packages', 'watcher'),
      env,
      execArgv: ['--import', 'tsx'],
      stdio: 'inherit',
    });

    child.on('exit', (code) => resolveP(code ?? 0));
    child.on('error', (err) => {
      console.error(`Failed to start module: ${err.message}`);
      resolveP(2);
    });
  });
}
