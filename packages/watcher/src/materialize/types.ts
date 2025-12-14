/**
 * @aesthetic-function/watcher - materialize/types.ts
 *
 * Types for design → code materialization.
 *
 * WHY: Defines the structure of materialization artifacts and changes.
 * These types support both patch-based artifacts (for later review/apply)
 * and marker-based edits (direct source file updates).
 */

// =============================================================================
// CHANGE TYPES
// =============================================================================

/**
 * Represents the before/after state for a single field.
 */
export interface FieldChange {
  /** Value from code (marker or LLM-extracted) */
  before: string | undefined;
  /** Value from design override */
  after: string;
}

/**
 * A single materialization change for a node.
 * Captures what would change when applying a design override to code.
 */
export interface MaterializeChange {
  /** Node name (matches @figma node=...) */
  node: string;
  /** Figma node ID from override */
  nodeId: string;
  /** Source of the override */
  source: 'design-overrides.json';
  /** Text change if applicable */
  text?: FieldChange;
  /** Fill change if applicable */
  fill?: FieldChange;
}

/**
 * Result of preparing materialization for a file.
 */
export interface MaterializePrepareResult {
  /** Relative file path */
  file: string;
  /** Changes that can be applied */
  changes: MaterializeChange[];
  /** Node names that have overrides but no matching marker */
  unapplied: string[];
}

// =============================================================================
// PATCH ARTIFACT TYPES
// =============================================================================

/**
 * Change entry in a patch artifact file.
 * Simplified format for JSON serialization.
 */
export interface PatchChange {
  /** Node name */
  node: string;
  /** Before state */
  before: {
    text?: string;
    fill?: string;
  };
  /** After state (from override) */
  after: {
    text?: string;
    fill?: string;
  };
  /** Source of override */
  source: string;
  /** Figma node ID */
  nodeId: string;
}

/**
 * Patch artifact file structure.
 * Written to design-materializations/<path>.patch.json
 */
export interface PatchArtifact {
  /** Relative file path this patch applies to */
  file: string;
  /** ISO timestamp when patch was generated */
  generatedAt: string;
  /** List of changes */
  changes: PatchChange[];
}

// =============================================================================
// MARKER EDIT TYPES
// =============================================================================

/**
 * A single marker line edit.
 */
export interface MarkerEdit {
  /** 1-based line number */
  lineNumber: number;
  /** Original line content */
  originalLine: string;
  /** New line content after edit */
  newLine: string;
  /** Node name from the marker */
  nodeName: string;
}

/**
 * Result of computing marker edits for a file.
 */
export interface MarkerEditResult {
  /** File path */
  file: string;
  /** Edits to apply */
  edits: MarkerEdit[];
  /** Node names with overrides but no matching marker in this file */
  unapplied: string[];
}

// =============================================================================
// MATERIALIZATION RESULT
// =============================================================================

/**
 * Result of a materialization operation.
 */
export interface MaterializeResult {
  /** Mode used ('patch' or 'markers') */
  mode: 'patch' | 'markers';
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Number of changes applied/would-be-applied */
  changes: number;
  /** Number of overrides that couldn't be applied */
  unapplied: number;
  /** Path to artifact written (for patch mode) */
  artifactPath?: string;
  /** Detailed edits (for markers mode) */
  edits?: MarkerEdit[];
}
