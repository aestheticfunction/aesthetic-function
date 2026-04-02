/**
 * @aesthetic-function/watcher - adapters/registry.ts
 *
 * Adapter Registry for the Semantic Adapter Architecture (Phase 10A).
 *
 * RESPONSIBILITIES:
 * - Register adapters in deterministic order
 * - Run all adapters that support a given JSX element
 * - Merge results using field-level overwrite with provenance preservation
 *
 * MERGE RULES:
 * - Adapter wins only for fields it explicitly sets
 * - Generic JSX semantics are preserved for unset fields
 * - No adapter may erase fields it does not own
 * - Provenance is tracked for all adapter-provided values
 *
 * EXECUTION ORDER:
 * - Adapters run in priority order (lower priority = earlier)
 * - Later adapters can override earlier adapters' values
 * - Generic JSX extraction runs BEFORE adapters
 */

import type * as t from '@babel/types';
import type {
  ComponentSemanticIntent,
  TextSemantics,
  BooleanSemantics,
  LayoutSemantics,
  FlexSemantics,
  VisualSemantics,
} from '../ast/types.js';
import type {
  SemanticAdapter,
  AdapterContext,
  AdapterProvenance,
} from './types.js';
import type { SurfaceType } from '@aesthetic-function/shared/surfaceMetadata';

// =============================================================================
// REGISTRY STATE
// =============================================================================

/**
 * Registered adapters, sorted by priority.
 */
const registeredAdapters: SemanticAdapter[] = [];

/**
 * Whether the registry has been locked (for testing).
 */
let isLocked = false;

// =============================================================================
// REGISTRY API
// =============================================================================

/**
 * Register a semantic adapter.
 *
 * Adapters are automatically sorted by priority after registration.
 *
 * @param adapter - The adapter to register
 * @throws Error if registry is locked or adapter ID is duplicate
 */
export function registerAdapter(adapter: SemanticAdapter): void {
  if (isLocked) {
    throw new Error('Adapter registry is locked. Cannot register new adapters.');
  }

  // Check for duplicate ID
  if (registeredAdapters.some((a) => a.id === adapter.id)) {
    throw new Error(`Adapter with ID "${adapter.id}" is already registered.`);
  }

  registeredAdapters.push(adapter);

  // Sort by priority (lower = earlier)
  registeredAdapters.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Get all registered adapters (for testing/debugging).
 *
 * @returns Array of registered adapters in execution order
 */
export function getRegisteredAdapters(): readonly SemanticAdapter[] {
  return registeredAdapters;
}

/**
 * Clear all registered adapters (for testing).
 */
export function clearAdapters(): void {
  registeredAdapters.length = 0;
  isLocked = false;
}

/**
 * Lock the registry to prevent further modifications (for testing).
 */
export function lockRegistry(): void {
  isLocked = true;
}

/**
 * Unlock the registry (for testing).
 */
export function unlockRegistry(): void {
  isLocked = false;
}

// =============================================================================
// SURFACE METADATA QUERIES (Phase 16A Extension)
// =============================================================================

/**
 * Get all registered semantic adapters that match a given surface type.
 *
 * Read-only query helper. Does not affect registration, priority, or execution.
 * Adapters without surfaceMetadata are excluded from surface-type queries.
 *
 * @param surfaceType - The surface type to filter by
 * @returns Array of matching adapters in priority order
 */
export function getSemanticAdaptersBySurface(surfaceType: SurfaceType): readonly SemanticAdapter[] {
  return registeredAdapters.filter((a) => a.surfaceMetadata?.surfaceType === surfaceType);
}

// =============================================================================
// EXTRACTION PIPELINE
// =============================================================================

/**
 * Result of running all adapters on a JSX element.
 */
export interface AdapterExtractionResult {
  /**
   * Combined semantics from all adapters.
   * Merged using field-level overwrite rules.
   */
  semantics: Partial<ComponentSemanticIntent>;

  /**
   * Which adapters contributed to the result.
   */
  contributions: AdapterContribution[];

  /**
   * Whether any adapter matched this element.
   */
  hasAdapterMatch: boolean;
}

/**
 * A single adapter's contribution to the result.
 */
export interface AdapterContribution {
  adapterId: string;
  displayName: string;
  fieldsSet: string[];
  provenance: AdapterProvenance;
  frameworkMetadata?: Record<string, unknown>;
}

/**
 * Run all adapters on a JSX element and merge results.
 *
 * @param node - The JSX element node
 * @param ctx - Adapter context
 * @returns Combined extraction result
 */
export function runAdapters(
  node: t.JSXElement,
  ctx: AdapterContext
): AdapterExtractionResult {
  const contributions: AdapterContribution[] = [];
  let combinedSemantics: Partial<ComponentSemanticIntent> = {};

  for (const adapter of registeredAdapters) {
    if (!adapter.supports(node, ctx)) {
      continue;
    }

    const result = adapter.extract(node, ctx);
    const fieldsSet = getSetFields(result.semantics);

    contributions.push({
      adapterId: adapter.id,
      displayName: adapter.displayName,
      fieldsSet,
      provenance: result.provenance,
      frameworkMetadata: result.frameworkMetadata,
    });

    // Merge semantics (adapter wins for fields it sets)
    combinedSemantics = mergeSemantics(combinedSemantics, result.semantics);
  }

  return {
    semantics: combinedSemantics,
    contributions,
    hasAdapterMatch: contributions.length > 0,
  };
}

/**
 * Merge generic JSX semantics with adapter-extracted semantics.
 *
 * @param baseSemantics - Generic JSX semantics (from AST extraction)
 * @param adapterResult - Adapter extraction result
 * @returns Merged semantics where adapter wins for fields it sets
 */
export function mergeWithAdapterSemantics(
  baseSemantics: ComponentSemanticIntent,
  adapterResult: AdapterExtractionResult
): ComponentSemanticIntent {
  if (!adapterResult.hasAdapterMatch) {
    return baseSemantics;
  }

  // Deep merge, adapter wins for set fields
  return {
    text: mergeTextSemantics(baseSemantics.text, adapterResult.semantics.text),
    booleans: mergeBooleanSemantics(baseSemantics.booleans, adapterResult.semantics.booleans),
    layout: mergeLayoutSemantics(baseSemantics.layout, adapterResult.semantics.layout),
    flex: mergeFlexSemantics(baseSemantics.flex, adapterResult.semantics.flex),
    visual: mergeVisualSemantics(baseSemantics.visual, adapterResult.semantics.visual),
  };
}

// =============================================================================
// MERGE HELPERS
// =============================================================================

/**
 * Get list of fields that are set in partial semantics.
 */
function getSetFields(semantics: Partial<ComponentSemanticIntent>): string[] {
  const fields: string[] = [];

  if (semantics.text) {
    for (const [key, value] of Object.entries(semantics.text)) {
      if (value !== undefined) fields.push(`text.${key}`);
    }
  }
  if (semantics.booleans) {
    for (const [key, value] of Object.entries(semantics.booleans)) {
      if (value !== undefined) fields.push(`booleans.${key}`);
    }
  }
  if (semantics.layout) {
    for (const [key, value] of Object.entries(semantics.layout)) {
      if (value !== undefined) fields.push(`layout.${key}`);
    }
  }
  if (semantics.flex) {
    for (const [key, value] of Object.entries(semantics.flex)) {
      if (value !== undefined) fields.push(`flex.${key}`);
    }
  }
  if (semantics.visual) {
    for (const [key, value] of Object.entries(semantics.visual)) {
      if (value !== undefined) fields.push(`visual.${key}`);
    }
  }

  return fields;
}

/**
 * Merge two partial semantic intents.
 * Later values (from adapters) overwrite earlier values.
 */
function mergeSemantics(
  base: Partial<ComponentSemanticIntent>,
  overlay: Partial<ComponentSemanticIntent>
): Partial<ComponentSemanticIntent> {
  return {
    text: overlay.text ? { ...base.text, ...overlay.text } : base.text,
    booleans: overlay.booleans ? { ...base.booleans, ...overlay.booleans } : base.booleans,
    layout: overlay.layout ? { ...base.layout, ...overlay.layout } : base.layout,
    flex: overlay.flex ? { ...base.flex, ...overlay.flex } : base.flex,
    visual: overlay.visual ? { ...base.visual, ...overlay.visual } : base.visual,
  };
}

/**
 * Merge text semantics, overlay wins for set fields.
 */
function mergeTextSemantics(
  base: TextSemantics,
  overlay?: Partial<TextSemantics>
): TextSemantics {
  if (!overlay) return base;
  return {
    content: overlay.content ?? base.content,
    placeholder: overlay.placeholder ?? base.placeholder,
    title: overlay.title ?? base.title,
    ariaLabel: overlay.ariaLabel ?? base.ariaLabel,
    alt: overlay.alt ?? base.alt,
  };
}

/**
 * Merge boolean semantics, overlay wins for set fields.
 */
function mergeBooleanSemantics(
  base: BooleanSemantics,
  overlay?: Partial<BooleanSemantics>
): BooleanSemantics {
  if (!overlay) return base;
  return {
    disabled: overlay.disabled ?? base.disabled,
    checked: overlay.checked ?? base.checked,
    selected: overlay.selected ?? base.selected,
  };
}

/**
 * Merge layout semantics, overlay wins for set fields.
 */
function mergeLayoutSemantics(
  base: LayoutSemantics,
  overlay?: Partial<LayoutSemantics>
): LayoutSemantics {
  if (!overlay) return base;
  return {
    width: overlay.width ?? base.width,
    height: overlay.height ?? base.height,
    padding: overlay.padding ?? base.padding,
    margin: overlay.margin ?? base.margin,
    gap: overlay.gap ?? base.gap,
  };
}

/**
 * Merge flex semantics, overlay wins for set fields.
 */
function mergeFlexSemantics(
  base: FlexSemantics,
  overlay?: Partial<FlexSemantics>
): FlexSemantics {
  if (!overlay) return base;
  return {
    display: overlay.display ?? base.display,
    flexDirection: overlay.flexDirection ?? base.flexDirection,
    justifyContent: overlay.justifyContent ?? base.justifyContent,
    alignItems: overlay.alignItems ?? base.alignItems,
  };
}

/**
 * Merge visual semantics, overlay wins for set fields.
 */
function mergeVisualSemantics(
  base: VisualSemantics,
  overlay?: Partial<VisualSemantics>
): VisualSemantics {
  if (!overlay) return base;
  return {
    fills: overlay.fills ?? base.fills,
  };
}
