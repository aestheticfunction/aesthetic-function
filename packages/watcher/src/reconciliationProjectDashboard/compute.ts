/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/compute.ts
 *
 * Phase 13E: Project Dashboard Aggregation Computation.
 *
 * WHY: Aggregates Phase 13D dashboards across many source files
 * to provide a project-level drift view.
 *
 * SCOPE:
 * - Read-only aggregation only
 * - Uses Phase 13D per-file dashboards
 * - Deterministic output
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX, markers, overrides, component-map, or existing artifacts
 * - Does NOT change protocol/server/plugin behavior
 * - Does NOT emit Figma operations
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import {
  getRepoRoot,
  normalizeSourcePath,
  computeDashboard,
} from '../reconciliationDashboard/compute.js';

import { getDashboardArtifactPath } from '../reconciliationDashboard/artifact.js';

import { DEFAULT_THRESHOLDS } from '../reconciliationDashboard/config.js';

import type { DriftDashboardArtifact } from '../reconciliationDashboard/types.js';

import type {
  CiVerdict,
  ComputeProjectDashboardResult,
  FileDashboardSummary,
  LoadFileDashboardResult,
  ProjectCounts,
  ProjectDashboardArtifact,
  ProjectDashboardContext,
  ProjectDashboardThresholds,
  ProjectSignal,
  ProjectStabilityScore,
  SeverityCounts,
} from './types.js';

import { determineVerdict } from './config.js';

// Re-export utilities for external use
export { getRepoRoot, normalizeSourcePath };

// =============================================================================
// FILE DISCOVERY
// =============================================================================

/**
 * Excluded directories for file discovery.
 */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.git',
  'coverage',
]);

/**
 * Discover all .tsx files in a directory recursively.
 *
 * Excludes: node_modules, dist, build, .next, .turbo
 * Returns paths sorted deterministically (alphabetical).
 */
export function discoverSourceFiles(
  scanRoot: string,
  repoRoot: string
): string[] {
  const absoluteScanRoot = resolve(repoRoot, scanRoot);
  const files: string[] = [];

  if (!existsSync(absoluteScanRoot)) {
    return files;
  }

  const stat = statSync(absoluteScanRoot);
  if (!stat.isDirectory()) {
    // Single file case
    if (absoluteScanRoot.endsWith('.tsx')) {
      return [relative(repoRoot, absoluteScanRoot)];
    }
    return files;
  }

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    // Sort entries for deterministic ordering
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        // Convert to repo-relative path
        const relativePath = relative(repoRoot, fullPath);
        files.push(relativePath);
      }
    }
  }

  walk(absoluteScanRoot);
  return files;
}

// =============================================================================
// DASHBOARD LOADING
// =============================================================================

/**
 * Load a pre-computed dashboard artifact from disk.
 */
async function loadDashboardArtifact(
  sourceFile: string,
  repoRoot: string
): Promise<DriftDashboardArtifact | undefined> {
  const artifactPath = getDashboardArtifactPath(sourceFile);
  const fullPath = join(repoRoot, artifactPath);

  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as DriftDashboardArtifact;
  } catch {
    return undefined;
  }
}

/**
 * Load or compute a dashboard for a single file.
 *
 * Priority:
 * 1. Load existing 13D artifact if present
 * 2. Compute in-memory if sufficient inputs exist
 * 3. Return NO_DATA if nothing exists
 */
export async function loadFileDashboard(
  sourceFile: string,
  repoRoot: string,
  limit: number
): Promise<LoadFileDashboardResult> {
  // Try loading existing artifact first
  const existing = await loadDashboardArtifact(sourceFile, repoRoot);
  if (existing) {
    return { ok: true, dashboard: existing };
  }

  // Try computing in-memory
  try {
    const result = await computeDashboard({
      sourceFile,
      repoRoot,
      limit,
      thresholds: DEFAULT_THRESHOLDS,
      strict: false,
    });

    if (result.ok) {
      return { ok: true, dashboard: result.artifact };
    }

    // No ledger or insufficient data
    return { ok: false, status: 'NO_DATA' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 'ERROR', error: message };
  }
}

// =============================================================================
// AGGREGATION HELPERS
// =============================================================================

/**
 * Severity priority for sorting (higher = more severe).
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  fail: 3,
  warn: 2,
  info: 1,
};

/**
 * Sort project signals deterministically.
 *
 * Order: severity (desc) → magnitude (desc) → file path (asc) → signal key (asc)
 */
function sortProjectSignals(signals: ProjectSignal[]): ProjectSignal[] {
  return [...signals].sort((a, b) => {
    // 1. Severity (descending)
    const severityDiff =
      (SEVERITY_PRIORITY[b.severity] ?? 0) - (SEVERITY_PRIORITY[a.severity] ?? 0);
    if (severityDiff !== 0) return severityDiff;

    // 2. Magnitude (descending)
    const magnitudeDiff = Math.abs(b.delta) - Math.abs(a.delta);
    if (magnitudeDiff !== 0) return magnitudeDiff;

    // 3. File path (ascending)
    const fileDiff = a.sourceFile.localeCompare(b.sourceFile);
    if (fileDiff !== 0) return fileDiff;

    // 4. Signal key (ascending)
    return a.key.localeCompare(b.key);
  });
}

/**
 * Compute project-level verdict from stability score and thresholds.
 *
 * Phase 13E.1: Uses score-based thresholds instead of per-file verdicts.
 *
 * Rules:
 * - score < failScore → FAIL
 * - failScore ≤ score < warnScore → WARN
 * - score ≥ warnScore → PASS
 */
function computeProjectVerdict(
  stabilityScore: ProjectStabilityScore,
  thresholds: ProjectDashboardThresholds
): { verdict: CiVerdict; explanation: string } {
  // If no files have data, return PASS with explanation
  if (stabilityScore.filesIncluded === 0) {
    return {
      verdict: 'PASS',
      explanation: 'No files with drift data',
    };
  }

  // Use threshold-based verdict determination
  return determineVerdict(stabilityScore.value, thresholds);
}

/**
 * Compute project-level stability score.
 *
 * Average of all file stability scores that have data.
 * Excludes NO_DATA files from the mean.
 */
function computeProjectStabilityScore(
  files: FileDashboardSummary[]
): ProjectStabilityScore {
  const filesWithScore = files.filter(
    f => f.status === 'OK' && f.stabilityScore !== undefined
  );
  const filesExcluded = files.filter(f => f.status === 'NO_DATA').length;

  if (filesWithScore.length === 0) {
    return {
      value: 100,
      rationale: ['No files with drift data'],
      filesIncluded: 0,
      filesExcluded,
    };
  }

  const sum = filesWithScore.reduce((acc, f) => acc + (f.stabilityScore ?? 0), 0);
  const average = Math.round(sum / filesWithScore.length);

  const rationale: string[] = [];
  rationale.push(`Average of ${filesWithScore.length} file${filesWithScore.length > 1 ? 's' : ''}`);

  if (filesExcluded > 0) {
    rationale.push(`${filesExcluded} file${filesExcluded > 1 ? 's' : ''} excluded (NO_DATA)`);
  }

  return {
    value: average,
    rationale,
    filesIncluded: filesWithScore.length,
    filesExcluded,
  };
}

/**
 * Aggregate severity counts from all files.
 */
function aggregateSeverityCounts(files: FileDashboardSummary[]): SeverityCounts {
  const counts: SeverityCounts = { info: 0, warn: 0, fail: 0 };

  for (const file of files) {
    if (file.severityCounts) {
      counts.info += file.severityCounts.info;
      counts.warn += file.severityCounts.warn;
      counts.fail += file.severityCounts.fail;
    }
  }

  return counts;
}

/**
 * Collect and merge all signals from dashboards.
 */
function collectProjectSignals(
  dashboards: Map<string, DriftDashboardArtifact>
): ProjectSignal[] {
  const signals: ProjectSignal[] = [];

  for (const [sourceFile, dashboard] of dashboards) {
    for (const signal of dashboard.topSignals) {
      signals.push({
        ...signal,
        sourceFile,
      });
    }
  }

  return sortProjectSignals(signals);
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Normalize scan root to repo-relative path.
 */
export function normalizeScanRoot(scanRoot: string, repoRoot: string): string {
  const absolute = resolve(repoRoot, scanRoot);
  let rel = relative(repoRoot, absolute);

  // Handle edge case where scan root is repo root
  if (rel === '') {
    rel = '.';
  }

  // Strip leading ./
  if (rel.startsWith('./')) {
    rel = rel.slice(2);
  }

  return rel;
}

/**
 * Compute the project-level dashboard artifact.
 */
export async function computeProjectDashboard(
  context: ProjectDashboardContext
): Promise<ComputeProjectDashboardResult> {
  const { scanRoot, repoRoot, limit, strict, projectThresholds } = context;

  // Normalize scan root
  const normalizedScanRoot = normalizeScanRoot(scanRoot, repoRoot);

  // Discover source files
  const sourceFiles = discoverSourceFiles(normalizedScanRoot, repoRoot);

  if (sourceFiles.length === 0) {
    return {
      ok: false,
      error: `No .tsx files found in: ${normalizedScanRoot}`,
    };
  }

  // Load/compute dashboards for each file
  const fileSummaries: FileDashboardSummary[] = [];
  const dashboards = new Map<string, DriftDashboardArtifact>();

  for (const sourceFile of sourceFiles) {
    const result = await loadFileDashboard(sourceFile, repoRoot, limit);

    if (result.ok) {
      const dashboard = result.dashboard;
      dashboards.set(sourceFile, dashboard);

      fileSummaries.push({
        sourceFile,
        status: 'OK',
        verdict: dashboard.ciVerdict,
        stabilityScore: dashboard.stabilityScore.value,
        runsConsidered: dashboard.counts.runsConsidered,
        severityCounts: dashboard.counts.bySeverity,
      });
    } else {
      fileSummaries.push({
        sourceFile,
        status: result.status,
        error: result.error,
      });
    }
  }

  // Sort file summaries by sourceFile for deterministic output
  fileSummaries.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));

  // Compute aggregates
  const filesWithData = fileSummaries.filter(f => f.status === 'OK');
  const filesNoData = fileSummaries.filter(f => f.status === 'NO_DATA');
  const filesWithErrors = fileSummaries.filter(f => f.status === 'ERROR');

  const projectCounts: ProjectCounts = {
    totalFiles: sourceFiles.length,
    filesWithData: filesWithData.length,
    filesNoData: filesNoData.length,
    filesWithErrors: filesWithErrors.length,
    byVerdict: {
      pass: filesWithData.filter(f => f.verdict === 'PASS').length,
      warn: filesWithData.filter(f => f.verdict === 'WARN').length,
      fail: filesWithData.filter(f => f.verdict === 'FAIL').length,
    },
    bySeverity: aggregateSeverityCounts(filesWithData),
  };

  // Compute project stability score
  const stabilityScore = computeProjectStabilityScore(fileSummaries);

  // Collect and sort project signals (limited by maxSignals from thresholds)
  const allSignals = collectProjectSignals(dashboards);
  const topSignals = allSignals.slice(0, projectThresholds.maxSignals);

  // Compute project verdict using threshold-based scoring (Phase 13E.1)
  const { verdict, explanation } = computeProjectVerdict(stabilityScore, projectThresholds);

  // Determine exit code
  const exitCode = strict && verdict === 'FAIL' ? 1 : 0;

  // Build artifact
  const artifact: ProjectDashboardArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    scanRoot: normalizedScanRoot,
    filePattern: '**/*.tsx',
    counts: projectCounts,
    stabilityScore,
    topSignals,
    files: fileSummaries,
    projectVerdict: verdict,
    exitCode: exitCode as 0 | 1,
    explanation,
    thresholds: {
      failScore: projectThresholds.failScore,
      warnScore: projectThresholds.warnScore,
      maxSignals: projectThresholds.maxSignals,
    },
  };

  return { ok: true, artifact };
}
