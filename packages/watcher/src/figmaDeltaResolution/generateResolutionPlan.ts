/**
 * @aesthetic-function/watcher - figmaDeltaResolution/generateResolutionPlan.ts
 *
 * Phase 12E: Guided Conflict Resolution Plan Generator.
 *
 * WHY: Transforms Phase 12D conflict reports into explicit, auditable
 * resolution plans without automatically applying changes.
 *
 * SCOPE:
 * - Read-only: generates plans, does NOT apply them
 * - Deterministic: same inputs → same outputs
 * - Applies existing policy only — no new logic
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX, markers, overrides, or component maps
 * - Does NOT emit Figma operations
 * - Does NOT call apply functions
 * - Produces suggestions, not executions
 */

import type { ConflictItem } from '../figmaDelta/conflicts/types.js';
import type {
  ResolutionAction,
  ResolutionDecision,
  ResolutionPlan,
  ResolutionPlanSummary,
  ResolutionInput,
} from './types.js';

// =============================================================================
// RESOLUTION RULES
// =============================================================================

/**
 * Default resolution rules mapping conflict types to actions.
 *
 * These are SUGGESTIONS, not executions:
 * - AST auto-writable base state → APPLY_TO_AST
 * - Non-base state explicit marker exists → APPLY_TO_MARKER
 * - Non-base state override exists → APPLY_TO_OVERRIDE
 * - Non-base state, no explicit data → BLOCK
 * - Unsafe AST write → APPLY_TO_OVERRIDE
 * - Explicit conflict user must decide → IGNORE
 */

/**
 * Map a conflict item to its suggested resolution action.
 */
function mapConflictToAction(conflict: ConflictItem): ResolutionAction {
  // Check policy rule first
  switch (conflict.policyRule) {
    case 'auto-writable-literal':
      // Base state with auto-writable AST literal
      return 'APPLY_TO_AST';

    case 'existing-marker-update':
      // Marker exists and can be updated
      return 'APPLY_TO_MARKER';

    case 'non-base-state-to-marker':
      // Non-base state with explicit marker
      return 'APPLY_TO_MARKER';

    case 'non-base-state-to-override':
      // Non-base state with existing override
      return 'APPLY_TO_OVERRIDE';

    case 'override-fallback':
      // AST not writable, fall back to override
      return 'APPLY_TO_OVERRIDE';

    case 'non-base-state-no-explicit-data':
      // Non-base state with no marker or override
      return 'BLOCK';

    case 'non-base-state-refused':
      // Non-base state cannot write to AST
      return 'BLOCK';

    case 'low-confidence-blocked':
      // Low confidence → blocked
      return 'BLOCK';

    case 'blocked-no-target':
      // No valid target found
      return 'BLOCK';

    default:
      break;
  }

  // Fall back to conflict type if policy rule doesn't match
  switch (conflict.conflictType) {
    case 'AST_VS_FIGMA':
      // Check if it would apply
      if (conflict.wouldApply && conflict.suggestedTarget === 'ast') {
        return 'APPLY_TO_AST';
      }
      // Unsafe AST write → override fallback
      return 'APPLY_TO_OVERRIDE';

    case 'MARKER_VS_FIGMA':
      return 'APPLY_TO_MARKER';

    case 'OVERRIDE_VS_FIGMA':
      return 'APPLY_TO_OVERRIDE';

    case 'CANONICAL_MISMATCH':
      // Canonical mismatch requires user decision
      return 'IGNORE';

    case 'UNMAPPED_VARIANT':
      // Cannot apply to unmapped variant
      return 'BLOCK';

    case 'NON_BASE_STATE_BLOCKED':
      return 'BLOCK';

    case 'LOW_CONFIDENCE_BLOCKED':
      return 'BLOCK';

    default:
      return 'IGNORE';
  }
}

/**
 * Generate a reason string explaining the resolution decision.
 */
function generateReason(conflict: ConflictItem, action: ResolutionAction): string {
  switch (action) {
    case 'APPLY_TO_AST':
      return `Base state with auto-writable ${conflict.property} literal in AST`;

    case 'APPLY_TO_MARKER':
      if (conflict.targetState === 'base') {
        return `Existing @figma marker can be updated with new ${conflict.property} value`;
      }
      return `Non-base state (${conflict.targetState}) with explicit marker present`;

    case 'APPLY_TO_OVERRIDE':
      if (conflict.suggestedTarget === 'override') {
        return `Override entry exists for ${conflict.componentKey}::${conflict.targetState}`;
      }
      return `AST not auto-writable; falling back to design-overrides.json`;

    case 'IGNORE':
      if (conflict.conflictType === 'CANONICAL_MISMATCH') {
        return `Canonical token mismatch requires user decision`;
      }
      return `Explicit conflict detected; user must decide resolution`;

    case 'BLOCK':
      if (conflict.conflictType === 'NON_BASE_STATE_BLOCKED') {
        return `Non-base state (${conflict.targetState}) with no explicit marker or override data`;
      }
      if (conflict.conflictType === 'LOW_CONFIDENCE_BLOCKED') {
        return `Delta confidence too low for automatic resolution`;
      }
      if (conflict.conflictType === 'UNMAPPED_VARIANT') {
        return `Variant nodeId not found in component-map.json`;
      }
      return `Cannot resolve automatically; manual intervention required`;

    default:
      return 'Unknown resolution action';
  }
}

/**
 * Generate a conflict ID for traceability.
 */
function generateConflictId(conflict: ConflictItem): string {
  return `${conflict.componentKey}::${conflict.targetState}::${conflict.property}`;
}

// =============================================================================
// PLAN GENERATION
// =============================================================================

/**
 * Build a resolution decision from a conflict item.
 */
function buildDecision(conflict: ConflictItem): ResolutionDecision {
  const action = mapConflictToAction(conflict);
  const reason = generateReason(conflict, action);
  const sourceConflictId = generateConflictId(conflict);

  return {
    componentKey: conflict.componentKey,
    targetState: conflict.targetState,
    property: conflict.property,
    action,
    reason,
    sourceConflictId,
  };
}

/**
 * Compute summary statistics from decisions.
 */
function computeSummary(decisions: ResolutionDecision[]): ResolutionPlanSummary {
  let applyAst = 0;
  let applyMarker = 0;
  let applyOverride = 0;
  let ignored = 0;
  let blocked = 0;

  for (const decision of decisions) {
    switch (decision.action) {
      case 'APPLY_TO_AST':
        applyAst++;
        break;
      case 'APPLY_TO_MARKER':
        applyMarker++;
        break;
      case 'APPLY_TO_OVERRIDE':
        applyOverride++;
        break;
      case 'IGNORE':
        ignored++;
        break;
      case 'BLOCK':
        blocked++;
        break;
    }
  }

  return { applyAst, applyMarker, applyOverride, ignored, blocked };
}

/**
 * Generate a resolution plan from a conflict report.
 *
 * This produces a PROPOSAL, not an execution.
 * All decisions are suggestions that must be reviewed before application.
 *
 * @param input - Conflict report from Phase 12D
 * @returns Resolution plan with all decisions
 */
export function generateResolutionPlan(input: ResolutionInput): ResolutionPlan {
  const { conflictReport } = input;

  // Build decisions for each conflict
  // Maintain deterministic ordering by sorting on conflict ID
  const decisions = conflictReport.conflicts
    .map(buildDecision)
    .sort((a, b) => a.sourceConflictId.localeCompare(b.sourceConflictId));

  // Compute summary
  const summary = computeSummary(decisions);

  return {
    version: '1.0',
    sourceFile: conflictReport.filePath,
    generatedAt: new Date().toISOString(),
    decisions,
    summary,
  };
}
