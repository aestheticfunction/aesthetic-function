/**
 * @aesthetic-function/watcher - figmaDelta/artifact.ts
 *
 * Phase 12A: Delta Artifact Generation.
 *
 * WHY: Writes review artifacts to design-materializations/ for
 * human review of detected Figma changes.
 *
 * ARTIFACT STRUCTURE:
 * - Before/after values for each delta
 * - Canonical source tokens
 * - Confidence levels
 * - Summary statistics
 *
 * NOTE: This is the only write operation in Phase 12A.
 * No other files (TSX, markers, overrides) are modified.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import type {
  FigmaDeltaArtifact,
  DeltaOutput,
  BatchDeltaOutput,
} from './types.js';

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
 * Looks for pnpm-workspace.yaml or .git directory.
 * Falls back to process.cwd() if not found.
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

  // Fallback to process.cwd()
  return process.cwd();
}

/**
 * Normalize a source file path to be repo-relative.
 *
 * @param inputPath - Raw input path from CLI or caller
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Repo-relative path (e.g., 'demo-app/src/App.tsx')
 */
export function normalizeSourcePath(
  inputPath: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();

  // If already absolute, make it relative to repo root
  if (inputPath.startsWith('/')) {
    if (inputPath.startsWith(root + '/') || inputPath === root) {
      const repoRelative = relative(root, inputPath);
      return repoRelative.replace(/\\/g, '/').replace(/^\.\//, '');
    }
    return inputPath.replace(/\\/g, '/');
  }

  // If path has parent references (../), resolve against cwd first
  if (inputPath.startsWith('../') || inputPath.startsWith('./')) {
    const absolutePath = resolve(process.cwd(), inputPath);
    if (absolutePath.startsWith(root + '/')) {
      return relative(root, absolutePath).replace(/\\/g, '/');
    }
    return inputPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '').replace(/\\/g, '/');
  }

  // Simple relative path
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
 * Generate delta artifact filename from source file path.
 *
 * Converts path separators to double underscores for flat file structure.
 * Example: "demo-app/src/App.tsx" → "demo-app__src__App.figma-delta.json"
 */
export function generateDeltaArtifactName(sourceFile: string): string {
  // Remove leading ./ or / if present
  let normalized = sourceFile.replace(/^\.?\//, '');

  // Remove any parent directory references
  normalized = normalized.replace(/\.\.\/|\.\.__/g, '');

  // Remove file extension
  normalized = normalized.replace(/\.(tsx?|jsx?)$/, '');

  // Replace path separators with double underscores
  normalized = normalized.replace(/\//g, '__');

  return `${normalized}.figma-delta.json`;
}

/**
 * Get full delta artifact path.
 *
 * Always resolves to repo-root/design-materializations/,
 * regardless of current working directory.
 *
 * @param sourceFile - Source file path (will be normalized)
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path to the artifact file
 */
export function getDeltaArtifactPath(
  sourceFile: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();
  const normalizedSource = normalizeSourcePath(sourceFile, root);
  const filename = generateDeltaArtifactName(normalizedSource);
  return join(root, DEFAULT_ARTIFACT_DIR, filename);
}

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

/**
 * Build a single FigmaDeltaArtifact from a DeltaOutput.
 *
 * @param output - Delta output from generateDeltasForVariant
 * @returns FigmaDeltaArtifact ready for writing
 */
export function buildDeltaArtifact(output: DeltaOutput): FigmaDeltaArtifact {
  return {
    version: '1.0',
    source: 'figma',
    timestamp: new Date().toISOString(),
    componentKey: output.componentKey,
    state: output.state,
    nodeId: output.nodeId,
    deltas: output.deltas,
    meta: output.meta,
  };
}

/**
 * Build multiple delta artifacts from batch output.
 *
 * Creates one artifact per variant that has deltas.
 * Variants with no deltas are skipped.
 *
 * @param batchOutput - Batch delta output
 * @returns Array of artifacts (only for variants with deltas)
 */
export function buildDeltaArtifacts(
  batchOutput: BatchDeltaOutput
): FigmaDeltaArtifact[] {
  return batchOutput.results
    .filter((result) => result.deltas.length > 0)
    .map((result) => buildDeltaArtifact(result));
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write a single delta artifact to disk.
 *
 * Creates the design-materializations directory if needed.
 *
 * @param sourceFile - Source file path for artifact naming
 * @param artifact - Delta artifact to write
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Path where artifact was written
 */
export async function writeDeltaArtifact(
  sourceFile: string,
  artifact: FigmaDeltaArtifact,
  repoRoot?: string
): Promise<string> {
  const root = repoRoot ?? getRepoRoot();
  const artifactDir = join(root, DEFAULT_ARTIFACT_DIR);

  // Ensure directory exists
  if (!existsSync(artifactDir)) {
    await mkdir(artifactDir, { recursive: true });
  }

  // Generate filename with component key and state for uniqueness
  const normalizedSource = normalizeSourcePath(sourceFile, root);
  const baseName = normalizedSource.replace(/\.(tsx?|jsx?)$/, '').replace(/\//g, '__');
  const filename = `${baseName}__${artifact.componentKey}__${artifact.state}.figma-delta.json`;
  const artifactPath = join(artifactDir, filename);

  // Write artifact
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(artifactPath, content, 'utf-8');

  return artifactPath;
}

/**
 * Write all delta artifacts from batch output.
 *
 * Only writes artifacts for variants that have deltas.
 * Skips variants with no changes.
 *
 * @param batchOutput - Batch delta output
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Array of paths where artifacts were written
 */
export async function writeDeltaArtifacts(
  batchOutput: BatchDeltaOutput,
  repoRoot?: string
): Promise<string[]> {
  const artifacts = buildDeltaArtifacts(batchOutput);
  const paths: string[] = [];

  for (const artifact of artifacts) {
    const path = await writeDeltaArtifact(
      batchOutput.sourceFile,
      artifact,
      repoRoot
    );
    paths.push(path);
  }

  return paths;
}

// =============================================================================
// SUMMARY ARTIFACT (Combined)
// =============================================================================

/**
 * Combined delta summary artifact containing all variants.
 *
 * Alternative to per-variant artifacts for easier review.
 */
export interface CombinedDeltaArtifact {
  version: '1.0';
  source: 'figma';
  timestamp: string;
  sourceFile: string;
  variants: FigmaDeltaArtifact[];
  summary: {
    totalVariants: number;
    variantsWithDeltas: number;
    totalDeltas: number;
  };
}

/**
 * Build a combined artifact from batch output.
 *
 * @param batchOutput - Batch delta output
 * @returns Combined artifact with all variants
 */
export function buildCombinedArtifact(
  batchOutput: BatchDeltaOutput
): CombinedDeltaArtifact {
  const variants = buildDeltaArtifacts(batchOutput);

  return {
    version: '1.0',
    source: 'figma',
    timestamp: new Date().toISOString(),
    sourceFile: batchOutput.sourceFile,
    variants,
    summary: {
      totalVariants: batchOutput.summary.totalVariants,
      variantsWithDeltas: batchOutput.summary.variantsWithDeltas,
      totalDeltas: batchOutput.summary.totalDeltas,
    },
  };
}

/**
 * Write combined delta artifact.
 *
 * @param batchOutput - Batch delta output
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Path where artifact was written
 */
export async function writeCombinedDeltaArtifact(
  batchOutput: BatchDeltaOutput,
  repoRoot?: string
): Promise<string> {
  const root = repoRoot ?? getRepoRoot();
  const artifactDir = join(root, DEFAULT_ARTIFACT_DIR);

  // Ensure directory exists
  if (!existsSync(artifactDir)) {
    await mkdir(artifactDir, { recursive: true });
  }

  const artifactPath = getDeltaArtifactPath(batchOutput.sourceFile, root);
  const artifact = buildCombinedArtifact(batchOutput);
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(artifactPath, content, 'utf-8');

  return artifactPath;
}
