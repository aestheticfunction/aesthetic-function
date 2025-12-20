/**
 * @aesthetic-function/watcher - canonicalResolver/index.ts
 *
 * Canonical → Design System Resolver (Phase 10F).
 *
 * Public API for resolving canonical tokens to concrete design system values.
 */

// Types
export type {
  ResolvedValue,
  CanonicalResolution,
  TypographyValue,
  ResolutionMeta,
  CoverageReport,
  CategoryCoverage,
  CoverageGap,
  ResolverContext,
} from './types.js';

// Functions
export {
  resolveCanonicalSemantics,
  buildCoverageReport,
  formatCoverageReport,
} from './resolve.js';
