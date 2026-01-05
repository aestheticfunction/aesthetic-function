/**
 * @aesthetic-function/watcher - reconciliationSources/aggregate.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery.
 *
 * WHY: Aggregates per-source reconciliation verdicts into a single overall verdict.
 *
 * SCOPE:
 * - Collect verdicts from matrix job outputs
 * - Reduce to single PASS/WARN/FAIL
 * - Generate aggregated report
 *
 * CONSTRAINTS:
 * - FAIL > WARN > PASS precedence
 * - Include summary counts
 */

import type { SourceResult, AggregatedVerdict, SourceVerdict } from './types.js';

// =============================================================================
// VERDICT AGGREGATION
// =============================================================================

/**
 * Verdict priority for reduction.
 * Higher number = higher priority (takes precedence).
 */
const VERDICT_PRIORITY: Record<SourceVerdict, number> = {
  PASS: 0,
  WARN: 1,
  FAIL: 2,
};

/**
 * Priority to verdict mapping.
 */
const PRIORITY_TO_VERDICT: Record<number, SourceVerdict> = {
  0: 'PASS',
  1: 'WARN',
  2: 'FAIL',
};

/**
 * Aggregate multiple source results into a single verdict.
 *
 * Reduction rules:
 * - Any FAIL → overall FAIL
 * - Any WARN (no FAIL) → overall WARN
 * - All PASS → overall PASS
 *
 * @param results - Per-source reconciliation results
 * @param gitSha - Current git SHA for traceability
 * @returns Aggregated verdict with counts
 */
export function aggregateVerdicts(
  results: SourceResult[],
  gitSha?: string
): AggregatedVerdict {
  if (results.length === 0) {
    return {
      overall: 'PASS',
      counts: {
        pass: 0,
        warn: 0,
        fail: 0,
      },
      totalSources: 0,
      gitSha,
      results: [],
    };
  }

  // Count by verdict
  const counts = {
    pass: 0,
    warn: 0,
    fail: 0,
  };

  let maxPriority = 0;

  for (const result of results) {
    const verdict = result.verdict;
    const priority = VERDICT_PRIORITY[verdict];

    if (priority > maxPriority) {
      maxPriority = priority;
    }

    // Increment count
    if (verdict === 'PASS') counts.pass++;
    else if (verdict === 'WARN') counts.warn++;
    else if (verdict === 'FAIL') counts.fail++;
  }

  return {
    overall: PRIORITY_TO_VERDICT[maxPriority],
    counts,
    totalSources: results.length,
    gitSha,
    results,
  };
}

/**
 * Parse a verdict from string (case-insensitive).
 */
export function parseVerdict(value: string): SourceVerdict | null {
  const upper = value.toUpperCase().trim();
  if (upper === 'PASS' || upper === 'WARN' || upper === 'FAIL') {
    return upper;
  }
  return null;
}

/**
 * Create a source result from minimal data.
 */
export function createSourceResult(
  source: string,
  verdict: SourceVerdict,
  exitCode: number = verdict === 'FAIL' ? 1 : 0,
  bundlePath?: string
): SourceResult {
  return {
    source,
    verdict,
    exitCode,
    bundlePath,
  };
}

/**
 * Generate aggregation summary as human-readable string.
 */
export function formatAggregationSummary(aggregated: AggregatedVerdict): string {
  const { overall, counts, totalSources, gitSha } = aggregated;
  const lines: string[] = [];

  lines.push(`Reconciliation Summary`);
  lines.push(`======================`);
  lines.push(``);
  lines.push(`Overall: ${overall}`);
  lines.push(`Total Sources: ${totalSources}`);
  lines.push(``);
  lines.push(`Breakdown:`);
  lines.push(`  PASS: ${counts.pass}`);
  lines.push(`  WARN: ${counts.warn}`);
  lines.push(`  FAIL: ${counts.fail}`);

  if (gitSha) {
    lines.push(``);
    lines.push(`Git SHA: ${gitSha}`);
  }

  return lines.join('\n');
}

/**
 * Generate aggregation as JSON.
 */
export function formatAggregationJson(aggregated: AggregatedVerdict): string {
  return JSON.stringify(aggregated, null, 2);
}

/**
 * Determine exit code from verdict.
 */
export function verdictToExitCode(verdict: SourceVerdict): number {
  switch (verdict) {
    case 'PASS':
      return 0;
    case 'WARN':
      return 0; // Warnings don't fail CI by default
    case 'FAIL':
      return 1;
    default:
      return 1;
  }
}
