/**
 * @aesthetic-function/cli - commands/reconcile.ts
 *
 * Phase 15C: `af reconcile` — Delegates to reconciliationReconcile/cliReconcile.
 *
 * CONSTRAINTS:
 * - Thin wrapper only — spawns existing CLI module
 * - Sets config-derived env vars so the module reads them normally
 * - No reconciliation logic
 */

import { delegateToWatcher } from '../delegate.js';

export async function reconcile(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af reconcile — Run reconciliation pipeline

Usage: af reconcile <source-file> [options]

Options:
  --profile <name>    Override policy profile
  --repo-root <path>  Repository root (default: auto-detect)
  --format <fmt>      Output format (human|json|ci)
  --json              Shorthand for --format json
  --write             Write artifacts
  --no-write          Skip artifact writes
  --record            Record run in ledger
  --strict            Strict CI mode (exit 1 on FAIL)
  --verbose, -v       Verbose output
  --limit <n>         Drift window limit
  -h, --help          Show this help

Delegates to the existing figma:reconcile pipeline.`);
    return 0;
  }

  return delegateToWatcher('reconciliationReconcile/cliReconcile.ts', args);
}
