/**
 * @aesthetic-function/watcher - reconciliationSources/types.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery Types.
 *
 * WHY: Defines types for discovering and chunking source files for
 * multi-source reconciliation in CI environments.
 *
 * SCOPE:
 * - Source discovery (glob, manifest)
 * - Deterministic chunking for matrix jobs
 * - Aggregation semantics
 *
 * CONSTRAINTS:
 * - Deterministic output (same inputs → same chunks)
 * - No changes to reconciliation semantics
 */

// =============================================================================
// MANIFEST FORMAT
// =============================================================================

/**
 * Source manifest file format.
 *
 * Located at repo root: reconcile.sources.json
 */
export interface SourceManifest {
  /**
   * Manifest version (for future compatibility).
   */
  version: 1;

  /**
   * List of source files to reconcile.
   * Must be repo-root relative paths.
   */
  sources: string[];

  /**
   * Optional ignore patterns (glob format).
   * Applied after sources are resolved.
   */
  ignore?: string[];
}

// =============================================================================
// DISCOVERY OPTIONS
// =============================================================================

/**
 * Options for discovering source files.
 */
export interface SourceDiscoveryOptions {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Glob pattern(s) for source discovery.
   * Repo-root relative.
   */
  glob?: string | string[];

  /**
   * Path to manifest file (relative to repo root).
   * @default 'reconcile.sources.json'
   */
  manifestPath?: string;

  /**
   * Explicit list of source files.
   * Overrides glob and manifest if provided.
   */
  sources?: string[];

  /**
   * Ignore patterns (glob format).
   */
  ignore?: string[];

  /**
   * Whether to filter to existing files only.
   * @default true
   */
  filterExisting?: boolean;
}

// =============================================================================
// DISCOVERY RESULT
// =============================================================================

/**
 * Result of source discovery.
 */
export interface SourceDiscoveryResult {
  /**
   * Discovered source files (canonical, sorted, de-duplicated).
   */
  sources: string[];

  /**
   * How sources were discovered.
   */
  method: 'manifest' | 'glob' | 'explicit' | 'empty';

  /**
   * Total count.
   */
  count: number;

  /**
   * Files that were filtered out (did not exist).
   */
  filtered?: string[];

  /**
   * Any warnings during discovery.
   */
  warnings?: string[];
}

// =============================================================================
// CHUNKING
// =============================================================================

/**
 * Chunk of sources for a matrix job.
 */
export interface SourceChunk {
  /**
   * Chunk index (0-based).
   */
  index: number;

  /**
   * Sources in this chunk.
   */
  sources: string[];

  /**
   * Total number of chunks.
   */
  total: number;
}

/**
 * Options for chunking sources.
 */
export interface ChunkingOptions {
  /**
   * Maximum sources per chunk.
   * @default 10
   */
  chunkSize?: number;

  /**
   * Minimum number of chunks (overrides chunkSize if needed).
   */
  minChunks?: number;

  /**
   * Maximum number of chunks.
   */
  maxChunks?: number;
}

/**
 * Result of chunking sources.
 */
export interface ChunkingResult {
  /**
   * Array of chunks.
   */
  chunks: SourceChunk[];

  /**
   * Chunk indices for matrix strategy.
   */
  indices: number[];

  /**
   * Total number of chunks.
   */
  totalChunks: number;

  /**
   * Total sources across all chunks.
   */
  totalSources: number;
}

// =============================================================================
// AGGREGATION
// =============================================================================

/**
 * Verdict from a single source reconcile run.
 */
export type SourceVerdict = 'PASS' | 'WARN' | 'FAIL';

/**
 * Result from a single source in the matrix.
 */
export interface SourceResult {
  /**
   * Source file path (canonical).
   */
  source: string;

  /**
   * Verdict for this source.
   */
  verdict: SourceVerdict;

  /**
   * Exit code from reconcile command.
   */
  exitCode: number;

  /**
   * Bundle artifact path (if written).
   */
  bundlePath?: string;

  /**
   * Stability score (if available).
   */
  stabilityScore?: number;
}

/**
 * Aggregated verdict across all sources.
 */
export interface AggregatedVerdict {
  /**
   * Overall verdict.
   * - FAIL if any source FAIL
   * - WARN if any source WARN and no FAIL
   * - PASS if all sources PASS
   */
  overall: SourceVerdict;

  /**
   * Counts by verdict.
   */
  counts: {
    pass: number;
    warn: number;
    fail: number;
  };

  /**
   * Total sources processed.
   */
  totalSources: number;

  /**
   * Git SHA for traceability.
   */
  gitSha?: string;

  /**
   * Individual source results.
   */
  results: SourceResult[];

  /**
   * Timestamp.
   */
  timestamp?: string;
}

// =============================================================================
// CLI OPTIONS
// =============================================================================

/**
 * CLI options for figma:sources command.
 */
export interface SourcesCliOptions {
  /**
   * Repository root.
   */
  repoRoot?: string;

  /**
   * Glob pattern.
   */
  glob?: string;

  /**
   * Path to manifest file.
   */
  manifestPath?: string;

  /**
   * Explicit source files.
   */
  sources?: string[];

  /**
   * Ignore patterns.
   */
  ignore?: string[];

  /**
   * Chunk size.
   */
  chunkSize?: number;

  /**
   * Chunk index to retrieve.
   */
  chunkIndex?: number;

  /**
   * Output only matrix indices.
   */
  matrixIndices?: boolean;

  /**
   * Output format.
   */
  output?: 'json' | 'list' | 'count';

  /**
   * Verbose output.
   */
  verbose?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default manifest file path.
 */
export const DEFAULT_MANIFEST_PATH = 'reconcile.sources.json';

/**
 * Default chunk size.
 */
export const DEFAULT_CHUNK_SIZE = 10;

/**
 * Default glob pattern for source files.
 */
export const DEFAULT_SOURCE_GLOB = '**/*.tsx';

/**
 * Default ignore patterns.
 */
export const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.git/**',
  '**/coverage/**',
  '**/__tests__/**',
  '**/__fixtures__/**',
  '**/*.test.tsx',
  '**/*.spec.tsx',
];
