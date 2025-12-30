/**
 * @aesthetic-function/watcher - reconciliationIndex/index.ts
 *
 * Phase 13A: Reconciliation Run Index.
 *
 * WHY: Provides a single, deterministic artifact summarizing what
 * reconciliation artifacts exist for a given source file.
 *
 * WHAT:
 * - Indexes artifacts from Phases 12A-12J (delta, suggestions, conflicts,
 *   resolution plan, resolution apply, verification, rollback preview, status)
 * - Extracts key metadata (timestamps, modes, counts)
 * - Produces deterministic output for CI and human inspection
 *
 * SCOPE:
 * - Read-only indexing only (NOT a timeline)
 * - One-shot current/latest artifacts
 * - Repo-root aware (works from any working directory)
 *
 * CONSTRAINTS:
 * - Does NOT generate new deltas, plans, or apply ops
 * - Does NOT mutate TSX, markers, overrides, or Figma
 */

// Types
export type {
  IndexedArtifactType,
  ArtifactEntry,
  ArtifactEntryFound,
  ArtifactEntryNotFound,
  ArtifactSummary,
  DeltaSummary,
  DeltaSuggestionsSummary,
  ConflictsSummary,
  ResolutionPlanSummary,
  ResolutionApplySummary,
  VerificationSummary,
  RollbackPreviewSummary,
  StatusSummary,
  IndexedArtifacts,
  IndexNote,
  NoteLevel,
  RunIndexArtifact,
  RunIndexContext,
  RunIndexDiscoveryResult,
} from './types.js';

// Computation
export {
  computeRunIndex,
  computeRunIndexSimple,
  getRepoRoot,
  normalizeSourcePath,
} from './compute.js';

// Artifact
export {
  getRunIndexArtifactPath,
  writeRunIndexArtifact,
  formatRunIndex,
  formatDiscovery,
} from './artifact.js';
