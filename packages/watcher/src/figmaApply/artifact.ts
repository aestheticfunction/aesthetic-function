/**
 * @aesthetic-function/watcher - figmaApply/artifact.ts
 *
 * Phase 11C: Apply Artifact Generation.
 *
 * WHY: Writes review artifacts to design-materializations/ for
 * human review before applying changes to Figma.
 *
 * ARTIFACT STRUCTURE:
 * - Before/after values for each operation
 * - Canonical source tokens
 * - Confidence levels
 * - Policy violations and notes
 * - Summary statistics
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import type {
  ApplyArtifact,
  ApplyOutput,
  ApplyConfig,
  ApplyResult,
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
 * Handles:
 * - Relative paths (../../demo-app/src/App.tsx)
 * - Absolute paths (/Users/.../demo-app/src/App.tsx)
 * - Already repo-relative paths (demo-app/src/App.tsx)
 *
 * Resolution order:
 * 1. If absolute, make it relative to repo root
 * 2. If relative with ../, resolve against cwd then make relative to repo
 * 3. If simple relative (no ../), prefer repo-root interpretation if file exists there
 * 4. Otherwise resolve against cwd
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
    // Path is absolute but not under repo root - use as-is
    return inputPath.replace(/\\/g, '/');
  }

  // If path has parent references (../), resolve against cwd first
  if (inputPath.startsWith('../') || inputPath.startsWith('./')) {
    const absolutePath = resolve(process.cwd(), inputPath);
    if (absolutePath.startsWith(root + '/')) {
      return relative(root, absolutePath).replace(/\\/g, '/');
    }
    // Strip parent references and use as-is
    return inputPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '').replace(/\\/g, '/');
  }

  // Simple relative path (like 'demo-app/src/App.tsx')
  // Check if it exists at repo root first
  const repoRootPath = join(root, inputPath);
  if (existsSync(repoRootPath)) {
    return inputPath.replace(/\\/g, '/');
  }

  // Otherwise resolve against cwd and make relative to repo
  const absolutePath = resolve(process.cwd(), inputPath);
  if (absolutePath.startsWith(root + '/')) {
    return relative(root, absolutePath).replace(/\\/g, '/');
  }

  // Fallback: use input as-is
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
 * Generate artifact filename from source file path.
 *
 * IMPORTANT: Input should be a normalized repo-relative path.
 * Use normalizeSourcePath() before calling this function.
 *
 * Converts path separators to double underscores for flat file structure.
 * Example: "demo-app/src/App.tsx" → "demo-app__src__App.figma-apply.json"
 */
export function generateArtifactName(sourceFile: string): string {
  // Remove leading ./ or / if present
  let normalized = sourceFile.replace(/^\.?\//, '');

  // Remove any parent directory references (should not happen with normalized input)
  normalized = normalized.replace(/\.\.\/|\.\.__/g, '');

  // Remove file extension
  normalized = normalized.replace(/\.(tsx?|jsx?)$/, '');

  // Replace path separators with double underscores
  normalized = normalized.replace(/\//g, '__');

  return `${normalized}.figma-apply.json`;
}

/**
 * Get full artifact path.
 *
 * Always resolves to repo-root/design-materializations/,
 * regardless of current working directory.
 *
 * Normalizes the source path to ensure consistent artifact naming
 * regardless of how the path was specified (relative, absolute, etc.).
 *
 * @param sourceFile - Source file path (will be normalized)
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path to the artifact file
 */
export function getArtifactPath(
  sourceFile: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();
  const normalizedSource = normalizeSourcePath(sourceFile, root);
  const filename = generateArtifactName(normalizedSource);
  return join(root, DEFAULT_ARTIFACT_DIR, filename);
}

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

/**
 * Build an ApplyArtifact from ApplyOutput.
 *
 * Normalizes the source file path to ensure consistent artifact naming
 * regardless of working directory or input path format.
 *
 * @param sourceFile - Source file path (will be normalized to repo-relative)
 * @param output - Apply output with operations and violations
 * @param config - Apply configuration
 * @param results - Optional execution results
 * @param repoRoot - Optional override for repo root (for testing)
 */
export function buildApplyArtifact(
  sourceFile: string,
  output: ApplyOutput,
  config: ApplyConfig,
  results?: ApplyResult[],
  repoRoot?: string
): ApplyArtifact {
  const normalizedSource = normalizeSourcePath(sourceFile, repoRoot);
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    sourceFile: normalizedSource,
    mode: config.mode,
    dryRun: config.dryRun,
    operations: output.operations,
    violations: output.violations,
    summary: output.summary,
    results,
  };
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write apply artifact to design-materializations/.
 *
 * Creates the output directory if it doesn't exist.
 * Always writes to repo-root/design-materializations/.
 *
 * @param artifact - The artifact to write
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path to the written artifact
 */
export async function writeApplyArtifact(
  artifact: ApplyArtifact,
  repoRoot?: string
): Promise<string> {
  const fullPath = getArtifactPath(artifact.sourceFile, repoRoot);

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write artifact as formatted JSON
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(fullPath, content, 'utf-8');

  return fullPath;
}

// =============================================================================
// ARTIFACT SUMMARY
// =============================================================================

/**
 * Generate human-readable summary for CLI output.
 */
export function formatArtifactSummary(artifact: ApplyArtifact): string {
  const lines: string[] = [];

  lines.push('=== FIGMA APPLY ARTIFACT (Phase 11C) ===');
  lines.push(`Source: ${artifact.sourceFile}`);
  lines.push(`Mode: ${artifact.mode}`);
  lines.push(`Dry-run: ${artifact.dryRun}`);
  lines.push(`Generated: ${artifact.timestamp}`);
  lines.push('');

  // Operations summary
  lines.push(`Operations: ${artifact.summary.totalOperations}`);
  if (artifact.summary.totalOperations > 0) {
    for (const [prop, count] of Object.entries(artifact.summary.byProperty)) {
      lines.push(`  - ${prop}: ${count}`);
    }
  }
  lines.push('');

  // Violations summary
  lines.push(`Violations: ${artifact.summary.totalViolations}`);
  if (artifact.summary.totalViolations > 0) {
    for (const [type, count] of Object.entries(artifact.summary.byViolationType)) {
      lines.push(`  - ${type}: ${count}`);
    }
  }
  lines.push('');

  // Results (if applied)
  if (artifact.results) {
    const succeeded = artifact.results.filter((r) => r.success).length;
    const failed = artifact.results.filter((r) => !r.success).length;
    lines.push(`Results: ${succeeded} succeeded, ${failed} failed`);
  }

  return lines.join('\n');
}

// =============================================================================
// OPERATION DETAILS
// =============================================================================

/**
 * Generate detailed operation list for verbose CLI output.
 */
export function formatOperationDetails(artifact: ApplyArtifact): string {
  const lines: string[] = [];

  lines.push('=== OPERATIONS DETAIL ===');

  for (const op of artifact.operations) {
    lines.push('');
    lines.push(`[${op.opId}]`);
    lines.push(`  Component: ${op.componentKey}`);
    lines.push(`  Node ID: ${op.nodeId}`);
    lines.push(`  Property: ${op.property}`);
    lines.push(`  Value: ${op.from ?? '(unset)'} → ${op.to}`);
    lines.push(`  Canonical: ${op.canonicalSource}`);
    lines.push(`  Confidence: ${op.confidence}`);
    lines.push(`  Reason: ${op.reason}`);
    if (op.policyNote) {
      lines.push(`  Note: ${op.policyNote}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate detailed violation list for verbose CLI output.
 */
export function formatViolationDetails(artifact: ApplyArtifact): string {
  const lines: string[] = [];

  lines.push('=== VIOLATIONS DETAIL ===');

  for (const v of artifact.violations) {
    lines.push('');
    lines.push(`[${v.type}]`);
    lines.push(`  Component: ${v.componentKey}`);
    if (v.property) {
      lines.push(`  Property: ${v.property}`);
    }
    if (v.canonicalSource) {
      lines.push(`  Canonical: ${v.canonicalSource}`);
    }
    lines.push(`  Message: ${v.message}`);
  }

  return lines.join('\n');
}
