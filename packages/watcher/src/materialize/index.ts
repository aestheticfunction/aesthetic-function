/**
 * @aesthetic-function/watcher - materialize/index.ts
 *
 * Public API for design → code materialization.
 *
 * USAGE:
 *   import { materialize, isMaterializeEnabled } from './materialize/index.js';
 *
 *   if (isMaterializeEnabled()) {
 *     const result = await materialize({ ... });
 *     console.log(`Materialize: mode=${result.mode} changes=${result.changes}`);
 *   }
 */

// Re-export config helpers
export {
  getMaterializeMode,
  getMaterializeOn,
  getMaterializeDryRun,
  isMaterializeEnabled,
  type MaterializeMode,
  type MaterializeOn,
} from './config.js';

// Re-export types
export type {
  MaterializeChange,
  MaterializePrepareResult,
  PatchChange,
  PatchArtifact,
  MarkerEdit,
  MarkerEditResult,
  MaterializeResult,
} from './types.js';

// Re-export patch functions
export {
  computePatchChanges,
  getPatchArtifactPath,
  materializePatch,
  MATERIALIZATIONS_DIR,
} from './materializePatch.js';

// Re-export marker functions
export {
  computeMarkerEdits,
  applyMarkerEdits,
  materializeMarkers,
} from './materializeMarkers.js';

// =============================================================================
// IMPORTS FOR MAIN FUNCTION
// =============================================================================

import type { Intent } from '../transform/types.js';
import type { DesignOverrides } from '../reconcile/types.js';
import type { MaterializeResult } from './types.js';
import { getMaterializeMode, getMaterializeDryRun } from './config.js';
import { materializePatch } from './materializePatch.js';
import { materializeMarkers } from './materializeMarkers.js';

// =============================================================================
// MAIN MATERIALIZE FUNCTION
// =============================================================================

/**
 * Options for the materialize function.
 */
export interface MaterializeOptions {
  /** Absolute path to source file */
  absolutePath: string;
  /** Relative path for logging and artifacts */
  relativePath: string;
  /** File content (already read) */
  content: string;
  /** Intents extracted from the file */
  intents: Intent[];
  /** Design overrides to apply */
  overrides: DesignOverrides;
  /** Repository root path (for patch artifacts) */
  repoRoot: string;
  /** Override the mode from env var */
  mode?: 'patch' | 'markers';
  /** Override the dry-run flag from env var */
  dryRun?: boolean;
}

/**
 * Materialize design overrides to code artifacts.
 *
 * Routes to patch or markers mode based on configuration.
 *
 * @param options - Materialization options
 * @returns Materialization result, or null if mode is 'off'
 */
export async function materialize(
  options: MaterializeOptions
): Promise<MaterializeResult | null> {
  const mode = options.mode ?? getMaterializeMode();
  const dryRun = options.dryRun ?? getMaterializeDryRun();

  if (mode === 'off') {
    return null;
  }

  if (mode === 'patch') {
    return materializePatch({
      relativePath: options.relativePath,
      repoRoot: options.repoRoot,
      intents: options.intents,
      overrides: options.overrides,
      dryRun,
    });
  }

  if (mode === 'markers') {
    return materializeMarkers({
      absolutePath: options.absolutePath,
      relativePath: options.relativePath,
      content: options.content,
      overrides: options.overrides,
      dryRun,
    });
  }

  // Shouldn't reach here, but return null for safety
  return null;
}

/**
 * Log a materialization result summary.
 *
 * @param result - Materialization result
 * @param prefix - Log prefix (e.g., '[Watcher]')
 */
export function logMaterializeResult(
  result: MaterializeResult,
  prefix = '[Watcher]'
): void {
  const dryRunLabel = result.dryRun ? ' (dry-run)' : '';
  const unappliedLabel = result.unapplied > 0 ? ` unapplied=${result.unapplied}` : '';

  console.log(
    `${prefix} Materialize: mode=${result.mode}${dryRunLabel} changes=${result.changes}${unappliedLabel}`
  );

  // Log details for marker edits
  if (result.mode === 'markers' && result.edits && result.edits.length > 0) {
    for (const edit of result.edits) {
      console.log(`${prefix}   L${edit.lineNumber}: ${edit.nodeName}`);
    }
  }

  // Log artifact path for patch mode
  if (result.mode === 'patch' && result.artifactPath && !result.dryRun) {
    console.log(`${prefix}   → ${result.artifactPath}`);
  }
}
