/**
 * @aesthetic-function/watcher - figmaResolveApply/index.ts
 *
 * Phase 12F: Apply Resolution Plans
 * Phase 12H: Post-Apply Auto-Verification + CI Gate
 *
 * This module provides the execution layer for applying resolution plans
 * generated in Phase 12E. It supports:
 *
 * - Artifact-only mode (default): Preview what would change
 * - Apply mode: Mutate targets (AST, markers, overrides)
 * - Post-apply verification: Automatic verification after apply (Phase 12H)
 *
 * All operations require explicit opt-in via environment variables:
 * - FIGMA_RESOLVE_APPLY_ON=true
 * - FIGMA_RESOLVE_APPLY_MODE=apply
 * - FIGMA_RESOLVE_APPLY_DRY_RUN=false
 *
 * Post-apply verification (Phase 12H):
 * - POST_APPLY_VERIFY=true
 * - POST_APPLY_VERIFY_INCLUDE_FIGMA=true/false
 * - POST_APPLY_VERIFY_STRICT=true/false
 *
 * @example
 * ```ts
 * import {
 *   loadResolveApplyConfig,
 *   loadResolutionPlan,
 *   executeResolutionPlan,
 *   buildResolveApplyArtifact,
 * } from '@aesthetic-function/watcher/figmaResolveApply';
 *
 * const config = loadResolveApplyConfig();
 * const planResult = await loadResolutionPlan(filePath, repoRoot);
 * if (planResult.success) {
 *   const results = await executeResolutionPlan({
 *     plan: planResult.plan,
 *     config,
 *     repoRoot,
 *   });
 *   const artifact = buildResolveApplyArtifact(...);
 * }
 * ```
 */

// Types
export type {
  ResolutionApplyTarget,
  ResolutionApplyStatus,
  ResolutionApplyMode,
  ResolutionApplyAllowTarget,
  ResolutionApplyConfig,
  ResolutionApplyInput,
  ResolutionApplyResultItem,
  ResolutionApplyEvidence,
  ResolutionApplyArtifact,
  ResolutionApplySummary,
  LoadedResolutionPlan,
  PostApplyVerifyConfig,
  PostApplyVerifyResult,
} from './types.js';

// Config
export {
  loadResolveApplyConfig,
  isResolveTargetAllowed,
  isResolveApplyModeEnabled,
  getResolvePreconditionStatus,
  formatResolveApplyConfig,
  loadPostApplyVerifyConfig,
  shouldRunPostApplyVerification,
  formatPostApplyVerifyConfig,
} from './config.js';

// Apply
export {
  loadResolutionPlan,
  computeDecisionId,
  executeResolutionPlan,
  buildResolveSummary,
} from './apply.js';

// Artifact
export {
  getResolveApplyArtifactPath,
  buildResolveApplyArtifact,
  writeResolveApplyArtifact,
  appendResolveApplyToAuditLog,
} from './artifact.js';

// Post-Apply Verification (Phase 12H)
export {
  runPostApplyVerification,
  createSkippedVerificationResult,
  formatPostApplyVerifyResult,
  getExpectedVerificationPath,
} from './postApplyVerify.js';
export type { PostApplyVerifyContext } from './postApplyVerify.js';
