#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - artifactInspector/cliArtifactTrace.ts
 *
 * Phase 15D: CLI for Artifact Trace.
 *
 * USAGE:
 *   pnpm artifacts:trace <source-file>
 *
 * OPTIONS:
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --json                Output JSON format
 *   --verbose, -v         Verbose output
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Usage error
 */

import { resolve } from 'node:path';

import { getRepoRoot } from '../reconciliationIndex/index.js';
import { traceArtifacts, formatTrace } from './trace.js';
import type { ArtifactTraceCliOptions } from './types.js';

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): ArtifactTraceCliOptions {
  const options: ArtifactTraceCliOptions = {
    sourceFile: '',
    json: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = resolve(args[i + 1]);
      i++;
    } else if (arg === '--json') {
      options.json = true;
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
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);

  if (!options.sourceFile) {
    console.error('Error: Source file is required');
    console.error('');
    console.error('Usage: pnpm artifacts:trace <source-file> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --repo-root <path>  Repository root (default: auto-detect)');
    console.error('  --json              Output JSON format');
    console.error('  --verbose, -v       Verbose output');
    return 2;
  }

  const repoRoot = options.repoRoot ?? getRepoRoot();
  const result = await traceArtifacts(options.sourceFile, repoRoot);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTrace(result));
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliArtifactTrace')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
