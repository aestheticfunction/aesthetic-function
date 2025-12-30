/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/types.ts
 *
 * Phase 13E: Project Dashboard Aggregation Types.
 *
 * WHY: Defines types for the project-level dashboard artifact that aggregates
 * Phase 13D dashboards across many source files.
 *
 * SCOPE:
 * - Read-only aggregation only
 * - Uses Phase 13D per-file dashboards
 * - Deterministic output
 * - CI-friendly project-level verdict
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import type {
  CiVerdict,
  DashboardSeverity,
  DashboardThresholds,
  DriftDashboardArtifact,
  DriftSignal,
  SeverityCounts,
  StabilityScore,
} from '../reconciliationDashboard/types.js';

// Re-export commonly used types from Phase 13D
export type { CiVerdict, DashboardSeverity, DashboardThresholds, SeverityCounts };

// =============================================================================
// FILE DASHBOARD STATUS
// =============================================================================

/**
 * Status of a per-file dashboard computation.
 */
export type FileDashboardStatus = 'OK' | 'NO_DATA' | 'ERROR';

// =============================================================================
// PER-FILE SUMMARY
// =============================================================================

/**
 * Summary of a single file's dashboard for project aggregation.
 */
export interface FileDashboardSummary {
  /**
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * Status of dashboard data for this file.
   */
  status: FileDashboardStatus;

  /**
   * CI verdict for this file (if data available).
   */
  verdict?: CiVerdict;

  /**
   * Stability score for this file (if data available).
   */
  stabilityScore?: number;

  /**
   * Number of runs considered (if data available).
   */
  runsConsidered?: number;

  /**
   * Severity counts (if data available).
   */
  severityCounts?: SeverityCounts;

  /**
   * Error message (if status is ERROR).
   */
  error?: string;
}

// =============================================================================
// PROJECT SIGNAL
// =============================================================================

/**
 * A drift signal with file context for project-level aggregation.
 */
export interface ProjectSignal extends DriftSignal {
  /**
   * Source file this signal came from.
   */
  sourceFile: string;
}

// =============================================================================
// PROJECT STABILITY SCORE
// =============================================================================

/**
 * Project-level stability score with per-file breakdown.
 */
export interface ProjectStabilityScore extends StabilityScore {
  /**
   * Number of files included in the average.
   */
  filesIncluded: number;

  /**
   * Number of files excluded (NO_DATA).
   */
  filesExcluded: number;
}

// =============================================================================
// PROJECT COUNTS
// =============================================================================

/**
 * Project-level counts summary.
 */
export interface ProjectCounts {
  /**
   * Total source files discovered.
   */
  totalFiles: number;

  /**
   * Files with dashboard data.
   */
  filesWithData: number;

  /**
   * Files without any data (NO_DATA).
   */
  filesNoData: number;

  /**
   * Files with errors.
   */
  filesWithErrors: number;

  /**
   * Files by verdict (only files with data).
   */
  byVerdict: {
    pass: number;
    warn: number;
    fail: number;
  };

  /**
   * Aggregated severity counts across all files.
   */
  bySeverity: SeverityCounts;
}

// =============================================================================
// PROJECT DASHBOARD ARTIFACT
// =============================================================================

/**
 * Project-level drift dashboard artifact.
 *
 * Pattern: design-materializations/<scanRoot>.figma-project-dashboard.json
 */
export interface ProjectDashboardArtifact {
  /**
   * Artifact format version.
   */
  version: 1;

  /**
   * ISO 8601 timestamp when this dashboard was generated.
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
   * Project-level counts.
   */
  counts: ProjectCounts;

  /**
   * Project-level stability score (average of files with data).
   */
  stabilityScore: ProjectStabilityScore;

  /**
   * Top drift signals across the project (sorted deterministically).
   */
  topSignals: ProjectSignal[];

  /**
   * Per-file dashboard summaries (sorted by sourceFile).
   */
  files: FileDashboardSummary[];

  /**
   * Project-level CI verdict.
   */
  projectVerdict: CiVerdict;

  /**
   * Exit code (0 or 1).
   */
  exitCode: 0 | 1;

  /**
   * Human-readable explanation of the verdict.
   */
  explanation: string;

  /**
   * Thresholds used for verdict determination (Phase 13E.1).
   * Optional for backward compatibility with existing consumers.
   */
  thresholds?: {
    failScore: number;
    warnScore: number;
    maxSignals: number;
  };
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Context for computing a project dashboard.
 */
export interface ProjectDashboardContext {
  /**
   * Scan root directory (can be absolute or repo-relative).
   */
  scanRoot: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Maximum runs to consider per file (passed to 13D).
   */
  limit: number;

  /**
   * Thresholds for CI verdict (passed to per-file dashboards).
   */
  thresholds: DashboardThresholds;

  /**
   * Whether CI strict mode is enabled.
   */
  strict: boolean;

  /**
   * Project-level thresholds for score-based verdict (Phase 13E.1).
   */
  projectThresholds: ProjectDashboardThresholds;
}

/**
 * CLI options for figma:project-dashboard command.
 */
export interface ProjectDashboardCliOptions {
  /**
   * Scan root directory (required positional arg).
   */
  scanRoot: string;

  /**
   * Optional explicit repository root.
   */
  repoRoot?: string;

  /**
   * Maximum runs to consider per file.
   */
  limit: number;

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

  // Phase 13E.1: Threshold configuration

  /**
   * Score below which verdict is FAIL (overrides env var).
   */
  failScore?: number;

  /**
   * Score at or above which verdict is PASS (overrides env var).
   */
  warnScore?: number;

  /**
   * Maximum number of signals to show (overrides env var).
   */
  maxSignals?: number;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of computing a project dashboard.
 */
export type ComputeProjectDashboardResult =
  | { ok: true; artifact: ProjectDashboardArtifact }
  | { ok: false; error: string };

/**
 * Result of loading/computing a single file's dashboard.
 */
export type LoadFileDashboardResult =
  | { ok: true; dashboard: DriftDashboardArtifact }
  | { ok: false; status: 'NO_DATA' | 'ERROR'; error?: string };
// =============================================================================
// PROJECT DASHBOARD THRESHOLDS (Phase 13E.1)
// =============================================================================

/**
 * Score-based thresholds for project dashboard verdict.
 *
 * Invariant: failScore < warnScore (enforced at resolution time).
 *
 * Verdict determination:
 * - score < failScore → FAIL
 * - failScore ≤ score < warnScore → WARN
 * - score ≥ warnScore → PASS
 */
export interface ProjectDashboardThresholds {
  /**
   * Score below which verdict is FAIL.
   * Default: 60
   */
  failScore: number;

  /**
   * Score at or above which verdict is PASS.
   * Score between failScore and warnScore is WARN.
   * Default: 80
   */
  warnScore: number;

  /**
   * Maximum number of signals to show in output.
   * Default: 10
   */
  maxSignals: number;
}

/**
 * Default project dashboard thresholds.
 */
export const DEFAULT_PROJECT_THRESHOLDS: ProjectDashboardThresholds = {
  failScore: 60,
  warnScore: 80,
  maxSignals: 10,
};

/**
 * Result of threshold resolution.
 */
export type ResolveThresholdsResult =
  | { ok: true; thresholds: ProjectDashboardThresholds }
  | { ok: false; error: string };

/**
 * CI messaging for each verdict.
 */
export interface VerdictMessage {
  verdict: CiVerdict;
  emoji: string;
  summary: string;
  action: string;
}

/**
 * Get CI messaging for a verdict.
 */
export function getVerdictMessage(verdict: CiVerdict): VerdictMessage {
  switch (verdict) {
    case 'PASS':
      return {
        verdict: 'PASS',
        emoji: '✓',
        summary: 'Project drift within acceptable thresholds',
        action: 'No action required',
      };
    case 'WARN':
      return {
        verdict: 'WARN',
        emoji: '⚠',
        summary: 'Project drift present but below failure threshold',
        action: 'Drift present; monitor',
      };
    case 'FAIL':
      return {
        verdict: 'FAIL',
        emoji: '✗',
        summary: 'Project drift exceeds acceptable threshold',
        action: 'Drift exceeds threshold; action required',
      };
  }
}