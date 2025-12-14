/**
 * @aesthetic-function/watcher - reconcile/types.ts
 *
 * Types for design-overrides.json and reconciliation.
 *
 * WHY: Defines the structure of design overrides captured from Figma.
 * These overrides are applied to the IntentModel before transforming
 * to Figma operations, creating a closed feedback loop.
 */

// =============================================================================
// DESIGN OVERRIDE TYPES
// =============================================================================

/**
 * A single design override entry.
 * Captured from Figma when user clicks "Send Selection".
 */
export interface DesignOverride {
  /** Figma node ID */
  nodeId: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Overridden text content (for TEXT/BUTTON nodes) */
  text?: string;
  /** Overridden fill color as hex (for any node with fill) */
  fill?: string;
}

/**
 * The complete design-overrides.json structure.
 * Keys are node names (e.g., "LoginButton", "WelcomeText").
 */
export type DesignOverrides = Record<string, DesignOverride>;

// =============================================================================
// RECONCILIATION RESULT
// =============================================================================

/**
 * Result of applying overrides to an IntentModel.
 * Used for logging and auditing.
 */
export interface ReconcileResult {
  /** Number of overrides that matched intents */
  matched: number;
  /** Number of overrides that had no matching intent */
  ignored: number;
  /** Number of overrides skipped due to precedence (stale vs code) */
  stale: number;
  /** Names of nodes that were overridden */
  overriddenNodes: string[];
  /** Names of override keys that had no matching intent */
  ignoredKeys: string[];
  /** Names of override keys that were stale (older than code) */
  staleKeys: string[];
}
