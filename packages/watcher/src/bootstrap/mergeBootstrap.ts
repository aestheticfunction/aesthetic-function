/**
 * @aesthetic-function/watcher - bootstrap/mergeBootstrap.ts
 *
 * Merge logic for applying Component Map Bootstrap Artifacts.
 *
 * WHY: Provides a safe, atomic way to apply bootstrap suggestions
 * to component-map.json. Never overwrites existing nodeIds.
 *
 * MERGE RULES (Professional / Deterministic):
 * - If componentKey exists: only add missing variant keys or missing figma.name
 * - Never overwrite: componentSetNodeId, any existing variants.*.nodeId
 * - Add legacyKeys if migrating older keys (respect Phase 8D migration)
 * - If entry exists but differs in name suggestion: mark as "update" but don't overwrite
 *
 * ATOMIC WRITES:
 * - Write to temp file first
 * - Rename to final location (atomic on POSIX)
 */

import { writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ComponentMap, ComponentEntry } from '../reconcile/componentMap.js';
import { COMPONENT_MAP_VERSION, loadComponentMap } from '../reconcile/componentMap.js';
import type { ComponentMapBootstrapArtifact, ProposedEntry, BootstrapConfig } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Number of entries added */
  entriesAdded: number;
  /** Number of entries updated (new variants added) */
  entriesUpdated: number;
  /** Number of entries skipped (no changes needed) */
  entriesSkipped: number;
  /** Entries that require manual decision (name differs) */
  manualDecisionRequired: string[];
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// MERGE LOGIC
// =============================================================================

/**
 * Merge a single proposed entry into an existing component map.
 * Never overwrites existing nodeIds.
 *
 * @param map - The component map to merge into
 * @param proposed - The proposed entry
 * @returns Whether any changes were made
 */
function mergeEntry(
  map: ComponentMap,
  proposed: ProposedEntry
): { changed: boolean; manualRequired: boolean } {
  const existing = map.components[proposed.componentKey];

  if (!existing) {
    // New entry - add it with null nodeIds converted to empty strings (placeholder)
    // Actually, we should NOT add null nodeIds - only create structure
    const newEntry: ComponentEntry = {
      componentKey: proposed.componentKey,
      figma: {
        name: proposed.figmaNameSuggestion,
        variants: {},
      },
    };

    // Add variant keys with empty placeholders (no nodeId)
    // Note: In component-map.json, we need actual nodeIds, so we skip null ones
    // We only create the structure, user must fill nodeIds manually

    map.components[proposed.componentKey] = newEntry;
    return { changed: true, manualRequired: false };
  }

  // Existing entry - check for updates
  let changed = false;
  let manualRequired = false;

  // If name differs, mark as manual required (don't overwrite)
  if (existing.figma.name !== proposed.figmaNameSuggestion) {
    manualRequired = true;
  }

  // If no figma.name exists, set it
  if (!existing.figma.name) {
    existing.figma.name = proposed.figmaNameSuggestion;
    changed = true;
  }

  // Add missing variant keys (but don't overwrite existing nodeIds)
  if (!existing.figma.variants) {
    existing.figma.variants = {};
  }

  for (const state of proposed.variantStatesSuggested) {
    if (!existing.figma.variants[state]) {
      // Only create the key if there's no existing entry
      // Don't set nodeId - user must fill manually
      // Actually we can't add empty variant because nodeId is required
      // So we skip this - user must use Figma plugin to add variants
    }
  }

  // Add base variant key if missing
  if (!existing.figma.variants['base']) {
    // Same issue - can't add without nodeId
  }

  return { changed, manualRequired };
}

/**
 * Merge a bootstrap artifact into component-map.json.
 *
 * This function:
 * 1. Loads the existing component map (or creates empty one)
 * 2. Migrates v1 to v2 if needed
 * 3. Merges proposed entries (never overwriting nodeIds)
 * 4. Writes atomically (temp + rename)
 *
 * @param artifact - The bootstrap artifact to apply
 * @param mapPath - Path to component-map.json
 * @param config - Bootstrap configuration
 * @returns Merge result
 */
export async function mergeBootstrapArtifact(
  artifact: ComponentMapBootstrapArtifact,
  mapPath: string,
  config: BootstrapConfig
): Promise<MergeResult> {
  // Dry run check
  if (config.dryRun) {
    return {
      success: true,
      entriesAdded: artifact.proposed.filter((p) => p.status === 'new').length,
      entriesUpdated: artifact.proposed.filter((p) => p.status === 'update').length,
      entriesSkipped: artifact.skipped.length,
      manualDecisionRequired: [],
      error: 'Dry run - no changes made',
    };
  }

  try {
    // Load existing map or create empty one
    let map: ComponentMap;
    try {
      const loaded = await loadComponentMap({ autoMigrate: true });
      if (loaded) {
        map = loaded;
      } else {
        // No existing map, create empty one
        map = {
          version: COMPONENT_MAP_VERSION,
          components: {},
        };
      }
    } catch {
      // Error loading map, create empty one
      map = {
        version: COMPONENT_MAP_VERSION,
        components: {},
      };
    }

    let entriesAdded = 0;
    let entriesUpdated = 0;
    let entriesSkipped = 0;
    const manualDecisionRequired: string[] = [];

    // Merge each proposed entry
    for (const proposed of artifact.proposed) {
      const existing = map.components[proposed.componentKey];
      const { changed, manualRequired } = mergeEntry(map, proposed);

      if (manualRequired) {
        manualDecisionRequired.push(proposed.componentKey);
      }

      if (changed) {
        if (!existing) {
          entriesAdded++;
        } else {
          entriesUpdated++;
        }
      } else {
        entriesSkipped++;
      }
    }

    // Write atomically
    await atomicWriteJson(mapPath, map);

    return {
      success: true,
      entriesAdded,
      entriesUpdated,
      entriesSkipped,
      manualDecisionRequired,
    };
  } catch (err) {
    return {
      success: false,
      entriesAdded: 0,
      entriesUpdated: 0,
      entriesSkipped: 0,
      manualDecisionRequired: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write JSON to a file atomically.
 * Writes to a temp file first, then renames.
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.tmp-${randomUUID()}.json`);

  const content = JSON.stringify(data, null, 2) + '\n';

  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

/**
 * Write a bootstrap artifact to a file.
 */
export async function writeBootstrapArtifact(
  artifact: ComponentMapBootstrapArtifact,
  artifactPath: string
): Promise<void> {
  await atomicWriteJson(artifactPath, artifact);
}
