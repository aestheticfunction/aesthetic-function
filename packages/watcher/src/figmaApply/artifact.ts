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
import { dirname, join, resolve } from 'node:path';
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
 * Converts path separators to double underscores for flat file structure.
 * Example: "demo-app/src/App.tsx" → "demo-app__src__App.figma-apply.json"
 */
export function generateArtifactName(sourceFile: string): string {
  // Remove leading ./ or / if present
  let normalized = sourceFile.replace(/^\.?\//, '');

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
 * @param sourceFile - Source file path for artifact naming
 * @param repoRoot - Optional override for repo root (for testing)
 * @returns Absolute path to the artifact file
 */
export function getArtifactPath(
  sourceFile: string,
  repoRoot?: string
): string {
  const root = repoRoot ?? getRepoRoot();
  const filename = generateArtifactName(sourceFile);
  return join(root, DEFAULT_ARTIFACT_DIR, filename);
}

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

/**
 * Build an ApplyArtifact from ApplyOutput.
 */
export function buildApplyArtifact(
  sourceFile: string,
  output: ApplyOutput,
  config: ApplyConfig,
  results?: ApplyResult[]
): ApplyArtifact {
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    sourceFile,
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
