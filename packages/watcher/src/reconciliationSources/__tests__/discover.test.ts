/**
 * @aesthetic-function/watcher - reconciliationSources/__tests__/discover.test.ts
 *
 * Phase 14F: Tests for deterministic source discovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverSources,
  loadManifest,
  normalizePath,
  sortPaths,
  deduplicatePaths,
} from '../discover.js';
import { DEFAULT_MANIFEST_PATH } from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

let testDir: string;

function createTestFile(relativePath: string, content: string = ''): void {
  const fullPath = join(testDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content);
}

beforeEach(() => {
  testDir = join(tmpdir(), `reconcile-sources-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// =============================================================================
// PATH UTILITY TESTS
// =============================================================================

describe('normalizePath', () => {
  it('normalizes absolute path to repo-relative', () => {
    const result = normalizePath('/repo/src/App.tsx', '/repo');
    expect(result).toBe('src/App.tsx');
  });

  it('normalizes relative path', () => {
    const result = normalizePath('./src/App.tsx', '/repo');
    expect(result).toBe('src/App.tsx');
  });

  it('strips leading ./', () => {
    const result = normalizePath('./foo.tsx', '/repo');
    expect(result).toBe('foo.tsx');
  });
});

describe('sortPaths', () => {
  it('sorts lexicographically', () => {
    const paths = ['z.tsx', 'a.tsx', 'm.tsx'];
    expect(sortPaths(paths)).toEqual(['a.tsx', 'm.tsx', 'z.tsx']);
  });

  it('sorts nested paths correctly', () => {
    const paths = ['src/z.tsx', 'lib/a.tsx', 'src/a.tsx'];
    expect(sortPaths(paths)).toEqual(['lib/a.tsx', 'src/a.tsx', 'src/z.tsx']);
  });

  it('is deterministic', () => {
    const paths = ['c.tsx', 'a.tsx', 'b.tsx'];
    const result1 = sortPaths(paths);
    const result2 = sortPaths(paths);
    expect(result1).toEqual(result2);
  });
});

describe('deduplicatePaths', () => {
  it('removes duplicates preserving first occurrence', () => {
    const paths = ['a.tsx', 'b.tsx', 'a.tsx', 'c.tsx'];
    expect(deduplicatePaths(paths)).toEqual(['a.tsx', 'b.tsx', 'c.tsx']);
  });

  it('handles empty array', () => {
    expect(deduplicatePaths([])).toEqual([]);
  });
});

// =============================================================================
// MANIFEST LOADING TESTS
// =============================================================================

describe('loadManifest', () => {
  it('returns null if manifest does not exist', () => {
    const result = loadManifest(testDir);
    expect(result).toBeNull();
  });

  it('loads valid manifest', () => {
    const manifest = {
      version: 1,
      sources: ['src/App.tsx', 'src/Card.tsx'],
    };
    createTestFile(DEFAULT_MANIFEST_PATH, JSON.stringify(manifest));

    const result = loadManifest(testDir);
    expect(result).toEqual(manifest);
  });

  it('throws on invalid version', () => {
    const manifest = { version: 99, sources: [] };
    createTestFile(DEFAULT_MANIFEST_PATH, JSON.stringify(manifest));

    expect(() => loadManifest(testDir)).toThrow('Unsupported manifest version');
  });

  it('throws on invalid JSON', () => {
    createTestFile(DEFAULT_MANIFEST_PATH, 'not json');

    expect(() => loadManifest(testDir)).toThrow('Failed to load manifest');
  });
});

// =============================================================================
// DISCOVERY TESTS
// =============================================================================

describe('discoverSources', () => {
  describe('explicit sources', () => {
    it('uses explicit sources when provided', () => {
      createTestFile('src/a.tsx', '');
      createTestFile('src/b.tsx', '');

      const result = discoverSources({
        repoRoot: testDir,
        sources: ['src/a.tsx', 'src/b.tsx'],
      });

      expect(result.method).toBe('explicit');
      expect(result.sources).toEqual(['src/a.tsx', 'src/b.tsx']);
    });

    it('filters non-existent explicit sources', () => {
      createTestFile('src/a.tsx', '');

      const result = discoverSources({
        repoRoot: testDir,
        sources: ['src/a.tsx', 'src/missing.tsx'],
      });

      expect(result.sources).toEqual(['src/a.tsx']);
      expect(result.filtered).toContain('src/missing.tsx');
    });
  });

  describe('glob discovery', () => {
    it('finds files matching glob pattern', () => {
      createTestFile('src/App.tsx', '');
      createTestFile('src/Card.tsx', '');
      createTestFile('src/utils.ts', '');

      const result = discoverSources({
        repoRoot: testDir,
        glob: '**/*.tsx',
      });

      expect(result.method).toBe('glob');
      expect(result.sources).toContain('src/App.tsx');
      expect(result.sources).toContain('src/Card.tsx');
      expect(result.sources).not.toContain('src/utils.ts');
    });

    it('respects ignore patterns', () => {
      createTestFile('src/App.tsx', '');
      createTestFile('node_modules/pkg/index.tsx', '');

      const result = discoverSources({
        repoRoot: testDir,
        glob: '**/*.tsx',
        ignore: ['node_modules/**'],
      });

      expect(result.sources).toContain('src/App.tsx');
      expect(result.sources).not.toContain('node_modules/pkg/index.tsx');
    });
  });

  describe('manifest discovery', () => {
    it('uses manifest when no glob or explicit sources', () => {
      createTestFile('src/App.tsx', '');
      createTestFile('src/Card.tsx', '');
      createTestFile(
        DEFAULT_MANIFEST_PATH,
        JSON.stringify({
          version: 1,
          sources: ['src/App.tsx', 'src/Card.tsx'],
        })
      );

      const result = discoverSources({
        repoRoot: testDir,
      });

      expect(result.method).toBe('manifest');
      expect(result.sources).toEqual(['src/App.tsx', 'src/Card.tsx']);
    });

    it('applies manifest ignore patterns', () => {
      createTestFile('src/App.tsx', '');
      createTestFile('src/internal/Secret.tsx', '');
      createTestFile(
        DEFAULT_MANIFEST_PATH,
        JSON.stringify({
          version: 1,
          sources: ['src/App.tsx', 'src/internal/Secret.tsx'],
          ignore: ['src/internal/**'],
        })
      );

      const result = discoverSources({
        repoRoot: testDir,
      });

      expect(result.sources).toEqual(['src/App.tsx']);
    });
  });

  describe('determinism', () => {
    it('produces same output for same inputs', () => {
      createTestFile('src/z.tsx', '');
      createTestFile('src/a.tsx', '');
      createTestFile('src/m.tsx', '');

      const result1 = discoverSources({
        repoRoot: testDir,
        glob: '**/*.tsx',
      });

      const result2 = discoverSources({
        repoRoot: testDir,
        glob: '**/*.tsx',
      });

      expect(result1.sources).toEqual(result2.sources);
    });

    it('sorts output lexicographically', () => {
      createTestFile('src/z.tsx', '');
      createTestFile('lib/a.tsx', '');
      createTestFile('src/a.tsx', '');

      const result = discoverSources({
        repoRoot: testDir,
        glob: '**/*.tsx',
      });

      expect(result.sources).toEqual(['lib/a.tsx', 'src/a.tsx', 'src/z.tsx']);
    });

    it('deduplicates sources', () => {
      createTestFile('src/App.tsx', '');

      const result = discoverSources({
        repoRoot: testDir,
        sources: ['src/App.tsx', './src/App.tsx', 'src/../src/App.tsx'],
      });

      expect(result.sources).toEqual(['src/App.tsx']);
    });
  });
});
