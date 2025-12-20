/**
 * @aesthetic-function/watcher - canonicalResolverPolicy/index.ts
 *
 * Canonical Resolution Policy (Phase 10G).
 *
 * Public API for policy configuration and enforcement.
 */

// Types
export type {
  ColorStrategy,
  SpacingScaleStrategy,
  RadiusScaleStrategy,
  TypographyScaleStrategy,
  ResolutionPolicy,
  PolicyViolation,
  PolicyResult,
  FileCoverage,
  GapSummary,
  ProjectCoverageReport,
} from './types.js';

// Policy functions
export {
  DEFAULT_POLICY,
  getResolutionPolicyFromEnv,
  applyPolicyToResolution,
  formatPolicy,
} from './policy.js';
