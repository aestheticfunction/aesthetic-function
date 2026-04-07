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
  };

  /** Individual drift findings */
  findings: DriftFinding[];

  /** Overall drift severity (highest finding wins) */
  severity: DriftSeverity;

  /** When the analysis was performed */
  analyzedAt: string;
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
}
