/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/suggest.ts
 *
 * Phase 12B: Generate Delta Suggestions.
 *
 * WHY: Converts Phase 12A Figma deltas into actionable suggestions
 * for where changes should land, without actually applying anything.
 *
 * CONSTRAINTS:
 * - Read-only: no file writes, no mutations
 * - Deterministic: same inputs → same outputs
 * - Variant-scoped: never targets Component Sets
 * - Explicit-only: uses policy rules for target selection
 */

import type {
  SuggestInput,
  SuggestOutput,
  SuggestSummary,
  FigmaDeltaSuggestion,
  SuggestionTarget,
  SuggestionKind,
} from './types.js';
import type { DeltaOutput, FigmaDelta, DeltaPropertyType } from '../figmaDelta/types.js';
import type { MarkerData } from '../parse/parseIntentFromReact.js';
import type { DesignOverrides } from '../reconcile/types.js';
import type { WriteFeasibilityReport, WriteSafetyReport } from '../ast/types.js';
import type { ComponentMap } from '../reconcile/componentMap.js';
import { chooseSuggestionTarget, type TargetSelectionContext } from './policy.js';

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

/**
 * Find the override key for a component::state combination.
 *
 * Checks both "Component::state" format and "Component" for base state.
 *
 * @param componentKey - Component key
 * @param state - Target state
 * @param overrides - Design overrides map
 * @returns Override key if found, undefined otherwise
 */
function findOverrideKey(
  componentKey: string,
  state: string,
  overrides: DesignOverrides | null
): string | undefined {
  if (!overrides) return undefined;

  // Check explicit state key first
  const stateKey = `${componentKey}::${state}`;
  if (overrides[stateKey]) {
    return stateKey;
  }

  // For base state, also check component key without state suffix
  if (state === 'base' && overrides[componentKey]) {
    return componentKey;
  }

  return undefined;
}

/**
 * Find marker data for a component::state combination.
 *
 * @param componentKey - Component key
 * @param state - Target state
 * @param markers - Parsed markers
 * @returns Marker data if found
 */
function findMarker(
  componentKey: string,
  state: string,
  markers: MarkerData[]
): MarkerData | undefined {
  // Look for marker with matching node name and state
  for (const marker of markers) {
    // Check for state marker format: node=Component::state
    if (marker.node === `${componentKey}::${state}`) {
      return marker;
    }

    // For base state, also check marker without state
    if (state === 'base' && marker.node === componentKey) {
      // Only match if marker doesn't have a state or state is base
      if (!marker.state || marker.state === 'base') {
        return marker;
      }
    }

    // Check explicit state attribute
    if (marker.node === componentKey && marker.state === state) {
      return marker;
    }
  }

  return undefined;
}

/**
 * Find write safety report for a component.
 *
 * @param componentKey - Component key
 * @param writeFeasibility - Write feasibility report
 * @returns Write safety report if found
 */
function findWriteSafetyReport(
  componentKey: string,
  writeFeasibility?: WriteFeasibilityReport
): WriteSafetyReport | undefined {
  if (!writeFeasibility) return undefined;

  // Find report by node name matching component key
  return writeFeasibility.reports.find(
    (report) => report.nodeName === componentKey || report.componentName === componentKey
  );
}

/**
 * Get variant nodeId from component map.
 *
 * @param componentKey - Component key
 * @param state - Target state
 * @param componentMap - Component map
 * @returns Variant nodeId if found
 */
function getVariantNodeId(
  componentKey: string,
  state: string,
  componentMap: ComponentMap
): string | undefined {
  const entry = componentMap.components[componentKey];
  if (!entry?.figma?.variants) return undefined;

  return entry.figma.variants[state]?.nodeId;
}

// =============================================================================
// SUGGESTION GENERATION
// =============================================================================

/**
 * Generate a single suggestion from a delta.
 *
 * @param delta - The delta to suggest for
 * @param componentKey - Component key
 * @param state - Target state
 * @param input - Full suggest input for context lookups
 * @returns Generated suggestion
 */
function generateSuggestionFromDelta(
  delta: FigmaDelta,
  componentKey: string,
  state: string,
  input: SuggestInput
): FigmaDeltaSuggestion {
  // Find evidence
  const overrideKey = findOverrideKey(componentKey, state, input.overrides);
  const marker = findMarker(componentKey, state, input.markers);
  const writeSafetyReport = findWriteSafetyReport(componentKey, input.writeFeasibility);
  const variantNodeId = getVariantNodeId(componentKey, state, input.componentMap) ?? 'unknown';

  // Build target selection context
  const ctx: TargetSelectionContext = {
    componentKey,
    state,
    property: delta.property,
    hasOverride: overrideKey !== undefined,
    overrideKey,
    hasMarker: marker !== undefined,
    markerLine: marker?.lineNumber,
    writeSafetyReport,
    variantNodeId,
  };

  // Choose target using policy
  const result = chooseSuggestionTarget(ctx);

  // Build canonical policy notes
  const canonicalPolicyNotes: string[] = [];
  if (!delta.canonicalTo && delta.to !== undefined) {
    canonicalPolicyNotes.push('No canonical token matched; raw value proposed.');
  }
  if (delta.normalizationNote) {
    canonicalPolicyNotes.push(delta.normalizationNote);
  }

  // Add notes to evidence if present
  if (canonicalPolicyNotes.length > 0) {
    result.evidence.canonicalPolicyNotes = canonicalPolicyNotes;
  }

  return {
    componentKey,
    targetState: state,
    property: delta.property,
    fromRaw: delta.from,
    fromCanonical: delta.canonicalFrom,
    toRaw: delta.to,
    toCanonical: delta.canonicalTo,
    suggestedTarget: result.target,
    kind: result.kind,
    confidence: delta.confidence,
    reason: result.reason,
    blockingReason: result.blockingReason,
    evidence: result.evidence,
  };
}

/**
 * Generate suggestions for all deltas from a single variant.
 *
 * @param deltaOutput - Delta output for a variant
 * @param input - Full suggest input
 * @returns Array of suggestions
 */
function generateSuggestionsForVariant(
  deltaOutput: DeltaOutput,
  input: SuggestInput
): FigmaDeltaSuggestion[] {
  const suggestions: FigmaDeltaSuggestion[] = [];

  for (const delta of deltaOutput.deltas) {
    const suggestion = generateSuggestionFromDelta(
      delta,
      deltaOutput.componentKey,
      deltaOutput.state,
      input
    );
    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Sort suggestions deterministically.
 *
 * Sort order: componentKey → targetState → property
 * This ensures same inputs always produce same output order.
 */
function sortSuggestions(suggestions: FigmaDeltaSuggestion[]): FigmaDeltaSuggestion[] {
  return [...suggestions].sort((a, b) => {
    // Sort by componentKey first
    const keyCompare = a.componentKey.localeCompare(b.componentKey);
    if (keyCompare !== 0) return keyCompare;

    // Then by targetState
    const stateCompare = a.targetState.localeCompare(b.targetState);
    if (stateCompare !== 0) return stateCompare;

    // Finally by property
    return a.property.localeCompare(b.property);
  });
}

/**
 * Build summary from suggestions.
 */
function buildSummary(suggestions: FigmaDeltaSuggestion[]): SuggestSummary {
  const byTarget: Record<SuggestionTarget, number> = {
    ast: 0,
    marker: 0,
    override: 0,
    none: 0,
  };

  const byKind: Record<SuggestionKind, number> = {
    APPLY_PROPERTY: 0,
    UPDATE_MARKER: 0,
    UPDATE_OVERRIDE: 0,
    AST_WRITE_PATCH: 0,
    BLOCKED: 0,
  };

  const byProperty: Record<DeltaPropertyType, number> = {
    fill: 0,
    textColor: 0,
    padding: 0,
    gap: 0,
    width: 0,
    height: 0,
    fontSize: 0,
    fontWeight: 0,
  };

  const byState: Record<string, number> = {};

  for (const suggestion of suggestions) {
    byTarget[suggestion.suggestedTarget]++;
    byKind[suggestion.kind]++;
    byProperty[suggestion.property]++;
    byState[suggestion.targetState] = (byState[suggestion.targetState] ?? 0) + 1;
  }

  return {
    total: suggestions.length,
    byTarget,
    byKind,
    byProperty,
    byState,
  };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Generate delta suggestions from Phase 12A deltas.
 *
 * Converts detected Figma changes into actionable suggestions
 * for where the changes should land (AST, marker, or override).
 *
 * @param input - Suggest input with deltas and context
 * @returns Suggest output with sorted suggestions
 */
export function generateDeltaSuggestions(input: SuggestInput): SuggestOutput {
  const allSuggestions: FigmaDeltaSuggestion[] = [];

  // Generate suggestions for each delta output
  for (const deltaOutput of input.deltas) {
    const suggestions = generateSuggestionsForVariant(deltaOutput, input);
    allSuggestions.push(...suggestions);
  }

  // Sort deterministically
  const sortedSuggestions = sortSuggestions(allSuggestions);

  // Build summary
  const summary = buildSummary(sortedSuggestions);

  return {
    filePath: input.filePath,
    suggestions: sortedSuggestions,
    summary,
  };
}
