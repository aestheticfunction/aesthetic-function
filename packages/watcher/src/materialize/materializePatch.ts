/**
 * @aesthetic-function/watcher - materialize/materializePatch.ts
 *
 * Generates patch artifact files from design overrides.
 *
 * WHY: Patch mode creates a reviewable artifact that can later be
 * applied to code. This is safer than direct file edits and allows
 * designers and developers to review changes before committing.
 *
 * OUTPUT: design-materializations/<relative-path>.patch.json
 */

import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Intent } from '../transform/types.js';
import type { DesignOverrides, DesignOverride } from '../reconcile/types.js';
import type {
  PatchArtifact,
  PatchChange,
  MaterializeResult,
} from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Directory for patch artifacts, relative to repo root.
 */
export const MATERIALIZATIONS_DIR = 'design-materializations';

// =============================================================================
// PATCH GENERATION
// =============================================================================

/**
 * Build a PatchChange from a code intent and design override.
 *
 * @param nodeName - Node name
 * @param intent - Intent from code (may be undefined if no matching marker)
 * @param override - Override from design
 * @returns PatchChange or null if no actual changes
 */
function buildPatchChange(
  nodeName: string,
  intent: Intent | undefined,
  override: DesignOverride
): PatchChange | null {
  const before: { text?: string; fill?: string } = {};
  const after: { text?: string; fill?: string } = {};
  let hasChanges = false;

  // Extract text from intent
  if (override.text !== undefined) {
    if (intent?.type === 'TEXT') {
      before.text = intent.characters;
    } else if (intent?.type === 'BUTTON') {
      before.text = intent.text;
    }
    after.text = override.text;
    
    // Only count as change if different
    if (before.text !== after.text) {
      hasChanges = true;
    }
  }

  // Extract fill from intent
  if (override.fill !== undefined) {
    if (intent?.type === 'BUTTON' || intent?.type === 'FRAME') {
      before.fill = intent.fillTokenOrHex;
    } else if (intent?.type === 'TEXT') {
      before.fill = intent.colorTokenOrHex;
    }
    after.fill = override.fill;
    
    // Only count as change if different
    if (before.fill !== after.fill) {
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return null;
  }

  return {
    node: nodeName,
    before,
    after,
    source: 'design-overrides.json',
    nodeId: override.nodeId,
  };
}

/**
 * Compute patch changes for a file.
 *
 * @param intents - Intents extracted from the file
 * @param overrides - Design overrides to apply
 * @returns Patch changes and unapplied override names
 */
export function computePatchChanges(
  intents: Intent[],
  overrides: DesignOverrides
): { changes: PatchChange[]; unapplied: string[] } {
  const changes: PatchChange[] = [];
  const unapplied: string[] = [];

  // Build a map of intents by node name
  const intentMap = new Map<string, Intent>();
  for (const intent of intents) {
    intentMap.set(intent.nodeName, intent);
  }

  // Process each override
  for (const [nodeName, override] of Object.entries(overrides)) {
    const intent = intentMap.get(nodeName);

    // If no matching intent, it's unapplied
    if (!intent) {
      unapplied.push(nodeName);
      continue;
    }

    const change = buildPatchChange(nodeName, intent, override);
    if (change) {
      changes.push(change);
    }
  }

  return { changes, unapplied };
}

/**
 * Generate a patch artifact file path.
 *
 * @param relativePath - Relative path to source file
 * @param repoRoot - Repository root path
 * @returns Absolute path to patch artifact
 */
export function getPatchArtifactPath(
  relativePath: string,
  repoRoot: string
): string {
  // Replace path separators and add .patch.json extension
  const safePath = relativePath.replace(/\//g, '__');
  return join(repoRoot, MATERIALIZATIONS_DIR, `${safePath}.patch.json`);
}

/**
 * Write a patch artifact file atomically.
 *
 * @param artifact - Patch artifact to write
 * @param artifactPath - Path to write to
 */
async function writePatchArtifact(
  artifact: PatchArtifact,
  artifactPath: string
): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(artifactPath), { recursive: true });

  // Write atomically: temp file then rename
  const tempPath = `${artifactPath}.tmp`;
  const content = JSON.stringify(artifact, null, 2);

  try {
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, artifactPath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Generate and optionally write a patch artifact.
 *
 * @param options - Materialization options
 * @returns Materialization result
 */
export async function materializePatch(options: {
  /** Relative path to source file */
  relativePath: string;
  /** Repository root path */
  repoRoot: string;
  /** Intents extracted from the file */
  intents: Intent[];
  /** Design overrides to apply */
  overrides: DesignOverrides;
  /** Whether this is a dry run (no writes) */
  dryRun: boolean;
}): Promise<MaterializeResult> {
  const { relativePath, repoRoot, intents, overrides, dryRun } = options;

  // Compute changes
  const { changes, unapplied } = computePatchChanges(intents, overrides);

  // If no changes, return early
  if (changes.length === 0) {
    return {
      mode: 'patch',
      dryRun,
      changes: 0,
      unapplied: unapplied.length,
    };
  }

  // Build artifact
  const artifact: PatchArtifact = {
    file: relativePath,
    generatedAt: new Date().toISOString(),
    changes,
  };

  const artifactPath = getPatchArtifactPath(relativePath, repoRoot);

  // Write unless dry run
  if (!dryRun) {
    await writePatchArtifact(artifact, artifactPath);
  }

  return {
    mode: 'patch',
    dryRun,
    changes: changes.length,
    unapplied: unapplied.length,
    artifactPath,
  };
}
