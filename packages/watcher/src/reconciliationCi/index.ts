/**
 * @aesthetic-function/watcher - reconciliationCi/index.ts
 *
 * Phase 13F: CI Gate Summary + Trend Window - Public API.
 *
 * Usage:
 *   import { computeCiGate, formatCiGate } from './reconciliationCi/index.js';
 */

// Types
export type {
  CiGateArtifact,
  CiGateCliOptions,
  CiGateContext,
  CiTrendPolicy,
  CiVerdict,
  CiVerdictMessage,
  ComputeCiGateResult,
  FileTrend,
  ProjectCounts,
  ProjectSignal,
  ProjectStabilityScore,
  ResolveTrendPolicyResult,
  TrendDirection,
  TrendSummary,
} from './types.js';

export {
  DEFAULT_TREND_POLICY,
  getCiVerdictMessage,
} from './types.js';

// Config (Phase 13F.1)
export {
  determineCiVerdict,
  ENV_CI_STRICT,
  ENV_FAIL_ON_WORSENING,
  ENV_IMPROVING_DELTA,
  ENV_MAX_FILES,
  ENV_TREND_WINDOW,
  ENV_WORSENING_DELTA,
  formatTrendPolicy,
  isCiStrictModeFromEnv,
  loadTrendPolicyFromEnv,
  resolveTrendPolicy,
  validateTrendPolicy,
} from './config.js';

// Compute
export {
  computeCiGate,
  DEFAULT_TREND_WINDOW,
  getCiWindowSize,
  getRepoRoot,
  isCiStrictMode,
  normalizeSourcePath,
  normalizeScanRoot,
} from './compute.js';

// Artifact
export {
  formatCiGate,
  formatCiGateVerbose,
  getCiGateArtifactPath,
  writeCiGateArtifact,
} from './artifact.js';
export type { WriteCiGateResult } from './artifact.js';

// CLI
export { main as runCiCli } from './cliCi.js';
