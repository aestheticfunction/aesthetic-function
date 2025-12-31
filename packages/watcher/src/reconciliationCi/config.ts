/**
 * @aesthetic-function/watcher - reconciliationCi/config.ts
 *
 * Phase 13F.1: CI Trend Policy Configuration.
 *
 * WHY: Makes trend window, thresholds, and verdict rules explicit
 * and configurable via environment variables and CLI flags.
 *
 * SCOPE:
 * - Environment variable loading
 * - CLI flag precedence
 * - Invariant validation
 * - Policy formatting for CLI output
 *
 * CONSTRAINTS:
 * - Does NOT change trend computation semantics
 * - Does NOT modify any artifacts beyond optional metadata
 * - Deterministic resolution
 */

import type {
  CiTrendPolicy,
  CiGateCliOptions,
  ResolveTrendPolicyResult,
} from './types.js';

import { DEFAULT_TREND_POLICY } from './types.js';

// =============================================================================
// ENVIRONMENT VARIABLE NAMES
// =============================================================================

/**
 * Environment variable for trend window size.
 */
export const ENV_TREND_WINDOW = 'RECONCILIATION_CI_TREND_WINDOW';

/**
 * Environment variable for improving delta threshold.
 */
export const ENV_IMPROVING_DELTA = 'RECONCILIATION_CI_IMPROVING_DELTA';

/**
 * Environment variable for worsening delta threshold.
 */
export const ENV_WORSENING_DELTA = 'RECONCILIATION_CI_WORSENING_DELTA';

/**
 * Environment variable for fail-on-worsening flag.
 */
export const ENV_FAIL_ON_WORSENING = 'RECONCILIATION_CI_FAIL_ON_WORSENING';

/**
 * Environment variable for max files to evaluate.
 */
export const ENV_MAX_FILES = 'RECONCILIATION_CI_MAX_FILES';

/**
 * Environment variable for CI strict mode.
 */
export const ENV_CI_STRICT = 'RECONCILIATION_CI_STRICT';

// =============================================================================
// ENVIRONMENT LOADING
// =============================================================================

/**
 * Load trend policy from environment variables.
 *
 * Returns partial policy with only values that are explicitly set.
 */
export function loadTrendPolicyFromEnv(): Partial<CiTrendPolicy> {
  const partial: Partial<CiTrendPolicy> = {};

  // Window
  const windowEnv = process.env[ENV_TREND_WINDOW];
  if (windowEnv !== undefined) {
    const parsed = parseInt(windowEnv, 10);
    if (!isNaN(parsed)) {
      partial.window = parsed;
    }
  }

  // Improving delta
  const improvingEnv = process.env[ENV_IMPROVING_DELTA];
  if (improvingEnv !== undefined) {
    const parsed = parseInt(improvingEnv, 10);
    if (!isNaN(parsed)) {
      partial.improvingDelta = parsed;
    }
  }

  // Worsening delta
  const worseningEnv = process.env[ENV_WORSENING_DELTA];
  if (worseningEnv !== undefined) {
    const parsed = parseInt(worseningEnv, 10);
    if (!isNaN(parsed)) {
      partial.worseningDelta = parsed;
    }
  }

  // Fail on worsening
  const failOnWorseningEnv = process.env[ENV_FAIL_ON_WORSENING];
  if (failOnWorseningEnv !== undefined) {
    partial.failOnWorsening =
      failOnWorseningEnv === 'true' || failOnWorseningEnv === '1';
  }

  // Max files
  const maxFilesEnv = process.env[ENV_MAX_FILES];
  if (maxFilesEnv !== undefined) {
    const parsed = parseInt(maxFilesEnv, 10);
    if (!isNaN(parsed)) {
      partial.maxFiles = parsed;
    }
  }

  return partial;
}

/**
 * Check if CI strict mode is enabled via environment.
 */
export function isCiStrictModeFromEnv(): boolean {
  const value = process.env[ENV_CI_STRICT];
  return value === 'true' || value === '1';
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate trend policy invariants.
 *
 * Returns error message if invalid, undefined if valid.
 */
export function validateTrendPolicy(policy: CiTrendPolicy): string | undefined {
  // Window must be positive
  if (policy.window < 1) {
    return `Invalid window: ${policy.window}. Must be >= 1.`;
  }

  // Improving delta must be positive
  if (policy.improvingDelta <= 0) {
    return `Invalid improving-delta: ${policy.improvingDelta}. Must be > 0.`;
  }

  // Worsening delta must be negative
  if (policy.worseningDelta >= 0) {
    return `Invalid worsening-delta: ${policy.worseningDelta}. Must be < 0.`;
  }

  // Max files must be positive
  if (policy.maxFiles < 1) {
    return `Invalid max-files: ${policy.maxFiles}. Must be >= 1.`;
  }

  return undefined;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve trend policy with precedence: CLI > env > defaults.
 *
 * Returns error result if configuration is invalid.
 */
export function resolveTrendPolicy(
  cliOptions?: Partial<CiGateCliOptions>
): ResolveTrendPolicyResult {
  // Start with defaults
  const policy: CiTrendPolicy = { ...DEFAULT_TREND_POLICY };

  // Apply environment overrides
  const envPolicy = loadTrendPolicyFromEnv();
  if (envPolicy.window !== undefined) {
    policy.window = envPolicy.window;
  }
  if (envPolicy.improvingDelta !== undefined) {
    policy.improvingDelta = envPolicy.improvingDelta;
  }
  if (envPolicy.worseningDelta !== undefined) {
    policy.worseningDelta = envPolicy.worseningDelta;
  }
  if (envPolicy.failOnWorsening !== undefined) {
    policy.failOnWorsening = envPolicy.failOnWorsening;
  }
  if (envPolicy.maxFiles !== undefined) {
    policy.maxFiles = envPolicy.maxFiles;
  }

  // Apply CLI overrides (highest priority)
  if (cliOptions?.window !== undefined) {
    policy.window = cliOptions.window;
  }
  if (cliOptions?.improvingDelta !== undefined) {
    policy.improvingDelta = cliOptions.improvingDelta;
  }
  if (cliOptions?.worseningDelta !== undefined) {
    policy.worseningDelta = cliOptions.worseningDelta;
  }
  if (cliOptions?.failOnWorsening !== undefined) {
    policy.failOnWorsening = cliOptions.failOnWorsening;
  }
  if (cliOptions?.maxFiles !== undefined) {
    policy.maxFiles = cliOptions.maxFiles;
  }

  // Validate
  const error = validateTrendPolicy(policy);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, policy };
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format trend policy for CLI display.
 *
 * Returns lines showing the resolved policy configuration.
 */
export function formatTrendPolicy(policy: CiTrendPolicy): string {
  const lines: string[] = [];

  lines.push('=== CI TREND POLICY ===');
  lines.push(`Window: ${policy.window} runs`);
  lines.push(`Improving: ≥ +${policy.improvingDelta}`);
  lines.push(`Worsening: ≤ ${policy.worseningDelta}`);
  lines.push(`Fail on worsening: ${policy.failOnWorsening ? 'enabled' : 'disabled'}`);
  lines.push(`Max files evaluated: ${policy.maxFiles}`);

  return lines.join('\n');
}

/**
 * Determine CI verdict based on trend analysis and policy.
 *
 * WHY: Centralizes verdict determination logic for testability.
 *
 * Rules:
 * - If strict mode AND failOnWorsening AND any worsening files → FAIL
 * - If any worsening files (non-strict or !failOnWorsening) → WARN
 * - Otherwise → PASS
 */
export function determineCiVerdict(
  worseningCount: number,
  strict: boolean,
  failOnWorsening: boolean
): 'PASS' | 'WARN' | 'FAIL' {
  if (worseningCount === 0) {
    return 'PASS';
  }

  if (strict && failOnWorsening) {
    return 'FAIL';
  }

  return 'WARN';
}
