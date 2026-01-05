/**
 * @aesthetic-function/watcher - reconciliationIndex/compute.ts
 *
 * Phase 13A: Reconciliation Run Index Computation.
 *
 * WHY: Discovers and indexes all reconciliation artifacts for a source file,
 * extracting key metadata (timestamps, modes, counts) in a deterministic way.
 *
 * SCOPE:
 * - Read-only indexing only (no mutations)
 * - One-shot current/latest artifacts (NOT a timeline)
 * - Repo-root aware (works from any working directory)
 * - Deterministic output (sorted, stable, canonical paths)
 *
 * CONSTRAINTS:
 * - Does NOT generate new deltas, plans, or apply ops
 * - Does NOT mutate TSX, markers, overrides, or Figma
 * - Reuses existing discovery utilities from Phase 12J.2
 */

import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getRepoRoot,
  normalizeSourcePath,
} from '../reconciliationStatus/compute.js';

import type {
  RunIndexArtifact,
  RunIndexContext,
  RunIndexDiscoveryResult,
  IndexedArtifacts,
  IndexedArtifactType,
  ArtifactEntry,
  IndexNote,
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

// Re-export utilities from reconciliationStatus for external use
export { getRepoRoot, normalizeSourcePath };

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Artifact type configuration.
 */
interface ArtifactTypeConfig {
  /** Suffix for current artifact naming */
  suffix: string;
  /** Legacy suffixes for backward compatibility */
  legacySuffixes?: string[];
  /** Phase that produces this artifact */
  phase: string;
}

/**
 * Configuration for all indexed artifact types.
 */
const ARTIFACT_CONFIGS: Record<IndexedArtifactType, ArtifactTypeConfig> = {
  delta: {
    suffix: '.figma-delta.json',
    phase: '12A',
  },
  deltaSuggestions: {
    suffix: '.figma-delta-suggestions.json',
    phase: '12B',
  },
  conflicts: {
    suffix: '.figma-conflicts.json',
    phase: '12D',
  },
  resolutionPlan: {
    suffix: '.figma-resolution-plan.json',
    phase: '12E',
  },
  resolutionApply: {
    suffix: '.figma-resolution-apply.json',
    // Legacy name used before Phase 12J.1 fix
    legacySuffixes: ['.figma-resolve-apply.json'],
    phase: '12F',
  },
  verification: {
    suffix: '.figma-verification.json',
    phase: '12G',
  },
  rollbackPreview: {
    suffix: '.figma-rollback-preview.json',
    phase: '12I',
  },
  status: {
    suffix: '.figma-reconciliation-status.json',
    // Legacy name variant
    legacySuffixes: ['.figma-status.json'],
    phase: '12J',
  },
  driftDiff: {
    suffix: '.figma-drift-diff.json',
    phase: '13C',
  },
  driftDashboard: {
    suffix: '.figma-drift-dashboard.json',
    phase: '13D',
  },
};

/**
 * Normalize source file path for artifact naming.
 * Converts: demo-app/src/App.tsx → demo-app__src__App
 */
function normalizeSourceFileForArtifact(sourceFile: string): string {
  return sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Get all possible paths for an artifact type (current + legacy).
 */
function getArtifactPaths(
  normalizedSource: string,
  artifactType: IndexedArtifactType,
  repoRoot: string
): string[] {
  const config = ARTIFACT_CONFIGS[artifactType];
  const baseDir = 'design-materializations';
  const normalized = normalizeSourceFileForArtifact(normalizedSource);

  const paths: string[] = [];

  // Current path (preferred)
  paths.push(join(repoRoot, baseDir, `${normalized}${config.suffix}`));

  // Legacy paths (for backward compatibility)
  if (config.legacySuffixes) {
    for (const legacySuffix of config.legacySuffixes) {
      paths.push(join(repoRoot, baseDir, `${normalized}${legacySuffix}`));
    }
  }

  return paths;
}

// =============================================================================
// METADATA EXTRACTION
// =============================================================================

/**
 * Extract timestamp from artifact content.
 * Tries common field names in order of preference.
 */
function extractTimestamp(content: Record<string, unknown>): string | undefined {
  const timestampFields = ['generatedAt', 'timestamp', 'createdAt'];
  for (const field of timestampFields) {
    const value = content[field];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

/**
 * Extract delta summary from artifact content.
 */
function extractDeltaSummary(content: Record<string, unknown>): DeltaSummary | undefined {
  // Try summary.total first, then deltas array length
  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.total === 'number') {
    return { deltas: summary.total };
  }

  const deltas = content.deltas as unknown[];
  if (Array.isArray(deltas)) {
    return { deltas: deltas.length };
  }

  return undefined;
}

/**
 * Extract delta suggestions summary from artifact content.
 */
function extractDeltaSuggestionsSummary(
  content: Record<string, unknown>
): DeltaSuggestionsSummary | undefined {
  const suggestions = content.suggestions as unknown[];
  if (Array.isArray(suggestions)) {
    return { suggestions: suggestions.length };
  }

  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.total === 'number') {
    return { suggestions: summary.total };
  }

  return undefined;
}

/**
 * Extract conflicts summary from artifact content.
 */
function extractConflictsSummary(content: Record<string, unknown>): ConflictsSummary | undefined {
  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary) {
    const total = typeof summary.total === 'number' ? summary.total : 0;
    const blocked = typeof summary.blocked === 'number' ? summary.blocked : 0;
    return { conflicts: total, blocked };
  }

  const conflicts = content.conflicts as unknown[];
  if (Array.isArray(conflicts)) {
    return { conflicts: conflicts.length, blocked: 0 };
  }

  return undefined;
}

/**
 * Extract resolution plan summary from artifact content.
 */
function extractResolutionPlanSummary(
  content: Record<string, unknown>
): ResolutionPlanSummary | undefined {
  const decisions = content.decisions as unknown[];
  if (Array.isArray(decisions)) {
    return { decisions: decisions.length };
  }

  return undefined;
}

/**
 * Extract resolution apply summary from artifact content.
 */
function extractResolutionApplySummary(
  content: Record<string, unknown>
): ResolutionApplySummary | undefined {
  const summary = content.summary as Record<string, unknown> | undefined;
  const dryRun = content.dryRun === true;

  if (summary) {
    return {
      ops: typeof summary.decisionsTotal === 'number' ? summary.decisionsTotal : 0,
      dryRun,
      applied: typeof summary.applied === 'number' ? summary.applied : 0,
      skipped: typeof summary.skipped === 'number' ? summary.skipped : 0,
      failed: typeof summary.failed === 'number' ? summary.failed : 0,
    };
  }

  const results = content.results as unknown[];
  if (Array.isArray(results)) {
    return {
      ops: results.length,
      dryRun,
      applied: 0,
      skipped: 0,
      failed: 0,
    };
  }

  return undefined;
}

/**
 * Extract verification summary from artifact content.
 */
function extractVerificationSummary(
  content: Record<string, unknown>
): VerificationSummary | undefined {
  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary) {
    return {
      verified: typeof summary.verified === 'number' ? summary.verified : 0,
      mismatch: typeof summary.mismatch === 'number' ? summary.mismatch : 0,
      missing: typeof summary.missing === 'number' ? summary.missing : 0,
    };
  }

  return undefined;
}

/**
 * Extract rollback preview summary from artifact content.
 */
function extractRollbackPreviewSummary(
  content: Record<string, unknown>
): RollbackPreviewSummary | undefined {
  const actions = content.actions as unknown[];
  if (Array.isArray(actions)) {
    return { actions: actions.length };
  }

  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.total === 'number') {
    return { actions: summary.total };
  }

  return undefined;
}

/**
 * Extract status summary from artifact content.
 */
function extractStatusSummary(content: Record<string, unknown>): StatusSummary | undefined {
  const overallStatus = content.overallStatus;
  const ciVerdict = content.ciVerdict;

  if (typeof overallStatus === 'string') {
    return {
      overallStatus,
      ciVerdict: typeof ciVerdict === 'string' ? ciVerdict : 'UNKNOWN',
    };
  }

  return undefined;
}

/**
 * Extract drift diff summary from artifact content.
 */
function extractDriftDiffSummary(content: Record<string, unknown>): DriftDiffSummary | undefined {
  const summary = content.summary as Record<string, unknown> | undefined;
  if (summary) {
    return {
      totalChanges: typeof summary.totalChanges === 'number' ? summary.totalChanges : 0,
      failCount: typeof summary.failCount === 'number' ? summary.failCount : 0,
      warnCount: typeof summary.warnCount === 'number' ? summary.warnCount : 0,
    };
  }

  // Fallback: count changes array
  const changes = content.changes as unknown[];
  if (Array.isArray(changes)) {
    return {
      totalChanges: changes.length,
      failCount: 0,
      warnCount: 0,
    };
  }

  return undefined;
}

/**
 * Extract drift dashboard summary from artifact content.
 */
function extractDriftDashboardSummary(content: Record<string, unknown>): DriftDashboardSummary | undefined {
  const stabilityScore = content.stabilityScore as Record<string, unknown> | undefined;
  const ciVerdict = content.ciVerdict;
  const counts = content.counts as Record<string, unknown> | undefined;

  // Try extracting stabilityScore.score
  const score = stabilityScore && typeof stabilityScore.score === 'number'
    ? stabilityScore.score
    : undefined;

  // Fallback: try top-level score field
  const fallbackScore = typeof content.score === 'number' ? content.score : undefined;

  const runsConsidered = counts && typeof counts.runsConsidered === 'number'
    ? counts.runsConsidered
    : 0;

  if (score !== undefined || fallbackScore !== undefined) {
    return {
      stabilityScore: score ?? fallbackScore ?? 0,
      ciVerdict: typeof ciVerdict === 'string' ? ciVerdict : 'UNKNOWN',
      runsConsidered,
    };
  }

  // Minimal fallback if ciVerdict exists
  if (typeof ciVerdict === 'string') {
    return {
      stabilityScore: 0,
      ciVerdict,
      runsConsidered,
    };
  }

  return undefined;
}

/**
 * Extract summary based on artifact type.
 */
function extractSummary(
  artifactType: IndexedArtifactType,
  content: Record<string, unknown>
): DeltaSummary | DeltaSuggestionsSummary | ConflictsSummary | ResolutionPlanSummary | ResolutionApplySummary | VerificationSummary | RollbackPreviewSummary | StatusSummary | DriftDiffSummary | DriftDashboardSummary | undefined {
  switch (artifactType) {
    case 'delta':
      return extractDeltaSummary(content);
    case 'deltaSuggestions':
      return extractDeltaSuggestionsSummary(content);
    case 'conflicts':
      return extractConflictsSummary(content);
    case 'resolutionPlan':
      return extractResolutionPlanSummary(content);
    case 'resolutionApply':
      return extractResolutionApplySummary(content);
    case 'verification':
      return extractVerificationSummary(content);
    case 'rollbackPreview':
      return extractRollbackPreviewSummary(content);
    case 'status':
      return extractStatusSummary(content);
    case 'driftDiff':
      return extractDriftDiffSummary(content);
    case 'driftDashboard':
      return extractDriftDashboardSummary(content);
    default:
      return undefined;
  }
}

// =============================================================================
// ARTIFACT LOADING
// =============================================================================

/**
 * Candidate artifact with metadata for best-selection.
 */
interface ArtifactCandidate {
  path: string;
  relativePath: string;
  timestamp: string;
  mtime: Date;
  content: Record<string, unknown>;
}

/**
 * Try to load an artifact from a path, returning candidate metadata.
 */
async function tryLoadArtifactCandidate(
  fullPath: string,
  repoRoot: string
): Promise<ArtifactCandidate | undefined> {
  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Get file mtime as fallback for timestamp
    const stat = statSync(fullPath);
    const timestamp = extractTimestamp(parsed) ?? stat.mtime.toISOString();

    // Compute relative path for artifact entry
    const relativePath = fullPath.startsWith(repoRoot)
      ? fullPath.slice(repoRoot.length + 1)
      : fullPath;

    return {
      path: fullPath,
      relativePath,
      timestamp,
      mtime: stat.mtime,
      content: parsed,
    };
  } catch {
    return undefined;
  }
}

/**
 * Select best candidate from multiple artifacts.
 * Prefers newest by timestamp (artifact field), falls back to file mtime.
 */
function selectBestCandidate(candidates: ArtifactCandidate[]): ArtifactCandidate {
  if (candidates.length === 1) {
    return candidates[0];
  }

  // Sort by timestamp descending (newest first)
  return candidates.sort((a, b) => {
    // Try parsing timestamps
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();

    if (!isNaN(aTime) && !isNaN(bTime)) {
      return bTime - aTime;
    }

    // Fallback to mtime
    return b.mtime.getTime() - a.mtime.getTime();
  })[0];
}

/**
 * Load a single artifact type, handling multiple candidates.
 */
async function loadArtifact(
  normalizedSource: string,
  artifactType: IndexedArtifactType,
  repoRoot: string,
  notes: IndexNote[]
): Promise<{ entry: ArtifactEntry; checkedPaths: string[] }> {
  const paths = getArtifactPaths(normalizedSource, artifactType, repoRoot);
  const checkedPaths = paths;
  const candidates: ArtifactCandidate[] = [];

  // Try all paths
  for (const path of paths) {
    const candidate = await tryLoadArtifactCandidate(path, repoRoot);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return { entry: { found: false }, checkedPaths };
  }

  // Warn if multiple candidates found
  if (candidates.length > 1) {
    notes.push({
      level: 'warn',
      message: `Multiple ${artifactType} artifacts found; chose newest by timestamp.`,
    });
  }

  const best = selectBestCandidate(candidates);
  const summary = extractSummary(artifactType, best.content);

  // If summary extraction failed, still report found with empty summary
  if (!summary) {
    return {
      entry: {
        found: true,
        path: best.relativePath,
        timestamp: best.timestamp,
        summary: {} as DeltaSummary, // Type assertion for minimal case
      },
      checkedPaths,
    };
  }

  return {
    entry: {
      found: true,
      path: best.relativePath,
      timestamp: best.timestamp,
      summary,
    },
    checkedPaths,
  };
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Compute run index with full discovery information.
 */
export async function computeRunIndex(
  context: RunIndexContext
): Promise<RunIndexDiscoveryResult> {
  // Auto-detect repo root if not provided
  const repoRoot = context.repoRoot || getRepoRoot();

  // Normalize source file path
  const normalizedSourceFile = normalizeSourcePath(context.sourceFile, repoRoot);

  const notes: IndexNote[] = [];
  const checkedPaths: Record<IndexedArtifactType, string[]> = {
    delta: [],
    deltaSuggestions: [],
    conflicts: [],
    resolutionPlan: [],
    resolutionApply: [],
    verification: [],
    rollbackPreview: [],
    status: [],
    driftDiff: [],
    driftDashboard: [],
  };

  // Load all artifacts in parallel
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

  const results = await Promise.all(
    artifactTypes.map((type) => loadArtifact(normalizedSourceFile, type, repoRoot, notes))
  );

  // Build artifacts map
  const artifacts: IndexedArtifacts = {
    delta: { found: false },
    deltaSuggestions: { found: false },
    conflicts: { found: false },
    resolutionPlan: { found: false },
    resolutionApply: { found: false },
    verification: { found: false },
    rollbackPreview: { found: false },
    status: { found: false },
    driftDiff: { found: false },
    driftDashboard: { found: false },
  };

  for (let i = 0; i < artifactTypes.length; i++) {
    const type = artifactTypes[i];
    const result = results[i];
    artifacts[type] = result.entry;
    checkedPaths[type] = result.checkedPaths;
  }

  const index: RunIndexArtifact = {
    version: '1.0',
    repoRoot,
    sourceFile: normalizedSourceFile,
    generatedAt: new Date().toISOString(),
    artifacts,
    notes,
  };

  return {
    index,
    discovery: {
      repoRoot,
      normalizedSourceFile,
      checkedPaths,
    },
  };
}

/**
 * Compute run index (simplified, without discovery details).
 */
export async function computeRunIndexSimple(
  context: RunIndexContext
): Promise<RunIndexArtifact> {
  const result = await computeRunIndex(context);
  return result.index;
}
