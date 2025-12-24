/**
 * @aesthetic-function/watcher - figmaApply/index.ts
 *
 * Phase 11C: Figma Property Application Module.
 *
 * Public exports for applying resolved canonical semantics to existing
 * Figma structures in a controlled, explicit, and auditable way.
 *
 * CONSTRAINTS:
 * - Does NOT create new Figma nodes
 * - Does NOT infer variants or states
 * - Only applies properties to components with stable nodeIds
 * - Fully auditable, deterministic, idempotent
 */

// Types
export type {
  // Core types
  FigmaApplyOp,
  ApplyResult,
  ApplyPolicyViolation,
  // Configuration
  ApplyConfig,
  ApplyMode,
  ApplyAllowCategory,
  ApplyPropertyType,
  // Input/Output
  ApplyInput,
  ApplyOutput,
  ApplyArtifact,
} from './types.js';

export { PROPERTY_TO_CATEGORY } from './types.js';

// Configuration
export {
  DEFAULT_APPLY_CONFIG,
  loadApplyConfig,
  canApply,
  isCategoryAllowed,
  getApplyStatus,
} from './config.js';

// Policy
export {
  hasStableNodeId,
  getPrimaryNodeId,
  getAllNodeIds,
  validateApplyOp,
  isNodeIdInMap,
  getPropertyCategory,
  meetsConfidenceThreshold,
  filterOperationsByPolicy,
  isValueUnchanged,
  createUnchangedViolation,
} from './applyPolicy.js';

// Operation generation
export {
  createApplyOp,
  generateOpsForComponent,
  generateApplyOps,
  deduplicateOps,
  sortOps,
} from './generateApplyOps.js';

// Artifact
export {
  DEFAULT_ARTIFACT_DIR,
  getRepoRoot,
  normalizeSourcePath,
  generateArtifactName,
  getArtifactPath,
  buildApplyArtifact,
  writeApplyArtifact,
  formatArtifactSummary,
  formatOperationDetails,
  formatViolationDetails,
} from './artifact.js';

// CLI utilities (for testing)
export type { ServerApplyResponse } from './cliApply.js';
export { validateServerResponse } from './cliApply.js';
