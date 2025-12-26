/**
 * @aesthetic-function/watcher - figmaResolveApply/types.ts
 *
 * Phase 12F: Apply Resolution Plans - Types.
 *
 * WHY: Defines types for the execution layer that takes Phase 12E resolution
 * plan artifacts and applies the planned actions to correct targets.
 *
 * SCOPE:
 * - Opt-in apply mode (artifact-only default)
 * - Auditable: every apply produces artifact + audit log
 * - Deterministic: same inputs → same ops + same artifact
 * - Idempotent: re-running with same plan produces same results
 *
 * CONSTRAINTS:
 * - No policy relaxation
 * - Non-base state restrictions maintained
 * - Allow-lists and confidence thresholds respected
 * - Reuses existing Phase 12C safe pipelines
 */

import type { DeltaPropertyType, DeltaConfidence } from '../figmaDelta/types.js';
import type { ResolutionAction, ResolutionPlan } from '../figmaDeltaResolution/types.js';
import type { SourceLocation } from '../ast/types.js';

// =============================================================================
// APPLY TARGET
// =============================================================================

/**
 * Target for applying a resolution.
 *
 * - ast: Direct AST write (literals only, base state only)
 * - marker: Update existing @figma marker line
 * - override: Write to design-overrides.json
 * - ignored: Decision was IGNORE action
 * - blocked: Decision was BLOCK action or failed preconditions
 */
export type ResolutionApplyTarget = 'ast' | 'marker' | 'override' | 'ignored' | 'blocked';

// =============================================================================
// APPLY STATUS
// =============================================================================

/**
 * Result status for a resolution decision apply.
 *
 * - applied: Successfully applied to target
 * - noop: Target already matches intended value
 * - skipped: Skipped due to IGNORE/BLOCK or filter/allow-list
 * - blocked: Cannot apply due to policy/precondition failure
 * - failed: Attempted but failed with error
 */
export type ResolutionApplyStatus = 'applied' | 'noop' | 'skipped' | 'blocked' | 'failed';

// =============================================================================
// APPLY RESULT ITEM
// =============================================================================

/**
 * Evidence summary for an apply result.
 */
export interface ResolutionApplyEvidence {
  /**
   * AST source location (for AST targets).
   */
  astLoc?: SourceLocation;

  /**
   * Marker line number (for marker targets).
   */
  markerLine?: number;

  /**
   * Override key (for override targets).
   */
  overrideKey?: string;

  /**
   * Figma variant nodeId (if available).
   */
  nodeId?: string;

  /**
   * Source type (ast, marker, override).
   */
  source?: string;
}

/**
 * Result of applying a single resolution decision.
 */
export interface ResolutionApplyResultItem {
  /**
   * Stable decision ID (hash of componentKey + state + property + action).
   */
  decisionId: string;

  /**
   * Component key.
   */
  componentKey: string;

  /**
   * Target state.
   */
  targetState: string;

  /**
   * Property being resolved.
   */
  property: DeltaPropertyType;

  /**
   * Action that was attempted.
   */
  action: ResolutionAction;

  /**
   * Target type.
   */
  target: ResolutionApplyTarget;

  /**
   * Whether the apply was successful.
   */
  success: boolean;

  /**
   * Result status.
   */
  status: ResolutionApplyStatus;

  /**
   * Error message if failed.
   */
  error?: string;

  /**
   * Evidence summary.
   */
  evidenceSummary: ResolutionApplyEvidence;

  /**
   * Value that was applied (if applicable).
   */
  appliedValue?: string | number;

  /**
   * Previous value (if available).
   */
  previousValue?: string | number;
}

// =============================================================================
// APPLY CONFIGURATION
// =============================================================================

/**
 * Apply mode for resolution plans.
 *
 * - artifact: Only write artifact, no mutations
 * - apply: Apply decisions to targets
 */
export type ResolutionApplyMode = 'artifact' | 'apply';

/**
 * Allowed targets for resolution apply.
 */
export type ResolutionApplyAllowTarget = 'ast' | 'marker' | 'override';

/**
 * Configuration for resolution plan application.
 */
export interface ResolutionApplyConfig {
  /**
   * Master switch - must be true to allow any applies.
   */
  enabled: boolean;

  /**
   * Apply mode - artifact only or apply.
   */
  mode: ResolutionApplyMode;

  /**
   * Dry-run mode - if true, no actual writes occur.
   */
  dryRun: boolean;

  /**
   * Allowed targets for apply.
   */
  allow: ResolutionApplyAllowTarget[];

  /**
   * Minimum confidence threshold.
   */
  minConfidence: DeltaConfidence;

  /**
   * Optional custom plan path.
   */
  planPath?: string;
}

// =============================================================================
// APPLY INPUT
// =============================================================================

/**
 * Input for executing a resolution plan.
 */
export interface ResolutionApplyInput {
  /**
   * Resolution plan to execute.
   */
  plan: ResolutionPlan;

  /**
   * Configuration for apply.
   */
  config: ResolutionApplyConfig;

  /**
   * Filter by component key (optional).
   */
  componentFilter?: string;

  /**
   * Filter by state (optional).
   */
  stateFilter?: string;

  /**
   * Repository root path.
   */
  repoRoot: string;
}

// =============================================================================
// APPLY SUMMARY
// =============================================================================

/**
 * Summary of resolution plan application.
 */
export interface ResolutionApplySummary {
  /**
   * Total decisions in plan.
   */
  decisionsTotal: number;

  /**
   * Number of decisions attempted.
   */
  attempted: number;

  /**
   * Number successfully applied.
   */
  applied: number;

  /**
   * Number that were no-ops (already matched).
   */
  noop: number;

  /**
   * Number skipped (IGNORE/BLOCK or filter).
   */
  skipped: number;

  /**
   * Number blocked (precondition failure).
   */
  blocked: number;

  /**
   * Number failed (attempted but errored).
   */
  failed: number;
}

// =============================================================================
// APPLY ARTIFACT
// =============================================================================

/**
 * Artifact produced by resolution plan application.
 */
export interface ResolutionApplyArtifact {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * Artifact source identifier.
   */
  source: 'figma-resolution-apply';

  /**
   * Source file that was processed.
   */
  sourceFile: string;

  /**
   * Path to the resolution plan artifact.
   */
  planPath: string;

  /**
   * Apply mode used.
   */
  mode: ResolutionApplyMode;

  /**
   * Whether dry-run was enabled.
   */
  dryRun: boolean;

  /**
   * ISO timestamp when apply was executed.
   */
  generatedAt: string;

  /**
   * Summary statistics.
   */
  summary: ResolutionApplySummary;

  /**
   * Per-decision results.
   */
  results: ResolutionApplyResultItem[];
}

// =============================================================================
// LOADED PLAN
// =============================================================================

/**
 * Resolution plan loaded from artifact.
 */
export interface LoadedResolutionPlan {
  /**
   * The loaded plan.
   */
  plan: ResolutionPlan;

  /**
   * Path the plan was loaded from.
   */
  loadedFrom: string;

  /**
   * Whether the plan was found and parsed.
   */
  success: boolean;

  /**
   * Error message if loading failed.
   */
  error?: string;
}
