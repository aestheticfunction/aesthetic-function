/**
 * @aesthetic-function/watcher - designAdapter/__tests__/normalize.test.ts
 *
 * Phase 16A: Tests for design token and component normalization.
 */

import { describe, it, expect } from 'vitest';
import type { DesignTokenValue, DesignComponent } from '@aesthetic-function/shared/designAdapter';

import { normalizeDesignTokens, normalizeDesignComponent } from '../normalize.js';

// =============================================================================
// TOKEN NORMALIZATION
// =============================================================================

describe('normalizeDesignTokens', () => {
  it('normalizes color tokens by name', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'colors/primary/500', value: '#3B82F6', type: 'color' },
      { name: 'colors/success', value: '#10B981', type: 'color' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    expect(result.summary.total).toBe(2);
    expect(result.summary.mapped).toBeGreaterThan(0);

    // primary should map to color.primary
    const primary = result.tokens.find(t => t.originalName === 'colors/primary/500');
    expect(primary?.canonical).toBe('color.primary');
    expect(primary?.mapped).toBe(true);

    // success should map to color.success
    const success = result.tokens.find(t => t.originalName === 'colors/success');
    expect(success?.canonical).toBe('color.success');
    expect(success?.mapped).toBe(true);
  });

  it('normalizes spacing tokens by value', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'spacing/sm', value: '8', type: 'spacing' },
      { name: 'spacing/lg', value: '24', type: 'spacing' },
      { name: 'spacing/none', value: '0', type: 'spacing' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    const sm = result.tokens.find(t => t.originalName === 'spacing/sm');
    expect(sm?.canonical).toBe('space.sm');

    const lg = result.tokens.find(t => t.originalName === 'spacing/lg');
    expect(lg?.canonical).toBe('space.lg');

    const none = result.tokens.find(t => t.originalName === 'spacing/none');
    expect(none?.canonical).toBe('space.none');
  });

  it('normalizes radius tokens by value', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'radius/md', value: '8', type: 'radius' },
      { name: 'radius/none', value: '0', type: 'radius' },
      { name: 'radius/full', value: '9999', type: 'radius' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    const md = result.tokens.find(t => t.originalName === 'radius/md');
    expect(md?.canonical).toBe('radius.md');

    const none = result.tokens.find(t => t.originalName === 'radius/none');
    expect(none?.canonical).toBe('radius.none');

    const full = result.tokens.find(t => t.originalName === 'radius/full');
    expect(full?.canonical).toBe('radius.full');
  });

  it('normalizes typography tokens by value', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'typography/fontSize/sm', value: '14', type: 'typography' },
      { name: 'typography/fontWeight/bold', value: '700', type: 'typography' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    const sm = result.tokens.find(t => t.originalName === 'typography/fontSize/sm');
    expect(sm?.canonical).toBe('text.size.sm');

    const bold = result.tokens.find(t => t.originalName === 'typography/fontWeight/bold');
    expect(bold?.canonical).toBe('text.weight.bold');
  });

  it('marks unknown tokens as unmapped', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'custom/something', value: 'abc', type: 'other' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    expect(result.summary.unmapped).toBe(1);
    expect(result.tokens[0].mapped).toBe(false);
    expect(result.tokens[0].canonical).toBeNull();
  });

  it('includes source metadata', () => {
    const result = normalizeDesignTokens([], 'my-adapter', 'My Adapter');

    expect(result.source.adapterId).toBe('my-adapter');
    expect(result.source.adapterName).toBe('My Adapter');
    expect(result.source.extractedAt).toBeDefined();
  });

  it('produces deterministic sort order', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'z/token', value: '1', type: 'other' },
      { name: 'a/token', value: '2', type: 'other' },
      { name: 'm/token', value: '3', type: 'other' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');
    const names = result.tokens.map(t => t.originalName);
    expect(names).toEqual(['a/token', 'm/token', 'z/token']);
  });

  it('counts by type correctly', () => {
    const tokens: DesignTokenValue[] = [
      { name: 'c1', value: '#000', type: 'color' },
      { name: 'c2', value: '#111', type: 'color' },
      { name: 's1', value: '8', type: 'spacing' },
    ];

    const result = normalizeDesignTokens(tokens, 'test', 'Test Adapter');

    expect(result.summary.byType.color).toBe(2);
    expect(result.summary.byType.spacing).toBe(1);
  });
});

// =============================================================================
// COMPONENT NORMALIZATION
// =============================================================================

describe('normalizeDesignComponent', () => {
  it('extracts fill colors from Figma RGB format', () => {
    const component: DesignComponent = {
      name: 'TestButton',
      id: '1:42',
      type: 'component',
      properties: {
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
      },
    };

    const result = normalizeDesignComponent(component);
    expect(result.name).toBe('TestButton');
    expect(result.nodeId).toBe('1:42');
    expect(result.properties.fills).toContain('#FF0000');
  });

  it('extracts corner radius', () => {
    const component: DesignComponent = {
      name: 'Card',
      id: '1:50',
      type: 'component',
      properties: { cornerRadius: 12 },
    };

    const result = normalizeDesignComponent(component);
    expect(result.properties.cornerRadius).toBe(12);
  });

  it('extracts padding from individual properties', () => {
    const component: DesignComponent = {
      name: 'Box',
      id: '1:60',
      type: 'component',
      properties: {
        paddingTop: 8,
        paddingRight: 16,
        paddingBottom: 8,
        paddingLeft: 16,
      },
    };

    const result = normalizeDesignComponent(component);
    expect(result.properties.padding).toEqual({ top: 8, right: 16, bottom: 8, left: 16 });
  });

  it('extracts layout gap from itemSpacing', () => {
    const component: DesignComponent = {
      name: 'Stack',
      id: '1:70',
      type: 'component',
      properties: { itemSpacing: 12 },
    };

    const result = normalizeDesignComponent(component);
    expect(result.properties.gap).toBe(12);
  });

  it('extracts text/typography properties', () => {
    const component: DesignComponent = {
      name: 'Label',
      id: '1:80',
      type: 'component',
      properties: {
        characters: 'Hello World',
        fontSize: 16,
        fontWeight: 500,
      },
    };

    const result = normalizeDesignComponent(component);
    expect(result.properties.textContent).toBe('Hello World');
    expect(result.properties.fontSize).toBe(16);
    expect(result.properties.fontWeight).toBe(500);
  });

  it('normalizes variants with state inference', () => {
    const component: DesignComponent = {
      name: 'Button',
      id: '1:90',
      type: 'component-set',
      variants: [
        { name: 'Default', id: '1:91', properties: { State: 'base' } },
        { name: 'Hover', id: '1:92', properties: { State: 'hover' } },
      ],
    };

    const result = normalizeDesignComponent(component);
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0].state).toBe('base');
    expect(result.variants[1].state).toBe('hover');
  });

  it('defaults to base state when properties are empty', () => {
    const component: DesignComponent = {
      name: 'Button',
      id: '1:95',
      type: 'component-set',
      variants: [
        { name: 'Hover', id: '1:96', properties: {} },
        { name: 'Disabled', id: '1:97', properties: {} },
      ],
    };

    const result = normalizeDesignComponent(component);
    // With empty properties, state defaults to 'base'
    expect(result.variants![0].state).toBe('base');
    expect(result.variants![1].state).toBe('base');
  });

  it('tracks unmapped properties', () => {
    const component: DesignComponent = {
      name: 'Custom',
      id: '1:100',
      type: 'component',
      properties: {
        customProp: 'value',
        anotherProp: 42,
        // Known props should not be listed as unmapped
        cornerRadius: 8,
      },
    };

    const result = normalizeDesignComponent(component);
    expect(result.unmappedProperties).toContain('customProp');
    expect(result.unmappedProperties).toContain('anotherProp');
    expect(result.unmappedProperties).not.toContain('cornerRadius');
  });

  it('skips non-SOLID fill types', () => {
    const component: DesignComponent = {
      name: 'Gradient',
      id: '1:110',
      type: 'component',
      properties: {
        fills: [
          { type: 'GRADIENT_LINEAR', color: { r: 1, g: 0, b: 0 } },
          { type: 'SOLID', color: { r: 0, g: 1, b: 0 } },
        ],
      },
    };

    const result = normalizeDesignComponent(component);
    // Only SOLID fill is included
    expect(result.properties.fills).toEqual(['#00FF00']);
  });
});
