/**
 * @aesthetic-function/watcher - transform/types.ts
 *
 * Intent types for the deterministic transformer.
 *
 * WHY: Intent Model describes *what the UI is* in a framework-agnostic way.
 * These are simplified intent types for Phase 2A (no AST parsing).
 *
 * ARCHITECTURE NOTE:
 * - Intent Model is produced by the Watcher (code → intent)
 * - Figma Operations are produced from Intent (intent → ops)
 * - Plugin receives only Figma Operations, not Intent
 */

// =============================================================================
// INTENT TYPES
// =============================================================================

/**
 * Base properties shared by all intent nodes.
 */
export interface BaseIntent {
  /** Target node name in Figma (for querying) */
  nodeName: string;
  /** Optional Figma node ID if known */
  nodeId?: string;
}

/**
 * Button intent - represents a clickable button component.
 *
 * WHY: Buttons are the most common interactive element and
 * have clear visual properties (fill, text, state).
 */
export interface ButtonIntent extends BaseIntent {
  type: 'BUTTON';
  /** Button label text (optional - only set if explicitly specified in marker) */
  text?: string;
  /**
   * Fill color - can be:
   * - Token name (e.g., "Primary/Blue500")
   * - Hex value (e.g., "#3B82F6")
   */
  fillTokenOrHex: string;
  /** Optional text color */
  textColorTokenOrHex?: string;
  /** Optional variant (for component variants) */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
}

/**
 * Text intent - represents a text element.
 *
 * WHY: Text content is the most frequently changed element
 * during development iteration.
 */
export interface TextIntent extends BaseIntent {
  type: 'TEXT';
  /** Text content */
  characters: string;
  /** Optional text color */
  colorTokenOrHex?: string;
  /** Optional font size */
  fontSize?: number;
  /** Optional font weight */
  fontWeight?: number;
}

/**
 * Frame intent - represents a container/layout.
 *
 * WHY: Frames with AutoLayout map to CSS flexbox,
 * enabling layout synchronization.
 */
export interface FrameIntent extends BaseIntent {
  type: 'FRAME';
  /** Fill color */
  fillTokenOrHex?: string;
  /** AutoLayout direction */
  layoutDirection?: 'horizontal' | 'vertical';
  /** Gap between children (itemSpacing in Figma) */
  gap?: number;
  /** Padding */
  padding?: number | { top: number; right: number; bottom: number; left: number };
}

/**
 * Union of all intent types.
 */
export type Intent = ButtonIntent | TextIntent | FrameIntent;

// =============================================================================
// INTENT MODEL
// =============================================================================

/**
 * A collection of intents representing a UI component or screen.
 *
 * WHY: Allows batch processing of multiple intent nodes
 * and maintains context about the source.
 */
export interface IntentModel {
  /** List of intent nodes to process */
  intents: Intent[];
  /** Source identifier (e.g., file path, component name) */
  source?: string;
  /** Timestamp when intent was generated */
  timestamp?: string;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for ButtonIntent
 */
export function isButtonIntent(intent: Intent): intent is ButtonIntent {
  return intent.type === 'BUTTON';
}

/**
 * Type guard for TextIntent
 */
export function isTextIntent(intent: Intent): intent is TextIntent {
  return intent.type === 'TEXT';
}

/**
 * Type guard for FrameIntent
 */
export function isFrameIntent(intent: Intent): intent is FrameIntent {
  return intent.type === 'FRAME';
}
