/**
 * @aesthetic-function/watcher - reconciliationTimeline/types.ts
 *
 * Phase 13B: Design Drift Timeline (Append-Only Run Ledger) Types.
 *
 * WHY: Defines types for the time-ordered, append-only run ledger
 * that records reconciliation runs over time for a source file.
 *
 * SCOPE:
 * - Record-keeping only (memory, not intelligence)
 * - Append-only (never rewrite or compact)
 * - Deterministic run ID generation
 *
 * CONSTRAINTS:
 * - Does NOT recompute or reinterpret artifacts
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Does NOT change reconciliation logic, exit codes, or status rules
 * - Does NOT introduce diffing or trend analysis (reserved for 13C)
 */

// =============================================================================
// RUN ID
// =============================================================================

/**
 * Unique, deterministic identifier for a reconciliation run.
 *
 * Generated from:
 * - canonical sourceFile
 * - timestamp
 * - command
 * - artifact paths (if available)
 */
export type RunId = string;

// =============================================================================
// ARTIFACT REFERENCES
// =============================================================================

/**
 * References to artifacts produced or found during a run.
 *
 * Values are relative paths from repo root.
 */
export interface RunArtifactRefs {
  delta?: string;
  suggestions?: string;
  conflicts?: string;
  resolutionPlan?: string;
  resolutionApply?: string;
  verification?: string;
  rollbackPreview?: string;
  status?: string;
  driftDiff?: string;
  driftDashboard?: string;
  runIndex?: string;
}

// =============================================================================
// RUN SUMMARY
// =============================================================================

/**
 * Summary counts extracted from artifacts during a run.
 */
export interface RunSummary {
  deltas?: number;
  suggestions?: number;
  conflicts?: number;
  decisions?: number;
  appliedOps?: number;
  verifyFailures?: number;
  rollbackActions?: number;
}

// =============================================================================
// RUN ENTRY
// =============================================================================

/**
 * A single immutable run entry in the timeline ledger.
 *
 * Points to artifacts produced or found during a reconciliation run.
 */
export interface RunEntry {
  /**
   * Unique, deterministic run identifier.
   */
  runId: RunId;

  /**
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * ISO 8601 timestamp when the run occurred.
   */
  timestamp: string;

  /**
   * Working directory when command was executed (informational).
   */
  cwd: string;

  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Command that triggered this run entry.
   * e.g. "figma:apply", "figma:status", "figma:index"
   */
  command: string;

  /**
   * Mode used, if applicable.
   * e.g. "apply", "artifact", "dry-run"
   */
  mode?: string;

  /**
   * References to artifacts produced or found.
   */
  artifacts: RunArtifactRefs;

  /**
   * Summary counts from artifacts.
   */
  summary: RunSummary;
}

// =============================================================================
// RUN LEDGER ARTIFACT
// =============================================================================

/**
 * Append-only JSON ledger of reconciliation runs.
 *
 * Pattern: design-materializations/<file>.figma-run-ledger.json
 */
export interface RunLedgerArtifact {
  /**
   * Ledger format version.
   */
  version: 1;

  /**
   * Canonical source file this ledger tracks.
   */
  sourceFile: string;

  /**
   * Ordered list of runs (oldest first).
   */
  runs: RunEntry[];
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Context for recording a timeline run entry.
 */
export interface TimelineRecordContext {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Source file path (may be relative or absolute).
   */
  sourceFile: string;

  /**
   * Command that triggered this run.
   */
  command: string;

  /**
   * Mode used, if applicable.
   */
  mode?: string;

  /**
   * Working directory (defaults to process.cwd()).
   */
  cwd?: string;
}

/**
 * Context for reading the timeline ledger.
 */
export interface TimelineReadContext {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Source file path (may be relative or absolute).
   */
  sourceFile: string;
}

// =============================================================================
// CLI OPTIONS
// =============================================================================

/**
 * Options for the timeline CLI command.
 */
export interface TimelineCliOptions {
  /**
   * Source file to show timeline for.
   */
  sourceFile: string;

  /**
   * Repository root (auto-detected if not provided).
   */
  repoRoot: string;

  /**
   * Output in JSON format.
   */
  json: boolean;

  /**
   * Maximum number of runs to show.
   */
  limit: number;

  /**
   * Force write ledger artifact even if empty.
   */
  write: boolean;

  /**
   * Explicitly record a new run to the ledger.
   * Requires RECONCILIATION_TIMELINE_ON=true.
   */
  record: boolean;

  /**
   * Show verbose output with discovery paths.
   */
  verbose: boolean;
}
