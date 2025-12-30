/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/artifact.ts
 *
 * Phase 13E: Project Dashboard Artifact Handling.
 *
 * WHY: Writes project dashboard artifacts to disk and formats them for CLI output.
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
  FileDashboardSummary,
  ProjectDashboardArtifact,
  ProjectSignal,
} from './types.js';

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
 * Get the project dashboard artifact path for a scan root.
 */
export function getProjectDashboardArtifactPath(scanRoot: string): string {
  const normalized = normalizeScanRootForArtifact(scanRoot);
  return `design-materializations/${normalized}.figma-project-dashboard.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Result of writing a project dashboard artifact.
 */
export interface WriteProjectDashboardResult {
  written: boolean;
  path: string;
  error?: string;
}

/**
 * Write a project dashboard artifact atomically.
 *
 * Uses temp file + rename for atomicity.
 */
export function writeProjectDashboardArtifact(
  artifact: ProjectDashboardArtifact,
  repoRoot: string
): WriteProjectDashboardResult {
  const relativePath = getProjectDashboardArtifactPath(artifact.scanRoot);
  const fullPath = join(repoRoot, relativePath);

  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first
  const tempPath = join(
    tmpdir(),
    `figma-project-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
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
 * Format a project dashboard artifact for CLI output.
 */
export function formatProjectDashboard(
  artifact: ProjectDashboardArtifact,
  repoRoot: string,
  verbose: boolean = false
): string {
  const lines: string[] = [];

  lines.push('=== FIGMA PROJECT DASHBOARD (Phase 13E) ===');
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

  // Aggregated severity counts
  const { bySeverity } = artifact.counts;
  lines.push('Aggregated Drift Counts:');
  lines.push(`  Fail: ${bySeverity.fail}`);
  lines.push(`  Warn: ${bySeverity.warn}`);
  lines.push(`  Info: ${bySeverity.info}`);
  lines.push('');

  // Stability score
  lines.push('Project Stability Score:');
  lines.push(
    `  ${formatStabilityBar(artifact.stabilityScore.value)} ${artifact.stabilityScore.value}/100`
  );
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

  // Project verdict
  lines.push('Project Verdict:');
  lines.push(`  ${formatVerdict(artifact.projectVerdict)}`);
  lines.push(`  ${artifact.explanation}`);
  lines.push(`  Exit code: ${artifact.exitCode}`);

  return lines.join('\n');
}

/**
 * Format a project dashboard artifact for verbose CLI output.
 */
export function formatProjectDashboardVerbose(
  artifact: ProjectDashboardArtifact,
  repoRoot: string
): string {
  return formatProjectDashboard(artifact, repoRoot, true);
}
