#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/cliProjectDashboard.ts
 *
 * Phase 13E: CLI for Project Drift Dashboard.
 * Phase 13E.1: Thresholds & CI UX Hardening.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:project-dashboard <dir> [options]
 *
 * Options:
 *   --limit <n>         Max runs to consider per file (default: 10)
 *   --strict            CI strict mode (exit 1 on FAIL verdict)
 *   --json              Output JSON instead of formatted text
 *   --write             Write artifact to disk
 *   --verbose           Show detailed output (all files, all signals)
 *   --repo-root <path>  Explicit repository root
 *   --fail-score <n>    Score below which verdict is FAIL (default: 60)
 *   --warn-score <n>    Score at or above which verdict is PASS (default: 80)
 *   --max-signals <n>   Max signals to display (default: 10)
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  computeProjectDashboard,
} from './compute.js';

import {
  formatProjectDashboard,
  writeProjectDashboardArtifact,
} from './artifact.js';

import {
  getDashboardLimit,
  isCiStrictMode,
  loadThresholdsFromEnv as loadFileThresholdsFromEnv,
} from '../reconciliationDashboard/config.js';

import {
  resolveThresholds,
  formatThresholds,
} from './config.js';

import { getVerdictMessage } from './types.js';

import type { ProjectDashboardCliOptions, ProjectDashboardContext } from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): ProjectDashboardCliOptions | { error: string } {
  const options: ProjectDashboardCliOptions = {
    scanRoot: '',
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
    } else if (arg === '--fail-score') {
      i++;
      if (i >= args.length) {
        return { error: '--fail-score requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num)) {
        return { error: '--fail-score must be a number' };
      }
      options.failScore = num;
    } else if (arg === '--warn-score') {
      i++;
      if (i >= args.length) {
        return { error: '--warn-score requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num)) {
        return { error: '--warn-score must be a number' };
      }
      options.warnScore = num;
    } else if (arg === '--max-signals') {
      i++;
      if (i >= args.length) {
        return { error: '--max-signals requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--max-signals must be a positive integer' };
      }
      options.maxSignals = num;
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
Usage: figma:project-dashboard <dir> [options]

Generate a project-level drift dashboard aggregating all .tsx files.

Arguments:
  <dir>               Directory to scan (e.g., demo-app/src)

Options:
  --limit <n>         Max runs to consider per file (default: 10, env: DASHBOARD_LIMIT)
  --strict            CI strict mode - exit 1 on FAIL verdict (env: DASHBOARD_CI_STRICT)
  --json              Output JSON instead of formatted text
  --write             Write artifact to disk
  --verbose           Show detailed output (all files, all signals)
  --repo-root <path>  Explicit repository root

Threshold Options (Phase 13E.1):
  --fail-score <n>    Score below which verdict is FAIL (default: 60)
  --warn-score <n>    Score at or above which verdict is PASS (default: 80)
  --max-signals <n>   Max signals to display (default: 10)

Environment Variables:
  DASHBOARD_LIMIT                         Max runs to consider (default: 10)
  DASHBOARD_CI_STRICT                     Exit 1 on FAIL verdict (default: false)
  RECONCILIATION_DASHBOARD_FAIL_SCORE     Score for FAIL verdict (default: 60)
  RECONCILIATION_DASHBOARD_WARN_SCORE     Score for PASS verdict (default: 80)
  RECONCILIATION_DASHBOARD_MAX_SIGNALS    Max signals to display (default: 10)

Exit Codes:
  0                   Success (default), or PASS/WARN verdict
  1                   Error, or (with --strict) FAIL verdict
  2                   Usage error (invalid threshold configuration)

Examples:
  figma:project-dashboard demo-app/src
  figma:project-dashboard demo-app/src --json
  figma:project-dashboard demo-app/src --write --verbose
  figma:project-dashboard demo-app/src --strict
  figma:project-dashboard demo-app/src --fail-score 50 --warn-score 75
  figma:project-dashboard . --limit 20
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
    return 2; // Usage error
  }

  const options = parsed;

  // Resolve repo root
  const startCwd = cwd();
  const repoRoot = options.repoRoot ?? getRepoRoot(startCwd);

  // Determine strict mode
  const strict = options.strict ?? isCiStrictMode();

  // Load per-file thresholds from environment (for 13D)
  const fileThresholds = loadFileThresholdsFromEnv();

  // Resolve project thresholds (Phase 13E.1)
  // Priority: CLI flags > env vars > defaults
  const thresholdResult = resolveThresholds(
    options.failScore,
    options.warnScore,
    options.maxSignals
  );

  if (!thresholdResult.ok) {
    console.error(`Error: ${thresholdResult.error}`);
    printUsage();
    return 2; // Invalid configuration
  }

  const projectThresholds = thresholdResult.thresholds;

  // Print thresholds banner (Phase 13E.1) - always in non-JSON mode
  if (!options.json) {
    console.log(formatThresholds(projectThresholds));
    console.log('');
  }

  // Verbose header
  if (options.verbose && !options.json) {
    console.log(`Repo Root: ${repoRoot}`);
    console.log(`Scan Root: ${options.scanRoot}`);
    console.log(`Working Directory: ${startCwd}`);
    console.log(`Limit: ${options.limit}`);
    console.log(`Strict Mode: ${strict}`);
    console.log('');
  }

  // Build context
  const context: ProjectDashboardContext = {
    scanRoot: options.scanRoot,
    repoRoot,
    limit: options.limit,
    thresholds: fileThresholds,
    strict,
    projectThresholds,
  };

  // Compute project dashboard
  const result = await computeProjectDashboard(context);

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
    const writeResult = writeProjectDashboardArtifact(artifact, repoRoot);

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
    const formatted = formatProjectDashboard(artifact, repoRoot, options.verbose);
    console.log(formatted);

    // Print CI messaging (Phase 13E.1)
    const verdictMsg = getVerdictMessage(artifact.projectVerdict);
    console.log('');
    console.log(`${verdictMsg.emoji} ${verdictMsg.action}`);
  }

  // Return exit code from artifact
  return artifact.exitCode;
}

// Run CLI
main().then(code => exit(code));
