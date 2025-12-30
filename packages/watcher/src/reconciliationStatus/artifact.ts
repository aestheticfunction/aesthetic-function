/**
 * @aesthetic-function/watcher - reconciliationStatus/artifact.ts
 *
 * Phase 12J: Reconciliation Status Artifact Writing.
 *
 * WHY: Writes status artifact to design-materializations/ for CI and human consumption.
 *
 * SCOPE:
 * - Write status artifacts
 * - Format status for human readability
 *
 * CONSTRAINTS:
 * - Only write if non-CLEAN status
 * - Deterministic output format
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ReconciliationStatus, ReconciliationStatusContext } from './types.js';
import { shouldWriteStatusArtifact } from './compute.js';

// =============================================================================
// ARTIFACT PATH HELPERS
// =============================================================================

/**
 * Get the status artifact path for a source file.
 */
export function getStatusArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-reconciliation-status.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write reconciliation status artifact to disk.
 *
 * Only writes if status is non-CLEAN.
 */
export async function writeReconciliationStatusArtifact(
  status: ReconciliationStatus,
  context: ReconciliationStatusContext
): Promise<{ written: boolean; path: string }> {
  const artifactPath = getStatusArtifactPath(context.sourceFile);
  const fullPath = join(context.repoRoot, artifactPath);

  // Only write non-CLEAN status
  if (!shouldWriteStatusArtifact(status)) {
    return { written: false, path: artifactPath };
  }

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write artifact with pretty formatting
  await writeFile(fullPath, JSON.stringify(status, null, 2), 'utf-8');

  return { written: true, path: artifactPath };
}

// =============================================================================
// FORMATTING
// =============================================================================

const VERDICT_ICONS: Record<string, string> = {
  PASS: '✅',
  WARN: '⚠️',
  FAIL: '❌',
};

const STATUS_ICONS: Record<string, string> = {
  CLEAN: '🧹',
  APPLIED_UNVERIFIED: '🔧',
  VERIFIED_OK: '✓',
  VERIFY_FAILED: '✗',
  ROLLBACK_AVAILABLE: '⏪',
  INCOMPLETE: '⏳',
};

/**
 * Format reconciliation status for human-readable CLI output.
 */
export function formatReconciliationStatus(status: ReconciliationStatus): string {
  const lines: string[] = [];

  // Header
  const verdictIcon = VERDICT_ICONS[status.ciVerdict] ?? '';
  const statusIcon = STATUS_ICONS[status.overallStatus] ?? '';
  lines.push(`${verdictIcon} Reconciliation Status: ${statusIcon} ${status.overallStatus}`);
  lines.push('');

  // Source file
  lines.push(`Source: ${status.sourceFile}`);
  lines.push(`Timestamp: ${status.timestamp}`);
  lines.push('');

  // Phases section
  lines.push('Phases:');

  if (status.phases.apply) {
    const { apply } = status.phases;
    const applyResult = apply.success ? '✓' : '✗';
    const modeLabel = apply.dryRun ? ' (dry-run)' : '';
    lines.push(`  • Apply: ${applyResult} ${apply.operationCount} operation(s)${modeLabel}`);
  } else {
    lines.push('  • Apply: not attempted');
  }

  if (status.phases.verify) {
    const { verify } = status.phases;
    const verifyResult = verify.success ? '✓' : '✗';
    lines.push(`  • Verify: ${verifyResult} ${verify.mismatchCount} mismatch(es), ${verify.missingCount} missing`);
  } else {
    lines.push('  • Verify: not attempted');
  }

  if (status.phases.rollbackPreview) {
    const { rollbackPreview } = status.phases;
    lines.push(`  • Rollback Preview: ${rollbackPreview.actionCount} action(s) available`);
  } else {
    lines.push('  • Rollback Preview: not generated');
  }

  lines.push('');

  // Explanation
  lines.push(`Explanation: ${status.explanation}`);
  lines.push('');

  // CI verdict
  lines.push(`CI Verdict: ${status.ciVerdict}`);
  const exitCode = status.ciVerdict === 'FAIL' ? 1 : 0;
  lines.push(`Exit Code: ${exitCode}`);

  return lines.join('\n');
}
