/**
 * @aesthetic-function/watcher - canonicalResolverPolicy/types.ts
 *
 * Resolution Policy Types (Phase 10G).
 *
 * WHY: Different projects have different requirements for token resolution.
 * Some want strict token-only mode, others allow hex fallbacks. This policy
 * layer provides configuration without changing adapter or resolver logic.
 *
 * SCOPE: Read-only policy/reporting. No writes, no mutations.
 */

// =============================================================================
// POLICY STRATEGIES
// =============================================================================

/**
 * Color resolution strategy.
 *
 * - 'token-first': Prefer tokens, but allow raw hex passthrough (default)
 * - 'hex-allowed': Same as token-first, no violations for hex
 * - 'token-only': Raw hex values are policy violations
 */
export type ColorStrategy = 'token-first' | 'hex-allowed' | 'token-only';

/**
 * Spacing scale strategy.
 *
 * - '8pt': Use default 8-point grid scale (default)
 * - 'token-only': Only canonical tokens allowed, raw px is violation
 * - 'custom': Use custom scale from config
 */
export type SpacingScaleStrategy = '8pt' | 'token-only' | 'custom';

/**
 * Radius scale strategy.
 *
 * - 'default': Use default radius scale (default)
 * - 'token-only': Only canonical tokens allowed
 * - 'custom': Use custom scale from config
 */
export type RadiusScaleStrategy = 'default' | 'token-only' | 'custom';

/**
 * Typography scale strategy.
 *
 * - 'default': Use default typography scale (default)
 * - 'token-only': Only canonical tokens allowed
 * - 'custom': Use custom scale from config
 */
export type TypographyScaleStrategy = 'default' | 'token-only' | 'custom';

// =============================================================================
// RESOLUTION POLICY
// =============================================================================

/**
 * Resolution policy configuration.
 *
 * Controls how canonical resolution behaves and what constitutes a violation.
 */
export interface ResolutionPolicy {
  /** Color resolution strategy */
  colorStrategy: ColorStrategy;

  /** Spacing scale strategy */
  spacingScale: SpacingScaleStrategy;

  /** Radius scale strategy */
  radiusScale: RadiusScaleStrategy;

  /** Typography scale strategy */
  typographyScale: TypographyScaleStrategy;

  /**
   * Strict mode: if true, missing mappings are policy violations.
   * If false, missing mappings are just notes (default behavior).
   */
  strict: boolean;

  /**
   * Custom scales (optional, used when strategy is 'custom').
   */
  customScales?: {
    spacing?: Record<string, number>;
    radius?: Record<string, number>;
    typography?: Record<string, { fontSize?: number; fontWeight?: number }>;
  };
}

// =============================================================================
// POLICY VIOLATION
// =============================================================================

/**
 * A policy violation detected during resolution.
 *
 * These are informational when strict=false, but can fail CI when strict=true.
 */
export interface PolicyViolation {
  /** The canonical token that violated policy */
  canonical: string;

  /** Which category this violation belongs to */
  category: 'colors' | 'spacing' | 'radius' | 'typography';

  /** Human-readable reason for the violation */
  reason: string;

  /** File where the violation occurred (for project-level reports) */
  file?: string;

  /** Component key where the violation occurred */
  componentKey?: string;
}

// =============================================================================
// POLICY RESULT
// =============================================================================

/**
 * Result of applying policy to a resolution.
 */
export interface PolicyResult {
  /** Number of fields that passed policy */
  passed: number;

  /** Number of fields that violated policy */
  violated: number;

  /** List of all violations */
  violations: PolicyViolation[];
}

// =============================================================================
// PROJECT COVERAGE TYPES
// =============================================================================

/**
 * Coverage data for a single file.
 */
export interface FileCoverage {
  /** Relative file path */
  file: string;

  /** Number of components in this file */
  componentCount: number;

  /** Number of canonical fields */
  canonicalFields: number;

  /** Number of resolved fields */
  resolved: number;

  /** Number of unresolved fields */
  unresolved: number;

  /** Policy violations in this file */
  violations: PolicyViolation[];
}

/**
 * Gap summary grouped by canonical token.
 */
export interface GapSummary {
  /** The canonical token */
  canonical: string;

  /** Category of the token */
  category: 'colors' | 'spacing' | 'radius' | 'typography';

  /** Number of occurrences */
  count: number;

  /** Files where this gap occurs */
  files: string[];
}

/**
 * Project-level coverage report.
 */
export interface ProjectCoverageReport {
  /** Total files scanned */
  filesScanned: number;

  /** Total components analyzed */
  totalComponents: number;

  /** Total canonical fields across all files */
  totalCanonicalFields: number;

  /** Total resolved fields */
  totalResolved: number;

  /** Total unresolved fields */
  totalUnresolved: number;

  /** Coverage percentage (0-100) */
  coveragePercent: number;

  /** Per-category coverage */
  byCategory: Record<'colors' | 'spacing' | 'radius' | 'typography', {
    canonicalFields: number;
    resolved: number;
    unresolved: number;
  }>;

  /** Top gaps grouped by canonical token */
  topGaps: GapSummary[];

  /** Files with lowest coverage (sorted ascending by coverage %) */
  lowestCoverageFiles: Array<{
    file: string;
    coveragePercent: number;
    resolved: number;
    total: number;
  }>;

  /** All policy violations */
  violations: PolicyViolation[];

  /** Policy that was applied */
  policy: ResolutionPolicy;

  /** Whether strict mode would fail CI */
  wouldFailCI: boolean;
}
