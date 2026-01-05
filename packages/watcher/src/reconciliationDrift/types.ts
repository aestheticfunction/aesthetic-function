/**
 * @aesthetic-function/watcher - reconciliationDrift/types.ts
 *
 * Phase 13C: Drift Diffs (Run-to-Run) Types.
 *
 * WHY: Defines types for the drift diff artifact that compares
 * two reconciliation runs and summarizes what changed between them.
 *
 * SCOPE:
 * - Read-only comparison only
 * - Uses Phase 13B ledger + Phase 13A run index metadata
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT re-run reconciliation; only compares already-derived fields
 */

// =============================================================================
// SEVERITY LEVELS
// =============================================================================

/**
 * Severity level for a drift change.
 *
 * - info: Neutral change (e.g., dryRun toggle)
 * - warn: Attention needed (e.g., increasing conflicts)
 * - fail: Regression (e.g., status worsening to VERIFY_FAILED)
 */
export type DriftSeverity = 'info' | 'warn' | 'fail';

// =============================================================================
// DRIFT CHANGE
// =============================================================================

/**
 * A single field change between two runs.
 */
export interface DriftChange {
  /**
   * Field name (e.g., "overallStatus", "verifyMismatch", "applyOpsTotal").
   */
  field: string;

  /**
   * Value in the "from" run.
   */
  from: string | number | boolean | null;

  /**
   * Value in the "to" run.
   */
  to: string | number | boolean | null;

  /**
   * Numeric delta (only for numeric fields where both values are numbers).
   */
  delta?: number;

  /**
   * Severity of this change.
   */
  severity: DriftSeverity;

  /**
   * Deterministic rule text explaining the severity.
   */
  reason: string;
}

// =============================================================================
// RUN METRICS
// =============================================================================

/**
 * Stable numeric counts extracted from run artifacts.
 *
 * Only includes metrics that are already computed and stored,
 * never re-derived or inferred.
 */
export interface RunMetrics {
  /**
   * Total apply operations from resolutionApply artifact.
   */
  applyOpsTotal?: number;

  /**
   * Whether apply was a dry-run.
   */
  applyDryRun?: boolean;

  /**
   * Total verified items from verification artifact.
   */
  verifyTotal?: number;

  /**
   * Mismatch count from verification artifact.
   */
  verifyMismatch?: number;

  /**
   * Missing count from verification artifact.
   */
  verifyMissing?: number;

  /**
   * Rollback actions count from rollbackPreview artifact.
   */
  rollbackActions?: number;

  /**
   * Total deltas from delta artifact.
   */
  deltasTotal?: number;

  /**
   * Total conflicts from conflicts artifact.
   */
  conflictsTotal?: number;

  /**
   * Total resolution decisions from resolutionPlan artifact.
   */
  resolutionDecisionsTotal?: number;

  /**
   * Total resolution apply ops from resolutionApply artifact.
   */
  resolutionApplyOpsTotal?: number;
}

// =============================================================================
// RUN SNAPSHOT
// =============================================================================

/**
 * Snapshot of a run's state for comparison.
 *
 * Extracts key metadata from run entry and its referenced artifacts.
 */
export interface RunSnapshot {
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
   * Overall status from status artifact (if exists).
   */
  overallStatus?: string;

  /**
   * CI verdict from status artifact (if exists).
   */
  ciVerdict?: string;

  /**
   * Exit code from status artifact (if exists).
   */
  exitCode?: number;

  /**
   * Extracted metrics from artifacts.
   */
  metrics: RunMetrics;

  /**
   * Paths to key artifacts referenced by this run.
   */
  artifactPaths: {
    apply?: string;
    verify?: string;
    rollbackPreview?: string;
    status?: string;
    runIndex?: string;
  };
}

// =============================================================================
// DRIFT DIFF SUMMARY
// =============================================================================

/**
 * Summary of the drift diff.
 */
export interface DriftDiffSummary {
  /**
   * Total number of changes detected.
   */
  totalChanges: number;

  /**
   * Count of info-level changes.
   */
  infoCount: number;

  /**
   * Count of warn-level changes.
   */
  warnCount: number;

  /**
   * Count of fail-level changes.
   */
  failCount: number;

  /**
   * Whether there was insufficient history to compute a diff.
   */
  insufficientHistory: boolean;

  /**
   * Human-readable summary message.
   */
  message: string;
}

// =============================================================================
// DRIFT DIFF ARTIFACT
// =============================================================================

/**
 * Drift diff artifact comparing two reconciliation runs.
 *
 * Pattern: design-materializations/<file>.figma-drift-diff.json
 */
export interface DriftDiffArtifact {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * Run ID of the "from" (older) run.
   */
  fromRunId: string;

  /**
   * Run ID of the "to" (newer) run.
   */
  toRunId: string;

  /**
   * ISO 8601 timestamp when this diff was generated.
   */
  generatedAt: string;

  /**
   * Summary of the diff.
   */
  summary: DriftDiffSummary;

  /**
   * List of field changes (deterministic order).
   */
  changes: DriftChange[];

  /**
   * Snapshot of the "from" run.
   */
  from: RunSnapshot;

  /**
   * Snapshot of the "to" run.
   */
  to: RunSnapshot;
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Context for computing a drift diff.
 */
export interface DriftDiffContext {
  /**
   * Canonical source file path.
   */
  sourceFile: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Optional "from" run ID (defaults to previous run).
   */
  fromRunId?: string;

  /**
   * Optional "to" run ID (defaults to latest run).
   */
  toRunId?: string;
}

/**
 * CLI options for figma:drift command.
 */
export interface DriftCliOptions {
  /**
   * Source file path (required positional arg).
   */
  sourceFile: string;

  /**
   * Optional explicit repository root.
   */
  repoRoot?: string;

  /**
   * Optional "from" run ID.
   */
  fromRunId?: string;

  /**
   * Optional "to" run ID.
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
   * Verbose output.
   */
  verbose?: boolean;

  /**
   * Explain run selection (why from/to were chosen).
   * Read-only, does not alter output or exit code.
   */
  explain?: boolean;

  /**
   * Strict mode: exit 1 if any drift item has severity 'fail'.
   * Only 'fail' severity triggers non-zero exit; 'warn'/'info' do not.
   */
  strict?: boolean;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of loading a run ledger.
 */
export type LoadLedgerResult =
  | { ok: true; ledger: import('../reconciliationTimeline/types.js').RunLedgerArtifact }
  | { ok: false; error: string };

/**
 * Result of selecting runs for comparison.
 */
export type SelectRunsResult =
  | { ok: true; fromEntry: import('../reconciliationTimeline/types.js').RunEntry; toEntry: import('../reconciliationTimeline/types.js').RunEntry; explanation: RunSelectionExplanation }
  | { ok: false; insufficientHistory: true; availableRuns: number }
  | { ok: false; insufficientHistory: false; error: string };

// =============================================================================
// RUN SELECTION EXPLANATION (Phase 13C.1)
// =============================================================================

/**
 * How a run was selected.
 */
export type RunSelectionMethod = 'explicit' | 'latest' | 'previous' | 'relative-to-explicit';

/**
 * Explanation of how runs were selected for comparison.
 */
export interface RunSelectionExplanation {
  /**
   * How the 'from' run was selected.
   */
  fromMethod: RunSelectionMethod;

  /**
   * Explanation text for 'from' selection.
   */
  fromReason: string;

  /**
   * How the 'to' run was selected.
   */
  toMethod: RunSelectionMethod;

  /**
   * Explanation text for 'to' selection.
   */
  toReason: string;

  /**
   * Whether explicit --from was provided.
   */
  explicitFrom: boolean;

  /**
   * Whether explicit --to was provided.
   */
  explicitTo: boolean;
}

// =============================================================================
// COMPARABLE SIGNALS (Phase 13C.3)
// =============================================================================

/**
 * Signal keys that can be compared between runs.
 *
 * These are the metrics/fields already used in drift output.
 * A comparison is valid if BOTH runs share at least one of these.
 */
export type ComparableSignalKey =
  | 'status'             // overallStatus from status artifact
  | 'conflictsTotal'     // from conflicts artifact
  | 'resolutionDecisionsTotal' // from resolutionPlan artifact
  | 'deltasTotal'        // from delta artifact
  | 'applyOpsTotal'      // from resolutionApply artifact
  | 'verifyTotal'        // from verification artifact
  | 'verifyMismatch'     // from verification artifact
  | 'rollbackActions';   // from rollbackPreview artifact

/**
 * Signals extracted from a run snapshot for comparability check.
 */
export interface ComparableSignals {
  /**
   * Signal keys that have defined values in this snapshot.
   */
  keys: Set<ComparableSignalKey>;

  /**
   * Whether the run has only status signal (minimal comparison).
   */
  statusOnly: boolean;
}

// =============================================================================
// CANDIDATE VALIDATION (Phase 13C.2 + 13C.3)
// =============================================================================

/**
 * Comparison class for drift analysis.
 *
 * - FULL: Both runs verified (highest confidence)
 * - PARTIAL: Runs are comparable but not FULL (medium confidence)
 * - WEAK: Runs are comparable but status-only (low confidence)
 * - INVALID: Runs are not comparable (no shared signals, or either is EMPTY)
 */
export type ComparisonClass = 'FULL' | 'PARTIAL' | 'WEAK' | 'INVALID';

/**
 * Run state classification for comparison purposes.
 *
 * - VERIFIED_OK: Run has verification artifact with no mismatches
 * - VERIFIED_MISMATCH: Run has verification artifact with mismatches
 * - APPLY_ONLY: Run has apply artifact but no verification
 * - INCOMPLETE: Run has artifacts but missing required ones
 * - EMPTY: Run has no reconciliation artifacts
 */
export type RunState = 'VERIFIED_OK' | 'VERIFIED_MISMATCH' | 'APPLY_ONLY' | 'INCOMPLETE' | 'EMPTY';

/**
 * Information about a run candidate for comparison.
 */
export interface RunCandidateInfo {
  /**
   * Run ID.
   */
  runId: string;

  /**
   * Timestamp.
   */
  timestamp: string;

  /**
   * Classified run state.
   */
  state: RunState;

  /**
   * Whether the run has a run index entry.
   */
  hasRunIndex: boolean;

  /**
   * Whether the run has at least one reconciliation artifact.
   */
  hasReconciliationArtifact: boolean;

  /**
   * List of available artifact types.
   */
  availableArtifacts: string[];

  /**
   * Comparable signals present in this run (Phase 13C.3).
   */
  comparableSignalKeys: ComparableSignalKey[];
}

/**
 * Result of candidate validation.
 */
export interface CandidateValidationResult {
  /**
   * Whether the comparison is valid.
   */
  valid: boolean;

  /**
   * Comparison class.
   */
  comparisonClass: ComparisonClass;

  /**
   * Candidate info for 'from' run.
   */
  fromCandidate: RunCandidateInfo;

  /**
   * Candidate info for 'to' run.
   */
  toCandidate: RunCandidateInfo;

  /**
   * Validation issues (if any).
   */
  issues: string[];

  /**
   * Warning messages explaining why comparison is not FULL (Phase 13C.3).
   */
  warnings: string[];

  /**
   * Signal keys shared between both runs (Phase 13C.3).
   */
  sharedSignals: ComparableSignalKey[];

  /**
   * Warning message (if comparison is not FULL).
   */
  warningMessage?: string;
}
