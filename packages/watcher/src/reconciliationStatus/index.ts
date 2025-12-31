/**
 * @aesthetic-function/watcher - reconciliationStatus/index.ts
 *
 * Phase 12J: Reconciliation Lifecycle Closure & Status Artifact.
 *
 * WHY: Provides a single, deterministic, human- and CI-readable artifact
 * summarizing the end-to-end reconciliation state for any source file.
 *
 * WHAT:
 * - Answers: "What is the reconciliation status of this file, right now?"
 * - Reads artifacts from Phases 12F-12I (apply, verify, rollback preview)
 * - Produces deterministic status using fixed rules (no heuristics)
 * - Outputs status artifact + exit code for CI
 *
 * STATUS VALUES:
 * - CLEAN: No reconciliation artifacts found
 * - APPLIED_UNVERIFIED: Apply attempted but not verified
 * - VERIFIED_OK: Apply + verification succeeded
 * - VERIFY_FAILED: Verification failed, no rollback available
 * - ROLLBACK_AVAILABLE: Verification failed, rollback preview exists
 * - INCOMPLETE: Missing or inconsistent artifacts
 *
 * CI VERDICTS:
 * - PASS: exit 0
 * - WARN: exit 0
 * - FAIL: exit 1
 */

// Types
export type {
  OverallStatus,
  CiVerdict,
  ApplyPhaseStatus,
  VerifyPhaseStatus,
  RollbackPreviewPhaseStatus,
  ReconciliationPhases,
  ReconciliationStatus,
  ReconciliationStatusContext,
  LoadedApplyData,
  LoadedVerifyData,
  LoadedRollbackPreviewData,
  LoadedArtifacts,
} from './types.js';

// Computation
export {
  loadArtifacts,
  loadArtifactsWithDiscovery,
  computeReconciliationStatus,
  getStatusExitCode,
  shouldWriteStatusArtifact,
  getDefaultApplyArtifactPath,
  getLegacyApplyArtifactPath,
  getDefaultVerificationArtifactPath,
  getDefaultRollbackPreviewArtifactPath,
  getRepoRoot,
  normalizeSourcePath,
} from './compute.js';

// Also re-export the discovery result type
export type { ArtifactDiscoveryResult } from './compute.js';

// Artifact
export {
  getStatusArtifactPath,
  writeReconciliationStatusArtifact,
  formatReconciliationStatus,
} from './artifact.js';
export type { WriteStatusArtifactOptions } from './artifact.js';
