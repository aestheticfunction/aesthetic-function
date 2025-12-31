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
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --json                Output JSON format
 *   --write               Write status artifact (always, even if CLEAN)
 *   --verbose             Show artifact discovery paths
 *
 * EXIT CODES:
 *   0 - PASS or WARN
 *   1 - FAIL
 *
 * Phase 12J.1: Fixed to use correct artifact names and auto-detect repo root.
 * Phase 12J.3: --write now always writes artifact, even when CLEAN.
 */

import { resolve, join } from 'node:path';

import type { ReconciliationStatusContext } from './types.js';
import {
  loadArtifactsWithDiscovery,
  computeReconciliationStatus,
  getStatusExitCode,
  getRepoRoot,
} from './compute.js';
import { writeReconciliationStatusArtifact, formatReconciliationStatus } from './artifact.js';

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
 * Format discovery information for CLI output.
 */
function formatDiscovery(discovery: {
  repoRoot: string;
  normalizedSourceFile: string;
  applyCheckedPaths: string[];
  verifyCheckedPaths: string[];
  rollbackCheckedPaths: string[];
}, artifacts: { apply: { found: boolean }; verify: { found: boolean }; rollbackPreview: { found: boolean } }): string {
  const lines: string[] = [];
  lines.push('Artifact Discovery:');
  lines.push(`  Repo Root: ${discovery.repoRoot}`);
  lines.push(`  Source File (canonical): ${discovery.normalizedSourceFile}`);
  lines.push('');
  lines.push('  Apply Artifact:');
  for (const path of discovery.applyCheckedPaths) {
    const found = artifacts.apply.found && discovery.applyCheckedPaths.indexOf(path) === discovery.applyCheckedPaths.length - 1 
      ? artifacts.apply.found : false;
    lines.push(`    ${found ? '✓' : '✗'} ${path}`);
  }
  lines.push('');
  lines.push('  Verify Artifact:');
  for (const path of discovery.verifyCheckedPaths) {
    lines.push(`    ${artifacts.verify.found ? '✓' : '✗'} ${path}`);
  }
  lines.push('');
  lines.push('  Rollback Preview Artifact:');
  for (const path of discovery.rollbackCheckedPaths) {
    lines.push(`    ${artifacts.rollbackPreview.found ? '✓' : '✗'} ${path}`);
  }
  return lines.join('\n');
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
    console.error('  --repo-root <path>  Repository root (default: auto-detect)');
    console.error('  --json              Output JSON format');
    console.error('  --write             Write status artifact');
    console.error('  --verbose, -v       Show artifact discovery paths');
    process.exit(2);
  }

  // Auto-detect repo root if not provided
  const repoRoot = options.repoRoot || getRepoRoot();

  // Create context
  const context: ReconciliationStatusContext = {
    sourceFile: options.sourceFile,
    repoRoot,
  };

  // Load artifacts with discovery information
  const { artifacts, discovery } = await loadArtifactsWithDiscovery(context);

  // Show discovery info if verbose
  if (options.verbose && !options.json) {
    console.log(formatDiscovery(discovery, artifacts));
    console.log('');
  }

  // Compute status
  const status = computeReconciliationStatus(artifacts, options.sourceFile);

  // Write artifact if requested
  // Phase 12J.3: Always write when --write is specified, even if CLEAN
  if (options.write) {
    const result = await writeReconciliationStatusArtifact(status, context, { force: true });
    if (!options.json) {
      console.log(`Wrote: ${result.path}`);
      if (options.verbose) {
        console.log(`  Full path: ${join(context.repoRoot, result.path)}`);
      }
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
