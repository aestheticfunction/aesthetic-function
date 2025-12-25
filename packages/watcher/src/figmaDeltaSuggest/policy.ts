/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/policy.ts
 *
 * Phase 12B: Suggestion Target Selection Policy.
 *
 * WHY: Implements rules for determining where a Figma delta change should land.
 * The policy ensures:
 * - Variant-scoped only (never Component Sets)
 * - Non-base states prefer override/marker (never AST writes)
 * - Base state AST writes only for auto-writable literals
 * - Deterministic target selection
 *
 * POLICY RULES:
 * 1. Non-base state (hover/pressed/disabled):
 *    - Prefer existing override if key exists
 *    - Else prefer existing marker if state marker exists
 *    - Else suggest override creation (requires explicit opt-in)
 *    - Never suggest AST writes
 *
 * 2. Base state:
 *    - If auto-writable AST location exists → suggest AST write
 *    - Else prefer existing override if exists
 *    - Else prefer existing marker if exists
 *    - Else suggest override creation
 */

import type {
  SuggestionTarget,
  SuggestionKind,
  SuggestionEvidence,
} from './types.js';
import type { WriteSafetyLevel, WriteSafetyReport, ValueWriteSafety } from '../ast/types.js';
import type { DeltaPropertyType } from '../figmaDelta/types.js';

// =============================================================================
// STATE HELPERS
// =============================================================================

/**
 * Check if a state is non-base (hover, pressed, disabled).
 *
 * @param state - Component state to check
 * @returns true if state is not 'base'
 */
export function isNonBaseState(state: string): boolean {
  return state !== 'base';
}

/**
 * Valid non-base states for component variants.
 */
export const NON_BASE_STATES = ['hover', 'pressed', 'disabled'] as const;

/**
 * Check if a state is a valid variant state.
 */
export function isValidVariantState(state: string): boolean {
  return state === 'base' || NON_BASE_STATES.includes(state as typeof NON_BASE_STATES[number]);
}

// =============================================================================
// WRITE SAFETY HELPERS
// =============================================================================

/**
 * Map delta property types to AST property paths.
 *
 * WHY: Phase 6C reports use paths like "visual.fills", "layout.padding"
 * while deltas use simpler property names.
 */
const PROPERTY_TO_AST_PATH: Record<DeltaPropertyType, string[]> = {
  fill: ['visual.fills', 'visual.backgroundColor'],
  textColor: ['visual.fills', 'visual.color'],
  padding: ['layout.padding'],
  gap: ['layout.gap'],
  width: ['layout.width'],
  height: ['layout.height'],
  fontSize: ['typography.fontSize'],
  fontWeight: ['typography.fontWeight'],
};

/**
 * Check if a property is auto-writable for a component.
 *
 * @param property - Delta property type
 * @param writeSafetyReport - Phase 6C safety report for the component
 * @returns The auto-writable value safety, or undefined if not auto-writable
 */
export function findAutoWritableValue(
  property: DeltaPropertyType,
  writeSafetyReport?: WriteSafetyReport
): ValueWriteSafety | undefined {
  if (!writeSafetyReport) {
    return undefined;
  }

  const paths = PROPERTY_TO_AST_PATH[property] ?? [];
  
  // Check if any matching path is auto-writable
  for (const autoWritable of writeSafetyReport.autoWritable) {
    for (const path of paths) {
      if (autoWritable.path === path || autoWritable.path.startsWith(path + '.')) {
        return autoWritable;
      }
    }
  }

  return undefined;
}

/**
 * Check if a property can have an AST write suggested.
 *
 * Requirements:
 * - State must be 'base'
 * - Write safety level must be 'auto-writable'
 * - Clear AST location must exist
 *
 * @param state - Target state
 * @param property - Delta property type
 * @param writeSafetyReport - Phase 6C safety report
 * @returns true if AST write can be suggested
 */
export function canSuggestAstWrite(
  state: string,
  property: DeltaPropertyType,
  writeSafetyReport?: WriteSafetyReport
): boolean {
  // Non-base states cannot have AST writes
  if (isNonBaseState(state)) {
    return false;
  }

  // Check for auto-writable value
  const autoWritable = findAutoWritableValue(property, writeSafetyReport);
  if (!autoWritable) {
    return false;
  }

  // Must have a clear AST location
  return autoWritable.loc !== undefined;
}

// =============================================================================
// TARGET SELECTION
// =============================================================================

/**
 * Context for choosing a suggestion target.
 */
export interface TargetSelectionContext {
  /** Component key */
  componentKey: string;
  /** Target state */
  state: string;
  /** Property being changed */
  property: DeltaPropertyType;
  /** Whether an override exists for this component::state */
  hasOverride: boolean;
  /** Override key if exists */
  overrideKey?: string;
  /** Whether a marker exists for this component::state */
  hasMarker: boolean;
  /** Marker line number if exists */
  markerLine?: number;
  /** Phase 6C write safety report for the component */
  writeSafetyReport?: WriteSafetyReport;
  /** Variant nodeId */
  variantNodeId: string;
}

/**
 * Result of target selection.
 */
export interface TargetSelectionResult {
  /** Selected target */
  target: SuggestionTarget;
  /** Suggestion kind */
  kind: SuggestionKind;
  /** Reason for selection */
  reason: string;
  /** Blocking reason (if target is 'none') */
  blockingReason?: string;
  /** Evidence */
  evidence: SuggestionEvidence;
}

/**
 * Choose the suggestion target based on policy rules.
 *
 * @param ctx - Target selection context
 * @returns Target selection result with evidence
 */
export function chooseSuggestionTarget(ctx: TargetSelectionContext): TargetSelectionResult {
  const evidence: SuggestionEvidence = {
    variantNodeId: ctx.variantNodeId,
  };

  // Non-base state rules
  if (isNonBaseState(ctx.state)) {
    return chooseNonBaseTarget(ctx, evidence);
  }

  // Base state rules
  return chooseBaseTarget(ctx, evidence);
}

/**
 * Choose target for non-base states (hover, pressed, disabled).
 *
 * Priority:
 * 1. Existing override → suggest UPDATE_OVERRIDE
 * 2. Existing marker → suggest UPDATE_MARKER
 * 3. Neither exists → suggest override creation (read-only suggestion)
 *
 * Never suggests AST writes for non-base states.
 */
function chooseNonBaseTarget(
  ctx: TargetSelectionContext,
  evidence: SuggestionEvidence
): TargetSelectionResult {
  // Priority 1: Existing override
  if (ctx.hasOverride && ctx.overrideKey) {
    evidence.overrideKey = ctx.overrideKey;
    return {
      target: 'override',
      kind: 'UPDATE_OVERRIDE',
      reason: `Existing override found for ${ctx.state} state`,
      evidence,
    };
  }

  // Priority 2: Existing marker with state
  if (ctx.hasMarker && ctx.markerLine !== undefined) {
    evidence.markerLine = ctx.markerLine;
    return {
      target: 'marker',
      kind: 'UPDATE_MARKER',
      reason: `Existing ${ctx.state} state marker found`,
      evidence,
    };
  }

  // Priority 3: Suggest override creation (requires explicit opt-in)
  // Using override key format Component::state
  evidence.overrideKey = `${ctx.componentKey}::${ctx.state}`;
  return {
    target: 'override',
    kind: 'UPDATE_OVERRIDE',
    reason: `No existing ${ctx.state} data; suggesting new override entry (requires explicit opt-in)`,
    evidence,
  };
}

/**
 * Choose target for base state.
 *
 * Priority:
 * 1. Auto-writable AST location → suggest AST_WRITE_PATCH
 * 2. Existing override → suggest UPDATE_OVERRIDE
 * 3. Existing marker → suggest UPDATE_MARKER
 * 4. Neither exists → suggest override creation
 */
function chooseBaseTarget(
  ctx: TargetSelectionContext,
  evidence: SuggestionEvidence
): TargetSelectionResult {
  // Priority 1: Auto-writable AST location
  const autoWritable = findAutoWritableValue(ctx.property, ctx.writeSafetyReport);
  if (autoWritable?.loc) {
    evidence.astLoc = autoWritable.loc;
    evidence.writeSafetyLevel = 'auto-writable';
    return {
      target: 'ast',
      kind: 'AST_WRITE_PATCH',
      reason: `Auto-writable ${ctx.property} literal found in AST`,
      evidence,
    };
  }

  // Priority 2: Existing override
  if (ctx.hasOverride && ctx.overrideKey) {
    evidence.overrideKey = ctx.overrideKey;
    // Note why AST write wasn't chosen
    if (ctx.writeSafetyReport) {
      evidence.writeSafetyLevel = findWriteSafetyLevel(ctx.property, ctx.writeSafetyReport);
    }
    return {
      target: 'override',
      kind: 'UPDATE_OVERRIDE',
      reason: `Existing override found; ${ctx.property} not auto-writable in AST`,
      evidence,
    };
  }

  // Priority 3: Existing marker
  if (ctx.hasMarker && ctx.markerLine !== undefined) {
    evidence.markerLine = ctx.markerLine;
    return {
      target: 'marker',
      kind: 'UPDATE_MARKER',
      reason: `Existing marker found; ${ctx.property} not auto-writable in AST`,
      evidence,
    };
  }

  // Priority 4: Suggest override creation
  evidence.overrideKey = ctx.componentKey;
  return {
    target: 'override',
    kind: 'UPDATE_OVERRIDE',
    reason: `No existing data; suggesting new override entry`,
    evidence,
  };
}

/**
 * Find the write safety level for a property.
 */
function findWriteSafetyLevel(
  property: DeltaPropertyType,
  report: WriteSafetyReport
): WriteSafetyLevel | undefined {
  const paths = PROPERTY_TO_AST_PATH[property] ?? [];

  // Check auto-writable
  for (const v of report.autoWritable) {
    for (const path of paths) {
      if (v.path === path || v.path.startsWith(path + '.')) {
        return 'auto-writable';
      }
    }
  }

  // Check conditionally-writable
  for (const v of report.conditionallyWritable) {
    for (const path of paths) {
      if (v.path === path || v.path.startsWith(path + '.')) {
        return 'conditionally-writable';
      }
    }
  }

  // Check not-writable
  for (const v of report.notWritable) {
    for (const path of paths) {
      if (v.path === path || v.path.startsWith(path + '.')) {
        return 'not-writable';
      }
    }
  }

  return undefined;
}
