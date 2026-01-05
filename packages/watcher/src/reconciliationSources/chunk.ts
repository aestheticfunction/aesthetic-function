/**
 * @aesthetic-function/watcher - reconciliationSources/chunk.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery.
 *
 * WHY: Provides deterministic chunking of source files for matrix CI execution.
 *
 * SCOPE:
 * - Split sources into deterministic chunks
 * - Support min/max chunk constraints
 * - Output chunk indices for GitHub Actions matrix
 *
 * CONSTRAINTS:
 * - Deterministic chunking (same inputs → same chunks)
 * - Balanced distribution
 */

import type { SourceChunk, ChunkingOptions, ChunkingResult } from './types.js';
import { DEFAULT_CHUNK_SIZE } from './types.js';

// =============================================================================
// CHUNKING LOGIC
// =============================================================================

/**
 * Calculate optimal chunk count based on options.
 */
function calculateChunkCount(
  sourceCount: number,
  options: ChunkingOptions
): number {
  const { chunkSize = DEFAULT_CHUNK_SIZE, minChunks, maxChunks } = options;

  if (sourceCount === 0) return 0;

  // Calculate natural chunk count
  let chunks = Math.ceil(sourceCount / chunkSize);

  // Apply min constraint
  if (minChunks !== undefined && chunks < minChunks) {
    chunks = minChunks;
  }

  // Apply max constraint
  if (maxChunks !== undefined && chunks > maxChunks) {
    chunks = maxChunks;
  }

  // Never more chunks than sources
  if (chunks > sourceCount) {
    chunks = sourceCount;
  }

  return Math.max(1, chunks);
}

/**
 * Chunk sources into balanced groups.
 *
 * Uses balanced distribution to avoid having one tiny final chunk.
 * For example, 10 sources with chunk size 3:
 * - Naive: [3, 3, 3, 1] = 4 chunks (last chunk tiny)
 * - Balanced: [4, 3, 3] = 3 chunks (evenly distributed)
 *
 * @param sources - List of source paths (assumed pre-sorted)
 * @param options - Chunking options
 * @returns Chunking result with chunks and indices
 */
export function chunkSources(
  sources: string[],
  options: ChunkingOptions = {}
): ChunkingResult {
  const totalSources = sources.length;

  if (totalSources === 0) {
    return {
      chunks: [],
      indices: [],
      totalChunks: 0,
      totalSources: 0,
    };
  }

  const chunkCount = calculateChunkCount(totalSources, options);

  // Calculate base size and how many chunks get an extra item
  const baseSize = Math.floor(totalSources / chunkCount);
  const remainder = totalSources % chunkCount;

  const chunks: SourceChunk[] = [];
  let offset = 0;

  for (let i = 0; i < chunkCount; i++) {
    // First `remainder` chunks get one extra item
    const size = i < remainder ? baseSize + 1 : baseSize;
    const chunkSources = sources.slice(offset, offset + size);

    chunks.push({
      index: i,
      sources: chunkSources,
      total: chunkCount,
    });

    offset += size;
  }

  return {
    chunks,
    indices: chunks.map((c) => c.index),
    totalChunks: chunkCount,
    totalSources,
  };
}

/**
 * Get a specific chunk by index.
 *
 * @param sources - Full list of sources
 * @param chunkIndex - 0-based chunk index
 * @param options - Chunking options
 * @returns The specific chunk, or null if index out of range
 */
export function getChunk(
  sources: string[],
  chunkIndex: number,
  options: ChunkingOptions = {}
): SourceChunk | null {
  const result = chunkSources(sources, options);
  return result.chunks[chunkIndex] ?? null;
}

/**
 * Generate chunk indices as JSON array string.
 * Useful for GitHub Actions matrix generation.
 */
export function chunkIndicesJson(
  sourceCount: number,
  options: ChunkingOptions = {}
): string {
  // Create a dummy array just to calculate chunk count
  const dummySources = Array(sourceCount).fill('');
  const result = chunkSources(dummySources, options);
  return JSON.stringify(result.indices);
}
