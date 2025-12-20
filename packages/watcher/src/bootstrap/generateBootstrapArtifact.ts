/**
 * @aesthetic-function/watcher - bootstrap/generateBootstrapArtifact.ts
 *
 * Generates Component Map Bootstrap Artifacts from Phase 10C suggestions.
 *
 * WHY: Provides a deterministic, auditable way to bootstrap component-map.json.
 * The artifact is a review-first workflow where humans can inspect proposed
 * entries before applying them.
 *
 * ARCHITECTURE:
 * - Reuses Phase 10C suggestion generator (no duplication)
 * - Generates complete before/after diffs for each entry
 * - Identifies fields needing manual fill (node IDs)
 * - Respects explicit-only variant state policy
 */

import type {
  ComponentMapBootstrapArtifact,
  ProposedEntry,
  SkippedEntry,
  BootstrapDiff,
  PartialComponentMap,
  BootstrapPolicy,
  BootstrapComponentEntry,
} from './types.js';
import type { SuggestionResult, ComponentMapSuggestion } from '../adapters/suggestions/componentMapSuggestions.js';
import type { ComponentMap, ComponentEntry } from '../reconcile/componentMap.js';
import { COMPONENT_MAP_VERSION } from '../reconcile/componentMap.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Current artifact schema version */
export const BOOTSTRAP_ARTIFACT_VERSION = 1 as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build variant mappings for a proposed entry.
 * All nodeIds are null since we can't infer them from code.
 */
function buildVariantMappings(
  variantStates: string[]
): Record<string, { nodeId: string | null }> {
  const variants: Record<string, { nodeId: string | null }> = {
    base: { nodeId: null },
  };

  for (const state of variantStates) {
    if (state !== 'base') {
      variants[state] = { nodeId: null };
    }
  }

  return variants;
}

/**
 * Build a bootstrap component entry for the "after" state.
 * All nodeIds are null (manual fill required).
 */
function buildProposedComponentEntry(
  suggestion: ComponentMapSuggestion
): BootstrapComponentEntry {
  return {
    componentKey: suggestion.componentKey,
    figma: {
      name: suggestion.figmaNameSuggestion,
      componentSetNodeId: null,
      variants: buildVariantMappings(suggestion.variantStatesSuggested),
    },
  };
}

/**
 * Identify fields that need manual filling (node IDs).
 */
function identifyManualFields(
  suggestion: ComponentMapSuggestion,
  existingEntry?: ComponentEntry
): string[] {
  const fields: string[] = [];

  // componentSetNodeId always needs manual fill if not present
  if (!existingEntry?.figma?.componentSetNodeId) {
    fields.push('figma.componentSetNodeId');
  }

  // base variant always needs nodeId
  if (!existingEntry?.figma?.variants?.base?.nodeId) {
    fields.push('figma.variants.base.nodeId');
  }

  // Each suggested variant needs nodeId
  for (const state of suggestion.variantStatesSuggested) {
    if (state !== 'base' && !existingEntry?.figma?.variants?.[state]?.nodeId) {
      fields.push(`figma.variants.${state}.nodeId`);
    }
  }

  return fields;
}

/**
 * Build a before/after diff for a proposed entry.
 */
function buildDiff(
  suggestion: ComponentMapSuggestion,
  existingMap: ComponentMap | null
): BootstrapDiff {
  const existingEntry = existingMap?.components[suggestion.componentKey];

  // Build "before" state (null if new)
  let before: PartialComponentMap | null = null;
  if (existingEntry) {
    before = {
      version: existingMap?.version ?? COMPONENT_MAP_VERSION,
      components: {
        [suggestion.componentKey]: existingEntry,
      },
    };
  }

  // Build "after" state with proposed entry
  const proposedEntry = buildProposedComponentEntry(suggestion);

  // If entry exists, merge existing nodeIds into proposed
  if (existingEntry) {
    // Preserve existing componentSetNodeId
    if (existingEntry.figma?.componentSetNodeId) {
      proposedEntry.figma.componentSetNodeId = existingEntry.figma.componentSetNodeId;
    }

    // Preserve existing variant nodeIds
    if (existingEntry.figma?.variants) {
      for (const [state, variant] of Object.entries(existingEntry.figma.variants)) {
        if (variant.nodeId) {
          if (!proposedEntry.figma.variants[state]) {
            proposedEntry.figma.variants[state] = { nodeId: variant.nodeId };
          } else {
            proposedEntry.figma.variants[state].nodeId = variant.nodeId;
          }
        }
      }
    }

    // Preserve legacyKeys if present
    if (existingEntry.legacyKeys) {
      proposedEntry.legacyKeys = existingEntry.legacyKeys;
    }
  }

  const after: PartialComponentMap = {
    version: COMPONENT_MAP_VERSION,
    components: {
      [suggestion.componentKey]: proposedEntry,
    },
  };

  return { before, after };
}

/**
 * Convert a suggestion to a proposed entry.
 */
function suggestionToProposedEntry(
  suggestion: ComponentMapSuggestion,
  existingMap: ComponentMap | null
): ProposedEntry {
  const existingEntry = existingMap?.components[suggestion.componentKey];
  const status = existingEntry ? 'update' : 'new';
  const diff = buildDiff(suggestion, existingMap);
  const manualFields = identifyManualFields(suggestion, existingEntry);

  return {
    componentKey: suggestion.componentKey,
    figmaNameSuggestion: suggestion.figmaNameSuggestion,
    variantStatesSuggested: suggestion.variantStatesSuggested,
    status,
    diff,
    manualFields,
    reason: suggestion.reason,
  };
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Options for generating a bootstrap artifact.
 */
export interface GenerateArtifactOptions {
  /** Source file path */
  filePath: string;
  /** Suggestions from Phase 10C generator */
  suggestions: SuggestionResult;
  /** Existing component map (if present) */
  existingMap: ComponentMap | null;
  /** ISO timestamp (injectable for deterministic tests) */
  timestamp?: string;
  /** Skip entries that already exist in the map */
  skipExisting?: boolean;
}

/**
 * Generate a Component Map Bootstrap Artifact.
 *
 * This is the main entry point for creating bootstrap artifacts.
 * It transforms Phase 10C suggestions into a deterministic,
 * auditable artifact with before/after diffs.
 *
 * @param options - Generation options
 * @returns The generated artifact
 */
export function generateBootstrapArtifact(
  options: GenerateArtifactOptions
): ComponentMapBootstrapArtifact {
  const {
    filePath,
    suggestions,
    existingMap,
    timestamp = new Date().toISOString(),
    skipExisting = false,
  } = options;

  const policy: BootstrapPolicy = {
    variantStates: 'explicit-only',
    writes: 'artifact-only',
  };

  const proposed: ProposedEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const suggestion of suggestions.suggestions) {
    const existsInMap = Boolean(existingMap?.components[suggestion.componentKey]);

    // Skip if already present and skipExisting is true
    if (skipExisting && existsInMap) {
      skipped.push({
        componentKey: suggestion.componentKey,
        reason: 'Already present in component-map.json',
      });
      continue;
    }

    // For existing entries, check if there's anything new to propose
    if (existsInMap) {
      const existingEntry = existingMap!.components[suggestion.componentKey];

      // Check if name differs
      const nameDiffers = existingEntry.figma?.name !== suggestion.figmaNameSuggestion;

      // Check if there are new variant states
      const existingVariants = new Set(Object.keys(existingEntry.figma?.variants ?? {}));
      const newVariants = suggestion.variantStatesSuggested.filter(
        (s) => !existingVariants.has(s)
      );

      // If nothing new, skip
      if (!nameDiffers && newVariants.length === 0) {
        skipped.push({
          componentKey: suggestion.componentKey,
          reason: 'Already present in component-map.json with same configuration',
        });
        continue;
      }
    }

    // Build proposed entry
    const entry = suggestionToProposedEntry(suggestion, existingMap);
    proposed.push(entry);
  }

  return {
    version: BOOTSTRAP_ARTIFACT_VERSION,
    generatedAt: timestamp,
    file: filePath,
    policy,
    proposed,
    skipped,
  };
}

/**
 * Normalize file path to artifact file name.
 * Replaces path separators with double underscores.
 *
 * @example
 * "demo-app/src/App.tsx" → "demo-app__src__App"
 */
export function normalizeArtifactFileName(filePath: string): string {
  return filePath
    .replace(/\//g, '__')
    .replace(/\.tsx?$/, '');
}

/**
 * Get the artifact file path for a source file.
 *
 * @param filePath - Source file path (e.g., "demo-app/src/App.tsx")
 * @param outputDir - Output directory (default: "design-materializations")
 * @returns Full artifact path
 */
export function getArtifactPath(
  filePath: string,
  outputDir: string = 'design-materializations'
): string {
  const normalized = normalizeArtifactFileName(filePath);
  return `${outputDir}/${normalized}.component-map-bootstrap.json`;
}
