#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationStatus/cliStatus.ts
 *
 * Phase 12J: CLI for Reconciliation Status.
 *
 * WHY: Single command to answer "What is the reconciliation status of this file?"
 *
 * USAGE:
 *   pnpm figma:status <source-file>
 *
 * OPTIONS:
 *   --repo-root <path>    Repository root (default: cwd)
 *   --json                Output JSON format
 *   --write               Write status artifact (only if non-CLEAN)
 *
 * EXIT CODES:
 *   0 - PASS or WARN
 *   1 - FAIL
 */

import { resolve } from 'node:path';

import type { ReconciliationStatusContext } from './types.js';
import { loadArtifacts, computeReconciliationStatus, getStatusExitCode } from './compute.js';
import { writeReconciliationStatusArtifact, formatReconciliationStatus } from './artifact.js';

interface CliOptions {
  sourceFile: string;
  repoRoot: string;
  json: boolean;
  write: boolean;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    sourceFile: '',
    repoRoot: process.cwd(),
    json: false,
    write: false,
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
    console.error('Usage: pnpm figma:status <source-file> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --repo-root <path>  Repository root (default: cwd)');
    console.error('  --json              Output JSON format');
    console.error('  --write             Write status artifact');
    process.exit(2);
  }

  // Create context
  const context: ReconciliationStatusContext = {
    sourceFile: options.sourceFile,
    repoRoot: options.repoRoot,
  };

  // Load artifacts
  const artifacts = await loadArtifacts(context);

  // Compute status
  const status = computeReconciliationStatus(artifacts, options.sourceFile);

  // Write artifact if requested
  if (options.write) {
    const result = await writeReconciliationStatusArtifact(status, context);
    if (result.written && !options.json) {
      console.log(`Status artifact written: ${result.path}`);
      console.log('');
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(formatReconciliationStatus(status));
  }

  // Exit with appropriate code
  process.exit(getStatusExitCode(status));
}

// Run
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
