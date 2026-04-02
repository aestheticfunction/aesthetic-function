/**
 * @aesthetic-function/watcher - designAdapter/__tests__/registry.test.ts
 *
 * Phase 16A: Tests for design adapter registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { DesignAdapter } from '@aesthetic-function/shared/designAdapter';

import {
  registerDesignAdapter,
  getRegisteredDesignAdapters,
  getDesignAdapter,
  getAvailableAdapter,
  clearDesignAdapters,
  getDesignAdaptersBySurface,
} from '../registry.js';

// =============================================================================
// HELPERS
// =============================================================================

function createMockAdapter(overrides: Partial<DesignAdapter> & { id: string }): DesignAdapter {
  return {
    displayName: overrides.id,
    version: '1.0.0',
    isAvailable: async () => true,
    getDesignTokens: async () => ({
      data: [],
      adapterId: overrides.id,
      adapterName: overrides.id,
      durationMs: 0,
      warnings: [],
      cached: false,
    }),
    getComponent: async () => ({
      data: null,
      adapterId: overrides.id,
      adapterName: overrides.id,
      durationMs: 0,
      warnings: [],
      cached: false,
    }),
    getComponents: async () => ({
      data: [],
      adapterId: overrides.id,
      adapterName: overrides.id,
      durationMs: 0,
      warnings: [],
      cached: false,
    }),
    getStyles: async () => ({
      data: [],
      adapterId: overrides.id,
      adapterName: overrides.id,
      durationMs: 0,
      warnings: [],
      cached: false,
    }),
    getFileData: async () => ({
      data: {
        name: 'test',
        lastModified: '',
        pageCount: 0,
        componentCount: 0,
        styleCount: 0,
        variableCount: 0,
      },
      adapterId: overrides.id,
      adapterName: overrides.id,
      durationMs: 0,
      warnings: [],
      cached: false,
    }),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('designAdapter/registry', () => {
  beforeEach(() => {
    clearDesignAdapters();
  });

  it('starts with no adapters', () => {
    expect(getRegisteredDesignAdapters()).toHaveLength(0);
  });

  it('registers an adapter', () => {
    const adapter = createMockAdapter({ id: 'test-1' });
    registerDesignAdapter(adapter);
    expect(getRegisteredDesignAdapters()).toHaveLength(1);
  });

  it('replaces adapter on duplicate registration', () => {
    const adapter1 = createMockAdapter({ id: 'test-dup' });
    const adapter2 = createMockAdapter({ id: 'test-dup', displayName: 'replaced' });
    registerDesignAdapter(adapter1);
    registerDesignAdapter(adapter2);
    expect(getRegisteredDesignAdapters()).toHaveLength(1);
    expect(getDesignAdapter('test-dup')?.displayName).toBe('replaced');
  });

  it('retrieves adapter by id', () => {
    const adapter = createMockAdapter({ id: 'test-lookup' });
    registerDesignAdapter(adapter);
    expect(getDesignAdapter('test-lookup')).toBe(adapter);
  });

  it('returns undefined for unknown id', () => {
    expect(getDesignAdapter('nonexistent')).toBeUndefined();
  });

  it('getAvailableAdapter returns first available (latest priority)', async () => {
    const a1 = createMockAdapter({ id: 'low-priority' });
    const a2 = createMockAdapter({ id: 'high-priority' });
    registerDesignAdapter(a1);
    registerDesignAdapter(a2);
    const result = await getAvailableAdapter();
    expect(result?.id).toBe('high-priority');
  });

  it('getAvailableAdapter skips unavailable adapters', async () => {
    const unavailable = createMockAdapter({
      id: 'unavailable',
      isAvailable: async () => false,
    });
    const available = createMockAdapter({ id: 'available' });
    registerDesignAdapter(available);
    registerDesignAdapter(unavailable);
    const result = await getAvailableAdapter();
    expect(result?.id).toBe('available');
  });

  it('getAvailableAdapter returns null when none available', async () => {
    const unavailable = createMockAdapter({
      id: 'down',
      isAvailable: async () => false,
    });
    registerDesignAdapter(unavailable);
    const result = await getAvailableAdapter();
    expect(result).toBeNull();
  });

  it('clearDesignAdapters removes all', () => {
    registerDesignAdapter(createMockAdapter({ id: 'a' }));
    registerDesignAdapter(createMockAdapter({ id: 'b' }));
    expect(getRegisteredDesignAdapters()).toHaveLength(2);
    clearDesignAdapters();
    expect(getRegisteredDesignAdapters()).toHaveLength(0);
  });

  // ===========================================================================
  // SURFACE METADATA QUERIES (Phase 16A Extension)
  // ===========================================================================

  describe('getDesignAdaptersBySurface', () => {
    it('returns adapters matching surface type', () => {
      const designAdapter = createMockAdapter({
        id: 'figma',
        surfaceMetadata: {
          surfaceType: 'design',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      const runtimeAdapter = createMockAdapter({
        id: 'storybook',
        surfaceMetadata: {
          surfaceType: 'runtime',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      registerDesignAdapter(designAdapter);
      registerDesignAdapter(runtimeAdapter);

      const designResults = getDesignAdaptersBySurface('design');
      expect(designResults).toHaveLength(1);
      expect(designResults[0].id).toBe('figma');

      const runtimeResults = getDesignAdaptersBySurface('runtime');
      expect(runtimeResults).toHaveLength(1);
      expect(runtimeResults[0].id).toBe('storybook');
    });

    it('returns empty array when no adapters match', () => {
      const adapter = createMockAdapter({
        id: 'figma',
        surfaceMetadata: {
          surfaceType: 'design',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      registerDesignAdapter(adapter);
      expect(getDesignAdaptersBySurface('generation')).toHaveLength(0);
    });

    it('excludes adapters without surfaceMetadata', () => {
      const withMeta = createMockAdapter({
        id: 'with-meta',
        surfaceMetadata: {
          surfaceType: 'design',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      const withoutMeta = createMockAdapter({ id: 'no-meta' });
      registerDesignAdapter(withMeta);
      registerDesignAdapter(withoutMeta);

      expect(getDesignAdaptersBySurface('design')).toHaveLength(1);
      expect(getDesignAdaptersBySurface('design')[0].id).toBe('with-meta');
    });

    it('returns multiple adapters of the same surface type', () => {
      const a1 = createMockAdapter({
        id: 'figma-mcp',
        surfaceMetadata: {
          surfaceType: 'design',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      const a2 = createMockAdapter({
        id: 'figma-console-mcp',
        surfaceMetadata: {
          surfaceType: 'design',
          accessMode: 'read-only',
          authorityRole: 'external-non-authoritative',
          stability: 'observational',
        },
      });
      registerDesignAdapter(a1);
      registerDesignAdapter(a2);

      const results = getDesignAdaptersBySurface('design');
      expect(results).toHaveLength(2);
    });
  });
});
