/**
 * @aesthetic-function/watcher - reconciliationReconcile/index.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI - Public API.
 * Phase 14B: Profile support (deterministic flag presets).
 *
 * WHY: Provides a single command that runs the core Phase 12-13 read-only
 * analysis sequence for a single source file, producing a bundle artifact.
 *
 * WHAT:
 * - Orchestrates status, index, timeline, drift, and dashboard steps
 * - Produces single bundle artifact linking all outputs
 * - Deterministic step ordering
 * - Named profiles for common flag presets
 * - Repo-root invariant
 *
 * SCOPE:
 * - Orchestration + artifact plumbing only
 * - Profiles are pure configuration, not behavior invention
 *
 * CONSTRAINTS:
 * - Read-only by default
 * - Deterministic output
 * - Small surface area
 */

// Types
export type {
  ReconcileStepId,
  ReconcileMode,
  ReconcileProfile,
  ReconcileProfileConfig,
  ReconcileCliOptions,
  ReconcileStepResult,
  ReconcileCiVerdict,
  ReconcileOverall,
  ReconcileBundleArtifact,
  ReconcileResult,
} from './types.js';

export { RECONCILE_STEP_ORDER, VALID_PROFILES } from './types.js';

// Profiles
export {
  PROFILE_CONFIGS,
  expandProfile,
  mergeWithOverrides,
  resolveProfileConfig,
} from './profiles.js';

// Compute
export {
  runReconcile,
  getRepoRoot,
  normalizeSourcePath,
} from './compute.js';

// Artifact
export {
  getBundleArtifactPath,
  writeBundleArtifact,
  formatBundle,
  formatBundleVerbose,
} from './artifact.js';

export type { WriteBundleResult } from './artifact.js';

// CLI
export { main as cliMain } from './cliReconcile.js';
