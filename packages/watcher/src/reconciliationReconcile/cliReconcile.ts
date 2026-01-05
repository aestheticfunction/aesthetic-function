#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationReconcile/cliReconcile.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI.
 * Phase 14B: Profile support (deterministic flag presets).
 * Phase 14C: CI Wiring (Deterministic Gate + Run Capture).
 *
 * WHY: One command that runs the core Phase 12-13 read-only analysis sequence
 * for a single source file, producing a single bundle artifact.
 *
 * USAGE:
 *   pnpm figma:reconcile <source-file> [options]
 *
 * OPTIONS:
 *   --profile <name>      Profile preset: local, record, ci (default: local)
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --format <format>     Output format: human, json, ci (default: human)
 *   --json                Output JSON format (shorthand for --format json)
 *   --write               Write bundle artifact (default: profile-dependent)
 *   --no-write            Do not write bundle artifact
 *   --record              Record timeline run (requires RECONCILIATION_TIMELINE_ON=true)
 *   --strict              Exit 1 on strict-enabled step failures
 *   --verbose, -v         Show step invocations and discovery
 *   --limit <n>           Limit for dashboard/drift runs (default: 10)
 *   --help, -h            Show this help message
 *
 * PROFILES:
 *   local                 Human inspection: read-only, no recording (default)
 *   record                Intentional capture: write enabled, recording (requires env)
 *   ci                    CI gate: strict mode, always writes bundle (Phase 14C)
 *
 * EXIT CODES:
 *   0 - Success (PASS or WARN verdict)
 *   1 - Failure (FAIL verdict in strict mode)
 *   2 - Usage/config error
 */

import { argv, exit, env } from 'node:process';
import { resolve } from 'node:path';

import type { ReconcileCliOptions, ReconcileProfile, OutputFormat } from './types.js';
import { VALID_PROFILES } from './types.js';
import { runReconcile } from './compute.js';
import {
  writeBundleArtifact,
  formatBundle,
  formatBundleVerbose,
  formatBundleCi,
  getBundleArtifactPath,
} from './artifact.js';
import { resolveProfileConfig } from './profiles.js';

// =============================================================================
// USAGE
// =============================================================================

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:reconcile <source-file> [options]

Run the full Phase 12-13 reconciliation analysis for a single source file.

Arguments:
  <source-file>           Source file to reconcile (e.g., demo-app/src/App.tsx)

Options:
  --profile <name>        Profile preset: local, record, ci (default: local)
  --repo-root <path>      Repository root (default: auto-detect)
  --format <format>       Output format: human, json, ci (default: human)
  --json                  Output JSON format (shorthand for --format json)
  --write                 Write bundle artifact (overrides profile default)
  --no-write              Do not write bundle artifact (overrides profile default)
  --record                Record timeline run (overrides profile, requires env)
  --strict                Enable strict mode (overrides profile default)
  --verbose, -v           Show step invocations and discovery
  --limit <n>             Limit for dashboard/drift runs (default: 10)
  --help, -h              Show this help message

Profiles:
  local                   Human inspection: read-only, no recording (default)
  record                  Intentional capture: write + recording (requires env)
  ci                      CI gate: strict mode, always writes bundle (Phase 14C)

  CI profile always produces a bundle artifact for attribution.
  CLI flags override profile defaults. For example:
    --profile ci --no-strict   # ci profile but without strict mode

Output Formats (--format):
  human                   Human-readable formatted output (default)
  json                    Full bundle artifact as JSON
  ci                      CI-friendly key=value pairs for GitHub Actions

Steps (run in order):
  1. status     - Compute reconciliation status
  2. index      - Index existing artifacts
  3. timeline   - Load/record timeline
  4. drift      - Compute drift diffs
  5. dashboard  - Generate drift dashboard

Exit Codes:
  0                       Success (PASS or WARN verdict)
  1                       Failure (FAIL verdict in strict mode)
  2                       Usage/config error

Examples:
  figma:reconcile demo-app/src/App.tsx
  figma:reconcile demo-app/src/App.tsx --profile ci
  figma:reconcile demo-app/src/App.tsx --profile ci --format ci
  figma:reconcile demo-app/src/App.tsx --profile record
  figma:reconcile demo-app/src/App.tsx --json --verbose
`.trim());
}

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse result type.
 */
type ParseArgsResult =
  | ReconcileCliOptions
  | { error: string };

/**
 * Track which CLI flags were explicitly set (vs profile defaults).
 */
interface CliOverrides {
  strict?: boolean;
  record?: boolean;
  write?: boolean;
}

/**
 * Parse CLI arguments.
 *
 * Parses raw args and applies profile expansion with CLI overrides.
 * CLI flags always win over profile defaults.
 */
function parseArgs(args: string[]): ParseArgsResult {
  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return { error: '' }; // Empty error signals help (exit 0)
  }

  // Track explicit CLI overrides (undefined = not set, use profile default)
  const overrides: CliOverrides = {};
  let profileName: ReconcileProfile = 'local';

  const options: ReconcileCliOptions = {
    sourceFile: '',
  };

  const validFormats: OutputFormat[] = ['human', 'json', 'ci'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--profile' && args[i + 1]) {
      const p = args[i + 1] as ReconcileProfile;
      if (!VALID_PROFILES.includes(p)) {
        return { error: `Invalid profile: ${p}. Valid profiles: ${VALID_PROFILES.join(', ')}` };
      }
      profileName = p;
      i++;
    } else if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = resolve(args[i + 1]);
      i++;
    } else if (arg === '--format' && args[i + 1]) {
      const fmt = args[i + 1] as OutputFormat;
      if (!validFormats.includes(fmt)) {
        return { error: `Invalid format: ${fmt}. Valid formats: ${validFormats.join(', ')}` };
      }
      options.format = fmt;
      i++;
    } else if (arg === '--json') {
      options.format = 'json';
      options.json = true;
    } else if (arg === '--write') {
      overrides.write = true;
    } else if (arg === '--no-write') {
      overrides.write = false;
    } else if (arg === '--record') {
      overrides.record = true;
    } else if (arg === '--no-record') {
      overrides.record = false;
    } else if (arg === '--strict') {
      overrides.strict = true;
    } else if (arg === '--no-strict') {
      overrides.strict = false;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--limit' && args[i + 1]) {
      const num = parseInt(args[i + 1], 10);
      if (isNaN(num) || num < 1) {
        return { error: '--limit must be a positive integer' };
      }
      options.limit = num;
      i++;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else if (!options.sourceFile) {
      options.sourceFile = arg;
    } else {
      return { error: `Unexpected argument: ${arg}` };
    }
  }

  // Validate source file
  if (!options.sourceFile) {
    return { error: 'Source file is required' };
  }

  // Resolve profile config with CLI overrides
  const resolved = resolveProfileConfig(profileName, overrides);

  // Apply resolved config to options
  options.profile = profileName;
  options.strict = resolved.strict;
  options.record = resolved.record;
  options.write = resolved.write;
  options.alwaysWriteBundle = resolved.alwaysWriteBundle;
  options.ciWritePolicy = resolved.ciWritePolicy;

  // Validate record profile requires env
  if (options.record && env.RECONCILIATION_TIMELINE_ON !== 'true') {
    return {
      error: 'Recording requires RECONCILIATION_TIMELINE_ON=true environment variable',
    };
  }

  return options;
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main CLI entry point.
 *
 * @param args - CLI arguments (defaults to process.argv.slice(2))
 * @returns Exit code
 */
export async function main(args: string[] = argv.slice(2)): Promise<number> {
  const parsed = parseArgs(args);

  // Handle parse result
  if ('error' in parsed) {
    if (parsed.error) {
      // Usage error
      console.error(`Error: ${parsed.error}`);
      printUsage();
      return 2;
    }
    // Help was requested
    return 0;
  }

  const options = parsed;
  const outputFormat: OutputFormat = options.format ?? (options.json ? 'json' : 'human');
  const isJsonOutput = outputFormat === 'json';
  const isCiOutput = outputFormat === 'ci';

  // Run reconcile
  if (options.verbose && !isJsonOutput && !isCiOutput) {
    const profileInfo = options.profile ?? 'local';
    console.log(`Running reconcile for: ${options.sourceFile}`);
    console.log(`Profile: ${profileInfo} (strict=${options.strict}, record=${options.record}, write=${options.write})`);
    if (options.alwaysWriteBundle) {
      console.log(`CI mode: bundle will always be written`);
    }
    console.log('');
  }

  const { bundle, exitCode } = await runReconcile(options);

  // Phase 14C: Determine if bundle should be written
  // CI profile always writes bundle (alwaysWriteBundle=true), even if write=false
  const shouldWriteBundle = options.write || options.alwaysWriteBundle;
  let bundlePath: string | undefined;

  if (shouldWriteBundle) {
    const result = writeBundleArtifact(bundle, bundle.repoRoot);
    if (result.written) {
      bundlePath = result.path;
      if (!isJsonOutput && !isCiOutput) {
        console.log(`Wrote: ${result.path}`);
        console.log('');
      }
    } else {
      console.error(`Error writing bundle artifact: ${result.error}`);
    }
  }

  // Output based on format
  if (isJsonOutput) {
    console.log(JSON.stringify(bundle, null, 2));
  } else if (isCiOutput) {
    // Phase 14C: CI-friendly output
    console.log(formatBundleCi(bundle, bundlePath));
  } else if (options.verbose) {
    console.log(formatBundleVerbose(bundle));
  } else {
    console.log(formatBundle(bundle));
  }

  // Next action hint on failure (only for human output)
  if (!bundle.overall.ok && !isJsonOutput && !isCiOutput) {
    console.log('');
    if (!options.verbose) {
      console.log('Hint: Run with --verbose for more details');
    }
  }

  return exitCode;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliReconcile')) {
  main().then(code => exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    exit(2);
  });
}
