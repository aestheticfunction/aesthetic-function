/**
 * @aesthetic-function/watcher - figmaDeltaApply/artifact.ts
 *
 * Phase 12C: Apply Artifact Generation.
 *
 * WHY: Generates auditable artifacts for delta apply operations.
 * Every apply (even dry-run) produces a JSON artifact for review.
 *
 * OUTPUT: design-materializations/<file>.figma-delta-apply.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DeltaApplyArtifact,
  DeltaApplyOp,
  OpApplyResult,
  DeltaApplySummary,
  DeltaApplyMode,
} from './types.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  return resolve(__dirname, '..', '..', '..', '..');
}

/** Directory for materializations */
const MATERIALIZATIONS_DIR = 'design-materializations';

/**
 * Get the artifact path for a source file.
 *
 * Converts: demo-app/src/App.tsx → design-materializations/demo-app__src__App.figma-delta-apply.json
 */
export function getDeltaApplyArtifactPath(sourceFile: string): string {
  // Remove extension and convert path separators to underscores
  const normalized = sourceFile
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/\//g, '__'); // Convert / to __

  return join(MATERIALIZATIONS_DIR, `${normalized}.figma-delta-apply.json`);
}

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

/**
 * Build the delta apply artifact.
 */
export function buildDeltaApplyArtifact(
  sourceFile: string,
  mode: DeltaApplyMode,
  dryRun: boolean,
  ops: DeltaApplyOp[],
  results: OpApplyResult[],
  violations: string[],
  summary: DeltaApplySummary
): DeltaApplyArtifact {
  return {
    version: '1.0',
    source: 'figma-delta-apply',
    generatedAt: new Date().toISOString(),
    sourceFile,
    mode,
    dryRun,
    ops,
    results,
    violations,
    summary,
  };
}

// =============================================================================
// ARTIFACT WRITING
// =============================================================================

/**
 * Write the delta apply artifact to disk.
 *
 * @returns Absolute path to the artifact file
 */
export async function writeDeltaApplyArtifact(
  sourceFile: string,
  mode: DeltaApplyMode,
  dryRun: boolean,
  ops: DeltaApplyOp[],
  results: OpApplyResult[],
  violations: string[],
  summary: DeltaApplySummary
): Promise<string> {
  const repoRoot = getRepoRoot();
  const relativePath = getDeltaApplyArtifactPath(sourceFile);
  const absolutePath = join(repoRoot, relativePath);

  // Ensure directory exists
  const dir = dirname(absolutePath);
  await mkdir(dir, { recursive: true });

  // Build and write artifact
  const artifact = buildDeltaApplyArtifact(
    sourceFile,
    mode,
    dryRun,
    ops,
    results,
    violations,
    summary
  );

  await writeFile(absolutePath, JSON.stringify(artifact, null, 2), 'utf-8');

  return absolutePath;
}

/**
 * Append to audit log.
 */
export async function appendToAuditLog(
  filePath: string,
  ops: DeltaApplyOp[],
  results: OpApplyResult[],
  summary: DeltaApplySummary
): Promise<void> {
  const repoRoot = getRepoRoot();
  const auditLogPath = join(repoRoot, MATERIALIZATIONS_DIR, 'delta-apply-audit.log');

  // Ensure directory exists
  const dir = dirname(auditLogPath);
  await mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `\n## [${timestamp}] Delta Apply - ${filePath}`,
    `Operations: ${summary.total} total, ${summary.applied.total} applied, ${summary.skipped.total} skipped`,
    '',
  ];

  // Log applied operations
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const op = ops[i];

    if (result.applied) {
      lines.push(
        `✓ APPLIED [${op.target}] ${op.componentKey}::${op.targetState}/${op.property} → ${op.to}`
      );
      if (result.appliedLocation) {
        lines.push(`  Location: ${result.appliedLocation}`);
      }
    } else if (result.skipped) {
      lines.push(
        `✗ SKIPPED [${op.target}] ${op.componentKey}::${op.targetState}/${op.property}`
      );
      lines.push(`  Reason: ${result.skipReason}`);
    }
  }

  lines.push('');

  try {
    const { appendFile } = await import('node:fs/promises');
    try {
      await appendFile(auditLogPath, lines.join('\n'), 'utf-8');
    } catch {
      // If file doesn't exist, create it
      await writeFile(auditLogPath, lines.join('\n'), 'utf-8');
    }
  } catch {
    // Audit logging should not block applies
    console.warn('[Delta Apply] Failed to write audit log');
  }
}
