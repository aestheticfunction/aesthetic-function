/**
 * @aesthetic-function/shared - surfaceMetadata.ts
 *
 * Phase 16A Extension: Surface Classification Metadata.
 *
 * WHY: AF integrates with external UI surfaces (design tools, runtimes,
 * generators, inspection sources). This module provides a taxonomy to
 * classify those surfaces along four independent dimensions — without
 * introducing any new authority into reconciliation.
 *
 * This is a DESCRIPTOR LAYER ONLY. It does not affect:
 * - Reconciliation logic or precedence (override > marker > ast > code)
 * - Adapter execution order or merge rules
 * - Runtime boundaries (watcher → server → plugin)
 * - Mutation authority (AF is the sole mutator)
 *
 * DESIGN PRINCIPLE: Each dimension is independent. They must NOT be conflated.
 * - Surface type: what kind of UI surface
 * - Access mode: whether the adapter can mutate anything
 * - Authority role: whether AF treats it as authoritative
 * - Stability: how close the data is to canonical system state
 */

// =============================================================================
// SURFACE TYPE — What kind of UI surface this represents
// =============================================================================

/**
 * Classification of the external UI surface an adapter connects to.
 *
 * - "design": Design tool (Figma, Penpot, Sketch, etc.)
 * - "runtime": Framework runtime or code analysis (Vuetify, AntD, Storybook, AST)
 * - "generation": AI/code generation source (UXPilot, v0, etc.)
 * - "inspection": Observation/monitoring tool (DevTools, visual regression, etc.)
 * - "contract": Declared design-system contract artifact (e.g., a dspack file) —
 *   versioned and reviewed in source control, not a live tool
 */
export type SurfaceType =
  | 'design'
  | 'runtime'
  | 'generation'
  | 'inspection'
  | 'contract';

// =============================================================================
// ACCESS MODE — Whether the adapter can mutate anything
// =============================================================================

/**
 * The mutation capability AF exposes through this adapter.
 *
 * - "read-only": Adapter can only read data from the external surface
 * - "no-mutation": Adapter has no mutation capability by design
 * - "internal-write": Only valid for internal AF components, NOT external adapters
 */
export type AccessMode =
  | 'read-only'
  | 'no-mutation'
  | 'internal-write';

// =============================================================================
// AUTHORITY ROLE — Whether AF treats it as authoritative
// =============================================================================

/**
 * Whether AF considers this adapter's data authoritative for reconciliation.
 *
 * - "external-non-authoritative": Data is informational only, never drives reconciliation
 * - "internal-authoritative": Reserved for internal AF components (NOT applicable to adapters)
 */
export type AuthorityRole =
  | 'external-non-authoritative'
  | 'internal-authoritative';

// =============================================================================
// STABILITY LEVEL — How close the data is to canonical system state
// =============================================================================

/**
 * How stable/canonical the adapter's data is.
 *
 * - "canonical": Matches the system's canonical state (e.g., resolved tokens)
 * - "derived": Computed or inferred from source material (e.g., AST extraction)
 * - "observational": Point-in-time snapshot, may change without notice (e.g., Figma live state)
 */
export type StabilityLevel =
  | 'canonical'
  | 'derived'
  | 'observational';

// =============================================================================
// SURFACE METADATA — Combined descriptor
// =============================================================================

/**
 * Surface classification metadata for an adapter.
 *
 * Attached to adapter instances to categorize the external surface they
 * connect to. This is a read-only descriptor that does NOT influence
 * reconciliation, execution order, or adapter behavior.
 *
 * Each field represents an independent dimension. They must not be conflated.
 */
export interface SurfaceMetadata {
  /** What kind of UI surface this adapter connects to */
  surfaceType: SurfaceType;

  /** Whether the adapter can mutate the external surface */
  accessMode: AccessMode;

  /** Whether AF treats this adapter's data as authoritative */
  authorityRole: AuthorityRole;

  /** How stable/canonical the adapter's data is */
  stability: StabilityLevel;
}
