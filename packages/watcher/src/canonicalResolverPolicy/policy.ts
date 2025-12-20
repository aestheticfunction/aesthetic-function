/**
 * @aesthetic-function/watcher - canonicalResolverPolicy/policy.ts
 *
 * Resolution Policy Implementation (Phase 10G).
 *
 * WHY: Policy controls how strictly canonical resolution is enforced.
 * Different teams have different requirements - some want strict token-only,
 * others allow hex fallbacks. This module provides that configurability.
 *
 * SCOPE: Read-only policy evaluation. No writes, no mutations.
 */

import type {
  ResolutionPolicy,
  ColorStrategy,
  SpacingScaleStrategy,
  RadiusScaleStrategy,
  TypographyScaleStrategy,
  PolicyViolation,
  PolicyResult,
} from './types.js';
import type { CanonicalResolution, ResolvedValue } from '../canonicalResolver/types.js';

// =============================================================================
// DEFAULT POLICY
// =============================================================================

/**
 * Default resolution policy.
 *
 * Safe defaults that don't change existing behavior:
 * - token-first for colors (prefer tokens, allow hex)
 * - 8pt grid for spacing
 * - default scales for radius/typography
 * - strict=false (violations are notes, not failures)
 */
export const DEFAULT_POLICY: ResolutionPolicy = {
  colorStrategy: 'token-first',
  spacingScale: '8pt',
  radiusScale: 'default',
  typographyScale: 'default',
  strict: false,
};

// =============================================================================
// POLICY FROM ENVIRONMENT
// =============================================================================

/**
 * Get resolution policy from environment variables.
 *
 * Environment variables:
 * - CANONICAL_STRICT: 'true' | 'false' (default: false)
 * - CANONICAL_COLOR_STRATEGY: 'token-first' | 'hex-allowed' | 'token-only' (default: token-first)
 * - CANONICAL_SPACING_SCALE: '8pt' | 'token-only' | 'custom' (default: 8pt)
 * - CANONICAL_RADIUS_SCALE: 'default' | 'token-only' | 'custom' (default: default)
 * - CANONICAL_TYPOGRAPHY_SCALE: 'default' | 'token-only' | 'custom' (default: default)
 *
 * @returns Resolution policy from environment, falling back to defaults
 */
export function getResolutionPolicyFromEnv(): ResolutionPolicy {
  const strict = process.env.CANONICAL_STRICT === 'true';

  const colorStrategy = parseColorStrategy(process.env.CANONICAL_COLOR_STRATEGY);
  const spacingScale = parseSpacingScale(process.env.CANONICAL_SPACING_SCALE);
  const radiusScale = parseRadiusScale(process.env.CANONICAL_RADIUS_SCALE);
  const typographyScale = parseTypographyScale(process.env.CANONICAL_TYPOGRAPHY_SCALE);

  return {
    colorStrategy,
    spacingScale,
    radiusScale,
    typographyScale,
    strict,
  };
}

/**
 * Parse color strategy from string.
 */
function parseColorStrategy(value: string | undefined): ColorStrategy {
  if (value === 'token-first' || value === 'hex-allowed' || value === 'token-only') {
    return value;
  }
  return DEFAULT_POLICY.colorStrategy;
}

/**
 * Parse spacing scale from string.
 */
function parseSpacingScale(value: string | undefined): SpacingScaleStrategy {
  if (value === '8pt' || value === 'token-only' || value === 'custom') {
    return value;
  }
  return DEFAULT_POLICY.spacingScale;
}

/**
 * Parse radius scale from string.
 */
function parseRadiusScale(value: string | undefined): RadiusScaleStrategy {
  if (value === 'default' || value === 'token-only' || value === 'custom') {
    return value;
  }
  return DEFAULT_POLICY.radiusScale;
}

/**
 * Parse typography scale from string.
 */
function parseTypographyScale(value: string | undefined): TypographyScaleStrategy {
  if (value === 'default' || value === 'token-only' || value === 'custom') {
    return value;
  }
  return DEFAULT_POLICY.typographyScale;
}

// =============================================================================
// POLICY APPLICATION
// =============================================================================

/**
 * Apply policy to a canonical resolution and detect violations.
 *
 * This function evaluates each resolved value against the policy and
 * produces a list of violations. It does NOT modify the resolution.
 *
 * @param resolution - The canonical resolution from Phase 10F
 * @param policy - The resolution policy to apply
 * @param context - Optional context for violation reporting (file, componentKey)
 * @returns Policy result with pass/fail counts and violations
 */
export function applyPolicyToResolution(
  resolution: CanonicalResolution,
  policy: ResolutionPolicy,
  context?: { file?: string; componentKey?: string },
): PolicyResult {
  const violations: PolicyViolation[] = [];
  let passed = 0;
  let violated = 0;

  // Check colors
  for (const [_field, value] of Object.entries(resolution.colors)) {
    const violation = checkColorPolicy(value, policy, context);
    if (violation) {
      violations.push(violation);
      violated++;
    } else {
      passed++;
    }
  }

  // Check spacing
  for (const [_field, value] of Object.entries(resolution.spacing)) {
    const violation = checkSpacingPolicy(value, policy, context);
    if (violation) {
      violations.push(violation);
      violated++;
    } else {
      passed++;
    }
  }

  // Check radius
  for (const [_field, value] of Object.entries(resolution.radius)) {
    const violation = checkRadiusPolicy(value, policy, context);
    if (violation) {
      violations.push(violation);
      violated++;
    } else {
      passed++;
    }
  }

  // Check typography
  for (const [_field, value] of Object.entries(resolution.typography)) {
    const violation = checkTypographyPolicy(value, policy, context);
    if (violation) {
      violations.push(violation);
      violated++;
    } else {
      passed++;
    }
  }

  return {
    passed,
    violated,
    violations,
  };
}

/**
 * Check a color value against policy.
 */
function checkColorPolicy(
  value: ResolvedValue<string>,
  policy: ResolutionPolicy,
  context?: { file?: string; componentKey?: string },
): PolicyViolation | null {
  const canonical = value.canonical;

  // Check if it's a raw hex value
  const isRawHex = canonical.startsWith('#');

  // token-only: hex values are violations
  if (policy.colorStrategy === 'token-only' && isRawHex) {
    return {
      canonical,
      category: 'colors',
      reason: 'Raw hex color not allowed in token-only mode',
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  // Check if resolution failed (strict mode only)
  if (policy.strict && value.resolved === undefined && !isRawHex) {
    return {
      canonical,
      category: 'colors',
      reason: `Canonical token "${canonical}" could not be resolved`,
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  return null;
}

/**
 * Check a spacing value against policy.
 */
function checkSpacingPolicy(
  value: ResolvedValue<number>,
  policy: ResolutionPolicy,
  context?: { file?: string; componentKey?: string },
): PolicyViolation | null {
  const canonical = value.canonical;

  // Check if it's a raw numeric value
  const isRawNumeric = /^\d+(px)?$/.test(canonical);

  // token-only: raw numeric values are violations
  if (policy.spacingScale === 'token-only' && isRawNumeric) {
    return {
      canonical,
      category: 'spacing',
      reason: 'Raw numeric spacing not allowed in token-only mode',
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  // Check if resolution failed (strict mode only)
  if (policy.strict && value.resolved === undefined && !isRawNumeric) {
    return {
      canonical,
      category: 'spacing',
      reason: `Spacing token "${canonical}" could not be resolved`,
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  return null;
}

/**
 * Check a radius value against policy.
 */
function checkRadiusPolicy(
  value: ResolvedValue<number>,
  policy: ResolutionPolicy,
  context?: { file?: string; componentKey?: string },
): PolicyViolation | null {
  const canonical = value.canonical;

  // Check if it's a raw numeric value
  const isRawNumeric = /^\d+(px)?$/.test(canonical);

  // token-only: raw numeric values are violations
  if (policy.radiusScale === 'token-only' && isRawNumeric) {
    return {
      canonical,
      category: 'radius',
      reason: 'Raw numeric radius not allowed in token-only mode',
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  // Check if resolution failed (strict mode only)
  if (policy.strict && value.resolved === undefined && !isRawNumeric) {
    return {
      canonical,
      category: 'radius',
      reason: `Radius token "${canonical}" could not be resolved`,
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  return null;
}

/**
 * Check a typography value against policy.
 */
function checkTypographyPolicy(
  value: ResolvedValue<{ fontSize?: number; fontWeight?: number }>,
  policy: ResolutionPolicy,
  context?: { file?: string; componentKey?: string },
): PolicyViolation | null {
  const canonical = value.canonical;

  // Check if it's a raw numeric value
  const isRawNumeric = /^\d+(px)?$/.test(canonical);

  // token-only: raw numeric values are violations
  if (policy.typographyScale === 'token-only' && isRawNumeric) {
    return {
      canonical,
      category: 'typography',
      reason: 'Raw numeric typography not allowed in token-only mode',
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  // Check if resolution failed (strict mode only)
  if (policy.strict && value.resolved === undefined && !isRawNumeric) {
    return {
      canonical,
      category: 'typography',
      reason: `Typography token "${canonical}" could not be resolved`,
      file: context?.file,
      componentKey: context?.componentKey,
    };
  }

  return null;
}

// =============================================================================
// POLICY DISPLAY
// =============================================================================

/**
 * Format policy as a human-readable string.
 */
export function formatPolicy(policy: ResolutionPolicy): string {
  const parts: string[] = [];

  parts.push(`color=${policy.colorStrategy}`);
  parts.push(`spacing=${policy.spacingScale}`);
  parts.push(`radius=${policy.radiusScale}`);
  parts.push(`typography=${policy.typographyScale}`);

  if (policy.strict) {
    parts.push('strict=true');
  }

  return parts.join(', ');
}
