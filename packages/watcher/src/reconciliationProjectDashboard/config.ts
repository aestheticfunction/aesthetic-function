/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/config.ts
 *
 * Phase 13E.1: Project Dashboard Configuration.
 *
 * WHY: Centralizes environment variable parsing and CLI flag precedence
 * for project-level dashboard thresholds.
 *
 * ENV VARS:
 * - RECONCILIATION_DASHBOARD_FAIL_SCORE: Score below which verdict is FAIL (default: 60)
 * - RECONCILIATION_DASHBOARD_WARN_SCORE: Score at or above which verdict is PASS (default: 80)
 * - RECONCILIATION_DASHBOARD_MAX_SIGNALS: Max signals to display (default: 10)
 *
 * CLI FLAGS (override env vars):
 * - --fail-score <n>
 * - --warn-score <n>
 * - --max-signals <n>
 *
 * CONSTRAINTS:
 * - FAIL_SCORE < WARN_SCORE must be enforced
 * - Invalid configurations → error (exit 2)
 */

import type {
  ProjectDashboardThresholds,
  ResolveThresholdsResult,
} from './types.js';

import { DEFAULT_PROJECT_THRESHOLDS } from './types.js';

// =============================================================================
// ENV VAR CONSTANTS
// =============================================================================

/**
 * Score below which verdict is FAIL.
 */
export const ENV_FAIL_SCORE = 'RECONCILIATION_DASHBOARD_FAIL_SCORE';

/**
 * Score at or above which verdict is PASS.
 */
export const ENV_WARN_SCORE = 'RECONCILIATION_DASHBOARD_WARN_SCORE';

/**
 * Maximum signals to show.
 */
export const ENV_MAX_SIGNALS = 'RECONCILIATION_DASHBOARD_MAX_SIGNALS';

// =============================================================================
// ENV VAR PARSING
// =============================================================================

/**
 * Parse a number environment variable.
 */
function parseNumberEnv(key: string): number | undefined {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return undefined;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

// =============================================================================
// THRESHOLD LOADING
// =============================================================================

/**
 * Load thresholds from environment variables only.
 */
export function loadThresholdsFromEnv(): ProjectDashboardThresholds {
  return {
    failScore: parseNumberEnv(ENV_FAIL_SCORE) ?? DEFAULT_PROJECT_THRESHOLDS.failScore,
    warnScore: parseNumberEnv(ENV_WARN_SCORE) ?? DEFAULT_PROJECT_THRESHOLDS.warnScore,
    maxSignals: parseNumberEnv(ENV_MAX_SIGNALS) ?? DEFAULT_PROJECT_THRESHOLDS.maxSignals,
  };
}

/**
 * Validate threshold ordering invariant.
 *
 * Rule: failScore < warnScore
 */
function validateThresholds(thresholds: ProjectDashboardThresholds): string | undefined {
  if (thresholds.failScore >= thresholds.warnScore) {
    return `Invalid thresholds: failScore (${thresholds.failScore}) must be less than warnScore (${thresholds.warnScore})`;
  }
  if (thresholds.failScore < 0 || thresholds.failScore > 100) {
    return `Invalid failScore (${thresholds.failScore}): must be 0-100`;
  }
  if (thresholds.warnScore < 0 || thresholds.warnScore > 100) {
    return `Invalid warnScore (${thresholds.warnScore}): must be 0-100`;
  }
  if (thresholds.maxSignals < 1) {
    return `Invalid maxSignals (${thresholds.maxSignals}): must be positive`;
  }
  return undefined;
}

/**
 * Resolve thresholds with precedence: CLI flags > env vars > defaults.
 *
 * Returns error if threshold ordering is invalid.
 */
export function resolveThresholds(
  cliFailScore?: number,
  cliWarnScore?: number,
  cliMaxSignals?: number
): ResolveThresholdsResult {
  // Load from env first
  const envThresholds = loadThresholdsFromEnv();

  // CLI flags override env vars
  const thresholds: ProjectDashboardThresholds = {
    failScore: cliFailScore ?? envThresholds.failScore,
    warnScore: cliWarnScore ?? envThresholds.warnScore,
    maxSignals: cliMaxSignals ?? envThresholds.maxSignals,
  };

  // Validate
  const error = validateThresholds(thresholds);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, thresholds };
}

/**
 * Format thresholds for display.
 */
export function formatThresholds(thresholds: ProjectDashboardThresholds): string {
  const lines = [
    '=== DASHBOARD THRESHOLDS ===',
    `PASS ≥ ${thresholds.warnScore}`,
    `WARN ≥ ${thresholds.failScore}`,
    `FAIL < ${thresholds.failScore}`,
    `Max signals shown: ${thresholds.maxSignals}`,
  ];
  return lines.join('\n');
}

/**
 * Determine verdict from stability score and thresholds.
 */
export function determineVerdict(
  stabilityScore: number,
  thresholds: ProjectDashboardThresholds
): { verdict: 'PASS' | 'WARN' | 'FAIL'; explanation: string } {
  if (stabilityScore < thresholds.failScore) {
    return {
      verdict: 'FAIL',
      explanation: `Stability score ${stabilityScore} < ${thresholds.failScore} (fail threshold)`,
    };
  }
  if (stabilityScore < thresholds.warnScore) {
    return {
      verdict: 'WARN',
      explanation: `Stability score ${stabilityScore} < ${thresholds.warnScore} (warn threshold)`,
    };
  }
  return {
    verdict: 'PASS',
    explanation: `Stability score ${stabilityScore} ≥ ${thresholds.warnScore} (pass threshold)`,
  };
}
