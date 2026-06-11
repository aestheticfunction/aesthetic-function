/**
 * @aesthetic-function/shared - crossSurfaceDrift.ts
 *
 * Phase 16C: Cross-Surface Drift Analysis Types.
 *
 * WHY: When AF has data from multiple surfaces (Figma, Storybook, code AST),
 * it can detect parity gaps between them. This module defines the types for
 * that analysis. Cross-surface drift is a SEPARATE read-only pass — it does
 * NOT modify reconciliation resolution (Phase 14F semantics are frozen).
 *
 * Think of it as: reconciliation decides field values; drift analysis reports
 * where surfaces disagree.
 */

// =============================================================================
// SURFACE IDENTIFIERS
// =============================================================================

/**
 * Identifier for a comparable surface in cross-surface drift analysis.
 *
 * - 'figma': design tool state (Figma Console MCP adapter)
 * - 'storybook': code-adjacent runtime metadata (Storybook MCP adapter)
 * - 'code': source AST extraction
 * - 'contract': declared design-system contract (a dspack file) — a versioned,
 *   read-only artifact, not a live tool
 */
export type DriftSurfaceId = 'figma' | 'storybook' | 'code' | 'contract';

// =============================================================================
// DRIFT REPORT
// =============================================================================

/**
 * Report from comparing a single component across multiple surfaces.
 */
export interface CrossSurfaceDriftReport {
  /** Component name being compared */
  componentName: string;

  /** Surfaces that were compared (null = surface unavailable) */
  surfaces: {
    figma?: SurfaceSnapshot;
    storybook?: SurfaceSnapshot;
    code?: SurfaceSnapshot;
    contract?: SurfaceSnapshot;
  };

  /** Individual drift findings */
  findings: DriftFinding[];

  /** Overall drift severity (highest finding wins) */
  severity: DriftSeverity;

  /** Surfaces that were actually queried (regardless of whether data was found) */
  queriedSurfaces: DriftSurfaceId[];

  /** When the analysis was performed */
  analyzedAt: string;

  /** Normalization metadata showing what was renamed/excluded before comparison */
  normalization?: NormalizationMetadata;
}

// =============================================================================
// SURFACE SNAPSHOT
// =============================================================================

/**
 * A point-in-time snapshot of a component as seen from one surface.
 */
export interface SurfaceSnapshot {
  /** Adapter ID or source identifier */
  source: string;

  /** Component name as seen by this surface */
  componentName: string;

  /** Props visible from this surface */
  props: SurfaceProp[];

  /** Variant values visible from this surface */
  variants: string[];

  /** When this snapshot was taken */
  lastObserved: string;
}

/**
 * A prop as seen from a surface.
 */
export interface SurfaceProp {
  name: string;
  type?: string;
  values?: string[];
  /** Original name before alias normalization (set only when name was changed) */
  normalizedFrom?: string;
}

// =============================================================================
// DRIFT FINDING
// =============================================================================

/**
 * A single drift finding — a specific disagreement between surfaces.
 */
export interface DriftFinding {
  /** What was compared (e.g., "prop:variant", "variant:ghost") */
  field: string;

  /** Type of drift */
  type: DriftType;

  /** Severity of this finding */
  severity: DriftSeverity;

  /** Human-readable description of the drift */
  message: string;

  /** Value from Figma surface (if available) */
  figmaValue?: string;

  /** Value from Storybook surface (if available) */
  storybookValue?: string;

  /** Value from code surface (if available) */
  codeValue?: string;

  /** Value from the contract surface (if available) */
  contractValue?: string;

  /** Optional Storybook story reference for the mismatched item */
  storyRef?: string;

  /**
   * How confident we are this is real drift, not noise.
   * - 'high': prop exists AND value is in a constrained union type
   * - 'low': prop exists but type is unconstrained (e.g., string)
   */
  confidence: DriftConfidence;
}

// =============================================================================
// ENUMS
// =============================================================================

export type DriftType =
  | 'missing-in-figma'
  | 'missing-in-storybook'
  | 'missing-in-code'
  | 'missing-in-contract'
  | 'contract-mismatch'
  | 'value-mismatch'
  | 'name-mismatch';

export type DriftSeverity = 'none' | 'info' | 'warn' | 'fail';

export type DriftConfidence = 'high' | 'low';

// =============================================================================
// ANALYSIS OPTIONS
// =============================================================================

/**
 * Options for the drift analysis engine.
 */
export interface DriftAnalysisOptions {
  /** Include uncorroborated story-derived variants in findings (default: false) */
  includeUncorroborated?: boolean;

  /** Surfaces that were queried by the caller (used to distinguish "not checked" from "checked, not found") */
  queriedSurfaces?: DriftSurfaceId[];

  /** Override the default normalization config (alias mappings + design-only filters) */
  normalizationConfig?: NormalizationConfig;

  /**
   * Component data from the dspack contract surface, if queried.
   * Read-only — supplied by the watcher's contractSurface module.
   * Passed via options (not a positional parameter) to keep the
   * analyzeCrossSurfaceDrift() signature stable for existing callers.
   */
  contractData?: ContractComponentData | null;
}

// =============================================================================
// CONTRACT SURFACE
// =============================================================================

/**
 * Component data extracted from a dspack contract file for drift comparison.
 * Produced by the watcher's contractSurface module — read-only.
 */
export interface ContractComponentData {
  /** dspack component ID (kebab-case, e.g., "alert-dialog") */
  id: string;

  /** Display name from the contract entry (e.g., "AlertDialog") */
  name: string;

  /** Props declared by the contract */
  props: SurfaceProp[];

  /** Variant values: union of all enum-prop values declared by the contract */
  variants: string[];
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Configuration for the pre-comparison normalization layer.
 * Deterministic and configurable — no LLM or fuzzy matching.
 */
export interface NormalizationConfig {
  /** Alias groups: equivalent prop names across surfaces mapped to a canonical name */
  propAliases: Array<{
    /** The canonical name all surfaces will be normalized TO */
    canonical: string;
    /** Surface-specific names that map to this canonical name (matched case-insensitively) */
    aliases: string[];
  }>;

  /** Figma-only layout/visual properties to filter from drift comparison */
  designOnlyFields: {
    /** Property names to treat as design-only (matched case-insensitively) */
    names: string[];
    /** 'exclude' removes from snapshot; 'tag' keeps but marks (future use) */
    strategy: 'exclude' | 'tag';
  };
}

/**
 * Metadata about what normalization was applied before comparison.
 * Provides explainability/traceability for the drift report.
 */
export interface NormalizationMetadata {
  /** Prop names that were renamed via alias rules */
  appliedRules: Array<{
    originalName: string;
    canonicalName: string;
    surface: DriftSurfaceId;
  }>;

  /** Props excluded from comparison as design-only */
  excludedProps: Array<{
    name: string;
    surface: DriftSurfaceId;
    reason: 'design-only';
  }>;
}
