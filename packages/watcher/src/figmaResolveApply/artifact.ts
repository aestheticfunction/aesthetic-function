/**
 * @aesthetic-function/watcher - figmaResolveApply/artifact.ts
 *
 * Phase 12F: Apply Artifact Generation.
 *
 * WHY: Generates auditable artifacts for resolution plan application.
 * Every apply (even dry-run) produces a JSON artifact for review.
 *
 * OUTPUT: design-materializations/<file>.figma-resolution-apply.json
 */

import { writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ResolutionApplyArtifact,
  ResolutionApplyResultItem,
  ResolutionApplySummary,
  ResolutionApplyMode,
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
 * Converts: demo-app/src/App.tsx → design-materializations/demo-app__src__App.figma-resolution-apply.json
 */
export function getResolveApplyArtifactPath(sourceFile: string): string {
  // Remove extension and convert path separators to underscores
  const normalized = sourceFile
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/\//g, '__'); // Convert / to __

  return `${MATERIALIZATIONS_DIR}/${normalized}.figma-resolution-apply.json`;
}

// =============================================================================
// BUILD ARTIFACT
// =============================================================================

/**
 * Build the apply artifact.
 */
export function buildResolveApplyArtifact(
  sourceFile: string,
  planPath: string,
  mode: ResolutionApplyMode,
  dryRun: boolean,
  summary: ResolutionApplySummary,
  results: ResolutionApplyResultItem[]
): ResolutionApplyArtifact {
  return {
    version: '1.0',
    source: 'figma-resolution-apply',
    sourceFile,
    planPath,
    mode,
    dryRun,
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };
}

// =============================================================================
// WRITE ARTIFACT
// =============================================================================

/**
 * Write the apply artifact to disk.
 *
 * Always writes (even for empty results) to document the attempt.
 *
 * @param artifact - The artifact to write
 * @param repoRoot - Repository root path
 * @returns Path to written artifact
 */
export async function writeResolveApplyArtifact(
  artifact: ResolutionApplyArtifact,
  repoRoot: string = getRepoRoot()
): Promise<string> {
  const relativePath = getResolveApplyArtifactPath(artifact.sourceFile);
  const absolutePath = join(repoRoot, relativePath);

  // Ensure directory exists
  await mkdir(dirname(absolutePath), { recursive: true });

  // Write artifact
  const content = JSON.stringify(artifact, null, 2);
  await writeFile(absolutePath, content + '\n', 'utf-8');

  return relativePath;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

/**
 * Append an entry to the audit log.
 *
 * Only appends if:
 * - ENABLE_AUDIT_LOG=true
 * - mode=apply
 * - dryRun=false
 *
 * @param artifact - The apply artifact
 * @param repoRoot - Repository root path
 */
export async function appendResolveApplyToAuditLog(
  artifact: ResolutionApplyArtifact,
  repoRoot: string = getRepoRoot()
): Promise<void> {
  // Check if audit logging is enabled
  const auditEnabled = process.env.ENABLE_AUDIT_LOG === 'true';
  if (!auditEnabled) {
    return;
  }

  // Only log actual applies (not artifact-only or dry-run)
  if (artifact.mode !== 'apply' || artifact.dryRun) {
    return;
  }

  const logPath = join(repoRoot, 'sync-log.md');

  // Format the log entry
  const timestamp = artifact.generatedAt;
  const sourceFile = artifact.sourceFile;
  const summary = artifact.summary;

  // Build summary text
  const counts = [
    `applied=${summary.applied}`,
    `noop=${summary.noop}`,
    `skipped=${summary.skipped}`,
    `blocked=${summary.blocked}`,
    `failed=${summary.failed}`,
  ].join(', ');

  // Get failures
  const failures = artifact.results
    .filter((r) => r.status === 'failed')
    .map((r) => `${r.componentKey}::${r.property}: ${r.error}`)
    .slice(0, 5); // Limit to first 5

  const failureText = failures.length > 0
    ? ` | Failures: ${failures.join('; ')}`
    : '';

  const entry = `| ${timestamp} | resolve-apply | ${sourceFile} | ${artifact.mode} | ${summary.decisionsTotal} decisions | ${counts}${failureText} |\n`;

  // Append to log
  await appendFile(logPath, entry, 'utf-8');
}
