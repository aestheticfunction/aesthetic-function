/**
 * @aesthetic-function/watcher - reconcile/componentMap.ts
 *
 * Component Mapping Registry for stable IDs across renames and refactors.
 *
 * WHY: Node names in Figma can change, but nodeIds remain stable within a document.
 * This registry maps code component names to Figma node IDs, providing:
 * - Stable sync targets across renames
 * - Deterministic variant resolution
 * - Optional persistence (gitignore by default, but can be committed)
 *
 * ARCHITECTURE:
 * - component-map.json at repo root (gitignored by default)
 * - Generated via "Send Selection" in Figma plugin
 * - Watcher prefers map IDs over name-based resolution
 * - Plugin handles "id:<nodeId>" queries via figma.getNodeById
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AnchoredAstReport } from '../ast/types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Variant mapping for a specific state within a component.
 */
export interface VariantMapping {
  /** Figma node ID for this variant */
  nodeId: string;
}

/**
 * Figma mapping for a component, including Component Set and variants.
 */
export interface FigmaComponentMapping {
  /** Figma Component Set node ID (parent of all variants) */
  componentSetNodeId?: string;
  /** Display name of the component in Figma */
  name: string;
  /** Mapping of state → nodeId for variants */
  variants: Record<string, VariantMapping>;
}

/**
 * Component entry in the registry.
 */
export interface ComponentEntry {
  /**
   * Stable component key derived from code (Phase 8D).
   * Format: <dir>/<exportName> or just <exportName>.
   * Used as primary lookup key in v2+ maps.
   */
  componentKey?: string;
  /**
   * Legacy key names that should also resolve to this component (Phase 8D).
   * Preserves backward compatibility during migration.
   */
  legacyKeys?: string[];
  /** Figma-specific mapping data */
  figma: FigmaComponentMapping;
}

/**
 * The complete component-map.json structure.
 */
export interface ComponentMap {
  /** Schema version for migration support */
  version: number;
  /** Map of component key → component entry */
  components: Record<string, ComponentEntry>;
}

/**
 * Payload for /map-update endpoint.
 * Sent by Figma plugin when capturing a variant component.
 */
export interface MapUpdatePayload {
  /** Base component name (e.g., "LoginButton") - used as key in MVP */
  baseName: string;
  /** Figma Component Set node ID */
  componentSetNodeId?: string;
  /** Variant state (e.g., "hover", "disabled", or null for base) */
  variantState: string | null;
  /** Figma node ID for the specific variant */
  variantNodeId: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Current schema version.
 * - v1: Original schema with baseName as key
 * - v2: Added componentKey and legacyKeys for stable code-derived identity
 */
export const COMPONENT_MAP_VERSION = 2;

/**
 * Get the default path to component-map.json at the repo root.
 *
 * WHY: We use process.cwd() instead of __dirname because:
 * - The watcher runs via tsx in an ESM-like environment where __dirname is not defined
 * - process.cwd() is the working directory (typically packages/watcher when running watcher)
 * - We resolve up to the monorepo root from there
 *
 * ASSUMPTION: The watcher is run from packages/watcher directory.
 * If run from a different directory, use setComponentMapPath() to override.
 */
const getDefaultMapPath = (): string => {
  // When running from packages/watcher, go up 2 levels to reach repo root
  const projectRoot = resolve(process.cwd(), '..', '..');
  return join(projectRoot, 'component-map.json');
};

/** Cached map path (allows override for testing) */
let customMapPath: string | null = null;

// =============================================================================
// PATH MANAGEMENT
// =============================================================================

/**
 * Get the current path for component-map.json.
 */
export function getComponentMapPath(): string {
  return customMapPath ?? getDefaultMapPath();
}

/**
 * Set a custom path for component-map.json.
 * Useful for testing.
 */
export function setComponentMapPath(path: string | null): void {
  customMapPath = path;
}

// =============================================================================
// MIGRATION (Phase 8D)
// =============================================================================

/**
 * Result of migrating a component map.
 */
export interface MigrationResult {
  /** The migrated map */
  map: ComponentMap;
  /** Whether the map was changed during migration */
  changed: boolean;
}

/**
 * Migrate a component map to the current schema version.
 *
 * WHY: Phase 8D introduces componentKey for stable code-derived identity.
 * This function upgrades v1 maps to v2 by:
 * - Setting componentKey from AST anchors when available
 * - Storing existing map keys under legacyKeys for backward compatibility
 *
 * @param map - The component map to migrate
 * @param anchors - Optional AST anchored reports to derive componentKeys from
 * @returns Migration result with the migrated map and change flag
 */
export function migrateComponentMap(
  map: ComponentMap,
  anchors?: AnchoredAstReport[]
): MigrationResult {
  // Already at current version - no migration needed
  if (map.version >= COMPONENT_MAP_VERSION) {
    return { map, changed: false };
  }

  // Build lookup from componentName → componentKey from anchors
  const componentKeyLookup = new Map<string, string>();
  if (anchors) {
    for (const report of anchors) {
      for (const anchor of report.anchors) {
        if (anchor.componentName && anchor.componentKey) {
          componentKeyLookup.set(anchor.componentName, anchor.componentKey);
        }
      }
    }
  }

  // Clone the map for migration
  const migratedComponents: Record<string, ComponentEntry> = {};
  let anyChanged = false;

  for (const [existingKey, entry] of Object.entries(map.components)) {
    // Try to find a componentKey from anchors
    const inferredKey = componentKeyLookup.get(existingKey);

    const migratedEntry: ComponentEntry = {
      ...entry,
    };

    if (inferredKey && inferredKey !== existingKey) {
      // We have a componentKey from AST - use it
      migratedEntry.componentKey = inferredKey;
      // Store the existing key as a legacy key
      migratedEntry.legacyKeys = [existingKey];
      anyChanged = true;
    } else if (!entry.componentKey) {
      // No componentKey available - use existing key as componentKey
      // This makes the key explicit while maintaining compatibility
      migratedEntry.componentKey = existingKey;
      anyChanged = true;
    }

    migratedComponents[existingKey] = migratedEntry;
  }

  const migratedMap: ComponentMap = {
    version: COMPONENT_MAP_VERSION,
    components: migratedComponents,
  };

  // Changed if version was upgraded or any entries were modified
  const versionChanged = map.version < COMPONENT_MAP_VERSION;

  return {
    map: migratedMap,
    changed: versionChanged || anyChanged,
  };
}

// =============================================================================
// LOAD
// =============================================================================

/**
 * Check if component-map.json exists.
 */
export async function componentMapExists(): Promise<boolean> {
  const mapPath = getComponentMapPath();
  try {
    await access(mapPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for loading the component map.
 */
export interface LoadComponentMapOptions {
  /**
   * Whether to auto-migrate v1 maps to v2 and persist the result.
   * Default: false (caller controls persistence)
   */
  autoMigrate?: boolean;
  /**
   * AST anchored reports for deriving componentKeys during migration.
   * Only used when autoMigrate is true.
   */
  anchors?: AnchoredAstReport[];
}

/**
 * Load component-map.json.
 *
 * @param options - Optional loading options
 * @returns The component map, or null if file doesn't exist
 * @throws Error if file exists but is invalid JSON or schema
 */
export async function loadComponentMap(
  options: LoadComponentMapOptions = {}
): Promise<ComponentMap | null> {
  const mapPath = getComponentMapPath();

  try {
    await access(mapPath);
  } catch {
    // File doesn't exist - this is normal, return null
    return null;
  }

  try {
    const content = await readFile(mapPath, 'utf-8');
    const data = JSON.parse(content) as ComponentMap;

    // Validate schema version
    if (typeof data.version !== 'number') {
      throw new Error('Missing or invalid version field');
    }

    if (data.version > COMPONENT_MAP_VERSION) {
      throw new Error(
        `component-map.json version ${data.version} is newer than supported version ${COMPONENT_MAP_VERSION}`
      );
    }

    if (!data.components || typeof data.components !== 'object') {
      throw new Error('Missing or invalid components field');
    }

    // Auto-migrate if requested and version is older
    if (options.autoMigrate && data.version < COMPONENT_MAP_VERSION) {
      const { map: migrated, changed } = migrateComponentMap(data, options.anchors);
      if (changed) {
        await saveComponentMap(migrated);
        console.log(
          `[ComponentMap] Migrated from v${data.version} to v${COMPONENT_MAP_VERSION}`
        );
      }
      return migrated;
    }

    return data;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load component-map.json: ${errorMsg}`);
  }
}

// =============================================================================
// SAVE
// =============================================================================

/**
 * Save component-map.json.
 *
 * @param map - The component map to save
 */
export async function saveComponentMap(map: ComponentMap): Promise<void> {
  const mapPath = getComponentMapPath();
  const content = JSON.stringify(map, null, 2) + '\n';
  await writeFile(mapPath, content, 'utf-8');
}

// =============================================================================
// MERGE
// =============================================================================

/**
 * Merge a map update into an existing component map.
 *
 * @param existing - Existing map (or null for new map)
 * @param update - Update payload from plugin
 * @returns Updated map and whether it changed
 */
export function mergeMapUpdate(
  existing: ComponentMap | null,
  update: MapUpdatePayload
): { map: ComponentMap; changed: boolean } {
  // Create new map if none exists
  const map: ComponentMap = existing ?? {
    version: COMPONENT_MAP_VERSION,
    components: {},
  };

  // Use baseName as the component key (MVP: no path prefix)
  const componentKey = update.baseName;

  // Get or create component entry
  let entry = map.components[componentKey];
  const isNewEntry = !entry;

  if (!entry) {
    entry = {
      figma: {
        name: update.baseName,
        variants: {},
      },
    };
    map.components[componentKey] = entry;
  }

  // Update Component Set ID if provided
  if (update.componentSetNodeId) {
    if (entry.figma.componentSetNodeId !== update.componentSetNodeId) {
      entry.figma.componentSetNodeId = update.componentSetNodeId;
    }
  }

  // Determine variant key (base state uses 'base')
  const variantKey = update.variantState ?? 'base';

  // Check if this is actually a change
  const existingNodeId = entry.figma.variants[variantKey]?.nodeId;
  const changed = isNewEntry || existingNodeId !== update.variantNodeId;

  // Update variant mapping
  entry.figma.variants[variantKey] = {
    nodeId: update.variantNodeId,
  };

  return { map, changed };
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Result of resolving a component from the map.
 */
export interface ComponentMapResolution {
  /** Resolved node ID (null if not found) */
  nodeId: string | null;
  /** Whether resolution was successful */
  found: boolean;
  /**
   * Source of resolution:
   * - 'componentKey': Matched via componentKey (Phase 8D)
   * - 'legacyKey': Matched via legacyKeys array
   * - 'directKey': Matched via direct map key (baseName)
   * - 'none': Not found
   */
  source: 'componentKey' | 'legacyKey' | 'directKey' | 'none';
}

/**
 * Find a component entry by componentKey, legacyKeys, or direct key lookup.
 *
 * Resolution order (Phase 8D):
 * 1. componentKey match (if queryKey is provided)
 * 2. legacyKeys match
 * 3. Direct map key match (baseName)
 *
 * @param map - Component map
 * @param queryKey - The key to look up (componentKey or baseName)
 * @returns Entry and source, or null if not found
 */
function findComponentEntry(
  map: ComponentMap,
  queryKey: string
): { entry: ComponentEntry; source: 'componentKey' | 'legacyKey' | 'directKey' } | null {
  // First, try to find by componentKey
  for (const entry of Object.values(map.components)) {
    if (entry.componentKey === queryKey) {
      return { entry, source: 'componentKey' };
    }
  }

  // Second, try to find by legacyKeys
  for (const entry of Object.values(map.components)) {
    if (entry.legacyKeys?.includes(queryKey)) {
      return { entry, source: 'legacyKey' };
    }
  }

  // Third, try direct map key lookup (backward compatible)
  const directEntry = map.components[queryKey];
  if (directEntry) {
    return { entry: directEntry, source: 'directKey' };
  }

  return null;
}

/**
 * Resolve a component/variant to a node ID using the component map.
 *
 * Resolution order (Phase 8D):
 * 1. If componentKey is provided, try to match by componentKey
 * 2. Try to match by legacyKeys
 * 3. Fall back to baseName (direct map key)
 *
 * @param map - Component map (or null)
 * @param baseName - Base component name (e.g., "LoginButton")
 * @param state - Variant state (e.g., "hover") or null for base
 * @param componentKey - Optional componentKey from AST (Phase 8D)
 * @returns Resolution result
 */
export function resolveFromMap(
  map: ComponentMap | null,
  baseName: string,
  state: string | null,
  componentKey?: string
): ComponentMapResolution {
  if (!map) {
    return { nodeId: null, found: false, source: 'none' };
  }

  // Try componentKey first (if provided), then baseName
  const keysToTry = componentKey ? [componentKey, baseName] : [baseName];
  
  for (const key of keysToTry) {
    const result = findComponentEntry(map, key);
    if (result) {
      const variantKey = state ?? 'base';
      const variant = result.entry.figma.variants[variantKey];

      if (variant) {
        return { nodeId: variant.nodeId, found: true, source: result.source };
      }
    }
  }

  return { nodeId: null, found: false, source: 'none' };
}

/**
 * Create a nodeQuery with id: prefix for a mapped node ID.
 *
 * @param nodeId - Figma node ID
 * @returns Query string like "id:123:456"
 */
export function createIdQuery(nodeId: string): string {
  return `id:${nodeId}`;
}

/**
 * Parse a nodeQuery to check if it's an id: query.
 *
 * @param nodeQuery - Query string
 * @returns Parsed node ID or null if not an id: query
 */
export function parseIdQuery(nodeQuery: string): string | null {
  if (nodeQuery.startsWith('id:')) {
    return nodeQuery.slice(3);
  }
  return null;
}
