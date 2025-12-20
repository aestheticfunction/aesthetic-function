/**
 * @aesthetic-function/watcher - adapters/types.ts
 *
 * Type definitions for the Semantic Adapter Architecture (Phase 10A).
 *
 * WHY: Different UI frameworks (Vuetify, Ant Design, MUI, Chakra) have
 * framework-specific component semantics that generic JSX analysis cannot
 * capture. This adapter system allows framework-specific extractors to
 * augment the generic semantic pipeline without contaminating core logic.
 *
 * ARCHITECTURE:
 * - SemanticAdapter: Interface that framework adapters implement
 * - AdapterContext: Read-only context passed to adapters during extraction
 * - AdapterResult: Partial semantics with provenance tracking
 *
 * SCOPE: Read-only extraction only. Adapters MUST NOT:
 * - Modify source files
 * - Write markers or overrides
 * - Emit Figma operations
 * - Affect reconciliation logic
 */

import type * as t from '@babel/types';
import type {
  ComponentSemanticIntent,
  ConfidenceLevel,
  SourceLocation,
} from '../ast/types.js';

// =============================================================================
// ADAPTER CONTEXT
// =============================================================================

/**
 * Read-only context provided to adapters during extraction.
 *
 * Contains information about the file being analyzed and
 * any imports that might help identify framework usage.
 */
export interface AdapterContext {
  /** Path to the file being analyzed */
  filePath: string;

  /** Name of the component being analyzed (if known) */
  componentName?: string;

  /**
   * Import map: local name → import source
   *
   * Example:
   *   import { Button } from 'vuetify';
   *   → { 'Button': 'vuetify' }
   *
   * Not always available; adapters should not rely on this exclusively.
   */
  imports?: Record<string, string>;

  /**
   * The JSX element's tag name (e.g., 'v-btn', 'Button', 'div')
   */
  tagName?: string;
}

// =============================================================================
// ADAPTER RESULT
// =============================================================================

/**
 * Provenance information for adapter-extracted values.
 *
 * WHY: When merging adapter results with generic JSX semantics,
 * we need to know which adapter provided each value and with what confidence.
 */
export interface AdapterProvenance {
  /** ID of the adapter that extracted this value */
  adapterId: string;

  /** Confidence level for this extraction */
  confidence: ConfidenceLevel;

  /**
   * Reason for the extraction (for debugging/logging).
   * Example: "v-btn color prop", "v-card title slot"
   */
  reason?: string;
}

/**
 * A semantic value with adapter provenance.
 */
export interface AdapterSemanticValue<T> {
  /** The extracted value */
  value: T;

  /** Source location in the code */
  loc: SourceLocation;

  /** Provenance tracking for merge decisions */
  provenance: AdapterProvenance;
}

/**
 * Result of adapter extraction.
 *
 * Partial because adapters only extract fields they understand.
 * Fields not set by an adapter will not overwrite generic JSX semantics.
 */
export interface AdapterResult {
  /**
   * Extracted semantic intent (partial).
   * Only includes fields the adapter explicitly sets.
   */
  semantics: Partial<ComponentSemanticIntent>;

  /**
   * Adapter provenance for tracking.
   * Used for logging and debugging.
   */
  provenance: AdapterProvenance;

  /**
   * Additional framework-specific metadata (optional).
   * Not used in core pipeline but available for CLI output.
   */
  frameworkMetadata?: Record<string, unknown>;
}

// =============================================================================
// SEMANTIC ADAPTER INTERFACE
// =============================================================================

/**
 * Interface for framework-specific semantic adapters.
 *
 * LIFECYCLE:
 * 1. Registry calls `supports()` for each JSX element
 * 2. If supported, registry calls `extract()` to get semantics
 * 3. Registry merges adapter results with generic JSX semantics
 *
 * RULES:
 * - Adapters MUST be read-only (no side effects)
 * - Adapters MUST return partial semantics (only fields they own)
 * - Adapters SHOULD provide provenance for all extracted values
 * - Adapters MUST NOT erase fields they don't understand
 */
export interface SemanticAdapter {
  /**
   * Unique identifier for this adapter.
   * Used for provenance tracking and registry ordering.
   *
   * Convention: 'framework-name' (e.g., 'vuetify', 'antd', 'mui')
   */
  readonly id: string;

  /**
   * Human-readable name for CLI output.
   */
  readonly displayName: string;

  /**
   * Priority for execution order (lower = earlier).
   * Default: 100
   *
   * WHY: Some adapters may need to run before others.
   * Framework-specific adapters typically run after generic extractors.
   */
  readonly priority?: number;

  /**
   * Check if this adapter supports the given JSX element.
   *
   * @param node - The JSX element node from Babel AST
   * @param ctx - Read-only adapter context
   * @returns true if this adapter should extract semantics from this element
   */
  supports(node: t.JSXElement, ctx: AdapterContext): boolean;

  /**
   * Extract semantic intent from the JSX element.
   *
   * Only called if `supports()` returned true.
   *
   * @param node - The JSX element node from Babel AST
   * @param ctx - Read-only adapter context
   * @returns Partial semantic intent with provenance
   */
  extract(node: t.JSXElement, ctx: AdapterContext): AdapterResult;
}

// =============================================================================
// COMPONENT TAG MAPPING
// =============================================================================

/**
 * Maps a component tag to its semantic category.
 *
 * WHY: Vuetify uses 'v-btn', 'v-card' etc.
 * This allows adapters to define what tags they handle.
 */
export interface ComponentTagMapping {
  /** The tag name (e.g., 'v-btn') */
  tagName: string;

  /** Semantic category for this component */
  category: 'button' | 'card' | 'input' | 'chip' | 'text' | 'container' | 'other';

  /**
   * Props that map to specific semantic fields.
   * Example: { 'color': 'visual.fills', 'disabled': 'booleans.disabled' }
   */
  propMappings?: Record<string, string>;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Supported Vuetify component tag names (Phase 10A).
 */
export type VuetifyComponentTag = 'v-btn' | 'v-card' | 'v-text-field' | 'v-chip';

/**
 * Check if a tag name is a supported Vuetify component.
 */
export function isVuetifyTag(tagName: string): tagName is VuetifyComponentTag {
  return ['v-btn', 'v-card', 'v-text-field', 'v-chip'].includes(tagName);
}
