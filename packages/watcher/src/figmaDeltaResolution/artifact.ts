/**
 * @aesthetic-function/watcher - figmaDeltaResolution/artifact.ts
 *
 * Phase 12E: Resolution Plan Artifact Generation.
 *
 * WHY: Produces deterministic JSON artifacts for resolution plans
 * that can be reviewed, diffed, and used for debugging.
 *
 * SCOPE:
 * - Read-only artifact generation
 * - Deterministic output for reproducibility
 * - Only writes artifact if decisions exist
 *
 * CONSTRAINTS:
 * - Does NOT modify source code
 * - Does NOT apply changes
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ResolutionPlan } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory for resolution plan artifacts */
const ARTIFACT_DIR = 'design-materializations';

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Generate the artifact path for a resolution plan.
 *
 * Converts file path to a flat filename:
 *   demo-app/src/App.tsx → demo-app__src__App.figma-resolution-plan.json
 *
 * @param filePath - Source file path
 * @returns Artifact path relative to repo root
 */
export function getResolutionArtifactPath(filePath: string): string {
  // Remove extension and replace path separators
  const baseName = filePath
    .replace(/\.[jt]sx?$/, '')
    .replace(/\//g, '__');

  return `${ARTIFACT_DIR}/${baseName}.figma-resolution-plan.json`;
}

// =============================================================================
// ARTIFACT GENERATION
// =============================================================================

/**
 * Build the resolution plan artifact payload.
 *
 * @param plan - Resolution plan to serialize
 * @returns Artifact object ready for JSON serialization
 */
export function buildResolutionArtifact(plan: ResolutionPlan): object {
  return {
    version: plan.version,
    source: 'figma-resolution-plan',
    generatedAt: plan.generatedAt,
    sourceFile: plan.sourceFile,
    summary: plan.summary,
    decisions: plan.decisions,
  };
}

/**
 * Write a resolution plan artifact to disk.
 *
 * Only writes if there are decisions to report.
 *
 * @param plan - Resolution plan to write
 * @param repoRoot - Repository root path
 * @returns Path to written artifact, or undefined if no decisions
 */
export async function writeResolutionArtifact(
  plan: ResolutionPlan,
  repoRoot: string
): Promise<string | undefined> {
  // Don't write empty artifacts
  if (plan.decisions.length === 0) {
    return undefined;
  }

  const relativePath = getResolutionArtifactPath(plan.sourceFile);
  const absolutePath = join(repoRoot, relativePath);

  // Ensure directory exists
  await mkdir(dirname(absolutePath), { recursive: true });

  // Build and write artifact
  const artifact = buildResolutionArtifact(plan);
  const content = JSON.stringify(artifact, null, 2);

  await writeFile(absolutePath, content + '\n', 'utf-8');

  return relativePath;
}
