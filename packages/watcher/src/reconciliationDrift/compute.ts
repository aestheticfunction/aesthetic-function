/**
 * @aesthetic-function/watcher - reconciliationDrift/compute.ts
 *
 * Phase 13C: Drift Diffs (Run-to-Run) Computation.
 *
 * WHY: Compares two reconciliation runs for the same source file
 * and summarizes what changed between them (status, counts, metrics).
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

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getRepoRoot,
  normalizeSourcePath,
} from '../reconciliationStatus/compute.js';

import {
  getRunLedgerPath,
} from '../reconciliationTimeline/compute.js';

import type { RunLedgerArtifact, RunEntry } from '../reconciliationTimeline/types.js';

import type {
  DriftDiffArtifact,
  DriftDiffContext,
  DriftDiffSummary,
  DriftChange,
  DriftSeverity,
  RunSnapshot,
  LoadLedgerResult,
  SelectRunsResult,
  RunSelectionExplanation,
} from './types.js';

// Re-export utilities for external use
export { getRepoRoot, normalizeSourcePath };

// =============================================================================
// LEDGER LOADING
// =============================================================================

/**
 * Load a run ledger for a source file.
 *
 * Returns a result object instead of throwing for CLI-friendly error handling.
 */
export async function loadRunLedger(
  repoRoot: string,
  sourceCanonical: string
): Promise<LoadLedgerResult> {
  const ledgerPath = getRunLedgerPath(sourceCanonical);
  const fullPath = join(repoRoot, ledgerPath);

  if (!existsSync(fullPath)) {
    return {
      ok: false,
      error: `No run ledger found at: ${ledgerPath}`,
    };
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const ledger = JSON.parse(content) as RunLedgerArtifact;
    return { ok: true, ledger };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to parse run ledger: ${message}`,
    };
  }
}

// =============================================================================
// RUN SELECTION
// =============================================================================

/**
 * Select two runs for comparison from a ledger.
 *
 * Default: latest run vs previous run.
 * Explicit: use --from and/or --to run IDs.
 *
 * Returns explanation of how runs were selected (Phase 13C.1).
 */
export function selectRuns(
  ledger: RunLedgerArtifact,
  fromRunId?: string,
  toRunId?: string
): SelectRunsResult {
  const runs = ledger.runs;

  // Need at least 2 runs for comparison
  if (runs.length < 2) {
    return {
      ok: false,
      insufficientHistory: true,
      availableRuns: runs.length,
    };
  }

  // Default: latest (to) vs previous (from)
  let fromEntry: RunEntry;
  let toEntry: RunEntry;
  let explanation: RunSelectionExplanation;

  if (fromRunId && toRunId) {
    // Both specified
    const fromMatch = runs.find(r => r.runId === fromRunId);
    const toMatch = runs.find(r => r.runId === toRunId);

    if (!fromMatch) {
      return {
        ok: false,
        insufficientHistory: false,
        error: `Unknown run ID for --from: ${fromRunId}`,
      };
    }
    if (!toMatch) {
      return {
        ok: false,
        insufficientHistory: false,
        error: `Unknown run ID for --to: ${toRunId}`,
      };
    }

    fromEntry = fromMatch;
    toEntry = toMatch;
    explanation = {
      fromMethod: 'explicit',
      fromReason: `Explicitly specified via --from ${fromRunId}`,
      toMethod: 'explicit',
      toReason: `Explicitly specified via --to ${toRunId}`,
      explicitFrom: true,
      explicitTo: true,
    };
  } else if (fromRunId) {
    // Only from specified, to defaults to latest
    const fromMatch = runs.find(r => r.runId === fromRunId);
    if (!fromMatch) {
      return {
        ok: false,
        insufficientHistory: false,
        error: `Unknown run ID for --from: ${fromRunId}`,
      };
    }

    fromEntry = fromMatch;
    toEntry = runs[runs.length - 1];
    explanation = {
      fromMethod: 'explicit',
      fromReason: `Explicitly specified via --from ${fromRunId}`,
      toMethod: 'latest',
      toReason: `Auto-selected as latest run (most recent in ledger)`,
      explicitFrom: true,
      explicitTo: false,
    };
  } else if (toRunId) {
    // Only to specified, from defaults to previous
    const toIndex = runs.findIndex(r => r.runId === toRunId);
    if (toIndex === -1) {
      return {
        ok: false,
        insufficientHistory: false,
        error: `Unknown run ID for --to: ${toRunId}`,
      };
    }
    if (toIndex === 0) {
      return {
        ok: false,
        insufficientHistory: true,
        availableRuns: 1,
      };
    }

    fromEntry = runs[toIndex - 1];
    toEntry = runs[toIndex];
    explanation = {
      fromMethod: 'relative-to-explicit',
      fromReason: `Auto-selected as run immediately before --to (index ${toIndex - 1})`,
      toMethod: 'explicit',
      toReason: `Explicitly specified via --to ${toRunId}`,
      explicitFrom: false,
      explicitTo: true,
    };
  } else {
    // Default: latest vs previous
    fromEntry = runs[runs.length - 2];
    toEntry = runs[runs.length - 1];
    explanation = {
      fromMethod: 'previous',
      fromReason: `Auto-selected as second-to-last run (default comparison baseline)`,
      toMethod: 'latest',
      toReason: `Auto-selected as latest run (most recent in ledger)`,
      explicitFrom: false,
      explicitTo: false,
    };
  }

  return { ok: true, fromEntry, toEntry, explanation };
}

// =============================================================================
// ARTIFACT LOADING
// =============================================================================

/**
 * Try to load and parse a JSON artifact from disk.
 */
async function loadArtifact<T>(fullPath: string): Promise<T | undefined> {
  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

/**
 * Status artifact structure (minimal subset needed).
 */
interface StatusArtifact {
  overallStatus?: string;
  ciVerdict?: string;
  exitCode?: number;
}

/**
 * Verification artifact structure (minimal subset needed).
 */
interface VerificationArtifact {
  summary?: {
    total?: number;
    verified?: number;
    mismatch?: number;
    missing?: number;
  };
}

/**
 * Resolution apply artifact structure (minimal subset needed).
 */
interface ResolutionApplyArtifact {
  summary?: {
    total?: number;
    ops?: number;
    applied?: number;
    dryRun?: boolean;
  };
}

/**
 * Rollback preview artifact structure (minimal subset needed).
 */
interface RollbackPreviewArtifact {
  summary?: {
    total?: number;
    actions?: number;
  };
}

/**
 * Delta artifact structure (minimal subset needed).
 */
interface DeltaArtifact {
  deltas?: unknown[];
  summary?: {
    total?: number;
    deltas?: number;
  };
}

/**
 * Conflicts artifact structure (minimal subset needed).
 */
interface ConflictsArtifact {
  conflicts?: unknown[];
  summary?: {
    total?: number;
    conflicts?: number;
  };
}

/**
 * Resolution plan artifact structure (minimal subset needed).
 */
interface ResolutionPlanArtifact {
  decisions?: unknown[];
  summary?: {
    total?: number;
    decisions?: number;
  };
}

/**
 * Load a run snapshot from a run entry and its referenced artifacts.
 */
export async function loadRunSnapshot(
  runEntry: RunEntry,
  repoRoot: string
): Promise<RunSnapshot> {
  const snapshot: RunSnapshot = {
    runId: runEntry.runId,
    timestamp: runEntry.timestamp,
    command: runEntry.command,
    metrics: {},
    artifactPaths: {},
  };

  // Load status artifact if referenced
  const statusPath = runEntry.artifacts.status;
  if (statusPath) {
    snapshot.artifactPaths.status = statusPath;
    const status = await loadArtifact<StatusArtifact>(join(repoRoot, statusPath));
    if (status) {
      snapshot.overallStatus = status.overallStatus;
      snapshot.ciVerdict = status.ciVerdict;
      snapshot.exitCode = status.exitCode;
    }
  }

  // Load verification artifact if referenced
  const verifyPath = runEntry.artifacts.verification;
  if (verifyPath) {
    snapshot.artifactPaths.verify = verifyPath;
    const verify = await loadArtifact<VerificationArtifact>(join(repoRoot, verifyPath));
    if (verify?.summary) {
      snapshot.metrics.verifyTotal = verify.summary.verified ?? verify.summary.total;
      snapshot.metrics.verifyMismatch = verify.summary.mismatch;
      snapshot.metrics.verifyMissing = verify.summary.missing;
    }
  }

  // Load resolution apply artifact if referenced
  const applyPath = runEntry.artifacts.resolutionApply;
  if (applyPath) {
    snapshot.artifactPaths.apply = applyPath;
    const apply = await loadArtifact<ResolutionApplyArtifact>(join(repoRoot, applyPath));
    if (apply?.summary) {
      snapshot.metrics.applyOpsTotal = apply.summary.ops ?? apply.summary.applied ?? apply.summary.total;
      snapshot.metrics.applyDryRun = apply.summary.dryRun;
      snapshot.metrics.resolutionApplyOpsTotal = apply.summary.applied;
    }
  }

  // Load rollback preview artifact if referenced
  const rollbackPath = runEntry.artifacts.rollbackPreview;
  if (rollbackPath) {
    snapshot.artifactPaths.rollbackPreview = rollbackPath;
    const rollback = await loadArtifact<RollbackPreviewArtifact>(join(repoRoot, rollbackPath));
    if (rollback?.summary) {
      snapshot.metrics.rollbackActions = rollback.summary.actions ?? rollback.summary.total;
    }
  }

  // Load run index artifact if referenced
  const indexPath = runEntry.artifacts.runIndex;
  if (indexPath) {
    snapshot.artifactPaths.runIndex = indexPath;
  }

  // Load delta artifact if referenced
  const deltaPath = runEntry.artifacts.delta;
  if (deltaPath) {
    const delta = await loadArtifact<DeltaArtifact>(join(repoRoot, deltaPath));
    if (delta) {
      snapshot.metrics.deltasTotal = delta.deltas?.length ?? delta.summary?.deltas ?? delta.summary?.total;
    }
  }

  // Load conflicts artifact if referenced
  const conflictsPath = runEntry.artifacts.conflicts;
  if (conflictsPath) {
    const conflicts = await loadArtifact<ConflictsArtifact>(join(repoRoot, conflictsPath));
    if (conflicts) {
      snapshot.metrics.conflictsTotal = conflicts.conflicts?.length ?? conflicts.summary?.conflicts ?? conflicts.summary?.total;
    }
  }

  // Load resolution plan artifact if referenced
  const planPath = runEntry.artifacts.resolutionPlan;
  if (planPath) {
    const plan = await loadArtifact<ResolutionPlanArtifact>(join(repoRoot, planPath));
    if (plan) {
      snapshot.metrics.resolutionDecisionsTotal = plan.decisions?.length ?? plan.summary?.decisions ?? plan.summary?.total;
    }
  }

  return snapshot;
}

// =============================================================================
// SEVERITY RULES
// =============================================================================

/**
 * Status severity levels (lower is better).
 * CLEAN and VERIFIED_OK are both "good" states (level 0-1).
 * APPLIED_UNVERIFIED is "warning" (level 2).
 * VERIFY_FAILED and worse are "fail" (level 3+).
 */
const STATUS_LEVELS: Record<string, number> = {
  CLEAN: 0,
  VERIFIED_OK: 1,
  APPLIED_UNVERIFIED: 2,
  VERIFY_FAILED: 3,
  ROLLBACK_AVAILABLE: 4,
  INCOMPLETE: 5,
};

/**
 * Compute severity for a status change.
 *
 * Severity rules:
 * - CLEAN ↔ VERIFIED_OK: info (both are good states)
 * - Any → VERIFY_FAILED or worse: fail
 * - Any → APPLIED_UNVERIFIED: warn (needs attention)
 * - Status improving (level decreasing): info
 */
function computeStatusSeverity(from: string | undefined, to: string | undefined): DriftSeverity {
  const fromLevel = from ? (STATUS_LEVELS[from] ?? 5) : 0;
  const toLevel = to ? (STATUS_LEVELS[to] ?? 5) : 0;

  // Both are "good" states (CLEAN or VERIFIED_OK)
  if (fromLevel <= 1 && toLevel <= 1) {
    return 'info';
  }

  if (toLevel > fromLevel) {
    // Status worsened
    if (toLevel >= 3) {
      return 'fail'; // VERIFY_FAILED or worse
    }
    return 'warn'; // APPLIED_UNVERIFIED
  }

  return 'info'; // Status improved or unchanged (but values differ)
}

/**
 * Compute severity for a numeric metric change.
 */
function computeMetricSeverity(
  field: string,
  from: number | undefined,
  to: number | undefined
): DriftSeverity {
  const fromVal = from ?? 0;
  const toVal = to ?? 0;
  const delta = toVal - fromVal;

  // Fail-severity fields (any increase is bad)
  if (field === 'verifyMismatch' || field === 'verifyMissing') {
    if (delta > 0) {
      return 'fail';
    }
    if (delta < 0) {
      return 'info'; // Improved
    }
    return 'info';
  }

  // Warn-severity fields (increases are concerning)
  if (field === 'conflictsTotal' || field === 'deltasTotal') {
    if (delta > 0) {
      return 'warn';
    }
    return 'info';
  }

  // Info-severity fields (neutral changes)
  return 'info';
}

/**
 * Generate a reason string for a change.
 */
function generateReason(
  field: string,
  from: string | number | boolean | null,
  to: string | number | boolean | null,
  severity: DriftSeverity
): string {
  // Status changes
  if (field === 'overallStatus') {
    if (severity === 'fail') {
      return `Status worsened from ${from ?? 'none'} to ${to}`;
    }
    if (severity === 'warn') {
      return `Status changed from ${from ?? 'none'} to ${to}`;
    }
    return `Status changed from ${from ?? 'none'} to ${to}`;
  }

  // Verification failures
  if (field === 'verifyMismatch' || field === 'verifyMissing') {
    const delta = (to as number) - (from as number || 0);
    if (delta > 0) {
      return `Verification ${field === 'verifyMismatch' ? 'mismatches' : 'missing'} increased by ${delta}`;
    }
    if (delta < 0) {
      return `Verification ${field === 'verifyMismatch' ? 'mismatches' : 'missing'} decreased by ${Math.abs(delta)}`;
    }
    return `Verification ${field === 'verifyMismatch' ? 'mismatches' : 'missing'} changed`;
  }

  // Dry-run toggle
  if (field === 'applyDryRun') {
    if (from === true && to === false) {
      return 'Apply mode changed from dry-run to live';
    }
    if (from === false && to === true) {
      return 'Apply mode changed from live to dry-run';
    }
    return 'Apply dry-run mode changed';
  }

  // Generic numeric changes
  if (typeof from === 'number' || typeof to === 'number') {
    const delta = (to as number || 0) - (from as number || 0);
    if (delta > 0) {
      return `${field} increased by ${delta}`;
    }
    if (delta < 0) {
      return `${field} decreased by ${Math.abs(delta)}`;
    }
    return `${field} changed`;
  }

  return `${field} changed from ${from ?? 'none'} to ${to ?? 'none'}`;
}

// =============================================================================
// DRIFT DIFF COMPUTATION
// =============================================================================

/**
 * Fixed field order for deterministic comparison.
 */
const COMPARISON_FIELDS = [
  'overallStatus',
  'ciVerdict',
  'exitCode',
  'applyOpsTotal',
  'applyDryRun',
  'verifyTotal',
  'verifyMismatch',
  'verifyMissing',
  'rollbackActions',
  'deltasTotal',
  'conflictsTotal',
  'resolutionDecisionsTotal',
  'resolutionApplyOpsTotal',
] as const;

/**
 * Get a value from a snapshot by field name.
 */
function getSnapshotValue(
  snapshot: RunSnapshot,
  field: string
): string | number | boolean | undefined {
  switch (field) {
    case 'overallStatus':
      return snapshot.overallStatus;
    case 'ciVerdict':
      return snapshot.ciVerdict;
    case 'exitCode':
      return snapshot.exitCode;
    case 'applyOpsTotal':
      return snapshot.metrics.applyOpsTotal;
    case 'applyDryRun':
      return snapshot.metrics.applyDryRun;
    case 'verifyTotal':
      return snapshot.metrics.verifyTotal;
    case 'verifyMismatch':
      return snapshot.metrics.verifyMismatch;
    case 'verifyMissing':
      return snapshot.metrics.verifyMissing;
    case 'rollbackActions':
      return snapshot.metrics.rollbackActions;
    case 'deltasTotal':
      return snapshot.metrics.deltasTotal;
    case 'conflictsTotal':
      return snapshot.metrics.conflictsTotal;
    case 'resolutionDecisionsTotal':
      return snapshot.metrics.resolutionDecisionsTotal;
    case 'resolutionApplyOpsTotal':
      return snapshot.metrics.resolutionApplyOpsTotal;
    default:
      return undefined;
  }
}

/**
 * Compute drift diff between two run snapshots.
 */
export function computeDriftDiff(
  fromSnapshot: RunSnapshot,
  toSnapshot: RunSnapshot
): DriftChange[] {
  const changes: DriftChange[] = [];

  for (const field of COMPARISON_FIELDS) {
    const fromVal = getSnapshotValue(fromSnapshot, field);
    const toVal = getSnapshotValue(toSnapshot, field);

    // Skip if both are undefined/null
    if (fromVal === undefined && toVal === undefined) {
      continue;
    }

    // Skip if values are identical
    if (fromVal === toVal) {
      continue;
    }

    // Compute severity
    let severity: DriftSeverity;
    if (field === 'overallStatus') {
      severity = computeStatusSeverity(fromVal as string | undefined, toVal as string | undefined);
    } else if (field === 'applyDryRun') {
      severity = 'info';
    } else if (typeof fromVal === 'number' || typeof toVal === 'number') {
      severity = computeMetricSeverity(field, fromVal as number | undefined, toVal as number | undefined);
    } else {
      severity = 'info';
    }

    // Compute delta for numeric fields
    let delta: number | undefined;
    if (typeof fromVal === 'number' && typeof toVal === 'number') {
      delta = toVal - fromVal;
    } else if (typeof fromVal === 'number' && toVal === undefined) {
      delta = -(fromVal);
    } else if (fromVal === undefined && typeof toVal === 'number') {
      delta = toVal;
    }

    const change: DriftChange = {
      field,
      from: fromVal ?? null,
      to: toVal ?? null,
      severity,
      reason: generateReason(field, fromVal ?? null, toVal ?? null, severity),
    };

    if (delta !== undefined && delta !== 0) {
      change.delta = delta;
    }

    changes.push(change);
  }

  return changes;
}

// =============================================================================
// FULL DIFF ARTIFACT GENERATION
// =============================================================================

/**
 * Compute the full drift diff artifact.
 */
export async function computeDriftDiffArtifact(
  context: DriftDiffContext
): Promise<DriftDiffArtifact | { error: string } | { insufficientHistory: true; availableRuns: number }> {
  const { sourceFile, repoRoot, fromRunId, toRunId } = context;

  // Normalize source path
  const sourceCanonical = normalizeSourcePath(sourceFile, repoRoot);

  // Load run ledger
  const ledgerResult = await loadRunLedger(repoRoot, sourceCanonical);
  if (!ledgerResult.ok) {
    return { error: ledgerResult.error };
  }

  // Select runs for comparison
  const selectResult = selectRuns(ledgerResult.ledger, fromRunId, toRunId);
  if (!selectResult.ok) {
    if (selectResult.insufficientHistory) {
      return { insufficientHistory: true, availableRuns: selectResult.availableRuns };
    }
    return { error: selectResult.error };
  }

  const { fromEntry, toEntry } = selectResult;

  // Load snapshots
  const [fromSnapshot, toSnapshot] = await Promise.all([
    loadRunSnapshot(fromEntry, repoRoot),
    loadRunSnapshot(toEntry, repoRoot),
  ]);

  // Compute diff
  const changes = computeDriftDiff(fromSnapshot, toSnapshot);

  // Compute summary
  const infoCount = changes.filter(c => c.severity === 'info').length;
  const warnCount = changes.filter(c => c.severity === 'warn').length;
  const failCount = changes.filter(c => c.severity === 'fail').length;

  let message: string;
  if (changes.length === 0) {
    message = 'No changes detected between runs';
  } else if (failCount > 0) {
    message = `${failCount} regression(s), ${warnCount} warning(s), ${infoCount} info change(s)`;
  } else if (warnCount > 0) {
    message = `${warnCount} warning(s), ${infoCount} info change(s)`;
  } else {
    message = `${infoCount} info change(s)`;
  }

  const summary: DriftDiffSummary = {
    totalChanges: changes.length,
    infoCount,
    warnCount,
    failCount,
    insufficientHistory: false,
    message,
  };

  // Build artifact
  const artifact: DriftDiffArtifact = {
    version: '1.0',
    sourceFile: sourceCanonical,
    fromRunId: fromSnapshot.runId,
    toRunId: toSnapshot.runId,
    generatedAt: new Date().toISOString(),
    summary,
    changes,
    from: fromSnapshot,
    to: toSnapshot,
  };

  return artifact;
}

/**
 * Create a minimal artifact for insufficient history case.
 */
export function createInsufficientHistoryArtifact(
  sourceFile: string,
  availableRuns: number
): DriftDiffArtifact {
  return {
    version: '1.0',
    sourceFile,
    fromRunId: '',
    toRunId: '',
    generatedAt: new Date().toISOString(),
    summary: {
      totalChanges: 0,
      infoCount: 0,
      warnCount: 0,
      failCount: 0,
      insufficientHistory: true,
      message: availableRuns === 0
        ? 'No runs recorded yet'
        : `Only ${availableRuns} run(s) recorded; need at least 2 for comparison`,
    },
    changes: [],
    from: {
      runId: '',
      timestamp: '',
      command: '',
      metrics: {},
      artifactPaths: {},
    },
    to: {
      runId: '',
      timestamp: '',
      command: '',
      metrics: {},
      artifactPaths: {},
    },
  };
}
