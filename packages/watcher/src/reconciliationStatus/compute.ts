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
 *
 * Phase 12J.1: Fixed artifact discovery to use correct names and repo-root.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

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
// REPO ROOT DETECTION
// =============================================================================

/** High-priority markers that definitively indicate repository root */
const REPO_ROOT_PRIMARY_MARKERS = ['pnpm-workspace.yaml', '.git'];

/** Fallback marker (less reliable in monorepos) */
const REPO_ROOT_FALLBACK_MARKER = 'package.json';

/**
 * Get the repository root directory.
 *
 * Looks for pnpm-workspace.yaml or .git directory first (primary markers).
 * Falls back to package.json only if primary markers not found.
 * This ensures correct behavior in monorepos where each package has package.json.
 *
 * @param startDir - Starting directory (defaults to process.cwd())
 * @returns Absolute path to the repository root
 */
export function getRepoRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);
  const fsRoot = dirname(currentDir) === currentDir ? currentDir : '/';

  // First pass: look for primary markers (pnpm-workspace.yaml or .git)
  let checkDir = currentDir;
  while (checkDir !== fsRoot) {
    for (const marker of REPO_ROOT_PRIMARY_MARKERS) {
      const markerPath = join(checkDir, marker);
      if (existsSync(markerPath)) {
        return checkDir;
      }
    }
    checkDir = dirname(checkDir);
  }

  // Second pass: fallback to package.json if no primary marker found
  checkDir = currentDir;
  while (checkDir !== fsRoot) {
    const markerPath = join(checkDir, REPO_ROOT_FALLBACK_MARKER);
    if (existsSync(markerPath)) {
      return checkDir;
    }
    checkDir = dirname(checkDir);
  }

  // Final fallback to process.cwd()
  return process.cwd();
}

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Normalize source file path for artifact naming.
 * Converts: demo-app/src/App.tsx → demo-app__src__App
 */
function normalizeSourceFile(sourceFile: string): string {
  return sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Get the default apply artifact path for a source file.
 *
 * Supports both legacy (.figma-resolve-apply.json) and current (.figma-resolution-apply.json).
 * Returns the current artifact name; use tryLoadApplyArtifact for fallback.
 */
export function getDefaultApplyArtifactPath(sourceFile: string): string {
  const normalized = normalizeSourceFile(sourceFile);
  return `design-materializations/${normalized}.figma-resolution-apply.json`;
}

/**
 * Get the legacy apply artifact path for backward compatibility.
 */
export function getLegacyApplyArtifactPath(sourceFile: string): string {
  const normalized = normalizeSourceFile(sourceFile);
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
 * Try loading an artifact from a path, returning the data or not-found.
 */
async function tryLoadApplyArtifact(
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
      fullPath,
      mode: artifact.mode,
      dryRun: artifact.dryRun,
      operationCount: artifact.results?.length ?? 0,
      successCount,
      failedCount,
    };
  } catch {
    return { found: false, path: artifactPath, fullPath: join(repoRoot, artifactPath) };
  }
}

/**
 * Load apply artifact data, trying current then legacy paths.
 */
async function loadApplyArtifact(
  sourceFile: string,
  repoRoot: string,
  customPath?: string
): Promise<LoadedApplyData & { checkedPaths: string[] }> {
  const checkedPaths: string[] = [];

  // If custom path provided, only try that
  if (customPath) {
    checkedPaths.push(join(repoRoot, customPath));
    const result = await tryLoadApplyArtifact(customPath, repoRoot);
    return { ...result, checkedPaths };
  }

  // Try current path first
  const currentPath = getDefaultApplyArtifactPath(sourceFile);
  checkedPaths.push(join(repoRoot, currentPath));
  const currentResult = await tryLoadApplyArtifact(currentPath, repoRoot);
  if (currentResult.found) {
    return { ...currentResult, checkedPaths };
  }

  // Try legacy path for backward compatibility
  const legacyPath = getLegacyApplyArtifactPath(sourceFile);
  checkedPaths.push(join(repoRoot, legacyPath));
  const legacyResult = await tryLoadApplyArtifact(legacyPath, repoRoot);
  return { ...legacyResult, checkedPaths };
}

/**
 * Load verification artifact data.
 */
async function loadVerificationArtifact(
  sourceFile: string,
  repoRoot: string,
  customPath?: string
): Promise<LoadedVerifyData & { checkedPaths: string[] }> {
  const artifactPath = customPath ?? getDefaultVerificationArtifactPath(sourceFile);
  const fullPath = join(repoRoot, artifactPath);
  const checkedPaths = [fullPath];

  try {
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as VerificationReport;

    return {
      found: true,
      path: artifactPath,
      fullPath,
      verifiedCount: artifact.summary?.verified ?? 0,
      mismatchCount: artifact.summary?.mismatch ?? 0,
      missingCount: artifact.summary?.missing ?? 0,
      skippedCount: artifact.summary?.skipped ?? 0,
      checkedPaths,
    };
  } catch {
    return { found: false, path: artifactPath, fullPath, checkedPaths };
  }
}

/**
 * Load rollback preview artifact data.
 */
async function loadRollbackPreviewArtifact(
  sourceFile: string,
  repoRoot: string,
  customPath?: string
): Promise<LoadedRollbackPreviewData & { checkedPaths: string[] }> {
  const artifactPath = customPath ?? getDefaultRollbackPreviewArtifactPath(sourceFile);
  const fullPath = join(repoRoot, artifactPath);
  const checkedPaths = [fullPath];

  try {
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as RollbackPreview;

    return {
      found: true,
      path: artifactPath,
      fullPath,
      actionCount: artifact.actions?.length ?? 0,
      checkedPaths,
    };
  } catch {
    return { found: false, path: artifactPath, fullPath, checkedPaths };
  }
}

/**
 * Artifact discovery result with checked paths for logging.
 */
export interface ArtifactDiscoveryResult {
  artifacts: LoadedArtifacts;
  discovery: {
    repoRoot: string;
    applyCheckedPaths: string[];
    verifyCheckedPaths: string[];
    rollbackCheckedPaths: string[];
  };
}

/**
 * Load all artifacts for a source file with discovery logging.
 */
export async function loadArtifacts(
  context: ReconciliationStatusContext
): Promise<LoadedArtifacts> {
  const result = await loadArtifactsWithDiscovery(context);
  return result.artifacts;
}

/**
 * Load all artifacts with full discovery information for CLI transparency.
 */
export async function loadArtifactsWithDiscovery(
  context: ReconciliationStatusContext
): Promise<ArtifactDiscoveryResult> {
  const [applyResult, verifyResult, rollbackResult] = await Promise.all([
    loadApplyArtifact(context.sourceFile, context.repoRoot, context.applyArtifactPath),
    loadVerificationArtifact(context.sourceFile, context.repoRoot, context.verificationArtifactPath),
    loadRollbackPreviewArtifact(context.sourceFile, context.repoRoot, context.rollbackPreviewArtifactPath),
  ]);

  // Extract just the artifact data (without checkedPaths) for the LoadedArtifacts result
  const { checkedPaths: applyCheckedPaths, ...apply } = applyResult;
  const { checkedPaths: verifyCheckedPaths, ...verify } = verifyResult;
  const { checkedPaths: rollbackCheckedPaths, ...rollbackPreview } = rollbackResult;

  return {
    artifacts: { apply, verify, rollbackPreview },
    discovery: {
      repoRoot: context.repoRoot,
      applyCheckedPaths,
      verifyCheckedPaths,
      rollbackCheckedPaths,
    },
  };
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
