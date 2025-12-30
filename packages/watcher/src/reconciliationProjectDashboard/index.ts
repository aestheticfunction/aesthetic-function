/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/index.ts
 *
 * Phase 13E: Project Dashboard Aggregation - Public API.
 *
 * Usage:
 *   import { computeProjectDashboard, formatProjectDashboard } from './reconciliationProjectDashboard/index.js';
 */

// Types
export type {
  CiVerdict,
  ComputeProjectDashboardResult,
  DashboardSeverity,
  DashboardThresholds,
  FileDashboardStatus,
  FileDashboardSummary,
  LoadFileDashboardResult,
  ProjectCounts,
  ProjectDashboardArtifact,
  ProjectDashboardCliOptions,
  ProjectDashboardContext,
  ProjectSignal,
  ProjectStabilityScore,
  SeverityCounts,
} from './types.js';

// Compute
export {
  computeProjectDashboard,
  discoverSourceFiles,
  getRepoRoot,
  loadFileDashboard,
  normalizeSourcePath,
  normalizeScanRoot,
} from './compute.js';

// Artifact
export {
  formatProjectDashboard,
  formatProjectDashboardVerbose,
  getProjectDashboardArtifactPath,
  writeProjectDashboardArtifact,
} from './artifact.js';
export type { WriteProjectDashboardResult } from './artifact.js';

// CLI
export { main as runProjectDashboardCli } from './cliProjectDashboard.js';
