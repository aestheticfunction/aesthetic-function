/**
 * @aesthetic-function/watcher - compose/types.ts
 *
 * Phase 11B Compose Types (local to watcher).
 *
 * WHY: Defines configuration and allow-list types for controlled
 * Figma composition. Uses feature flags to control behavior.
 *
 * SCOPE: Configuration types only. Actual compose operations
 * are defined in @aesthetic-function/shared.
 */

import type { ComposeOperation, ComposeArtifact } from '@aesthetic-function/shared';

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Compose execution mode.
 *
 * - 'off': Compose disabled, no operations generated
 * - 'dry-run': Operations generated but not applied
 * - 'apply': Operations generated and applied to Figma
 */
export type ComposeMode = 'off' | 'dry-run' | 'apply';

/**
 * Allowed operation types for compose.
 * Controls which operation types can be applied.
 */
export type ComposeAllowType = 'component-set' | 'variant' | 'property';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Compose configuration from environment/flags.
 */
export interface ComposeConfig {
  /**
   * Execution mode.
   * Env: FIGMA_COMPOSE_MODE (default: 'off')
   */
  mode: ComposeMode;

  /**
   * Allowed operation types.
   * Env: FIGMA_COMPOSE_ALLOW (default: [])
   */
  allow: ComposeAllowType[];

  /**
   * Master switch for compose.
   * Env: FIGMA_COMPOSE_ON (default: false)
   */
  enabled: boolean;

  /**
   * Server URL for compose endpoint.
   * Env: FIGMA_COMPOSE_SERVER (default: 'http://localhost:3001')
   */
  serverUrl: string;
}

// =============================================================================
// COMPOSE INPUT
// =============================================================================

/**
 * Input for generating compose operations from suggestions.
 */
export interface ComposeInput {
  /**
   * Suggestions from Phase 11A.
   */
  suggestions: import('../figmaSuggestions/types.js').FigmaSuggestion[];

  /**
   * Source file path (for artifact naming).
   */
  sourceFile: string;

  /**
   * Compose configuration.
   */
  config: ComposeConfig;
}

// =============================================================================
// COMPOSE OUTPUT
// =============================================================================

/**
 * Result of composing operations from suggestions.
 */
export interface ComposeResult {
  /**
   * Generated operations (filtered by allow list).
   */
  operations: ComposeOperation[];

  /**
   * Operations that were filtered out.
   */
  filtered: ComposeOperation[];

  /**
   * Count by operation type.
   */
  countByType: Record<string, number>;

  /**
   * Total operations generated (before filtering).
   */
  totalGenerated: number;

  /**
   * Total operations after filtering.
   */
  totalAllowed: number;

  /**
   * Execution mode used.
   */
  mode: ComposeMode;
}

// =============================================================================
// ARTIFACT TYPES
// =============================================================================

/**
 * Artifact file naming conventions.
 */
export interface ComposeArtifactMeta {
  /**
   * Base name derived from source file.
   * Example: 'demo-app__src__App'
   */
  baseName: string;

  /**
   * Full artifact file path.
   */
  artifactPath: string;

  /**
   * Timestamp for versioning.
   */
  timestamp: string;
}

// Re-export shared types for convenience
export type { ComposeOperation, ComposeArtifact };
