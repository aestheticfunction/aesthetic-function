/**
 * @aesthetic-function/watcher - compose/index.ts
 *
 * Phase 11B: Controlled Figma Composition Application (Opt-In, Auditable).
 *
 * WHY: This module transforms Phase 11A read-only suggestions into
 * typed, auditable compose operations that can be optionally applied
 * to Figma with explicit user opt-in.
 *
 * EXPORTS:
 * - Types: ComposeConfig, ComposeMode, ComposeResult, etc.
 * - Config: loadComposeConfig, DEFAULT_COMPOSE_CONFIG
 * - Transform: composeFromSuggestions, filterComposeOpsByAllowList
 * - Artifact: writeComposeArtifact, generateArtifactPath
 *
 * FEATURE FLAGS:
 * - FIGMA_COMPOSE_ON: Master switch (default: false)
 * - FIGMA_COMPOSE_MODE: off | dry-run | apply (default: off)
 * - FIGMA_COMPOSE_ALLOW: Comma-separated allow types (default: empty)
 */

// Types
export type {
  ComposeMode,
  ComposeAllowType,
  ComposeConfig,
  ComposeInput,
  ComposeResult,
  ComposeArtifactMeta,
} from './types.js';

// Re-export shared types
export type {
  ComposeOperation,
  ComposeArtifact,
  ComposeOpType,
  ComposePayload,
  ComposeOperationResult,
} from '@aesthetic-function/shared';

// Config
export {
  loadComposeConfig,
  createTestConfig,
  DEFAULT_COMPOSE_CONFIG,
} from './config.js';

// Transform
export {
  composeFromSuggestions,
  filterComposeOpsByAllowList,
} from './composeFromSuggestions.js';

// Artifact
export {
  generateBaseName,
  getArtifactDir,
  generateArtifactPath,
  generateArtifactMeta,
  buildComposeArtifact,
  writeComposeArtifact,
  writeComposeResult,
  updateArtifactWithResults,
} from './artifact.js';
