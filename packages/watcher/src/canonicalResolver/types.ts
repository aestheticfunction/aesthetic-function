/**
 * @aesthetic-function/watcher - canonicalResolver/types.ts
 *
 * Canonical → Design System Resolver Types (Phase 10F).
 *
 * WHY: After Phase 10E normalizes adapter values into canonical tokens,
 * this module resolves those tokens back into concrete design system values
 * (hex colors, pixel values, etc.) for actual use.
 *
 * SCOPE: Read-only analysis + reporting. No writes, no mutations.
 */

import type { ConfidenceLevel } from '../ast/types.js';

// =============================================================================
// RESOLVED VALUE
// =============================================================================

/**
 * A resolved value with provenance tracking.
 *
 * Contains both the canonical token and its resolved concrete value,
 * along with confidence and source information.
 *
 * @template T - The type of the resolved value (string for hex, number for px)
 */
export interface ResolvedValue<T> {
  /** The canonical token (e.g., "color.primary", "space.md") */
  canonical: string;

  /**
   * The resolved concrete value (e.g., "#3B82F6", 16).
   * Undefined if resolution failed.
   */
  resolved?: T;

  /** Confidence level preserved from canonical normalization */
  confidence: ConfidenceLevel;

  /** Source that produced the canonical value (e.g., "vuetify", "antd", "generic-jsx") */
  source: string;

  /**
   * Note explaining resolution status.
   * Present when resolution fails or has caveats.
   */
  note?: string;
}

// =============================================================================
// CANONICAL RESOLUTION
// =============================================================================

/**
 * Complete resolution of all canonical semantics to design system values.
 */
export interface CanonicalResolution {
  /** Resolved color values (canonical → hex string) */
  colors: Record<string, ResolvedValue<string>>;

  /** Resolved spacing values (canonical → px number) */
  spacing: Record<string, ResolvedValue<number>>;

  /** Resolved radius values (canonical → px number) */
  radius: Record<string, ResolvedValue<number>>;

  /** Resolved typography values (canonical → font size/weight) */
  typography: Record<string, ResolvedValue<TypographyValue>>;

  /** Summary metadata */
  meta: ResolutionMeta;
}

/**
 * Typography resolved value structure.
 */
export interface TypographyValue {
  /** Font size in pixels */
  fontSize?: number;
  /** Font weight (100-900) */
  fontWeight?: number;
}

/**
 * Metadata about the resolution process.
 */
export interface ResolutionMeta {
  /** Number of canonical tokens successfully resolved */
  resolvedCount: number;
  /** Number of canonical tokens that could not be resolved */
  unresolvedCount: number;
  /** Number of notes/warnings generated */
  notesCount: number;
}

// =============================================================================
// COVERAGE REPORT
// =============================================================================

/**
 * Coverage statistics for a single category.
 */
export interface CategoryCoverage {
  /** Number of canonical fields in this category */
  canonicalFields: number;
  /** Number successfully resolved */
  resolved: number;
  /** Number that could not be resolved */
  unresolved: number;
}

/**
 * A gap in resolution coverage.
 */
export interface CoverageGap {
  /** The canonical token that couldn't be resolved */
  canonical: string;
  /** Which category this token belongs to */
  category: 'colors' | 'spacing' | 'radius' | 'typography';
  /** Explanation of why resolution failed */
  note: string;
}

/**
 * Complete coverage report for canonical resolution.
 */
export interface CoverageReport {
  /** Aggregate totals across all categories */
  totals: {
    /** Total canonical fields */
    canonicalFields: number;
    /** Total resolved fields */
    resolved: number;
    /** Total unresolved fields */
    unresolved: number;
  };

  /** Per-category coverage breakdown */
  byCategory: Record<'colors' | 'spacing' | 'radius' | 'typography', CategoryCoverage>;

  /** List of all resolution gaps */
  gaps: CoverageGap[];
}

// =============================================================================
// RESOLVER CONTEXT
// =============================================================================

/**
 * Context for resolution operations.
 */
export interface ResolverContext {
  /**
   * Design token context for color resolution.
   * If not provided, uses default token context.
   */
  tokenContext?: import('../tokens/designTokens.js').DesignTokenContext;

  /**
   * Optional spacing scale configuration.
   * Maps canonical spacing tokens to pixel values.
   */
  spacingScale?: Record<string, number>;

  /**
   * Optional radius scale configuration.
   * Maps canonical radius tokens to pixel values.
   */
  radiusScale?: Record<string, number>;

  /**
   * Optional typography scale configuration.
   * Maps canonical typography tokens to values.
   */
  typographyScale?: Record<string, TypographyValue>;
}
