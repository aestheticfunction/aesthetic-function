/**
 * @aesthetic-function/watcher - reconciliationReconcile/types.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI Types.
 * Phase 14B: Reconcile Profiles (Deterministic Flag Presets).
 * Phase 14C: CI Wiring (Deterministic Gate + Run Capture).
 *
 * WHY: Defines types for the orchestration inputs/outputs and bundle artifact
 * format that aggregates all Phase 12-13 read-only analysis for a single source file.
 *
 * SCOPE:
 * - Orchestration only (no new inference, no new semantics)
 * - Links to existing phase artifacts
 * - Deterministic step ordering
 * - Profile-based flag presets (Phase 14B)
 * - CI-specific capture and verdict semantics (Phase 14C)
 *
 * CONSTRAINTS:
 * - Read-only by default (no AST/markers/overrides/Figma mutations)
 * - Repo-root invariant
 * - Deterministic output
 */

// Import comparison types from drift
import type { ComparisonClass } from '../reconciliationDrift/types.js';

// =============================================================================
// CI WRITE POLICY (Phase 14C)
// =============================================================================

/**
 * CI write policy for controlling what artifacts are written.
 *
 * - bundle: Only write the bundle artifact (minimal, always attributable)
 * - bundle+status+index: Write bundle + status + index (for traceability)
 * - bundle+all: Write bundle + all step artifacts (richest CI output)
 */
export type CiWritePolicy = 'bundle' | 'bundle+status+index' | 'bundle+all';

/**
 * Default CI write policy.
 */
export const DEFAULT_CI_WRITE_POLICY: CiWritePolicy = 'bundle';

// =============================================================================
// OUTPUT FORMAT (Phase 14C)
// =============================================================================

/**
 * Output format for the reconcile command.
 *
 * - human: Human-readable formatted output (default)
 * - json: JSON output (existing --json flag)
 * - ci: CI-friendly one-line verdict + key/value pairs
 */
export type OutputFormat = 'human' | 'json' | 'ci';

// =============================================================================
// PROFILES (Phase 14B)
// =============================================================================

/**
 * Named reconcile profiles for deterministic flag presets.
 *
 * - local: Default human inspection (read-only, no recording, no strict)
 * - record: Intentional run capture (requires RECONCILIATION_TIMELINE_ON=true)
 * - ci: CI gate (strict mode, read-only)
 */
export type ReconcileProfile = 'local' | 'record' | 'ci';

/**
 * Valid profile names for validation.
 */
export const VALID_PROFILES: readonly ReconcileProfile[] = ['local', 'record', 'ci'] as const;

/**
 * Configuration derived from a profile.
 *
 * These are the flags that a profile expands into.
 */
export interface ReconcileProfileConfig {
  /**
   * Whether to use strict mode.
   */
  strict: boolean;

  /**
   * Whether to record timeline.
   */
  record: boolean;

  /**
   * Whether to write bundle artifact.
   */
  write: boolean;

  /**
   * CI write policy for controlling artifact writes (Phase 14C).
   * Only used when write=true.
   * @default 'bundle+all'
   */
  ciWritePolicy?: CiWritePolicy;

  /**
   * Whether bundle should always be written, even if write=false.
   * CI profile sets this to true for attributable runs.
   * @default false
   */
  alwaysWriteBundle?: boolean;
}

// =============================================================================
// STEP IDENTIFIERS
// =============================================================================

/**
 * Identifiers for each reconcile step.
 *
 * Order is significant and locked for deterministic output.
 */
export type ReconcileStepId =
  | 'status'
  | 'index'
  | 'timeline'
  | 'drift'
  | 'dashboard';

/**
 * Locked step order for deterministic execution.
 */
export const RECONCILE_STEP_ORDER: readonly ReconcileStepId[] = [
  'status',
  'index',
  'timeline',
  'drift',
  'dashboard',
] as const;

// =============================================================================
// MODES
// =============================================================================

/**
 * Reconcile execution mode.
 *
 * - read-only: No timeline recording (default)
 * - record: Timeline recording enabled (requires env + flag)
 */
export type ReconcileMode = 'read-only' | 'record';

// =============================================================================
// CLI OPTIONS
// =============================================================================

/**
 * CLI options for the reconcile command.
 */
export interface ReconcileCliOptions {
  /**
   * Source file to reconcile (e.g., demo-app/src/App.tsx).
   */
  sourceFile: string;

  /**
   * Named profile to use for flag presets.
   * Profiles expand to {strict, record, write} combinations.
   * CLI flags override profile defaults.
   *
   * - local: Human inspection (default)
   * - record: Intentional run capture (requires env)
   * - ci: CI gate (strict mode)
   *
   * @default 'local'
   */
  profile?: ReconcileProfile;

  /**
   * Explicit repository root path.
   * If not provided, auto-detected.
   */
  repoRoot?: string;

  /**
   * Write bundle artifact.
   * @default true
   */
  write?: boolean;

  /**
   * Use strict mode for steps that support it (drift, dashboard).
   * If true, fail overall when strict-enabled steps fail.
   * @default false
   */
  strict?: boolean;

  /**
   * Enable verbose output showing step invocations and discovery.
   * @default false
   */
  verbose?: boolean;

  /**
   * Record timeline run (dual-gated: requires RECONCILIATION_TIMELINE_ON=true AND this flag).
   * @default false
   */
  record?: boolean;

  /**
   * Limit for dashboard/drift runs to consider.
   * @default 10
   */
  limit?: number;

  /**
   * Output JSON instead of formatted text.
   * @default false
   */
  json?: boolean;

  /**
   * Output format for CI-friendly output (Phase 14C).
   * - human: Default human-readable
   * - json: JSON output (same as --json)
   * - ci: CI-friendly one-line verdict + key/value pairs
   * @default 'human'
   */
  format?: OutputFormat;

  /**
   * CI write policy (Phase 14C).
   * Controls which artifacts are written in CI mode.
   * @default 'bundle'
   */
  ciWritePolicy?: CiWritePolicy;

  /**
   * Whether bundle should always be written (Phase 14C).
   * CI profile sets this to true.
   * @default false
   */
  alwaysWriteBundle?: boolean;
}

// =============================================================================
// STEP RESULT
// =============================================================================

/**
 * Result from executing a single reconcile step.
 */
export interface ReconcileStepResult {
  /**
   * Which step this result is for.
   */
  step: ReconcileStepId;

  /**
   * Whether the step completed successfully.
   */
  ok: boolean;

  /**
   * Exit code from the step.
   * 0 = success, 1 = failure, 2 = usage/config error
   */
  exitCode: 0 | 1 | 2;

  /**
   * Whether the step was skipped (e.g., due to cold-start conditions).
   * Skipped steps are not failures - they indicate missing prerequisites.
   *
   * @default false
   */
  skipped?: boolean;

  /**
   * Path to artifact written by this step (if any).
   */
  artifactPath?: string;

  /**
   * Human-readable summary of the step result.
   */
  summary?: string;

  /**
   * Warnings generated during step execution.
   */
  warnings?: string[];
}

// =============================================================================
// COLD-START WARNINGS (Phase 14D.1)
// =============================================================================

/**
 * Standard warning codes for cold-start conditions.
 */
export const COLD_START_WARNINGS = {
  NO_LEDGER: 'NO_LEDGER: Run ledger does not exist (first run)',
  NO_RUNS: 'NO_RUNS: Insufficient runs in ledger for comparison',
  NO_MATERIALIZATIONS: 'NO_MATERIALIZATIONS: design-materializations directory does not exist',
} as const;

/**
 * Type for cold-start warning keys.
 */
export type ColdStartWarningKey = keyof typeof COLD_START_WARNINGS;

/**
 * Cold-start detection result.
 * Determines whether drift/dashboard steps should be skipped.
 */
export interface ColdStartInfo {
  /** Whether the ledger exists */
  ledgerExists: boolean;
  /** Number of runs in the ledger (0 if ledger doesn't exist) */
  runCount: number;
  /** Whether we have enough runs for comparison (need at least 2) */
  hasEnoughRuns: boolean;
  /** Warnings to include in step results */
  warnings: string[];
}

// =============================================================================
// BUNDLE ARTIFACT
// =============================================================================

/**
 * CI verdict for the overall reconcile run.
 */
export type ReconcileCiVerdict = 'PASS' | 'WARN' | 'FAIL';

/**
 * Overall result of the reconcile run.
 */
export interface ReconcileOverall {
  /**
   * Whether all steps completed without failure.
   */
  ok: boolean;

  /**
   * CI verdict (simple mapping from ok status).
   */
  ciVerdict?: ReconcileCiVerdict;

  /**
   * Human-readable explanation of the overall result.
   */
  explanation: string;
}

/**
 * Bundle artifact that aggregates all step results.
 *
 * This is the main output of the reconcile command.
 */
export interface ReconcileBundleArtifact {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * ISO timestamp when bundle was created.
   */
  timestamp: string;

  /**
   * Repository root path used.
   */
  repoRoot: string;

  /**
   * Original source file input (as provided by user).
   */
  sourceFileInput: string;

  /**
   * Canonical source file path (normalized, repo-relative).
   */
  sourceFileCanonical: string;

  /**
   * Execution mode.
   */
  mode: ReconcileMode;

  /**
   * Profile used for this run.
   * @default 'local'
   */
  profile: ReconcileProfile;

  /**
   * Results from each step in locked order.
   */
  steps: ReconcileStepResult[];

  /**
   * Map of step ID to artifact path (if written).
   */
  artifacts: Partial<Record<ReconcileStepId, string>>;

  /**
   * Overall result.
   */
  overall: ReconcileOverall;

  // ==========================================================================
  // CI-SPECIFIC FIELDS (Phase 14C)
  // ==========================================================================

  /**
   * Git SHA of the current commit (if available).
   * Provides traceability for CI runs.
   */
  gitSha?: string;

  /**
   * Drift comparison classification from Phase 13C.
   * FULL, PARTIAL, WEAK, or INVALID.
   */
  comparisonClass?: ComparisonClass;

  /**
   * Warnings from drift comparison (if any).
   */
  comparisonWarnings?: string[];

  /**
   * Dashboard severity counts.
   * Extracted from drift dashboard (Phase 13D).
   */
  dashboardCounts?: {
    info: number;
    warn: number;
    fail: number;
  };

  /**
   * Dashboard stability score (0-100).
   */
  stabilityScore?: number;

  /**
   * Key signals for CI summary output.
   * Deterministic list of the most important signals.
   */
  signals?: string[];
}

// =============================================================================
// COMPUTE RESULT
// =============================================================================

/**
 * Result from runReconcile function.
 */
export interface ReconcileResult {
  /**
   * The bundle artifact.
   */
  bundle: ReconcileBundleArtifact;

  /**
   * Exit code to use (0, 1, or 2).
   */
  exitCode: 0 | 1 | 2;
}
