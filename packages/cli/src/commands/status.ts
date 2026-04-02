/**
 * @aesthetic-function/cli - commands/status.ts
 *
 * Phase 15C: `af status` — Delegates to reconciliationStatus/cliStatus.
 *
 * CONSTRAINTS:
 * - Thin wrapper only — spawns existing CLI module
 * - No reconciliation logic
 */

import { delegateToWatcher } from '../delegate.js';

export async function status(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af status — Show reconciliation status

Usage: af status <source-file> [options]

Options:
  --repo-root <path>  Repository root (default: auto-detect)
  --json              Output JSON format
  --write             Write status artifact
  --verbose, -v       Verbose output
  -h, --help          Show this help

Delegates to the existing figma:status pipeline.`);
    return 0;
  }

  return delegateToWatcher('reconciliationStatus/cliStatus.ts', args);
}
