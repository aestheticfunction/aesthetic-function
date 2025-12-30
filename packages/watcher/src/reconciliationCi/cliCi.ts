#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationCi/cliCi.ts
 *
 * Phase 13F: CLI for CI Gate Summary.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:ci <dir> [options]
 *
 * Options:
 *   --limit <n>       Max runs to consider per file (default: 10)
 *   --window <n>      Trend window size (default: 5)
 *   --strict          CI strict mode (exit 1 on FAIL verdict)
 *   --json            Output JSON instead of formatted text
 *   --write           Write artifact to disk
 *   --verbose         Show detailed output (all files, all signals, all trends)
 *   --repo-root <path>  Explicit repository root
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  computeCiGate,
  isCiStrictMode,
  getCiWindowSize,
  DEFAULT_TREND_WINDOW,
} from './compute.js';

import {
  formatCiGate,
  writeCiGateArtifact,
} from './artifact.js';

import { getDashboardLimit } from '../reconciliationDashboard/config.js';

import type { CiGateCliOptions, CiGateContext } from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): CiGateCliOptions | { error: string } {
  const options: CiGateCliOptions = {
    scanRoot: '',
    limit: getDashboardLimit(),
    window: getCiWindowSize(),
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--limit') {
      i++;
      if (i >= args.length) {
        return { error: '--limit requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--limit must be a positive integer' };
      }
      options.limit = num;
    } else if (arg === '--window') {
      i++;
      if (i >= args.length) {
        return { error: '--window requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--window must be a positive integer' };
      }
      options.window = num;
    } else if (arg === '--repo-root') {
      i++;
      if (i >= args.length) {
        return { error: '--repo-root requires a path' };
      }
      options.repoRoot = args[i];
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else if (!options.scanRoot) {
      options.scanRoot = arg;
    } else {
      return { error: `Unexpected argument: ${arg}` };
    }

    i++;
  }

  if (!options.scanRoot) {
    return { error: 'Missing required directory argument' };
  }

  return options;
}

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:ci <dir> [options]

CI gate command for project-level pass/warn/fail decision with trend window.

Arguments:
  <dir>               Directory to scan (e.g., demo-app/src)

Options:
  --limit <n>         Max runs to consider per file (default: 10, env: DASHBOARD_LIMIT)
  --window <n>        Trend window size (default: ${DEFAULT_TREND_WINDOW}, env: RECONCILIATION_CI_WINDOW)
  --strict            CI strict mode - exit 1 on FAIL verdict (env: RECONCILIATION_CI_STRICT)
  --json              Output JSON instead of formatted text
  --write             Write artifact to disk
  --verbose           Show detailed output (all files, all signals, all trends)
  --repo-root <path>  Explicit repository root

Environment Variables:
  DASHBOARD_LIMIT               Max runs to consider (default: 10)
  RECONCILIATION_CI_WINDOW      Trend window size (default: ${DEFAULT_TREND_WINDOW})
  RECONCILIATION_CI_STRICT      Exit 1 on FAIL verdict (default: false)

Exit Codes:
  0                   Default (PASS or WARN)
  1                   FAIL verdict with --strict flag

Examples:
  figma:ci demo-app/src
  figma:ci demo-app/src --json
  figma:ci demo-app/src --write --verbose
  figma:ci demo-app/src --strict
  figma:ci demo-app/src --window 10
`.trim());
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main CLI entry point.
 */
export async function main(args: string[] = argv.slice(2)): Promise<number> {
  // Parse arguments
  const parsed = parseArgs(args);

  if ('error' in parsed) {
    console.error(`Error: ${parsed.error}`);
    printUsage();
    return 1;
  }

  const options = parsed;

  // Resolve repo root
  const startCwd = cwd();
  const repoRoot = options.repoRoot ?? getRepoRoot(startCwd);

  // Determine strict mode
  const strict = options.strict ?? isCiStrictMode();

  // Verbose header
  if (options.verbose && !options.json) {
    console.log(`Repo Root: ${repoRoot}`);
    console.log(`Scan Root: ${options.scanRoot}`);
    console.log(`Working Directory: ${startCwd}`);
    console.log(`Limit: ${options.limit}`);
    console.log(`Window: ${options.window}`);
    console.log(`Strict Mode: ${strict}`);
    console.log('');
  }

  // Build context
  const context: CiGateContext = {
    scanRoot: options.scanRoot,
    repoRoot,
    limit: options.limit,
    window: options.window,
    strict,
  };

  // Compute CI gate
  const result = await computeCiGate(context);

  // Handle errors
  if (!result.ok) {
    if (options.json) {
      stdout.write(JSON.stringify({ error: result.error }, null, 2) + '\n');
    } else {
      console.error(`Error: ${result.error}`);
    }
    return 1;
  }

  const artifact = result.artifact;

  // Write artifact if requested
  if (options.write) {
    const writeResult = writeCiGateArtifact(artifact, repoRoot);

    if (!writeResult.written) {
      if (options.json) {
        stdout.write(JSON.stringify({ error: writeResult.error }, null, 2) + '\n');
      } else {
        console.error(`Error writing artifact: ${writeResult.error}`);
      }
      return 1;
    }

    if (options.verbose && !options.json) {
      console.log(`Wrote: ${writeResult.path}`);
      console.log('');
    }
  }

  // Output
  if (options.json) {
    stdout.write(JSON.stringify(artifact, null, 2) + '\n');
  } else {
    const formatted = formatCiGate(artifact, repoRoot, options.verbose);
    console.log(formatted);
  }

  // Return exit code from artifact
  return artifact.exitCode;
}

// Run CLI
main().then(code => exit(code));
