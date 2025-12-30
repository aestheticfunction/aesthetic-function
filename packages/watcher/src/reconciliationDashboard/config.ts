/**
 * @aesthetic-function/watcher - reconciliationDashboard/config.ts
 *
 * Phase 13D: Dashboard Configuration.
 *
 * WHY: Centralizes environment variable parsing and default values
 * for the dashboard feature and CI integration.
 *
 * ENV VARS:
 * - RECONCILIATION_DASHBOARD_ON: Enable dashboard feature (default: true)
 * - DASHBOARD_LIMIT: Max runs to consider (default: 10)
 * - DASHBOARD_CI_STRICT: Exit 1 on FAIL verdict (default: false)
 * - DASHBOARD_MAX_WARN: Max warn-severity count before fail (default: none)
 * - DASHBOARD_MAX_FAIL: Max fail-severity count before fail (default: 1)
 * - DASHBOARD_FAIL_ON_FAIL_SEVERITY: Fail on any fail severity (default: true)
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import type { DashboardThresholds } from './types.js';

// =============================================================================
// ENV VAR CONSTANTS
// =============================================================================

/**
 * Enable dashboard feature.
 */
export const ENV_RECONCILIATION_DASHBOARD_ON = 'RECONCILIATION_DASHBOARD_ON';

/**
 * Max runs to consider.
 */
export const ENV_DASHBOARD_LIMIT = 'DASHBOARD_LIMIT';

/**
 * CI strict mode (exit 1 on FAIL).
 */
export const ENV_DASHBOARD_CI_STRICT = 'DASHBOARD_CI_STRICT';

/**
 * Max warn-severity count before fail.
 */
export const ENV_DASHBOARD_MAX_WARN = 'DASHBOARD_MAX_WARN';

/**
 * Max fail-severity count before fail.
 */
export const ENV_DASHBOARD_MAX_FAIL = 'DASHBOARD_MAX_FAIL';

/**
 * Fail on any fail severity.
 */
export const ENV_DASHBOARD_FAIL_ON_FAIL_SEVERITY =
  'DASHBOARD_FAIL_ON_FAIL_SEVERITY';

/**
 * Max verify mismatch increase before fail.
 */
export const ENV_DASHBOARD_MAX_VERIFY_MISMATCH_INCREASE =
  'DASHBOARD_MAX_VERIFY_MISMATCH_INCREASE';

/**
 * Max conflict increase before fail.
 */
export const ENV_DASHBOARD_MAX_CONFLICT_INCREASE =
  'DASHBOARD_MAX_CONFLICT_INCREASE';

/**
 * Max delta increase before fail.
 */
export const ENV_DASHBOARD_MAX_DELTA_INCREASE = 'DASHBOARD_MAX_DELTA_INCREASE';

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default limit for runs to consider.
 */
export const DEFAULT_DASHBOARD_LIMIT = 10;

/**
 * Default thresholds.
 */
export const DEFAULT_THRESHOLDS: DashboardThresholds = {
  failOnFailSeverity: true,
  maxFailCount: 1,
  maxWarnCount: undefined,
  maxVerifyMismatchIncrease: undefined,
  maxConflictIncrease: undefined,
  maxDeltaIncrease: undefined,
};

// =============================================================================
// ENV VAR PARSING
// =============================================================================

/**
 * Parse a boolean environment variable.
 * Defaults to true if not set, false if set to "false" or "0".
 */
export function parseBoolEnv(
  key: string,
  defaultValue: boolean = true
): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') {
    return false;
  }
  return true;
}

/**
 * Parse a number environment variable.
 */
export function parseNumberEnv(key: string): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

// =============================================================================
// CONFIG LOADING
// =============================================================================

/**
 * Check if dashboard feature is enabled.
 */
export function isDashboardEnabled(): boolean {
  return parseBoolEnv(ENV_RECONCILIATION_DASHBOARD_ON, true);
}

/**
 * Get the dashboard limit from environment.
 */
export function getDashboardLimit(): number {
  return parseNumberEnv(ENV_DASHBOARD_LIMIT) ?? DEFAULT_DASHBOARD_LIMIT;
}

/**
 * Check if CI strict mode is enabled.
 */
export function isCiStrictMode(): boolean {
  return parseBoolEnv(ENV_DASHBOARD_CI_STRICT, false);
}

/**
 * Load thresholds from environment variables.
 */
export function loadThresholdsFromEnv(): DashboardThresholds {
  return {
    failOnFailSeverity: parseBoolEnv(ENV_DASHBOARD_FAIL_ON_FAIL_SEVERITY, true),
    maxFailCount: parseNumberEnv(ENV_DASHBOARD_MAX_FAIL) ?? 1,
    maxWarnCount: parseNumberEnv(ENV_DASHBOARD_MAX_WARN),
    maxVerifyMismatchIncrease: parseNumberEnv(
      ENV_DASHBOARD_MAX_VERIFY_MISMATCH_INCREASE
    ),
    maxConflictIncrease: parseNumberEnv(ENV_DASHBOARD_MAX_CONFLICT_INCREASE),
    maxDeltaIncrease: parseNumberEnv(ENV_DASHBOARD_MAX_DELTA_INCREASE),
  };
}

/**
 * Dashboard configuration.
 */
export interface DashboardConfig {
  enabled: boolean;
  limit: number;
  strict: boolean;
  thresholds: DashboardThresholds;
}

/**
 * Load full dashboard configuration from environment.
 */
export function loadDashboardConfig(): DashboardConfig {
  return {
    enabled: isDashboardEnabled(),
    limit: getDashboardLimit(),
    strict: isCiStrictMode(),
    thresholds: loadThresholdsFromEnv(),
  };
}
