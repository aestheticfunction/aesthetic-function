/**
 * @aesthetic-function/watcher - reconciliationIndex/types.ts
 *
 * Phase 13A: Reconciliation Run Index Types.
 * Phase 13A.2: Extended to index Phase 13 artifacts (drift-diff, drift-dashboard).
 *
 * WHY: Defines types for the run index artifact that summarizes what
 * reconciliation artifacts exist for a given source file.
 *
 * SCOPE:
 * - Read-only indexing only
 * - One-shot current/latest artifacts (NOT a timeline)
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT generate new deltas, plans, or apply ops
 * - Does NOT mutate TSX, markers, overrides, or Figma
 * - Uses existing discovery utilities from Phase 12J.2
 */

// =============================================================================
// ARTIFACT TYPES TO INDEX
// =============================================================================

/**
 * Artifact types tracked by the run index.
 *
 * Maps to file suffixes:
 * - delta: *.figma-delta.json (12A)
 * - deltaSuggestions: *.figma-delta-suggestions.json (12B)
 * - conflicts: *.figma-conflicts.json (12D)
 * - resolutionPlan: *.figma-resolution-plan.json (12E)
 * - resolutionApply: *.figma-resolution-apply.json (12F)
 * - verification: *.figma-verification.json (12G)
 * - rollbackPreview: *.figma-rollback-preview.json (12I)
 * - status: *.figma-reconciliation-status.json (12J)
 * - driftDiff: *.figma-drift-diff.json (13C)
 * - driftDashboard: *.figma-drift-dashboard.json (13D)
 */
export type IndexedArtifactType =
  | 'delta'
  | 'deltaSuggestions'
  | 'conflicts'
  | 'resolutionPlan'
  | 'resolutionApply'
  | 'verification'
  | 'rollbackPreview'
  | 'status'
  | 'driftDiff'
  | 'driftDashboard';

// =============================================================================
// ARTIFACT SUMMARIES
// =============================================================================

/**
 * Summary for delta artifact (12A).
 */
export interface DeltaSummary {
  deltas: number;
}

/**
 * Summary for delta suggestions artifact (12B).
 */
export interface DeltaSuggestionsSummary {
  suggestions: number;
}

/**
 * Summary for conflicts artifact (12D).
 */
export interface ConflictsSummary {
  conflicts: number;
  blocked: number;
}

/**
 * Summary for resolution plan artifact (12E).
 */
export interface ResolutionPlanSummary {
  decisions: number;
}

/**
 * Summary for resolution apply artifact (12F).
 */
export interface ResolutionApplySummary {
  ops: number;
  dryRun: boolean;
  applied: number;
  skipped: number;
  failed: number;
}

/**
 * Summary for verification artifact (12G).
 */
export interface VerificationSummary {
  verified: number;
  mismatch: number;
  missing: number;
}

/**
 * Summary for rollback preview artifact (12I).
 */
export interface RollbackPreviewSummary {
  actions: number;
}

/**
 * Summary for status artifact (12J).
 */
export interface StatusSummary {
  overallStatus: string;
  ciVerdict: string;
}

/**
 * Summary for drift diff artifact (13C).
 */
export interface DriftDiffSummary {
  /** Number of changes detected between runs */
  totalChanges: number;
  /** Number of fail-level changes */
  failCount: number;
  /** Number of warn-level changes */
  warnCount: number;
}

/**
 * Summary for drift dashboard artifact (13D).
 */
export interface DriftDashboardSummary {
  /** Stability score (0-100) */
  stabilityScore: number;
  /** CI verdict (PASS, WARN, FAIL) */
  ciVerdict: string;
  /** Number of runs considered */
  runsConsidered: number;
}

/**
 * Union of all artifact summaries.
 */
export type ArtifactSummary =
  | DeltaSummary
  | DeltaSuggestionsSummary
  | ConflictsSummary
  | ResolutionPlanSummary
  | ResolutionApplySummary
  | VerificationSummary
  | RollbackPreviewSummary
  | StatusSummary
  | DriftDiffSummary
  | DriftDashboardSummary;

// =============================================================================
// ARTIFACT ENTRY
// =============================================================================

/**
 * Entry for a found artifact in the index.
 */
export interface ArtifactEntryFound {
  found: true;
  path: string;
  timestamp: string;
  summary: ArtifactSummary;
}

/**
 * Entry for a missing artifact in the index.
 */
export interface ArtifactEntryNotFound {
  found: false;
}

/**
 * Artifact entry (either found or not found).
 */
export type ArtifactEntry = ArtifactEntryFound | ArtifactEntryNotFound;

// =============================================================================
// ARTIFACT MAP
// =============================================================================

/**
 * Map of all indexed artifacts.
 */
export interface IndexedArtifacts {
  delta: ArtifactEntry;
  deltaSuggestions: ArtifactEntry;
  conflicts: ArtifactEntry;
  resolutionPlan: ArtifactEntry;
  resolutionApply: ArtifactEntry;
  verification: ArtifactEntry;
  rollbackPreview: ArtifactEntry;
  status: ArtifactEntry;
  driftDiff: ArtifactEntry;
  driftDashboard: ArtifactEntry;
}

// =============================================================================
// INDEX NOTES
// =============================================================================

/**
 * Note level for index messages.
 */
export type NoteLevel = 'info' | 'warn' | 'error';

/**
 * A note in the run index (e.g., warnings about duplicate artifacts).
 */
export interface IndexNote {
  level: NoteLevel;
  message: string;
}

// =============================================================================
// RUN INDEX ARTIFACT
// =============================================================================

/**
 * Complete run index artifact.
 *
 * Summarizes what reconciliation artifacts exist for a source file.
 * This is a one-shot snapshot, NOT a timeline/history.
 */
export interface RunIndexArtifact {
  /**
   * Artifact format version.
   */
  version: '1.0';

  /**
   * Absolute path to the repository root.
   */
  repoRoot: string;

  /**
   * Canonical source file path (repo-relative).
   */
  sourceFile: string;

  /**
   * ISO timestamp when index was generated.
   */
  generatedAt: string;

  /**
   * Map of indexed artifacts.
   */
  artifacts: IndexedArtifacts;

  /**
   * Notes about the indexing process.
   */
  notes: IndexNote[];
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Context for computing the run index.
 */
export interface RunIndexContext {
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
// DISCOVERY RESULT
// =============================================================================

/**
 * Discovery result with checked paths for verbose output.
 */
export interface RunIndexDiscoveryResult {
  /**
   * The computed run index artifact.
   */
  index: RunIndexArtifact;

  /**
   * Discovery information for verbose output.
   */
  discovery: {
    repoRoot: string;
    normalizedSourceFile: string;
    checkedPaths: Record<IndexedArtifactType, string[]>;
  };
}
