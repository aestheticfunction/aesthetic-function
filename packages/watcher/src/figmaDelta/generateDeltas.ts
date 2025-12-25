/**
 * @aesthetic-function/watcher - figmaDelta/generateDeltas.ts
 *
 * Phase 12A: Generate Figma → Code Deltas.
 *
 * WHY: Detects explicit changes made in Figma relative to a known baseline.
 * This is read-only analysis only - no writes to code, markers, or overrides.
 *
 * CONSTRAINTS:
 * - Variant-scoped deltas only (never Component Sets)
 * - Canonical + raw values preserved
 * - No heuristics or guessing
 * - Deterministic output
 *
 * DELTA DETECTION RULES:
 * - Delta produced only if property exists in Figma AND differs from baseline
 * - Confidence: explicit literal → high, bound/indirect → medium, unknown → low
 * - No deltas dropped due to confidence (all are preserved)
 */

import type {
  DeltaInput,
  DeltaOutput,
  BatchDeltaInput,
  BatchDeltaOutput,
  FigmaDelta,
  DeltaPropertyType,
  DeltaConfidence,
  DeltaArtifactMeta,
  BatchDeltaSummary,
  BaselineValue,
  FigmaPropertyState,
} from './types.js';

// =============================================================================
// CANONICAL REVERSE LOOKUP
// =============================================================================

/**
 * Map hex values to canonical tokens.
 * Reverse of CANONICAL_TO_TOKEN_NAME in canonicalResolver.
 *
 * WHY: Need to resolve Figma values back to canonical tokens for reporting.
 */
const HEX_TO_CANONICAL: Record<string, string> = {
  // Primary palette
  '#3B82F6': 'color.primary',
  '#2563EB': 'color.secondary',
  '#1D4ED8': 'color.accent',
  // Semantic colors
  '#10B981': 'color.success',
  '#F59E0B': 'color.warning',
  '#EF4444': 'color.danger',
  '#DC2626': 'color.error',
  // Neutral colors
  '#F9FAFB': 'color.neutral.50',
  '#F3F4F6': 'color.neutral.100',
  '#6B7280': 'color.neutral.500',
  '#111827': 'color.neutral.900',
  // Pure colors
  '#FF0000': 'color.red',
  '#00FF00': 'color.green',
  '#0000FF': 'color.blue',
};

/**
 * Map spacing values (px) to canonical tokens.
 */
const PX_TO_SPACING: Record<number, string> = {
  0: 'space.none',
  4: 'space.xs',
  8: 'space.sm',
  16: 'space.md',
  24: 'space.lg',
  32: 'space.xl',
  48: 'space.2xl',
  64: 'space.3xl',
};

/**
 * Map font sizes to canonical tokens.
 */
const FONTSIZE_TO_CANONICAL: Record<number, string> = {
  12: 'text.size.xs',
  14: 'text.size.sm',
  16: 'text.size.md',
  18: 'text.size.lg',
  20: 'text.size.xl',
  24: 'text.size.2xl',
};

/**
 * Map font weights to canonical tokens.
 */
const FONTWEIGHT_TO_CANONICAL: Record<number, string> = {
  300: 'text.weight.light',
  400: 'text.weight.normal',
  500: 'text.weight.medium',
  600: 'text.weight.semibold',
  700: 'text.weight.bold',
};

// =============================================================================
// CANONICAL RESOLUTION HELPERS
// =============================================================================

/**
 * Attempt to resolve a raw value to a canonical token.
 *
 * @param property - Property type (determines lookup table)
 * @param raw - Raw value from Figma or baseline
 * @returns Canonical token or undefined if not found
 */
export function resolveToCanonical(
  property: DeltaPropertyType,
  raw: string | number
): string | undefined {
  switch (property) {
    case 'fill':
    case 'textColor': {
      // Normalize hex to uppercase for lookup
      const hex = typeof raw === 'string' ? raw.toUpperCase() : undefined;
      return hex ? HEX_TO_CANONICAL[hex] : undefined;
    }
    case 'padding':
    case 'gap':
    case 'width':
    case 'height': {
      const px = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      return Number.isNaN(px) ? undefined : PX_TO_SPACING[px];
    }
    case 'fontSize': {
      const size = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      return Number.isNaN(size) ? undefined : FONTSIZE_TO_CANONICAL[size];
    }
    case 'fontWeight': {
      const weight = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      return Number.isNaN(weight) ? undefined : FONTWEIGHT_TO_CANONICAL[weight];
    }
    default:
      return undefined;
  }
}

// =============================================================================
// VALUE COMPARISON
// =============================================================================

/**
 * Normalize a value for comparison.
 *
 * Handles:
 * - Case-insensitive hex colors
 * - String/number coercion for spacing
 */
function normalizeForComparison(value: string | number): string {
  if (typeof value === 'string') {
    // Normalize hex colors to uppercase
    if (value.startsWith('#')) {
      return value.toUpperCase();
    }
    return value;
  }
  return String(value);
}

/**
 * Check if two values are equal after normalization.
 */
function valuesEqual(
  a: string | number | undefined,
  b: string | number | undefined
): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return normalizeForComparison(a) === normalizeForComparison(b);
}

// =============================================================================
// DELTA DETECTION
// =============================================================================

/**
 * Detect a delta for a single property.
 *
 * @param property - Property type
 * @param baseline - Baseline value (from code/canonical resolution)
 * @param figmaState - Current Figma state
 * @returns FigmaDelta if changed, undefined if unchanged
 */
export function detectDeltaForProperty(
  property: DeltaPropertyType,
  baseline: BaselineValue | undefined,
  figmaState: FigmaPropertyState | undefined
): FigmaDelta | undefined {
  // No Figma state means we can't detect a delta
  if (!figmaState) {
    return undefined;
  }

  // Compare values
  const baselineRaw = baseline?.raw;
  const figmaRaw = figmaState.raw;

  // If values are equal, no delta
  if (valuesEqual(baselineRaw, figmaRaw)) {
    return undefined;
  }

  // Determine confidence
  let confidence: DeltaConfidence;
  if (figmaState.isExplicit) {
    confidence = 'high';
  } else if (baseline !== undefined) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Resolve canonical tokens
  const canonicalFrom = baseline?.canonical ?? resolveToCanonical(property, baselineRaw ?? '');
  const canonicalTo = resolveToCanonical(property, figmaRaw);

  // Build normalization note if needed
  let normalizationNote: string | undefined;
  if (canonicalTo === undefined && figmaState.isExplicit) {
    normalizationNote = `Could not map Figma value "${figmaRaw}" to canonical token`;
  }

  // Build reason
  let reason: string;
  if (baseline === undefined) {
    reason = `New ${property} value set in Figma`;
  } else if (canonicalFrom && canonicalTo) {
    reason = `Explicit change in Figma: ${canonicalFrom} → ${canonicalTo}`;
  } else {
    reason = `Explicit change in Figma variant`;
  }

  return {
    property,
    from: baselineRaw,
    to: figmaRaw,
    canonicalFrom,
    canonicalTo,
    confidence,
    reason,
    normalizationNote,
  };
}

/**
 * Generate deltas for a single component variant.
 *
 * @param input - Delta input with baseline and Figma state
 * @returns Delta output with detected changes
 */
export function generateDeltasForVariant(input: DeltaInput): DeltaOutput {
  const deltas: FigmaDelta[] = [];
  const unchangedProperties: DeltaPropertyType[] = [];

  // All property types to check
  const propertyTypes: DeltaPropertyType[] = [
    'fill',
    'textColor',
    'padding',
    'gap',
    'width',
    'height',
    'fontSize',
    'fontWeight',
  ];

  let propertiesChecked = 0;
  let canonicalResolved = 0;
  let normalizationNotes = 0;

  for (const property of propertyTypes) {
    const baseline = input.baseline[property];
    const figmaState = input.figmaState[property];

    // Skip if no Figma state for this property
    if (!figmaState) {
      continue;
    }

    propertiesChecked++;

    const delta = detectDeltaForProperty(property, baseline, figmaState);

    if (delta) {
      deltas.push(delta);
      if (delta.canonicalTo) {
        canonicalResolved++;
      }
      if (delta.normalizationNote) {
        normalizationNotes++;
      }
    } else {
      unchangedProperties.push(property);
    }
  }

  const meta: DeltaArtifactMeta = {
    propertiesChecked,
    deltasDetected: deltas.length,
    canonicalResolved,
    normalizationNotes,
  };

  return {
    componentKey: input.componentKey,
    state: input.state,
    nodeId: input.nodeId,
    deltas,
    unchangedProperties,
    meta,
  };
}

/**
 * Generate deltas for multiple component variants.
 *
 * @param input - Batch input with multiple variant inputs
 * @returns Batch output with all results and summary
 */
export function generateDeltas(input: BatchDeltaInput): BatchDeltaOutput {
  const results: DeltaOutput[] = [];

  for (const variantInput of input.inputs) {
    const output = generateDeltasForVariant(variantInput);
    results.push(output);
  }

  // Build summary
  const summary = buildBatchSummary(results);

  return {
    sourceFile: input.sourceFile,
    results,
    summary,
  };
}

// =============================================================================
// SUMMARY HELPERS
// =============================================================================

/**
 * Build aggregate summary from delta outputs.
 */
function buildBatchSummary(results: DeltaOutput[]): BatchDeltaSummary {
  const deltasByProperty: Record<DeltaPropertyType, number> = {
    fill: 0,
    textColor: 0,
    padding: 0,
    gap: 0,
    width: 0,
    height: 0,
    fontSize: 0,
    fontWeight: 0,
  };

  const deltasByConfidence: Record<DeltaConfidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalDeltas = 0;
  let variantsWithDeltas = 0;

  for (const result of results) {
    if (result.deltas.length > 0) {
      variantsWithDeltas++;
    }

    for (const delta of result.deltas) {
      totalDeltas++;
      deltasByProperty[delta.property]++;
      deltasByConfidence[delta.confidence]++;
    }
  }

  return {
    totalVariants: results.length,
    variantsWithDeltas,
    totalDeltas,
    deltasByProperty,
    deltasByConfidence,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that a delta input targets a variant, not a Component Set.
 *
 * WHY: Component Sets are never treated as editable sources.
 * Deltas must be variant-scoped only.
 *
 * @param input - Delta input to validate
 * @param componentSetNodeId - Component Set node ID to check against
 * @returns true if valid (targets variant), false if invalid (targets Component Set)
 */
export function isVariantTarget(
  input: DeltaInput,
  componentSetNodeId?: string
): boolean {
  if (!componentSetNodeId) {
    return true; // No Component Set to check against
  }
  return input.nodeId !== componentSetNodeId;
}

/**
 * Filter inputs to only include valid variant targets.
 *
 * @param inputs - Delta inputs to filter
 * @param componentSetNodeIds - Map of componentKey → componentSetNodeId
 * @returns Filtered inputs (variant targets only)
 */
export function filterVariantTargets(
  inputs: DeltaInput[],
  componentSetNodeIds: Map<string, string>
): DeltaInput[] {
  return inputs.filter((input) => {
    const componentSetNodeId = componentSetNodeIds.get(input.componentKey);
    return isVariantTarget(input, componentSetNodeId);
  });
}
