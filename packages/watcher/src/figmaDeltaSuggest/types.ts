/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/types.ts
 *
 * Phase 12B: Figma Delta → Code Suggestions Types.
 *
 * WHY: Defines types for the suggestion layer that converts Phase 12A deltas
 * into actionable, safe suggestions for where changes should land.
 *
 * SCOPE:
 * - Read-only suggestions only (no writes)
 * - Variant-scoped targets only (never Component Sets)
 * - Deterministic: same inputs → same outputs
 * - Supports AST write, marker update, override update, or blocked
 */

import type { DeltaPropertyType, DeltaConfidence } from '../figmaDelta/types.js';
import type { SourceLocation, WriteSafetyLevel } from '../ast/types.js';

// =============================================================================
// SUGGESTION TARGET
// =============================================================================

/**
 * Where the delta change should land.
 *
 * - ast: Direct AST modification (inline style literal, JSXText, etc.)
 * - marker: Update @figma marker line
 * - override: Update design-overrides.json entry
 * - none: Blocked - cannot be applied automatically
 */
export type SuggestionTarget = 'ast' | 'marker' | 'override' | 'none';

// =============================================================================
// SUGGESTION KIND
// =============================================================================

/**
 * The kind of suggestion being made.
 *
 * - APPLY_PROPERTY: Apply a property value change
 * - UPDATE_MARKER: Update an existing marker
 * - UPDATE_OVERRIDE: Update an existing override entry
 * - AST_WRITE_PATCH: Direct AST write to literal value
 * - BLOCKED: Cannot be applied automatically
 */
export type SuggestionKind =
  | 'APPLY_PROPERTY'
  | 'UPDATE_MARKER'
  | 'UPDATE_OVERRIDE'
  | 'AST_WRITE_PATCH'
  | 'BLOCKED';

// =============================================================================
// SUGGESTION EVIDENCE
// =============================================================================

/**
 * Evidence supporting the suggestion.
 *
 * Includes pointers to existing structures that the suggestion
 * would modify or that informed the target selection.
 */
export interface SuggestionEvidence {
  /**
   * Figma variant nodeId for the target state.
   * Never a Component Set nodeId.
   */
  variantNodeId: string;

  /**
   * Line number of existing @figma marker (if present).
   */
  markerLine?: number;

  /**
   * Override key in design-overrides.json (if present).
   * Format: "ComponentName" or "ComponentName::state"
   */
  overrideKey?: string;

  /**
   * AST location of writable candidate (if present).
   * Only populated for base state with auto-writable literal.
   */
  astLoc?: SourceLocation;

  /**
   * Write safety level from Phase 6C (if available).
   */
  writeSafetyLevel?: WriteSafetyLevel;

  /**
   * Canonical policy notes (if relevant).
   * E.g., "No canonical token matched; raw value proposed."
   */
  canonicalPolicyNotes?: string[];
}

// =============================================================================
// FIGMA DELTA SUGGESTION
// =============================================================================

/**
 * A single suggestion for how to handle a Figma delta.
 *
 * Represents the recommended action for applying a detected
 * Figma change to the codebase.
 */
export interface FigmaDeltaSuggestion {
  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Target state (base, hover, pressed, disabled).
   */
  targetState: string;

  /**
   * Property being changed.
   */
  property: DeltaPropertyType;

  /**
   * Previous/baseline raw value.
   */
  fromRaw?: string | number;

  /**
   * Previous/baseline canonical token.
   */
  fromCanonical?: string;

  /**
   * New Figma raw value.
   */
  toRaw: string | number;

  /**
   * New Figma canonical token (if resolved).
   */
  toCanonical?: string;

  /**
   * Recommended target for the change.
   */
  suggestedTarget: SuggestionTarget;

  /**
   * Kind of suggestion.
   */
  kind: SuggestionKind;

  /**
   * Confidence level from the original delta.
   */
  confidence: DeltaConfidence;

  /**
   * Human-readable reason for this suggestion.
   */
  reason: string;

  /**
   * Blocking reason (if suggestedTarget is 'none').
   */
  blockingReason?: string;

  /**
   * Evidence supporting the suggestion.
   */
  evidence: SuggestionEvidence;
}

// =============================================================================
// SUGGESTION INPUT
// =============================================================================

/**
 * Input for generating delta suggestions.
 */
export interface SuggestInput {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * Component map for nodeId lookups.
   */
  componentMap: import('../reconcile/componentMap.js').ComponentMap;

  /**
   * Parsed @figma markers from source file.
   */
  markers: import('../parse/parseIntentFromReact.js').MarkerData[];

  /**
   * Design overrides from design-overrides.json.
   */
  overrides: import('../reconcile/types.js').DesignOverrides | null;

  /**
   * Deltas from Phase 12A.
   */
  deltas: import('../figmaDelta/types.js').DeltaOutput[];

  /**
   * Write feasibility report from Phase 6C.
   */
  writeFeasibility?: import('../ast/types.js').WriteFeasibilityReport;

  /**
   * AST anchored report from Phase 6A.
   */
  astAnchors?: import('../ast/types.js').AnchoredAstReport;
}

// =============================================================================
// SUGGESTION OUTPUT
// =============================================================================

/**
 * Output from generating delta suggestions.
 */
export interface SuggestOutput {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * Generated suggestions.
   */
  suggestions: FigmaDeltaSuggestion[];

  /**
   * Summary counts.
   */
  summary: SuggestSummary;
}

/**
 * Summary of suggestion generation.
 */
export interface SuggestSummary {
  /**
   * Total suggestions generated.
   */
  total: number;

  /**
   * Count by suggested target.
   */
  byTarget: Record<SuggestionTarget, number>;

  /**
   * Count by suggestion kind.
   */
  byKind: Record<SuggestionKind, number>;

  /**
   * Count by property type.
   */
  byProperty: Record<DeltaPropertyType, number>;

  /**
   * Count by state.
   */
  byState: Record<string, number>;
}

// =============================================================================
// SUGGESTION ARTIFACT
// =============================================================================

/**
 * Artifact for persisting suggestions.
 *
 * Written to design-materializations/<file>.figma-delta-suggestions.json
 */
export interface SuggestionArtifact {
  /**
   * Schema version.
   */
  version: '1.0';

  /**
   * Source of the suggestions.
   */
  source: 'figma-delta';

  /**
   * ISO timestamp when suggestions were generated.
   */
  generatedAt: string;

  /**
   * Source file path.
   */
  sourceFile: string;

  /**
   * Summary counts.
   */
  summary: SuggestSummary;

  /**
   * Sorted list of suggestions.
   * Sorted by: componentKey → targetState → property (deterministic)
   */
  suggestions: FigmaDeltaSuggestion[];
}
