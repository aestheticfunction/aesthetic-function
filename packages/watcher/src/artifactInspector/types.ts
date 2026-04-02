/**
 * @aesthetic-function/watcher - artifactInspector/types.ts
 *
 * Phase 15D: Artifact Inspector Types.
 *
 * WHY: Makes the full artifact trail inspectable and machine-readable.
 * Auditability is a core product and patent value.
 *
 * SCOPE:
 * - Read-only types for list, inspect, and trace views
 * - No mutations, no new artifacts, no reconciliation logic
 *
 * CONSTRAINTS:
 * - Pure views over existing artifacts from Phases 12A–14C
 * - Does NOT generate new deltas, plans, or apply ops
 * - Does NOT mutate TSX, markers, overrides, or Figma
 */

import type {
  IndexedArtifactType,
} from '../reconciliationIndex/types.js';

// =============================================================================
// ARTIFACT SUFFIX CATALOG
// =============================================================================

/**
 * Extended artifact types that include Phase 14 artifacts not in the run index.
 */
export type ExtendedArtifactType = IndexedArtifactType | 'runLedger' | 'reconcileBundle';

/**
 * Map from extended artifact type to file suffix.
 */
export const ARTIFACT_SUFFIX_MAP: Record<ExtendedArtifactType, string> = {
  delta: '.figma-delta.json',
  deltaSuggestions: '.figma-delta-suggestions.json',
  conflicts: '.figma-conflicts.json',
  resolutionPlan: '.figma-resolution-plan.json',
  resolutionApply: '.figma-resolution-apply.json',
  verification: '.figma-verification.json',
  rollbackPreview: '.figma-rollback-preview.json',
  status: '.figma-reconciliation-status.json',
  driftDiff: '.figma-drift-diff.json',
  driftDashboard: '.figma-drift-dashboard.json',
  runLedger: '.figma-run-ledger.json',
  reconcileBundle: '.figma-reconcile.json',
};

/**
 * Phase label for each artifact type.
 */
export const ARTIFACT_PHASE_MAP: Record<ExtendedArtifactType, string> = {
  delta: '12A',
  deltaSuggestions: '12B',
  conflicts: '12D',
  resolutionPlan: '12E',
  resolutionApply: '12F',
  verification: '12G',
  rollbackPreview: '12I',
  status: '12J',
  driftDiff: '13C',
  driftDashboard: '13D',
  runLedger: '13B',
  reconcileBundle: '14C',
};

/**
 * Human-readable display name for each artifact type.
 */
export const ARTIFACT_DISPLAY_NAMES: Record<ExtendedArtifactType, string> = {
  delta: 'Delta Detection',
  deltaSuggestions: 'Delta Suggestions',
  conflicts: 'Conflict Surfacing',
  resolutionPlan: 'Resolution Plan',
  resolutionApply: 'Resolution Apply',
  verification: 'Post-Apply Verification',
  rollbackPreview: 'Rollback Preview',
  status: 'Reconciliation Status',
  driftDiff: 'Drift Diff',
  driftDashboard: 'Drift Dashboard',
  runLedger: 'Run Ledger',
  reconcileBundle: 'Reconcile Bundle',
};

// =============================================================================
// ARTIFACT LIST
// =============================================================================

/**
 * Entry in the artifact list view.
 */
export interface ArtifactListEntry {
  /** Artifact type */
  type: ExtendedArtifactType;
  /** Phase label (e.g., "12A") */
  phase: string;
  /** Human-readable name */
  displayName: string;
  /** Whether the artifact was found */
  found: boolean;
  /** Relative path (from repo root) if found */
  path?: string;
  /** ISO timestamp if found */
  timestamp?: string;
  /** Human-readable summary if found */
  summary?: string;
}

/**
 * Full artifact list for a source file.
 */
export interface ArtifactListResult {
  /** Canonical source file path */
  sourceFile: string;
  /** Repo root */
  repoRoot: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Artifact entries */
  artifacts: ArtifactListEntry[];
  /** Count of found artifacts */
  foundCount: number;
  /** Total artifact types checked */
  totalCount: number;
}

// =============================================================================
// ARTIFACT INSPECT
// =============================================================================

/**
 * Recognized artifact type from filename inspection.
 */
export interface RecognizedArtifact {
  /** Detected artifact type */
  type: ExtendedArtifactType;
  /** Phase label */
  phase: string;
  /** Display name */
  displayName: string;
}

/**
 * Highlight categories for artifact inspection.
 */
export type HighlightLevel = 'ok' | 'warn' | 'fail' | 'info';

/**
 * A single highlight extracted from an artifact.
 */
export interface InspectHighlight {
  level: HighlightLevel;
  label: string;
  detail?: string;
}

/**
 * Result of inspecting a single artifact.
 */
export interface InspectResult {
  /** File path inspected */
  path: string;
  /** Recognized artifact info (null if unrecognized) */
  artifact: RecognizedArtifact | null;
  /** Parsed JSON content */
  content: Record<string, unknown>;
  /** Key highlights extracted from the artifact */
  highlights: InspectHighlight[];
  /** Human-readable formatted output */
  formatted: string;
}

// =============================================================================
// ARTIFACT TRACE
// =============================================================================

/**
 * A step in the reconciliation lifecycle trace.
 */
export interface TraceStep {
  /** Step ordinal (1-based) */
  order: number;
  /** Phase label */
  phase: string;
  /** Step name */
  name: string;
  /** Whether this step has an artifact */
  found: boolean;
  /** Artifact path if found */
  path?: string;
  /** ISO timestamp if found */
  timestamp?: string;
  /** Outcome summary */
  outcome?: string;
  /** Key findings */
  highlights: InspectHighlight[];
}

/**
 * Full lifecycle trace for a source file.
 */
export interface TraceResult {
  /** Canonical source file path */
  sourceFile: string;
  /** Repo root */
  repoRoot: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Lifecycle steps in order */
  steps: TraceStep[];
  /** Overall lifecycle verdict */
  verdict?: string;
  /** Active profile name (if detected from bundle) */
  profile?: string;
  /** Summary counts */
  summary: {
    total: number;
    found: number;
    missing: number;
    highlights: {
      ok: number;
      warn: number;
      fail: number;
      info: number;
    };
  };
}

// =============================================================================
// CLI OPTIONS
// =============================================================================

/**
 * CLI options for artifact list.
 */
export interface ArtifactListCliOptions {
  sourceFile: string;
  repoRoot?: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * CLI options for artifact inspect.
 */
export interface ArtifactInspectCliOptions {
  artifactPath: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * CLI options for artifact trace.
 */
export interface ArtifactTraceCliOptions {
  sourceFile: string;
  repoRoot?: string;
  json?: boolean;
  verbose?: boolean;
}
