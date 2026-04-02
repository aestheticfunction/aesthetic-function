/**
 * @aesthetic-function/cli - commands/artifacts.ts
 *
 * Phase 15C: `af artifacts` — Delegates to artifact inspector CLIs.
 *
 * Subcommands:
 *   af artifacts list <file>      → artifactInspector/cliArtifactList.ts
 *   af artifacts inspect <path>   → artifactInspector/cliArtifactInspect.ts
 *   af artifacts trace <file>     → artifactInspector/cliArtifactTrace.ts
 *
 * CONSTRAINTS:
 * - Thin wrapper only — dispatches to existing artifact inspector
 * - No reconciliation logic
 */

import { delegateToWatcher } from '../delegate.js';

const SUBCOMMANDS: Record<string, string> = {
  list: 'artifactInspector/cliArtifactList.ts',
  inspect: 'artifactInspector/cliArtifactInspect.ts',
  trace: 'artifactInspector/cliArtifactTrace.ts',
};

function printHelp(): void {
  console.log(`af artifacts — Inspect reconciliation artifacts

Usage: af artifacts <subcommand> [args]

Subcommands:
  list <source-file>       List all artifacts for a source file (12 types)
  inspect <artifact-path>  Pretty-print a single artifact with highlights
  trace <source-file>      End-to-end lifecycle trace across all artifacts

Options (all subcommands):
  --repo-root <path>       Repository root (default: auto-detect)
  --json                   Output JSON format
  --verbose, -v            Verbose output
  -h, --help               Show this help

Examples:
  af artifacts list demo-app/src/App.tsx
  af artifacts inspect design-materializations/demo-app__src__App.figma-reconciliation-status.json
  af artifacts trace demo-app/src/App.tsx --json`);
}

export async function artifacts(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return 0;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  const modulePath = SUBCOMMANDS[subcommand];
  if (!modulePath) {
    console.error(`Unknown artifacts subcommand: ${subcommand}`);
    console.error('Valid subcommands: list, inspect, trace');
    return 2;
  }

  return delegateToWatcher(modulePath, subArgs);
}
