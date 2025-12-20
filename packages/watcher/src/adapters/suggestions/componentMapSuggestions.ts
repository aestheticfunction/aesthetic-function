/**
 * @aesthetic-function/watcher - adapters/suggestions/componentMapSuggestions.ts
 *
 * Component Map Bootstrap Suggestions (Phase 10C).
 *
 * READ-ONLY: This module suggests component-map.json entries but does NOT write them.
 * The suggestions appear in the ast:report CLI output for manual review.
 *
 * WHY: When a new codebase is analyzed, the user needs to bootstrap their
 * component-map.json with entries for each component. This module:
 * - Derives suggestions from AST anchors (componentKey, componentName)
 * - Augments with adapter semantics (framework-specific naming hints)
 * - Reports suggestions in the CLI without writing files
 *
 * VARIANT STATE POLICY (10C Fix):
 * - Variant suggestions are EXPLICIT-ONLY (markers/overrides), never inferred from semantics
 * - Only states from @figma state=X markers or design-overrides.json ::state keys are included
 * - Semantic analysis (disabled boolean, hover hints) may appear in reason but NOT create states
 *
 * WHAT THIS DOES NOT DO:
 * - Write files (read-only only)
 * - Include Figma node IDs (no nodeId, no figma scope)
 * - Modify protocol or server payloads
 * - Affect reconciliation logic
 * - Infer variant states from semantic analysis
 *
 * ARCHITECTURE:
 * - ComponentMapSuggestion: Type describing a single suggestion
 * - generateSuggestions(): Derives suggestions from AST + adapters
 * - CLI integration via cliReport.ts
 */

import type { AnchoredAstReport } from '../../ast/types.js';
import type { FileAdapterResult, ComponentAdapterResult } from '../../ast/parseIntentFromReactAst.js';
import type { ComponentMap } from '../../reconcile/componentMap.js';
import type { MarkerData } from '../../parse/parseIntentFromReact.js';
import type { DesignOverrides } from '../../reconcile/types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source that generated this suggestion.
 */
export type SuggestionSource = 'ast-anchor' | 'adapter-semantics' | 'combined';

/**
 * A single component map bootstrap suggestion.
 *
 * READ-ONLY: These suggestions are displayed in CLI output only.
 * They do NOT include Figma nodeIds since this is a code-only analysis.
 */
export interface ComponentMapSuggestion {
  /**
   * The component key to use in component-map.json.
   * Format: <dir>/<exportName> or just <exportName>
   *
   * Example: "components/LoginButton" or "App"
   */
  componentKey: string;

  /**
   * Suggested Figma component name based on semantic analysis.
   * This is a human-readable name that should match the Figma component.
   *
   * Example: "Login Button", "Primary Action"
   */
  figmaNameSuggestion: string;

  /**
   * Suggested variant states derived from semantic analysis.
   * Empty array if no variants detected.
   *
   * Example: ["hover", "disabled", "pressed"]
   */
  variantStatesSuggested: string[];

  /**
   * Source of this suggestion for debugging/logging.
   */
  source: SuggestionSource;

  /**
   * Human-readable reason explaining why this suggestion was made.
   * Useful for CLI output.
   */
  reason: string;

  /**
   * Framework adapter that contributed to this suggestion (if any).
   * Example: "antd", "vuetify"
   */
  adapterId?: string;

  /**
   * Whether this component already exists in the component map.
   * If true, this is an "update" suggestion rather than "new".
   */
  existsInMap: boolean;

  /**
   * If existsInMap is true, the current Figma name in the map.
   * Allows comparison with the new suggestion.
   */
  currentFigmaName?: string;
}

/**
 * Result of generating component map suggestions.
 */
export interface SuggestionResult {
  /** All suggestions generated */
  suggestions: ComponentMapSuggestion[];
  /** Count of new suggestions (not in map) */
  newCount: number;
  /** Count of update suggestions (already in map) */
  updateCount: number;
  /** Count of components skipped (e.g., no componentKey) */
  skippedCount: number;
}

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
 * Get adapter display name from adapter result.
 */
function getAdapterDisplayName(
  adapterResult: ComponentAdapterResult
): string | undefined {
  if (adapterResult.contributions.length === 0) return undefined;
  return adapterResult.contributions[0].displayName;
}

/**
 * Get adapter ID from adapter result.
 */
function getAdapterId(
  adapterResult: ComponentAdapterResult
): string | undefined {
  if (adapterResult.contributions.length === 0) return undefined;
  return adapterResult.contributions[0].provenance.adapterId;
}

/**
 * Build a suggestion from AST anchor and optional adapter result.
 *
 * NOTE: explicitStates are derived ONLY from @figma markers or design-overrides.json,
 * never from semantic analysis (disabled boolean, hover hints, etc.).
 */
function buildSuggestion(
  componentKey: string,
  componentName: string,
  adapterResult: ComponentAdapterResult | undefined,
  existingEntry: { name: string } | undefined,
  explicitStates: string[]
): ComponentMapSuggestion {
  // Determine source
  const hasAdapter = adapterResult?.hasAdapterMatch ?? false;
  const source: SuggestionSource = hasAdapter ? 'combined' : 'ast-anchor';

  // Derive Figma name
  let figmaNameSuggestion = toFigmaName(componentName);
  let reason = `AST anchor: ${componentName}`;
  let resolvedAdapterId: string | undefined;

  // If adapter contributed, use framework metadata for better naming
  if (hasAdapter && adapterResult) {
    resolvedAdapterId = getAdapterId(adapterResult);
    const adapterName = getAdapterDisplayName(adapterResult);

    // Check for framework-specific component type
    const meta = adapterResult.contributions[0]?.frameworkMetadata;
    if (meta?.component) {
      // Use the framework component type for better naming
      const frameworkType = String(meta.component);
      figmaNameSuggestion = `${adapterName} ${frameworkType}`;
      reason = `${adapterName} adapter: ${frameworkType}`;
    } else {
      reason = `${adapterName} adapter + AST anchor`;
    }
  }

  // Use explicit states ONLY (from markers/overrides)
  // Do NOT derive from semantics (disabled boolean, hover hints, etc.)
  const variantStatesSuggested = [...explicitStates];

  return {
    componentKey,
    figmaNameSuggestion,
    variantStatesSuggested,
    source,
    reason,
    adapterId: resolvedAdapterId,
    existsInMap: existingEntry !== undefined,
    currentFigmaName: existingEntry?.name,
  };
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generate component map suggestions from AST analysis and adapter results.
 *
 * READ-ONLY: This function only generates suggestions, it does NOT write files.
 *
 * VARIANT STATE POLICY: Variant suggestions are EXPLICIT-ONLY (markers/overrides),
 * never inferred from semantics.
 *
 * @param anchoredReport - AST anchored report with component info
 * @param adapterResult - Optional adapter extraction results
 * @param existingMap - Optional existing component map for comparison
 * @param markers - Optional parsed markers for explicit state extraction
 * @param overrides - Optional design overrides for explicit state extraction
 * @returns Suggestions for component-map.json entries
 */
export function generateSuggestions(
  anchoredReport: AnchoredAstReport,
  adapterResult?: FileAdapterResult,
  existingMap?: ComponentMap | null,
  markers?: MarkerData[],
  overrides?: DesignOverrides | null
): SuggestionResult {
  const suggestions: ComponentMapSuggestion[] = [];
  let skippedCount = 0;

  // Build adapter result lookup by component name
  const adapterByComponent = new Map<string, ComponentAdapterResult>();
  if (adapterResult) {
    for (const comp of adapterResult.components) {
      adapterByComponent.set(comp.componentName, comp);
    }
  }

  // Build explicit states lookup by component key
  // States are from markers (state=X) and overrides (key::state)
  const explicitStatesByComponent = new Map<string, Set<string>>();

  // Collect explicit states from markers
  if (markers) {
    for (const anchor of anchoredReport.anchors) {
      if (!anchor.componentKey) continue;

      // Find marker for this anchor by line number
      const marker = markers.find((m) => m.lineNumber === anchor.markerLine);
      if (marker?.state && marker.state !== 'base') {
        if (!explicitStatesByComponent.has(anchor.componentKey)) {
          explicitStatesByComponent.set(anchor.componentKey, new Set());
        }
        explicitStatesByComponent.get(anchor.componentKey)!.add(marker.state);
      }
    }
  }

  // Collect explicit states from override keys (key::state format)
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      const parts = key.split('::');
      if (parts.length === 2) {
        const [baseName, state] = parts;
        if (state && state !== 'base') {
          // Try to match override key to component key
          for (const anchor of anchoredReport.anchors) {
            if (!anchor.componentKey) continue;
            if (
              anchor.componentKey === baseName ||
              anchor.componentKey.endsWith('/' + baseName) ||
              anchor.componentName === baseName
            ) {
              if (!explicitStatesByComponent.has(anchor.componentKey)) {
                explicitStatesByComponent.set(anchor.componentKey, new Set());
              }
              explicitStatesByComponent.get(anchor.componentKey)!.add(state);
            }
          }
        }
      }
    }
  }

  // Process each anchor
  for (const anchor of anchoredReport.anchors) {
    // Skip anchors without component key (required for map entry)
    if (!anchor.componentKey) {
      skippedCount++;
      continue;
    }

    // Skip anchors without component name (nothing to name)
    if (!anchor.componentName) {
      skippedCount++;
      continue;
    }

    // Check if already in map
    const existingEntry = existingMap?.components[anchor.componentKey];
    const existingFigmaEntry = existingEntry?.figma;

    // Get adapter result for this component
    const adapterRes = adapterByComponent.get(anchor.componentName);

    // Get explicit states for this component (from markers/overrides only)
    const explicitStates = Array.from(
      explicitStatesByComponent.get(anchor.componentKey) ?? []
    ).sort();

    // Build suggestion
    const suggestion = buildSuggestion(
      anchor.componentKey,
      anchor.componentName,
      adapterRes,
      existingFigmaEntry,
      explicitStates
    );

    suggestions.push(suggestion);
  }

  // Count new vs update
  const newCount = suggestions.filter((s) => !s.existsInMap).length;
  const updateCount = suggestions.filter((s) => s.existsInMap).length;

  return {
    suggestions,
    newCount,
    updateCount,
    skippedCount,
  };
}

/**
 * Filter suggestions to only include new components (not in map).
 */
export function filterNewSuggestions(
  result: SuggestionResult
): ComponentMapSuggestion[] {
  return result.suggestions.filter((s) => !s.existsInMap);
}

/**
 * Filter suggestions to only include updates (already in map).
 */
export function filterUpdateSuggestions(
  result: SuggestionResult
): ComponentMapSuggestion[] {
  return result.suggestions.filter((s) => s.existsInMap);
}
