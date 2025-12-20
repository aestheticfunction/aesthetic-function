/**
 * @aesthetic-function/watcher - tokens/canonical/index.ts
 *
 * Canonical Token Layer exports (Phase 10E).
 *
 * This module provides a design-system-agnostic semantic vocabulary
 * that normalizes adapter-specific values into portable canonical tokens.
 */

// Types
export type {
  CanonicalColorToken,
  CanonicalSpacingToken,
  CanonicalRadiusToken,
  CanonicalTypographyToken,
  CanonicalToken,
  CanonicalSemanticValue,
  CanonicalColorSemantics,
  CanonicalSpacingSemantics,
  CanonicalRadiusSemantics,
  CanonicalTypographySemantics,
  CanonicalMeta,
  CanonicalSemantics,
  NormalizationNoteType,
  NormalizationNote,
  NormalizationResult,
  CanonicalHintMapper,
  HintMapperEntry,
} from './types.js';

// Normalization
export {
  normalizeToCanonical,
  normalizeColorToCanonical,
  isCanonicalToken,
  registerCanonicalHintMapper,
  clearHintMappers,
  getHintMappers,
  initializeDefaultHintMappers,
  type NormalizationContext,
} from './normalize.js';
