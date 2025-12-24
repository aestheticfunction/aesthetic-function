/**
 * @aesthetic-function/watcher - figmaApply/types.ts
 *
 * Phase 11C: Figma Property Application Types.
 *
 * WHY: Defines types for applying resolved canonical semantics to existing
 * Figma structures. This is property-level application, NOT structural.
 *
 * SCOPE:
 * - Apply properties to components with stable nodeIds
 * - Does NOT create new nodes or component sets
 * - Does NOT infer variants or states
 * - Fully auditable, deterministic, idempotent
 */

import type { ConfidenceLevel } from '../ast/types.js';

// =============================================================================
// APPLY PROPERTY TYPES
// =============================================================================

/**
 * Property types that can be applied to Figma nodes.
 *
 * Initial set:
 * - fill: Background/foreground colors
 * - textColor: Text fill color
 * - padding: Auto Layout padding
 * - gap: Auto Layout item spacing
 * - width: Node width (only if already defined)
 * - height: Node height (only if already defined)
 * - fontSize: Text font size
 * - fontWeight: Text font weight
 */
export type ApplyPropertyType =
  | 'fill'
  | 'textColor'
  | 'padding'
  | 'gap'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'fontWeight';

/**
 * Property category for allow-list filtering.
 * Maps to FIGMA_APPLY_ALLOW values.
 */
export type ApplyAllowCategory = 'fill' | 'spacing' | 'typography';

/**
 * Map property types to their allow categories.
 */
export const PROPERTY_TO_CATEGORY: Record<ApplyPropertyType, ApplyAllowCategory> = {
  fill: 'fill',
  textColor: 'fill',
  padding: 'spacing',
  gap: 'spacing',
  width: 'spacing',
  height: 'spacing',
  fontSize: 'typography',
  fontWeight: 'typography',
};

// =============================================================================
// APPLY OPERATION
// =============================================================================

/**
 * A single property application operation.
 *
 * Represents applying a resolved canonical value to a specific
 * Figma node property.
 */
export interface FigmaApplyOp {
  /**
   * Deterministic operation ID.
   * Hash of nodeId + property + from + to.
   */
  opId: string;

  /**
   * Target Figma node ID.
   * Must be a stable ID from component-map.json or Phase 11B compose.
   */
  nodeId: string;

  /**
   * Component key from component-map.json.
   */
  componentKey: string;

  /**
   * Property being applied.
   */
  property: ApplyPropertyType;

  /**
   * Previous value (for audit/rollback).
   * Undefined if property not previously set.
   */
  from?: string | number;

  /**
   * New value to apply.
   */
  to: string | number;

  /**
   * Canonical source token (e.g., "color.primary", "space.md").
   */
  canonicalSource: string;

  /**
   * Confidence level from canonical resolution.
   */
  confidence: ConfidenceLevel;

  /**
   * Source adapter or resolution pathway.
   */
  source: string;

  /**
   * Human-readable reason for this operation.
   */
  reason: string;

  /**
   * Resolution policy notes (if any).
   */
  policyNote?: string;

  /**
   * Target state/variant (e.g., 'base', 'hover', 'disabled').
   * Undefined means base/default state.
   */
  targetState?: string;

  /**
   * Whether the nodeId came from a variant (true) or Component Set (false).
   * Used for auditability.
   */
  fromVariant?: boolean;
}

// =============================================================================
// APPLY RESULT
// =============================================================================

/**
 * Result of executing a single apply operation.
 */
export interface ApplyResult {
  /** Operation ID */
  opId: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Target node ID */
  nodeId: string;
  /** Property that was applied */
  property: ApplyPropertyType;
  /** Error message if failed */
  error?: string;
  /** Whether the value was already set (no change needed) */
  unchanged?: boolean;
}

// =============================================================================
// POLICY VIOLATION
// =============================================================================

/**
 * A policy violation detected during apply operation generation.
 *
 * Violations are informational and prevent operations from being generated.
 */
export interface ApplyPolicyViolation {
  /**
   * Type of violation.
   */
  type:
    | 'missing-node-id'           // Node not in component-map
    | 'missing-variant-id'        // Variant nodeId not found, would target Component Set
    | 'targeting-component-set'   // Would target Component Set instead of variant
    | 'property-not-allowed'      // Property category not in allow-list
    | 'no-canonical-source'       // No canonical token to apply
    | 'low-confidence'            // Confidence too low for apply
    | 'value-unchanged'           // Value already matches
    | 'no-state-specific-data';   // No state-specific semantics, refusing to apply base to target state

  /**
   * Component key involved.
   */
  componentKey: string;

  /**
   * Property involved (if applicable).
   */
  property?: ApplyPropertyType;

  /**
   * Human-readable description.
   */
  message: string;

  /**
   * Canonical token involved (if applicable).
   */
  canonicalSource?: string;

  /**
   * State/variant that was targeted (if applicable).
   */
  targetState?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Apply execution mode.
 *
 * - 'artifact': Generate review artifact only, no server/plugin interaction
 * - 'apply': Send operations to Figma (requires FIGMA_APPLY_DRY_RUN=false)
 */
export type ApplyMode = 'artifact' | 'apply';

/**
 * Apply configuration from environment/flags.
 */
export interface ApplyConfig {
  /**
   * Master switch for apply.
   * Env: FIGMA_APPLY_ON (default: false)
   */
  enabled: boolean;

  /**
   * Execution mode.
   * Env: FIGMA_APPLY_MODE (default: 'artifact')
   */
  mode: ApplyMode;

  /**
   * Dry-run flag (apply mode only).
   * Env: FIGMA_APPLY_DRY_RUN (default: true)
   */
  dryRun: boolean;

  /**
   * Allowed property categories.
   * Env: FIGMA_APPLY_ALLOW (default: [])
   */
  allow: ApplyAllowCategory[];

  /**
   * Server URL for apply endpoint.
   * Env: FIGMA_APPLY_SERVER (default: 'http://localhost:3001')
   */
  serverUrl: string;

  /**
   * Minimum confidence level required for apply.
   * Env: FIGMA_APPLY_MIN_CONFIDENCE (default: 'high')
   */
  minConfidence: ConfidenceLevel;
}

// =============================================================================
// APPLY INPUT
// =============================================================================

/**
 * Input for generating apply operations.
 */
export interface ApplyInput {
  /**
   * Canonical resolution from Phase 10F.
   */
  resolution: import('../canonicalResolver/types.js').CanonicalResolution;

  /**
   * Component map for nodeId lookup.
   */
  componentMap: import('../reconcile/componentMap.js').ComponentMap;

  /**
   * Source file path (for artifact naming).
   */
  sourceFile: string;

  /**
   * Apply configuration.
   */
  config: ApplyConfig;

  /**
   * Optional: Target component key filter (from --component flag).
   * When specified, only generate ops for this component.
   */
  targetComponent?: string;

  /**
   * Optional: Target state filter (from --state flag).
   * When specified, target this specific variant state (e.g., 'hover').
   */
  targetState?: string;

  /**
   * Optional: Markers parsed from the source file.
   * Used to detect explicit state data for non-base states.
   */
  markers?: import('../parse/parseIntentFromReact.js').MarkerData[];

  /**
   * Optional: Design overrides loaded from design-overrides.json.
   * Used to detect explicit state data for non-base states.
   */
  overrides?: import('../reconcile/types.js').DesignOverrides;

  /**
   * Optional: Map of componentKey → canonical semantics.
   * Used to associate semantics with specific components.
   */
  componentSemantics?: Record<string, import('../tokens/canonical/types.js').CanonicalSemantics>;
}

// =============================================================================
// APPLY OUTPUT
// =============================================================================

/**
 * Result of generating apply operations.
 */
export interface ApplyOutput {
  /**
   * Generated operations (after filtering).
   */
  operations: FigmaApplyOp[];

  /**
   * Policy violations encountered.
   */
  violations: ApplyPolicyViolation[];

  /**
   * Summary statistics.
   */
  summary: {
    /** Total operations generated */
    totalOperations: number;
    /** Operations by property type */
    byProperty: Record<string, number>;
    /** Total violations */
    totalViolations: number;
    /** Violations by type */
    byViolationType: Record<string, number>;
  };
}

// =============================================================================
// APPLY ARTIFACT
// =============================================================================

/**
 * Artifact written to design-materializations/ for review.
 */
export interface ApplyArtifact {
  /** Schema version */
  version: '1.0';
  /** Generation timestamp */
  timestamp: string;
  /** Source file */
  sourceFile: string;
  /** Execution mode */
  mode: ApplyMode;
  /** Dry-run flag */
  dryRun: boolean;
  /** Generated operations */
  operations: FigmaApplyOp[];
  /** Policy violations */
  violations: ApplyPolicyViolation[];
  /** Summary statistics */
  summary: ApplyOutput['summary'];
  /** Execution results (only if applied) */
  results?: ApplyResult[];
}
