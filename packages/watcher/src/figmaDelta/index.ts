/**
 * @aesthetic-function/watcher - figmaDelta/index.ts
 *
 * Phase 12A: Figma → Code Delta Extraction Module.
 *
 * Public exports for detecting explicit changes made in Figma
 * relative to a known baseline. This is read-only analysis only.
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX files
 * - Does NOT write or update markers
 * - Does NOT write design-overrides.json
 * - Does NOT generate apply operations
 * - Only writes delta artifacts for review
 */

// Types
export type {
  // Property types
  DeltaPropertyType,
  DeltaConfidence,
  // Core delta
  FigmaDelta,
  FigmaDeltaArtifact,
  DeltaArtifactMeta,
  // Input types
  BaselineValue,
  FigmaPropertyState,
  DeltaInput,
  BatchDeltaInput,
  // Output types
  DeltaOutput,
  BatchDeltaOutput,
  BatchDeltaSummary,
} from './types.js';

// Delta detection
export {
  resolveToCanonical,
  detectDeltaForProperty,
  generateDeltasForVariant,
  generateDeltas,
  isVariantTarget,
  filterVariantTargets,
} from './generateDeltas.js';

// Artifact writing
export {
  getRepoRoot,
  normalizeSourcePath,
  DEFAULT_ARTIFACT_DIR,
  generateDeltaArtifactName,
  getDeltaArtifactPath,
  buildDeltaArtifact,
  buildDeltaArtifacts,
  writeDeltaArtifact,
  writeDeltaArtifacts,
  buildCombinedArtifact,
  writeCombinedDeltaArtifact,
  type CombinedDeltaArtifact,
} from './artifact.js';
