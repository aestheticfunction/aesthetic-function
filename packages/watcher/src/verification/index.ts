/**
 * @aesthetic-function/watcher - verification/index.ts
 *
 * Phase 12G: Post-Apply Verification & Rollback Artifacts.
 *
 * This module provides the verification layer that confirms whether
 * applied resolution plans landed as intended.
 *
 * Key features:
 * - Verification-only (no mutations)
 * - Detect drift or partial failure
 * - Produce deterministic verification artifacts
 * - Prepare rollback information (read-only)
 *
 * @example
 * ```ts
 * import {
 *   loadApplyArtifact,
 *   verifyResolutionApply,
 *   formatVerificationSummary,
 * } from '@aesthetic-function/watcher/verification';
 *
 * const applyResult = await loadApplyArtifact(filePath, repoRoot);
 * if (applyResult.success) {
 *   const report = await verifyResolutionApply(applyResult.artifact, plan, context);
 *   console.log(formatVerificationSummary(report.summary));
 * }
 * ```
 */

// Types
export type {
  VerificationStatus,
  VerificationTarget,
  VerificationItem,
  VerificationEvidence,
  VerificationSummary,
  VerificationReport,
  VerificationContext,
  VerificationConfig,
  LoadedApplyArtifact,
  LoadedPlanArtifact,
} from './types.js';

// Verify
export {
  DEFAULT_VERIFICATION_CONFIG,
  loadVerificationConfig,
  loadApplyArtifact,
  loadPlanArtifact,
  verifyResolutionApply,
  verificationPassed,
  formatVerificationSummary,
  buildVerificationSummary,
} from './verify.js';

// Artifact
export {
  getVerificationArtifactPath,
  writeVerificationArtifact,
  appendVerificationToAuditLog,
  shouldWriteArtifact,
  getVerificationExitCode,
} from './artifact.js';
