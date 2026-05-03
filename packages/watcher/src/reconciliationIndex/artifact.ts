/**
 * @aesthetic-function/watcher - reconciliationIndex/artifact.ts
 *
 * Phase 13A: Reconciliation Run Index Artifact Writing & Formatting.
 *
 * WHY: Writes index artifact to design-materializations/ and formats
 * output for human-readable CLI consumption.
 *
 * SCOPE:
 * - Write index artifacts
 * - Format index for human readability
 *
 * CONSTRAINTS:
 * - Deterministic output format
 * - Sorted, stable JSON output
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  RunIndexArtifact,
  RunIndexContext,
  IndexedArtifactType,
  ArtifactEntry,
  ArtifactEntryFound,
  DeltaSummary,
  DeltaSuggestionsSummary,
  ConflictsSummary,
  ResolutionPlanSummary,
  ResolutionApplySummary,
  VerificationSummary,
  RollbackPreviewSummary,
  StatusSummary,
  DriftDiffSummary,
  DriftDashboardSummary,
} from './types.js';

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Normalize source file path for artifact naming.
 * Converts: demos/react-demo-app/src/App.tsx → demos__react-demo-app__src__App
 */
function normalizeSourceFileForArtifact(sourceFile: string): string {
  return sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Get the run index artifact path for a source file.
 */
export function getRunIndexArtifactPath(sourceFile: string): string {
  const normalized = normalizeSourceFileForArtifact(sourceFile);
  return `design-materializations/${normalized}.figma-run-index.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write run index artifact to disk.
 */
export async function writeRunIndexArtifact(
  index: RunIndexArtifact,
  context: RunIndexContext
): Promise<{ written: boolean; path: string }> {
  const artifactPath = getRunIndexArtifactPath(index.sourceFile);
  const fullPath = join(context.repoRoot, artifactPath);

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write artifact with pretty formatting
  await writeFile(fullPath, JSON.stringify(index, null, 2), 'utf-8');

  return { written: true, path: artifactPath };
}

// =============================================================================
// SUMMARY FORMATTING
// =============================================================================

/**
 * Format artifact type display name.
 */
const ARTIFACT_DISPLAY_NAMES: Record<IndexedArtifactType, string> = {
  delta: 'delta',
  deltaSuggestions: 'delta-suggestions',
  conflicts: 'conflicts',
  resolutionPlan: 'resolution-plan',
  resolutionApply: 'resolution-apply',
  verification: 'verification',
  rollbackPreview: 'rollback-preview',
  status: 'status',
  driftDiff: 'drift-diff',
  driftDashboard: 'drift-dashboard',
};

/**
 * Type guard for found artifacts.
 */
function isFound(entry: ArtifactEntry): entry is ArtifactEntryFound {
  return entry.found;
}

/**
 * Format summary for a delta artifact.
 */
function formatDeltaSummary(summary: DeltaSummary): string {
  return `${summary.deltas} delta${summary.deltas !== 1 ? 's' : ''}`;
}

/**
 * Format summary for a delta suggestions artifact.
 */
function formatDeltaSuggestionsSummary(summary: DeltaSuggestionsSummary): string {
  return `${summary.suggestions} suggestion${summary.suggestions !== 1 ? 's' : ''}`;
}

/**
 * Format summary for a conflicts artifact.
 */
function formatConflictsSummary(summary: ConflictsSummary): string {
  const parts = [`${summary.conflicts} conflict${summary.conflicts !== 1 ? 's' : ''}`];
  if (summary.blocked > 0) {
    parts.push(`${summary.blocked} blocked`);
  }
  return parts.join(', ');
}

/**
 * Format summary for a resolution plan artifact.
 */
function formatResolutionPlanSummary(summary: ResolutionPlanSummary): string {
  return `${summary.decisions} decision${summary.decisions !== 1 ? 's' : ''}`;
}

/**
 * Format summary for a resolution apply artifact.
 */
function formatResolutionApplySummary(summary: ResolutionApplySummary): string {
  const parts = [`${summary.ops} op${summary.ops !== 1 ? 's' : ''}`];
  if (summary.dryRun) {
    parts.push('dry-run');
  }
  return parts.join(', ');
}

/**
 * Format summary for a verification artifact.
 */
function formatVerificationSummary(summary: VerificationSummary): string {
  if (summary.mismatch === 0 && summary.missing === 0) {
    return `${summary.verified} verified, OK`;
  }
  return `${summary.mismatch} mismatch, ${summary.missing} missing`;
}

/**
 * Format summary for a rollback preview artifact.
 */
function formatRollbackPreviewSummary(summary: RollbackPreviewSummary): string {
  return `${summary.actions} action${summary.actions !== 1 ? 's' : ''}`;
}

/**
 * Format summary for a status artifact.
 */
function formatStatusSummary(summary: StatusSummary): string {
  return summary.overallStatus;
}

/**
 * Format summary for a drift diff artifact.
 */
function formatDriftDiffSummary(summary: DriftDiffSummary): string {
  const parts: string[] = [];
  parts.push(`${summary.totalChanges} change${summary.totalChanges !== 1 ? 's' : ''}`);
  if (summary.failCount > 0) {
    parts.push(`${summary.failCount} fail`);
  }
  if (summary.warnCount > 0) {
    parts.push(`${summary.warnCount} warn`);
  }
  return parts.join(', ');
}

/**
 * Format summary for a drift dashboard artifact.
 */
function formatDriftDashboardSummary(summary: DriftDashboardSummary): string {
  return `score=${summary.stabilityScore}, ${summary.ciVerdict}, ${summary.runsConsidered} runs`;
}

/**
 * Format artifact summary based on type.
 */
function formatSummary(
  artifactType: IndexedArtifactType,
  entry: ArtifactEntryFound
): string {
  const summary = entry.summary;

  switch (artifactType) {
    case 'delta':
      return formatDeltaSummary(summary as DeltaSummary);
    case 'deltaSuggestions':
      return formatDeltaSuggestionsSummary(summary as DeltaSuggestionsSummary);
    case 'conflicts':
      return formatConflictsSummary(summary as ConflictsSummary);
    case 'resolutionPlan':
      return formatResolutionPlanSummary(summary as ResolutionPlanSummary);
    case 'resolutionApply':
      return formatResolutionApplySummary(summary as ResolutionApplySummary);
    case 'verification':
      return formatVerificationSummary(summary as VerificationSummary);
    case 'rollbackPreview':
      return formatRollbackPreviewSummary(summary as RollbackPreviewSummary);
    case 'status':
      return formatStatusSummary(summary as StatusSummary);
    case 'driftDiff':
      return formatDriftDiffSummary(summary as DriftDiffSummary);
    case 'driftDashboard':
      return formatDriftDashboardSummary(summary as DriftDashboardSummary);
    default:
      return '';
  }
}

/**
 * Format timestamp for display (shorter format).
 */
function formatTimestamp(timestamp: string): string {
  // Just return the full ISO timestamp for consistency
  return timestamp;
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format run index for human-readable CLI output.
 */
export function formatRunIndex(index: RunIndexArtifact): string {
  const lines: string[] = [];

  // Header
  lines.push('=== FIGMA RUN INDEX (Phase 13A) ===');
  lines.push(`Repo Root: ${index.repoRoot}`);
  lines.push(`Source: ${index.sourceFile} (canonical)`);
  lines.push('');

  // Artifacts section
  lines.push('Artifacts:');

  const artifactTypes: IndexedArtifactType[] = [
    'delta',
    'deltaSuggestions',
    'conflicts',
    'resolutionPlan',
    'resolutionApply',
    'verification',
    'rollbackPreview',
    'status',
    'driftDiff',
    'driftDashboard',
  ];

  for (const type of artifactTypes) {
    const entry = index.artifacts[type];
    const displayName = ARTIFACT_DISPLAY_NAMES[type];

    if (isFound(entry)) {
      const summary = formatSummary(type, entry);
      const timestamp = formatTimestamp(entry.timestamp);
      lines.push(`  ✓ ${displayName} (${summary}) ${timestamp}`);
    } else {
      lines.push(`  ✗ ${displayName}`);
    }
  }

  lines.push('');

  // Notes section
  if (index.notes.length > 0) {
    lines.push('Notes:');
    for (const note of index.notes) {
      const prefix = note.level === 'warn' ? '⚠️' : note.level === 'error' ? '❌' : 'ℹ️';
      lines.push(`  ${prefix} ${note.message}`);
    }
  } else {
    lines.push('Notes: none');
  }

  return lines.join('\n');
}

/**
 * Format discovery information for verbose CLI output.
 */
export function formatDiscovery(
  discovery: {
    repoRoot: string;
    normalizedSourceFile: string;
    checkedPaths: Record<IndexedArtifactType, string[]>;
  },
  artifacts: Record<IndexedArtifactType, ArtifactEntry>
): string {
  const lines: string[] = [];

  lines.push('Artifact Discovery:');
  lines.push(`  Repo Root: ${discovery.repoRoot}`);
  lines.push(`  Source File (canonical): ${discovery.normalizedSourceFile}`);
  lines.push('');

  const artifactTypes: IndexedArtifactType[] = [
    'delta',
    'deltaSuggestions',
    'conflicts',
    'resolutionPlan',
    'resolutionApply',
    'verification',
    'rollbackPreview',
    'status',
    'driftDiff',
    'driftDashboard',
  ];

  for (const type of artifactTypes) {
    const displayName = ARTIFACT_DISPLAY_NAMES[type];
    const paths = discovery.checkedPaths[type];
    const entry = artifacts[type];

    lines.push(`  ${displayName}:`);
    for (const path of paths) {
      const found = isFound(entry);
      lines.push(`    ${found ? '✓' : '✗'} ${path}`);
    }
  }

  return lines.join('\n');
}
