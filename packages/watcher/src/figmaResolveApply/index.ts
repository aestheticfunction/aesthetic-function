/**
 * @aesthetic-function/watcher - figmaResolveApply/index.ts
 *
 * Phase 12F: Apply Resolution Plans
 *
 * This module provides the execution layer for applying resolution plans
 * generated in Phase 12E. It supports:
 *
 * - Artifact-only mode (default): Preview what would change
 * - Apply mode: Mutate targets (AST, markers, overrides)
 *
 * All operations require explicit opt-in via environment variables:
 * - FIGMA_RESOLVE_APPLY_ON=true
 * - FIGMA_RESOLVE_APPLY_MODE=apply
 * - FIGMA_RESOLVE_APPLY_DRY_RUN=false
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
} from './types.js';

// Config
export {
  loadResolveApplyConfig,
  isResolveTargetAllowed,
  isResolveApplyModeEnabled,
  getResolvePreconditionStatus,
  formatResolveApplyConfig,
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
