/**
 * @aesthetic-function/watcher - reconciliationTimeline/index.ts
 *
 * Phase 13B: Design Drift Timeline (Append-Only Run Ledger).
 *
 * WHY: Provides a time-ordered, append-only run ledger that records
 * reconciliation runs over time for a given source file.
 *
 * WHAT:
 * - Records run entries when commands complete (feature flag gated)
 * - Maintains append-only ledger (never rewrite or compact)
 * - Enables longitudinal analysis of design/code drift
 *
 * SCOPE:
 * - Record-keeping only (memory, not intelligence)
 * - No diffing or trend analysis (reserved for 13C)
 * - Repo-root aware (works from any working directory)
 *
 * CONSTRAINTS:
 * - Does NOT recompute or reinterpret artifacts
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Does NOT change reconciliation logic, exit codes, or status rules
 */

// Types
export type {
  RunId,
  RunEntry,
  RunArtifactRefs,
  RunSummary,
  RunLedgerArtifact,
  TimelineRecordContext,
  TimelineReadContext,
  TimelineCliOptions,
} from './types.js';

// Computation
export {
  isTimelineEnabled,
  generateRunId,
  getRunLedgerPath,
  loadRunLedger,
  getRuns,
  getRecentRuns,
  createRunEntry,
  appendRunEntry,
  recordRun,
  getRepoRoot,
  normalizeSourcePath,
} from './compute.js';

// Artifact
export {
  writeRunLedger,
  formatTimeline,
  formatTimelineVerbose,
} from './artifact.js';
