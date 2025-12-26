/**
 * @aesthetic-function/watcher - figmaDelta/conflicts/types.ts
 *
 * Phase 12D: Conflict Surfacing & Resolution Preview Types.
 *
 * WHY: Defines types for the read-only conflict analysis layer that explains
 * what is out of sync between Figma and code, why, and what would happen
 * if the delta were applied.
 *
 * SCOPE:
 * - Read-only analysis only (no writes)
 * - Deterministic output for reproducibility
 * - Human-readable explanations
 * - Reuses existing policy logic without modification
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX, markers, overrides, or component maps
 * - Does NOT emit Figma operations
 * - Does NOT call apply functions
 */

import type { SourceLocation } from '../../ast/types.js';
import type { DeltaPropertyType, DeltaConfidence } from '../types.js';

// =============================================================================
// CONFLICT TARGET
// =============================================================================

/**
 * Where the delta change would land if applied.
 *
 * - ast: Direct AST modification (inline style literal, JSXText, etc.)
 * - marker: Update @figma marker line
 * - override: Update design-overrides.json entry
 * - none: Blocked - cannot be applied automatically
 */
export type ConflictTarget = 'ast' | 'marker' | 'override' | 'none';

// =============================================================================
// CONFLICT TYPES
// =============================================================================

/**
 * Classification of conflict types detected.
 *
 * - AST_VS_FIGMA: AST literal differs from Figma value
 * - MARKER_VS_FIGMA: Marker attribute differs from Figma value
 * - OVERRIDE_VS_FIGMA: Override entry differs from Figma value
 * - CANONICAL_MISMATCH: Raw values match but canonical tokens differ
 * - UNMAPPED_VARIANT: Variant nodeId not found in component map
 * - NON_BASE_STATE_BLOCKED: Non-base state without explicit data
 * - LOW_CONFIDENCE_BLOCKED: Delta confidence too low for auto-apply
 */
export type ConflictType =
  | 'AST_VS_FIGMA'
  | 'MARKER_VS_FIGMA'
  | 'OVERRIDE_VS_FIGMA'
  | 'CANONICAL_MISMATCH'
  | 'UNMAPPED_VARIANT'
  | 'NON_BASE_STATE_BLOCKED'
  | 'LOW_CONFIDENCE_BLOCKED';

// =============================================================================
// CONFLICT EVIDENCE
// =============================================================================

/**
 * Evidence from a specific source about a property value.
 *
 * Captures what value exists and where it came from,
 * enabling side-by-side comparison.
 */
export interface ConflictEvidence {
  /**
   * Source of this evidence.
   */
  source: 'figma' | 'ast' | 'marker' | 'override' | 'canonical';

  /**
   * The raw value from this source.
   */
  value: unknown;

  /**
   * Canonical token (if resolved).
   * E.g., "color.primary" for "#2563EB"
   */
  canonical?: string;

  /**
   * Confidence level for this value.
   */
  confidence?: DeltaConfidence;

  /**
   * Source location in code (for AST evidence).
   */
  loc?: SourceLocation;
}

// =============================================================================
// CONFLICT ITEM
// =============================================================================

/**
 * A single conflict between Figma and existing code/data.
 *
 * Represents one property that differs between Figma and the codebase,
 * with full analysis of what would happen if applied.
 */
export interface ConflictItem {
  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Target state (base, hover, pressed, disabled).
   */
  targetState: 'base' | string;

  /**
   * Property that has the conflict.
   */
  property: DeltaPropertyType;

  /**
   * Type of conflict detected.
   */
  conflictType: ConflictType;

  /**
   * Evidence from Figma (the new/desired value).
   */
  figma: ConflictEvidence;

  /**
   * Evidence from existing source (AST/marker/override).
   * Undefined if no existing value found.
   */
  existing?: ConflictEvidence;

  /**
   * Suggested target for resolution.
   */
  suggestedTarget: ConflictTarget;

  /**
   * Whether this conflict would be applied if apply mode is enabled.
   * false = blocked for some reason
   */
  wouldApply: boolean;

  /**
   * Human-readable explanation of what would happen.
   */
  reason: string;

  /**
   * Policy rule that determined the outcome.
   * E.g., "non-base-state-refused", "auto-writable-literal", "low-confidence"
   */
  policyRule: string;
}

// =============================================================================
// CONFLICT REPORT
// =============================================================================

/**
 * Summary statistics for a conflict report.
 */
export interface ConflictSummary {
  /**
   * Total number of conflicts detected.
   */
  total: number;

  /**
   * Count of conflicts by suggested target.
   */
  byTarget: Record<ConflictTarget, number>;

  /**
   * Count of conflicts by type.
   */
  byType: Record<ConflictType, number>;

  /**
   * Number of conflicts that would NOT be applied.
   */
  blocked: number;

  /**
   * Number of conflicts that WOULD be applied.
   */
  wouldApply: number;
}

/**
 * Full conflict report for a file.
 *
 * Contains all detected conflicts with analysis and resolution previews.
 */
export interface ConflictReport {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * ISO timestamp when report was generated.
   */
  generatedAt: string;

  /**
   * All detected conflicts.
   */
  conflicts: ConflictItem[];

  /**
   * Summary statistics.
   */
  summary: ConflictSummary;
}

// =============================================================================
// CONFLICT DETECTION INPUT
// =============================================================================

/**
 * Input for generating a conflict report.
 */
export interface ConflictDetectionInput {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * Deltas from Phase 12A.
   */
  deltas: import('../types.js').DeltaOutput[];

  /**
   * Suggestions from Phase 12B.
   */
  suggestions: import('../../figmaDeltaSuggest/types.js').FigmaDeltaSuggestion[];

  /**
   * AST report for the file (Phase 6A).
   */
  astReport?: import('../../ast/types.js').AstIntentReport;

  /**
   * Parsed @figma markers from source file.
   */
  markers: import('../../parse/parseIntentFromReact.js').MarkerData[];

  /**
   * Design overrides from design-overrides.json.
   */
  overrides: import('../../reconcile/types.js').DesignOverrides | null;

  /**
   * Write feasibility report (Phase 6C).
   */
  writeFeasibility?: import('../../ast/types.js').WriteFeasibilityReport;
}
