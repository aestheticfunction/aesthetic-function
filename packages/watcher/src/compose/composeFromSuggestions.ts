/**
 * @aesthetic-function/watcher - compose/composeFromSuggestions.ts
 *
 * Phase 11B: Transform Figma Suggestions into Compose Operations.
 *
 * WHY: Converts read-only Phase 11A suggestions into typed, auditable
 * compose operations that can be optionally applied to Figma.
 *
 * SCOPE:
 * - Map SuggestionType to ComposeOpType
 * - Generate deterministic opIds
 * - Filter by allow list
 * - Does NOT apply operations (that's the server/plugin's job)
 */

import type { FigmaSuggestion, SuggestionType } from '../figmaSuggestions/types.js';
import type {
  ComposeInput,
  ComposeResult,
  ComposeAllowType,
} from './types.js';
import {
  createComposeOperation,
  type ComposeOperation,
  type ComposeOpType,
  type EnsureComponentSetPayload,
  type EnsureVariantPayload,
  type EnsurePropertyDefPayload,
} from '@aesthetic-function/shared';

// =============================================================================
// TYPE MAPPING
// =============================================================================

/**
 * Map SuggestionType to ComposeOpType.
 * Only actionable suggestion types map to compose operations.
 */
function mapSuggestionTypeToComposeOpType(
  suggestionType: SuggestionType
): ComposeOpType | null {
  switch (suggestionType) {
    case 'component-set':
      return 'ENSURE_COMPONENT_SET';
    case 'variant':
      return 'ENSURE_VARIANT';
    case 'property':
      return 'ENSURE_PROPERTY_DEF';
    case 'token-usage':
    case 'coverage-gap':
      // These are informational, not actionable
      return null;
    default:
      return null;
  }
}

/**
 * Map ComposeOpType to ComposeAllowType for filtering.
 */
function mapComposeOpTypeToAllowType(opType: ComposeOpType): ComposeAllowType {
  switch (opType) {
    case 'ENSURE_COMPONENT_SET':
      return 'component-set';
    case 'ENSURE_VARIANT':
      return 'variant';
    case 'ENSURE_PROPERTY_DEF':
      return 'property';
  }
}

// =============================================================================
// OPERATION BUILDERS
// =============================================================================

/**
 * Build payload for ENSURE_COMPONENT_SET.
 */
function buildEnsureComponentSetPayload(
  suggestion: FigmaSuggestion
): EnsureComponentSetPayload {
  return {
    componentKey: suggestion.componentKey,
    figmaName: suggestion.figmaNameSuggestion,
  };
}

/**
 * Build payload for ENSURE_VARIANT.
 */
function buildEnsureVariantPayload(
  suggestion: FigmaSuggestion
): EnsureVariantPayload {
  // Extract variant props from suggestion details
  const variantProps: Record<string, string> = {};

  if (suggestion.details) {
    const details = suggestion.details;
    if (details['variantState'] && typeof details['variantState'] === 'string') {
      // Parse state=value format
      const state = details['variantState'] as string;
      variantProps['state'] = state;
    }
    if (details['variantProps'] && typeof details['variantProps'] === 'object') {
      Object.assign(variantProps, details['variantProps']);
    }
  }

  return {
    componentKey: suggestion.componentKey,
    componentSetName: suggestion.figmaNameSuggestion,
    variantProps,
  };
}

/**
 * Build payload for ENSURE_PROPERTY_DEF.
 */
function buildEnsurePropertyDefPayload(
  suggestion: FigmaSuggestion
): EnsurePropertyDefPayload {
  // Extract property info from suggestion details
  const propertyName = suggestion.details?.['propertyName'] as string || 'state';
  const allowedValues = suggestion.details?.['allowedValues'] as string[] || [];

  return {
    componentKey: suggestion.componentKey,
    propertyName,
    allowedValues,
  };
}

// =============================================================================
// COMPOSE TRANSFORMATION
// =============================================================================

/**
 * Transform a single suggestion into a compose operation.
 * Returns null if suggestion type is not actionable.
 */
function suggestionToOperation(suggestion: FigmaSuggestion): ComposeOperation | null {
  const opType = mapSuggestionTypeToComposeOpType(suggestion.type);
  if (!opType) {
    return null;
  }

  let payload: EnsureComponentSetPayload | EnsureVariantPayload | EnsurePropertyDefPayload;

  switch (opType) {
    case 'ENSURE_COMPONENT_SET':
      payload = buildEnsureComponentSetPayload(suggestion);
      break;
    case 'ENSURE_VARIANT':
      payload = buildEnsureVariantPayload(suggestion);
      break;
    case 'ENSURE_PROPERTY_DEF':
      payload = buildEnsurePropertyDefPayload(suggestion);
      break;
  }

  return createComposeOperation(
    opType,
    suggestion.componentKey,
    suggestion.figmaNameSuggestion,
    payload,
    suggestion.message,
    'figma-suggestions'
  );
}

/**
 * Filter operations by allow list.
 */
export function filterComposeOpsByAllowList(
  operations: ComposeOperation[],
  allow: ComposeAllowType[]
): { allowed: ComposeOperation[]; filtered: ComposeOperation[] } {
  if (allow.length === 0) {
    // No allow list = everything is filtered
    return { allowed: [], filtered: operations };
  }

  const allowed: ComposeOperation[] = [];
  const filtered: ComposeOperation[] = [];

  for (const op of operations) {
    const allowType = mapComposeOpTypeToAllowType(op.type);
    if (allow.includes(allowType)) {
      allowed.push(op);
    } else {
      filtered.push(op);
    }
  }

  return { allowed, filtered };
}

/**
 * Transform Phase 11A suggestions into Phase 11B compose operations.
 *
 * This function:
 * 1. Maps actionable suggestions to typed operations
 * 2. Generates deterministic opIds
 * 3. Filters by allow list
 * 4. Returns structured result for CLI/artifact generation
 */
export function composeFromSuggestions(input: ComposeInput): ComposeResult {
  const { suggestions, config } = input;

  // Check if compose is enabled
  if (!config.enabled || config.mode === 'off') {
    return {
      operations: [],
      filtered: [],
      countByType: {},
      totalGenerated: 0,
      totalAllowed: 0,
      mode: config.mode,
    };
  }

  // Transform actionable suggestions to operations
  const allOperations: ComposeOperation[] = [];
  for (const suggestion of suggestions) {
    const op = suggestionToOperation(suggestion);
    if (op) {
      allOperations.push(op);
    }
  }

  // Deduplicate by opId (deterministic, so same inputs = same opId)
  const seenOpIds = new Set<string>();
  const uniqueOperations: ComposeOperation[] = [];
  for (const op of allOperations) {
    if (!seenOpIds.has(op.opId)) {
      seenOpIds.add(op.opId);
      uniqueOperations.push(op);
    }
  }

  // Filter by allow list
  const { allowed, filtered } = filterComposeOpsByAllowList(
    uniqueOperations,
    config.allow
  );

  // Count by type
  const countByType: Record<string, number> = {};
  for (const op of allowed) {
    countByType[op.type] = (countByType[op.type] || 0) + 1;
  }

  return {
    operations: allowed,
    filtered,
    countByType,
    totalGenerated: uniqueOperations.length,
    totalAllowed: allowed.length,
    mode: config.mode,
  };
}
