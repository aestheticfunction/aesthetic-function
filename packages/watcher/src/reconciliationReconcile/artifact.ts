/**
 * @aesthetic-function/watcher - reconciliationReconcile/artifact.ts
 *
 * Phase 14A: Bundle Artifact Writer.
 *
 * WHY: Writes the single bundle artifact that links all reconcile step outputs.
 *
 * SCOPE:
 * - Artifact path generation
 * - Atomic write (temp + rename)
 * - Human-readable formatting
 *
 * CONSTRAINTS:
 * - Deterministic output
 * - Repo-root invariant paths
 */

import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  ReconcileBundleArtifact,
} from './types.js';
import { getRepoRoot } from './compute.js';

// =============================================================================
// ARTIFACT PATH
// =============================================================================

/**
 * Get the bundle artifact path for a source file.
 *
 * Pattern: design-materializations/<canonical>.figma-reconcile.json
 *
 * @param sourceFileCanonical - Canonical source file path (repo-relative)
 * @returns Repo-relative artifact path
 */
export function getBundleArtifactPath(sourceFileCanonical: string): string {
  // Convert path separators to __ and remove extension
  const normalized = sourceFileCanonical
    .replace(/\//g, '__')
    .replace(/\.(tsx?|jsx?)$/, '');

  return `design-materializations/${normalized}.figma-reconcile.json`;
}

// =============================================================================
// ARTIFACT WRITER
// =============================================================================

/**
 * Result of writing a bundle artifact.
 */
export interface WriteBundleResult {
  /**
   * Whether the artifact was written successfully.
   */
  written: boolean;

  /**
   * The artifact path (repo-relative).
   */
  path: string;

  /**
   * Error message if write failed.
   */
  error?: string;
}

/**
 * Write bundle artifact to disk.
 *
 * Uses atomic write (temp + rename) to prevent partial writes.
 *
 * @param bundle - Bundle artifact to write
 * @param repoRoot - Repository root path (optional, auto-detected if not provided)
 * @returns Write result
 */
export function writeBundleArtifact(
  bundle: ReconcileBundleArtifact,
  repoRoot?: string
): WriteBundleResult {
  const root = repoRoot ?? getRepoRoot();
  const artifactPath = getBundleArtifactPath(bundle.sourceFileCanonical);
  const fullPath = join(root, artifactPath);

  try {
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write to temp file first (atomic write)
    const tempPath = `${fullPath}.${randomUUID()}.tmp`;
    const content = JSON.stringify(bundle, null, 2);
    writeFileSync(tempPath, content, 'utf-8');

    // Rename to final path
    renameSync(tempPath, fullPath);

    return {
      written: true,
      path: artifactPath,
    };
  } catch (error) {
    return {
      written: false,
      path: artifactPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a bundle artifact for human-readable output.
 *
 * Shows:
 * - Repo root, source file canonical, profile, mode
 * - Per-step: ok/fail + artifact path if present
 * - Overall result + exit code
 *
 * @param bundle - Bundle artifact to format
 * @returns Formatted string
 */
export function formatBundle(bundle: ReconcileBundleArtifact): string {
  const lines: string[] = [];

  // Header
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│                     RECONCILE SUMMARY                           │');
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Metadata
  lines.push(`Source:     ${bundle.sourceFileCanonical}`);
  lines.push(`Profile:    ${bundle.profile}`);
  lines.push(`Mode:       ${bundle.mode}`);
  lines.push(`Timestamp:  ${bundle.timestamp}`);
  lines.push('');

  // Steps table
  lines.push('Steps:');
  lines.push('───────────────────────────────────────────────────────────────────');

  for (const step of bundle.steps) {
    const status = step.ok ? '✓' : '✗';
    const statusColor = step.ok ? 'PASS' : 'FAIL';
    const artifact = step.artifactPath ? `  → ${step.artifactPath}` : '';
    lines.push(`  ${status} ${step.step.padEnd(10)} [${statusColor}]${artifact}`);

    // Show warnings if any
    if (step.warnings && step.warnings.length > 0) {
      for (const warning of step.warnings) {
        lines.push(`      ⚠ ${warning}`);
      }
    }
  }

  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('');

  // Overall
  const overallStatus = bundle.overall.ok ? '✓ PASS' : '✗ FAIL';
  lines.push(`Overall:    ${overallStatus}`);
  lines.push(`Verdict:    ${bundle.overall.ciVerdict ?? 'N/A'}`);
  lines.push(`Reason:     ${bundle.overall.explanation}`);

  return lines.join('\n');
}

/**
 * Format bundle with verbose output.
 *
 * Includes additional details like repo root and all warnings.
 *
 * @param bundle - Bundle artifact to format
 * @returns Formatted string
 */
export function formatBundleVerbose(bundle: ReconcileBundleArtifact): string {
  const lines: string[] = [];

  // Header
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│                     RECONCILE SUMMARY                           │');
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Verbose metadata
  lines.push(`Repo Root:        ${bundle.repoRoot}`);
  lines.push(`Source (input):   ${bundle.sourceFileInput}`);
  lines.push(`Source (canon):   ${bundle.sourceFileCanonical}`);
  lines.push(`Profile:          ${bundle.profile}`);
  lines.push(`Mode:             ${bundle.mode}`);
  lines.push(`Timestamp:        ${bundle.timestamp}`);
  lines.push('');

  // Steps table with details
  lines.push('Steps:');
  lines.push('───────────────────────────────────────────────────────────────────');

  for (const step of bundle.steps) {
    const status = step.ok ? '✓' : '✗';
    const exitCode = `exit=${step.exitCode}`;
    lines.push(`  ${status} ${step.step.padEnd(10)} [${exitCode}]`);

    if (step.summary) {
      lines.push(`      Summary: ${step.summary}`);
    }

    if (step.artifactPath) {
      lines.push(`      Artifact: ${step.artifactPath}`);
    }

    if (step.warnings && step.warnings.length > 0) {
      for (const warning of step.warnings) {
        lines.push(`      ⚠ ${warning}`);
      }
    }
  }

  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('');

  // Artifacts summary
  const artifactCount = Object.keys(bundle.artifacts).length;
  lines.push(`Artifacts Written: ${artifactCount}`);
  if (artifactCount > 0) {
    for (const [step, path] of Object.entries(bundle.artifacts)) {
      lines.push(`  - ${step}: ${path}`);
    }
  }
  lines.push('');

  // Overall
  const overallStatus = bundle.overall.ok ? '✓ PASS' : '✗ FAIL';
  lines.push(`Overall:    ${overallStatus}`);
  lines.push(`Verdict:    ${bundle.overall.ciVerdict ?? 'N/A'}`);
  lines.push(`Reason:     ${bundle.overall.explanation}`);

  return lines.join('\n');
}

// Re-export getRepoRoot for convenience
export { getRepoRoot } from './compute.js';
