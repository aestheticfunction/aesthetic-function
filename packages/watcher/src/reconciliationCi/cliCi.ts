#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationCi/cliCi.ts
 *
 * Phase 13F + 13F.1: CLI for CI Gate Summary with Trend Policy.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:ci <dir> [options]
 *
 * Options:
 *   --limit <n>             Max runs to consider per file (default: 10)
 *   --window <n>            Trend window size (default: 5)
 *   --improving-delta <n>   Minimum delta to classify as improving (default: 5)
 *   --worsening-delta <n>   Maximum delta to classify as worsening (default: -5)
 *   --fail-on-worsening     Fail CI on worsening trends (default: true)
 *   --no-fail-on-worsening  Don't fail CI on worsening trends
 *   --max-files <n>         Maximum files to evaluate for trends (default: 20)
 *   --strict                CI strict mode (exit 1 on FAIL verdict)
 *   --json                  Output JSON instead of formatted text
 *   --write                 Write artifact to disk
 *   --verbose               Show detailed output (all files, all signals, all trends)
 *   --repo-root <path>      Explicit repository root
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  computeCiGate,
} from './compute.js';

import {
  formatCiGate,
  writeCiGateArtifact,
} from './artifact.js';

import {
  resolveTrendPolicy,
  formatTrendPolicy,
  isCiStrictModeFromEnv,
  ENV_TREND_WINDOW,
  ENV_IMPROVING_DELTA,
  ENV_WORSENING_DELTA,
  ENV_FAIL_ON_WORSENING,
  ENV_MAX_FILES,
  ENV_CI_STRICT,
} from './config.js';

import { DEFAULT_TREND_POLICY } from './types.js';

import { getDashboardLimit } from '../reconciliationDashboard/config.js';

import type { CiGateCliOptions, CiGateContext } from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): CiGateCliOptions | { error: string } {
  const options: CiGateCliOptions = {
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
    } else if (arg === '--window') {
      i++;
      if (i >= args.length) {
        return { error: '--window requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--window must be a positive integer' };
      }
      options.window = num;
    } else if (arg === '--improving-delta') {
      i++;
      if (i >= args.length) {
        return { error: '--improving-delta requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num)) {
        return { error: '--improving-delta must be a number' };
      }
      options.improvingDelta = num;
    } else if (arg === '--worsening-delta') {
      i++;
      if (i >= args.length) {
        return { error: '--worsening-delta requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num)) {
        return { error: '--worsening-delta must be a number' };
      }
      options.worseningDelta = num;
    } else if (arg === '--fail-on-worsening') {
      options.failOnWorsening = true;
    } else if (arg === '--no-fail-on-worsening') {
      options.failOnWorsening = false;
    } else if (arg === '--max-files') {
      i++;
      if (i >= args.length) {
        return { error: '--max-files requires a number' };
      }
      const num = parseInt(args[i], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--max-files must be a positive integer' };
      }
      options.maxFiles = num;
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
    } else if (arg === '-h' || arg === '--help') {
      printUsage();
      return { error: '' }; // Empty error triggers exit without error message
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
  const d = DEFAULT_TREND_POLICY;
  console.log(`
Usage: figma:ci <dir> [options]

CI gate command for project-level pass/warn/fail decision with trend window.

Arguments:
  <dir>                     Directory to scan (e.g., demo-app/src)

Trend Policy Options:
  --window <n>              Trend window size (default: ${d.window})
  --improving-delta <n>     Min delta to classify as improving (default: ${d.improvingDelta})
  --worsening-delta <n>     Max delta to classify as worsening (default: ${d.worseningDelta})
  --fail-on-worsening       Fail CI on worsening trends (default)
  --no-fail-on-worsening    Don't fail CI on worsening trends
  --max-files <n>           Max files to evaluate for trends (default: ${d.maxFiles})

Other Options:
  --limit <n>               Max runs to consider per file (default: 10)
  --strict                  CI strict mode - exit 1 on FAIL verdict
  --json                    Output JSON instead of formatted text
  --write                   Write artifact to disk
  --verbose                 Show detailed output
  --repo-root <path>        Explicit repository root

Environment Variables:
  ${ENV_TREND_WINDOW}       Trend window size (default: ${d.window})
  ${ENV_IMPROVING_DELTA}    Improving delta threshold (default: ${d.improvingDelta})
  ${ENV_WORSENING_DELTA}    Worsening delta threshold (default: ${d.worseningDelta})
  ${ENV_FAIL_ON_WORSENING}  Fail on worsening (default: true)
  ${ENV_MAX_FILES}          Max files to evaluate (default: ${d.maxFiles})
  ${ENV_CI_STRICT}          Exit 1 on FAIL verdict (default: false)
  DASHBOARD_LIMIT           Max runs to consider (default: 10)

Exit Codes:
  0                         Default (PASS or WARN in non-strict mode)
  1                         FAIL verdict with --strict flag
  2                         Invalid configuration

Examples:
  figma:ci demo-app/src
  figma:ci demo-app/src --json
  figma:ci demo-app/src --write --verbose
  figma:ci demo-app/src --strict
  figma:ci demo-app/src --window 10 --worsening-delta -10
  figma:ci demo-app/src --no-fail-on-worsening
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
    if (parsed.error) {
      console.error(`Error: ${parsed.error}`);
      printUsage();
      return 2;
    }
    // Help was requested
    return 0;
  }

  const options = parsed;

  // Resolve trend policy (CLI > env > defaults)
  const policyResult = resolveTrendPolicy(options);

  if (!policyResult.ok) {
    console.error(`Configuration error: ${policyResult.error}`);
    printUsage();
    return 2;
  }

  const trendPolicy = policyResult.policy;

  // Resolve repo root
  const startCwd = cwd();
  const repoRoot = options.repoRoot ?? getRepoRoot(startCwd);

  // Determine strict mode
  const strict = options.strict ?? isCiStrictModeFromEnv();

  // Print trend policy banner (non-JSON mode)
  if (!options.json) {
    console.log(formatTrendPolicy(trendPolicy));
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
  const context: CiGateContext = {
    scanRoot: options.scanRoot,
    repoRoot,
    limit: options.limit,
    strict,
    trendPolicy,
  };

  // Compute CI gate
  const result = await computeCiGate(context);

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
    const writeResult = writeCiGateArtifact(artifact, repoRoot);

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
    const formatted = formatCiGate(artifact, repoRoot, options.verbose);
    console.log(formatted);
  }

  // Return exit code from artifact
  return artifact.exitCode;
}

// Run CLI
main().then(code => exit(code));
