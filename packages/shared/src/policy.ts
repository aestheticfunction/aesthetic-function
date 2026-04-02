/**
 * @aesthetic-function/shared - policy.ts
 *
 * Reconciliation policy profile type definitions.
 *
 * WHY: Named presets that map onto the existing resolveField() / resolveWithPolicy()
 * engine without modifying resolution logic. Profiles are parameter stores, not
 * engine forks.
 *
 * Each profile maps to existing configuration values:
 * - OverridePrecedence (from reconcile/config.ts)
 * - ResolutionPolicy strategies (from canonicalResolverPolicy/types.ts)
 * - Conflict action (how disagreements are handled)
 */

// =============================================================================
// OVERRIDE PRECEDENCE (re-exported for config portability)
// =============================================================================

/**
 * Override precedence modes.
 * Mirrors reconcile/config.ts OverridePrecedence for shared use.
 */
export type OverridePrecedence = 'always' | 'if_newer_than_code';

// =============================================================================
// CONFLICT ACTION
// =============================================================================

/**
 * How to handle conflicts where multiple sources disagree.
 *
 * - 'apply': Apply the winning source silently (current default behavior)
 * - 'warn': Apply the winning source but log a warning
 * - 'block': Block the operation pending human review
 */
export type ConflictAction = 'apply' | 'warn' | 'block';

// =============================================================================
// POLICY PROFILE
// =============================================================================

/**
 * A named reconciliation policy profile.
 *
 * Maps to existing configuration values consumed by resolveField() and
 * resolveWithPolicy(). Profiles do NOT add branches to resolution logic.
 */
export interface PolicyProfile {
  /** Human-readable profile name */
  name: string;

  /** Whether overrides are enabled */
  useOverrides: boolean;

  /** Override precedence mode */
  overridePrecedence: OverridePrecedence;

  /** Canonical color strategy */
  colorStrategy: 'token-first' | 'hex-allowed' | 'token-only';

  /** Canonical strict mode */
  canonicalStrict: boolean;

  /** How to handle conflicts where sources disagree */
  conflictAction: ConflictAction;
}
