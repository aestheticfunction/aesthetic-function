/**
 * @aesthetic-function/watcher - figmaDeltaResolution/types.ts
 *
 * Phase 12E: Guided Conflict Resolution & Resolution Plans.
 *
 * WHY: Defines types for the resolution layer that transforms Phase 12D
 * conflict reports into explicit, auditable resolution plans.
 *
 * SCOPE:
 * - Read-only planning (no automatic applies)
 * - Deterministic output for reproducibility
 * - Human-reviewable resolution decisions
 * - Bridges Phase 12D (detection) → Phase 12C (application)
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX, markers, overrides, or component maps
 * - Does NOT emit Figma operations
 * - Does NOT call apply functions
 * - Everything explicit, reviewable, and reversible
 */

import type { DeltaPropertyType } from '../figmaDelta/types.js';

// =============================================================================
// RESOLUTION ACTIONS
// =============================================================================

/**
 * Actions that can be taken to resolve a conflict.
 *
 * - APPLY_TO_AST: Write value directly to AST literal
 * - APPLY_TO_MARKER: Update @figma marker line
 * - APPLY_TO_OVERRIDE: Write to design-overrides.json
 * - IGNORE: Skip this conflict (user must decide)
 * - BLOCK: Cannot resolve automatically (blocked)
 */
export type ResolutionAction =
  | 'APPLY_TO_AST'
  | 'APPLY_TO_MARKER'
  | 'APPLY_TO_OVERRIDE'
  | 'IGNORE'
  | 'BLOCK';

// =============================================================================
// RESOLUTION DECISION
// =============================================================================

/**
 * A single resolution decision for one conflict.
 *
 * Maps a conflict to a proposed action with full traceability.
 */
export interface ResolutionDecision {
  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Target state (base, hover, pressed, disabled).
   */
  targetState: 'base' | string;

  /**
   * Property being resolved.
   */
  property: DeltaPropertyType;

  /**
   * Proposed action for this conflict.
   */
  action: ResolutionAction;

  /**
   * Human-readable explanation of why this action was chosen.
   */
  reason: string;

  /**
   * Reference to the source conflict (for traceability).
   * Format: "<componentKey>::<state>::<property>"
   */
  sourceConflictId: string;
}

// =============================================================================
// RESOLUTION PLAN
// =============================================================================

/**
 * Summary statistics for a resolution plan.
 */
export interface ResolutionPlanSummary {
  /**
   * Count of decisions per action type.
   */
  applyAst: number;
  applyMarker: number;
  applyOverride: number;
  ignored: number;
  blocked: number;
}

/**
 * A complete resolution plan for a file.
 *
 * Contains all proposed decisions for resolving conflicts,
 * ready for human review before any application.
 */
export interface ResolutionPlan {
  /**
   * Plan format version.
   */
  version: '1.0';

  /**
   * Source file path.
   */
  sourceFile: string;

  /**
   * ISO timestamp when plan was generated.
   */
  generatedAt: string;

  /**
   * All resolution decisions.
   */
  decisions: ResolutionDecision[];

  /**
   * Summary statistics.
   */
  summary: ResolutionPlanSummary;
}

// =============================================================================
// RESOLUTION INPUT
// =============================================================================

/**
 * Input for generating a resolution plan.
 */
export interface ResolutionInput {
  /**
   * Conflict report from Phase 12D.
   */
  conflictReport: import('../figmaDelta/conflicts/types.js').ConflictReport;
}
