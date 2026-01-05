/**
 * @aesthetic-function/watcher - reconciliationSources/cliSources.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery.
 *
 * WHY: CLI entry point for source discovery and chunking.
 *
 * USAGE:
 *   # Discover sources (outputs JSON list)
 *   pnpm figma:sources
 *
 *   # With glob pattern
 *   pnpm figma:sources --glob "src/**\/*.tsx"
 *
 *   # With chunk output
 *   pnpm figma:sources --chunk-size 5 --chunk-index 0
 *
 *   # Matrix indices only
 *   pnpm figma:sources --matrix-indices --chunk-size 5
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SourcesCliOptions, SourceDiscoveryResult } from './types.js';
import { DEFAULT_CHUNK_SIZE, DEFAULT_IGNORE_PATTERNS } from './types.js';
import { discoverSources } from './discover.js';
import { chunkSources, getChunk } from './chunk.js';

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

function parseCliArgs(args: string[]): SourcesCliOptions {
  const options: SourcesCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--repo-root':
        options.repoRoot = args[++i];
        break;
      case '--glob':
        options.glob = args[++i];
        break;
      case '--manifest':
        options.manifestPath = args[++i];
        break;
      case '--source':
        options.sources = options.sources || [];
        options.sources.push(args[++i]);
        break;
      case '--ignore':
        options.ignore = options.ignore || [];
        options.ignore.push(args[++i]);
        break;
      case '--chunk-size':
        options.chunkSize = parseInt(args[++i], 10);
        break;
      case '--chunk-index':
        options.chunkIndex = parseInt(args[++i], 10);
        break;
      case '--matrix-indices':
        options.matrixIndices = true;
        break;
      case '--output':
        options.output = args[++i] as 'json' | 'list' | 'count';
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
figma:sources - Discover source files for reconciliation

USAGE:
  pnpm figma:sources [options]

OPTIONS:
  --repo-root <path>     Repository root (default: cwd)
  --glob <pattern>       Glob pattern for source files
  --manifest <path>      Path to manifest file (default: reconcile.sources.json)
  --source <path>        Explicit source file (can be repeated)
  --ignore <pattern>     Ignore pattern (can be repeated)
  --chunk-size <n>       Sources per chunk (default: ${DEFAULT_CHUNK_SIZE})
  --chunk-index <n>      Get specific chunk (0-indexed)
  --matrix-indices       Output only chunk indices for GitHub Actions matrix
  --output <format>      Output format: json, list, count (default: json)
  --help, -h             Show this help

EXAMPLES:
  # Discover all sources
  pnpm figma:sources

  # With custom glob
  pnpm figma:sources --glob "src/**/*.tsx"

  # Get chunk 0 of 5-source chunks
  pnpm figma:sources --chunk-size 5 --chunk-index 0

  # Output matrix indices for GitHub Actions
  pnpm figma:sources --matrix-indices --chunk-size 5

  # Just the count
  pnpm figma:sources --output count
`);
}

// =============================================================================
// CLI OUTPUT FORMATTING
// =============================================================================

interface CliOutput {
  stdout: string;
  exitCode: number;
}

function formatOutput(
  discoveryResult: SourceDiscoveryResult,
  options: SourcesCliOptions
): CliOutput {
  const { sources } = discoveryResult;
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkIndex,
    matrixIndices,
    output = 'json',
  } = options;

  // Matrix indices mode
  if (matrixIndices) {
    const result = chunkSources(sources, { chunkSize });
    return {
      stdout: JSON.stringify(result.indices),
      exitCode: 0,
    };
  }

  // Specific chunk mode
  if (chunkIndex !== undefined) {
    const chunk = getChunk(sources, chunkIndex, { chunkSize });
    if (!chunk) {
      return {
        stdout: JSON.stringify({ error: `Chunk ${chunkIndex} not found` }),
        exitCode: 1,
      };
    }
    return {
      stdout: JSON.stringify(chunk.sources),
      exitCode: 0,
    };
  }

  // Standard output modes
  switch (output) {
    case 'list':
      return {
        stdout: sources.join('\n'),
        exitCode: 0,
      };
    case 'count':
      return {
        stdout: String(sources.length),
        exitCode: 0,
      };
    case 'json':
    default:
      return {
        stdout: JSON.stringify(discoveryResult, null, 2),
        exitCode: 0,
      };
  }
}

// =============================================================================
// MAIN CLI FUNCTION
// =============================================================================

export async function runSourcesCli(args: string[]): Promise<void> {
  const options = parseCliArgs(args);

  // Determine repo root
  const repoRoot = options.repoRoot
    ? resolve(options.repoRoot)
    : process.cwd();

  if (!existsSync(repoRoot)) {
    console.error(`Error: Repository root does not exist: ${repoRoot}`);
    process.exit(1);
  }

  // Merge ignore patterns
  const ignore = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(options.ignore || []),
  ];

  // Run discovery
  const discoveryResult = discoverSources({
    repoRoot,
    glob: options.glob,
    manifestPath: options.manifestPath,
    sources: options.sources,
    ignore,
    filterExisting: true,
  });

  // Format and output
  const { stdout, exitCode } = formatOutput(discoveryResult, options);
  console.log(stdout);

  // Print warnings to stderr
  if (discoveryResult.warnings) {
    for (const warning of discoveryResult.warnings) {
      console.error(`Warning: ${warning}`);
    }
  }

  process.exit(exitCode);
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runSourcesCli(process.argv.slice(2));
}
