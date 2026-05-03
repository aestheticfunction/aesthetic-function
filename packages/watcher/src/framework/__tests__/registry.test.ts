/**
 * @aesthetic-function/watcher - framework/__tests__/registry.test.ts
 *
 * Tests for the FrameworkAnalyzer registry dispatch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerFrameworkAnalyzer,
  resolveByPath,
  getRegisteredAnalyzers,
  clearRegistryForTesting,
} from '../registry.js';
import type { FrameworkAnalyzer } from '../types.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeStubAnalyzer(id: string, extensions: string[]): FrameworkAnalyzer {
  return {
    id,
    extensions,
    parseAst: () => ({ filePath: '', components: [] }),
    parseIntent: () => ({ intents: [], source: '', timestamp: '' }),
    anchorMarkers: () => ({ filePath: '', anchors: [] }),
    hasMarkers: () => false,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('FrameworkAnalyzer registry', () => {
  beforeEach(() => {
    clearRegistryForTesting();
  });

  it('resolves .vue to vue3 analyzer after registration', () => {
    const vue3 = makeStubAnalyzer('vue3', ['.vue']);
    registerFrameworkAnalyzer(vue3);
    expect(resolveByPath('src/components/Button.vue')).toBe(vue3);
  });

  it('resolves .tsx to react analyzer after registration', () => {
    const react = makeStubAnalyzer('react', ['.tsx', '.jsx', '.ts', '.js']);
    registerFrameworkAnalyzer(react);
    expect(resolveByPath('src/App.tsx')).toBe(react);
  });

  it('returns undefined for unregistered extensions', () => {
    expect(resolveByPath('src/styles.css')).toBeUndefined();
  });

  it('last registration wins for the same extension', () => {
    const a = makeStubAnalyzer('analyzer-a', ['.vue']);
    const b = makeStubAnalyzer('analyzer-b', ['.vue']);
    registerFrameworkAnalyzer(a);
    registerFrameworkAnalyzer(b);
    expect(resolveByPath('Foo.vue')?.id).toBe('analyzer-b');
  });

  it('getRegisteredAnalyzers returns all registered', () => {
    const vue3 = makeStubAnalyzer('vue3', ['.vue']);
    const react = makeStubAnalyzer('react', ['.tsx']);
    registerFrameworkAnalyzer(vue3);
    registerFrameworkAnalyzer(react);
    const ids = getRegisteredAnalyzers().map((a) => a.id);
    expect(ids).toContain('vue3');
    expect(ids).toContain('react');
  });

  it('resolves case-insensitively', () => {
    const vue3 = makeStubAnalyzer('vue3', ['.vue']);
    registerFrameworkAnalyzer(vue3);
    expect(resolveByPath('Button.VUE')).toBe(vue3);
  });
});
