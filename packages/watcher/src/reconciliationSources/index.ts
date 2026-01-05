/**
 * @aesthetic-function/watcher - reconciliationSources/index.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery.
 *
 * Public exports for the reconciliationSources module.
 */

// Types
export type {
  SourceManifest,
  SourceDiscoveryOptions,
  SourceDiscoveryResult,
  SourceChunk,
  ChunkingOptions,
  ChunkingResult,
  SourceVerdict,
  SourceResult,
  AggregatedVerdict,
  SourcesCliOptions,
} from './types.js';

export {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_SOURCE_GLOB,
  DEFAULT_IGNORE_PATTERNS,
} from './types.js';

// Discovery
export {
  discoverSources,
  discoverSourcesJson,
  loadManifest,
  normalizePath,
  sortPaths,
  deduplicatePaths,
} from './discover.js';

// Chunking
export { chunkSources, getChunk, chunkIndicesJson } from './chunk.js';

// Aggregation
export {
  aggregateVerdicts,
  parseVerdict,
  createSourceResult,
  formatAggregationSummary,
  formatAggregationJson,
  verdictToExitCode,
} from './aggregate.js';

// CLI
export { runSourcesCli } from './cliSources.js';
