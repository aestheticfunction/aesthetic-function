/**
 * @aesthetic-function/watcher - orchestrator/index.ts
 *
 * Public API for the Feature Orchestrator module.
 *
 * WHY: Phase 9A introduces Prompt → Code → Figma flow.
 * This module exports the orchestrator functions and types.
 */

// Main orchestrator function
export {
  featureFromPrompt,
  getPromptPatchArtifactPath,
  PROMPT_PATCH_SUFFIX,
} from './featureFromPrompt.js';

// System prompt
export {
  FEATURE_ORCHESTRATOR_SYSTEM_PROMPT,
  buildUserPrompt,
} from './systemPrompt.js';

// Types
export type {
  FeatureRequest,
  FeatureOptions,
  FeatureResult,
  ContextBundle,
  PromptPatchArtifact,
  PromptPatchChange,
  SkippedChange,
  ComponentState,
  TokenInfo,
} from './types.js';
