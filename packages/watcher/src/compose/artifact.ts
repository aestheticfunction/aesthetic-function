/**
 * @aesthetic-function/watcher - compose/artifact.ts
 *
 * Phase 11B: Compose Artifact Generation.
 *
 * WHY: Persists compose operations to a deterministic artifact file
 * for auditing and re-application. Uses same naming convention as
 * other design-materializations artifacts.
 *
 * ARTIFACT NAMING: <basename>.compose.json
 * Example: demo-app__src__App.compose.json
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import type { ComposeArtifact } from '@aesthetic-function/shared';
import type { ComposeResult, ComposeArtifactMeta, ComposeMode } from './types.js';

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Generate base name from source file path.
 * Replaces path separators with '__' for flat file naming.
 *
 * Example: 'demo-app/src/App.tsx' -> 'demo-app__src__App'
 */
export function generateBaseName(sourceFile: string): string {
  // Remove extension
  const withoutExt = sourceFile.replace(/\.(tsx?|jsx?)$/, '');
  // Replace slashes with double underscore
  const normalized = withoutExt.replace(/[\\/]/g, '__');
  // Remove leading underscores
  return normalized.replace(/^__+/, '');
}

/**
 * Get the artifact output directory.
 * Looks for design-materializations in watcher or repo root.
 */
export function getArtifactDir(repoRoot: string): string {
  return resolve(repoRoot, 'design-materializations');
}

/**
 * Generate artifact file path.
 */
export function generateArtifactPath(
  sourceFile: string,
  repoRoot: string
): string {
  const baseName = generateBaseName(sourceFile);
  const dir = getArtifactDir(repoRoot);
  return resolve(dir, `${baseName}.compose.json`);
}

// =============================================================================
// ARTIFACT GENERATION
// =============================================================================

/**
 * Build a ComposeArtifact from compose result.
 */
export function buildComposeArtifact(
  result: ComposeResult,
  mode: ComposeMode
): ComposeArtifact {
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    source: 'figma-suggestions',
    mode: mode === 'apply' ? 'apply' : 'dry-run',
    operations: result.operations,
    // Results are added after apply
  };
}

/**
 * Generate artifact metadata for a source file.
 */
export function generateArtifactMeta(
  sourceFile: string,
  repoRoot: string
): ComposeArtifactMeta {
  const baseName = generateBaseName(sourceFile);
  const artifactPath = generateArtifactPath(sourceFile, repoRoot);

  return {
    baseName,
    artifactPath,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// ARTIFACT WRITER
// =============================================================================

/**
 * Write compose artifact to disk.
 *
 * Creates the artifact directory if it doesn't exist.
 * Overwrites existing artifact for the same source file.
 */
export async function writeComposeArtifact(
  artifact: ComposeArtifact,
  artifactPath: string
): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(artifactPath), { recursive: true });

  // Write artifact with pretty formatting
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(artifactPath, content, 'utf-8');
}

/**
 * Convenience function to generate and write artifact in one step.
 */
export async function writeComposeResult(
  result: ComposeResult,
  sourceFile: string,
  repoRoot: string
): Promise<ComposeArtifactMeta> {
  const meta = generateArtifactMeta(sourceFile, repoRoot);
  const artifact = buildComposeArtifact(result, result.mode);

  await writeComposeArtifact(artifact, meta.artifactPath);

  return meta;
}

/**
 * Update artifact with results after apply.
 */
export function updateArtifactWithResults(
  artifact: ComposeArtifact,
  results: ComposeArtifact['results']
): ComposeArtifact {
  return {
    ...artifact,
    results,
  };
}
