/**
 * @aesthetic-function/watcher - reconcile/__tests__/echoGuard.test.ts
 *
 * Tests for the echo suppression guard (Phase 7C).
 *
 * Covers:
 * - Echo suppression prevents re-sending identical ops after AST write
 * - Cache expiration after TTL
 * - Cache clearing and pruning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordAppliedValue,
  shouldSuppress,
  checkOperations,
  clearEchoCache,
  getCacheSize,
  pruneExpiredEntries,
  parseCacheKey,
  type EchoCacheKey,
} from '../echoGuard.js';

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  clearEchoCache();
});

afterEach(() => {
  clearEchoCache();
  vi.restoreAllMocks();
});

// =============================================================================
// BASIC SUPPRESSION TESTS
// =============================================================================

describe('Echo Guard - Basic Suppression', () => {
  it('should not suppress when cache is empty', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    const result = shouldSuppress(key, 'Submit');

    expect(result.suppressed).toBe(false);
  });

  it('should suppress when value matches cached value', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    // Record the applied value
    recordAppliedValue(key, 'Submit');

    // Try to apply same value
    const result = shouldSuppress(key, 'Submit');

    expect(result.suppressed).toBe(true);
    expect(result.reason).toContain('Echo suppressed');
    expect(result.reason).toContain('LoginButton.text');
  });

  it('should not suppress when value differs from cached value', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    // Record one value
    recordAppliedValue(key, 'Submit');

    // Try to apply different value
    const result = shouldSuppress(key, 'Login');

    expect(result.suppressed).toBe(false);
  });

  it('should suppress numeric values correctly', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'Container',
      field: 'gap',
    };

    recordAppliedValue(key, 16);

    // Same numeric value
    expect(shouldSuppress(key, 16).suppressed).toBe(true);
    // Same value as string
    expect(shouldSuppress(key, '16').suppressed).toBe(true);
    // Different value
    expect(shouldSuppress(key, 12).suppressed).toBe(false);
  });

  it('should not suppress for different nodes', () => {
    const key1: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };
    const key2: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LogoutButton',
      field: 'text',
    };

    recordAppliedValue(key1, 'Submit');

    const result = shouldSuppress(key2, 'Submit');

    expect(result.suppressed).toBe(false);
  });

  it('should not suppress for different fields', () => {
    const key1: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };
    const key2: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'fill',
    };

    recordAppliedValue(key1, 'Submit');

    const result = shouldSuppress(key2, 'Submit');

    expect(result.suppressed).toBe(false);
  });

  it('should not suppress for different files', () => {
    const key1: EchoCacheKey = {
      filePath: 'App.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };
    const key2: EchoCacheKey = {
      filePath: 'Login.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    recordAppliedValue(key1, 'Submit');

    const result = shouldSuppress(key2, 'Submit');

    expect(result.suppressed).toBe(false);
  });
});

// =============================================================================
// CACHE EXPIRATION TESTS
// =============================================================================

describe('Echo Guard - Cache Expiration', () => {
  it('should not suppress after TTL expires', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    // Record value
    recordAppliedValue(key, 'Submit');

    // Mock Date.now to simulate time passing
    const recordTime = Date.now();
    
    // Advance time past TTL (default 5000ms)
    vi.spyOn(Date, 'now').mockReturnValue(recordTime + 6000);

    const result = shouldSuppress(key, 'Submit');

    expect(result.suppressed).toBe(false);

    // Restore
    vi.spyOn(Date, 'now').mockRestore();
  });

  it('should prune expired entries', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    recordAppliedValue(key, 'Submit');
    expect(getCacheSize()).toBe(1);

    // Mock time passing
    const recordTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(recordTime + 6000);

    const pruned = pruneExpiredEntries();

    expect(pruned).toBe(1);
    expect(getCacheSize()).toBe(0);

    vi.spyOn(Date, 'now').mockRestore();
  });
});

// =============================================================================
// BATCH OPERATIONS TESTS
// =============================================================================

describe('Echo Guard - Batch Operations', () => {
  it('should check multiple operations', () => {
    // Record some values
    recordAppliedValue({ filePath: 'test.tsx', nodeName: 'A', field: 'text' }, 'Hello');
    recordAppliedValue({ filePath: 'test.tsx', nodeName: 'B', field: 'text' }, 'World');

    const operations = [
      { key: { filePath: 'test.tsx', nodeName: 'A', field: 'text' }, value: 'Hello' }, // suppress
      { key: { filePath: 'test.tsx', nodeName: 'B', field: 'text' }, value: 'World' }, // suppress
      { key: { filePath: 'test.tsx', nodeName: 'C', field: 'text' }, value: 'New' }, // allow
    ];

    const summary = checkOperations(operations);

    expect(summary.total).toBe(3);
    expect(summary.suppressed).toBe(2);
    expect(summary.allowed).toBe(1);
  });
});

// =============================================================================
// CACHE KEY PARSING TESTS
// =============================================================================

describe('Echo Guard - Cache Key Parsing', () => {
  it('should parse cache key correctly', () => {
    const keyStr = 'path/to/file.tsx|LoginButton|text';
    const parsed = parseCacheKey(keyStr);

    expect(parsed.filePath).toBe('path/to/file.tsx');
    expect(parsed.nodeName).toBe('LoginButton');
    expect(parsed.field).toBe('text');
  });
});

// =============================================================================
// CACHE MANAGEMENT TESTS
// =============================================================================

describe('Echo Guard - Cache Management', () => {
  it('should clear all entries', () => {
    recordAppliedValue({ filePath: 'test.tsx', nodeName: 'A', field: 'text' }, 'Hello');
    recordAppliedValue({ filePath: 'test.tsx', nodeName: 'B', field: 'text' }, 'World');

    expect(getCacheSize()).toBe(2);

    clearEchoCache();

    expect(getCacheSize()).toBe(0);
  });

  it('should update existing entry on re-record', () => {
    const key: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'text',
    };

    recordAppliedValue(key, 'Submit');
    expect(shouldSuppress(key, 'Submit').suppressed).toBe(true);

    // Record new value
    recordAppliedValue(key, 'Login');
    expect(shouldSuppress(key, 'Submit').suppressed).toBe(false);
    expect(shouldSuppress(key, 'Login').suppressed).toBe(true);

    // Cache size should still be 1
    expect(getCacheSize()).toBe(1);
  });
});

// =============================================================================
// STATE-AWARE CACHE KEYS (Phase 8A)
// =============================================================================

describe('Echo Guard - State-aware cache keys (Phase 8A)', () => {
  it('should differentiate base and hover states in cache', () => {
    const baseKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'fill',
      state: 'base',
    };
    const hoverKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'LoginButton',
      field: 'fill',
      state: 'hover',
    };

    recordAppliedValue(baseKey, '#3B82F6');
    recordAppliedValue(hoverKey, '#2563EB');

    // Same node, same field, but different states
    expect(shouldSuppress(baseKey, '#3B82F6').suppressed).toBe(true);
    expect(shouldSuppress(hoverKey, '#2563EB').suppressed).toBe(true);

    // Should NOT suppress if checking opposite state's value
    expect(shouldSuppress(baseKey, '#2563EB').suppressed).toBe(false);
    expect(shouldSuppress(hoverKey, '#3B82F6').suppressed).toBe(false);

    expect(getCacheSize()).toBe(2);
  });

  it('should treat undefined state as base', () => {
    const undefinedStateKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'Button',
      field: 'text',
      // state is undefined (defaults to 'base')
    };
    const explicitBaseKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'Button',
      field: 'text',
      state: 'base',
    };

    recordAppliedValue(undefinedStateKey, 'Click');

    // Both undefined and explicit 'base' should match
    expect(shouldSuppress(explicitBaseKey, 'Click').suppressed).toBe(true);
  });

  it('should parse cache key with state correctly', () => {
    const keyStr = 'path/to/file.tsx|LoginButton|text|hover';
    const parsed = parseCacheKey(keyStr);

    expect(parsed.filePath).toBe('path/to/file.tsx');
    expect(parsed.nodeName).toBe('LoginButton');
    expect(parsed.field).toBe('text');
    expect(parsed.state).toBe('hover');
  });

  it('should parse old format cache key (no state) as base', () => {
    const keyStr = 'path/to/file.tsx|LoginButton|text';
    const parsed = parseCacheKey(keyStr);

    expect(parsed.filePath).toBe('path/to/file.tsx');
    expect(parsed.nodeName).toBe('LoginButton');
    expect(parsed.field).toBe('text');
    expect(parsed.state).toBe('base');
  });

  it('should not suppress disabled state when only hover is cached', () => {
    const hoverKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'Button',
      field: 'fill',
      state: 'hover',
    };
    const disabledKey: EchoCacheKey = {
      filePath: 'test.tsx',
      nodeName: 'Button',
      field: 'fill',
      state: 'disabled',
    };

    recordAppliedValue(hoverKey, '#2563EB');

    expect(shouldSuppress(disabledKey, '#2563EB').suppressed).toBe(false);
  });
});
