/**
 * @aesthetic-function/watcher - verification/artifact.ts
 *
 * Phase 12G: Verification Artifact Generation.
 *
 * WHY: Produces deterministic verification artifacts that can be
 * reviewed by humans or processed by CI systems.
 *
 * SCOPE:
 * - Write verification artifacts
 * - Append to audit log
 * - Deterministic output format
 *
 * CONSTRAINTS:
 * - Verification-only (no mutations to source files)
 * - Deterministic: same inputs → same artifact
 */

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { VerificationReport } from './types.js';

// =============================================================================
// ARTIFACT PATH
// =============================================================================

/**
 * Get the verification artifact path for a source file.
 *
 * Pattern: design-materializations/<normalized-path>.figma-verification.json
 */
export function getVerificationArtifactPath(sourceFile: string): string {
  // Normalize path: replace / with __ and remove extension
  const normalized = sourceFile
    .replace(/\//g, '__')
    .replace(/\.(tsx?|jsx?)$/, '');

  return `design-materializations/${normalized}.figma-verification.json`;
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write verification artifact to disk.
 *
 * @param report - The verification report
 * @param repoRoot - Repository root path
 * @returns Path where artifact was written
 */
export async function writeVerificationArtifact(
  report: VerificationReport,
  repoRoot: string
): Promise<string> {
  const artifactPath = getVerificationArtifactPath(report.sourceFile);
  const fullPath = join(repoRoot, artifactPath);

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write artifact
  await writeFile(fullPath, JSON.stringify(report, null, 2), 'utf-8');

  return artifactPath;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

/**
 * Append verification summary to audit log.
 *
 * Only logs if there are mismatches or missing items.
 *
 * @param report - The verification report
 * @param repoRoot - Repository root path
 */
export async function appendVerificationToAuditLog(
  report: VerificationReport,
  repoRoot: string
): Promise<void> {
  const logPath = join(repoRoot, 'sync-log.md');

  // Build log entry
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  lines.push('');
  lines.push(`## [${timestamp}] Verification: ${report.sourceFile}`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Verified | ${report.summary.verified} |`);
  lines.push(`| Mismatch | ${report.summary.mismatch} |`);
  lines.push(`| Missing | ${report.summary.missing} |`);
  lines.push(`| Skipped | ${report.summary.skipped} |`);
  lines.push(`| Blocked | ${report.summary.blocked} |`);

  // Add details for mismatches/missing
  const issues = report.items.filter(
    (item) => item.status === 'mismatch' || item.status === 'missing'
  );

  if (issues.length > 0) {
    lines.push('');
    lines.push('### Issues');
    lines.push('');
    for (const item of issues) {
      lines.push(
        `- **${item.componentKey}::${item.targetState}::${item.property}** — ${item.status}: ${item.reason}`
      );
    }
  }

  lines.push('');

  // Append to log
  await appendFile(logPath, lines.join('\n'), 'utf-8');
}

// =============================================================================
// SUMMARY HELPERS
// =============================================================================

/**
 * Check if verification report should trigger artifact write.
 *
 * Writes artifact if:
 * - There are mismatches or missing items
 * - OR alwaysWriteArtifact is true
 */
export function shouldWriteArtifact(
  report: VerificationReport,
  alwaysWrite: boolean
): boolean {
  if (alwaysWrite) return true;
  return report.summary.mismatch > 0 || report.summary.missing > 0;
}

/**
 * Get exit code for CLI based on verification results.
 *
 * Exit codes:
 * - 0: All verified or skipped (success)
 * - 1: Mismatches or missing items (failure)
 */
export function getVerificationExitCode(report: VerificationReport): number {
  if (report.summary.mismatch > 0 || report.summary.missing > 0) {
    return 1;
  }
  return 0;
}
