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
// AST WRITE TYPES (Phase 7A)
// =============================================================================

import type { SourceLocation, WriteSafetyReason } from '../ast/types.js';

/**
 * Operation type for AST writes.
 * Supports SET_TEXT, SET_FILL, and SET_LAYOUT operations.
 */
export type AstWriteOpType = 'SET_TEXT' | 'SET_FILL' | 'SET_LAYOUT';

/**
 * Layout property keys supported by SET_LAYOUT operations.
 * WHY: Only support numeric layout properties that map directly to CSS/Figma.
 */
export type LayoutKey = 'gap' | 'padding' | 'margin' | 'width' | 'height';

/**
 * A single AST write operation.
 * Represents a specific change to make in the source code.
 */
export interface AstWriteOp {
  /** Operation type */
  op: AstWriteOpType;
  /** Node name from @figma marker */
  nodeName: string;
  /** The value before the change */
  before: string;
  /** The value after the change (from design override) */
  after: string;
  /** Source location of the value to modify */
  loc: SourceLocation;
  /** Whether this operation can be auto-written */
  writable: boolean;
  /** Reason for writability classification */
  reason: WriteSafetyReason;
  /** Human-readable explanation */
  explanation: string;
  /** Layout property key (only for SET_LAYOUT operations) */
  layoutKey?: LayoutKey;
}

/**
 * Review artifact for AST patch mode.
 * Contains all proposed changes for review before applying.
 */
export interface AstPatchArtifact {
  /** File path this patch applies to */
  file: string;
  /** ISO timestamp when artifact was generated */
  generatedAt: string;
  /** All proposed changes (writable and not) */
  operations: AstWriteOp[];
  /** Summary statistics */
  summary: {
    /** Total operations proposed */
    total: number;
    /** Operations that can be auto-written */
    writable: number;
    /** Operations that cannot be auto-written */
    notWritable: number;
  };
}

/**
 * Result of an AST write operation.
 */
export interface AstWriteResult {
  /** Mode used ('patch' or 'write') */
  mode: 'patch' | 'write';
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Number of operations applied/would-be-applied */
  applied: number;
  /** Number of operations skipped (not writable) */
  skipped: number;
  /** Path to artifact written (for patch mode) */
  artifactPath?: string;
  /** Detailed operations */
  operations: AstWriteOp[];
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
