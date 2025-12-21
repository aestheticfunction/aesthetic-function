/**
 * @aesthetic-function/watcher - figmaSuggestions/__tests__/generateSuggestions.test.ts
 *
 * Tests for Figma Composition Suggestion Generator (Phase 11A).
 *
 * These tests verify:
 * 1. Component set suggestions when missing from map
 * 2. No suggestion when component already mapped
 * 3. Explicit-only variant suggestions (markers/overrides)
 * 4. No inferred variants from semantics
 * 5. Token usage suggestions
 * 6. Coverage gap suggestions
 * 7. Deterministic ordering
 */

import { describe, it, expect } from 'vitest';
import {
  generateFigmaSuggestions,
} from '../generateSuggestions.js';
import type { FigmaSuggestionInput } from '../types.js';
import type { AnchoredAstReport, Anchor, SourceLocation } from '../../ast/types.js';
import type { FileAdapterResult } from '../../ast/parseIntentFromReactAst.js';
import type { ComponentMap, ComponentEntry } from '../../reconcile/componentMap.js';
import type { CanonicalSemantics } from '../../tokens/canonical/types.js';
import type { CanonicalResolution } from '../../canonicalResolver/types.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockLocation(): SourceLocation {
  return { startLine: 1, endLine: 1 };
}

function createMockAnchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    nodeName: overrides.nodeName ?? 'TestComponent',
    markerLine: 1,
    componentName: overrides.componentName ?? 'TestComponent',
    componentKey: overrides.componentKey ?? 'TestComponent',
    extracted: {
      text: [],
      fills: [],
    },
    notes: [],
    ...overrides,
  };
}

function createMockAnchoredReport(anchors: Anchor[] = []): AnchoredAstReport {
  return {
    filePath: 'test.tsx',
    anchors,
  };
}

function createMockAdapterResult(): FileAdapterResult {
  return {
    filePath: 'test.tsx',
    components: [],
    totalContributions: 0,
    canonicalSummary: {
      totalCanonicalFields: 0,
      totalRawFields: 0,
      totalNotes: 0,
    },
  };
}

function createMockComponentMap(components: Record<string, { name: string }> = {}): ComponentMap {
  const mapped: Record<string, ComponentEntry> = {};
  for (const [key, val] of Object.entries(components)) {
    mapped[key] = {
      componentKey: key,
      figma: {
        name: val.name,
        variants: {},
      },
    };
  }
  return {
    version: 2,
    components: mapped,
  };
}

function createMockInput(overrides: Partial<FigmaSuggestionInput> = {}): FigmaSuggestionInput {
  return {
    anchoredReport: createMockAnchoredReport(),
    adapterResult: createMockAdapterResult(),
    canonicalSemantics: new Map(),
    canonicalResolution: new Map(),
    componentMap: createMockComponentMap(),
    explicitVariantStates: new Map(),
    ...overrides,
  };
}

// =============================================================================
// COMPONENT SET SUGGESTION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Component Set Suggestions', () => {
  it('suggests component set when component has canonical semantics and is not in map', () => {
    const anchors = [createMockAnchor({ componentKey: 'LoginButton', componentName: 'LoginButton' })];
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('LoginButton', {
      colors: {
        fill: {
          value: 'color.primary',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
      componentMap: createMockComponentMap(), // empty map
    });

    const result = generateFigmaSuggestions(input);

    expect(result.suggestions.some(s => 
      s.type === 'component-set' && 
      s.componentKey === 'LoginButton'
    )).toBe(true);
    expect(result.countByType['component-set']).toBeGreaterThan(0);
  });

  it('does not suggest component set when component already exists in map', () => {
    const anchors = [createMockAnchor({ componentKey: 'LoginButton', componentName: 'LoginButton' })];
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('LoginButton', {
      colors: {
        fill: {
          value: 'color.primary',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
      componentMap: createMockComponentMap({ 'LoginButton': { name: 'Login Button' } }),
    });

    const result = generateFigmaSuggestions(input);

    expect(result.suggestions.filter(s => 
      s.type === 'component-set' && 
      s.componentKey === 'LoginButton'
    )).toHaveLength(0);
  });

  it('does not suggest component set when component has no canonical semantics', () => {
    const anchors = [createMockAnchor({ componentKey: 'PlainDiv', componentName: 'PlainDiv' })];

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics: new Map(), // no canonical semantics
      componentMap: createMockComponentMap(),
    });

    const result = generateFigmaSuggestions(input);

    expect(result.suggestions.filter(s => 
      s.type === 'component-set' && 
      s.componentKey === 'PlainDiv'
    )).toHaveLength(0);
  });
});

// =============================================================================
// VARIANT SUGGESTION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Variant Suggestions', () => {
  it('suggests variants from explicit marker states', () => {
    const explicitVariantStates = new Map<string, string[]>();
    explicitVariantStates.set('LoginButton', ['hover', 'disabled']);

    const input = createMockInput({
      explicitVariantStates,
    });

    const result = generateFigmaSuggestions(input);

    const variantSuggestions = result.suggestions.filter(s => 
      s.type === 'variant' && 
      s.componentKey === 'LoginButton'
    );
    expect(variantSuggestions).toHaveLength(2);
    expect(variantSuggestions.map(s => s.details?.variantState)).toContain('hover');
    expect(variantSuggestions.map(s => s.details?.variantState)).toContain('disabled');
  });

  it('does not infer variants from disabled boolean semantics', () => {
    // Even if component has disabled={true} in JSX, we should NOT infer variant
    const anchors = [createMockAnchor({ componentKey: 'DisabledButton', componentName: 'DisabledButton' })];
    
    // Canonical semantics might have disabled info, but no explicit state marker
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('DisabledButton', {
      colors: {
        fill: {
          value: 'color.neutral',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
      explicitVariantStates: new Map(), // no explicit states
    });

    const result = generateFigmaSuggestions(input);

    // Should not have any variant suggestions for DisabledButton
    expect(result.suggestions.filter(s => 
      s.type === 'variant' && 
      s.componentKey === 'DisabledButton'
    )).toHaveLength(0);
  });

  it('uses explicit-only variant sources in details', () => {
    const explicitVariantStates = new Map<string, string[]>();
    explicitVariantStates.set('Button', ['pressed']);

    const input = createMockInput({
      explicitVariantStates,
    });

    const result = generateFigmaSuggestions(input);

    const variantSuggestion = result.suggestions.find(s => 
      s.type === 'variant' && 
      s.details?.variantState === 'pressed'
    );
    expect(variantSuggestion).toBeDefined();
    expect(variantSuggestion?.details?.sourceType).toBe('explicit-marker-or-override');
  });
});

// =============================================================================
// PROPERTY SUGGESTION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Property Suggestions', () => {
  it('suggests Fill property from canonical color semantics', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Card', {
      colors: {
        fill: {
          value: 'color.primary',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'Card' &&
      s.details?.category === 'colors'
    );
    expect(propertySuggestion).toBeDefined();
    expect(propertySuggestion?.details?.figmaProperty).toBe('Fill');
    expect(propertySuggestion?.details?.canonicalToken).toBe('color.primary');
  });

  it('suggests Auto Layout Gap from canonical spacing semantics', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Container', {
      spacing: {
        gap: {
          value: 'space.md',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'Container' &&
      s.details?.field === 'gap'
    );
    expect(propertySuggestion).toBeDefined();
    expect(propertySuggestion?.details?.figmaProperty).toBe('Auto Layout Gap');
  });

  it('suggests Corner Radius from canonical radius semantics', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('RoundedBox', {
      radius: {
        borderRadius: {
          value: 'radius.md',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'RoundedBox' &&
      s.details?.category === 'radius'
    );
    expect(propertySuggestion).toBeDefined();
    expect(propertySuggestion?.details?.figmaProperty).toBe('Corner Radius');
  });

  it('suggests Text Style from canonical typography semantics', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Heading', {
      typography: {
        fontSize: {
          value: 'text.size.xl',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'Heading' &&
      s.details?.category === 'typography'
    );
    expect(propertySuggestion).toBeDefined();
    expect(propertySuggestion?.details?.figmaProperty).toBe('Text Style');
  });
});

// =============================================================================
// TOKEN USAGE SUGGESTION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Token Usage Suggestions', () => {
  it('suggests using token instead of hard-coded value when resolution is clean', () => {
    const canonicalResolution = new Map<string, CanonicalResolution>();
    canonicalResolution.set('Button', {
      colors: {
        fill: {
          canonical: 'color.primary',
          resolved: '#3B82F6',
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
      spacing: {},
      radius: {},
      typography: {},
      meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
    });

    const input = createMockInput({
      canonicalResolution,
    });

    const result = generateFigmaSuggestions(input);

    const tokenSuggestion = result.suggestions.find(s => 
      s.type === 'token-usage' && 
      s.componentKey === 'Button' &&
      s.details?.canonicalToken === 'color.primary'
    );
    expect(tokenSuggestion).toBeDefined();
    expect(tokenSuggestion?.message).toContain('#3B82F6');
    expect(tokenSuggestion?.confidence).toBe('high');
  });

  it('does not suggest token usage for low confidence resolutions', () => {
    const canonicalResolution = new Map<string, CanonicalResolution>();
    canonicalResolution.set('Button', {
      colors: {
        fill: {
          canonical: 'color.primary',
          resolved: '#3B82F6',
          confidence: 'low', // low confidence
          source: 'generic-jsx',
        },
      },
      spacing: {},
      radius: {},
      typography: {},
      meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
    });

    const input = createMockInput({
      canonicalResolution,
    });

    const result = generateFigmaSuggestions(input);

    // Should not have token-usage suggestion for low confidence
    expect(result.suggestions.filter(s => 
      s.type === 'token-usage' && 
      s.componentKey === 'Button'
    )).toHaveLength(0);
  });
});

// =============================================================================
// COVERAGE GAP SUGGESTION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Coverage Gap Suggestions', () => {
  it('suggests coverage gap from coverage report gaps', () => {
    const input = createMockInput({
      coverageReport: {
        totals: { canonicalFields: 5, resolved: 3, unresolved: 2 },
        byCategory: {
          colors: { canonicalFields: 2, resolved: 1, unresolved: 1 },
          spacing: { canonicalFields: 1, resolved: 1, unresolved: 0 },
          radius: { canonicalFields: 1, resolved: 1, unresolved: 0 },
          typography: { canonicalFields: 1, resolved: 0, unresolved: 1 },
        },
        gaps: [
          { canonical: 'color.accent', category: 'colors', note: 'No mapping found' },
          { canonical: 'text.size.3xl', category: 'typography', note: 'Not in typography scale' },
        ],
      },
    });

    const result = generateFigmaSuggestions(input);

    const coverageGapSuggestions = result.suggestions.filter(s => s.type === 'coverage-gap');
    expect(coverageGapSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(coverageGapSuggestions.some(s => s.details?.canonical === 'color.accent')).toBe(true);
    expect(coverageGapSuggestions.some(s => s.details?.canonical === 'text.size.3xl')).toBe(true);
  });

  it('suggests coverage gap from policy violations', () => {
    const input = createMockInput({
      policyViolations: [
        {
          canonical: '#FF0000',
          category: 'colors',
          reason: 'Raw hex not allowed in token-only mode',
          componentKey: 'BadButton',
        },
      ],
    });

    const result = generateFigmaSuggestions(input);

    const coverageGapSuggestion = result.suggestions.find(s => 
      s.type === 'coverage-gap' && 
      s.source === 'policy' &&
      s.details?.canonical === '#FF0000'
    );
    expect(coverageGapSuggestion).toBeDefined();
    expect(coverageGapSuggestion?.componentKey).toBe('BadButton');
  });
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe('generateFigmaSuggestions - Deterministic Output', () => {
  it('produces same output for same input across multiple calls', () => {
    const anchors = [
      createMockAnchor({ componentKey: 'ZButton', componentName: 'ZButton' }),
      createMockAnchor({ componentKey: 'AButton', componentName: 'AButton' }),
      createMockAnchor({ componentKey: 'MButton', componentName: 'MButton' }),
    ];
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    for (const anchor of anchors) {
      canonicalSemantics.set(anchor.componentKey!, {
        colors: {
          fill: {
            value: 'color.primary',
            loc: createMockLocation(),
            confidence: 'high',
            source: 'generic-jsx',
          },
        },
      });
    }

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
    });

    const result1 = generateFigmaSuggestions(input);
    const result2 = generateFigmaSuggestions(input);
    const result3 = generateFigmaSuggestions(input);

    // Should be exactly the same
    expect(result1.suggestions).toEqual(result2.suggestions);
    expect(result2.suggestions).toEqual(result3.suggestions);
  });

  it('sorts suggestions by componentKey, then by type', () => {
    const anchors = [
      createMockAnchor({ componentKey: 'Zebra', componentName: 'Zebra' }),
      createMockAnchor({ componentKey: 'Apple', componentName: 'Apple' }),
    ];
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Zebra', {
      colors: { fill: { value: 'color.primary', loc: createMockLocation(), confidence: 'high', source: 'generic-jsx' } },
    });
    canonicalSemantics.set('Apple', {
      colors: { fill: { value: 'color.secondary', loc: createMockLocation(), confidence: 'high', source: 'generic-jsx' } },
    });

    const explicitVariantStates = new Map<string, string[]>();
    explicitVariantStates.set('Apple', ['hover']);

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
      explicitVariantStates,
    });

    const result = generateFigmaSuggestions(input);

    // Find index of first Apple and first Zebra suggestion
    const appleIdx = result.suggestions.findIndex(s => s.componentKey === 'Apple');
    const zebraIdx = result.suggestions.findIndex(s => s.componentKey === 'Zebra');

    // Apple should come before Zebra (alphabetical)
    expect(appleIdx).toBeLessThan(zebraIdx);
  });
});

// =============================================================================
// CONFIDENCE LEVEL TESTS
// =============================================================================

describe('generateFigmaSuggestions - Confidence Levels', () => {
  it('maps high confidence canonical semantics to high confidence suggestions', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('HighConfButton', {
      colors: {
        fill: {
          value: 'color.primary',
          loc: createMockLocation(),
          confidence: 'high',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'HighConfButton'
    );
    expect(propertySuggestion?.confidence).toBe('high');
  });

  it('maps medium confidence canonical semantics to medium confidence suggestions', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('MedConfButton', {
      colors: {
        fill: {
          value: 'color.primary',
          loc: createMockLocation(),
          confidence: 'medium',
          source: 'generic-jsx',
        },
      },
    });

    const input = createMockInput({
      canonicalSemantics,
    });

    const result = generateFigmaSuggestions(input);

    const propertySuggestion = result.suggestions.find(s => 
      s.type === 'property' && 
      s.componentKey === 'MedConfButton'
    );
    expect(propertySuggestion?.confidence).toBe('medium');
  });
});

// =============================================================================
// COUNT AGGREGATION TESTS
// =============================================================================

describe('generateFigmaSuggestions - Count Aggregation', () => {
  it('correctly counts suggestions by type', () => {
    const anchors = [
      createMockAnchor({ componentKey: 'Button1', componentName: 'Button1' }),
      createMockAnchor({ componentKey: 'Button2', componentName: 'Button2' }),
    ];
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Button1', {
      colors: { fill: { value: 'color.primary', loc: createMockLocation(), confidence: 'high', source: 'generic-jsx' } },
    });
    canonicalSemantics.set('Button2', {
      colors: { fill: { value: 'color.secondary', loc: createMockLocation(), confidence: 'high', source: 'generic-jsx' } },
    });

    const explicitVariantStates = new Map<string, string[]>();
    explicitVariantStates.set('Button1', ['hover', 'disabled']);

    const input = createMockInput({
      anchoredReport: createMockAnchoredReport(anchors),
      canonicalSemantics,
      explicitVariantStates,
    });

    const result = generateFigmaSuggestions(input);

    // Should have counts for each type
    expect(result.countByType['component-set']).toBe(2); // 2 new buttons
    expect(result.countByType.variant).toBe(2); // hover + disabled
    expect(result.countByType.property).toBeGreaterThanOrEqual(2); // at least 2 color properties
  });

  it('correctly counts suggestions by source', () => {
    const canonicalSemantics = new Map<string, CanonicalSemantics>();
    canonicalSemantics.set('Button', {
      colors: { fill: { value: 'color.primary', loc: createMockLocation(), confidence: 'high', source: 'generic-jsx' } },
    });

    const input = createMockInput({
      canonicalSemantics,
      policyViolations: [
        { canonical: '#FF0000', category: 'colors', reason: 'Raw hex', componentKey: 'BadButton' },
      ],
      coverageReport: {
        totals: { canonicalFields: 1, resolved: 0, unresolved: 1 },
        byCategory: {
          colors: { canonicalFields: 1, resolved: 0, unresolved: 1 },
          spacing: { canonicalFields: 0, resolved: 0, unresolved: 0 },
          radius: { canonicalFields: 0, resolved: 0, unresolved: 0 },
          typography: { canonicalFields: 0, resolved: 0, unresolved: 0 },
        },
        gaps: [{ canonical: 'color.accent', category: 'colors', note: 'missing' }],
      },
    });

    const result = generateFigmaSuggestions(input);

    // Should have canonical and policy/coverage sources
    expect(result.countBySource.canonical).toBeGreaterThanOrEqual(1);
    expect(result.countBySource.policy).toBe(1);
    expect(result.countBySource.coverage).toBe(1);
  });
});
