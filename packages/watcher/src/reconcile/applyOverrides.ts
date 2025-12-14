/**
 * @aesthetic-function/watcher - reconcile/applyOverrides.ts
 *
 * Applies design-overrides.json to an IntentModel.
 *
 * WHY: Creates a closed feedback loop where Figma edits are reconciled
 * with code-derived intents before being sent back to Figma.
 *
 * RECONCILIATION RULES:
 * - Match overrides by key = intent.nodeName
 * - Override text field for TEXT and BUTTON intents
 * - Override fill field for BUTTON, TEXT, FRAME intents
 * - Unsupported fields are ignored
 * - Missing intents for an override key are logged and ignored
 * - Precedence controls when overrides are applied
 */

import type { IntentModel, Intent, ButtonIntent, TextIntent, FrameIntent } from '../transform/types.js';
import type { DesignOverrides, ReconcileResult } from './types.js';
import type { OverridePrecedence } from './config.js';
import { isOverrideNewerThanFile } from './config.js';

// =============================================================================
// OPTIONS
// =============================================================================

/**
 * Options for applying overrides.
 */
export interface ApplyOverridesOptions {
  /** File modification time (for if_newer_than_code precedence) */
  fileMtime?: Date;
  /** Precedence mode (default: 'always') */
  precedence?: OverridePrecedence;
}

// =============================================================================
// APPLY OVERRIDES
// =============================================================================

/**
 * Apply design overrides to an IntentModel.
 *
 * Creates a NEW IntentModel with overridden values.
 * Does not mutate the original model.
 *
 * @param model - Original IntentModel from code parsing
 * @param overrides - Design overrides from Figma (can be null)
 * @param options - Precedence and timing options
 * @returns Object containing the reconciled model and result metadata
 */
export function applyOverridesToIntentModel(
  model: IntentModel,
  overrides: DesignOverrides | null,
  options: ApplyOverridesOptions = {}
): { model: IntentModel; result: ReconcileResult } {
  const { precedence = 'always', fileMtime } = options;
  
  const result: ReconcileResult = {
    matched: 0,
    ignored: 0,
    stale: 0,
    overriddenNodes: [],
    ignoredKeys: [],
    staleKeys: [],
  };

  // If no overrides, return original model unchanged
  if (!overrides || Object.keys(overrides).length === 0) {
    return { model, result };
  }

  // Track which override keys have been matched
  const matchedKeys = new Set<string>();

  // Create new intents with overrides applied
  const reconciledIntents = model.intents.map((intent) => {
    const override = overrides[intent.nodeName];
    if (!override) {
      return intent; // No override for this intent
    }

    matchedKeys.add(intent.nodeName);

    // Check precedence for if_newer_than_code mode
    if (precedence === 'if_newer_than_code' && fileMtime) {
      if (!isOverrideNewerThanFile(override.lastUpdated, fileMtime)) {
        // Override is stale (older than or equal to file mtime)
        result.stale++;
        result.staleKeys.push(intent.nodeName);
        return intent; // Don't apply this override
      }
    }

    const overridden = applyOverrideToIntent(intent, override);

    if (overridden !== intent) {
      result.overriddenNodes.push(intent.nodeName);
    }

    return overridden;
  });

  // Count matched overrides (those that were applied, not stale)
  result.matched = result.overriddenNodes.length;

  // Find ignored overrides (keys in overrides that didn't match any intent)
  for (const key of Object.keys(overrides)) {
    if (!matchedKeys.has(key)) {
      result.ignored++;
      result.ignoredKeys.push(key);
    }
  }

  // Return new model with reconciled intents
  return {
    model: {
      ...model,
      intents: reconciledIntents,
    },
    result,
  };
}

// =============================================================================
// INTENT-SPECIFIC OVERRIDE APPLICATION
// =============================================================================

/**
 * Apply an override to a single intent based on its type.
 *
 * @param intent - Original intent
 * @param override - Override to apply
 * @returns New intent with overrides applied, or original if no applicable overrides
 */
function applyOverrideToIntent(
  intent: Intent,
  override: { text?: string; fill?: string }
): Intent {
  switch (intent.type) {
    case 'BUTTON':
      return applyOverrideToButton(intent, override);
    case 'TEXT':
      return applyOverrideToText(intent, override);
    case 'FRAME':
      return applyOverrideToFrame(intent, override);
    default:
      return intent;
  }
}

/**
 * Apply override to ButtonIntent.
 * Supports: text → text, fill → fillTokenOrHex
 */
function applyOverrideToButton(
  intent: ButtonIntent,
  override: { text?: string; fill?: string }
): ButtonIntent {
  let changed = false;
  const result = { ...intent };

  if (override.text !== undefined) {
    result.text = override.text;
    changed = true;
  }

  if (override.fill !== undefined) {
    result.fillTokenOrHex = override.fill;
    changed = true;
  }

  return changed ? result : intent;
}

/**
 * Apply override to TextIntent.
 * Supports: text → characters, fill → colorTokenOrHex
 */
function applyOverrideToText(
  intent: TextIntent,
  override: { text?: string; fill?: string }
): TextIntent {
  let changed = false;
  const result = { ...intent };

  if (override.text !== undefined) {
    result.characters = override.text;
    changed = true;
  }

  if (override.fill !== undefined) {
    result.colorTokenOrHex = override.fill;
    changed = true;
  }

  return changed ? result : intent;
}

/**
 * Apply override to FrameIntent.
 * Supports: fill → fillTokenOrHex (text is not applicable to frames)
 */
function applyOverrideToFrame(
  intent: FrameIntent,
  override: { text?: string; fill?: string }
): FrameIntent {
  // Note: text override is ignored for frames (logged as warning at call site)
  if (override.fill !== undefined) {
    return {
      ...intent,
      fillTokenOrHex: override.fill,
    };
  }

  return intent;
}
