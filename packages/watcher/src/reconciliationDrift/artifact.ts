/**
 * @aesthetic-function/watcher - reconciliationDrift/artifact.ts
 *
 * Phase 13C: Drift Diffs (Run-to-Run) Artifact Handling.
 *
 * WHY: Writes drift diff artifacts to disk and formats them for CLI output.
 *
 * SCOPE:
 * - Atomic artifact writes (temp + rename)
 * - CLI-friendly string formatting
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 */

import { existsSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import type { DriftDiffArtifact, DriftChange } from './types.js';

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Normalize source file path for artifact naming.
 * Converts: demo-app/src/App.tsx → demo-app__src__App
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
 * Get the drift diff artifact path for a source file.
 */
export function getDriftDiffArtifactPath(sourceFile: string): string {
  const normalized = normalizeSourceFileForArtifact(sourceFile);
  return `design-materializations/${normalized}.figma-drift-diff.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Result of writing a drift diff artifact.
 */
export interface WriteDriftDiffResult {
  written: boolean;
  path: string;
  error?: string;
}

/**
 * Write a drift diff artifact atomically.
 *
 * Uses temp file + rename for atomicity.
 */
export function writeDriftDiffArtifact(
  artifact: DriftDiffArtifact,
  repoRoot: string
): WriteDriftDiffResult {
  const relativePath = getDriftDiffArtifactPath(artifact.sourceFile);
  const fullPath = join(repoRoot, relativePath);

  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first
  const tempPath = join(tmpdir(), `figma-drift-diff-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    const content = JSON.stringify(artifact, null, 2);
    writeFileSync(tempPath, content, 'utf-8');

    // Atomic rename
    renameSync(tempPath, fullPath);

    return { written: true, path: relativePath };
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    const message = err instanceof Error ? err.message : String(err);
    return { written: false, path: relativePath, error: message };
  }
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Severity ordering for presentation (Phase 13C.1).
 * fail → warn → info
 */
const SEVERITY_ORDER: Record<DriftChange['severity'], number> = {
  fail: 0,
  warn: 1,
  info: 2,
};

/**
 * Sort drift changes for deterministic presentation (Phase 13C.1).
 *
 * Order:
 * 1. severity: fail → warn → info
 * 2. field name (alphabetical)
 * 3. from value (stringified)
 * 4. to value (stringified)
 *
 * This is presentation-only sorting; does not modify artifact.changes.
 */
export function sortChangesForPresentation(changes: DriftChange[]): DriftChange[] {
  return [...changes].sort((a, b) => {
    // 1. Severity order
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // 2. Field name
    const fieldDiff = a.field.localeCompare(b.field);
    if (fieldDiff !== 0) return fieldDiff;

    // 3. From value (stringified for comparison)
    const fromA = a.from === null ? '' : String(a.from);
    const fromB = b.from === null ? '' : String(b.from);
    const fromDiff = fromA.localeCompare(fromB);
    if (fromDiff !== 0) return fromDiff;

    // 4. To value (stringified for comparison)
    const toA = a.to === null ? '' : String(a.to);
    const toB = b.to === null ? '' : String(b.to);
    return toA.localeCompare(toB);
  });
}

/**
 * Format a severity indicator for CLI output.
 */
function formatSeverity(severity: DriftChange['severity']): string {
  switch (severity) {
    case 'fail':
      return '[FAIL]';
    case 'warn':
      return '[WARN]';
    case 'info':
      return '[info]';
    default:
      return '[----]';
  }
}

/**
 * Format a drift change for CLI output.
 */
function formatChange(change: DriftChange): string {
  const parts: string[] = [];

  parts.push(formatSeverity(change.severity));
  parts.push(change.field + ':');

  // Format values
  const fromStr = change.from === null ? 'none' : String(change.from);
  const toStr = change.to === null ? 'none' : String(change.to);
  parts.push(`${fromStr} → ${toStr}`);

  // Add delta for numeric changes
  if (change.delta !== undefined) {
    const sign = change.delta >= 0 ? '+' : '';
    parts.push(`(${sign}${change.delta})`);
  }

  return parts.join(' ');
}

/**
 * Format a drift diff artifact for CLI output.
 */
export function formatDriftDiff(
  artifact: DriftDiffArtifact,
  repoRoot: string,
  verbose: boolean = false
): string {
  const lines: string[] = [];

  lines.push('=== FIGMA DRIFT DIFF (Phase 13C) ===');
  lines.push(`Repo Root: ${repoRoot}`);
  lines.push(`Source: ${artifact.sourceFile} (canonical)`);
  lines.push('');

  // Check for insufficient history
  if (artifact.summary.insufficientHistory) {
    lines.push(artifact.summary.message);
    lines.push('');
    lines.push('Runs are recorded when RECONCILIATION_TIMELINE_ON=true');
    lines.push('and any of these commands complete:');
    lines.push('  figma:apply, figma:verify, figma:resolve-apply,');
    lines.push('  figma:rollback-preview, figma:status, figma:index');
    return lines.join('\n');
  }

  // Comparison header
  lines.push(`Comparing: [${artifact.fromRunId}] → [${artifact.toRunId}]`);
  lines.push('');

  // From run info
  lines.push('From:');
  lines.push(`  Run ID: ${artifact.from.runId}`);
  lines.push(`  Timestamp: ${artifact.from.timestamp}`);
  lines.push(`  Command: ${artifact.from.command}`);
  if (artifact.from.overallStatus) {
    lines.push(`  Status: ${artifact.from.overallStatus}`);
  }

  lines.push('');

  // To run info
  lines.push('To:');
  lines.push(`  Run ID: ${artifact.to.runId}`);
  lines.push(`  Timestamp: ${artifact.to.timestamp}`);
  lines.push(`  Command: ${artifact.to.command}`);
  if (artifact.to.overallStatus) {
    lines.push(`  Status: ${artifact.to.overallStatus}`);
  }

  lines.push('');

  // Summary
  lines.push(`Summary: ${artifact.summary.message}`);
  lines.push('');

  // Changes - sorted for deterministic presentation (Phase 13C.1)
  if (artifact.changes.length === 0) {
    lines.push('No changes detected.');
  } else {
    const sortedChanges = sortChangesForPresentation(artifact.changes);
    lines.push(`Changes (${artifact.changes.length}):`);
    for (const change of sortedChanges) {
      lines.push(`  ${formatChange(change)}`);
      if (verbose) {
        lines.push(`    Reason: ${change.reason}`);
      }
    }
  }

  // Verbose mode: show artifact paths
  if (verbose) {
    lines.push('');
    lines.push('Artifact Paths (from):');
    for (const [key, value] of Object.entries(artifact.from.artifactPaths)) {
      if (value) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    lines.push('');
    lines.push('Artifact Paths (to):');
    for (const [key, value] of Object.entries(artifact.to.artifactPaths)) {
      if (value) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a drift diff artifact for verbose CLI output.
 */
export function formatDriftDiffVerbose(
  artifact: DriftDiffArtifact,
  repoRoot: string
): string {
  return formatDriftDiff(artifact, repoRoot, true);
}
