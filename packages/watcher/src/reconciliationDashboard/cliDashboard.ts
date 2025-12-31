#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationDashboard/cliDashboard.ts
 *
 * Phase 13D: CLI for Drift Summary Dashboard.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:dashboard <file> [options]
 *
 * Options:
 *   --limit <n>       Max runs to consider (default: 10)
 *   --from <runId>    Start from this run ID
 *   --to <runId>      End at this run ID
 *   --strict          CI strict mode (exit 1 on FAIL verdict)
 *   --json            Output JSON instead of formatted text
 *   --write           Write artifact to disk
 *   --verbose         Show detailed output (rationale, highlights)
 *   --repo-root <path>  Explicit repository root
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  normalizeSourcePath,
  computeDashboard,
} from './compute.js';

import { formatDashboard, writeDashboardArtifact } from './artifact.js';

import { getDashboardLimit, isCiStrictMode, loadThresholdsFromEnv } from './config.js';

import type { DashboardCliOptions, DashboardContext } from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): DashboardCliOptions | { error: string } {
  const options: DashboardCliOptions = {
    sourceFile: '',
    limit: getDashboardLimit(),
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
    } else if (arg === '--from') {
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
Usage: figma:dashboard <file> [options]

Generate a drift summary dashboard for a source file.

Arguments:
  <file>              Source file to analyze (e.g., demo-app/src/App.tsx)

Options:
  --limit <n>         Max runs to consider (default: 10, env: DASHBOARD_LIMIT)
  --from <runId>      Start from this run ID
  --to <runId>        End at this run ID
  --strict            CI strict mode - exit 1 on FAIL verdict (env: DASHBOARD_CI_STRICT)
  --json              Output JSON instead of formatted text
  --write             Write artifact to disk
  --verbose           Show detailed output (rationale, highlights)
  --repo-root <path>  Explicit repository root

Environment Variables:
  RECONCILIATION_DASHBOARD_ON   Enable dashboard feature (default: true)
  DASHBOARD_LIMIT               Max runs to consider (default: 10)
  DASHBOARD_CI_STRICT           Exit 1 on FAIL verdict (default: false)
  DASHBOARD_FAIL_ON_FAIL_SEVERITY  Fail on any fail severity (default: true)
  DASHBOARD_MAX_FAIL            Max fail count before fail (default: 1)
  DASHBOARD_MAX_WARN            Max warn count before fail (default: none)

Examples:
  figma:dashboard demo-app/src/App.tsx
  figma:dashboard demo-app/src/App.tsx --json
  figma:dashboard demo-app/src/App.tsx --limit 20 --verbose
  figma:dashboard demo-app/src/App.tsx --strict --write
  figma:dashboard demo-app/src/App.tsx --from abc12345 --to def67890
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

  // Determine strict mode
  const strict = options.strict ?? isCiStrictMode();

  // Load thresholds from environment
  const thresholds = loadThresholdsFromEnv();

  // Verbose header
  if (options.verbose && !options.json) {
    console.log(`Repo Root: ${repoRoot}`);
    console.log(`Source (canonical): ${sourceCanonical}`);
    console.log(`Working Directory: ${startCwd}`);
    console.log(`Limit: ${options.limit}`);
    console.log(`Strict Mode: ${strict}`);
    console.log('');
  }

  // Build context
  const context: DashboardContext = {
    sourceFile: sourceCanonical,
    repoRoot,
    limit: options.limit,
    fromRunId: options.fromRunId,
    toRunId: options.toRunId,
    thresholds,
    strict,
  };

  // Compute dashboard
  const result = await computeDashboard(context);

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
    const writeResult = writeDashboardArtifact(artifact, repoRoot);

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
    const formatted = formatDashboard(artifact, repoRoot, options.verbose);
    console.log(formatted);
  }

  // Return exit code from artifact
  return artifact.exitCode;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliDashboard')) {
  main().then(code => exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    exit(2);
  });
}
