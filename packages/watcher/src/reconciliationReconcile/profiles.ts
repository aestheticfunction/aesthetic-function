/**
 * @file Reconcile Profile Configurations
 *
 * Named profiles that expand to deterministic flag presets.
 * Pure configuration + routing. No behavior invention.
 *
 * Profiles are syntax sugar: `--profile record` expands to explicit flags.
 * CLI flags always override profile defaults.
 *
 * @module reconciliationReconcile/profiles
 */

import type { ReconcileProfile, ReconcileProfileConfig } from './types.js';

// =============================================================================
// PROFILE CONFIGURATIONS
// =============================================================================

/**
 * Profile configuration map.
 *
 * Each profile expands to a base set of flags:
 * - local: Human inspection, read-only, no recording
 * - record: Intentional run capture, write enabled
 * - ci: CI gate, strict mode, read-only
 *
 * CLI flags override these defaults.
 */
export const PROFILE_CONFIGS: Record<ReconcileProfile, ReconcileProfileConfig> = {
  /**
   * Local development profile (default).
   *
   * Human inspection mode - read-only, no recording.
   * Safe for iterative development without side effects.
   */
  local: {
    strict: false,
    record: false,
    write: false,
  },

  /**
   * Record profile.
   *
   * Intentional run capture mode - enables timeline recording and writes.
   * Requires RECONCILIATION_TIMELINE_ON=true environment variable.
   * Used when explicitly capturing a reconciliation run for history.
   */
  record: {
    strict: false,
    record: true,
    write: true,
  },

  /**
   * CI profile.
   *
   * CI gate mode - strict validation, read-only.
   * Fails on any strict-enabled step issues.
   * Used in CI pipelines to gate deployments.
   */
  ci: {
    strict: true,
    record: false,
    write: false,
  },
} as const;

// =============================================================================
// PROFILE UTILITIES
// =============================================================================

/**
 * Expand a profile to its base flag configuration.
 *
 * @param profile - Named profile to expand
 * @returns Base flag configuration for the profile
 */
export function expandProfile(profile: ReconcileProfile): ReconcileProfileConfig {
  return PROFILE_CONFIGS[profile];
}

/**
 * Merge CLI overrides with profile defaults.
 *
 * CLI flags always win over profile defaults.
 * Only explicitly-set CLI flags override (undefined means "use profile default").
 *
 * @param profile - Base profile configuration
 * @param overrides - CLI flag overrides (undefined values are ignored)
 * @returns Merged configuration
 */
export function mergeWithOverrides(
  profile: ReconcileProfileConfig,
  overrides: Partial<ReconcileProfileConfig>,
): ReconcileProfileConfig {
  return {
    strict: overrides.strict ?? profile.strict,
    record: overrides.record ?? profile.record,
    write: overrides.write ?? profile.write,
  };
}

/**
 * Resolve final configuration from profile and CLI overrides.
 *
 * @param profileName - Named profile (defaults to 'local')
 * @param overrides - CLI flag overrides
 * @returns Final merged configuration
 */
export function resolveProfileConfig(
  profileName: ReconcileProfile = 'local',
  overrides: Partial<ReconcileProfileConfig> = {},
): ReconcileProfileConfig {
  const base = expandProfile(profileName);
  return mergeWithOverrides(base, overrides);
}
