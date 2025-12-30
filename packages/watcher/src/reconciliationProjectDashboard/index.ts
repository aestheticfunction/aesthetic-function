/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/index.ts
 *
 * Phase 13E: Project Dashboard Aggregation - Public API.
 * Phase 13E.1: Thresholds & CI UX Hardening.
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
  ProjectDashboardThresholds,
  ProjectSignal,
  ProjectStabilityScore,
  ResolveThresholdsResult,
  SeverityCounts,
  VerdictMessage,
} from './types.js';

export {
  DEFAULT_PROJECT_THRESHOLDS,
  getVerdictMessage,
} from './types.js';

// Config (Phase 13E.1)
export {
  ENV_FAIL_SCORE,
  ENV_MAX_SIGNALS,
  ENV_WARN_SCORE,
  determineVerdict,
  formatThresholds,
  loadThresholdsFromEnv,
  resolveThresholds,
} from './config.js';

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
