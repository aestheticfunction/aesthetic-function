/**
 * @aesthetic-function/watcher - figmaSuggestions/types.ts
 *
 * Figma Composition Suggestion Types (Phase 11A).
 *
 * WHY: After canonical resolution and policy analysis, we can translate
 * semantic understanding into actionable Figma composition guidance.
 * This module produces READ-ONLY suggestions for what should exist in Figma
 * based on code semantics.
 *
 * SCOPE: Read-only suggestions only. No writes, no mutations.
 * Does NOT:
 * - Modify TSX/JSX
 * - Write markers or overrides
 * - Modify component-map.json
 * - Emit Figma operations
 * - Call materializers
 */

import type { CanonicalSemantics } from '../tokens/canonical/types.js';
import type { CanonicalResolution, CoverageReport } from '../canonicalResolver/types.js';
import type { PolicyViolation } from '../canonicalResolverPolicy/types.js';
import type { AnchoredAstReport } from '../ast/types.js';
import type { ComponentMap } from '../reconcile/componentMap.js';
import type { FileAdapterResult } from '../ast/parseIntentFromReactAst.js';

// =============================================================================
// SUGGESTION TYPES
// =============================================================================

/**
 * Types of Figma composition suggestions.
 *
 * - 'component-set': Suggest creating a new Component Set in Figma
 * - 'variant': Suggest adding a variant to an existing Component Set
 * - 'property': Suggest a property (color, spacing, etc.) for a component
 * - 'token-usage': Suggest using a design token instead of raw value
 * - 'coverage-gap': Highlight a gap in design system coverage
 */
export type SuggestionType =
  | 'component-set'
  | 'variant'
  | 'property'
  | 'token-usage'
  | 'coverage-gap';

/**
 * Source that generated this suggestion.
 *
 * - 'canonical': From canonical semantic normalization (Phase 10E)
 * - 'adapter': From framework adapter semantics (Phase 10A)
 * - 'policy': From resolution policy analysis (Phase 10G)
 * - 'coverage': From coverage gap detection (Phase 10F)
 */
export type SuggestionSource = 'canonical' | 'adapter' | 'policy' | 'coverage';

/**
 * Confidence level for the suggestion.
 *
 * - 'high': Strong signal, likely actionable
 * - 'medium': Moderate signal, needs review
 * - 'low': Weak signal, possibly spurious
 */
export type SuggestionConfidence = 'high' | 'medium' | 'low';

// =============================================================================
// FIGMA SUGGESTION
// =============================================================================

/**
 * A single Figma composition suggestion.
 *
 * READ-ONLY: These suggestions describe what should exist in Figma
 * but do NOT create or modify anything.
 */
export interface FigmaSuggestion {
  /**
   * The component key this suggestion relates to.
   * Format: <dir>/<exportName> or just <exportName>
   *
   * Example: "components/LoginButton", "App"
   */
  componentKey: string;

  /**
   * Suggested Figma component name.
   * Human-readable name for the Figma Component Set.
   *
   * Example: "Login Button", "Primary Card"
   */
  figmaNameSuggestion: string;

  /**
   * Type of suggestion (component-set, variant, property, etc.)
   */
  type: SuggestionType;

  /**
   * Human-readable message explaining the suggestion.
   *
   * Example: "Create a Component Set named LoginButton for componentKey auth/LoginButton."
   */
  message: string;

  /**
   * Additional details about the suggestion (optional).
   * Structure varies by suggestion type.
   */
  details?: Record<string, unknown>;

  /**
   * Source that generated this suggestion.
   */
  source: SuggestionSource;

  /**
   * Confidence level for this suggestion.
   */
  confidence: SuggestionConfidence;
}

// =============================================================================
// GENERATOR INPUT
// =============================================================================

/**
 * Input for generating Figma suggestions.
 *
 * All inputs are READ-ONLY from prior phases.
 */
export interface FigmaSuggestionInput {
  /**
   * Anchored AST report with component information.
   * From Phase 6B AST analysis.
   */
  anchoredReport: AnchoredAstReport;

  /**
   * Adapter results with framework semantics.
   * From Phase 10A adapter extraction.
   */
  adapterResult: FileAdapterResult;

  /**
   * Canonical semantics per component.
   * From Phase 10E normalization.
   * Key is componentKey, value is canonical semantics.
   */
  canonicalSemantics: Map<string, CanonicalSemantics>;

  /**
   * Resolution results per component.
   * From Phase 10F resolution.
   * Key is componentKey, value is resolution result.
   */
  canonicalResolution: Map<string, CanonicalResolution>;

  /**
   * Coverage report from Phase 10F.
   * Aggregated coverage across all components.
   */
  coverageReport?: CoverageReport;

  /**
   * Policy violations from Phase 10G.
   * List of all policy violations detected.
   */
  policyViolations?: PolicyViolation[];

  /**
   * Current component map (read-only).
   * Used to check if components already exist.
   */
  componentMap: ComponentMap;

  /**
   * Explicit variant states from markers/overrides.
   * Only includes @figma state=X markers and design-overrides.json ::state keys.
   * Key is componentKey, value is array of state names.
   */
  explicitVariantStates: Map<string, string[]>;
}

// =============================================================================
// GENERATOR OUTPUT
// =============================================================================

/**
 * Result of generating Figma suggestions.
 */
export interface FigmaSuggestionResult {
  /**
   * All suggestions generated, sorted deterministically.
   */
  suggestions: FigmaSuggestion[];

  /**
   * Count by suggestion type.
   */
  countByType: Record<SuggestionType, number>;

  /**
   * Count by source.
   */
  countBySource: Record<SuggestionSource, number>;

  /**
   * Total suggestions generated.
   */
  total: number;
}
