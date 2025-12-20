/**
 * @aesthetic-function/watcher - tokens/canonical/types.ts
 *
 * Canonical Token Layer (Phase 10E).
 *
 * WHY: Different UI libraries (Vuetify, Ant Design, MUI, Chakra) use
 * library-specific semantic conventions. This canonical layer provides
 * a design-system-agnostic vocabulary that all adapters map into.
 *
 * DESIGN:
 * - Canonical values are TOKENS, not raw hex values
 * - Tokens follow a hierarchical naming convention (e.g., "color.primary")
 * - Each canonical field preserves confidence and source provenance
 * - Unmapped values are recorded as notes, not errors
 *
 * SCOPE: Read-only analysis. No writes, no mutations.
 */

import type { SourceLocation, ConfidenceLevel } from '../../ast/types.js';

// =============================================================================
// CANONICAL TOKEN VOCABULARY
// =============================================================================

/**
 * Canonical color tokens.
 *
 * These represent design-system-agnostic color intents.
 * Adapters map library-specific values (e.g., "antd:primary", Vuetify "primary")
 * to these canonical tokens.
 */
export type CanonicalColorToken =
  // Primary palette
  | 'color.primary'
  | 'color.secondary'
  | 'color.accent'
  // Semantic colors
  | 'color.success'
  | 'color.warning'
  | 'color.danger'
  | 'color.error'
  | 'color.info'
  // Neutral colors
  | 'color.neutral.50'
  | 'color.neutral.100'
  | 'color.neutral.500'
  | 'color.neutral.900'
  // Material colors (subset)
  | 'color.red'
  | 'color.pink'
  | 'color.purple'
  | 'color.indigo'
  | 'color.blue'
  | 'color.cyan'
  | 'color.teal'
  | 'color.green'
  | 'color.yellow'
  | 'color.amber'
  | 'color.orange'
  | 'color.brown'
  | 'color.grey';

/**
 * Canonical spacing tokens.
 *
 * T-shirt sizing for consistent spacing vocabulary.
 */
export type CanonicalSpacingToken =
  | 'space.none'
  | 'space.xs'
  | 'space.sm'
  | 'space.md'
  | 'space.lg'
  | 'space.xl'
  | 'space.2xl'
  | 'space.3xl';

/**
 * Canonical border radius tokens.
 */
export type CanonicalRadiusToken =
  | 'radius.none'
  | 'radius.sm'
  | 'radius.md'
  | 'radius.lg'
  | 'radius.full';

/**
 * Canonical typography tokens.
 *
 * Covers font size and weight as separate token paths.
 */
export type CanonicalTypographyToken =
  // Font sizes
  | 'text.size.xs'
  | 'text.size.sm'
  | 'text.size.md'
  | 'text.size.lg'
  | 'text.size.xl'
  | 'text.size.2xl'
  // Font weights
  | 'text.weight.light'
  | 'text.weight.normal'
  | 'text.weight.medium'
  | 'text.weight.semibold'
  | 'text.weight.bold';

/**
 * All canonical token types.
 */
export type CanonicalToken =
  | CanonicalColorToken
  | CanonicalSpacingToken
  | CanonicalRadiusToken
  | CanonicalTypographyToken;

// =============================================================================
// SEMANTIC VALUE WITH PROVENANCE
// =============================================================================

/**
 * A canonical semantic value with full provenance tracking.
 *
 * WHY: When values are normalized from different sources (adapters, generic JSX),
 * we need to track where each value came from and how confident we are.
 */
export interface CanonicalSemanticValue<T> {
  /** The canonical token or raw value */
  value: T;

  /** The original raw value before normalization (e.g., hex color, adapter hint) */
  rawValue?: string;

  /** Source location in the code */
  loc: SourceLocation;

  /** Confidence level (preserved from adapter/generic extraction) */
  confidence: ConfidenceLevel;

  /**
   * Which adapter or source produced this value.
   * Examples: "vuetify", "antd", "generic-jsx"
   */
  source: string;
}

// =============================================================================
// CANONICAL SEMANTICS ENVELOPE
// =============================================================================

/**
 * Canonical color semantics.
 */
export interface CanonicalColorSemantics {
  /** Primary fill color (background, chip color, button color) */
  fill?: CanonicalSemanticValue<string>;
}

/**
 * Canonical spacing semantics.
 */
export interface CanonicalSpacingSemantics {
  /** Gap between flex/grid items */
  gap?: CanonicalSemanticValue<string>;
  /** Padding inside the element */
  padding?: CanonicalSemanticValue<string>;
  /** Margin around the element */
  margin?: CanonicalSemanticValue<string>;
}

/**
 * Canonical radius semantics.
 */
export interface CanonicalRadiusSemantics {
  /** Border radius */
  borderRadius?: CanonicalSemanticValue<string>;
}

/**
 * Canonical typography semantics.
 */
export interface CanonicalTypographySemantics {
  /** Font size token */
  fontSize?: CanonicalSemanticValue<string>;
  /** Font weight token */
  fontWeight?: CanonicalSemanticValue<string>;
}

/**
 * Metadata about the canonical normalization.
 */
export interface CanonicalMeta {
  /**
   * List of sources that contributed to this canonical semantics.
   * Example: ["vuetify", "generic-jsx"]
   */
  sources: string[];

  /**
   * Number of fields successfully normalized to canonical tokens.
   */
  canonicalFieldCount: number;

  /**
   * Number of fields that remained as raw values (unmapped).
   */
  rawFieldCount: number;
}

/**
 * Main canonical semantics envelope.
 *
 * This is the design-system-agnostic representation of a component's
 * visual semantics. All adapter-specific and generic JSX values are
 * normalized into this structure.
 */
export interface CanonicalSemantics {
  /** Color semantics (fill, background) */
  colors?: CanonicalColorSemantics;

  /** Spacing semantics (gap, padding, margin) */
  spacing?: CanonicalSpacingSemantics;

  /** Border radius semantics */
  radius?: CanonicalRadiusSemantics;

  /** Typography semantics (fontSize, fontWeight) */
  typography?: CanonicalTypographySemantics;

  /** Metadata about normalization */
  meta?: CanonicalMeta;
}

// =============================================================================
// NORMALIZATION NOTES
// =============================================================================

/**
 * Types of normalization notes (for observability).
 */
export type NormalizationNoteType =
  | 'unmapped_color_hex'     // Hex color not found in design tokens
  | 'unmapped_adapter_hint'  // Adapter hint not in canonical mapping
  | 'ambiguous_mapping'      // Multiple possible canonical tokens
  | 'confidence_reduced'     // Confidence was lowered during normalization
  | 'raw_value_preserved';   // Value kept as raw (no canonical mapping)

/**
 * A note about something that happened during normalization.
 *
 * These are informational, not errors. They help developers understand
 * why certain values weren't mapped to canonical tokens.
 */
export interface NormalizationNote {
  /** Type of note for categorization */
  type: NormalizationNoteType;

  /** Human-readable explanation */
  detail: string;

  /** The field that triggered this note */
  field?: string;

  /** The raw value that couldn't be mapped */
  rawValue?: string;

  /** Source that produced the value */
  source?: string;
}

// =============================================================================
// NORMALIZATION RESULT
// =============================================================================

/**
 * Result of normalizing semantic intent to canonical tokens.
 */
export interface NormalizationResult {
  /** The normalized canonical semantics */
  canonical: CanonicalSemantics;

  /** Notes about the normalization process */
  notes: NormalizationNote[];
}

// =============================================================================
// HINT MAPPER TYPES (Extensibility Hook)
// =============================================================================

/**
 * Function type for mapping adapter hints to canonical tokens.
 *
 * WHY: Different adapters produce different hint formats (e.g., "antd:primary",
 * Vuetify hex values). This allows adapters to register custom mappings.
 *
 * @param hint - The adapter-produced hint (e.g., "antd:primary")
 * @returns Canonical token if mapped, null if not recognized
 */
export type CanonicalHintMapper = (hint: string) => CanonicalColorToken | null;

/**
 * Registry entry for a canonical hint mapper.
 */
export interface HintMapperEntry {
  /** Adapter ID this mapper is for */
  adapterId: string;

  /** The mapper function */
  mapper: CanonicalHintMapper;
}
