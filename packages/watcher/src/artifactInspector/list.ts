/**
 * @aesthetic-function/watcher - artifactInspector/list.ts
 *
 * Phase 15D: Artifact Listing.
 *
 * WHY: Lists all reconciliation artifacts for a source file, reusing
 * computeRunIndex() from Phase 13A and extending it with Phase 13B/14C
 * artifacts that the run index doesn't cover.
 *
 * SCOPE:
 * - Read-only artifact discovery + listing
 * - Reuses existing computeRunIndex() for 10 indexed artifact types
 * - Extends with run ledger (13B) and reconcile bundle (14C)
 *
 * CONSTRAINTS:
 * - Pure read-only — no disk writes, no mutations
 * - Delegates to existing index computation (does not reimplement)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  computeRunIndexSimple,
  getRepoRoot,
  normalizeSourcePath,
} from '../reconciliationIndex/index.js';
import type {
  IndexedArtifactType,
  ArtifactEntryFound,
} from '../reconciliationIndex/types.js';
import type {
  ArtifactListResult,
  ArtifactListEntry,
  ExtendedArtifactType,
} from './types.js';
import {
  ARTIFACT_PHASE_MAP,
  ARTIFACT_DISPLAY_NAMES,
} from './types.js';

// =============================================================================
// INDEXED ARTIFACT TYPE ORDER (for display)
// =============================================================================

/**
 * Display order: lifecycle-ordered, then monitoring, then aggregate.
 */
const DISPLAY_ORDER: ExtendedArtifactType[] = [
  'delta',
  'deltaSuggestions',
  'conflicts',
  'resolutionPlan',
  'resolutionApply',
  'verification',
  'rollbackPreview',
  'status',
  'runLedger',
  'driftDiff',
  'driftDashboard',
  'reconcileBundle',
];

// =============================================================================
// ARTIFACT FILENAME HELPERS
// =============================================================================

function normalizeSourceFileForArtifact(sourceFile: string): string {
  return sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
}

// =============================================================================
// SUMMARY FORMATTING (from run index entries)
// =============================================================================

function formatIndexedSummary(type: IndexedArtifactType, entry: ArtifactEntryFound): string {
  const s = entry.summary;
  switch (type) {
    case 'delta':
      return `${(s as { deltas: number }).deltas} delta(s)`;
    case 'deltaSuggestions':
      return `${(s as { suggestions: number }).suggestions} suggestion(s)`;
    case 'conflicts': {
      const c = s as { conflicts: number; blocked: number };
      return c.blocked > 0 ? `${c.conflicts} conflict(s), ${c.blocked} blocked` : `${c.conflicts} conflict(s)`;
    }
    case 'resolutionPlan':
      return `${(s as { decisions: number }).decisions} decision(s)`;
    case 'resolutionApply': {
      const a = s as { ops: number; dryRun: boolean; applied: number; skipped: number; failed: number };
      return a.dryRun ? `${a.ops} op(s), dry-run` : `${a.applied} applied, ${a.skipped} skipped, ${a.failed} failed`;
    }
    case 'verification': {
      const v = s as { verified: number; mismatch: number; missing: number };
      if (v.mismatch === 0 && v.missing === 0) return `${v.verified} verified, OK`;
      return `${v.mismatch} mismatch, ${v.missing} missing`;
    }
    case 'rollbackPreview':
      return `${(s as { actions: number }).actions} action(s)`;
    case 'status': {
      const st = s as { overallStatus: string; ciVerdict: string };
      return `${st.overallStatus} (${st.ciVerdict})`;
    }
    case 'driftDiff': {
      const d = s as { totalChanges: number; failCount: number; warnCount: number };
      const parts = [`${d.totalChanges} change(s)`];
      if (d.failCount > 0) parts.push(`${d.failCount} fail`);
      if (d.warnCount > 0) parts.push(`${d.warnCount} warn`);
      return parts.join(', ');
    }
    case 'driftDashboard': {
      const db = s as { stabilityScore: number; ciVerdict: string; runsConsidered: number };
      return `score=${db.stabilityScore}, ${db.ciVerdict}, ${db.runsConsidered} runs`;
    }
    default:
      return '';
  }
}

// =============================================================================
// LIST COMPUTATION
// =============================================================================

/**
 * List all reconciliation artifacts for a source file.
 *
 * Reuses computeRunIndex() for the 10 Phase 12/13 artifact types,
 * then extends with run ledger (13B) and reconcile bundle (14C).
 *
 * @param sourceFile - Source file path (relative or absolute)
 * @param repoRoot - Optional explicit repo root
 * @returns Artifact list result
 */
export async function listArtifacts(
  sourceFile: string,
  repoRoot?: string,
): Promise<ArtifactListResult> {
  const resolvedRoot = repoRoot ?? getRepoRoot();
  const canonical = normalizeSourcePath(sourceFile, resolvedRoot);

  // 1. Use existing run index for the 10 indexed types
  const index = await computeRunIndexSimple({
    repoRoot: resolvedRoot,
    sourceFile: canonical,
  });

  // 2. Build entries from index
  const entries: ArtifactListEntry[] = [];
  const indexedTypes: IndexedArtifactType[] = [
    'delta', 'deltaSuggestions', 'conflicts', 'resolutionPlan',
    'resolutionApply', 'verification', 'rollbackPreview', 'status',
    'driftDiff', 'driftDashboard',
  ];

  for (const type of indexedTypes) {
    const entry = index.artifacts[type];
    if (entry.found) {
      const found = entry as ArtifactEntryFound;
      entries.push({
        type,
        phase: ARTIFACT_PHASE_MAP[type],
        displayName: ARTIFACT_DISPLAY_NAMES[type],
        found: true,
        path: found.path,
        timestamp: found.timestamp,
        summary: formatIndexedSummary(type, found),
      });
    } else {
      entries.push({
        type,
        phase: ARTIFACT_PHASE_MAP[type],
        displayName: ARTIFACT_DISPLAY_NAMES[type],
        found: false,
      });
    }
  }

  // 3. Check for run ledger (13B) — not in the run index
  const normalized = normalizeSourceFileForArtifact(canonical);
  const ledgerPath = `design-materializations/${normalized}.figma-run-ledger.json`;
  const ledgerFullPath = join(resolvedRoot, ledgerPath);
  if (existsSync(ledgerFullPath)) {
    try {
      const ledgerData = JSON.parse(readFileSync(ledgerFullPath, 'utf-8'));
      const runs = Array.isArray(ledgerData?.runs) ? ledgerData.runs : [];
      entries.push({
        type: 'runLedger',
        phase: ARTIFACT_PHASE_MAP.runLedger,
        displayName: ARTIFACT_DISPLAY_NAMES.runLedger,
        found: true,
        path: ledgerPath,
        timestamp: runs.length > 0 ? runs[runs.length - 1].timestamp : undefined,
        summary: `${runs.length} run(s)`,
      });
    } catch {
      entries.push({
        type: 'runLedger',
        phase: ARTIFACT_PHASE_MAP.runLedger,
        displayName: ARTIFACT_DISPLAY_NAMES.runLedger,
        found: false,
      });
    }
  } else {
    entries.push({
      type: 'runLedger',
      phase: ARTIFACT_PHASE_MAP.runLedger,
      displayName: ARTIFACT_DISPLAY_NAMES.runLedger,
      found: false,
    });
  }

  // 4. Check for reconcile bundle (14C) — not in the run index
  const bundlePath = `design-materializations/${normalized}.figma-reconcile.json`;
  const bundleFullPath = join(resolvedRoot, bundlePath);
  if (existsSync(bundleFullPath)) {
    try {
      const bundleData = JSON.parse(readFileSync(bundleFullPath, 'utf-8'));
      const verdict = bundleData?.overall?.ciVerdict ?? 'unknown';
      const profile = bundleData?.profile ?? 'unknown';
      entries.push({
        type: 'reconcileBundle',
        phase: ARTIFACT_PHASE_MAP.reconcileBundle,
        displayName: ARTIFACT_DISPLAY_NAMES.reconcileBundle,
        found: true,
        path: bundlePath,
        timestamp: bundleData?.timestamp,
        summary: `profile=${profile}, verdict=${verdict}`,
      });
    } catch {
      entries.push({
        type: 'reconcileBundle',
        phase: ARTIFACT_PHASE_MAP.reconcileBundle,
        displayName: ARTIFACT_DISPLAY_NAMES.reconcileBundle,
        found: false,
      });
    }
  } else {
    entries.push({
      type: 'reconcileBundle',
      phase: ARTIFACT_PHASE_MAP.reconcileBundle,
      displayName: ARTIFACT_DISPLAY_NAMES.reconcileBundle,
      found: false,
    });
  }

  // 5. Sort by display order
  entries.sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.type) - DISPLAY_ORDER.indexOf(b.type)
  );

  const foundCount = entries.filter((e) => e.found).length;

  return {
    sourceFile: canonical,
    repoRoot: resolvedRoot,
    generatedAt: new Date().toISOString(),
    artifacts: entries,
    foundCount,
    totalCount: entries.length,
  };
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format artifact list for human-readable CLI output.
 */
export function formatArtifactList(result: ArtifactListResult): string {
  const lines: string[] = [];

  lines.push(`Artifact List: ${result.sourceFile}`);
  lines.push(`Repository: ${result.repoRoot}`);
  lines.push(`Found: ${result.foundCount} / ${result.totalCount}`);
  lines.push('');

  for (const entry of result.artifacts) {
    const icon = entry.found ? '✓' : '·';
    const phase = `[${entry.phase}]`.padEnd(6);
    const name = entry.displayName.padEnd(25);

    if (entry.found) {
      const summary = entry.summary ?? '';
      lines.push(`  ${icon} ${phase} ${name} ${summary}`);
      if (entry.path) {
        lines.push(`       ${entry.path}`);
      }
    } else {
      lines.push(`  ${icon} ${phase} ${name} (not found)`);
    }
  }

  return lines.join('\n');
}
