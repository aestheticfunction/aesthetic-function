/**
 * @aesthetic-function/watcher - reconciliationDashboard/compute.ts
 *
 * Phase 13D: Drift Summary Dashboard Computation.
 *
 * WHY: Aggregates drift data across multiple reconciliation runs
 * to provide an "at a glance" summary with stability score and CI verdict.
 *
 * SCOPE:
 * - Read-only aggregation only
 * - Uses Phase 13B ledger + Phase 13C drift diffs
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import {
  loadRunLedger,
  loadRunSnapshot,
  getRepoRoot,
  normalizeSourcePath,
} from '../reconciliationDrift/compute.js';

import { computeDriftDiff } from '../reconciliationDrift/compute.js';

import type { RunLedgerArtifact, RunEntry } from '../reconciliationTimeline/types.js';
import type { DriftChange } from '../reconciliationDrift/types.js';

import type {
  DashboardContext,
  DashboardSeverity,
  DashboardThresholds,
  DriftDashboardArtifact,
  DriftSignal,
  DriftSignalKey,
  RunSummary,
  SeverityCounts,
  StabilityScore,
  ComputeDashboardResult,
  CiVerdict,
} from './types.js';

// Re-export utilities for external use
export { getRepoRoot, normalizeSourcePath };

// =============================================================================
// STABILITY SCORE CALCULATION
// =============================================================================

/**
 * Stability score deductions.
 *
 * Rule table:
 * - Each fail-severity drift: -25 points
 * - Each warn-severity drift: -10 points
 * - Each info-severity drift: -2 points
 */
const DEDUCTION_FAIL = 25;
const DEDUCTION_WARN = 10;
const DEDUCTION_INFO = 2;

/**
 * Compute stability score from severity counts.
 *
 * Starts at 100, deducts based on severity counts, clamps to 0-100.
 */
export function computeStabilityScore(counts: SeverityCounts): StabilityScore {
  const rationale: string[] = [];
  let value = 100;

  if (counts.fail > 0) {
    const deduction = counts.fail * DEDUCTION_FAIL;
    value -= deduction;
    rationale.push(`-${deduction} (${counts.fail} fail-severity drift${counts.fail > 1 ? 's' : ''})`);
  }

  if (counts.warn > 0) {
    const deduction = counts.warn * DEDUCTION_WARN;
    value -= deduction;
    rationale.push(`-${deduction} (${counts.warn} warn-severity drift${counts.warn > 1 ? 's' : ''})`);
  }

  if (counts.info > 0) {
    const deduction = counts.info * DEDUCTION_INFO;
    value -= deduction;
    rationale.push(`-${deduction} (${counts.info} info-severity drift${counts.info > 1 ? 's' : ''})`);
  }

  if (rationale.length === 0) {
    rationale.push('No drift detected');
  }

  // Clamp to 0-100
  value = Math.max(0, Math.min(100, value));

  return { value, rationale };
}

// =============================================================================
// SEVERITY HELPERS
// =============================================================================

/**
 * Get the highest severity from a list of drift changes.
 */
function getHighestSeverity(changes: DriftChange[]): DashboardSeverity | undefined {
  if (changes.length === 0) {
    return undefined;
  }

  let highest: DashboardSeverity = 'info';
  for (const change of changes) {
    if (change.severity === 'fail') {
      return 'fail'; // Can't get higher
    }
    if (change.severity === 'warn' && highest === 'info') {
      highest = 'warn';
    }
  }
  return highest;
}

// =============================================================================
// CI VERDICT CALCULATION
// =============================================================================

/**
 * Compute CI verdict based on severity counts and thresholds.
 */
export function computeCiVerdict(
  counts: SeverityCounts,
  topSignals: DriftSignal[],
  thresholds: DashboardThresholds
): { verdict: CiVerdict; explanation: string } {
  // Check fail-severity threshold
  if (thresholds.failOnFailSeverity && counts.fail > 0) {
    return {
      verdict: 'FAIL',
      explanation: `${counts.fail} fail-severity drift${counts.fail > 1 ? 's' : ''} detected`,
    };
  }

  // Check maxFailCount threshold
  if (thresholds.maxFailCount !== undefined && counts.fail > thresholds.maxFailCount) {
    return {
      verdict: 'FAIL',
      explanation: `Fail count (${counts.fail}) exceeds threshold (${thresholds.maxFailCount})`,
    };
  }

  // Check maxWarnCount threshold
  if (thresholds.maxWarnCount !== undefined && counts.warn > thresholds.maxWarnCount) {
    return {
      verdict: 'FAIL',
      explanation: `Warn count (${counts.warn}) exceeds threshold (${thresholds.maxWarnCount})`,
    };
  }

  // Check metric-specific thresholds
  for (const signal of topSignals) {
    if (
      thresholds.maxVerifyMismatchIncrease !== undefined &&
      signal.key === 'verify.mismatches' &&
      signal.delta > thresholds.maxVerifyMismatchIncrease
    ) {
      return {
        verdict: 'FAIL',
        explanation: `Verify mismatch increase (${signal.delta}) exceeds threshold (${thresholds.maxVerifyMismatchIncrease})`,
      };
    }

    if (
      thresholds.maxConflictIncrease !== undefined &&
      signal.key === 'conflicts.total' &&
      signal.delta > thresholds.maxConflictIncrease
    ) {
      return {
        verdict: 'FAIL',
        explanation: `Conflict increase (${signal.delta}) exceeds threshold (${thresholds.maxConflictIncrease})`,
      };
    }

    if (
      thresholds.maxDeltaIncrease !== undefined &&
      signal.key === 'deltas.total' &&
      signal.delta > thresholds.maxDeltaIncrease
    ) {
      return {
        verdict: 'FAIL',
        explanation: `Delta increase (${signal.delta}) exceeds threshold (${thresholds.maxDeltaIncrease})`,
      };
    }
  }

  // Check for warnings
  if (counts.warn > 0) {
    return {
      verdict: 'WARN',
      explanation: `${counts.warn} warn-severity drift${counts.warn > 1 ? 's' : ''} detected`,
    };
  }

  // All clear
  return {
    verdict: 'PASS',
    explanation: 'No significant drift detected',
  };
}

// =============================================================================
// SIGNAL AGGREGATION
// =============================================================================

/**
 * Signal labels for human-readable display.
 */
const SIGNAL_LABELS: Record<DriftSignalKey, string> = {
  'status.transition': 'Status Transition',
  'conflicts.total': 'Conflicts',
  'verify.mismatches': 'Verify Mismatches',
  'verify.missing': 'Verify Missing',
  'deltas.total': 'Deltas',
  'apply.ops': 'Apply Operations',
  'suggestions.total': 'Suggestions',
  'rollback.actions': 'Rollback Actions',
};

/**
 * Signal severity priority (higher = more severe).
 */
const SEVERITY_PRIORITY: Record<DashboardSeverity, number> = {
  fail: 3,
  warn: 2,
  info: 1,
};

/**
 * Aggregate drift changes into signals.
 */
function aggregateDriftChanges(
  allChanges: DriftChange[]
): { signals: DriftSignal[]; counts: SeverityCounts } {
  const counts: SeverityCounts = { info: 0, warn: 0, fail: 0 };
  const signalMap = new Map<DriftSignalKey, DriftSignal>();

  for (const change of allChanges) {
    // Count severities
    counts[change.severity]++;

    // Map change fields to signal keys
    const signalKey = mapFieldToSignalKey(change.field);
    if (!signalKey) continue;

    // Aggregate into signal
    const existing = signalMap.get(signalKey);
    if (existing) {
      // Aggregate: sum deltas, keep highest severity
      existing.delta += change.delta ?? 0;
      if (SEVERITY_PRIORITY[change.severity] > SEVERITY_PRIORITY[existing.severity]) {
        existing.severity = change.severity;
      }
    } else {
      signalMap.set(signalKey, {
        key: signalKey,
        label: SIGNAL_LABELS[signalKey],
        delta: change.delta ?? 0,
        from: typeof change.from === 'number' ? change.from : undefined,
        to: typeof change.to === 'number' ? change.to : undefined,
        severity: change.severity,
      });
    }
  }

  // Sort signals: by severity (desc), then by absolute delta (desc), then by key (asc)
  const signals = Array.from(signalMap.values()).sort((a, b) => {
    const severityDiff = SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity];
    if (severityDiff !== 0) return severityDiff;

    const deltaDiff = Math.abs(b.delta) - Math.abs(a.delta);
    if (deltaDiff !== 0) return deltaDiff;

    return a.key.localeCompare(b.key);
  });

  return { signals, counts };
}

/**
 * Map a drift change field to a signal key.
 */
function mapFieldToSignalKey(field: string): DriftSignalKey | undefined {
  switch (field) {
    case 'overallStatus':
    case 'ciVerdict':
      return 'status.transition';
    case 'conflictsTotal':
      return 'conflicts.total';
    case 'verifyMismatch':
      return 'verify.mismatches';
    case 'verifyMissing':
      return 'verify.missing';
    case 'deltasTotal':
      return 'deltas.total';
    case 'applyOpsTotal':
    case 'resolutionApplyOpsTotal':
      return 'apply.ops';
    case 'rollbackActions':
      return 'rollback.actions';
    default:
      return undefined;
  }
}

// =============================================================================
// RUN SUMMARY GENERATION
// =============================================================================

/**
 * Generate highlights for a run summary.
 */
function generateHighlights(
  runEntry: RunEntry,
  overallStatus?: string,
  driftSeverity?: DashboardSeverity
): string[] {
  const highlights: string[] = [];

  // Status highlight
  if (overallStatus) {
    highlights.push(`Status: ${overallStatus}`);
  }

  // Drift severity highlight
  if (driftSeverity) {
    highlights.push(`Drift: ${driftSeverity}`);
  }

  // Artifacts highlight
  const artifactCount = Object.keys(runEntry.artifacts).length;
  if (artifactCount > 0) {
    highlights.push(`${artifactCount} artifact${artifactCount > 1 ? 's' : ''}`);
  }

  return highlights;
}

// =============================================================================
// RUN WINDOW SELECTION
// =============================================================================

/**
 * Select runs within a window from the ledger.
 */
function selectRunsInWindow(
  ledger: RunLedgerArtifact,
  limit: number,
  fromRunId?: string,
  toRunId?: string
): RunEntry[] {
  let runs = [...ledger.runs];

  // Apply from/to filters
  if (fromRunId) {
    const fromIndex = runs.findIndex(r => r.runId === fromRunId);
    if (fromIndex !== -1) {
      runs = runs.slice(fromIndex);
    }
  }

  if (toRunId) {
    const toIndex = runs.findIndex(r => r.runId === toRunId);
    if (toIndex !== -1) {
      runs = runs.slice(0, toIndex + 1);
    }
  }

  // Apply limit (take most recent)
  if (runs.length > limit) {
    runs = runs.slice(-limit);
  }

  return runs;
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Compute the drift dashboard artifact for a source file.
 */
export async function computeDashboard(
  context: DashboardContext
): Promise<ComputeDashboardResult> {
  const { sourceFile, repoRoot, limit, fromRunId, toRunId, thresholds, strict } = context;

  // Normalize source path
  const sourceCanonical = normalizeSourcePath(sourceFile, repoRoot);

  // Load run ledger
  const ledgerResult = await loadRunLedger(repoRoot, sourceCanonical);
  if (!ledgerResult.ok) {
    return { ok: false, error: ledgerResult.error };
  }

  const ledger = ledgerResult.ledger;

  // Select runs in window
  const selectedRuns = selectRunsInWindow(ledger, limit, fromRunId, toRunId);

  if (selectedRuns.length === 0) {
    return { ok: false, error: 'No runs found in the specified window' };
  }

  // Load snapshots for all selected runs
  const snapshots = await Promise.all(
    selectedRuns.map(entry => loadRunSnapshot(entry, repoRoot))
  );

  // Compute drift between consecutive runs and aggregate
  const allChanges: DriftChange[] = [];
  const runSummaries: RunSummary[] = [];

  for (let i = 0; i < selectedRuns.length; i++) {
    const entry = selectedRuns[i];
    const snapshot = snapshots[i];

    let driftSeverity: DashboardSeverity | undefined;

    // Compute drift from previous run if available
    if (i > 0) {
      const prevSnapshot = snapshots[i - 1];
      const changes = computeDriftDiff(prevSnapshot, snapshot);
      allChanges.push(...changes);

      // Get highest severity from this diff
      driftSeverity = getHighestSeverity(changes);
    }

    // Generate run summary
    runSummaries.push({
      runId: entry.runId,
      timestamp: entry.timestamp,
      command: entry.command,
      overallStatus: snapshot.overallStatus,
      driftSeverity,
      highlights: generateHighlights(entry, snapshot.overallStatus, driftSeverity),
    });
  }

  // Aggregate drift changes into signals
  const { signals, counts } = aggregateDriftChanges(allChanges);

  // Compute stability score
  const stabilityScore = computeStabilityScore(counts);

  // Compute CI verdict
  const { verdict, explanation } = computeCiVerdict(counts, signals, thresholds);

  // Determine exit code
  const exitCode = (strict && verdict === 'FAIL') ? 1 : 0;

  // Build artifact
  const artifact: DriftDashboardArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    sourceFile: sourceCanonical,
    runWindow: {
      limit,
      fromRunId,
      toRunId,
    },
    counts: {
      runsConsidered: selectedRuns.length,
      bySeverity: counts,
    },
    stabilityScore,
    topSignals: signals.slice(0, 10), // Top 10 signals
    recentRuns: [...runSummaries].reverse(), // Newest first
    ciVerdict: verdict,
    exitCode: exitCode as 0 | 1,
    explanation,
  };

  return { ok: true, artifact };
}
