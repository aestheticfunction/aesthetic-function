/**
 * @aesthetic-function/watcher - figmaDelta/__tests__/generateDeltas.test.ts
 *
 * Unit tests for Phase 12A Figma → Code delta detection.
 *
 * Tests:
 * 1. Detect fill change on hover variant
 * 2. Ignore unchanged properties
 * 3. Ignore component set nodeId changes
 * 4. Preserve canonical + raw values
 * 5. Handle missing canonical gracefully
 * 6. Multiple deltas on same variant
 */

import { describe, it, expect } from 'vitest';
import {
  resolveToCanonical,
  detectDeltaForProperty,
  generateDeltasForVariant,
  generateDeltas,
  isVariantTarget,
  filterVariantTargets,
} from '../generateDeltas.js';
import type {
  DeltaInput,
  BatchDeltaInput,
  BaselineValue,
  FigmaPropertyState,
} from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

function createLoginButtonBaseInput(): DeltaInput {
  return {
    componentKey: 'LoginButton',
    state: 'base',
    nodeId: '23:26',
    baseline: {
      fill: {
        raw: '#3B82F6',
        canonical: 'color.primary',
        source: 'canonical-resolution',
      },
    },
    figmaState: {
      fill: {
        raw: '#3B82F6',
        isExplicit: true,
      },
    },
  };
}

function createLoginButtonHoverInput(): DeltaInput {
  return {
    componentKey: 'LoginButton',
    state: 'hover',
    nodeId: '23:28',
    baseline: {
      fill: {
        raw: '#2563EB',
        canonical: 'color.secondary',
        source: 'canonical-resolution',
      },
    },
    figmaState: {
      fill: {
        raw: '#10B981', // Changed to green
        isExplicit: true,
      },
    },
  };
}

// =============================================================================
// CANONICAL RESOLUTION
// =============================================================================

describe('resolveToCanonical', () => {
  it('resolves hex color to canonical token', () => {
    expect(resolveToCanonical('fill', '#3B82F6')).toBe('color.primary');
    expect(resolveToCanonical('fill', '#2563EB')).toBe('color.secondary');
    expect(resolveToCanonical('fill', '#10B981')).toBe('color.success');
  });

  it('normalizes hex to uppercase for lookup', () => {
    expect(resolveToCanonical('fill', '#3b82f6')).toBe('color.primary');
  });

  it('returns undefined for unknown hex', () => {
    expect(resolveToCanonical('fill', '#ABCDEF')).toBeUndefined();
  });

  it('resolves spacing values to canonical tokens', () => {
    expect(resolveToCanonical('padding', 16)).toBe('space.md');
    expect(resolveToCanonical('gap', 8)).toBe('space.sm');
    expect(resolveToCanonical('padding', 0)).toBe('space.none');
  });

  it('returns undefined for unknown spacing values', () => {
    expect(resolveToCanonical('padding', 13)).toBeUndefined();
  });

  it('resolves font sizes to canonical tokens', () => {
    expect(resolveToCanonical('fontSize', 16)).toBe('text.size.md');
    expect(resolveToCanonical('fontSize', 24)).toBe('text.size.2xl');
  });

  it('resolves font weights to canonical tokens', () => {
    expect(resolveToCanonical('fontWeight', 700)).toBe('text.weight.bold');
    expect(resolveToCanonical('fontWeight', 400)).toBe('text.weight.normal');
  });
});

// =============================================================================
// DELTA DETECTION - SINGLE PROPERTY
// =============================================================================

describe('detectDeltaForProperty', () => {
  it('detects fill change with canonical tokens', () => {
    const baseline: BaselineValue = {
      raw: '#2563EB',
      canonical: 'color.secondary',
      source: 'canonical-resolution',
    };
    const figmaState: FigmaPropertyState = {
      raw: '#10B981',
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('fill', baseline, figmaState);

    expect(delta).toBeDefined();
    expect(delta?.property).toBe('fill');
    expect(delta?.from).toBe('#2563EB');
    expect(delta?.to).toBe('#10B981');
    expect(delta?.canonicalFrom).toBe('color.secondary');
    expect(delta?.canonicalTo).toBe('color.success');
    expect(delta?.confidence).toBe('high');
    expect(delta?.reason).toContain('Explicit change in Figma');
  });

  it('returns undefined for unchanged property', () => {
    const baseline: BaselineValue = {
      raw: '#3B82F6',
      canonical: 'color.primary',
      source: 'canonical-resolution',
    };
    const figmaState: FigmaPropertyState = {
      raw: '#3B82F6',
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('fill', baseline, figmaState);
    expect(delta).toBeUndefined();
  });

  it('handles case-insensitive hex comparison', () => {
    const baseline: BaselineValue = {
      raw: '#3B82F6',
      canonical: 'color.primary',
      source: 'canonical-resolution',
    };
    const figmaState: FigmaPropertyState = {
      raw: '#3b82f6', // Lowercase
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('fill', baseline, figmaState);
    expect(delta).toBeUndefined(); // Should be considered equal
  });

  it('returns undefined when no Figma state', () => {
    const baseline: BaselineValue = {
      raw: '#3B82F6',
      canonical: 'color.primary',
      source: 'canonical-resolution',
    };

    const delta = detectDeltaForProperty('fill', baseline, undefined);
    expect(delta).toBeUndefined();
  });

  it('detects new property when no baseline', () => {
    const figmaState: FigmaPropertyState = {
      raw: '#10B981',
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('fill', undefined, figmaState);

    expect(delta).toBeDefined();
    expect(delta?.from).toBeUndefined();
    expect(delta?.to).toBe('#10B981');
    expect(delta?.canonicalTo).toBe('color.success');
    expect(delta?.reason).toContain('New fill value');
  });

  it('adds normalization note when canonical not found', () => {
    const baseline: BaselineValue = {
      raw: '#AABBCC',
      source: 'explicit',
    };
    const figmaState: FigmaPropertyState = {
      raw: '#DDEEFF', // Unknown hex
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('fill', baseline, figmaState);

    expect(delta).toBeDefined();
    expect(delta?.canonicalTo).toBeUndefined();
    expect(delta?.normalizationNote).toContain('Could not map');
  });

  it('sets medium confidence for non-explicit Figma state', () => {
    const baseline: BaselineValue = {
      raw: '#3B82F6',
      canonical: 'color.primary',
      source: 'canonical-resolution',
    };
    const figmaState: FigmaPropertyState = {
      raw: '#10B981',
      isExplicit: false, // Bound/indirect
    };

    const delta = detectDeltaForProperty('fill', baseline, figmaState);

    expect(delta).toBeDefined();
    expect(delta?.confidence).toBe('medium');
  });

  it('detects spacing changes', () => {
    const baseline: BaselineValue = {
      raw: 16,
      canonical: 'space.md',
      source: 'canonical-resolution',
    };
    const figmaState: FigmaPropertyState = {
      raw: 24,
      isExplicit: true,
    };

    const delta = detectDeltaForProperty('padding', baseline, figmaState);

    expect(delta).toBeDefined();
    expect(delta?.from).toBe(16);
    expect(delta?.to).toBe(24);
    expect(delta?.canonicalFrom).toBe('space.md');
    expect(delta?.canonicalTo).toBe('space.lg');
  });
});

// =============================================================================
// VARIANT DELTA GENERATION
// =============================================================================

describe('generateDeltasForVariant', () => {
  it('detects fill change on hover variant', () => {
    const input = createLoginButtonHoverInput();
    const output = generateDeltasForVariant(input);

    expect(output.componentKey).toBe('LoginButton');
    expect(output.state).toBe('hover');
    expect(output.nodeId).toBe('23:28');
    expect(output.deltas).toHaveLength(1);

    const delta = output.deltas[0];
    expect(delta.property).toBe('fill');
    expect(delta.from).toBe('#2563EB');
    expect(delta.to).toBe('#10B981');
  });

  it('ignores unchanged properties', () => {
    const input = createLoginButtonBaseInput();
    const output = generateDeltasForVariant(input);

    expect(output.deltas).toHaveLength(0);
    expect(output.unchangedProperties).toContain('fill');
  });

  it('generates multiple deltas on same variant', () => {
    const input: DeltaInput = {
      componentKey: 'Card',
      state: 'hover',
      nodeId: 'CARD:hover',
      baseline: {
        fill: {
          raw: '#3B82F6',
          canonical: 'color.primary',
          source: 'canonical-resolution',
        },
        padding: {
          raw: 16,
          canonical: 'space.md',
          source: 'canonical-resolution',
        },
        gap: {
          raw: 8,
          canonical: 'space.sm',
          source: 'canonical-resolution',
        },
      },
      figmaState: {
        fill: {
          raw: '#10B981', // Changed
          isExplicit: true,
        },
        padding: {
          raw: 24, // Changed
          isExplicit: true,
        },
        gap: {
          raw: 8, // Unchanged
          isExplicit: true,
        },
      },
    };

    const output = generateDeltasForVariant(input);

    expect(output.deltas).toHaveLength(2);
    expect(output.deltas.map((d) => d.property)).toEqual(
      expect.arrayContaining(['fill', 'padding'])
    );
    expect(output.unchangedProperties).toContain('gap');
  });

  it('tracks metadata correctly', () => {
    const input = createLoginButtonHoverInput();
    const output = generateDeltasForVariant(input);

    expect(output.meta.propertiesChecked).toBe(1);
    expect(output.meta.deltasDetected).toBe(1);
    expect(output.meta.canonicalResolved).toBe(1);
  });

  it('handles missing canonical gracefully', () => {
    const input: DeltaInput = {
      componentKey: 'CustomButton',
      state: 'base',
      nodeId: 'CUSTOM:1',
      baseline: {
        fill: {
          raw: '#AABBCC', // No canonical mapping
          source: 'explicit',
        },
      },
      figmaState: {
        fill: {
          raw: '#DDEEFF', // Also no canonical mapping
          isExplicit: true,
        },
      },
    };

    const output = generateDeltasForVariant(input);

    expect(output.deltas).toHaveLength(1);
    const delta = output.deltas[0];
    expect(delta.canonicalFrom).toBeUndefined();
    expect(delta.canonicalTo).toBeUndefined();
    expect(delta.normalizationNote).toBeDefined();
    expect(output.meta.canonicalResolved).toBe(0);
    expect(output.meta.normalizationNotes).toBe(1);
  });
});

// =============================================================================
// BATCH DELTA GENERATION
// =============================================================================

describe('generateDeltas', () => {
  it('generates deltas for multiple variants', () => {
    const input: BatchDeltaInput = {
      sourceFile: 'demo-app/src/App.tsx',
      inputs: [createLoginButtonBaseInput(), createLoginButtonHoverInput()],
    };

    const output = generateDeltas(input);

    expect(output.sourceFile).toBe('demo-app/src/App.tsx');
    expect(output.results).toHaveLength(2);
    expect(output.summary.totalVariants).toBe(2);
    expect(output.summary.variantsWithDeltas).toBe(1);
    expect(output.summary.totalDeltas).toBe(1);
  });

  it('calculates summary statistics correctly', () => {
    const input: BatchDeltaInput = {
      sourceFile: 'test.tsx',
      inputs: [
        {
          componentKey: 'A',
          state: 'hover',
          nodeId: 'A:1',
          baseline: {
            fill: { raw: '#3B82F6', canonical: 'color.primary', source: 'canonical-resolution' },
          },
          figmaState: {
            fill: { raw: '#10B981', isExplicit: true },
          },
        },
        {
          componentKey: 'B',
          state: 'hover',
          nodeId: 'B:1',
          baseline: {
            padding: { raw: 16, canonical: 'space.md', source: 'canonical-resolution' },
          },
          figmaState: {
            padding: { raw: 24, isExplicit: true },
          },
        },
      ],
    };

    const output = generateDeltas(input);

    expect(output.summary.totalDeltas).toBe(2);
    expect(output.summary.variantsWithDeltas).toBe(2);
    expect(output.summary.deltasByProperty.fill).toBe(1);
    expect(output.summary.deltasByProperty.padding).toBe(1);
    expect(output.summary.deltasByConfidence.high).toBe(2);
  });
});

// =============================================================================
// COMPONENT SET FILTERING
// =============================================================================

describe('isVariantTarget', () => {
  it('returns true for variant nodeId', () => {
    const input: DeltaInput = {
      componentKey: 'LoginButton',
      state: 'hover',
      nodeId: '23:28', // Variant nodeId
      baseline: {},
      figmaState: {},
    };

    expect(isVariantTarget(input, '23:27')).toBe(true); // Component Set is different
  });

  it('returns false for Component Set nodeId', () => {
    const input: DeltaInput = {
      componentKey: 'LoginButton',
      state: 'base',
      nodeId: '23:27', // Same as Component Set
      baseline: {},
      figmaState: {},
    };

    expect(isVariantTarget(input, '23:27')).toBe(false);
  });

  it('returns true when no Component Set to check', () => {
    const input: DeltaInput = {
      componentKey: 'SimpleButton',
      state: 'base',
      nodeId: 'NODE:1',
      baseline: {},
      figmaState: {},
    };

    expect(isVariantTarget(input, undefined)).toBe(true);
  });
});

describe('filterVariantTargets', () => {
  it('filters out Component Set nodeIds', () => {
    const inputs: DeltaInput[] = [
      {
        componentKey: 'LoginButton',
        state: 'hover',
        nodeId: '23:28', // Valid variant
        baseline: {},
        figmaState: {},
      },
      {
        componentKey: 'LoginButton',
        state: 'invalid',
        nodeId: '23:27', // Same as Component Set - should be filtered
        baseline: {},
        figmaState: {},
      },
    ];

    const componentSetNodeIds = new Map([['LoginButton', '23:27']]);
    const filtered = filterVariantTargets(inputs, componentSetNodeIds);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].nodeId).toBe('23:28');
  });

  it('preserves all inputs when no Component Sets to filter', () => {
    const inputs: DeltaInput[] = [
      { componentKey: 'A', state: 'base', nodeId: 'A:1', baseline: {}, figmaState: {} },
      { componentKey: 'B', state: 'base', nodeId: 'B:1', baseline: {}, figmaState: {} },
    ];

    const filtered = filterVariantTargets(inputs, new Map());

    expect(filtered).toHaveLength(2);
  });
});
