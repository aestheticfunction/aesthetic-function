/**
 * @aesthetic-function/watcher - figmaDelta/types.ts
 *
 * Phase 12A: Figma → Code Delta Extraction Types.
 *
 * WHY: Defines types for detecting and reporting explicit changes made
 * in Figma relative to a known baseline. This is read-only analysis only.
 *
 * SCOPE:
 * - Variant-scoped deltas only (never Component Sets)
 * - Canonical + raw values preserved
 * - No writes to TSX, markers, overrides, or component maps
 * - Fully auditable, deterministic output
 */

// =============================================================================
// DELTA PROPERTY TYPES
// =============================================================================

/**
 * Property types that can be detected in Figma deltas.
 *
 * Initial set (matches Phase 11C):
 * - fill: Background/foreground colors
 * - textColor: Text fill color
 * - padding: Auto Layout padding
 * - gap: Auto Layout item spacing
 * - width: Node width
 * - height: Node height
 * - fontSize: Text font size
 * - fontWeight: Text font weight
 */
export type DeltaPropertyType =
  | 'fill'
  | 'textColor'
  | 'padding'
  | 'gap'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'fontWeight';

// =============================================================================
// DELTA CONFIDENCE
// =============================================================================

/**
 * Confidence level for a detected delta.
 *
 * - high: Explicit Figma literal value
 * - medium: Bound/indirect/partially resolved
 * - low: Unknown mapping or unresolved
 */
export type DeltaConfidence = 'high' | 'medium' | 'low';

// =============================================================================
// SINGLE DELTA
// =============================================================================

/**
 * A single property delta detected in Figma.
 *
 * Represents the change from baseline to current Figma state
 * for a specific property on a specific variant.
 */
export interface FigmaDelta {
  /**
   * Property that changed.
   */
  property: DeltaPropertyType;

  /**
   * Previous/baseline raw value.
   * Undefined if property was not in baseline.
   */
  from?: string | number;

  /**
   * Current Figma raw value.
   */
  to: string | number;

  /**
   * Canonical token for baseline value (if resolved).
   * E.g., "color.primary" for "#2563EB"
   */
  canonicalFrom?: string;

  /**
   * Canonical token for current value (if resolved).
   * E.g., "color.success" for "#10B981"
   */
  canonicalTo?: string;

  /**
   * Confidence level for this delta.
   */
  confidence: DeltaConfidence;

  /**
   * Human-readable reason for the delta.
   */
  reason: string;

  /**
   * Note if canonical resolution had issues.
   * Non-fatal - raw values are always preserved.
   */
  normalizationNote?: string;
}

// =============================================================================
// DELTA ARTIFACT
// =============================================================================

/**
 * Artifact containing all deltas for a component/state.
 *
 * Written to design-materializations/<file>.figma-delta.json
 */
export interface FigmaDeltaArtifact {
  /**
   * Schema version.
   */
  version: '1.0';

  /**
   * Source of the delta (always "figma" for this module).
   */
  source: 'figma';

  /**
   * ISO timestamp when deltas were detected.
   */
  timestamp: string;

  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Variant state (e.g., "hover", "base").
   */
  state: string;

  /**
   * Figma node ID for the variant.
   * Never a Component Set ID.
   */
  nodeId: string;

  /**
   * List of detected deltas.
   */
  deltas: FigmaDelta[];

  /**
   * Summary metadata.
   */
  meta: DeltaArtifactMeta;
}

/**
 * Metadata about the delta detection process.
 */
export interface DeltaArtifactMeta {
  /**
   * Number of properties checked.
   */
  propertiesChecked: number;

  /**
   * Number of deltas detected.
   */
  deltasDetected: number;

  /**
   * Number of successful canonical resolutions.
   */
  canonicalResolved: number;

  /**
   * Number of normalization notes (warnings).
   */
  normalizationNotes: number;
}

// =============================================================================
// DELTA INPUT
// =============================================================================

/**
 * Baseline value for a property.
 *
 * Can come from:
 * - Canonical resolution output
 * - Last known explicit value
 * - design-overrides.json
 */
export interface BaselineValue {
  /**
   * Raw value (hex, px number, etc.).
   */
  raw: string | number;

  /**
   * Canonical token (if known).
   */
  canonical?: string;

  /**
   * Source of the baseline value.
   */
  source: 'canonical-resolution' | 'explicit' | 'overrides' | 'markers';
}

/**
 * Current Figma state for a property.
 *
 * Represents what's currently in Figma for a specific variant.
 */
export interface FigmaPropertyState {
  /**
   * Raw value from Figma.
   */
  raw: string | number;

  /**
   * Whether this is an explicit literal value (high confidence).
   */
  isExplicit: boolean;
}

/**
 * Input for delta detection on a single component variant.
 */
export interface DeltaInput {
  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Variant state (e.g., "hover", "base").
   */
  state: string;

  /**
   * Figma node ID for the variant.
   * Must be a variant nodeId, never Component Set.
   */
  nodeId: string;

  /**
   * Baseline values for properties (from code/canonical resolution).
   */
  baseline: Partial<Record<DeltaPropertyType, BaselineValue>>;

  /**
   * Current Figma state for properties.
   */
  figmaState: Partial<Record<DeltaPropertyType, FigmaPropertyState>>;
}

/**
 * Input for batch delta detection across multiple components/states.
 */
export interface BatchDeltaInput {
  /**
   * Source file for artifact naming.
   */
  sourceFile: string;

  /**
   * List of delta inputs for individual variants.
   */
  inputs: DeltaInput[];
}

// =============================================================================
// DELTA OUTPUT
// =============================================================================

/**
 * Result of delta detection for a single variant.
 */
export interface DeltaOutput {
  /**
   * Component key.
   */
  componentKey: string;

  /**
   * Variant state.
   */
  state: string;

  /**
   * Figma node ID.
   */
  nodeId: string;

  /**
   * Detected deltas (may be empty if no changes).
   */
  deltas: FigmaDelta[];

  /**
   * Properties that were checked but unchanged.
   */
  unchangedProperties: DeltaPropertyType[];

  /**
   * Metadata about the detection.
   */
  meta: DeltaArtifactMeta;
}

/**
 * Result of batch delta detection.
 */
export interface BatchDeltaOutput {
  /**
   * Source file.
   */
  sourceFile: string;

  /**
   * Results for each variant.
   */
  results: DeltaOutput[];

  /**
   * Aggregate summary.
   */
  summary: BatchDeltaSummary;
}

/**
 * Summary across all variants.
 */
export interface BatchDeltaSummary {
  /**
   * Total variants checked.
   */
  totalVariants: number;

  /**
   * Variants with at least one delta.
   */
  variantsWithDeltas: number;

  /**
   * Total deltas detected.
   */
  totalDeltas: number;

  /**
   * Deltas by property type.
   */
  deltasByProperty: Record<DeltaPropertyType, number>;

  /**
   * Deltas by confidence level.
   */
  deltasByConfidence: Record<DeltaConfidence, number>;
}
