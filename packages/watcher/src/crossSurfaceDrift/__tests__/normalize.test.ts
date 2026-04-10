/**
 * @aesthetic-function/watcher - crossSurfaceDrift/__tests__/normalize.test.ts
 *
 * Phase 16D: Tests for the pre-comparison normalization layer.
 */

import { describe, it, expect } from 'vitest';
import { normalizeSnapshot, DEFAULT_NORMALIZATION_CONFIG } from '../normalize.js';
import type { SurfaceSnapshot, NormalizationConfig } from '@aesthetic-function/shared/crossSurfaceDrift';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeSnapshot(overrides?: Partial<SurfaceSnapshot>): SurfaceSnapshot {
  return {
    source: 'test',
    componentName: 'TestComponent',
    props: [],
    variants: [],
    lastObserved: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// ALIAS NORMALIZATION
// =============================================================================

describe('alias normalization', () => {
  it('renames Figma "State" to canonical "variant"', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'State', type: 'VARIANT', values: ['Default', 'Hover'] }],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.snapshot.props[0].name).toBe('variant');
    expect(result.snapshot.props[0].normalizedFrom).toBe('State');
    expect(result.snapshot.props[0].type).toBe('VARIANT');
    expect(result.snapshot.props[0].values).toEqual(['Default', 'Hover']);
  });

  it('keeps Storybook "variant" unchanged (already canonical)', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'variant', type: "'primary' | 'secondary'" }],
    });

    const result = normalizeSnapshot(snapshot, 'storybook');

    expect(result.snapshot.props[0].name).toBe('variant');
    expect(result.snapshot.props[0].normalizedFrom).toBeUndefined();
    expect(result.appliedRules).toHaveLength(0);
  });

  it('renames Figma "text" to canonical "label"', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'text', type: 'TEXT' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.snapshot.props[0].name).toBe('label');
    expect(result.snapshot.props[0].normalizedFrom).toBe('text');
  });

  it('keeps Code "label" unchanged (already canonical)', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'label' }],
    });

    const result = normalizeSnapshot(snapshot, 'code');

    expect(result.snapshot.props[0].name).toBe('label');
    expect(result.snapshot.props[0].normalizedFrom).toBeUndefined();
  });

  it('is case-insensitive for alias matching', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'STATE', type: 'VARIANT' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.snapshot.props[0].name).toBe('variant');
    expect(result.snapshot.props[0].normalizedFrom).toBe('STATE');
  });

  it('records applied rules with surface info', () => {
    const snapshot = makeSnapshot({
      props: [
        { name: 'State', type: 'VARIANT' },
        { name: 'text', type: 'TEXT' },
      ],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.appliedRules).toHaveLength(2);
    expect(result.appliedRules[0]).toEqual({
      originalName: 'State',
      canonicalName: 'variant',
      surface: 'figma',
    });
    expect(result.appliedRules[1]).toEqual({
      originalName: 'text',
      canonicalName: 'label',
      surface: 'figma',
    });
  });
});

// =============================================================================
// DESIGN-ONLY FIELD FILTERING
// =============================================================================

describe('design-only field filtering', () => {
  it('excludes layout props from Figma snapshots', () => {
    const snapshot = makeSnapshot({
      props: [
        { name: 'State', type: 'VARIANT', values: ['Default', 'Hover'] },
        { name: 'fills' },
        { name: 'cornerRadius' },
        { name: 'width' },
        { name: 'height' },
      ],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    // Only the variant prop should survive (renamed to "variant")
    expect(result.snapshot.props).toHaveLength(1);
    expect(result.snapshot.props[0].name).toBe('variant');

    // All four layout props should be in excludedProps
    expect(result.excludedProps).toHaveLength(4);
    const excludedNames = result.excludedProps.map(e => e.name);
    expect(excludedNames).toContain('fills');
    expect(excludedNames).toContain('cornerRadius');
    expect(excludedNames).toContain('width');
    expect(excludedNames).toContain('height');
  });

  it('does NOT filter design-only props from Storybook', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'fills' }],
    });

    const result = normalizeSnapshot(snapshot, 'storybook');

    expect(result.snapshot.props).toHaveLength(1);
    expect(result.snapshot.props[0].name).toBe('fills');
    expect(result.excludedProps).toHaveLength(0);
  });

  it('does NOT filter design-only props from Code', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'width' }],
    });

    const result = normalizeSnapshot(snapshot, 'code');

    expect(result.snapshot.props).toHaveLength(1);
    expect(result.snapshot.props[0].name).toBe('width');
    expect(result.excludedProps).toHaveLength(0);
  });

  it('is case-insensitive for design-only matching', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'CornerRadius' }, { name: 'FILLS' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.snapshot.props).toHaveLength(0);
    expect(result.excludedProps).toHaveLength(2);
  });

  it('records excluded props with surface and reason', () => {
    const snapshot = makeSnapshot({
      props: [{ name: 'padding' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    expect(result.excludedProps).toEqual([
      { name: 'padding', surface: 'figma', reason: 'design-only' },
    ]);
  });
});

// =============================================================================
// DEDUPLICATION
// =============================================================================

describe('deduplication after renaming', () => {
  it('merges props that collide after alias normalization', () => {
    // Edge case: snapshot has both "State" and "variant" as separate props
    const snapshot = makeSnapshot({
      props: [
        { name: 'State', type: 'VARIANT', values: ['Default', 'Hover'] },
        { name: 'variant', values: ['primary', 'secondary'] },
      ],
    });

    const result = normalizeSnapshot(snapshot, 'figma');

    // Should merge into one "variant" prop with combined values
    expect(result.snapshot.props).toHaveLength(1);
    expect(result.snapshot.props[0].name).toBe('variant');
    expect(result.snapshot.props[0].type).toBe('VARIANT');
    expect(result.snapshot.props[0].values).toEqual([
      'Default', 'Hover', 'primary', 'secondary',
    ]);
    expect(result.snapshot.props[0].normalizedFrom).toBe('State');
  });
});

// =============================================================================
// CUSTOM CONFIG
// =============================================================================

describe('custom config', () => {
  it('uses custom alias rules when provided', () => {
    const config: NormalizationConfig = {
      propAliases: [
        { canonical: 'color', aliases: ['colour', 'color'] },
      ],
      designOnlyFields: { names: [], strategy: 'exclude' },
    };

    const snapshot = makeSnapshot({
      props: [{ name: 'colour' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma', config);

    expect(result.snapshot.props[0].name).toBe('color');
    expect(result.snapshot.props[0].normalizedFrom).toBe('colour');
  });

  it('uses custom design-only fields when provided', () => {
    const config: NormalizationConfig = {
      propAliases: [],
      designOnlyFields: { names: ['opacity', 'shadow'], strategy: 'exclude' },
    };

    const snapshot = makeSnapshot({
      props: [{ name: 'opacity' }, { name: 'variant' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma', config);

    expect(result.snapshot.props).toHaveLength(1);
    expect(result.snapshot.props[0].name).toBe('variant');
    expect(result.excludedProps).toHaveLength(1);
  });

  it('empty config makes no changes', () => {
    const config: NormalizationConfig = {
      propAliases: [],
      designOnlyFields: { names: [], strategy: 'exclude' },
    };

    const snapshot = makeSnapshot({
      props: [{ name: 'State' }, { name: 'fills' }],
    });

    const result = normalizeSnapshot(snapshot, 'figma', config);

    expect(result.snapshot.props).toHaveLength(2);
    expect(result.appliedRules).toHaveLength(0);
    expect(result.excludedProps).toHaveLength(0);
  });
});

// =============================================================================
// DEFAULT CONFIG SANITY
// =============================================================================

describe('DEFAULT_NORMALIZATION_CONFIG', () => {
  it('has the expected alias rules', () => {
    expect(DEFAULT_NORMALIZATION_CONFIG.propAliases).toEqual([
      { canonical: 'variant', aliases: ['state', 'variant'] },
      { canonical: 'label', aliases: ['text', 'label'] },
    ]);
  });

  it('has the expected design-only fields', () => {
    const names = DEFAULT_NORMALIZATION_CONFIG.designOnlyFields.names;
    expect(names).toContain('fills');
    expect(names).toContain('cornerradius');
    expect(names).toContain('width');
    expect(names).toContain('height');
    expect(DEFAULT_NORMALIZATION_CONFIG.designOnlyFields.strategy).toBe('exclude');
  });
});
