/**
 * @aesthetic-function/watcher - reconciliationStatus/compute.ts
 *
 * Phase 12J: Reconciliation Status Computation.
 *
 * WHY: Computes lifecycle status from existing artifacts (12F-12I).
 * Uses a deterministic rule-table with no heuristics or inference.
 *
 * SCOPE:
 * - Read existing artifacts only
 * - Compute status using fixed rules
 * - Produce deterministic output
 *
 * CONSTRAINTS:
 * - Read-only only (no mutations)
 * - No heuristics, no inference
 * - Rule-table only
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolutionApplyArtifact } from '../figmaResolveApply/types.js';
import type { VerificationReport } from '../verification/types.js';
import type { RollbackPreview } from '../rollbackPreview/types.js';
import type {
  ReconciliationStatus,
  ReconciliationStatusContext,
  ReconciliationPhases,
  OverallStatus,
  CiVerdict,
  LoadedArtifacts,
  LoadedApplyData,
  LoadedVerifyData,
  LoadedRollbackPreviewData,
  ApplyPhaseStatus,
  VerifyPhaseStatus,
  RollbackPreviewPhaseStatus,
} from './types.js';

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Get the default apply artifact path for a source file.
 */
export function getDefaultApplyArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-resolve-apply.json`;
}

/**
 * Get the default verification artifact path for a source file.
 */
export function getDefaultVerificationArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-verification.json`;
}

/**
 * Get the default rollback preview artifact path for a source file.
 */
export function getDefaultRollbackPreviewArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-rollback-preview.json`;
}

// =============================================================================
// ARTIFACT LOADING
// =============================================================================

/**
 * Load apply artifact data.
 */
async function loadApplyArtifact(
  artifactPath: string,
  repoRoot: string
): Promise<LoadedApplyData> {
  try {
    const fullPath = join(repoRoot, artifactPath);
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as ResolutionApplyArtifact;

    const successCount = artifact.results?.filter((r) => r.success)?.length ?? 0;
    const failedCount = artifact.results?.filter((r) => !r.success)?.length ?? 0;

    return {
      found: true,
      path: artifactPath,
      mode: artifact.mode,
      dryRun: artifact.dryRun,
      operationCount: artifact.results?.length ?? 0,
      successCount,
      failedCount,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Load verification artifact data.
 */
async function loadVerificationArtifact(
  artifactPath: string,
  repoRoot: string
): Promise<LoadedVerifyData> {
  try {
    const fullPath = join(repoRoot, artifactPath);
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as VerificationReport;

    return {
      found: true,
      path: artifactPath,
      verifiedCount: artifact.summary?.verified ?? 0,
      mismatchCount: artifact.summary?.mismatch ?? 0,
      missingCount: artifact.summary?.missing ?? 0,
      skippedCount: artifact.summary?.skipped ?? 0,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Load rollback preview artifact data.
 */
async function loadRollbackPreviewArtifact(
  artifactPath: string,
  repoRoot: string
): Promise<LoadedRollbackPreviewData> {
  try {
    const fullPath = join(repoRoot, artifactPath);
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as RollbackPreview;

    return {
      found: true,
      path: artifactPath,
      actionCount: artifact.actions?.length ?? 0,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Load all artifacts for a source file.
 */
export async function loadArtifacts(
  context: ReconciliationStatusContext
): Promise<LoadedArtifacts> {
  const applyPath = context.applyArtifactPath ?? getDefaultApplyArtifactPath(context.sourceFile);
  const verifyPath = context.verificationArtifactPath ?? getDefaultVerificationArtifactPath(context.sourceFile);
  const rollbackPath = context.rollbackPreviewArtifactPath ?? getDefaultRollbackPreviewArtifactPath(context.sourceFile);

  const [apply, verify, rollbackPreview] = await Promise.all([
    loadApplyArtifact(applyPath, context.repoRoot),
    loadVerificationArtifact(verifyPath, context.repoRoot),
    loadRollbackPreviewArtifact(rollbackPath, context.repoRoot),
  ]);

  return { apply, verify, rollbackPreview };
}

// =============================================================================
// PHASE STATUS COMPUTATION
// =============================================================================

/**
 * Compute apply phase status from loaded data.
 */
function computeApplyPhaseStatus(data: LoadedApplyData): ApplyPhaseStatus | undefined {
  if (!data.found) {
    return undefined;
  }

  return {
    attempted: true,
    dryRun: data.dryRun ?? true,
    success: (data.failedCount ?? 0) === 0,
    operationCount: data.operationCount ?? 0,
  };
}

/**
 * Compute verify phase status from loaded data.
 */
function computeVerifyPhaseStatus(data: LoadedVerifyData): VerifyPhaseStatus | undefined {
  if (!data.found) {
    return undefined;
  }

  const mismatchCount = data.mismatchCount ?? 0;
  const missingCount = data.missingCount ?? 0;

  return {
    attempted: true,
    success: mismatchCount === 0 && missingCount === 0,
    mismatchCount,
    missingCount,
  };
}

/**
 * Compute rollback preview phase status from loaded data.
 */
function computeRollbackPreviewPhaseStatus(
  data: LoadedRollbackPreviewData
): RollbackPreviewPhaseStatus | undefined {
  if (!data.found) {
    return undefined;
  }

  return {
    available: true,
    actionCount: data.actionCount ?? 0,
  };
}

// =============================================================================
// STATUS DETERMINATION (RULE TABLE)
// =============================================================================

/**
 * Determine overall status and CI verdict using fixed rules.
 *
 * Rule table:
 * | Condition                           | overallStatus        | ciVerdict |
 * |-------------------------------------|----------------------|-----------|
 * | No apply, no deltas                 | CLEAN                | PASS      |
 * | Apply attempted, no verify          | APPLIED_UNVERIFIED   | WARN      |
 * | Apply + verify success              | VERIFIED_OK          | PASS      |
 * | Verify failed, rollback preview     | ROLLBACK_AVAILABLE   | FAIL      |
 * | Verify failed, no rollback preview  | VERIFY_FAILED        | FAIL      |
 * | Missing or inconsistent artifacts   | INCOMPLETE           | WARN      |
 *
 * No heuristics. No inference. Rule-table only.
 */
function determineStatus(phases: ReconciliationPhases): {
  overallStatus: OverallStatus;
  ciVerdict: CiVerdict;
  explanation: string;
} {
  const { apply, verify, rollbackPreview } = phases;

  // Rule 1: No apply artifact → CLEAN
  if (!apply) {
    return {
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      explanation: 'No reconciliation artifacts found. File is clean.',
    };
  }

  // Rule 2: Apply exists but was dry-run only → CLEAN (nothing actually applied)
  if (apply.dryRun) {
    return {
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      explanation: 'Apply was dry-run only. No actual changes were made.',
    };
  }

  // Rule 3: Apply attempted, no verify → APPLIED_UNVERIFIED
  if (!verify) {
    return {
      overallStatus: 'APPLIED_UNVERIFIED',
      ciVerdict: 'WARN',
      explanation: 'Apply was attempted but verification has not been run.',
    };
  }

  // Rule 4: Apply + verify success → VERIFIED_OK
  if (verify.success) {
    return {
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      explanation: 'Apply succeeded and verification passed.',
    };
  }

  // Rule 5: Verify failed + rollback preview exists → ROLLBACK_AVAILABLE
  if (rollbackPreview?.available && rollbackPreview.actionCount > 0) {
    return {
      overallStatus: 'ROLLBACK_AVAILABLE',
      ciVerdict: 'FAIL',
      explanation: `Verification failed (${verify.mismatchCount} mismatches, ${verify.missingCount} missing). Rollback preview available with ${rollbackPreview.actionCount} action(s).`,
    };
  }

  // Rule 6: Verify failed, no rollback preview → VERIFY_FAILED
  return {
    overallStatus: 'VERIFY_FAILED',
    ciVerdict: 'FAIL',
    explanation: `Verification failed (${verify.mismatchCount} mismatches, ${verify.missingCount} missing). No rollback preview available.`,
  };
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Compute reconciliation status from loaded artifacts.
 */
export function computeReconciliationStatus(
  artifacts: LoadedArtifacts,
  sourceFile: string
): ReconciliationStatus {
  // Compute phase statuses
  const phases: ReconciliationPhases = {};

  const applyStatus = computeApplyPhaseStatus(artifacts.apply);
  if (applyStatus) {
    phases.apply = applyStatus;
  }

  const verifyStatus = computeVerifyPhaseStatus(artifacts.verify);
  if (verifyStatus) {
    phases.verify = verifyStatus;
  }

  const rollbackStatus = computeRollbackPreviewPhaseStatus(artifacts.rollbackPreview);
  if (rollbackStatus) {
    phases.rollbackPreview = rollbackStatus;
  }

  // Determine overall status and verdict
  const { overallStatus, ciVerdict, explanation } = determineStatus(phases);

  return {
    version: '1.0',
    sourceFile,
    timestamp: new Date().toISOString(),
    phases,
    overallStatus,
    ciVerdict,
    explanation,
  };
}

/**
 * Get exit code for CLI based on CI verdict.
 *
 * - PASS: 0
 * - WARN: 0
 * - FAIL: 1
 */
export function getStatusExitCode(status: ReconciliationStatus): number {
  return status.ciVerdict === 'FAIL' ? 1 : 0;
}

/**
 * Check if status artifact should be written.
 *
 * Only write when non-CLEAN status.
 */
export function shouldWriteStatusArtifact(status: ReconciliationStatus): boolean {
  return status.overallStatus !== 'CLEAN';
}
