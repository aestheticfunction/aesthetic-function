/**
 * @aesthetic-function/watcher - reconciliationDashboard/index.ts
 *
 * Phase 13D: Drift Summary Dashboard - Public API.
 *
 * Usage:
 *   import { computeDashboard, formatDashboard } from './reconciliationDashboard/index.js';
 */

// Types
export type {
  CiVerdict,
  ComputeDashboardResult,
  DashboardCliOptions,
  DashboardContext,
  DashboardSeverity,
  DashboardThresholds,
  DriftDashboardArtifact,
  DriftSignal,
  DriftSignalKey,
  RunSummary,
  RunWindow,
  SeverityCounts,
  StabilityScore,
} from './types.js';

// Config
export {
  DEFAULT_DASHBOARD_LIMIT,
  DEFAULT_THRESHOLDS,
  ENV_DASHBOARD_CI_STRICT,
  ENV_DASHBOARD_FAIL_ON_FAIL_SEVERITY,
  ENV_DASHBOARD_LIMIT,
  ENV_DASHBOARD_MAX_CONFLICT_INCREASE,
  ENV_DASHBOARD_MAX_DELTA_INCREASE,
  ENV_DASHBOARD_MAX_FAIL,
  ENV_DASHBOARD_MAX_VERIFY_MISMATCH_INCREASE,
  ENV_DASHBOARD_MAX_WARN,
  ENV_RECONCILIATION_DASHBOARD_ON,
  getDashboardLimit,
  isCiStrictMode,
  isDashboardEnabled,
  loadDashboardConfig,
  loadThresholdsFromEnv,
  parseBoolEnv,
  parseNumberEnv,
} from './config.js';
export type { DashboardConfig } from './config.js';

// Compute
export {
  computeCiVerdict,
  computeDashboard,
  computeStabilityScore,
  getRepoRoot,
  normalizeSourcePath,
} from './compute.js';

// Artifact
export {
  formatDashboard,
  formatDashboardVerbose,
  getDashboardArtifactPath,
  writeDashboardArtifact,
} from './artifact.js';
export type { WriteDashboardResult } from './artifact.js';

// CLI
export { main as runDashboardCli } from './cliDashboard.js';
