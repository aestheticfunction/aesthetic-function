/**
 * @aesthetic-function/watcher - reconciliationTimeline/artifact.ts
 *
 * Phase 13B: Design Drift Timeline - Artifact Writing & Formatting.
 *
 * WHY: Writes the run ledger artifact to design-materializations/ and
 * formats output for human-readable CLI consumption.
 *
 * SCOPE:
 * - Write ledger artifacts (append-only)
 * - Format timeline for human readability
 *
 * CONSTRAINTS:
 * - Append-only (never rewrite existing entries)
 * - Deterministic output format
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  RunEntry,
  RunLedgerArtifact,
} from './types.js';
import { getRunLedgerPath } from './compute.js';

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write run ledger artifact to disk.
 */
export async function writeRunLedger(
  ledger: RunLedgerArtifact,
  repoRoot: string
): Promise<{ written: boolean; path: string }> {
  const ledgerPath = getRunLedgerPath(ledger.sourceFile);
  const fullPath = join(repoRoot, ledgerPath);

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write artifact with pretty formatting
  await writeFile(fullPath, JSON.stringify(ledger, null, 2), 'utf-8');

  return { written: true, path: ledgerPath };
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a timestamp for display.
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a run summary for display.
 */
function formatSummary(entry: RunEntry): string {
  const parts: string[] = [];

  if (entry.summary.deltas !== undefined) {
    parts.push(`${entry.summary.deltas} delta${entry.summary.deltas !== 1 ? 's' : ''}`);
  }
  if (entry.summary.conflicts !== undefined) {
    parts.push(`${entry.summary.conflicts} conflict${entry.summary.conflicts !== 1 ? 's' : ''}`);
  }
  if (entry.summary.decisions !== undefined) {
    parts.push(`${entry.summary.decisions} decision${entry.summary.decisions !== 1 ? 's' : ''}`);
  }
  if (entry.summary.appliedOps !== undefined) {
    parts.push(`${entry.summary.appliedOps} applied`);
  }
  if (entry.summary.verifyFailures !== undefined && entry.summary.verifyFailures > 0) {
    parts.push(`${entry.summary.verifyFailures} failure${entry.summary.verifyFailures !== 1 ? 's' : ''}`);
  }
  if (entry.summary.rollbackActions !== undefined) {
    parts.push(`${entry.summary.rollbackActions} rollback`);
  }

  return parts.length > 0 ? parts.join(', ') : '(no summary)';
}

/**
 * Format artifact count for display.
 */
function formatArtifactCount(entry: RunEntry): string {
  const count = Object.values(entry.artifacts).filter((v) => v !== undefined).length;
  return `${count} artifact${count !== 1 ? 's' : ''}`;
}

/**
 * Format a single run entry for table display.
 */
function formatRunEntry(entry: RunEntry, index: number): string {
  const lines: string[] = [];
  const timestamp = formatTimestamp(entry.timestamp);
  const summary = formatSummary(entry);
  const artifactCount = formatArtifactCount(entry);

  lines.push(`  ${index + 1}. [${entry.runId}] ${timestamp}`);
  lines.push(`     Command: ${entry.command}${entry.mode ? ` (${entry.mode})` : ''}`);
  lines.push(`     Summary: ${summary}`);
  lines.push(`     Artifacts: ${artifactCount}`);

  return lines.join('\n');
}

/**
 * Format timeline for human-readable CLI output.
 *
 * @param runs - Run entries to display (newest first)
 * @param sourceFile - Canonical source file path
 * @param repoRoot - Repository root path
 * @param limit - Max runs to display
 * @param showReadOnlyMessage - Whether to show the "read-only mode" message when no runs
 */
export function formatTimeline(
  runs: RunEntry[],
  sourceFile: string,
  repoRoot: string,
  limit: number,
  showReadOnlyMessage: boolean = true
): string {
  const lines: string[] = [];

  // Header
  lines.push('=== FIGMA RUN TIMELINE (Phase 13B) ===');
  lines.push(`Repo Root: ${repoRoot}`);
  lines.push(`Source: ${sourceFile} (canonical)`);
  lines.push('');

  if (runs.length === 0) {
    lines.push('No runs recorded yet.');
    lines.push('');
    if (showReadOnlyMessage) {
      lines.push('ℹ️  Read-only mode (use --record to append a run)');
      lines.push('');
      lines.push('Runs are recorded only when:');
      lines.push('  • RECONCILIATION_TIMELINE_ON=true');
      lines.push('  • figma:timeline is invoked with --record');
    }
  } else {
    const displayed = runs.slice(0, limit);
    const total = runs.length;

    lines.push(`Runs (newest first, showing ${displayed.length} of ${total}):`);
    lines.push('');

    for (let i = 0; i < displayed.length; i++) {
      lines.push(formatRunEntry(displayed[i], i));
      if (i < displayed.length - 1) {
        lines.push('');
      }
    }

    if (total > limit) {
      lines.push('');
      lines.push(`... ${total - limit} more run(s) not shown. Use --limit to see more.`);
    }
  }

  return lines.join('\n');
}

/**
 * Format timeline for verbose output with discovery info.
 */
export function formatTimelineVerbose(
  runs: RunEntry[],
  sourceFile: string,
  repoRoot: string,
  ledgerPath: string | undefined,
  limit: number,
  showReadOnlyMessage: boolean = true
): string {
  const lines: string[] = [];

  // Discovery info
  lines.push('Timeline Discovery:');
  lines.push(`  Repo Root: ${repoRoot}`);
  lines.push(`  Source File (canonical): ${sourceFile}`);
  lines.push(`  Ledger Path: ${ledgerPath ?? '(not found)'}`);
  lines.push(`  Feature Flag: RECONCILIATION_TIMELINE_ON=${process.env.RECONCILIATION_TIMELINE_ON ?? 'undefined'}`);
  lines.push('');

  // Then regular timeline
  lines.push(formatTimeline(runs, sourceFile, repoRoot, limit, showReadOnlyMessage));

  return lines.join('\n');
}
