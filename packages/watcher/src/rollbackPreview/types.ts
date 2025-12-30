/**
 * @aesthetic-function/watcher - rollbackPreview/types.ts
 *
 * Phase 12I: Rollback Preview & Safety Envelope (Read-Only).
 *
 * WHY: Defines types for the rollback preview layer that shows exactly
 * what would be undone if a verification failure were to trigger a rollback.
 *
 * SCOPE:
 * - Read-only only (no mutations)
 * - Deterministic
 * - Explicit
 * - Improve human confidence, CI diagnostics, and auditability
 *
 * CONSTRAINTS:
 * - Does NOT execute rollback actions
 * - Does NOT auto-rollback
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Purely informational / preview only
 */

import type { DeltaPropertyType } from '../figmaDelta/types.js';

// =============================================================================
// ROLLBACK ACTION
// =============================================================================

/**
 * Target type for rollback action.
 */
export type RollbackTarget = 'ast' | 'marker' | 'override' | 'figma';

/**
 * Verification status that triggers rollback action.
 */
export type RollbackTriggerStatus = 'mismatch' | 'missing';

/**
 * A single rollback action representing what would be undone.
 *
 * One rollback action is generated for each failed verification item.
 */
export interface RollbackAction {
  /**
   * Unique identifier for this rollback action.
   * Format: hash of componentKey + state + property + target
   */
  actionId: string;

  /**
   * Target type for the rollback.
   */
  target: RollbackTarget;

  /**
   * Component key being rolled back.
   */
  componentKey: string;

  /**
   * Target state (base, hover, disabled, etc.).
   */
  targetState: string;

  /**
   * Property that would be reverted.
   */
  property: DeltaPropertyType;

  /**
   * Value that was applied (what would be removed).
   */
  appliedValue: string | number | unknown;

  /**
   * Previous value (what would be restored).
   */
  previousValue: string | number | unknown;

  /**
   * Reference to the originating apply operation's decision ID.
   */
  sourceApplyOpId: string;

  /**
   * Verification status that triggered this rollback action.
   */
  verificationStatus: RollbackTriggerStatus;

  /**
   * Human-readable reason for the rollback action.
   */
  reason: string;
}

// =============================================================================
// ROLLBACK PREVIEW SUMMARY
// =============================================================================

/**
 * Summary statistics for a rollback preview.
 */
export interface RollbackPreviewSummary {
  /**
   * Total number of rollback actions.
   */
  total: number;

  /**
   * Count of actions by target type.
   */
  byTarget: Record<string, number>;

  /**
   * Count of actions by property type.
   */
  byProperty: Record<string, number>;
}

// =============================================================================
// ROLLBACK PREVIEW
// =============================================================================

/**
 * Complete rollback preview artifact.
 *
 * Shows exactly what would be undone if verification failures
 * triggered a rollback. No actual rollback occurs.
 */
export interface RollbackPreview {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * Artifact source identifier.
   */
  source: 'figma-rollback-preview';

  /**
   * Source file this preview is for.
   */
  sourceFile: string;

  /**
   * ISO timestamp when preview was generated.
   */
  timestamp: string;

  /**
   * Path to the apply artifact used.
   */
  applyArtifactPath: string;

  /**
   * Path to the verification artifact used.
   */
  verificationArtifactPath: string;

  /**
   * List of rollback actions (what would be undone).
   */
  actions: RollbackAction[];

  /**
   * Summary statistics.
   */
  summary: RollbackPreviewSummary;
}

// =============================================================================
// GENERATION CONTEXT
// =============================================================================

/**
 * Context for generating rollback preview.
 */
export interface RollbackPreviewContext {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Source file path (relative to repo root).
   */
  sourceFile: string;

  /**
   * Optional custom apply artifact path.
   */
  applyArtifactPath?: string;

  /**
   * Optional custom verification artifact path.
   */
  verificationArtifactPath?: string;
}

// =============================================================================
// GENERATION RESULT
// =============================================================================

/**
 * Result of loading artifacts for rollback preview.
 */
export interface LoadedRollbackInputs {
  /**
   * Whether loading was successful.
   */
  success: boolean;

  /**
   * Error message if loading failed.
   */
  error?: string;

  /**
   * Path to the apply artifact.
   */
  applyArtifactPath?: string;

  /**
   * Path to the verification artifact.
   */
  verificationArtifactPath?: string;

  /**
   * Loaded apply artifact results.
   */
  applyResults?: Array<{
    decisionId: string;
    componentKey: string;
    targetState: string;
    property: DeltaPropertyType;
    target: string;
    appliedValue?: string | number;
    previousValue?: string | number;
  }>;

  /**
   * Loaded verification items with failures.
   */
  verificationFailures?: Array<{
    decisionId: string;
    componentKey: string;
    targetState: string;
    property: DeltaPropertyType;
    target: string;
    status: RollbackTriggerStatus;
    reason: string;
    expectedValue?: string | number;
    observedValue?: string | number;
    previousValue?: string | number;
  }>;
}
