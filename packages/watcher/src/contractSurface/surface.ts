/**
 * @aesthetic-function/watcher - contractSurface/surface.ts
 *
 * Read-only accessors over a loaded dspack contract document, shaped for
 * cross-surface drift comparison.
 *
 * WHY: The drift engine compares SurfaceProp/variant inventories. This module
 * maps dspack component entries into that vocabulary:
 * - props: dspack prop descriptors → SurfaceProp {name, type, values}
 * - variants: union of all enum-prop string values (mirrors how the code
 *   surface collects all string-literal-union values, so the two are
 *   comparable)
 *
 * CONSTRAINTS:
 * - READ-ONLY accessors over an in-memory document. No I/O here.
 * - NOT a DesignAdapter and never registered in the design adapter registry:
 *   the drift CLI treats the registry's first available adapter as the Figma
 *   surface, and the DesignAdapter interface (styles, file data, screenshots)
 *   is the wrong shape for a static contract file.
 */

import type {
  ContractComponentData,
  SurfaceProp,
} from '@aesthetic-function/shared/crossSurfaceDrift';
import type { SurfaceMetadata } from '@aesthetic-function/shared/surfaceMetadata';

import type { DspackDocument, DspackComponentEntry } from './types.js';

/** Source identifier used in drift snapshots and findings. */
export const CONTRACT_SOURCE_ID = 'dspack-contract';

/**
 * Surface classification for the dspack contract surface.
 * Descriptor only — carries no authority into reconciliation.
 */
export const CONTRACT_SURFACE_METADATA: SurfaceMetadata = {
  surfaceType: 'contract',
  accessMode: 'read-only',
  authorityRole: 'external-non-authoritative',
  stability: 'canonical',
};

/**
 * Convert a component name to the dspack ID convention (^[a-z][a-z0-9-]*$).
 * "AlertDialog" → "alert-dialog", "Button" → "button".
 */
export function toContractId(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

/**
 * Find a component in the contract by requested name.
 *
 * Match order:
 * 1. Entry display name, case-insensitive ("Button" matches name "Button")
 * 2. Entry ID equals the kebab-converted request ("CardHeader" → "card-header")
 *
 * Exact-name match wins so flat compound entries (card-header, card-title)
 * never shadow their parent.
 */
export function findContractComponent(
  doc: DspackDocument,
  requestedName: string,
): ContractComponentData | null {
  const components = doc.components ?? {};
  const requestedLower = requestedName.toLowerCase();

  let matchedId: string | null = null;
  let matchedEntry: DspackComponentEntry | null = null;

  for (const [id, entry] of Object.entries(components)) {
    if (entry.name.toLowerCase() === requestedLower) {
      matchedId = id;
      matchedEntry = entry;
      break;
    }
  }

  if (!matchedEntry) {
    const kebab = toContractId(requestedName);
    if (kebab && components[kebab]) {
      matchedId = kebab;
      matchedEntry = components[kebab];
    }
  }

  if (!matchedEntry || !matchedId) return null;

  return {
    id: matchedId,
    name: matchedEntry.name,
    props: extractProps(matchedEntry),
    variants: extractVariants(matchedEntry),
  };
}

/**
 * List the display names of all components declared by the contract.
 * Used as an inventory source for all-components drift analysis.
 */
export function listContractComponentNames(doc: DspackDocument): string[] {
  return Object.values(doc.components ?? {}).map((entry) => entry.name);
}

// =============================================================================
// MAPPING HELPERS
// =============================================================================

function extractProps(entry: DspackComponentEntry): SurfaceProp[] {
  const props: SurfaceProp[] = [];
  for (const [propName, descriptor] of Object.entries(entry.props ?? {})) {
    const values = stringValues(descriptor.values);
    props.push({
      name: propName,
      type: descriptor.type,
      ...(values.length > 0 ? { values } : {}),
    });
  }
  return props;
}

/**
 * Variant values: union of all enum-prop string values, deduplicated in
 * declaration order. Mirrors the code surface, which collects all
 * string-literal-union values found in the component's source.
 */
function extractVariants(entry: DspackComponentEntry): string[] {
  const variants: string[] = [];
  for (const descriptor of Object.values(entry.props ?? {})) {
    if (descriptor.type !== 'enum') continue;
    for (const value of stringValues(descriptor.values)) {
      if (!variants.includes(value)) variants.push(value);
    }
  }
  return variants;
}

function stringValues(values: unknown[] | undefined): string[] {
  if (!values) return [];
  return values.filter((v): v is string => typeof v === 'string');
}
