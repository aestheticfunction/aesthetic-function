/**
 * @aesthetic-function/watcher - reconciliationSources/__tests__/chunk.test.ts
 *
 * Phase 14F: Tests for deterministic chunking logic.
 */

import { describe, it, expect } from 'vitest';

import { chunkSources, getChunk, chunkIndicesJson } from '../chunk.js';

// =============================================================================
// CHUNKING TESTS
// =============================================================================

describe('chunkSources', () => {
  describe('basic chunking', () => {
    it('returns empty result for empty sources', () => {
      const result = chunkSources([]);
      expect(result.chunks).toEqual([]);
      expect(result.totalChunks).toBe(0);
      expect(result.totalSources).toBe(0);
    });

    it('creates single chunk for small source list', () => {
      const sources = ['a.tsx', 'b.tsx', 'c.tsx'];
      const result = chunkSources(sources, { chunkSize: 10 });

      expect(result.totalChunks).toBe(1);
      expect(result.chunks[0].sources).toEqual(sources);
    });

    it('creates multiple chunks when needed', () => {
      const sources = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx', 'e.tsx'];
      const result = chunkSources(sources, { chunkSize: 2 });

      expect(result.totalChunks).toBe(3);
      expect(result.chunks[0].sources).toEqual(['a.tsx', 'b.tsx']);
      expect(result.chunks[1].sources).toEqual(['c.tsx', 'd.tsx']);
      expect(result.chunks[2].sources).toEqual(['e.tsx']);
    });
  });

  describe('balanced distribution', () => {
    it('distributes sources evenly', () => {
      // 10 sources, chunk size 3 → naive would be [3,3,3,1], balanced should be [4,3,3]
      const sources = Array.from({ length: 10 }, (_, i) => `${i}.tsx`);
      const result = chunkSources(sources, { chunkSize: 3 });

      // Should have 4 chunks (ceil(10/3))
      expect(result.totalChunks).toBe(4);

      // Sizes should be balanced: 3,3,2,2 or similar
      const sizes = result.chunks.map((c) => c.sources.length);
      const minSize = Math.min(...sizes);
      const maxSize = Math.max(...sizes);

      // Difference between min and max should be at most 1
      expect(maxSize - minSize).toBeLessThanOrEqual(1);
    });

    it('handles exact division', () => {
      const sources = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx'];
      const result = chunkSources(sources, { chunkSize: 2 });

      expect(result.totalChunks).toBe(2);
      expect(result.chunks[0].sources.length).toBe(2);
      expect(result.chunks[1].sources.length).toBe(2);
    });
  });

  describe('chunk constraints', () => {
    it('respects minChunks', () => {
      const sources = ['a.tsx', 'b.tsx'];
      const result = chunkSources(sources, { chunkSize: 10, minChunks: 4 });

      // Can't have more chunks than sources
      expect(result.totalChunks).toBe(2);
    });

    it('respects maxChunks', () => {
      const sources = Array.from({ length: 100 }, (_, i) => `${i}.tsx`);
      const result = chunkSources(sources, { chunkSize: 5, maxChunks: 3 });

      expect(result.totalChunks).toBe(3);
    });
  });

  describe('determinism', () => {
    it('produces same chunks for same input', () => {
      const sources = ['z.tsx', 'a.tsx', 'm.tsx', 'b.tsx'];

      const result1 = chunkSources(sources, { chunkSize: 2 });
      const result2 = chunkSources(sources, { chunkSize: 2 });

      expect(result1.chunks).toEqual(result2.chunks);
    });

    it('chunk indices are sequential', () => {
      const sources = Array.from({ length: 15 }, (_, i) => `${i}.tsx`);
      const result = chunkSources(sources, { chunkSize: 4 });

      const indices = result.chunks.map((c) => c.index);
      expect(indices).toEqual([0, 1, 2, 3]);
    });
  });

  describe('chunk metadata', () => {
    it('includes total in each chunk', () => {
      const sources = ['a.tsx', 'b.tsx', 'c.tsx'];
      const result = chunkSources(sources, { chunkSize: 2 });

      for (const chunk of result.chunks) {
        expect(chunk.total).toBe(result.totalChunks);
      }
    });
  });
});

describe('getChunk', () => {
  it('returns specific chunk by index', () => {
    const sources = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx'];
    const chunk = getChunk(sources, 1, { chunkSize: 2 });

    expect(chunk).not.toBeNull();
    expect(chunk!.sources).toEqual(['c.tsx', 'd.tsx']);
  });

  it('returns null for out-of-range index', () => {
    const sources = ['a.tsx', 'b.tsx'];
    const chunk = getChunk(sources, 99, { chunkSize: 10 });

    expect(chunk).toBeNull();
  });
});

describe('chunkIndicesJson', () => {
  it('returns JSON array of indices', () => {
    const json = chunkIndicesJson(10, { chunkSize: 3 });
    const indices = JSON.parse(json);

    expect(Array.isArray(indices)).toBe(true);
    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it('returns empty array for zero sources', () => {
    const json = chunkIndicesJson(0);
    expect(JSON.parse(json)).toEqual([]);
  });
});
