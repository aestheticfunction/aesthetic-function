/**
 * @aesthetic-function/watcher - adapters/__tests__/surfaceMetadata.test.ts
 *
 * Phase 16A Extension: Tests for semantic adapter surface classification queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SemanticAdapter, AdapterContext, AdapterResult } from '../types.js';
import type * as t from '@babel/types';

import {
  registerAdapter,
  clearAdapters,
  getSemanticAdaptersBySurface,
} from '../registry.js';

// =============================================================================
// HELPERS
// =============================================================================

function createMockSemanticAdapter(
  overrides: Partial<SemanticAdapter> & { id: string }
): SemanticAdapter {
  return {
    displayName: overrides.id,
    priority: 100,
    supports: () => false,
    extract: () => ({
      semantics: {},
      provenance: { adapterId: overrides.id, confidence: 'low' as const },
    }),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('semantic adapter surface metadata queries', () => {
  beforeEach(() => {
    clearAdapters();
  });

  it('returns adapters matching surface type', () => {
    const runtime = createMockSemanticAdapter({
      id: 'vuetify',
      surfaceMetadata: {
        surfaceType: 'runtime',
        accessMode: 'no-mutation',
        authorityRole: 'external-non-authoritative',
        stability: 'derived',
      },
    });
    const inspection = createMockSemanticAdapter({
      id: 'devtools',
      surfaceMetadata: {
        surfaceType: 'inspection',
        accessMode: 'read-only',
        authorityRole: 'external-non-authoritative',
        stability: 'observational',
      },
    });
    registerAdapter(runtime);
    registerAdapter(inspection);

    const runtimeResults = getSemanticAdaptersBySurface('runtime');
    expect(runtimeResults).toHaveLength(1);
    expect(runtimeResults[0].id).toBe('vuetify');

    const inspectionResults = getSemanticAdaptersBySurface('inspection');
    expect(inspectionResults).toHaveLength(1);
    expect(inspectionResults[0].id).toBe('devtools');
  });

  it('returns empty array when no adapters match', () => {
    const adapter = createMockSemanticAdapter({
      id: 'vuetify',
      surfaceMetadata: {
        surfaceType: 'runtime',
        accessMode: 'no-mutation',
        authorityRole: 'external-non-authoritative',
        stability: 'derived',
      },
    });
    registerAdapter(adapter);
    expect(getSemanticAdaptersBySurface('design')).toHaveLength(0);
  });

  it('excludes adapters without surfaceMetadata', () => {
    const withMeta = createMockSemanticAdapter({
      id: 'with-meta',
      surfaceMetadata: {
        surfaceType: 'runtime',
        accessMode: 'no-mutation',
        authorityRole: 'external-non-authoritative',
        stability: 'derived',
      },
    });
    const withoutMeta = createMockSemanticAdapter({ id: 'no-meta' });
    registerAdapter(withMeta);
    registerAdapter(withoutMeta);

    expect(getSemanticAdaptersBySurface('runtime')).toHaveLength(1);
    expect(getSemanticAdaptersBySurface('runtime')[0].id).toBe('with-meta');
  });

  it('returns multiple adapters of the same surface type', () => {
    const a1 = createMockSemanticAdapter({
      id: 'vuetify',
      priority: 50,
      surfaceMetadata: {
        surfaceType: 'runtime',
        accessMode: 'no-mutation',
        authorityRole: 'external-non-authoritative',
        stability: 'derived',
      },
    });
    const a2 = createMockSemanticAdapter({
      id: 'antd',
      priority: 51,
      surfaceMetadata: {
        surfaceType: 'runtime',
        accessMode: 'no-mutation',
        authorityRole: 'external-non-authoritative',
        stability: 'derived',
      },
    });
    registerAdapter(a1);
    registerAdapter(a2);

    const results = getSemanticAdaptersBySurface('runtime');
    expect(results).toHaveLength(2);
    // Should preserve priority order (vuetify=50, antd=51)
    expect(results[0].id).toBe('vuetify');
    expect(results[1].id).toBe('antd');
  });
});
