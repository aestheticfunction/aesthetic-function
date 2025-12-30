/**
 * @aesthetic-function/watcher - reconciliationTimeline/compute.ts
 *
 * Phase 13B: Design Drift Timeline - Core Computation.
 *
 * WHY: Provides core logic for the append-only run ledger:
 * - Run ID generation (deterministic)
 * - Run entry creation from current artifact state
 * - Ledger loading and appending
 *
 * SCOPE:
 * - Record-keeping only (memory, not intelligence)
 * - Append-only (never rewrite or compact)
 * - Repo-root aware (works from any working directory)
 *
 * CONSTRAINTS:
 * - Does NOT recompute or reinterpret artifacts
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Feature flag gated (RECONCILIATION_TIMELINE_ON)
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getRepoRoot,
  normalizeSourcePath,
  computeRunIndex,
} from '../reconciliationIndex/compute.js';

import type { RunIndexArtifact, ArtifactEntryFound } from '../reconciliationIndex/types.js';

import type {
  RunId,
  RunEntry,
  RunLedgerArtifact,
  RunArtifactRefs,
  RunSummary,
  TimelineRecordContext,
  TimelineReadContext,
} from './types.js';

// Re-export utilities for external use
export { getRepoRoot, normalizeSourcePath };

// =============================================================================
// FEATURE FLAG
// =============================================================================

/**
 * Check if timeline recording is enabled.
 *
 * Controlled by RECONCILIATION_TIMELINE_ON environment variable.
 * Default: false (disabled)
 */
export function isTimelineEnabled(): boolean {
  const value = process.env.RECONCILIATION_TIMELINE_ON;
  return value === 'true' || value === '1';
}

// =============================================================================
// RUN ID GENERATION
// =============================================================================

/**
 * djb2 hash function for deterministic string hashing.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Ensure unsigned
}

/**
 * Generate a deterministic run ID from run metadata.
 *
 * Inputs:
 * - canonical sourceFile
 * - timestamp
 * - command
 * - artifact paths (sorted for determinism)
 */
export function generateRunId(
  sourceFile: string,
  timestamp: string,
  command: string,
  artifactPaths: string[] = []
): RunId {
  // Sort artifact paths for determinism
  const sortedPaths = [...artifactPaths].sort().join('|');

  // Combine all inputs
  const input = `${sourceFile}:${timestamp}:${command}:${sortedPaths}`;

  // Generate hash and convert to hex string
  const hash = djb2Hash(input);
  return hash.toString(16).padStart(8, '0');
}

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Normalize source file path for artifact naming.
 * Converts: demo-app/src/App.tsx → demo-app__src__App
 * Also strips leading ./ for consistency.
 */
function normalizeSourceFileForArtifact(sourceFile: string): string {
  let normalized = sourceFile;
  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  return normalized.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Get the run ledger artifact path for a source file.
 */
export function getRunLedgerPath(sourceFile: string): string {
  const normalized = normalizeSourceFileForArtifact(sourceFile);
  return `design-materializations/${normalized}.figma-run-ledger.json`;
}

// =============================================================================
// LEDGER LOADING
// =============================================================================

/**
 * Load an existing run ledger, or return undefined if not found.
 */
export async function loadRunLedger(
  context: TimelineReadContext
): Promise<RunLedgerArtifact | undefined> {
  const normalizedSource = normalizeSourcePath(context.sourceFile, context.repoRoot);
  const ledgerPath = getRunLedgerPath(normalizedSource);
  const fullPath = join(context.repoRoot, ledgerPath);

  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const ledger = JSON.parse(content) as RunLedgerArtifact;
    return ledger;
  } catch {
    return undefined;
  }
}

/**
 * Get all runs from the ledger, or empty array if no ledger exists.
 */
export async function getRuns(
  context: TimelineReadContext
): Promise<RunEntry[]> {
  const ledger = await loadRunLedger(context);
  return ledger?.runs ?? [];
}

/**
 * Get the most recent N runs, ordered newest first.
 */
export async function getRecentRuns(
  context: TimelineReadContext,
  limit: number = 10
): Promise<RunEntry[]> {
  const runs = await getRuns(context);
  // Runs are stored oldest first, so reverse and take limit
  return runs.slice().reverse().slice(0, limit);
}

// =============================================================================
// RUN ENTRY CREATION
// =============================================================================

/**
 * Extract artifact references from a run index.
 */
function extractArtifactRefs(index: RunIndexArtifact): RunArtifactRefs {
  const refs: RunArtifactRefs = {};

  if (index.artifacts.delta.found) {
    refs.delta = (index.artifacts.delta as ArtifactEntryFound).path;
  }
  if (index.artifacts.deltaSuggestions.found) {
    refs.suggestions = (index.artifacts.deltaSuggestions as ArtifactEntryFound).path;
  }
  if (index.artifacts.conflicts.found) {
    refs.conflicts = (index.artifacts.conflicts as ArtifactEntryFound).path;
  }
  if (index.artifacts.resolutionPlan.found) {
    refs.resolutionPlan = (index.artifacts.resolutionPlan as ArtifactEntryFound).path;
  }
  if (index.artifacts.resolutionApply.found) {
    refs.resolutionApply = (index.artifacts.resolutionApply as ArtifactEntryFound).path;
  }
  if (index.artifacts.verification.found) {
    refs.verification = (index.artifacts.verification as ArtifactEntryFound).path;
  }
  if (index.artifacts.rollbackPreview.found) {
    refs.rollbackPreview = (index.artifacts.rollbackPreview as ArtifactEntryFound).path;
  }
  if (index.artifacts.status.found) {
    refs.status = (index.artifacts.status as ArtifactEntryFound).path;
  }

  return refs;
}

/**
 * Extract summary counts from a run index.
 */
function extractRunSummary(index: RunIndexArtifact): RunSummary {
  const summary: RunSummary = {};

  if (index.artifacts.delta.found) {
    const s = (index.artifacts.delta as ArtifactEntryFound).summary as { deltas?: number };
    if (typeof s.deltas === 'number') {
      summary.deltas = s.deltas;
    }
  }

  if (index.artifacts.deltaSuggestions.found) {
    const s = (index.artifacts.deltaSuggestions as ArtifactEntryFound).summary as { suggestions?: number };
    if (typeof s.suggestions === 'number') {
      summary.suggestions = s.suggestions;
    }
  }

  if (index.artifacts.conflicts.found) {
    const s = (index.artifacts.conflicts as ArtifactEntryFound).summary as { conflicts?: number };
    if (typeof s.conflicts === 'number') {
      summary.conflicts = s.conflicts;
    }
  }

  if (index.artifacts.resolutionPlan.found) {
    const s = (index.artifacts.resolutionPlan as ArtifactEntryFound).summary as { decisions?: number };
    if (typeof s.decisions === 'number') {
      summary.decisions = s.decisions;
    }
  }

  if (index.artifacts.resolutionApply.found) {
    const s = (index.artifacts.resolutionApply as ArtifactEntryFound).summary as { applied?: number };
    if (typeof s.applied === 'number') {
      summary.appliedOps = s.applied;
    }
  }

  if (index.artifacts.verification.found) {
    const s = (index.artifacts.verification as ArtifactEntryFound).summary as { mismatch?: number; missing?: number };
    const failures = (s.mismatch ?? 0) + (s.missing ?? 0);
    if (failures > 0) {
      summary.verifyFailures = failures;
    }
  }

  if (index.artifacts.rollbackPreview.found) {
    const s = (index.artifacts.rollbackPreview as ArtifactEntryFound).summary as { actions?: number };
    if (typeof s.actions === 'number') {
      summary.rollbackActions = s.actions;
    }
  }

  return summary;
}

/**
 * Create a new run entry from the current artifact state.
 */
export async function createRunEntry(
  context: TimelineRecordContext
): Promise<RunEntry> {
  const normalizedSource = normalizeSourcePath(context.sourceFile, context.repoRoot);
  const timestamp = new Date().toISOString();
  const cwd = context.cwd ?? process.cwd();

  // Use 13A run index to discover artifacts
  const { index } = await computeRunIndex({
    sourceFile: normalizedSource,
    repoRoot: context.repoRoot,
  });

  // Extract artifact references and summary
  const artifacts = extractArtifactRefs(index);
  const summary = extractRunSummary(index);

  // Collect artifact paths for run ID
  const artifactPaths = Object.values(artifacts).filter((p): p is string => !!p);

  // Generate deterministic run ID
  const runId = generateRunId(
    normalizedSource,
    timestamp,
    context.command,
    artifactPaths
  );

  return {
    runId,
    sourceFile: normalizedSource,
    timestamp,
    cwd,
    repoRoot: context.repoRoot,
    command: context.command,
    mode: context.mode,
    artifacts,
    summary,
  };
}

// =============================================================================
// LEDGER APPENDING
// =============================================================================

/**
 * Append a run entry to the ledger.
 *
 * Creates a new ledger if none exists.
 * Returns the updated ledger.
 *
 * NOTE: This function does NOT write to disk - use writeRunLedger for that.
 */
export async function appendRunEntry(
  context: TimelineReadContext,
  entry: RunEntry
): Promise<RunLedgerArtifact> {
  const normalizedSource = normalizeSourcePath(context.sourceFile, context.repoRoot);
  const existingLedger = await loadRunLedger(context);

  if (existingLedger) {
    // Append to existing ledger (maintain oldest-first order)
    return {
      ...existingLedger,
      runs: [...existingLedger.runs, entry],
    };
  }

  // Create new ledger
  return {
    version: 1,
    sourceFile: normalizedSource,
    runs: [entry],
  };
}

/**
 * Record a run to the timeline ledger.
 *
 * This is the main entry point for recording runs.
 * Respects the RECONCILIATION_TIMELINE_ON feature flag.
 *
 * Returns the run entry (created but not written if feature flag is off).
 */
export async function recordRun(
  context: TimelineRecordContext
): Promise<{ entry: RunEntry; ledger: RunLedgerArtifact; written: boolean }> {
  const entry = await createRunEntry(context);

  if (!isTimelineEnabled()) {
    // Feature flag off: create entry but don't record
    return {
      entry,
      ledger: {
        version: 1,
        sourceFile: entry.sourceFile,
        runs: [entry],
      },
      written: false,
    };
  }

  const ledger = await appendRunEntry(
    { sourceFile: context.sourceFile, repoRoot: context.repoRoot },
    entry
  );

  return { entry, ledger, written: true };
}
