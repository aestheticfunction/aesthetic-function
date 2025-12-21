/**
 * @aesthetic-function/watcher - figmaSuggestions/index.ts
 *
 * Public API for Figma Composition Suggestions (Phase 11A).
 *
 * Exports:
 * - Types: FigmaSuggestion, FigmaSuggestionInput, FigmaSuggestionResult
 * - Generator: generateFigmaSuggestions
 */

// Types
export type {
  SuggestionType,
  SuggestionSource,
  SuggestionConfidence,
  FigmaSuggestion,
  FigmaSuggestionInput,
  FigmaSuggestionResult,
} from './types.js';

// Generator
export { generateFigmaSuggestions } from './generateSuggestions.js';
