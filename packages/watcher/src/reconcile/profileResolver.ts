/**
 * @aesthetic-function/watcher - reconcile/profileResolver.ts
 *
 * Resolves the active policy profile from config, env, or defaults.
 *
 * RESOLUTION ORDER:
 *   1. ResolvedAfConfig.profile (from af.config.json + env merge)
 *   2. RECONCILIATION_POLICY env var (legacy/direct)
 *   3. Default: 'designer-first'
 *
 * WHY: Bridges the config system to the existing PolicyOptions type
 * that resolveWithPolicy() already consumes. One function call;
 * no structural change to the pipeline.
 */

import type { ResolvedAfConfig, PolicyProfileName } from '@aesthetic-function/shared';
import type { PolicyOptions } from './policy.js';
import type { OverridePrecedence } from './config.js';
import { getProfile, getDefaultProfile } from './profiles.js';

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Resolve the active profile and convert to PolicyOptions.
 *
 * The returned PolicyOptions is the same type that resolveWithPolicy()
 * already consumes. No new abstraction is introduced.
 *
 * @param config - Optional resolved config from loadAfConfig()
 * @returns PolicyOptions ready for resolveWithPolicy()
 */
export function resolveProfileToPolicyOptions(config?: ResolvedAfConfig): PolicyOptions {
  // Determine profile name from config or env
  const profileName = resolveProfileName(config);

  // Look up profile
  const profile = getProfile(profileName) ?? getDefaultProfile();

  // Map profile to PolicyOptions
  return {
    useOverrides: profile.useOverrides,
    precedence: profile.overridePrecedence as OverridePrecedence,
    // fileMtime is set per-file at call time, not from profile
  };
}

/**
 * Resolve the active profile name from config, env, or defaults.
 *
 * Priority:
 *   1. Config file profile (already merged with env by loadAfConfig)
 *   2. RECONCILIATION_POLICY env var (direct override)
 *   3. Default: 'designer-first'
 */
export function resolveProfileName(config?: ResolvedAfConfig): PolicyProfileName {
  // If config is provided, it already has env overrides merged
  if (config?.profile) {
    return config.profile;
  }

  // Direct env var fallback (when no config object is provided)
  const envProfile = process.env.RECONCILIATION_POLICY?.toLowerCase();
  if (envProfile && isValidProfileName(envProfile)) {
    return envProfile as PolicyProfileName;
  }

  return 'designer-first';
}

// =============================================================================
// HELPERS
// =============================================================================

const VALID_PROFILE_NAMES: PolicyProfileName[] = [
  'designer-first',
  'code-first',
  'balanced',
  'strict-review',
];

function isValidProfileName(name: string): name is PolicyProfileName {
  return VALID_PROFILE_NAMES.includes(name as PolicyProfileName);
}
