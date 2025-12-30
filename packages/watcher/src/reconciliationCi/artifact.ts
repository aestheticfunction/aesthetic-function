/**
 * @aesthetic-function/watcher - reconciliationCi/artifact.ts
 *
 * Phase 13F: CI Gate Artifact Handling.
 *
 * WHY: Writes CI gate artifacts to disk and formats them for CLI output.
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
  CiGateArtifact,
  CiVerdict,
  FileTrend,
  ProjectSignal,
  TrendSummary,
} from './types.js';

import type { FileDashboardSummary } from '../reconciliationProjectDashboard/types.js';

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Normalize scan root path for artifact naming.
 * Converts: demo-app/src → demo-app__src
 */
function normalizeScanRootForArtifact(scanRoot: string): string {
  let normalized = scanRoot;

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Handle root case
  if (normalized === '.' || normalized === '') {
    normalized = 'root';
  }

  return normalized.replace(/\//g, '__');
}

/**
 * Get the CI gate artifact path for a scan root.
 */
export function getCiGateArtifactPath(scanRoot: string): string {
  const normalized = normalizeScanRootForArtifact(scanRoot);
  return `design-materializations/${normalized}.figma-ci-gate.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Result of writing a CI gate artifact.
 */
export interface WriteCiGateResult {
  written: boolean;
  path: string;
  error?: string;
}

/**
 * Write a CI gate artifact atomically.
 *
 * Uses temp file + rename for atomicity.
 */
export function writeCiGateArtifact(
  artifact: CiGateArtifact,
  repoRoot: string
): WriteCiGateResult {
  const relativePath = getCiGateArtifactPath(artifact.scanRoot);
  const fullPath = join(repoRoot, relativePath);

  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first
  const tempPath = join(
    tmpdir(),
    `figma-ci-gate-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
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
 * Format severity indicator for CLI output.
 */
function formatSeverity(severity: string): string {
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
 * Format a project signal for CLI output.
 */
function formatProjectSignal(signal: ProjectSignal): string {
  const parts: string[] = [];

  parts.push(formatSeverity(signal.severity));
  parts.push(signal.label + ':');

  // Add delta
  const sign = signal.delta >= 0 ? '+' : '';
  parts.push(`${sign}${signal.delta}`);

  // Add file
  parts.push(`(${signal.sourceFile})`);

  return parts.join(' ');
}

/**
 * Format file status for CLI output.
 */
function formatFileStatus(file: FileDashboardSummary): string {
  if (file.status === 'NO_DATA') {
    return `  [----] ${file.sourceFile} (no data)`;
  }

  if (file.status === 'ERROR') {
    return `  [ERR!] ${file.sourceFile} (${file.error ?? 'unknown error'})`;
  }

  const verdict = file.verdict ?? 'PASS';
  const verdictIcon = verdict === 'FAIL' ? '✗' : verdict === 'WARN' ? '⚠' : '✓';
  const score = file.stabilityScore ?? 100;

  return `  [${verdictIcon}${verdict.padEnd(4)}] ${file.sourceFile} (score: ${score})`;
}

/**
 * Format file trend for CLI output.
 */
function formatFileTrend(trend: FileTrend): string {
  const directionIcon =
    trend.direction === 'improving' ? '↑' :
    trend.direction === 'worsening' ? '↓' : '→';

  if (trend.runsInWindow < 2) {
    return `  ${directionIcon} ${trend.sourceFile} (insufficient data)`;
  }

  const deltaSign = (trend.scoreDelta ?? 0) >= 0 ? '+' : '';
  return `  ${directionIcon} ${trend.sourceFile} (${trend.startScore} → ${trend.endScore}, ${deltaSign}${trend.scoreDelta})`;
}

/**
 * Format trend summary for CLI output.
 */
function formatTrendSummary(trend: TrendSummary): string[] {
  const lines: string[] = [];

  lines.push(`Trend Summary (window: ${trend.windowSize} runs):`);
  lines.push(`  ↑ Improving: ${trend.improving}`);
  lines.push(`  → Stable: ${trend.stable}`);
  lines.push(`  ↓ Worsening: ${trend.worsening}`);
  if (trend.insufficientData > 0) {
    lines.push(`  ? Insufficient data: ${trend.insufficientData}`);
  }

  return lines;
}

/**
 * Format a CI gate artifact for CLI output.
 */
export function formatCiGate(
  artifact: CiGateArtifact,
  repoRoot: string,
  verbose: boolean = false
): string {
  const lines: string[] = [];

  lines.push('=== FIGMA CI GATE (Phase 13F) ===');
  lines.push(`Repo Root: ${repoRoot}`);
  lines.push(`Scan Root: ${artifact.scanRoot}`);
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push('');

  // File counts
  lines.push('Files:');
  lines.push(`  Total discovered: ${artifact.counts.totalFiles}`);
  lines.push(`  With data: ${artifact.counts.filesWithData}`);
  lines.push(`  No data: ${artifact.counts.filesNoData}`);
  if (artifact.counts.filesWithErrors > 0) {
    lines.push(`  Errors: ${artifact.counts.filesWithErrors}`);
  }
  lines.push('');

  // Verdict breakdown
  if (artifact.counts.filesWithData > 0) {
    lines.push('Verdict Breakdown:');
    lines.push(`  PASS: ${artifact.counts.byVerdict.pass}`);
    lines.push(`  WARN: ${artifact.counts.byVerdict.warn}`);
    lines.push(`  FAIL: ${artifact.counts.byVerdict.fail}`);
    lines.push('');
  }

  // Stability score
  lines.push('Project Stability Score:');
  lines.push(
    `  ${formatStabilityBar(artifact.stabilityScore.value)} ${artifact.stabilityScore.value}/100`
  );
  lines.push('');

  // Trend summary
  lines.push(...formatTrendSummary(artifact.trend));
  lines.push('');

  // Per-file trends (verbose only)
  if (verbose && artifact.trend.files.length > 0) {
    lines.push('File Trends:');
    for (const trend of artifact.trend.files) {
      lines.push(formatFileTrend(trend));
    }
    lines.push('');
  }

  // Top signals
  if (artifact.topSignals.length > 0) {
    lines.push(`Top Signals (${artifact.topSignals.length}):`);
    const signalsToShow = verbose ? artifact.topSignals : artifact.topSignals.slice(0, 5);
    for (const signal of signalsToShow) {
      lines.push(`  ${formatProjectSignal(signal)}`);
    }
    if (!verbose && artifact.topSignals.length > 5) {
      lines.push(`  ... and ${artifact.topSignals.length - 5} more (use --verbose)`);
    }
    lines.push('');
  }

  // Per-file breakdown (verbose only)
  if (verbose) {
    lines.push(`Files (${artifact.files.length}):`);
    for (const file of artifact.files) {
      lines.push(formatFileStatus(file));
    }
    lines.push('');
  }

  // CI verdict
  lines.push('CI Verdict:');
  lines.push(`  ${formatVerdict(artifact.verdict)}`);
  lines.push(`  ${artifact.explanation}`);
  lines.push(`  Exit code: ${artifact.exitCode}`);

  return lines.join('\n');
}

/**
 * Format a CI gate artifact for verbose CLI output.
 */
export function formatCiGateVerbose(
  artifact: CiGateArtifact,
  repoRoot: string
): string {
  return formatCiGate(artifact, repoRoot, true);
}
