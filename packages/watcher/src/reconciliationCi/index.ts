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
  CiVerdict,
  ComputeCiGateResult,
  FileTrend,
  ProjectCounts,
  ProjectSignal,
  ProjectStabilityScore,
  TrendDirection,
  TrendSummary,
} from './types.js';

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
