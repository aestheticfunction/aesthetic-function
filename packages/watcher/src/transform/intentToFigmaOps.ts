/**
 * @aesthetic-function/watcher - transform/intentToFigmaOps.ts
 *
 * Deterministic transformer: IntentModel + DesignTokenContext → FigmaOperation[]
 *
 * WHY: Separates "what we want" (Intent) from "how to do it" (Figma Operations).
 * This is a pure function with no side effects, making it testable and predictable.
 *
 * ARCHITECTURE:
 * - Input: Intent Model (framework-agnostic UI description)
 * - Input: Design Token Context (for color resolution)
 * - Output: Figma Operations (scene graph mutations)
 *
 * PHASE 2A SCOPE:
 * - Button intent → SET_FILL + SET_TEXT operations
 * - Text intent → SET_TEXT operation
 * - No AST parsing, no LLM calls
 */

import type {
  Intent,
  IntentModel,
  ButtonIntent,
  TextIntent,
  FrameIntent,
} from './types.js';
import { getTargetNodeName } from './types.js';
import {
  type DesignTokenContext,
  resolveColorToken,
  getDefaultTokenContext,
} from '../tokens/designTokens.js';

// =============================================================================
// FIGMA OPERATION TYPES (subset for Phase 2A)
// =============================================================================

/**
 * SET_FILL operation - changes the fill color of a node.
 * Matches the operation type expected by code.ts
 */
export interface SetFillOperation {
  op: 'SET_FILL';
  nodeId?: string | null;
  nodeQuery?: string;
  color: string; // Resolved hex value
}

/**
 * SET_TEXT operation - changes the text content of a text node.
 * Matches the operation type expected by code.ts
 */
export interface SetTextOperation {
  op: 'SET_TEXT';
  nodeId?: string | null;
  nodeQuery?: string;
  text: string;
}

/**
 * Union of Figma operation types supported in Phase 2A.
 */
export type FigmaOperation = SetFillOperation | SetTextOperation;

// =============================================================================
// TRANSFORM RESULT
// =============================================================================

/**
 * Result of transforming an IntentModel to FigmaOperations.
 * Includes metadata for debugging and auditing.
 */
export interface TransformResult {
  /** Generated Figma operations */
  operations: FigmaOperation[];
  /** Tokens that were resolved during transformation */
  resolvedTokens: Array<{
    input: string;
    resolved: string;
    tokenName: string | null;
  }>;
  /** Any warnings during transformation */
  warnings: string[];
}

// =============================================================================
// INTENT TRANSFORMERS
// =============================================================================

/**
 * Transform a ButtonIntent to Figma operations.
 *
 * WHY: A button typically needs fill color and optionally text content updates.
 * We only emit SET_TEXT if text was explicitly specified.
 *
 * STATE HANDLING: Uses getTargetNodeName to generate state-aware node names:
 * - base state: LoginButton
 * - non-base state: LoginButton::hover
 *
 * @param intent - Button intent to transform
 * @param tokenContext - Design token context for color resolution
 * @returns Array of Figma operations
 */
function transformButtonIntent(
  intent: ButtonIntent,
  tokenContext: DesignTokenContext
): { ops: FigmaOperation[]; resolvedTokens: TransformResult['resolvedTokens'] } {
  const ops: FigmaOperation[] = [];
  const resolvedTokens: TransformResult['resolvedTokens'] = [];

  // Get target node name with state suffix if non-base
  const targetNodeName = getTargetNodeName(intent.nodeName, intent.state);

  // Resolve fill color (token or hex → hex)
  const resolvedFill = resolveColorToken(intent.fillTokenOrHex, tokenContext);
  resolvedTokens.push({
    input: intent.fillTokenOrHex,
    resolved: resolvedFill,
    tokenName: intent.fillTokenOrHex.startsWith('#') ? null : intent.fillTokenOrHex,
  });

  // SET_FILL operation for the button background
  ops.push({
    op: 'SET_FILL',
    nodeQuery: targetNodeName,
    nodeId: intent.nodeId ?? null,
    color: resolvedFill,
  });

  // Only emit SET_TEXT if text was explicitly provided
  // WHY: Fill-only markers (e.g., TestBox) shouldn't try to set text
  if (intent.text !== undefined) {
    ops.push({
      op: 'SET_TEXT',
      nodeQuery: targetNodeName,
      nodeId: intent.nodeId ?? null,
      text: intent.text,
    });
  }

  return { ops, resolvedTokens };
}

/**
 * Transform a TextIntent to Figma operations.
 *
 * STATE HANDLING: Uses getTargetNodeName to generate state-aware node names.
 *
 * @param intent - Text intent to transform
 * @param tokenContext - Design token context for color resolution
 * @returns Array of Figma operations
 */
function transformTextIntent(
  intent: TextIntent,
  tokenContext: DesignTokenContext
): { ops: FigmaOperation[]; resolvedTokens: TransformResult['resolvedTokens'] } {
  const ops: FigmaOperation[] = [];
  const resolvedTokens: TransformResult['resolvedTokens'] = [];

  // Get target node name with state suffix if non-base
  const targetNodeName = getTargetNodeName(intent.nodeName, intent.state);

  // SET_TEXT operation
  ops.push({
    op: 'SET_TEXT',
    nodeQuery: targetNodeName,
    nodeId: intent.nodeId ?? null,
    text: intent.characters,
  });

  // Optional: SET_FILL for text color if specified
  if (intent.colorTokenOrHex) {
    const resolvedColor = resolveColorToken(intent.colorTokenOrHex, tokenContext);
    resolvedTokens.push({
      input: intent.colorTokenOrHex,
      resolved: resolvedColor,
      tokenName: intent.colorTokenOrHex.startsWith('#') ? null : intent.colorTokenOrHex,
    });

    ops.push({
      op: 'SET_FILL',
      nodeQuery: targetNodeName,
      nodeId: intent.nodeId ?? null,
      color: resolvedColor,
    });
  }

  return { ops, resolvedTokens };
}

/**
 * Transform a FrameIntent to Figma operations.
 *
 * STATE HANDLING: Uses getTargetNodeName to generate state-aware node names.
 *
 * @param intent - Frame intent to transform
 * @param tokenContext - Design token context for color resolution
 * @returns Array of Figma operations
 */
function transformFrameIntent(
  intent: FrameIntent,
  tokenContext: DesignTokenContext
): { ops: FigmaOperation[]; resolvedTokens: TransformResult['resolvedTokens'] } {
  const ops: FigmaOperation[] = [];
  const resolvedTokens: TransformResult['resolvedTokens'] = [];

  // Get target node name with state suffix if non-base
  const targetNodeName = getTargetNodeName(intent.nodeName, intent.state);

  // SET_FILL operation for frame background (if specified)
  if (intent.fillTokenOrHex) {
    const resolvedFill = resolveColorToken(intent.fillTokenOrHex, tokenContext);
    resolvedTokens.push({
      input: intent.fillTokenOrHex,
      resolved: resolvedFill,
      tokenName: intent.fillTokenOrHex.startsWith('#') ? null : intent.fillTokenOrHex,
    });

    ops.push({
      op: 'SET_FILL',
      nodeQuery: targetNodeName,
      nodeId: intent.nodeId ?? null,
      color: resolvedFill,
    });
  }

  // Note: Layout properties (gap, padding, direction) would require
  // additional operation types not yet supported in Phase 2A

  return { ops, resolvedTokens };
}

// =============================================================================
// MAIN TRANSFORMER
// =============================================================================

/**
 * Transform an IntentModel to FigmaOperations.
 *
 * This is the main entry point for the transformer.
 * It's a pure function with no side effects.
 *
 * @param model - Intent model containing UI intents
 * @param tokenContext - Design token context (defaults to mock tokens)
 * @returns Transform result with operations and metadata
 */
export function intentToFigmaOps(
  model: IntentModel,
  tokenContext: DesignTokenContext = getDefaultTokenContext()
): TransformResult {
  const allOps: FigmaOperation[] = [];
  const allResolvedTokens: TransformResult['resolvedTokens'] = [];
  const warnings: string[] = [];

  for (const intent of model.intents) {
    let result: { ops: FigmaOperation[]; resolvedTokens: TransformResult['resolvedTokens'] };

    switch (intent.type) {
      case 'BUTTON':
        result = transformButtonIntent(intent, tokenContext);
        break;
      case 'TEXT':
        result = transformTextIntent(intent, tokenContext);
        break;
      case 'FRAME':
        result = transformFrameIntent(intent, tokenContext);
        break;
      default: {
        // Exhaustive check - TypeScript will error if we miss a case
        const exhaustiveCheck: never = intent;
        warnings.push(`Unknown intent type: ${(exhaustiveCheck as Intent).type}`);
        continue;
      }
    }

    allOps.push(...result.ops);
    allResolvedTokens.push(...result.resolvedTokens);
  }

  return {
    operations: allOps,
    resolvedTokens: allResolvedTokens,
    warnings,
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create a simple IntentModel from a single intent.
 * Useful for testing and simple use cases.
 */
export function createIntentModel(intents: Intent[], source?: string): IntentModel {
  return {
    intents,
    source,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Transform a single intent to operations.
 * Convenience wrapper around intentToFigmaOps.
 */
export function transformSingleIntent(
  intent: Intent,
  tokenContext?: DesignTokenContext
): TransformResult {
  return intentToFigmaOps(createIntentModel([intent]), tokenContext);
}
