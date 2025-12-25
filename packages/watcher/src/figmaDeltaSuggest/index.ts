/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/index.ts
 *
 * Phase 12B: Figma Delta → Code Suggestions Module.
 *
 * Public exports for converting Phase 12A deltas into actionable
 * suggestions for where changes should land.
 *
 * CONSTRAINTS:
 * - Does NOT modify TSX/JSX files
 * - Does NOT write or update markers
 * - Does NOT write design-overrides.json
 * - Does NOT emit Figma operations
 * - Only writes suggestion artifacts for review
 */

// Types
export type {
  SuggestionTarget,
  SuggestionKind,
  SuggestionEvidence,
  FigmaDeltaSuggestion,
  SuggestInput,
  SuggestOutput,
  SuggestSummary,
  SuggestionArtifact,
} from './types.js';

// Policy
export {
  isNonBaseState,
  NON_BASE_STATES,
  isValidVariantState,
  findAutoWritableValue,
  canSuggestAstWrite,
  chooseSuggestionTarget,
  type TargetSelectionContext,
  type TargetSelectionResult,
} from './policy.js';

// Suggestion generation
export { generateDeltaSuggestions } from './suggest.js';

// Artifact writing
export {
  getRepoRoot,
  normalizeSourcePath,
  DEFAULT_ARTIFACT_DIR,
  generateSuggestionArtifactName,
  getSuggestionArtifactPath,
  buildSuggestionArtifact,
  writeSuggestionArtifact,
} from './artifact.js';
