/**
 * @aesthetic-function/watcher - bootstrap/index.ts
 *
 * Component Map Bootstrap module (Phase 10D).
 *
 * Provides a safe, review-first workflow to bootstrap component-map.json
 * from existing Component Map Suggestions (Phase 10C).
 *
 * Features:
 * - Generates deterministic, auditable artifacts
 * - Default mode is artifact-only (read-only)
 * - Apply mode requires explicit flags
 * - Never overwrites existing node IDs
 * - Respects explicit-only variant state policy
 */

export * from './types.js';
export * from './generateBootstrapArtifact.js';
export * from './mergeBootstrap.js';
