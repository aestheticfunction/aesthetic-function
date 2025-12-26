/**
 * @aesthetic-function/watcher - verification/types.ts
 *
 * Phase 12G: Post-Apply Verification & Rollback Artifacts.
 *
 * WHY: Defines types for the verification layer that confirms whether
 * applied resolution plans landed as intended.
 *
 * SCOPE:
 * - Verification-only (no mutations)
 * - Detect drift or partial failure
 * - Produce deterministic verification artifacts
 * - Prepare rollback information (read-only)
 *
 * CONSTRAINTS:
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Does NOT re-run apply logic
 * - Does NOT infer intent or auto-correct failures
 * - Observes, verifies, and records only
 */

import type { DeltaPropertyType } from '../figmaDelta/types.js';
import type { ResolutionAction } from '../figmaDeltaResolution/types.js';
import type { SourceLocation } from '../ast/types.js';

// =============================================================================
// VERIFICATION STATUS
// =============================================================================

/**
 * Status of a verification check.
 *
 * - verified: Value matches expected
 * - mismatch: Value differs from expected
 * - missing: Target not found (file, line, key, or node)
 * - skipped: Verification not applicable (e.g., IGNORE/BLOCK action)
 * - blocked: Verification could not run (e.g., file unreadable)
 */
export type VerificationStatus =
  | 'verified'
  | 'mismatch'
  | 'missing'
  | 'skipped'
  | 'blocked';

// =============================================================================
// VERIFICATION TARGET
// =============================================================================

/**
 * Target type for verification.
 *
 * - ast: AST file contents
 * - marker: @figma marker lines
 * - override: design-overrides.json entries
 * - figma: Figma node properties (read-only via server/plugin)
 */
export type VerificationTarget = 'ast' | 'marker' | 'override' | 'figma';

// =============================================================================
// VERIFICATION ITEM
// =============================================================================

/**
 * Evidence for a verification check.
 */
export interface VerificationEvidence {
  /**
   * AST source location (for AST targets).
   */
  astLoc?: SourceLocation;

  /**
   * Marker line number (for marker targets).
   */
  markerLine?: number;

  /**
   * Override key (for override targets).
   */
  overrideKey?: string;

  /**
   * Figma node ID (for Figma targets).
   */
  nodeId?: string;

  /**
   * Figma property path (for Figma targets).
   */
  propertyPath?: string;
}

/**
 * A single verification item for one applied decision.
 */
export interface VerificationItem {
  /**
   * Decision ID from the apply artifact (for traceability).
   */
  decisionId: string;

  /**
   * Component key.
   */
  componentKey: string;

  /**
   * Target state.
   */
  targetState: string;

  /**
   * Property that was verified.
   */
  property: DeltaPropertyType;

  /**
   * Action that was applied.
   */
  action: ResolutionAction;

  /**
   * Target type for verification.
   */
  target: VerificationTarget;

  /**
   * Expected value after apply.
   */
  expectedValue?: string | number;

  /**
   * Observed value during verification.
   */
  observedValue?: string | number;

  /**
   * Verification status.
   */
  status: VerificationStatus;

  /**
   * Human-readable reason for status.
   */
  reason: string;

  /**
   * Evidence of where verification was checked.
   */
  evidence: VerificationEvidence;

  /**
   * Previous value before apply (for rollback preparation).
   */
  previousValue?: string | number;
}

// =============================================================================
// VERIFICATION SUMMARY
// =============================================================================

/**
 * Summary statistics for a verification report.
 */
export interface VerificationSummary {
  /**
   * Total items checked.
   */
  total: number;

  /**
   * Number verified successfully.
   */
  verified: number;

  /**
   * Number with mismatched values.
   */
  mismatch: number;

  /**
   * Number with missing targets.
   */
  missing: number;

  /**
   * Number skipped (not applicable).
   */
  skipped: number;

  /**
   * Number blocked (verification failed to run).
   */
  blocked: number;
}

// =============================================================================
// VERIFICATION REPORT
// =============================================================================

/**
 * Complete verification report for a file.
 */
export interface VerificationReport {
  /**
   * Report format version.
   */
  version: '1.0';

  /**
   * Artifact source identifier.
   */
  source: 'figma-verification';

  /**
   * Source file that was verified.
   */
  sourceFile: string;

  /**
   * Path to the apply artifact that was verified.
   */
  applyArtifactPath: string;

  /**
   * Path to the resolution plan that was used.
   */
  planPath: string;

  /**
   * ISO timestamp when verification was run.
   */
  generatedAt: string;

  /**
   * Summary statistics.
   */
  summary: VerificationSummary;

  /**
   * Per-item verification results.
   */
  items: VerificationItem[];
}

// =============================================================================
// VERIFICATION CONTEXT
// =============================================================================

/**
 * Context for running verification.
 */
export interface VerificationContext {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Source file path (relative to repo root).
   */
  sourceFile: string;

  /**
   * Whether to include Figma verification.
   * Requires server/plugin connectivity.
   */
  includeFigma?: boolean;

  /**
   * Server URL for Figma queries.
   */
  serverUrl?: string;
}

// =============================================================================
// VERIFICATION CONFIG
// =============================================================================

/**
 * Configuration for verification.
 */
export interface VerificationConfig {
  /**
   * Whether to include Figma verification.
   */
  includeFigma: boolean;

  /**
   * Server URL for Figma queries.
   */
  serverUrl: string;

  /**
   * Whether to write artifact on all runs (not just failures).
   */
  alwaysWriteArtifact: boolean;

  /**
   * Custom apply artifact path (optional).
   */
  applyArtifactPath?: string;

  /**
   * Custom plan artifact path (optional).
   */
  planPath?: string;
}

// =============================================================================
// LOADED ARTIFACTS
// =============================================================================

/**
 * Result of loading apply artifact.
 */
export interface LoadedApplyArtifact {
  /**
   * Whether loading was successful.
   */
  success: boolean;

  /**
   * The loaded artifact (if successful).
   */
  artifact?: import('../figmaResolveApply/types.js').ResolutionApplyArtifact;

  /**
   * Path the artifact was loaded from.
   */
  loadedFrom: string;

  /**
   * Error message if loading failed.
   */
  error?: string;
}

/**
 * Result of loading resolution plan.
 */
export interface LoadedPlanArtifact {
  /**
   * Whether loading was successful.
   */
  success: boolean;

  /**
   * The loaded plan (if successful).
   */
  plan?: import('../figmaDeltaResolution/types.js').ResolutionPlan;

  /**
   * Path the plan was loaded from.
   */
  loadedFrom: string;

  /**
   * Error message if loading failed.
   */
  error?: string;
}
