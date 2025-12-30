/**
 * @aesthetic-function/watcher - reconciliationDashboard/artifact.ts
 *
 * Phase 13D: Drift Summary Dashboard Artifact Handling.
 *
 * WHY: Writes dashboard artifacts to disk and formats them for CLI output.
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

import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import type {
  CiVerdict,
  DashboardSeverity,
  DriftDashboardArtifact,
  DriftSignal,
  RunSummary,
} from './types.js';

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
 * Get the dashboard artifact path for a source file.
 */
export function getDashboardArtifactPath(sourceFile: string): string {
  const normalized = normalizeSourceFileForArtifact(sourceFile);
  return `design-materializations/${normalized}.figma-drift-dashboard.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Result of writing a dashboard artifact.
 */
export interface WriteDashboardResult {
  written: boolean;
  path: string;
  error?: string;
}

/**
 * Write a dashboard artifact atomically.
 *
 * Uses temp file + rename for atomicity.
 */
export function writeDashboardArtifact(
  artifact: DriftDashboardArtifact,
  repoRoot: string
): WriteDashboardResult {
  const relativePath = getDashboardArtifactPath(artifact.sourceFile);
  const fullPath = join(repoRoot, relativePath);

  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first
  const tempPath = join(
    tmpdir(),
    `figma-drift-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

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
 * Format a severity indicator for CLI output.
 */
function formatSeverity(severity: DashboardSeverity): string {
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
 * Format a CI verdict indicator for CLI output.
 */
function formatVerdict(verdict: CiVerdict): string {
  switch (verdict) {
    case 'PASS':
      return '✓ PASS';
    case 'WARN':
      return '⚠ WARN';
    case 'FAIL':
      return '✗ FAIL';
    default:
      return '? UNKNOWN';
  }
}

/**
 * Format a stability score bar (10-char visual).
 */
function formatStabilityBar(value: number): string {
  const filled = Math.round(value / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format a drift signal for CLI output.
 */
function formatSignal(signal: DriftSignal): string {
  const parts: string[] = [];

  parts.push(formatSeverity(signal.severity));
  parts.push(signal.label + ':');

  // Add delta
  const sign = signal.delta >= 0 ? '+' : '';
  parts.push(`${sign}${signal.delta}`);

  // Add from/to if available
  if (signal.from !== undefined && signal.to !== undefined) {
    parts.push(`(${signal.from} → ${signal.to})`);
  }

  return parts.join(' ');
}

/**
 * Format a run summary for CLI output.
 */
function formatRunSummary(run: RunSummary, index: number): string {
  const parts: string[] = [];

  parts.push(`  ${index + 1}.`);
  parts.push(`[${run.runId}]`);
  parts.push(run.command);

  if (run.overallStatus) {
    parts.push(`- ${run.overallStatus}`);
  }

  if (run.driftSeverity) {
    parts.push(`(${run.driftSeverity})`);
  }

  return parts.join(' ');
}

/**
 * Format a dashboard artifact for CLI output.
 */
export function formatDashboard(
  artifact: DriftDashboardArtifact,
  repoRoot: string,
  verbose: boolean = false
): string {
  const lines: string[] = [];

  lines.push('=== FIGMA DRIFT DASHBOARD (Phase 13D) ===');
  lines.push(`Repo Root: ${repoRoot}`);
  lines.push(`Source: ${artifact.sourceFile} (canonical)`);
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push('');

  // Run window info
  lines.push('Run Window:');
  lines.push(`  Runs considered: ${artifact.counts.runsConsidered}`);
  lines.push(`  Limit: ${artifact.runWindow.limit}`);
  if (artifact.runWindow.fromRunId) {
    lines.push(`  From: ${artifact.runWindow.fromRunId}`);
  }
  if (artifact.runWindow.toRunId) {
    lines.push(`  To: ${artifact.runWindow.toRunId}`);
  }
  lines.push('');

  // Severity counts
  const { bySeverity } = artifact.counts;
  lines.push('Drift Counts:');
  lines.push(`  Fail: ${bySeverity.fail}`);
  lines.push(`  Warn: ${bySeverity.warn}`);
  lines.push(`  Info: ${bySeverity.info}`);
  lines.push('');

  // Stability score
  lines.push('Stability Score:');
  lines.push(`  ${formatStabilityBar(artifact.stabilityScore.value)} ${artifact.stabilityScore.value}/100`);
  if (verbose && artifact.stabilityScore.rationale.length > 0) {
    lines.push('  Rationale:');
    for (const reason of artifact.stabilityScore.rationale) {
      lines.push(`    • ${reason}`);
    }
  }
  lines.push('');

  // Top signals
  if (artifact.topSignals.length > 0) {
    lines.push(`Top Signals (${artifact.topSignals.length}):`);
    for (const signal of artifact.topSignals) {
      lines.push(`  ${formatSignal(signal)}`);
    }
    lines.push('');
  }

  // Recent runs
  if (artifact.recentRuns.length > 0) {
    lines.push(`Recent Runs (newest first, ${artifact.recentRuns.length}):`);
    for (let i = 0; i < artifact.recentRuns.length; i++) {
      lines.push(formatRunSummary(artifact.recentRuns[i], i));
      if (verbose && artifact.recentRuns[i].highlights.length > 0) {
        lines.push(`      Highlights: ${artifact.recentRuns[i].highlights.join(', ')}`);
      }
    }
    lines.push('');
  }

  // CI verdict
  lines.push('CI Verdict:');
  lines.push(`  ${formatVerdict(artifact.ciVerdict)}`);
  lines.push(`  ${artifact.explanation}`);
  lines.push(`  Exit code: ${artifact.exitCode}`);

  return lines.join('\n');
}

/**
 * Format a dashboard artifact for verbose CLI output.
 */
export function formatDashboardVerbose(
  artifact: DriftDashboardArtifact,
  repoRoot: string
): string {
  return formatDashboard(artifact, repoRoot, true);
}
