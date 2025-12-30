/**
 * @aesthetic-function/watcher - reconciliationStatus/types.ts
 *
 * Phase 12J: Reconciliation Lifecycle Closure & Status Artifact.
 *
 * WHY: Defines types for the reconciliation status summary that answers:
 * "What is the reconciliation status of this file, right now?"
 *
 * SCOPE:
 * - Pure orchestration + summarization
 * - Read existing artifacts from Phases 12F–12I
 * - Compute lifecycle status
 * - Emit single summary artifact
 *
 * CONSTRAINTS:
 * - Read-only only (no mutations)
 * - Deterministic (rule-table only, no heuristics)
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Does NOT generate new deltas or suggestions
 * - Does NOT apply or rollback anything
 */

// =============================================================================
// OVERALL STATUS
// =============================================================================

/**
 * Overall reconciliation status.
 *
 * - CLEAN: Nothing to do (no apply, no deltas)
 * - APPLIED_UNVERIFIED: Apply attempted, no verify
 * - VERIFIED_OK: Apply + verify success
 * - VERIFY_FAILED: Mismatches or missing
 * - ROLLBACK_AVAILABLE: Verify failed + rollback preview exists
 * - INCOMPLETE: Missing or inconsistent artifacts
 */
export type OverallStatus =
  | 'CLEAN'
  | 'APPLIED_UNVERIFIED'
  | 'VERIFIED_OK'
  | 'VERIFY_FAILED'
  | 'ROLLBACK_AVAILABLE'
  | 'INCOMPLETE';

// =============================================================================
// CI VERDICT
// =============================================================================

/**
 * CI verdict for build gates.
 *
 * - PASS: All good, exit 0
 * - WARN: Needs attention, exit 0
 * - FAIL: CI should fail, exit 1
 */
export type CiVerdict = 'PASS' | 'WARN' | 'FAIL';

// =============================================================================
// PHASE STATUS
// =============================================================================

/**
 * Status of the apply phase (12F).
 */
export interface ApplyPhaseStatus {
  /**
   * Whether apply was attempted.
   */
  attempted: boolean;

  /**
   * Whether it was a dry-run.
   */
  dryRun: boolean;

  /**
   * Whether apply succeeded.
   */
  success: boolean;

  /**
   * Number of operations applied.
   */
  operationCount: number;
}

/**
 * Status of the verify phase (12G/12H).
 */
export interface VerifyPhaseStatus {
  /**
   * Whether verification was attempted.
   */
  attempted: boolean;

  /**
   * Whether verification succeeded (no mismatches/missing).
   */
  success: boolean;

  /**
   * Number of mismatched items.
   */
  mismatchCount: number;

  /**
   * Number of missing items.
   */
  missingCount: number;
}

/**
 * Status of the rollback preview phase (12I).
 */
export interface RollbackPreviewPhaseStatus {
  /**
   * Whether rollback preview is available.
   */
  available: boolean;

  /**
   * Number of rollback actions.
   */
  actionCount: number;
}

/**
 * Combined phase statuses.
 */
export interface ReconciliationPhases {
  /**
   * Apply phase status (12F).
   */
  apply?: ApplyPhaseStatus;

  /**
   * Verify phase status (12G/12H).
   */
  verify?: VerifyPhaseStatus;

  /**
   * Rollback preview status (12I).
   */
  rollbackPreview?: RollbackPreviewPhaseStatus;
}

// =============================================================================
// RECONCILIATION STATUS
// =============================================================================

/**
 * Complete reconciliation status artifact.
 *
 * Answers: "What is the reconciliation status of this file, right now?"
 */
export interface ReconciliationStatus {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * Source file this status is for.
   */
  sourceFile: string;

  /**
   * ISO timestamp when status was computed.
   */
  timestamp: string;

  /**
   * Status of each phase.
   */
  phases: ReconciliationPhases;

  /**
   * Overall reconciliation status.
   */
  overallStatus: OverallStatus;

  /**
   * CI verdict for build gates.
   */
  ciVerdict: CiVerdict;

  /**
   * Human-readable explanation.
   */
  explanation: string;
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Context for computing reconciliation status.
 */
export interface ReconciliationStatusContext {
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

  /**
   * Optional custom rollback preview artifact path.
   */
  rollbackPreviewArtifactPath?: string;
}

// =============================================================================
// LOADED ARTIFACTS
// =============================================================================

/**
 * Loaded apply artifact data.
 */
export interface LoadedApplyData {
  /**
   * Whether the artifact was found.
   */
  found: boolean;

  /**
   * Relative path to the artifact.
   */
  path?: string;

  /**
   * Absolute path to the artifact (for transparency).
   */
  fullPath?: string;

  /**
   * Apply mode used.
   */
  mode?: string;

  /**
   * Whether dry-run was enabled.
   */
  dryRun?: boolean;

  /**
   * Number of operations attempted.
   */
  operationCount?: number;

  /**
   * Number of operations that succeeded.
   */
  successCount?: number;

  /**
   * Number of operations that failed.
   */
  failedCount?: number;
}

/**
 * Loaded verification artifact data.
 */
export interface LoadedVerifyData {
  /**
   * Whether the artifact was found.
   */
  found: boolean;

  /**
   * Relative path to the artifact.
   */
  path?: string;

  /**
   * Absolute path to the artifact (for transparency).
   */
  fullPath?: string;

  /**
   * Total verified count.
   */
  verifiedCount?: number;

  /**
   * Number of mismatches.
   */
  mismatchCount?: number;

  /**
   * Number of missing items.
   */
  missingCount?: number;

  /**
   * Number of skipped items.
   */
  skippedCount?: number;
}

/**
 * Loaded rollback preview artifact data.
 */
export interface LoadedRollbackPreviewData {
  /**
   * Whether the artifact was found.
   */
  found: boolean;

  /**
   * Relative path to the artifact.
   */
  path?: string;

  /**
   * Absolute path to the artifact (for transparency).
   */
  fullPath?: string;

  /**
   * Number of rollback actions.
   */
  actionCount?: number;
}

/**
 * All loaded artifacts.
 */
export interface LoadedArtifacts {
  /**
   * Apply artifact data.
   */
  apply: LoadedApplyData;

  /**
   * Verification artifact data.
   */
  verify: LoadedVerifyData;

  /**
   * Rollback preview artifact data.
   */
  rollbackPreview: LoadedRollbackPreviewData;
}
