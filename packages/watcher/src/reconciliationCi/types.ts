/**
 * @aesthetic-function/watcher - reconciliationCi/types.ts
 *
 * Phase 13F: CI Gate Summary + Trend Window Types.
 *
 * WHY: Defines types for the CI-focused gate command that computes a
 * pass/warn/fail decision from Phase 13E project dashboard data, with
 * a small trend window derived from Phase 13B ledgers.
 *
 * SCOPE:
 * - Read-only gate computation
 * - Reuses Phase 13E project dashboard
 * - Trend window from Phase 13B ledgers
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import type {
  CiVerdict,
  ProjectCounts,
  ProjectSignal,
  ProjectStabilityScore,
  FileDashboardSummary,
} from '../reconciliationProjectDashboard/types.js';

// Re-export commonly used types
export type { CiVerdict, ProjectCounts, ProjectSignal, ProjectStabilityScore };

// =============================================================================
// TREND DIRECTION
// =============================================================================

/**
 * Direction of trend over the window.
 */
export type TrendDirection = 'improving' | 'stable' | 'worsening';

// =============================================================================
// FILE TREND
// =============================================================================

/**
 * Trend information for a single file.
 */
export interface FileTrend {
  /**
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * Number of runs in the trend window for this file.
   */
  runsInWindow: number;

  /**
   * Trend direction based on stability score changes.
   */
  direction: TrendDirection;

  /**
   * Starting stability score (oldest in window).
   */
  startScore?: number;

  /**
   * Ending stability score (newest in window).
   */
  endScore?: number;

  /**
   * Change in stability score (end - start).
   */
  scoreDelta?: number;
}

// =============================================================================
// TREND SUMMARY
// =============================================================================

/**
 * Summary of trends across all files in the project.
 */
export interface TrendSummary {
  /**
   * Number of files showing improvement (higher stability score).
   */
  improving: number;

  /**
   * Number of files showing stability (no significant change).
   */
  stable: number;

  /**
   * Number of files showing worsening (lower stability score).
   */
  worsening: number;

  /**
   * Number of files with insufficient data for trend analysis.
   */
  insufficientData: number;

  /**
   * Per-file trend information (sorted by sourceFile).
   */
  files: FileTrend[];

  /**
   * Window size used for trend computation.
   */
  windowSize: number;
}

// =============================================================================
// CI GATE ARTIFACT
// =============================================================================

/**
 * CI Gate artifact for project-level gate decision.
 *
 * Pattern: design-materializations/<scanRoot>.figma-ci-gate.json
 */
export interface CiGateArtifact {
  /**
   * Artifact format version.
   */
  version: 1;

  /**
   * ISO 8601 timestamp when this gate was computed.
   */
  generatedAt: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Scan root directory (repo-relative).
   */
  scanRoot: string;

  /**
   * Glob pattern used for file discovery.
   */
  filePattern: string;

  /**
   * Project-level counts (from Phase 13E).
   */
  counts: ProjectCounts;

  /**
   * Project-level stability score (from Phase 13E).
   */
  stabilityScore: ProjectStabilityScore;

  /**
   * Trend summary across files.
   */
  trend: TrendSummary;

  /**
   * Top drift signals across the project (sorted deterministically).
   */
  topSignals: ProjectSignal[];

  /**
   * Per-file dashboard summaries (from Phase 13E).
   */
  files: FileDashboardSummary[];

  /**
   * Project-level CI verdict.
   */
  verdict: CiVerdict;

  /**
   * Exit code (0 or 1).
   */
  exitCode: 0 | 1;

  /**
   * Human-readable explanation of the verdict.
   */
  explanation: string;
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Context for computing a CI gate.
 */
export interface CiGateContext {
  /**
   * Scan root directory (can be absolute or repo-relative).
   */
  scanRoot: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Maximum runs to consider per file for dashboard (passed to 13D/13E).
   */
  limit: number;

  /**
   * Trend window size (how many recent runs to consider for trend).
   */
  window: number;

  /**
   * Whether CI strict mode is enabled.
   */
  strict: boolean;
}

/**
 * CLI options for figma:ci command.
 */
export interface CiGateCliOptions {
  /**
   * Scan root directory (required positional arg).
   */
  scanRoot: string;

  /**
   * Optional explicit repository root.
   */
  repoRoot?: string;

  /**
   * Maximum runs to consider per file for dashboard.
   */
  limit: number;

  /**
   * Trend window size.
   */
  window: number;

  /**
   * Output as JSON.
   */
  json?: boolean;

  /**
   * Write artifact to disk.
   */
  write?: boolean;

  /**
   * CI strict mode (exit 1 on FAIL verdict).
   */
  strict?: boolean;

  /**
   * Verbose output.
   */
  verbose?: boolean;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of computing a CI gate.
 */
export type ComputeCiGateResult =
  | { ok: true; artifact: CiGateArtifact }
  | { ok: false; error: string };
