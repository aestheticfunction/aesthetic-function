/**
 * @aesthetic-function/watcher - figmaDeltaApply/index.ts
 *
 * Phase 12C: Apply Figma Delta Suggestions - Public Exports.
 *
 * This module takes Phase 12B delta suggestions and applies them to the
 * correct storage target (AST write, marker update, override write).
 */

// Types
export type {
  DeltaApplyTarget,
  DeltaApplyOp,
  DeltaApplyEvidence,
  OpApplyResult,
  DeltaApplySummary,
  DeltaApplyResult,
  DeltaApplyMode,
  DeltaApplyAllowTarget,
  DeltaApplyConfig,
  DeltaApplyInput,
  DeltaApplyArtifact,
} from './types.js';

// Configuration
export {
  DEFAULT_DELTA_APPLY_CONFIG,
  loadDeltaApplyConfig,
  isTargetAllowed,
  meetsConfidenceThreshold,
  isApplyModeEnabled,
  getPreconditionStatus,
} from './config.js';

// Apply functions
export {
  generateDeltaApplyOps,
  executeDeltaApplyOps,
  buildApplySummary,
  loadSuggestionsFromArtifact,
} from './apply.js';

// Artifact functions
export {
  getDeltaApplyArtifactPath,
  buildDeltaApplyArtifact,
  writeDeltaApplyArtifact,
  appendToAuditLog,
} from './artifact.js';
