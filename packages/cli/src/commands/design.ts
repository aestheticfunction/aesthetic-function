/**
 * @aesthetic-function/cli - commands/design.ts
 *
 * Phase 16A: `af design` — Design Adapter CLI commands.
 *
 * Subcommands:
 *   af design pull              → designAdapter/cliDesignPull.ts
 *   af design tokens            → designAdapter/cliDesignTokens.ts
 *   af design inspect <name>    → designAdapter/cliDesignInspect.ts
 *
 * CONSTRAINTS:
 * - Read-only. Does NOT write to Figma or trigger reconciliation.
 * - Thin wrapper only — dispatches to existing adapter CLI modules.
 */

import { delegateToWatcher } from '../delegate.js';

const SUBCOMMANDS: Record<string, string> = {
  pull: 'designAdapter/cliDesignPull.ts',
  tokens: 'designAdapter/cliDesignTokens.ts',
  inspect: 'designAdapter/cliDesignInspect.ts',
};

function printHelp(): void {
  console.log(`af design — Design adapter commands (read-only)

Usage: af design <subcommand> [args]

Subcommands:
  pull                     Pull full design data (tokens + components + styles)
  tokens                   Pull and normalize design tokens
  inspect <component>      Inspect a design component
  inspect --all            Inspect all design components

Options (all subcommands):
  --json                   Output JSON format
  --verbose, -v            Verbose output with trace details
  --adapter <id>           Use a specific adapter (default: first available)
  -h, --help               Show this help

Examples:
  af design pull
  af design tokens --json
  af design inspect Button
  af design inspect --all --verbose`);
}

export async function design(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return 0;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  const modulePath = SUBCOMMANDS[subcommand];
  if (!modulePath) {
    console.error(`Unknown design subcommand: ${subcommand}`);
    console.error('Valid subcommands: pull, tokens, inspect');
    return 2;
  }

  return delegateToWatcher(modulePath, subArgs);
}
