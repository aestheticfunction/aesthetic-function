#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - artifactInspector/cliArtifactInspect.ts
 *
 * Phase 15D: CLI for Artifact Inspection.
 *
 * USAGE:
 *   pnpm artifacts:inspect <artifact-path>
 *
 * OPTIONS:
 *   --json                Output JSON format
 *   --verbose, -v         Verbose output
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Usage error
 */

import { inspectArtifact } from './inspect.js';
import type { ArtifactInspectCliOptions } from './types.js';

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): ArtifactInspectCliOptions {
  const options: ArtifactInspectCliOptions = {
    artifactPath: '',
    json: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      options.artifactPath = arg;
    }
  }

  return options;
}

/**
 * Main CLI entry point.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);

  if (!options.artifactPath) {
    console.error('Error: Artifact path is required');
    console.error('');
    console.error('Usage: pnpm artifacts:inspect <artifact-path> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --json              Output JSON format');
    console.error('  --verbose, -v       Verbose output');
    return 2;
  }

  const result = inspectArtifact(options.artifactPath);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.formatted);
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliArtifactInspect')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
