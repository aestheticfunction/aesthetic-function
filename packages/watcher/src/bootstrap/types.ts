/**
 * @aesthetic-function/watcher - bootstrap/types.ts
 *
 * Types for Component Map Bootstrap Artifacts (Phase 10D).
 *
 * WHY: Provides a safe, review-first workflow to bootstrap component-map.json
 * from existing Component Map Suggestions (Phase 10C). Generates deterministic,
 * auditable artifacts that humans can review before applying.
 *
 * ARCHITECTURE:
 * - Artifacts are JSON files written to design-materializations/
 * - Default mode is artifact-only (read-only)
 * - Apply mode requires explicit flags (MAP_BOOTSTRAP_MODE=apply, MAP_BOOTSTRAP_DRY_RUN=false)
 * - Never overwrites existing nodeIds
 *
 * EXPLICIT-ONLY VARIANT STATES (Phase 10C Rule):
 * - variantStatesSuggested derived ONLY from @figma state=X markers or design-overrides.json ::state keys
 * - Never inferred from semantics (disabled boolean, hover hints, etc.)
 */

// No external type imports needed - bootstrap types are self-contained

// =============================================================================
// POLICY TYPES
// =============================================================================

/**
 * How variant states are derived.
 * - explicit-only: From markers and overrides only (10C rule)
 */
export type VariantStatePolicy = 'explicit-only';

/**
 * What the bootstrap command writes.
 * - artifact-only: Write review artifact, never touch component-map.json
 * - apply: Merge into component-map.json (requires explicit flags)
 */
export type WritePolicy = 'artifact-only' | 'apply';

/**
 * Policy configuration for bootstrap artifact.
 */
export interface BootstrapPolicy {
  /** How variant states are derived */
  variantStates: VariantStatePolicy;
  /** What gets written */
  writes: WritePolicy;
}

// =============================================================================
// DIFF TYPES
// =============================================================================

/**
 * Variant mapping for bootstrap artifacts.
 * nodeId can be null to indicate manual fill required.
 */
export interface BootstrapVariantMapping {
  /** Figma node ID (null if needs manual fill) */
  nodeId: string | null;
}

/**
 * Figma mapping for bootstrap artifacts.
 * Allows null nodeIds to indicate manual fill required.
 */
export interface BootstrapFigmaMapping {
  /** Figma Component Set node ID (null if needs manual fill) */
  componentSetNodeId?: string | null;
  /** Display name of the component in Figma */
  name: string;
  /** Mapping of state → nodeId for variants */
  variants: Record<string, BootstrapVariantMapping>;
}

/**
 * Component entry for bootstrap artifacts.
 * Uses BootstrapFigmaMapping which allows null nodeIds.
 */
export interface BootstrapComponentEntry {
  /** Component key */
  componentKey?: string;
  /** Legacy keys for migration */
  legacyKeys?: string[];
  /** Figma mapping with nullable nodeIds */
  figma: BootstrapFigmaMapping;
}

/**
 * A partial component map for diff representation.
 * Uses BootstrapComponentEntry which allows null nodeIds.
 */
export interface PartialComponentMap {
  version: number;
  components: Record<string, BootstrapComponentEntry>;
}

/**
 * Before/after diff for a proposed entry.
 */
export interface BootstrapDiff {
  /** State before bootstrap (null if new entry) */
  before: PartialComponentMap | null;
  /** State after bootstrap would be applied */
  after: PartialComponentMap;
}

// =============================================================================
// PROPOSED ENTRY TYPES
// =============================================================================

/**
 * Status of a proposed entry.
 * - new: Component doesn't exist in map
 * - update: Component exists but has different suggestions
 */
export type ProposedStatus = 'new' | 'update';

/**
 * A proposed component map entry.
 */
export interface ProposedEntry {
  /** Component key (e.g., "auth/LoginButton") */
  componentKey: string;
  /** Suggested Figma name */
  figmaNameSuggestion: string;
  /** Suggested variant states (explicit-only) */
  variantStatesSuggested: string[];
  /** Status: new or update */
  status: ProposedStatus;
  /** Before/after diff */
  diff: BootstrapDiff;
  /**
   * Fields that require manual filling (node IDs).
   * Format: "figma.variants.base.nodeId", "figma.componentSetNodeId", etc.
   */
  manualFields: string[];
  /** Human-readable reason for this suggestion */
  reason: string;
}

/**
 * A skipped component entry.
 */
export interface SkippedEntry {
  /** Component key */
  componentKey: string;
  /** Reason for skipping */
  reason: string;
}

// =============================================================================
// ARTIFACT TYPE
// =============================================================================

/**
 * Component Map Bootstrap Artifact (Phase 10D).
 *
 * A deterministic, auditable artifact that proposes component-map.json entries.
 * Written to design-materializations/<file>.component-map-bootstrap.json
 */
export interface ComponentMapBootstrapArtifact {
  /** Schema version for migration support */
  version: 1;
  /** ISO timestamp when artifact was generated */
  generatedAt: string;
  /** Source file that was analyzed */
  file: string;
  /** Policy configuration */
  policy: BootstrapPolicy;
  /** Proposed new or updated entries */
  proposed: ProposedEntry[];
  /** Entries skipped (already present, etc.) */
  skipped: SkippedEntry[];
}

// =============================================================================
// BOOTSTRAP CONFIG
// =============================================================================

/**
 * Environment configuration for bootstrap behavior.
 */
export interface BootstrapConfig {
  /**
   * Mode: artifact-only or apply
   * Env: MAP_BOOTSTRAP_MODE
   * Default: artifact
   */
  mode: WritePolicy;
  /**
   * Dry run mode (apply mode only)
   * Env: MAP_BOOTSTRAP_DRY_RUN
   * Default: true
   */
  dryRun: boolean;
  /**
   * Write target for component-map.json
   * Env: MAP_BOOTSTRAP_WRITE_TARGET
   * Default: repo-root
   */
  writeTarget: 'repo-root';
}

/**
 * Default bootstrap configuration.
 */
export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  mode: 'artifact-only',
  dryRun: true,
  writeTarget: 'repo-root',
};

/**
 * Parse bootstrap configuration from environment variables.
 */
export function parseBootstrapConfig(): BootstrapConfig {
  const mode = process.env.MAP_BOOTSTRAP_MODE;
  const dryRun = process.env.MAP_BOOTSTRAP_DRY_RUN;

  return {
    mode: mode === 'apply' ? 'apply' : 'artifact-only',
    dryRun: dryRun !== 'false', // Default true, only false if explicitly "false"
    writeTarget: 'repo-root',
  };
}

// =============================================================================
// RESULT TYPE
// =============================================================================

/**
 * Result of the bootstrap operation.
 */
export interface BootstrapResult {
  /** The generated artifact */
  artifact: ComponentMapBootstrapArtifact;
  /** Path where artifact was written */
  artifactPath: string;
  /** Whether component-map.json was updated (apply mode only) */
  mapUpdated: boolean;
  /** Path to component-map.json (if updated) */
  mapPath?: string;
  /** Summary statistics */
  summary: BootstrapSummary;
}

/**
 * Summary statistics for CLI output.
 */
export interface BootstrapSummary {
  /** Number of suggestions read */
  suggestionsRead: number;
  /** Number of entries proposed */
  entriesProposed: number;
  /** Number of entries skipped */
  entriesSkipped: number;
  /** Number of fields needing manual fill */
  manualFieldsCount: number;
}
