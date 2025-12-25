/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/artifact.ts
 *
 * Phase 12B: Suggestion Artifact Generation.
 *
 * WHY: Writes suggestion artifacts to design-materializations/ for
 * human review before any apply phase.
 *
 * ARTIFACT STRUCTURE:
 * - Source file
 * - Generation timestamp
 * - Summary counts
 * - Sorted suggestions with evidence
 *
 * NOTE: This is the only write operation in Phase 12B.
 * No other files (TSX, markers, overrides) are modified.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import type { SuggestionArtifact, SuggestOutput } from './types.js';

// =============================================================================
// REPO ROOT DETECTION
// =============================================================================

/**
 * Marker files that indicate the repository root.
 */
const REPO_ROOT_MARKERS = ['pnpm-workspace.yaml', '.git'];

/**
 * Walk up the directory tree to find the repository root.
 *
 * @param startDir - Starting directory (defaults to process.cwd())
 * @returns Absolute path to the repository root
 */
export function getRepoRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir) === currentDir ? currentDir : '/';

  while (currentDir !== root) {
    for (const marker of REPO_ROOT_MARKERS) {
      const markerPath = join(currentDir, marker);
      if (existsSync(markerPath)) {
        return currentDir;
      }
    }
    currentDir = dirname(currentDir);
  }

  return process.cwd();
}

/**
 * Normalize a source file path to be repo-relative.
 *
 * @param inputPath - Raw input path
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Repo-relative path
 */
export function normalizeSourcePath(
  inputPath: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();

  if (inputPath.startsWith('/')) {
    if (inputPath.startsWith(root + '/') || inputPath === root) {
      const repoRelative = relative(root, inputPath);
      return repoRelative.replace(/\\/g, '/').replace(/^\.\//, '');
    }
    return inputPath.replace(/\\/g, '/');
  }

  if (inputPath.startsWith('../') || inputPath.startsWith('./')) {
    const absolutePath = resolve(process.cwd(), inputPath);
    if (absolutePath.startsWith(root + '/')) {
      return relative(root, absolutePath).replace(/\\/g, '/');
    }
    return inputPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '').replace(/\\/g, '/');
  }

  return inputPath.replace(/\\/g, '/');
}

// =============================================================================
// ARTIFACT DIRECTORY
// =============================================================================

/**
 * Default artifact output directory.
 */
export const DEFAULT_ARTIFACT_DIR = 'design-materializations';

// =============================================================================
// FILENAME GENERATION
// =============================================================================

/**
 * Generate suggestion artifact filename from source file path.
 *
 * Converts path separators to double underscores for flat file structure.
 * Example: "demo-app/src/App.tsx" → "demo-app__src__App.figma-delta-suggestions.json"
 */
export function generateSuggestionArtifactName(sourceFile: string): string {
  // Remove leading ./ or / if present
  let normalized = sourceFile.replace(/^\.?\//, '');

  // Remove any parent directory references
  normalized = normalized.replace(/\.\.\/|\.\.__/g, '');

  // Remove file extension
  normalized = normalized.replace(/\.(tsx?|jsx?)$/, '');

  // Replace path separators with double underscores
  normalized = normalized.replace(/\//g, '__');

  return `${normalized}.figma-delta-suggestions.json`;
}

/**
 * Get full suggestion artifact path.
 *
 * @param sourceFile - Source file path (will be normalized)
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path to the artifact file
 */
export function getSuggestionArtifactPath(
  sourceFile: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();
  const normalizedSource = normalizeSourcePath(sourceFile, root);
  const filename = generateSuggestionArtifactName(normalizedSource);
  return join(root, DEFAULT_ARTIFACT_DIR, filename);
}

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

/**
 * Build a SuggestionArtifact from SuggestOutput.
 *
 * @param output - Suggest output from generateDeltaSuggestions
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Suggestion artifact ready for writing
 */
export function buildSuggestionArtifact(
  output: SuggestOutput,
  repoRoot?: string
): SuggestionArtifact {
  const root = repoRoot ?? getRepoRoot();
  const normalizedSource = normalizeSourcePath(output.filePath, root);

  return {
    version: '1.0',
    source: 'figma-delta',
    generatedAt: new Date().toISOString(),
    sourceFile: normalizedSource,
    summary: output.summary,
    suggestions: output.suggestions,
  };
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write suggestion artifact to disk.
 *
 * Creates the design-materializations directory if needed.
 *
 * @param output - Suggest output to write
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path where artifact was written
 */
export async function writeSuggestionArtifact(
  output: SuggestOutput,
  repoRoot?: string
): Promise<string> {
  const root = repoRoot ?? getRepoRoot();
  const artifactDir = join(root, DEFAULT_ARTIFACT_DIR);

  // Ensure directory exists
  if (!existsSync(artifactDir)) {
    await mkdir(artifactDir, { recursive: true });
  }

  const artifactPath = getSuggestionArtifactPath(output.filePath, root);
  const artifact = buildSuggestionArtifact(output, root);
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(artifactPath, content, 'utf-8');

  return artifactPath;
}
