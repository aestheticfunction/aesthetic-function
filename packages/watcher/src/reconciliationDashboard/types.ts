/**
 * @aesthetic-function/watcher - reconciliationDashboard/types.ts
 *
 * Phase 13D: Drift Summary Dashboard Types.
 *
 * WHY: Defines types for the dashboard artifact that aggregates drift
 * data across multiple reconciliation runs for a source file.
 *
 * SCOPE:
 * - Read-only aggregation only
 * - Uses Phase 13A/13B/13C artifacts
 * - Deterministic output
 * - CI-friendly verdict
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

// =============================================================================
// SEVERITY AND VERDICT
// =============================================================================

/**
 * Severity level for dashboard signals.
 */
export type DashboardSeverity = 'info' | 'warn' | 'fail';

/**
 * CI verdict for build gates.
 */
export type CiVerdict = 'PASS' | 'WARN' | 'FAIL';

// =============================================================================
// DRIFT SIGNAL
// =============================================================================

/**
 * Keys for drift signals (explicit string union).
 */
export type DriftSignalKey =
  | 'status.transition'
  | 'conflicts.total'
  | 'verify.mismatches'
  | 'verify.missing'
  | 'deltas.total'
  | 'apply.ops'
  | 'suggestions.total'
  | 'rollback.actions';

/**
 * A single drift signal aggregated from run comparisons.
 */
export interface DriftSignal {
  /**
   * Signal key (deterministic identifier).
   */
  key: DriftSignalKey;

  /**
   * Human-readable label.
   */
  label: string;

  /**
   * Numeric delta (can be negative for improvements).
   */
  delta: number;

  /**
   * Value in the earlier run (optional).
   */
  from?: number;

  /**
   * Value in the later run (optional).
   */
  to?: number;

  /**
   * Severity of this signal.
   */
  severity: DashboardSeverity;
}

// =============================================================================
// RUN SUMMARY
// =============================================================================

/**
 * Summary of a single run for dashboard display.
 */
export interface RunSummary {
  /**
   * Unique run identifier.
   */
  runId: string;

  /**
   * ISO 8601 timestamp of the run.
   */
  timestamp: string;

  /**
   * Command that triggered this run.
   */
  command: string;

  /**
   * Overall status from 12J status artifact (if available).
   */
  overallStatus?: string;

  /**
   * Drift severity from 13C diff (if available).
   */
  driftSeverity?: DashboardSeverity;

  /**
   * Short deterministic phrases describing key aspects.
   */
  highlights: string[];
}

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * Configurable thresholds for CI verdict.
 */
export interface DashboardThresholds {
  /**
   * Whether to fail on any fail-severity drift (default: true).
   */
  failOnFailSeverity: boolean;

  /**
   * Maximum allowed fail-severity count before CI fails.
   */
  maxFailCount?: number;

  /**
   * Maximum allowed warn-severity count before CI fails (only in strict mode).
   */
  maxWarnCount?: number;

  /**
   * Maximum allowed verify mismatch increase before CI fails.
   */
  maxVerifyMismatchIncrease?: number;

  /**
   * Maximum allowed conflict increase before CI fails.
   */
  maxConflictIncrease?: number;

  /**
   * Maximum allowed delta increase before CI fails.
   */
  maxDeltaIncrease?: number;
}

// =============================================================================
// STABILITY SCORE
// =============================================================================

/**
 * Stability score with rationale.
 */
export interface StabilityScore {
  /**
   * Score value (0-100, 100 = most stable).
   */
  value: number;

  /**
   * Deterministic bullet list explaining deductions.
   */
  rationale: string[];
}

// =============================================================================
// RUN WINDOW
// =============================================================================

/**
 * Window of runs considered for the dashboard.
 */
export interface RunWindow {
  /**
   * Maximum number of runs to consider.
   */
  limit: number;

  /**
   * Starting run ID (inclusive).
   */
  fromRunId?: string;

  /**
   * Ending run ID (inclusive).
   */
  toRunId?: string;
}

// =============================================================================
// SEVERITY COUNTS
// =============================================================================

/**
 * Counts of drift events by severity.
 */
export interface SeverityCounts {
  info: number;
  warn: number;
  fail: number;
}

// =============================================================================
// DASHBOARD ARTIFACT
// =============================================================================

/**
 * Drift summary dashboard artifact.
 *
 * Pattern: design-materializations/<file>.figma-drift-dashboard.json
 */
export interface DriftDashboardArtifact {
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
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * Window of runs considered.
   */
  runWindow: RunWindow;

  /**
   * Counts summary.
   */
  counts: {
    /**
     * Number of runs considered.
     */
    runsConsidered: number;

    /**
     * Drift events by severity.
     */
    bySeverity: SeverityCounts;
  };

  /**
   * Stability score with rationale.
   */
  stabilityScore: StabilityScore;

  /**
   * Top drift signals (sorted deterministically).
   */
  topSignals: DriftSignal[];

  /**
   * Recent runs (sorted newest→oldest).
   */
  recentRuns: RunSummary[];

  /**
   * CI verdict.
   */
  ciVerdict: CiVerdict;

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
 * Context for computing a dashboard.
 */
export interface DashboardContext {
  /**
   * Canonical source file path.
   */
  sourceFile: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Maximum number of runs to consider.
   */
  limit: number;

  /**
   * Optional starting run ID.
   */
  fromRunId?: string;

  /**
   * Optional ending run ID.
   */
  toRunId?: string;

  /**
   * Thresholds for CI verdict.
   */
  thresholds: DashboardThresholds;

  /**
   * Whether CI strict mode is enabled.
   */
  strict: boolean;
}

/**
 * CLI options for figma:dashboard command.
 */
export interface DashboardCliOptions {
  /**
   * Source file path (required positional arg).
   */
  sourceFile: string;

  /**
   * Optional explicit repository root.
   */
  repoRoot?: string;

  /**
   * Maximum number of runs to consider.
   */
  limit: number;

  /**
   * Optional starting run ID.
   */
  fromRunId?: string;

  /**
   * Optional ending run ID.
   */
  toRunId?: string;

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
 * Result of computing a dashboard.
 */
export type ComputeDashboardResult =
  | { ok: true; artifact: DriftDashboardArtifact }
  | { ok: false; error: string };
