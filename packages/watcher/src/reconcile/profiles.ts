/**
 * @aesthetic-function/watcher - reconcile/profiles.ts
 *
 * Built-in reconciliation policy profiles (Phase 15B).
 *
 * WHY: Named presets that map onto the existing resolveField() / resolveWithPolicy()
 * engine. Profiles set parameters — they do NOT add branches to resolution logic.
 *
 * CRITICAL INVARIANT:
 * - 'designer-first' produces identical behavior to current Phase 14F defaults
 * - 'code-first' maps to existing `if_newer_than_code` logic
 * - No profile modifies resolveField() or resolveWithPolicy()
 */

import type { PolicyProfile, PolicyProfileName } from '@aesthetic-function/shared';

// =============================================================================
// BUILT-IN PROFILES
// =============================================================================

/**
 * designer-first: Overrides always win (current default behavior).
 *
 * This profile produces ZERO behavioral change from Phase 14F.
 * It is the explicit name for what was previously the unnamed default.
 */
export const DESIGNER_FIRST: PolicyProfile = {
  name: 'designer-first',
  useOverrides: true,
  overridePrecedence: 'always',
  colorStrategy: 'token-first',
  canonicalStrict: false,
  conflictAction: 'apply',
};

/**
 * code-first: Overrides only win if newer than source file.
 *
 * Maps to existing USE_OVERRIDES=true + OVERRIDES_PRECEDENCE=if_newer_than_code.
 * Stale overrides get skipped=true in resolution (existing behavior).
 */
export const CODE_FIRST: PolicyProfile = {
  name: 'code-first',
  useOverrides: true,
  overridePrecedence: 'if_newer_than_code',
  colorStrategy: 'token-first',
  canonicalStrict: false,
  conflictAction: 'apply',
};

/**
 * balanced: Like code-first, but conflicts produce warnings.
 *
 * Disagreements between override and code are logged but not blocked.
 */
export const BALANCED: PolicyProfile = {
  name: 'balanced',
  useOverrides: true,
  overridePrecedence: 'if_newer_than_code',
  colorStrategy: 'token-first',
  canonicalStrict: false,
  conflictAction: 'warn',
};

/**
 * strict-review: All conflicts block until human review.
 *
 * Uses token-only canonical policy. Forces explicit resolution of
 * any disagreement between sources.
 */
export const STRICT_REVIEW: PolicyProfile = {
  name: 'strict-review',
  useOverrides: true,
  overridePrecedence: 'always',
  colorStrategy: 'token-only',
  canonicalStrict: true,
  conflictAction: 'block',
};

// =============================================================================
// PROFILE REGISTRY
// =============================================================================

/**
 * All built-in profiles, indexed by name.
 */
export const BUILT_IN_PROFILES: Record<PolicyProfileName, PolicyProfile> = {
  'designer-first': DESIGNER_FIRST,
  'code-first': CODE_FIRST,
  'balanced': BALANCED,
  'strict-review': STRICT_REVIEW,
};

/**
 * Get a built-in profile by name.
 *
 * @param name - Profile name
 * @returns The profile, or undefined if not found
 */
export function getProfile(name: PolicyProfileName): PolicyProfile | undefined {
  return BUILT_IN_PROFILES[name];
}

/**
 * Get the default profile (designer-first).
 * This matches existing Phase 14F behavior exactly.
 */
export function getDefaultProfile(): PolicyProfile {
  return DESIGNER_FIRST;
}
