/**
 * @aesthetic-function/watcher - figmaSuggestions/generateSuggestions.ts
 *
 * Figma Composition Suggestion Generator (Phase 11A).
 *
 * WHY: Translates canonical design semantics into actionable Figma
 * composition guidance. This is READ-ONLY analysis that describes
 * what should exist in Figma, without creating or modifying anything.
 *
 * SCOPE: Read-only suggestions only. No writes, no mutations.
 * Does NOT:
 * - Modify TSX/JSX
 * - Write markers or overrides
 * - Modify component-map.json
 * - Emit Figma operations
 * - Call materializers
 *
 * ARCHITECTURE:
 * 1. Component Set Suggestions - for components not in component-map.json
 * 2. Variant Suggestions - EXPLICIT ONLY from markers/overrides
 * 3. Property Suggestions - from canonical semantics
 * 4. Token Usage Suggestions - when canonical tokens resolve cleanly
 * 5. Coverage Gap Suggestions - from Phase 10F/10G gaps
 */

import type { CanonicalSemanticValue } from '../tokens/canonical/types.js';
import type {
  FigmaSuggestion,
  FigmaSuggestionInput,
  FigmaSuggestionResult,
  SuggestionType,
  SuggestionSource,
  SuggestionConfidence,
} from './types.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert component name to a human-readable Figma name.
 *
 * Examples:
 * - "LoginButton" → "Login Button"
 * - "CardHeader" → "Card Header"
 * - "v-btn" → "V Btn"
 */
function toFigmaName(componentName: string): string {
  // Handle kebab-case (v-btn → V Btn)
  if (componentName.includes('-')) {
    return componentName
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // Handle PascalCase (LoginButton → Login Button)
  return componentName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * Extract component name from componentKey.
 *
 * Examples:
 * - "auth/LoginButton" → "LoginButton"
 * - "App" → "App"
 */
function extractComponentName(componentKey: string): string {
  const parts = componentKey.split('/');
  return parts[parts.length - 1];
}

/**
 * Sort suggestions deterministically for stable output.
 */
function sortSuggestions(suggestions: FigmaSuggestion[]): FigmaSuggestion[] {
  return [...suggestions].sort((a, b) => {
    // Primary: by componentKey
    if (a.componentKey !== b.componentKey) {
      return a.componentKey.localeCompare(b.componentKey);
    }
    // Secondary: by type (component-set first, then variants, etc.)
    const typeOrder: Record<SuggestionType, number> = {
      'component-set': 0,
      'variant': 1,
      'property': 2,
      'token-usage': 3,
      'coverage-gap': 4,
    };
    if (a.type !== b.type) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    // Tertiary: by message for determinism
    return a.message.localeCompare(b.message);
  });
}

/**
 * Count suggestions by type.
 */
function countByType(
  suggestions: FigmaSuggestion[]
): Record<SuggestionType, number> {
  const counts: Record<SuggestionType, number> = {
    'component-set': 0,
    'variant': 0,
    'property': 0,
    'token-usage': 0,
    'coverage-gap': 0,
  };
  for (const s of suggestions) {
    counts[s.type]++;
  }
  return counts;
}

/**
 * Count suggestions by source.
 */
function countBySource(
  suggestions: FigmaSuggestion[]
): Record<SuggestionSource, number> {
  const counts: Record<SuggestionSource, number> = {
    'canonical': 0,
    'adapter': 0,
    'policy': 0,
    'coverage': 0,
  };
  for (const s of suggestions) {
    counts[s.source]++;
  }
  return counts;
}

// =============================================================================
// SUGGESTION GENERATORS
// =============================================================================

/**
 * Generate component set suggestions for components not in the map.
 *
 * Rule: If a component has canonical semantics and is not in component-map.json,
 * suggest creating a Component Set in Figma.
 */
function generateComponentSetSuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestion[] {
  const suggestions: FigmaSuggestion[] = [];

  for (const anchor of input.anchoredReport.anchors) {
    const componentKey = anchor.componentKey;
    if (!componentKey) continue;

    // Check if component exists in map
    const existsInMap = input.componentMap.components[componentKey] !== undefined;
    if (existsInMap) continue;

    // Check if component has canonical semantics
    const hasCanonical = input.canonicalSemantics.has(componentKey);
    if (!hasCanonical) continue;

    const componentName = anchor.componentName ?? extractComponentName(componentKey);
    const figmaName = toFigmaName(componentName);

    suggestions.push({
      componentKey,
      figmaNameSuggestion: figmaName,
      type: 'component-set',
      message: `Create a Component Set named "${figmaName}" for componentKey ${componentKey}.`,
      source: 'canonical',
      confidence: 'high',
      details: {
        componentName,
        hasCanonicalSemantics: true,
      },
    });
  }

  return suggestions;
}

/**
 * Generate variant suggestions from explicit markers/overrides ONLY.
 *
 * Rule: Only suggest variants when explicitly observed via:
 * - @figma state=X markers
 * - design-overrides.json keys with ::state
 *
 * NEVER infer variants from disabled booleans, hover styles, or adapter heuristics.
 */
function generateVariantSuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestion[] {
  const suggestions: FigmaSuggestion[] = [];

  for (const [componentKey, states] of input.explicitVariantStates) {
    if (states.length === 0) continue;

    const componentName = extractComponentName(componentKey);
    const figmaName = toFigmaName(componentName);

    // Create one suggestion per variant state
    for (const state of states) {
      suggestions.push({
        componentKey,
        figmaNameSuggestion: figmaName,
        type: 'variant',
        message: `Component Set "${figmaName}" should include variant "${state}".`,
        source: 'canonical',
        confidence: 'high',
        details: {
          variantState: state,
          sourceType: 'explicit-marker-or-override',
        },
      });
    }
  }

  return suggestions;
}

/**
 * Map property field names to Figma property suggestions.
 */
const PROPERTY_MAPPINGS: Record<string, { property: string; description: string }> = {
  'fill': { property: 'Fill', description: 'Fill style' },
  'gap': { property: 'Auto Layout Gap', description: 'spacing property' },
  'padding': { property: 'Auto Layout Padding', description: 'padding property' },
  'margin': { property: 'Layout Margin', description: 'margin property' },
  'borderRadius': { property: 'Corner Radius', description: 'corner radius' },
  'fontSize': { property: 'Text Style', description: 'text style' },
  'fontWeight': { property: 'Text Style', description: 'font weight' },
};

/**
 * Generate property suggestions from canonical semantics.
 *
 * Rule: From canonical semantics, suggest Figma properties:
 * - color → Fill property
 * - spacing → Auto Layout Gap/Padding
 * - radius → Corner Radius
 * - typography → Text Style
 */
function generatePropertySuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestion[] {
  const suggestions: FigmaSuggestion[] = [];

  for (const [componentKey, canonical] of input.canonicalSemantics) {
    const componentName = extractComponentName(componentKey);
    const figmaName = toFigmaName(componentName);

    // Color properties
    if (canonical.colors?.fill) {
      const token = canonical.colors.fill.value;
      const confidence = mapConfidence(canonical.colors.fill.confidence);
      suggestions.push({
        componentKey,
        figmaNameSuggestion: figmaName,
        type: 'property',
        message: `Component "${figmaName}" uses ${token} → map to Fill style.`,
        source: 'canonical',
        confidence,
        details: {
          category: 'colors',
          field: 'fill',
          canonicalToken: token,
          figmaProperty: 'Fill',
        },
      });
    }

    // Spacing properties
    if (canonical.spacing) {
      for (const [field, value] of Object.entries(canonical.spacing)) {
        if (!value) continue;
        const semanticValue = value as CanonicalSemanticValue<string>;
        const mapping = PROPERTY_MAPPINGS[field];
        if (!mapping) continue;

        const confidence = mapConfidence(semanticValue.confidence);
        suggestions.push({
          componentKey,
          figmaNameSuggestion: figmaName,
          type: 'property',
          message: `Component "${figmaName}" uses ${semanticValue.value} → map to ${mapping.property}.`,
          source: 'canonical',
          confidence,
          details: {
            category: 'spacing',
            field,
            canonicalToken: semanticValue.value,
            figmaProperty: mapping.property,
          },
        });
      }
    }

    // Radius properties
    if (canonical.radius?.borderRadius) {
      const token = canonical.radius.borderRadius.value;
      const confidence = mapConfidence(canonical.radius.borderRadius.confidence);
      suggestions.push({
        componentKey,
        figmaNameSuggestion: figmaName,
        type: 'property',
        message: `Component "${figmaName}" uses ${token} → map to Corner Radius.`,
        source: 'canonical',
        confidence,
        details: {
          category: 'radius',
          field: 'borderRadius',
          canonicalToken: token,
          figmaProperty: 'Corner Radius',
        },
      });
    }

    // Typography properties
    if (canonical.typography) {
      for (const [field, value] of Object.entries(canonical.typography)) {
        if (!value) continue;
        const semanticValue = value as CanonicalSemanticValue<string>;
        const confidence = mapConfidence(semanticValue.confidence);
        suggestions.push({
          componentKey,
          figmaNameSuggestion: figmaName,
          type: 'property',
          message: `Component "${figmaName}" uses ${semanticValue.value} → map to Text Style.`,
          source: 'canonical',
          confidence,
          details: {
            category: 'typography',
            field,
            canonicalToken: semanticValue.value,
            figmaProperty: 'Text Style',
          },
        });
      }
    }
  }

  return suggestions;
}

/**
 * Map source confidence level to suggestion confidence.
 */
function mapConfidence(confidence: 'high' | 'medium' | 'low'): SuggestionConfidence {
  return confidence;
}

/**
 * Generate token usage suggestions when canonical tokens resolve cleanly.
 *
 * Rule: When canonical tokens resolve to design system values,
 * suggest using the token instead of hard-coded values.
 */
function generateTokenUsageSuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestion[] {
  const suggestions: FigmaSuggestion[] = [];

  for (const [componentKey, resolution] of input.canonicalResolution) {
    const componentName = extractComponentName(componentKey);
    const figmaName = toFigmaName(componentName);

    // Check colors for clean resolutions
    for (const [_colorKey, resolved] of Object.entries(resolution.colors)) {
      if (resolved.resolved && resolved.confidence === 'high') {
        suggestions.push({
          componentKey,
          figmaNameSuggestion: figmaName,
          type: 'token-usage',
          message: `Use token ${resolved.canonical} instead of hard-coded fill "${resolved.resolved}".`,
          source: 'canonical',
          confidence: 'high',
          details: {
            category: 'colors',
            canonicalToken: resolved.canonical,
            resolvedValue: resolved.resolved,
            figmaProperty: 'Fill',
          },
        });
      }
    }

    // Check spacing for clean resolutions
    for (const [_spacingKey, resolved] of Object.entries(resolution.spacing)) {
      if (resolved.resolved && resolved.confidence === 'high') {
        suggestions.push({
          componentKey,
          figmaNameSuggestion: figmaName,
          type: 'token-usage',
          message: `Use token ${resolved.canonical} instead of hard-coded spacing "${resolved.resolved}px".`,
          source: 'canonical',
          confidence: 'high',
          details: {
            category: 'spacing',
            canonicalToken: resolved.canonical,
            resolvedValue: resolved.resolved,
            figmaProperty: 'Auto Layout',
          },
        });
      }
    }
  }

  return suggestions;
}

/**
 * Generate coverage gap suggestions from Phase 10F/10G gaps.
 *
 * Rule: When coverage reports show gaps (unresolved tokens),
 * emit coverage-gap suggestions.
 */
function generateCoverageGapSuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestion[] {
  const suggestions: FigmaSuggestion[] = [];

  // From coverage report gaps
  if (input.coverageReport?.gaps) {
    for (const gap of input.coverageReport.gaps) {
      suggestions.push({
        componentKey: 'project-level',
        figmaNameSuggestion: '',
        type: 'coverage-gap',
        message: `No ${gap.category} token resolved for ${gap.canonical} — consider adding to design system.`,
        source: 'coverage',
        confidence: 'medium',
        details: {
          category: gap.category,
          canonical: gap.canonical,
          note: gap.note,
        },
      });
    }
  }

  // From policy violations (when in strict mode, these are gaps)
  if (input.policyViolations) {
    for (const violation of input.policyViolations) {
      suggestions.push({
        componentKey: violation.componentKey ?? 'unknown',
        figmaNameSuggestion: '',
        type: 'coverage-gap',
        message: `Policy violation: ${violation.reason} (${violation.canonical})`,
        source: 'policy',
        confidence: 'high',
        details: {
          category: violation.category,
          canonical: violation.canonical,
          reason: violation.reason,
          file: violation.file,
        },
      });
    }
  }

  return suggestions;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generate Figma composition suggestions from canonical semantics.
 *
 * This is the main entry point for Phase 11A suggestion generation.
 *
 * @param input - Read-only input from prior phases
 * @returns Deterministic, sorted suggestion result
 */
export function generateFigmaSuggestions(
  input: FigmaSuggestionInput
): FigmaSuggestionResult {
  const allSuggestions: FigmaSuggestion[] = [];

  // 1. Component Set Suggestions (missing from map)
  allSuggestions.push(...generateComponentSetSuggestions(input));

  // 2. Variant Suggestions (explicit only)
  allSuggestions.push(...generateVariantSuggestions(input));

  // 3. Property Suggestions (from canonical semantics)
  allSuggestions.push(...generatePropertySuggestions(input));

  // 4. Token Usage Suggestions (clean resolutions)
  allSuggestions.push(...generateTokenUsageSuggestions(input));

  // 5. Coverage Gap Suggestions (unresolved tokens)
  allSuggestions.push(...generateCoverageGapSuggestions(input));

  // Sort for deterministic output
  const sorted = sortSuggestions(allSuggestions);

  return {
    suggestions: sorted,
    countByType: countByType(sorted),
    countBySource: countBySource(sorted),
    total: sorted.length,
  };
}
