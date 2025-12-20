/**
 * @aesthetic-function/watcher - orchestrator/types.ts
 *
 * Type definitions for the Feature Orchestrator.
 *
 * WHY: Phase 9A introduces Prompt → Code → Figma flow. These types define
 * the request/response shapes for the orchestrator, including the context
 * bundle sent to the LLM and the patch artifact it returns.
 */

import type { AnchoredAstReport, WriteFeasibilityReport } from '../ast/types.js';
import type { DesignOverrides } from '../reconcile/types.js';
import type { ComponentMap } from '../reconcile/componentMap.js';
import type { IntentModel } from '../transform/types.js';
import type { AstWriteOpType, LayoutKey } from '../materialize/types.js';

// =============================================================================
// FEATURE REQUEST
// =============================================================================

/**
 * Component state variants.
 */
export type ComponentState = 'base' | 'hover' | 'pressed' | 'disabled';

/**
 * Input for the feature orchestrator.
 */
export interface FeatureRequest {
  /** Natural language feature request */
  prompt: string;
  /** Target file path (relative or absolute) */
  targetFile: string;
  /** Target component key (optional; inferred from AST if not given) */
  targetComponentKey?: string;
  /** Target state variant (optional; defaults to 'base') */
  state?: ComponentState;
}

// =============================================================================
// CONTEXT BUNDLE
// =============================================================================

/**
 * Simplified design token for LLM context.
 */
export interface TokenInfo {
  /** Token name (e.g., "Success/Green500") */
  name: string;
  /** Hex value (e.g., "#10B981") */
  value: string;
}

/**
 * Context bundle sent to the LLM.
 *
 * Contains all the information the agent needs to propose safe code changes.
 */
export interface ContextBundle {
  /** Original feature request from user */
  featurePrompt: string;
  /** Target file path */
  file: string;
  /** Target component key */
  componentKey: string;
  /** Target state variant */
  state: ComponentState;
  /** AST report with anchored markers and components */
  astReport: AnchoredAstReport;
  /** Current intent model for the file */
  intentModel: IntentModel;
  /** Design overrides from Figma */
  designOverrides: DesignOverrides;
  /** Component map for stable IDs */
  componentMap: ComponentMap | null;
  /** Write feasibility analysis */
  writeFeasibility: WriteFeasibilityReport;
  /** Available design tokens */
  designTokens: TokenInfo[];
}

// =============================================================================
// PROMPT PATCH ARTIFACT
// =============================================================================

/**
 * A single change proposed by the LLM.
 */
export interface PromptPatchChange {
  /** Operation type */
  op: AstWriteOpType;
  /** Node name from @figma marker */
  nodeName: string;
  /** Property path being changed (e.g., "text.content", "visual.fills[0]") */
  path: string;
  /** Value before the change */
  before: string | number | null;
  /** Value after the change */
  after: string | number;
  /** Human-readable explanation for the change */
  reason: string;
  /** Layout key (for SET_LAYOUT operations) */
  layoutKey?: LayoutKey;
}

/**
 * A change that was requested but could not be made safely.
 */
export interface SkippedChange {
  /** Field or property that was requested to change */
  field: string;
  /** Reason why the change was not possible */
  reason: string;
}

/**
 * Patch artifact returned by the LLM.
 *
 * This is the output format the Feature Orchestrator expects from the LLM.
 */
export interface PromptPatchArtifact {
  /** File path this patch applies to */
  file: string;
  /** ISO timestamp when artifact was generated */
  generatedAt: string;
  /** Original feature prompt */
  prompt: string;
  /** Target component key */
  componentKey: string;
  /** Target state */
  state: ComponentState;
  /** Proposed changes (can be empty if no safe changes possible) */
  changes: PromptPatchChange[];
  /** Changes that were skipped with reasons */
  skipped: SkippedChange[];
}

// =============================================================================
// ORCHESTRATOR RESULT
// =============================================================================

/**
 * Post-apply emit result (from postApplyEmit module).
 * Included in FeatureResult when POST_APPLY_EMIT is enabled.
 */
export interface PostApplyEmitInfo {
  /** Whether post-apply emit was attempted */
  attempted: boolean;
  /** Whether the operations were sent to server */
  sent: boolean;
  /** Number of Figma operations generated */
  opsCount: number;
  /** Number of connected Figma clients notified */
  clientsNotified?: number;
  /** Error message if send failed */
  error?: string;
}

/**
 * Result of the feature orchestrator.
 */
export interface FeatureResult {
  /** Whether the orchestration was successful */
  success: boolean;
  /** Path to the generated artifact */
  artifactPath: string;
  /** The patch artifact */
  artifact: PromptPatchArtifact;
  /** Number of changes proposed */
  changesCount: number;
  /** Number of changes skipped */
  skippedCount: number;
  /** Whether the patch was applied (if mode=write) */
  applied: boolean;
  /** Post-apply emit result (when POST_APPLY_EMIT is enabled) */
  postApplyEmit?: PostApplyEmitInfo;
  /** Error message if any */
  error?: string;
}

// =============================================================================
// ORCHESTRATOR OPTIONS
// =============================================================================

/**
 * Options for the feature orchestrator.
 */
export interface FeatureOptions {
  /** Repository root path */
  repoRoot: string;
  /** Whether to apply the patch after generation */
  apply?: boolean;
  /** Whether to run in dry-run mode (no actual writes) */
  dryRun?: boolean;
  /** LLM provider to use (defaults to env var) */
  llmProvider?: 'openai' | 'anthropic';
}

// =============================================================================
// STATE-AWARE APPLY TYPES
// =============================================================================

/**
 * Where a change should be applied.
 *
 * WHY: State-specific changes (hover, pressed, disabled) should NOT overwrite
 * base JSX. Instead, they should be applied to markers or overrides.
 */
export type ApplyTarget = 'jsx' | 'marker' | 'override';

/**
 * Result of determining where a change should be applied.
 */
export interface ApplyDecision {
  /** Where the change should be applied */
  target: ApplyTarget;
  /** Human-readable explanation for the decision */
  reason: string;
  /** The override key (e.g., "LoginButton::hover") if target is 'override' or 'marker' */
  overrideKey?: string;
}

/**
 * Result of applying changes in a state-aware manner.
 */
export interface StateAwareApplyResult {
  /** Number of changes applied to JSX */
  jsxApplied: number;
  /** Number of changes applied to markers */
  markerApplied: number;
  /** Number of changes saved to overrides */
  overrideApplied: number;
  /** Number of changes skipped */
  skipped: number;
  /** Detailed log of what was applied where */
  log: string[];
}
