/**
 * @aesthetic-function/watcher - figmaDeltaApply/types.ts
 *
 * Phase 12C: Apply Figma Delta Suggestions Types.
 *
 * WHY: Defines types for the application layer that takes Phase 12B delta
 * suggestions and applies them to the correct storage target (AST, marker,
 * override) using existing safe pipelines.
 *
 * SCOPE:
 * - Opt-in apply mode (artifact-only default)
 * - Auditable: every apply produces artifact + audit log
 * - Deterministic: same inputs → same ops + same artifact
 * - Variant-safe: never writes to component-set nodeIds
 * - Reuses existing safety rules (auto-writable only for AST)
 */

import type { DeltaPropertyType, DeltaConfidence } from '../figmaDelta/types.js';
import type { SourceLocation } from '../ast/types.js';
import type { FigmaDeltaSuggestion } from '../figmaDeltaSuggest/types.js';

// =============================================================================
// APPLY TARGET
// =============================================================================

/**
 * Target for applying a delta.
 *
 * Same values as SuggestionTarget but used in apply context.
 * - ast: Direct AST write (literals only)
 * - marker: Update existing @figma marker line
 * - override: Write/create design-overrides.json entry
 * - blocked: Cannot be applied automatically
 */
export type DeltaApplyTarget = 'ast' | 'marker' | 'override' | 'blocked';

// =============================================================================
// APPLY OPERATION
// =============================================================================

/**
 * Evidence from the suggestion that informed this operation.
 */
export interface DeltaApplyEvidence {
  /**
   * Override key if targeting override.
   * Format: "ComponentName" or "ComponentName::state"
   */
  overrideKey?: string;

  /**
   * Marker line number if targeting marker.
   */
  markerLine?: number;

  /**
   * AST location if targeting AST.
   */
  astLoc?: SourceLocation;

  /**
   * Figma variant nodeId.
   */
  variantNodeId?: string;

  /**
   * Original canonical token (if present).
   */
  canonicalToken?: string;
}

/**
 * A normalized operation for applying a delta.
 */
export interface DeltaApplyOp {
  /**
   * Deterministic operation ID.
   * Hash of componentKey + state + property + target + to.
   */
  opId: string;

  /**
   * Component key (e.g., "LoginButton").
   */
  componentKey: string;

  /**
   * Target state (base, hover, pressed, disabled).
   */
  targetState: string;

  /**
   * Property being changed.
   */
  property: DeltaPropertyType;

  /**
   * Previous raw value.
   */
  from?: string | number;

  /**
   * New value to apply.
   */
  to: string | number;

  /**
   * Target for this operation.
   */
  target: DeltaApplyTarget;

  /**
   * Confidence level from the original delta.
   */
  confidence: DeltaConfidence;

  /**
   * Human-readable reason for this operation.
   */
  reason: string;

  /**
   * Evidence from the suggestion.
   */
  evidence: DeltaApplyEvidence;
}

// =============================================================================
// APPLY RESULT
// =============================================================================

/**
 * Result of a single operation application.
 */
export interface OpApplyResult {
  /**
   * Operation ID.
   */
  opId: string;

  /**
   * Whether the operation was applied.
   */
  applied: boolean;

  /**
   * Whether the operation was skipped.
   */
  skipped: boolean;

  /**
   * Reason for skipping (if skipped).
   */
  skipReason?: string;

  /**
   * Target that was applied to (if applied).
   */
  appliedTarget?: DeltaApplyTarget;

  /**
   * Actual path/location where applied (for logging).
   */
  appliedLocation?: string;
}

/**
 * Summary of apply operation results.
 */
export interface DeltaApplySummary {
  /**
   * Total operations processed.
   */
  total: number;

  /**
   * Applied counts by target.
   */
  applied: {
    ast: number;
    marker: number;
    override: number;
    total: number;
  };

  /**
   * Skipped counts by target.
   */
  skipped: {
    blocked: number;
    notAllowed: number;
    lowConfidence: number;
    noMarker: number;
    notWritable: number;
    dryRun: number;
    total: number;
  };
}

/**
 * Complete result from apply operation.
 */
export interface DeltaApplyResult {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * Whether dry-run mode was enabled.
   */
  dryRun: boolean;

  /**
   * Apply mode.
   */
  mode: DeltaApplyMode;

  /**
   * Operations that were processed.
   */
  ops: DeltaApplyOp[];

  /**
   * Results for each operation.
   */
  results: OpApplyResult[];

  /**
   * Policy violations encountered.
   */
  violations: string[];

  /**
   * Summary of results.
   */
  summary: DeltaApplySummary;

  /**
   * Path to generated artifact.
   */
  artifactPath: string;
}

// =============================================================================
// APPLY CONFIGURATION
// =============================================================================

/**
 * Apply mode.
 * - artifact: Generate artifact only (no writes)
 * - apply: Actually apply changes
 */
export type DeltaApplyMode = 'artifact' | 'apply';

/**
 * Allow targets for apply.
 */
export type DeltaApplyAllowTarget = 'ast' | 'marker' | 'override';

/**
 * Configuration for delta apply.
 */
export interface DeltaApplyConfig {
  /**
   * Master switch (FIGMA_DELTA_APPLY_ON).
   * Must be true to enable apply mode.
   */
  enabled: boolean;

  /**
   * Apply mode (FIGMA_DELTA_APPLY_MODE).
   * Default: 'artifact'
   */
  mode: DeltaApplyMode;

  /**
   * Dry-run mode (FIGMA_DELTA_APPLY_DRY_RUN).
   * Default: true
   */
  dryRun: boolean;

  /**
   * Allowed targets (FIGMA_DELTA_APPLY_ALLOW).
   * Default: ['override', 'marker', 'ast'] (all allowed)
   */
  allow: DeltaApplyAllowTarget[];

  /**
   * Minimum confidence level (FIGMA_DELTA_APPLY_MIN_CONFIDENCE).
   * Default: 'high'
   */
  minConfidence: DeltaConfidence;

  /**
   * Server URL for Figma communication (FIGMA_DELTA_APPLY_SERVER).
   * Default: 'http://localhost:3001'
   */
  serverUrl: string;
}

// =============================================================================
// APPLY INPUT
// =============================================================================

/**
 * Input for generating apply operations.
 */
export interface DeltaApplyInput {
  /**
   * Source file path.
   */
  filePath: string;

  /**
   * Suggestions from Phase 12B.
   */
  suggestions: FigmaDeltaSuggestion[];

  /**
   * Configuration for apply.
   */
  config: DeltaApplyConfig;

  /**
   * Optional: filter by component key.
   */
  componentFilter?: string;

  /**
   * Optional: filter by state.
   */
  stateFilter?: string;
}

// =============================================================================
// APPLY ARTIFACT
// =============================================================================

/**
 * Artifact for persisting apply operations.
 *
 * Written to design-materializations/<file>.figma-delta-apply.json
 */
export interface DeltaApplyArtifact {
  /**
   * Schema version.
   */
  version: '1.0';

  /**
   * Source of the apply.
   */
  source: 'figma-delta-apply';

  /**
   * ISO timestamp when apply was generated.
   */
  generatedAt: string;

  /**
   * Source file path.
   */
  sourceFile: string;

  /**
   * Apply mode used.
   */
  mode: DeltaApplyMode;

  /**
   * Whether dry-run was enabled.
   */
  dryRun: boolean;

  /**
   * Operations processed.
   */
  ops: DeltaApplyOp[];

  /**
   * Results for each operation.
   */
  results: OpApplyResult[];

  /**
   * Policy violations encountered.
   */
  violations: string[];

  /**
   * Summary of results.
   */
  summary: DeltaApplySummary;
}
