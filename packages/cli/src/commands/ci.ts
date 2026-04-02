/**
 * @aesthetic-function/cli - commands/ci.ts
 *
 * Phase 15C: `af ci` — Delegates to reconciliationCi/cliCi.
 *
 * CONSTRAINTS:
 * - Thin wrapper only — spawns existing CLI module
 * - No reconciliation logic
 */

import { delegateToWatcher } from '../delegate.js';

export async function ci(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af ci — Run CI gate summary

Usage: af ci [scan-dir] [options]

Options:
  --limit <n>                    Scan file limit
  --window <n>                   Trend window size
  --improving-delta <n>          Improving trend threshold
  --worsening-delta <n>          Worsening trend threshold
  --fail-on-worsening            Exit 1 on worsening trend
  --no-fail-on-worsening         Do not fail on worsening
  --max-files <n>                Maximum files to process
  --strict                       Strict CI mode
  --json                         Output JSON format
  --write                        Write CI gate artifact
  --verbose                      Verbose output
  --repo-root <path>             Repository root
  -h, --help                     Show this help

Delegates to the existing figma:ci pipeline.`);
    return 0;
  }

  return delegateToWatcher('reconciliationCi/cliCi.ts', args);
}
