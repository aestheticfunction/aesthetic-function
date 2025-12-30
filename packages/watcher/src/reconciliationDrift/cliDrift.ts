#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationDrift/cliDrift.ts
 *
 * Phase 13C: CLI for Drift Diffs (Run-to-Run).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:drift <file> [options]
 *
 * Options:
 *   --from <runId>   Compare from this run ID (default: previous run)
 *   --to <runId>     Compare to this run ID (default: latest run)
 *   --json           Output JSON instead of formatted text
 *   --write          Write artifact to disk
 *   --verbose        Show detailed output (artifact paths, reasons)
 *   --repo-root <path>  Explicit repository root
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  normalizeSourcePath,
  computeDriftDiffArtifact,
  createInsufficientHistoryArtifact,
} from './compute.js';

import {
  formatDriftDiff,
  writeDriftDiffArtifact,
} from './artifact.js';

import type { DriftCliOptions, DriftDiffArtifact } from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): DriftCliOptions | { error: string } {
  const options: DriftCliOptions = {
    sourceFile: '',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--from') {
      i++;
      if (i >= args.length) {
        return { error: '--from requires a run ID' };
      }
      options.fromRunId = args[i];
    } else if (arg === '--to') {
      i++;
      if (i >= args.length) {
        return { error: '--to requires a run ID' };
      }
      options.toRunId = args[i];
    } else if (arg === '--repo-root') {
      i++;
      if (i >= args.length) {
        return { error: '--repo-root requires a path' };
      }
      options.repoRoot = args[i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else if (!options.sourceFile) {
      options.sourceFile = arg;
    } else {
      return { error: `Unexpected argument: ${arg}` };
    }

    i++;
  }

  if (!options.sourceFile) {
    return { error: 'Missing required source file argument' };
  }

  return options;
}

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:drift <file> [options]

Compare two reconciliation runs for a source file.

Arguments:
  <file>              Source file to analyze (e.g., demo-app/src/App.tsx)

Options:
  --from <runId>      Compare from this run ID (default: previous run)
  --to <runId>        Compare to this run ID (default: latest run)
  --json              Output JSON instead of formatted text
  --write             Write artifact to disk
  --verbose           Show detailed output (artifact paths, reasons)
  --repo-root <path>  Explicit repository root

Examples:
  figma:drift demo-app/src/App.tsx
  figma:drift demo-app/src/App.tsx --json
  figma:drift demo-app/src/App.tsx --from abc12345 --to def67890
  figma:drift demo-app/src/App.tsx --write --verbose
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

  // Normalize source path
  const sourceCanonical = normalizeSourcePath(options.sourceFile, repoRoot);

  // Verbose header
  if (options.verbose && !options.json) {
    console.log(`Repo Root: ${repoRoot}`);
    console.log(`Source (canonical): ${sourceCanonical}`);
    console.log(`Working Directory: ${startCwd}`);
    console.log('');
  }

  // Compute drift diff
  const result = await computeDriftDiffArtifact({
    sourceFile: sourceCanonical,
    repoRoot,
    fromRunId: options.fromRunId,
    toRunId: options.toRunId,
  });

  // Handle errors
  if ('error' in result) {
    if (options.json) {
      stdout.write(JSON.stringify({ error: result.error }, null, 2) + '\n');
    } else {
      console.error(`Error: ${result.error}`);
    }
    return 1;
  }

  // Handle insufficient history
  let artifact: DriftDiffArtifact;
  if ('insufficientHistory' in result) {
    artifact = createInsufficientHistoryArtifact(sourceCanonical, result.availableRuns);
  } else {
    artifact = result;
  }

  // Write artifact if requested
  if (options.write) {
    const writeResult = writeDriftDiffArtifact(artifact, repoRoot);

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
    const formatted = formatDriftDiff(artifact, repoRoot, options.verbose);
    console.log(formatted);
  }

  return 0;
}

// Run CLI
main().then(code => exit(code));
