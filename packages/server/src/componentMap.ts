/**
 * @aesthetic-function/server - componentMap.ts
 *
 * Component Map persistence for stable node ID mapping.
 *
 * WHY: This module mirrors the watcher's componentMap module but is used
 * by the server to persist mapping updates from the Figma plugin.
 *
 * The server and watcher share the same file (component-map.json at repo root)
 * but have separate implementations to avoid module resolution issues
 * and keep each runtime self-contained.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 */
export interface MapUpdatePayload {
  /** Base component name (e.g., "LoginButton") */
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Current schema version */
export const COMPONENT_MAP_VERSION = 1;

/** Path to component-map.json at repo root */
const getDefaultMapPath = (): string => {
  // Server package is at packages/server/src, so repo root is 3 levels up
  return join(__dirname, '..', '..', '..', 'component-map.json');
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
// LOAD
// =============================================================================

/**
 * Load component-map.json.
 *
 * @returns The component map, or null if file doesn't exist
 */
export async function loadComponentMap(): Promise<ComponentMap | null> {
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
      console.warn(
        `[Server] component-map.json version ${data.version} is newer than supported version ${COMPONENT_MAP_VERSION}`
      );
    }

    if (!data.components || typeof data.components !== 'object') {
      throw new Error('Missing or invalid components field');
    }

    return data;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Server] Failed to load component-map.json: ${errorMsg}`);
    return null;
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
  const map: ComponentMap = existing
    ? JSON.parse(JSON.stringify(existing)) // Deep clone to avoid mutation
    : {
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

  // Track if anything changed
  let changed = isNewEntry;

  // Update Component Set ID if provided
  if (update.componentSetNodeId) {
    if (entry.figma.componentSetNodeId !== update.componentSetNodeId) {
      entry.figma.componentSetNodeId = update.componentSetNodeId;
      changed = true;
    }
  }

  // Determine variant key (base state uses 'base')
  const variantKey = update.variantState ?? 'base';

  // Check if this is actually a change
  const existingNodeId = entry.figma.variants[variantKey]?.nodeId;
  if (existingNodeId !== update.variantNodeId) {
    // Update variant mapping
    entry.figma.variants[variantKey] = {
      nodeId: update.variantNodeId,
    };
    changed = true;
  }

  return { map, changed };
}
