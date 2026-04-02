/**
 * @aesthetic-function/watcher - designAdapter/types.ts
 *
 * Phase 16A: Types for design adapter normalization and tracing.
 *
 * These types represent the output of normalizing raw adapter data
 * into AF-compatible structures (canonical tokens, component-map naming).
 */

import type {
  CanonicalColorToken,
  CanonicalSpacingToken,
  CanonicalRadiusToken,
  CanonicalTypographyToken,
} from '../tokens/canonical/types.js';

// =============================================================================
// NORMALIZED TOKEN OUTPUT
// =============================================================================

/**
 * A design token normalized to canonical vocabulary.
 */
export interface NormalizedToken {
  /** Original token name from the design system */
  originalName: string;

  /** Original raw value */
  originalValue: string;

  /** Canonical token if mapped, null if unmapped */
  canonical: CanonicalColorToken | CanonicalSpacingToken | CanonicalRadiusToken | CanonicalTypographyToken | null;

  /** Resolved value (hex, px, etc.) */
  resolvedValue: string;

  /** Token type */
  type: 'color' | 'spacing' | 'radius' | 'typography' | 'opacity' | 'other';

  /** Whether this was successfully mapped to a canonical token */
  mapped: boolean;
}

/**
 * Result of normalizing design tokens from an adapter.
 */
export interface NormalizedDesignTokens {
  /** All normalized tokens */
  tokens: NormalizedToken[];

  /** Summary counts */
  summary: {
    total: number;
    mapped: number;
    unmapped: number;
    byType: Record<string, number>;
  };

  /** Adapter source info */
  source: {
    adapterId: string;
    adapterName: string;
    extractedAt: string;
  };
}

// =============================================================================
// NORMALIZED COMPONENT OUTPUT
// =============================================================================

/**
 * A design component normalized for component-map compatibility.
 */
export interface NormalizedDesignComponent {
  /** Component name (component-map compatible) */
  name: string;

  /** Design tool node ID */
  nodeId: string;

  /** Component type */
  type: 'component' | 'component-set' | 'instance' | 'frame';

  /** Extracted properties normalized to known keys */
  properties: {
    fills?: string[];
    textContent?: string;
    fontSize?: number;
    fontWeight?: number;
    cornerRadius?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
    width?: number;
    height?: number;
  };

  /** Variant states if this is a component set */
  variants?: Array<{
    name: string;
    nodeId: string;
    state: string;
  }>;

  /** Unmapped properties that didn't fit known keys */
  unmappedProperties: string[];
}

// =============================================================================
// TRACE TYPES
// =============================================================================

/**
 * Trace output for adapter operations.
 * Integrates with the existing TRACE system (Phase 9C).
 */
export interface DesignAdapterTrace {
  /** Which adapter was used */
  adapterId: string;

  /** Operation performed */
  operation: string;

  /** Time taken in milliseconds */
  durationMs: number;

  /** Number of items returned */
  itemCount: number;

  /** Normalization summary */
  normalization: {
    /** Items successfully mapped to canonical tokens */
    mapped: number;
    /** Items that could not be mapped */
    unmapped: number;
    /** Specific gaps found */
    gaps: string[];
  };

  /** Any errors encountered */
  errors: string[];

  /** Timestamp */
  timestamp: string;
}
