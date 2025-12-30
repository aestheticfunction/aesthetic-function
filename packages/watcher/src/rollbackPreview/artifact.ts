/**
 * @aesthetic-function/watcher - rollbackPreview/artifact.ts
 *
 * Phase 12I: Rollback Preview Artifact Writing.
 *
 * WHY: Produces deterministic rollback preview artifacts that can be
 * reviewed by humans or processed by CI systems.
 *
 * SCOPE:
 * - Write rollback preview artifacts
 * - Append to audit log
 * - Deterministic output format
 *
 * CONSTRAINTS:
 * - Read-only preview (no actual rollback)
 * - Atomic writes (temp + rename)
 * - Only writes if actions exist
 */

import { mkdir, writeFile, appendFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { RollbackPreview } from './types.js';

// =============================================================================
// ARTIFACT PATH
// =============================================================================

/**
 * Get the rollback preview artifact path for a source file.
 *
 * Pattern: design-materializations/<normalized-path>.figma-rollback-preview.json
 */
export function getRollbackPreviewArtifactPath(sourceFile: string): string {
  // Normalize path: replace / with __ and remove extension
  const normalized = sourceFile
    .replace(/\//g, '__')
    .replace(/\.(tsx?|jsx?)$/, '');

  return `design-materializations/${normalized}.figma-rollback-preview.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write rollback preview artifact to disk (atomic write).
 *
 * Only writes if actions.length > 0.
 * Uses temp file + rename for atomicity.
 *
 * @param preview - The rollback preview
 * @param repoRoot - Repository root path
 * @returns Path where artifact was written, or null if no actions
 */
export async function writeRollbackPreviewArtifact(
  preview: RollbackPreview,
  repoRoot: string
): Promise<string | null> {
  // Only write if there are rollback actions
  if (preview.actions.length === 0) {
    return null;
  }

  const artifactPath = getRollbackPreviewArtifactPath(preview.sourceFile);
  const fullPath = join(repoRoot, artifactPath);
  const tempPath = `${fullPath}.tmp`;

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write to temp file first
  await writeFile(tempPath, JSON.stringify(preview, null, 2), 'utf-8');

  // Atomic rename
  try {
    await rename(tempPath, fullPath);
  } catch (renameError) {
    // Fallback: try direct write if rename fails (e.g., cross-device)
    await writeFile(fullPath, JSON.stringify(preview, null, 2), 'utf-8');
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  return artifactPath;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

/**
 * Append rollback preview summary to audit log.
 *
 * @param preview - The rollback preview
 * @param repoRoot - Repository root path
 */
export async function appendRollbackPreviewToAuditLog(
  preview: RollbackPreview,
  repoRoot: string
): Promise<void> {
  const logPath = join(repoRoot, 'sync-log.md');

  // Build log entry
  const lines: string[] = [];

  lines.push('');
  lines.push(`## [${preview.timestamp}] Rollback Preview: ${preview.sourceFile}`);
  lines.push('');
  lines.push(`**Total rollback actions:** ${preview.summary.total}`);
  lines.push('');

  // By target
  if (Object.keys(preview.summary.byTarget).length > 0) {
    lines.push('**By Target:**');
    for (const [target, count] of Object.entries(preview.summary.byTarget)) {
      lines.push(`- ${target}: ${count}`);
    }
    lines.push('');
  }

  // By property
  if (Object.keys(preview.summary.byProperty).length > 0) {
    lines.push('**By Property:**');
    for (const [property, count] of Object.entries(preview.summary.byProperty)) {
      lines.push(`- ${property}: ${count}`);
    }
    lines.push('');
  }

  // Actions summary
  if (preview.actions.length > 0 && preview.actions.length <= 10) {
    lines.push('**Actions:**');
    for (const action of preview.actions) {
      lines.push(
        `- ${action.componentKey}::${action.targetState}::${action.property} → ${action.target} (${action.verificationStatus})`
      );
    }
    lines.push('');
  } else if (preview.actions.length > 10) {
    lines.push(`**Actions:** ${preview.actions.length} (see artifact for details)`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Append to log
  await appendFile(logPath, lines.join('\n'), 'utf-8');
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format rollback preview for CLI output.
 */
export function formatRollbackPreview(preview: RollbackPreview): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=== ROLLBACK PREVIEW (Phase 12I) ===');
  lines.push('');

  if (preview.actions.length === 0) {
    lines.push('No rollback actions needed.');
    lines.push('All verification items passed or were skipped.');
    return lines.join('\n');
  }

  // Group actions by component
  const byComponent = new Map<string, typeof preview.actions>();
  for (const action of preview.actions) {
    const key = `${action.componentKey}::${action.targetState}`;
    if (!byComponent.has(key)) {
      byComponent.set(key, []);
    }
    byComponent.get(key)!.push(action);
  }

  // Output grouped actions
  for (const [componentState, actions] of byComponent) {
    lines.push(componentState);
    for (const action of actions) {
      lines.push(`  ${action.property}:`);
      lines.push(`    applied  → ${formatValue(action.appliedValue)}`);
      lines.push(`    previous → ${formatValue(action.previousValue)}`);
      lines.push(`    target   → ${action.target}`);
      lines.push(`    reason   → ${action.verificationStatus}`);
    }
    lines.push('');
  }

  // Summary
  lines.push('Summary:');
  lines.push(`  Total rollback actions: ${preview.summary.total}`);

  if (Object.keys(preview.summary.byTarget).length > 0) {
    const targetSummary = Object.entries(preview.summary.byTarget)
      .map(([t, c]) => `${t} (${c})`)
      .join(', ');
    lines.push(`  Targets: ${targetSummary}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '(unknown)';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}
