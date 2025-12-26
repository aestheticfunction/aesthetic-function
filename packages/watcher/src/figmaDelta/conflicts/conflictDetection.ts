/**
 * @aesthetic-function/watcher - figmaDelta/conflicts/conflictDetection.ts
 *
 * Phase 12D: Conflict Detection & Resolution Preview.
 *
 * WHY: Implements read-only analysis that explains what is out of sync
 * between Figma and code, why, and what would happen if applied.
 *
 * SCOPE:
 * - Read-only: no file writes, no mutations
 * - Deterministic: same inputs → same outputs
 * - Reuses existing policy logic from Phase 12B
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX, markers, overrides, or component maps
 * - Does NOT emit Figma operations
 * - Does NOT call apply functions
 * - Does NOT trigger orchestrator flows
 */

import type {
  ConflictDetectionInput,
  ConflictReport,
  ConflictItem,
  ConflictEvidence,
  ConflictTarget,
  ConflictType,
  ConflictSummary,
} from './types.js';
import type { FigmaDeltaSuggestion } from '../../figmaDeltaSuggest/types.js';
import type { MarkerData } from '../../parse/parseIntentFromReact.js';
import type { DesignOverrides } from '../../reconcile/types.js';
import type { AstIntentReport, WriteFeasibilityReport, WriteSafetyReport } from '../../ast/types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Non-base states that cannot have AST writes.
 */
const NON_BASE_STATES = ['hover', 'pressed', 'disabled', 'focus', 'active'];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a state is non-base.
 */
function isNonBaseState(state: string): boolean {
  return NON_BASE_STATES.includes(state.toLowerCase());
}

/**
 * Find marker for a component::state combination.
 */
function findMarker(
  componentKey: string,
  state: string,
  markers: MarkerData[]
): MarkerData | undefined {
  for (const marker of markers) {
    // Check for state marker format: node=Component::state
    if (marker.node === `${componentKey}::${state}`) {
      return marker;
    }
    // For base state, also check marker without state
    if (state === 'base' && marker.node === componentKey) {
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
 * Find override for a component::state combination.
 */
function findOverride(
  componentKey: string,
  state: string,
  overrides: DesignOverrides | null
): { key: string; override: DesignOverrides[string] } | undefined {
  if (!overrides) return undefined;

  // Check explicit state key
  const stateKey = `${componentKey}::${state}`;
  if (overrides[stateKey]) {
    return { key: stateKey, override: overrides[stateKey] };
  }

  // For base state, check component key without state
  if (state === 'base' && overrides[componentKey]) {
    return { key: componentKey, override: overrides[componentKey] };
  }

  return undefined;
}

/**
 * Get existing value from override for a property.
 */
function getOverrideValue(
  override: DesignOverrides[string],
  property: string
): unknown {
  switch (property) {
    case 'fill':
      return override.fill;
    case 'text':
      return override.text;
    case 'padding':
      return override.layout?.padding;
    case 'gap':
      return override.layout?.gap;
    case 'width':
      return override.layout?.width;
    case 'height':
      return override.layout?.height;
    // fontSize and fontWeight not stored in overrides
    default:
      return undefined;
  }
}

/**
 * Get existing value from marker for a property.
 */
function getMarkerValue(marker: MarkerData, property: string): unknown {
  switch (property) {
    case 'fill':
      return marker.fill;
    case 'text':
      return marker.text;
    // Other properties not stored in markers
    default:
      return undefined;
  }
}

/**
 * Find write safety report for a component.
 */
function findWriteSafetyReport(
  componentKey: string,
  writeFeasibility?: WriteFeasibilityReport
): WriteSafetyReport | undefined {
  if (!writeFeasibility) return undefined;
  return writeFeasibility.reports.find(
    (report) => report.nodeName === componentKey || report.componentName === componentKey
  );
}

/**
 * Determine the conflict type based on the evidence.
 */
function determineConflictType(
  suggestion: FigmaDeltaSuggestion,
  existingEvidence?: ConflictEvidence
): ConflictType {
  // Low confidence → blocked
  if (suggestion.confidence === 'low') {
    return 'LOW_CONFIDENCE_BLOCKED';
  }

  // Non-base state blocked (no explicit data)
  if (isNonBaseState(suggestion.targetState) && suggestion.suggestedTarget === 'none') {
    return 'NON_BASE_STATE_BLOCKED';
  }

  // Canonical mismatch (raw matches but canonical differs)
  if (existingEvidence?.canonical && suggestion.toCanonical) {
    if (existingEvidence.canonical !== suggestion.toCanonical) {
      return 'CANONICAL_MISMATCH';
    }
  }

  // Determine by existing source
  if (!existingEvidence) {
    // No existing evidence - could be unmapped or new
    if (suggestion.suggestedTarget === 'none') {
      return 'UNMAPPED_VARIANT';
    }
    return 'AST_VS_FIGMA'; // Default for new values
  }

  switch (existingEvidence.source) {
    case 'ast':
      return 'AST_VS_FIGMA';
    case 'marker':
      return 'MARKER_VS_FIGMA';
    case 'override':
      return 'OVERRIDE_VS_FIGMA';
    default:
      return 'AST_VS_FIGMA';
  }
}

/**
 * Determine the policy rule that applies.
 */
function determinePolicyRule(
  suggestion: FigmaDeltaSuggestion,
  conflictType: ConflictType
): string {
  // Low confidence
  if (conflictType === 'LOW_CONFIDENCE_BLOCKED') {
    return 'low-confidence-blocked';
  }

  // Non-base state
  if (isNonBaseState(suggestion.targetState)) {
    if (suggestion.suggestedTarget === 'none') {
      return 'non-base-state-no-explicit-data';
    }
    if (suggestion.suggestedTarget === 'ast') {
      return 'non-base-state-refused';
    }
    return 'non-base-state-to-' + suggestion.suggestedTarget;
  }

  // Base state
  switch (suggestion.suggestedTarget) {
    case 'ast':
      return 'auto-writable-literal';
    case 'marker':
      return 'existing-marker-update';
    case 'override':
      return 'override-fallback';
    case 'none':
      return 'blocked-no-target';
    default:
      return 'unknown';
  }
}

/**
 * Build existing evidence from available sources.
 */
function buildExistingEvidence(
  componentKey: string,
  state: string,
  property: string,
  markers: MarkerData[],
  overrides: DesignOverrides | null,
  astReport?: AstIntentReport,
  writeFeasibility?: WriteFeasibilityReport
): ConflictEvidence | undefined {
  // Check override first
  const overrideResult = findOverride(componentKey, state, overrides);
  if (overrideResult) {
    const value = getOverrideValue(overrideResult.override, property);
    if (value !== undefined) {
      return {
        source: 'override',
        value,
      };
    }
  }

  // Check marker
  const marker = findMarker(componentKey, state, markers);
  if (marker) {
    const value = getMarkerValue(marker, property);
    if (value !== undefined) {
      return {
        source: 'marker',
        value,
        loc: { startLine: marker.lineNumber, endLine: marker.lineNumber },
      };
    }
  }

  // Check AST (only for base state)
  if (state === 'base' && astReport) {
    const component = astReport.components.find(
      (c) => c.componentName === componentKey
    );
    if (component?.semantics) {
      // Try to get value from semantics based on property
      const semantics = component.semantics;
      let value: unknown;
      let loc: { startLine: number; endLine: number } | undefined;

      switch (property) {
        case 'fill':
          if (semantics.visual?.fills?.[0]) {
            value = semantics.visual.fills[0].value;
            loc = semantics.visual.fills[0].loc;
          }
          break;
        case 'gap':
          if (semantics.layout?.gap) {
            value = semantics.layout.gap.value;
            loc = semantics.layout.gap.loc;
          }
          break;
        case 'padding':
          if (semantics.layout?.padding) {
            value = semantics.layout.padding.value;
            loc = semantics.layout.padding.loc;
          }
          break;
        // fontSize and fontWeight not in ComponentSemanticIntent.layout
        // They would be in text semantics or custom extraction
      }

      if (value !== undefined) {
        // Check if auto-writable
        const writeSafety = findWriteSafetyReport(componentKey, writeFeasibility);
        const confidence: 'high' | 'medium' | 'low' = writeSafety
          ? (writeSafety.autoWritable.length > 0 ? 'high' : 'medium')
          : 'low';

        return {
          source: 'ast',
          value,
          confidence,
          loc,
        };
      }
    }
  }

  return undefined;
}

/**
 * Build human-readable reason for the conflict resolution.
 */
function buildReason(
  suggestion: FigmaDeltaSuggestion,
  conflictType: ConflictType,
  existingEvidence?: ConflictEvidence
): string {
  const state = suggestion.targetState;
  const property = suggestion.property;
  const target = suggestion.suggestedTarget;

  // Low confidence
  if (conflictType === 'LOW_CONFIDENCE_BLOCKED') {
    return `Low confidence delta for ${property}; auto-apply blocked until verified`;
  }

  // Non-base state blocked
  if (conflictType === 'NON_BASE_STATE_BLOCKED') {
    return `Non-base state '${state}' has no explicit marker or override; create one first`;
  }

  // Unmapped variant
  if (conflictType === 'UNMAPPED_VARIANT') {
    return `Variant for ${state} not found in component map`;
  }

  // Canonical mismatch
  if (conflictType === 'CANONICAL_MISMATCH') {
    return `Raw values match but canonical tokens differ; allowed but flagged for review`;
  }

  // AST write
  if (target === 'ast') {
    return `Auto-writable ${property} literal in base state; direct AST update allowed`;
  }

  // Marker update
  if (target === 'marker') {
    const line = existingEvidence?.loc?.startLine ?? 'unknown';
    return `Existing ${state} marker at L${line}; marker update suggested`;
  }

  // Override update
  if (target === 'override') {
    if (isNonBaseState(state)) {
      return `Non-base state '${state}'; AST writes disallowed, override suggested`;
    }
    return `No auto-writable AST location; override fallback`;
  }

  // Blocked
  if (target === 'none') {
    return suggestion.blockingReason ?? 'Blocked by policy';
  }

  return suggestion.reason;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Generate a conflict report from deltas and suggestions.
 *
 * This function analyzes Figma deltas and their suggestions to produce
 * a read-only report of what would happen if they were applied.
 *
 * @param input - Conflict detection input with all context
 * @returns Conflict report with all detected conflicts and summary
 */
export function generateConflictReport(input: ConflictDetectionInput): ConflictReport {
  const {
    filePath,
    suggestions,
    markers,
    overrides,
    astReport,
    writeFeasibility,
  } = input;

  const conflicts: ConflictItem[] = [];

  // Process each suggestion
  for (const suggestion of suggestions) {
    // Build Figma evidence
    const figmaEvidence: ConflictEvidence = {
      source: 'figma',
      value: suggestion.toRaw,
      canonical: suggestion.toCanonical,
      confidence: suggestion.confidence,
    };

    // Build existing evidence
    const existingEvidence = buildExistingEvidence(
      suggestion.componentKey,
      suggestion.targetState,
      suggestion.property,
      markers,
      overrides,
      astReport,
      writeFeasibility
    );

    // Determine conflict type
    const conflictType = determineConflictType(suggestion, existingEvidence);

    // Determine policy rule
    const policyRule = determinePolicyRule(suggestion, conflictType);

    // Determine if would apply
    const wouldApply =
      suggestion.suggestedTarget !== 'none' &&
      suggestion.confidence !== 'low';

    // Build reason
    const reason = buildReason(suggestion, conflictType, existingEvidence);

    // Map suggestion target to conflict target
    const suggestedTarget: ConflictTarget =
      suggestion.suggestedTarget === 'none' ? 'none' : suggestion.suggestedTarget;

    conflicts.push({
      componentKey: suggestion.componentKey,
      targetState: suggestion.targetState,
      property: suggestion.property,
      conflictType,
      figma: figmaEvidence,
      existing: existingEvidence,
      suggestedTarget,
      wouldApply,
      reason,
      policyRule,
    });
  }

  // Sort deterministically
  conflicts.sort((a, b) => {
    if (a.componentKey !== b.componentKey) {
      return a.componentKey.localeCompare(b.componentKey);
    }
    if (a.targetState !== b.targetState) {
      return a.targetState.localeCompare(b.targetState);
    }
    return a.property.localeCompare(b.property);
  });

  // Build summary
  const summary = buildConflictSummary(conflicts);

  return {
    filePath,
    generatedAt: new Date().toISOString(),
    conflicts,
    summary,
  };
}

/**
 * Build summary statistics for conflicts.
 */
function buildConflictSummary(conflicts: ConflictItem[]): ConflictSummary {
  const byTarget: Record<ConflictTarget, number> = {
    ast: 0,
    marker: 0,
    override: 0,
    none: 0,
  };

  const byType: Record<ConflictType, number> = {
    AST_VS_FIGMA: 0,
    MARKER_VS_FIGMA: 0,
    OVERRIDE_VS_FIGMA: 0,
    CANONICAL_MISMATCH: 0,
    UNMAPPED_VARIANT: 0,
    NON_BASE_STATE_BLOCKED: 0,
    LOW_CONFIDENCE_BLOCKED: 0,
  };

  let blocked = 0;
  let wouldApplyCount = 0;

  for (const conflict of conflicts) {
    byTarget[conflict.suggestedTarget]++;
    byType[conflict.conflictType]++;

    if (conflict.wouldApply) {
      wouldApplyCount++;
    } else {
      blocked++;
    }
  }

  return {
    total: conflicts.length,
    byTarget,
    byType,
    blocked,
    wouldApply: wouldApplyCount,
  };
}
