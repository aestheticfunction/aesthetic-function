/**
 * @aesthetic-function/watcher - compose/__tests__/composeFromSuggestions.test.ts
 *
 * Unit tests for Phase 11B compose transformation.
 */

import { describe, it, expect } from 'vitest';
import {
  composeFromSuggestions,
  filterComposeOpsByAllowList,
  createTestConfig,
  type ComposeOperation,
} from '../index.js';
import type { FigmaSuggestion } from '../../figmaSuggestions/types.js';

// =============================================================================
// TEST DATA
// =============================================================================

const mockSuggestions: FigmaSuggestion[] = [
  {
    componentKey: 'components/Button',
    figmaNameSuggestion: 'Button',
    type: 'component-set',
    message: 'Create a Component Set named Button for componentKey components/Button.',
    source: 'canonical',
    confidence: 'high',
  },
  {
    componentKey: 'components/Button',
    figmaNameSuggestion: 'Button',
    type: 'variant',
    message: 'Add variant state=hover to Button Component Set.',
    details: { variantState: 'hover' },
    source: 'adapter',
    confidence: 'high',
  },
  {
    componentKey: 'components/Button',
    figmaNameSuggestion: 'Button',
    type: 'variant',
    message: 'Add variant state=disabled to Button Component Set.',
    details: { variantState: 'disabled' },
    source: 'adapter',
    confidence: 'medium',
  },
  {
    componentKey: 'components/Card',
    figmaNameSuggestion: 'Card',
    type: 'property',
    message: 'Add property Size with values: small, medium, large.',
    details: { propertyName: 'Size', allowedValues: ['small', 'medium', 'large'] },
    source: 'canonical',
    confidence: 'high',
  },
  {
    componentKey: 'components/Button',
    figmaNameSuggestion: 'Button',
    type: 'token-usage',
    message: 'Consider using color/primary instead of #0066cc.',
    source: 'policy',
    confidence: 'low',
  },
  {
    componentKey: 'components/Input',
    figmaNameSuggestion: 'Input',
    type: 'coverage-gap',
    message: 'Input component has no Figma coverage.',
    source: 'coverage',
    confidence: 'medium',
  },
];

// =============================================================================
// COMPOSE FROM SUGGESTIONS TESTS
// =============================================================================

describe('composeFromSuggestions', () => {
  it('returns empty when disabled', () => {
    const config = createTestConfig({ enabled: false, mode: 'off' });
    const result = composeFromSuggestions({
      suggestions: mockSuggestions,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.operations).toHaveLength(0);
    expect(result.filtered).toHaveLength(0);
    expect(result.totalGenerated).toBe(0);
    expect(result.mode).toBe('off');
  });

  it('returns empty when mode is off', () => {
    const config = createTestConfig({ enabled: true, mode: 'off' });
    const result = composeFromSuggestions({
      suggestions: mockSuggestions,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.operations).toHaveLength(0);
    expect(result.mode).toBe('off');
  });

  it('generates operations in dry-run mode', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set', 'variant', 'property'],
    });
    const result = composeFromSuggestions({
      suggestions: mockSuggestions,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.mode).toBe('dry-run');
    expect(result.totalGenerated).toBe(4); // component-set, 2 variants, property
    expect(result.totalAllowed).toBe(4);
    expect(result.filtered).toHaveLength(0);
  });

  it('filters by allow list', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set'], // Only allow component-set
    });
    const result = composeFromSuggestions({
      suggestions: mockSuggestions,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.totalGenerated).toBe(4);
    expect(result.totalAllowed).toBe(1);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('ENSURE_COMPONENT_SET');
    expect(result.filtered).toHaveLength(3); // 2 variants + 1 property filtered
  });

  it('skips non-actionable suggestion types', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set', 'variant', 'property'],
    });

    // Only include token-usage and coverage-gap suggestions
    const nonActionable: FigmaSuggestion[] = [
      mockSuggestions[4], // token-usage
      mockSuggestions[5], // coverage-gap
    ];

    const result = composeFromSuggestions({
      suggestions: nonActionable,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.totalGenerated).toBe(0);
    expect(result.operations).toHaveLength(0);
  });

  it('generates deterministic opIds', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set'],
    });

    const result1 = composeFromSuggestions({
      suggestions: [mockSuggestions[0]],
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    const result2 = composeFromSuggestions({
      suggestions: [mockSuggestions[0]],
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result1.operations[0].opId).toBe(result2.operations[0].opId);
  });

  it('deduplicates by opId', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set'],
    });

    // Duplicate the same suggestion
    const duplicates: FigmaSuggestion[] = [
      mockSuggestions[0],
      mockSuggestions[0],
      mockSuggestions[0],
    ];

    const result = composeFromSuggestions({
      suggestions: duplicates,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.totalGenerated).toBe(1); // Deduplicated
  });

  it('counts by operation type', () => {
    const config = createTestConfig({
      enabled: true,
      mode: 'dry-run',
      allow: ['component-set', 'variant', 'property'],
    });
    const result = composeFromSuggestions({
      suggestions: mockSuggestions,
      sourceFile: 'demo-app/src/App.tsx',
      config,
    });

    expect(result.countByType).toEqual({
      ENSURE_COMPONENT_SET: 1,
      ENSURE_VARIANT: 2,
      ENSURE_PROPERTY_DEF: 1,
    });
  });
});

// =============================================================================
// FILTER BY ALLOW LIST TESTS
// =============================================================================

describe('filterComposeOpsByAllowList', () => {
  const mockOps: ComposeOperation[] = [
    {
      opId: 'op1',
      type: 'ENSURE_COMPONENT_SET',
      componentKey: 'Button',
      figmaName: 'Button',
      payload: { componentKey: 'Button', figmaName: 'Button' },
      reason: 'Create component set',
      source: 'figma-suggestions',
    },
    {
      opId: 'op2',
      type: 'ENSURE_VARIANT',
      componentKey: 'Button',
      figmaName: 'Button',
      payload: {
        componentKey: 'Button',
        componentSetName: 'Button',
        variantProps: { state: 'hover' },
      },
      reason: 'Add hover variant',
      source: 'figma-suggestions',
    },
    {
      opId: 'op3',
      type: 'ENSURE_PROPERTY_DEF',
      componentKey: 'Card',
      figmaName: 'Card',
      payload: { componentKey: 'Card', propertyName: 'Size', allowedValues: [] },
      reason: 'Add Size property',
      source: 'figma-suggestions',
    },
  ];

  it('filters out all when allow is empty', () => {
    const { allowed, filtered } = filterComposeOpsByAllowList(mockOps, []);
    expect(allowed).toHaveLength(0);
    expect(filtered).toHaveLength(3);
  });

  it('allows only component-set', () => {
    const { allowed, filtered } = filterComposeOpsByAllowList(mockOps, ['component-set']);
    expect(allowed).toHaveLength(1);
    expect(allowed[0].type).toBe('ENSURE_COMPONENT_SET');
    expect(filtered).toHaveLength(2);
  });

  it('allows multiple types', () => {
    const { allowed, filtered } = filterComposeOpsByAllowList(mockOps, [
      'component-set',
      'variant',
    ]);
    expect(allowed).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe('ENSURE_PROPERTY_DEF');
  });

  it('allows all types', () => {
    const { allowed, filtered } = filterComposeOpsByAllowList(mockOps, [
      'component-set',
      'variant',
      'property',
    ]);
    expect(allowed).toHaveLength(3);
    expect(filtered).toHaveLength(0);
  });
});
