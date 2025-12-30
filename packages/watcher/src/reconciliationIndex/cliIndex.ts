#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationIndex/cliIndex.ts
 *
 * Phase 13A: CLI for Reconciliation Run Index.
 *
 * WHY: Single command to generate a snapshot of what reconciliation
 * artifacts exist for a source file with their key metadata.
 *
 * USAGE:
 *   pnpm figma:index <source-file>
 *
 * OPTIONS:
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --json                Output JSON format
 *   --write               Write run index artifact
 *   --verbose             Show artifact discovery paths
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Usage error
 */

import { resolve } from 'node:path';

import type { RunIndexContext } from './types.js';
import { computeRunIndex, getRepoRoot } from './compute.js';
import { writeRunIndexArtifact, formatRunIndex, formatDiscovery } from './artifact.js';

interface CliOptions {
  sourceFile: string;
  repoRoot: string;
  json: boolean;
  write: boolean;
  verbose: boolean;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    sourceFile: '',
    repoRoot: '', // Empty means auto-detect
    json: false,
    write: false,
    verbose: false,
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
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      options.sourceFile = arg;
    }
  }

  return options;
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate source file
  if (!options.sourceFile) {
    console.error('Error: Source file is required');
    console.error('');
    console.error('Usage: pnpm figma:index <source-file> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --repo-root <path>  Repository root (default: auto-detect)');
    console.error('  --json              Output JSON format');
    console.error('  --write             Write run index artifact');
    console.error('  --verbose, -v       Show artifact discovery paths');
    process.exit(2);
  }

  // Auto-detect repo root if not provided
  const repoRoot = options.repoRoot || getRepoRoot();

  // Create context
  const context: RunIndexContext = {
    sourceFile: options.sourceFile,
    repoRoot,
  };

  // Compute run index
  const { index, discovery } = await computeRunIndex(context);

  // Show discovery info if verbose
  if (options.verbose && !options.json) {
    console.log(formatDiscovery(discovery, index.artifacts));
    console.log('');
  }

  // Write artifact if requested
  if (options.write) {
    const result = await writeRunIndexArtifact(index, context);
    if (result.written && !options.json) {
      console.log(`Run index artifact written: ${result.path}`);
      console.log('');
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(index, null, 2));
  } else {
    console.log(formatRunIndex(index));
  }

  // Always exit 0 (read-only indexing, never fails)
  process.exit(0);
}

// Run
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
