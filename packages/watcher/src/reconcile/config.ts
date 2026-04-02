/**
 * @aesthetic-function/watcher - reconcile/config.ts
 *
 * Configuration helpers for override feature flags.
 *
 * Environment Variables:
 * - USE_OVERRIDES (default: true) - Enable/disable design overrides entirely
 * - OVERRIDES_PRECEDENCE (default: always) - Control when overrides are applied
 *   - "always": Overrides always win over code values
 *   - "if_newer_than_code": Only apply overrides newer than the source file
 *
 * Config file support (Phase 15A):
 * - When a ResolvedAfConfig is provided, its values take priority over env vars.
 * - Without a config, behavior is identical to Phase 14F.
 */

import type { ResolvedAfConfig } from '@aesthetic-function/shared';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Override precedence modes.
 */
export type OverridePrecedence = 'always' | 'if_newer_than_code';

// =============================================================================
// CONFIGURATION HELPERS
// =============================================================================

/**
 * Check if design overrides are enabled.
 *
 * @param config - Optional resolved config from loadAfConfig()
 * @returns true if USE_OVERRIDES is not explicitly set to 'false' or '0'
 */
export function getUseOverrides(config?: ResolvedAfConfig): boolean {
  // Config takes priority when provided
  if (config) {
    return config.overrides.enabled;
  }

  const flag = process.env.USE_OVERRIDES?.toLowerCase();
  // Default to true if not set
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag !== 'false' && flag !== '0';
}

/**
 * Get the override precedence mode.
 *
 * @param config - Optional resolved config from loadAfConfig()
 * @returns 'always' or 'if_newer_than_code'
 */
export function getOverridesPrecedence(config?: ResolvedAfConfig): OverridePrecedence {
  // Config takes priority when provided
  if (config) {
    return config.overrides.precedence;
  }

  const value = process.env.OVERRIDES_PRECEDENCE?.toLowerCase();
  if (value === 'if_newer_than_code') {
    return 'if_newer_than_code';
  }
  // Default to 'always'
  return 'always';
}

/**
 * Check if an override timestamp is newer than the file modification time.
 *
 * @param lastUpdated - ISO timestamp string from override
 * @param fileMtime - File modification time
 * @returns true if override is newer, false if older or invalid
 */
export function isOverrideNewerThanFile(
  lastUpdated: string | undefined,
  fileMtime: Date
): boolean {
  if (!lastUpdated) {
    return false;
  }

  try {
    const overrideTime = new Date(lastUpdated);
    // Check for invalid date
    if (isNaN(overrideTime.getTime())) {
      return false;
    }
    return overrideTime > fileMtime;
  } catch {
    return false;
  }
}
