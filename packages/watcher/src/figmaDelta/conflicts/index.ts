/**
 * @aesthetic-function/watcher - figmaDelta/conflicts/index.ts
 *
 * Phase 12D: Conflict Surfacing & Resolution Preview.
 *
 * Public API for the conflict detection module.
 */

// Types
export type {
  ConflictTarget,
  ConflictType,
  ConflictEvidence,
  ConflictItem,
  ConflictSummary,
  ConflictReport,
  ConflictDetectionInput,
} from './types.js';

// Functions
export { generateConflictReport } from './conflictDetection.js';
export {
  getConflictArtifactPath,
  buildConflictArtifact,
  writeConflictArtifact,
} from './artifact.js';
