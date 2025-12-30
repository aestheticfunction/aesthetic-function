/**
 * @aesthetic-function/watcher - reconciliationDrift/index.ts
 *
 * Phase 13C: Drift Diffs (Run-to-Run) Module Exports.
 */

// Types
export type {
  DriftDiffArtifact,
  DriftDiffSummary,
  DriftChange,
  DriftSeverity,
  RunSnapshot,
  RunMetrics,
  DriftDiffContext,
  DriftCliOptions,
  LoadLedgerResult,
  SelectRunsResult,
} from './types.js';

// Compute functions
export {
  getRepoRoot,
  normalizeSourcePath,
  loadRunLedger,
  selectRuns,
  loadRunSnapshot,
  computeDriftDiff,
  computeDriftDiffArtifact,
  createInsufficientHistoryArtifact,
} from './compute.js';

// Artifact functions
export {
  getDriftDiffArtifactPath,
  writeDriftDiffArtifact,
  formatDriftDiff,
  formatDriftDiffVerbose,
} from './artifact.js';

// CLI
export { main as cliMain } from './cliDrift.js';
