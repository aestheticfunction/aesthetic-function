/**
 * @aesthetic-function/watcher - figmaDelta/conflicts/artifact.ts
 *
 * Phase 12D: Conflict Report Artifact Generation.
 *
 * WHY: Produces deterministic JSON artifacts for conflict reports
 * that can be reviewed, diffed, and used for debugging.
 *
 * SCOPE:
 * - Read-only artifact generation
 * - Deterministic output for reproducibility
 * - Only writes artifact if conflicts exist
 *
 * CONSTRAINTS:
 * - Does NOT modify source code
 * - Does NOT apply changes
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ConflictReport } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory for conflict artifacts */
const ARTIFACT_DIR = 'design-materializations';

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Generate the artifact path for a conflict report.
 *
 * Converts file path to a flat filename:
 *   demo-app/src/App.tsx → demo-app__src__App.figma-conflicts.json
 *
 * @param filePath - Source file path
 * @returns Artifact path relative to repo root
 */
export function getConflictArtifactPath(filePath: string): string {
  // Remove extension and replace path separators
  const baseName = filePath
    .replace(/\.[jt]sx?$/, '')
    .replace(/\//g, '__');

  return `${ARTIFACT_DIR}/${baseName}.figma-conflicts.json`;
}

// =============================================================================
// ARTIFACT GENERATION
// =============================================================================

/**
 * Build the conflict artifact payload.
 *
 * @param report - Conflict report to serialize
 * @returns Artifact object ready for JSON serialization
 */
export function buildConflictArtifact(report: ConflictReport): object {
  return {
    version: '1.0',
    source: 'figma-conflict-detection',
    generatedAt: report.generatedAt,
    sourceFile: report.filePath,
    summary: report.summary,
    conflicts: report.conflicts,
  };
}

/**
 * Write a conflict artifact to disk.
 *
 * Only writes if there are conflicts to report.
 *
 * @param report - Conflict report to write
 * @param repoRoot - Repository root path
 * @returns Path to written artifact, or undefined if no conflicts
 */
export async function writeConflictArtifact(
  report: ConflictReport,
  repoRoot: string
): Promise<string | undefined> {
  // Don't write empty artifacts
  if (report.conflicts.length === 0) {
    return undefined;
  }

  const relativePath = getConflictArtifactPath(report.filePath);
  const absolutePath = join(repoRoot, relativePath);

  // Ensure directory exists
  await mkdir(dirname(absolutePath), { recursive: true });

  // Build and write artifact
  const artifact = buildConflictArtifact(report);
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(absolutePath, content, 'utf-8');

  return relativePath;
}
