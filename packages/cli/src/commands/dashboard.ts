/**
 * @aesthetic-function/cli - commands/dashboard.ts
 *
 * Phase 15C: `af dashboard` — Delegates to reconciliationDashboard/cliDashboard
 * or reconciliationProjectDashboard/cliProjectDashboard.
 *
 * The --project flag switches to the project-level dashboard, which aggregates
 * across all source files in a directory (Phase 13E).
 *
 * CONSTRAINTS:
 * - Thin wrapper only — spawns existing CLI module
 * - No reconciliation logic
 */

import { delegateToWatcher } from '../delegate.js';

export async function dashboard(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af dashboard — Show drift dashboard

Usage: af dashboard <source-file> [options]
       af dashboard --project <dir> [options]

Options:
  --project             Project-level dashboard (aggregates all files in dir)
  --limit <n>           Run window limit
  --from <runId>        Start from specific run
  --to <runId>          End at specific run
  --strict              Strict CI mode (exit 1 on FAIL)
  --json                Output JSON format
  --write               Write dashboard artifact
  --verbose             Verbose output
  --repo-root <path>    Repository root (default: auto-detect)
  --fail-score <n>      Score below which verdict is FAIL (project mode)
  --warn-score <n>      Score at or above which verdict is PASS (project mode)
  --max-signals <n>     Max signals to display (project mode)
  -h, --help            Show this help

Delegates to figma:dashboard (file) or figma:project-dashboard (project).`);
    return 0;
  }

  // Route to project dashboard if --project flag is present
  if (args.includes('--project')) {
    const filtered = args.filter((a) => a !== '--project');
    return delegateToWatcher('reconciliationProjectDashboard/cliProjectDashboard.ts', filtered);
  }

  return delegateToWatcher('reconciliationDashboard/cliDashboard.ts', args);
}
