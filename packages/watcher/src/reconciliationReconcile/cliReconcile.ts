#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationReconcile/cliReconcile.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI.
 *
 * WHY: One command that runs the core Phase 12-13 read-only analysis sequence
 * for a single source file, producing a single bundle artifact.
 *
 * USAGE:
 *   pnpm figma:reconcile <source-file> [options]
 *
 * OPTIONS:
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --json                Output JSON format
 *   --write               Write bundle artifact (default: true)
 *   --no-write            Do not write bundle artifact
 *   --record              Record timeline run (requires RECONCILIATION_TIMELINE_ON=true)
 *   --strict              Exit 1 on strict-enabled step failures
 *   --verbose, -v         Show step invocations and discovery
 *   --limit <n>           Limit for dashboard/drift runs (default: 10)
 *   --help, -h            Show this help message
 *
 * EXIT CODES:
 *   0 - Success (even if "no data / clean")
 *   1 - Strict mode failure (only if --strict and a step fails)
 *   2 - Usage/config error
 */

import { argv, exit } from 'node:process';
import { resolve } from 'node:path';

import type { ReconcileCliOptions } from './types.js';
import { runReconcile } from './compute.js';
import {
  writeBundleArtifact,
  formatBundle,
  formatBundleVerbose,
} from './artifact.js';

// =============================================================================
// USAGE
// =============================================================================

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:reconcile <source-file> [options]

Run the full Phase 12-13 reconciliation analysis for a single source file.

Arguments:
  <source-file>           Source file to reconcile (e.g., demo-app/src/App.tsx)

Options:
  --repo-root <path>      Repository root (default: auto-detect)
  --json                  Output JSON format
  --write                 Write bundle artifact (default: true)
  --no-write              Do not write bundle artifact
  --record                Record timeline run (requires RECONCILIATION_TIMELINE_ON=true)
  --strict                Exit 1 on strict-enabled step failures (drift, dashboard)
  --verbose, -v           Show step invocations and discovery
  --limit <n>             Limit for dashboard/drift runs (default: 10)
  --help, -h              Show this help message

Steps (run in order):
  1. status     - Compute reconciliation status
  2. index      - Index existing artifacts
  3. timeline   - Load/record timeline
  4. drift      - Compute drift diffs
  5. dashboard  - Generate drift dashboard

Exit Codes:
  0                       Success (even if clean/no data)
  1                       Strict mode failure
  2                       Usage/config error

Examples:
  figma:reconcile demo-app/src/App.tsx
  figma:reconcile demo-app/src/App.tsx --json
  figma:reconcile demo-app/src/App.tsx --strict --write
  figma:reconcile demo-app/src/App.tsx --record --verbose
`.trim());
}

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse result type.
 */
type ParseArgsResult =
  | ReconcileCliOptions
  | { error: string };

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): ParseArgsResult {
  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return { error: '' }; // Empty error signals help (exit 0)
  }

  const options: ReconcileCliOptions = {
    sourceFile: '',
    write: true, // Default true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = resolve(args[i + 1]);
      i++;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--no-write') {
      options.write = false;
    } else if (arg === '--record') {
      options.record = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--limit' && args[i + 1]) {
      const num = parseInt(args[i + 1], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--limit must be a positive integer' };
      }
      options.limit = num;
      i++;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else if (!options.sourceFile) {
      options.sourceFile = arg;
    } else {
      return { error: `Unexpected argument: ${arg}` };
    }
  }

  // Validate source file
  if (!options.sourceFile) {
    return { error: 'Source file is required' };
  }

  return options;
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main CLI entry point.
 *
 * @param args - CLI arguments (defaults to process.argv.slice(2))
 * @returns Exit code
 */
export async function main(args: string[] = argv.slice(2)): Promise<number> {
  const parsed = parseArgs(args);

  // Handle parse result
  if ('error' in parsed) {
    if (parsed.error) {
      // Usage error
      console.error(`Error: ${parsed.error}`);
      printUsage();
      return 2;
    }
    // Help was requested
    return 0;
  }

  const options = parsed;

  // Run reconcile
  if (options.verbose) {
    console.log(`Running reconcile for: ${options.sourceFile}`);
    console.log('');
  }

  const { bundle, exitCode } = await runReconcile(options);

  // Write bundle artifact if requested
  if (options.write) {
    const result = writeBundleArtifact(bundle, bundle.repoRoot);
    if (result.written) {
      if (!options.json) {
        console.log(`Wrote: ${result.path}`);
        console.log('');
      }
    } else {
      console.error(`Error writing bundle artifact: ${result.error}`);
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(bundle, null, 2));
  } else if (options.verbose) {
    console.log(formatBundleVerbose(bundle));
  } else {
    console.log(formatBundle(bundle));
  }

  // Next action hint on failure
  if (!bundle.overall.ok && !options.json) {
    console.log('');
    if (!options.verbose) {
      console.log('Hint: Run with --verbose for more details');
    }
  }

  return exitCode;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliReconcile')) {
  main().then(code => exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    exit(2);
  });
}
