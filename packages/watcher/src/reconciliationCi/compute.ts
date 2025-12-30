/**
 * @aesthetic-function/watcher - reconciliationCi/compute.ts
 *
 * Phase 13F: CI Gate Computation.
 *
 * WHY: Computes a CI-focused pass/warn/fail decision from Phase 13E
 * project dashboard data, with a small trend window derived from
 * Phase 13B ledgers.
 *
 * SCOPE:
 * - Read-only gate computation
 * - Reuses Phase 13E project dashboard
 * - Trend window from Phase 13B ledgers
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import {
  computeProjectDashboard,
  getRepoRoot,
  normalizeSourcePath,
  discoverSourceFiles,
  normalizeScanRoot,
} from '../reconciliationProjectDashboard/compute.js';

import { getRecentRuns } from '../reconciliationTimeline/compute.js';

import type { RunEntry } from '../reconciliationTimeline/types.js';

import type {
  CiGateArtifact,
  CiGateContext,
  ComputeCiGateResult,
  FileTrend,
  TrendDirection,
  TrendSummary,
} from './types.js';

// Re-export utilities for external use
export { getRepoRoot, normalizeSourcePath, normalizeScanRoot };

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default trend window size (number of recent runs per file).
 */
export const DEFAULT_TREND_WINDOW = 5;

/**
 * Threshold for considering a score change as "improving" or "worsening".
 * A delta >= +5 is improving, <= -5 is worsening, otherwise stable.
 */
const TREND_THRESHOLD = 5;

// =============================================================================
// CONFIG HELPERS
// =============================================================================

/**
 * Get CI strict mode from environment.
 */
export function isCiStrictMode(): boolean {
  const value = process.env.RECONCILIATION_CI_STRICT;
  return value === 'true' || value === '1';
}

/**
 * Get trend window size from environment.
 */
export function getCiWindowSize(): number {
  const value = process.env.RECONCILIATION_CI_WINDOW;
  if (!value) return DEFAULT_TREND_WINDOW;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_TREND_WINDOW;

  return parsed;
}

// =============================================================================
// TREND COMPUTATION
// =============================================================================

/**
 * Extract stability score from a run entry if available.
 *
 * This looks at the run summary to try to infer stability.
 * For simplicity, we use a heuristic: if there are verify failures
 * or conflicts, stability is lower.
 */
function computeScoreFromRun(run: RunEntry): number {
  // Start at 100
  let score = 100;

  // Deduct for failures
  if (run.summary.verifyFailures) {
    score -= run.summary.verifyFailures * 10;
  }
  if (run.summary.conflicts) {
    score -= run.summary.conflicts * 5;
  }
  if (run.summary.rollbackActions) {
    score -= run.summary.rollbackActions * 5;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine trend direction from score delta.
 */
function determineTrendDirection(scoreDelta: number): TrendDirection {
  if (scoreDelta >= TREND_THRESHOLD) {
    return 'improving';
  }
  if (scoreDelta <= -TREND_THRESHOLD) {
    return 'worsening';
  }
  return 'stable';
}

/**
 * Compute trend for a single file based on recent runs.
 */
async function computeFileTrend(
  sourceFile: string,
  repoRoot: string,
  windowSize: number
): Promise<FileTrend> {
  // Get recent runs (newest first)
  const recentRuns = await getRecentRuns(
    { sourceFile, repoRoot },
    windowSize
  );

  if (recentRuns.length < 2) {
    // Not enough data for trend
    return {
      sourceFile,
      runsInWindow: recentRuns.length,
      direction: 'stable',
    };
  }

  // Compute scores for oldest and newest in window
  // recentRuns is newest first, so:
  // - newest = recentRuns[0]
  // - oldest = recentRuns[recentRuns.length - 1]
  const newestRun = recentRuns[0];
  const oldestRun = recentRuns[recentRuns.length - 1];

  const endScore = computeScoreFromRun(newestRun);
  const startScore = computeScoreFromRun(oldestRun);
  const scoreDelta = endScore - startScore;

  return {
    sourceFile,
    runsInWindow: recentRuns.length,
    direction: determineTrendDirection(scoreDelta),
    startScore,
    endScore,
    scoreDelta,
  };
}

/**
 * Compute trend summary across all files.
 */
async function computeTrendSummary(
  sourceFiles: string[],
  repoRoot: string,
  windowSize: number
): Promise<TrendSummary> {
  const fileTrends: FileTrend[] = [];
  let improving = 0;
  let stable = 0;
  let worsening = 0;
  let insufficientData = 0;

  for (const sourceFile of sourceFiles) {
    const trend = await computeFileTrend(sourceFile, repoRoot, windowSize);
    fileTrends.push(trend);

    if (trend.runsInWindow < 2) {
      insufficientData++;
    } else {
      switch (trend.direction) {
        case 'improving':
          improving++;
          break;
        case 'worsening':
          worsening++;
          break;
        case 'stable':
          stable++;
          break;
      }
    }
  }

  // Sort file trends by sourceFile for deterministic output
  fileTrends.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));

  return {
    improving,
    stable,
    worsening,
    insufficientData,
    files: fileTrends,
    windowSize,
  };
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Compute the CI gate artifact.
 */
export async function computeCiGate(
  context: CiGateContext
): Promise<ComputeCiGateResult> {
  const { scanRoot, repoRoot, limit, window: windowSize, strict } = context;

  // Normalize scan root
  const normalizedScanRoot = normalizeScanRoot(scanRoot, repoRoot);

  // First, compute the project dashboard (Phase 13E)
  const dashboardResult = await computeProjectDashboard({
    scanRoot: normalizedScanRoot,
    repoRoot,
    limit,
    thresholds: {
      failOnFailSeverity: true,
      maxFailCount: 1,
      maxWarnCount: undefined,
      maxVerifyMismatchIncrease: undefined,
      maxConflictIncrease: undefined,
      maxDeltaIncrease: undefined,
    },
    strict,
  });

  if (!dashboardResult.ok) {
    return {
      ok: false,
      error: dashboardResult.error,
    };
  }

  const dashboard = dashboardResult.artifact;

  // Discover source files for trend computation
  const sourceFiles = discoverSourceFiles(normalizedScanRoot, repoRoot);

  // Compute trend summary
  const trend = await computeTrendSummary(sourceFiles, repoRoot, windowSize);

  // Determine exit code
  const exitCode = strict && dashboard.projectVerdict === 'FAIL' ? 1 : 0;

  // Build CI gate artifact
  const artifact: CiGateArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    scanRoot: normalizedScanRoot,
    filePattern: dashboard.filePattern,
    counts: dashboard.counts,
    stabilityScore: dashboard.stabilityScore,
    trend,
    topSignals: dashboard.topSignals,
    files: dashboard.files,
    verdict: dashboard.projectVerdict,
    exitCode: exitCode as 0 | 1,
    explanation: dashboard.explanation,
  };

  return { ok: true, artifact };
}
