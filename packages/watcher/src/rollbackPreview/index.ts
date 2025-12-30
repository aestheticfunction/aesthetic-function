/**
 * @aesthetic-function/watcher - rollbackPreview/index.ts
 *
 * Phase 12I: Rollback Preview & Safety Envelope (Read-Only).
 *
 * This module provides the rollback preview layer that shows exactly
 * what would be undone if a verification failure were to trigger a rollback.
 *
 * Key features:
 * - Read-only only (no mutations)
 * - Deterministic
 * - Explicit
 * - No automatic behavior
 *
 * This phase completes the safety triangle:
 * Apply → Verify → Rollback Preview
 *
 * Rollback execution itself is explicitly out of scope.
 *
 * @example
 * ```ts
 * import {
 *   loadRollbackInputs,
 *   generateRollbackPreview,
 *   writeRollbackPreviewArtifact,
 * } from '@aesthetic-function/watcher/rollbackPreview';
 *
 * const inputs = await loadRollbackInputs(context);
 * if (inputs.success) {
 *   const preview = generateRollbackPreview(inputs, sourceFile);
 *   if (preview.actions.length > 0) {
 *     await writeRollbackPreviewArtifact(preview, repoRoot);
 *   }
 * }
 * ```
 */

// Types
export type {
  RollbackTarget,
  RollbackTriggerStatus,
  RollbackAction,
  RollbackPreviewSummary,
  RollbackPreview,
  RollbackPreviewContext,
  LoadedRollbackInputs,
} from './types.js';

// Generate
export {
  computeRollbackActionId,
  getDefaultApplyArtifactPath,
  getDefaultVerificationArtifactPath,
  loadRollbackInputs,
  buildRollbackSummary,
  generateRollbackPreview,
  hasRollbackActions,
} from './generate.js';

// Artifact
export {
  getRollbackPreviewArtifactPath,
  writeRollbackPreviewArtifact,
  appendRollbackPreviewToAuditLog,
  formatRollbackPreview,
} from './artifact.js';
