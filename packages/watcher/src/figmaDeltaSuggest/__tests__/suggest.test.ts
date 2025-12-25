/**
 * @aesthetic-function/watcher - figmaDeltaSuggest/__tests__/suggest.test.ts
 *
 * Unit tests for Phase 12B delta suggestion generation.
 *
 * Tests:
 * 1. Non-base hover delta + existing hover marker → suggests marker
 * 2. Non-base hover delta + existing hover override → suggests override (priority)
 * 3. Non-base hover delta + neither exists → suggests override creation
 * 4. Base delta with auto-writable inline style literal → suggests ast
 * 5. Base delta not auto-writable (variable ref) → suggests marker or override
 * 6. Determinism: same inputs produce identical sorted output
 */

import { describe, it, expect } from 'vitest';
import { generateDeltaSuggestions } from '../suggest.js';
import {
  isNonBaseState,
  canSuggestAstWrite,
  chooseSuggestionTarget,
  findAutoWritableValue,
} from '../policy.js';
import type { SuggestInput } from '../types.js';
import type { DeltaOutput, FigmaDelta } from '../../figmaDelta/types.js';
import type { ComponentMap } from '../../reconcile/componentMap.js';
import type { WriteFeasibilityReport } from '../../ast/types.js';

// =============================================================================
// FIXTURES
// =============================================================================

function createComponentMap(): ComponentMap {
  return {
    version: 2,
    components: {
      LoginButton: {
        figma: {
          name: 'LoginButton',
          componentSetNodeId: '23:27',
          variants: {
            base: { nodeId: '23:26' },
            hover: { nodeId: '23:28' },
            disabled: { nodeId: '23:29' },
          },
        },
      },
      Card: {
        figma: {
          name: 'Card',
          variants: {
            base: { nodeId: 'CARD:1' },
          },
        },
      },
    },
  };
}

function createDeltaOutput(
  componentKey: string,
  state: string,
  nodeId: string,
  deltas: FigmaDelta[]
): DeltaOutput {
  return {
    componentKey,
    state,
    nodeId,
    deltas,
    unchangedProperties: [],
    meta: {
      propertiesChecked: deltas.length,
      deltasDetected: deltas.length,
      canonicalResolved: deltas.filter((d) => d.canonicalTo).length,
      normalizationNotes: 0,
    },
  };
}

function createFillDelta(
  from: string,
  to: string,
  canonicalFrom?: string,
  canonicalTo?: string
): FigmaDelta {
  return {
    property: 'fill',
    from,
    to,
    canonicalFrom,
    canonicalTo,
    confidence: 'high',
    reason: 'Explicit change in Figma',
  };
}

function createWriteFeasibilityReport(
  nodeName: string,
  autoWritablePaths: string[] = []
): WriteFeasibilityReport {
  const autoWritable = autoWritablePaths.map((path) => ({
    path,
    level: 'auto-writable' as const,
    reason: 'literal' as const,
    explanation: 'Direct literal value',
    loc: { startLine: 10, endLine: 10 },
  }));

  return {
    filePath: 'test.tsx',
    reports: [
      {
        nodeName,
        componentName: nodeName,
        autoWritable,
        conditionallyWritable: [],
        notWritable: [],
        summary: {
          totalValues: autoWritable.length,
          autoWritableCount: autoWritable.length,
          conditionallyWritableCount: 0,
          notWritableCount: 0,
        },
      },
    ],
    summary: {
      totalNodes: 1,
      totalValues: autoWritable.length,
      autoWritableCount: autoWritable.length,
      conditionallyWritableCount: 0,
      notWritableCount: 0,
    },
  };
}

// =============================================================================
// POLICY TESTS
// =============================================================================

describe('policy functions', () => {
  describe('isNonBaseState', () => {
    it('returns false for base state', () => {
      expect(isNonBaseState('base')).toBe(false);
    });

    it('returns true for hover state', () => {
      expect(isNonBaseState('hover')).toBe(true);
    });

    it('returns true for pressed state', () => {
      expect(isNonBaseState('pressed')).toBe(true);
    });

    it('returns true for disabled state', () => {
      expect(isNonBaseState('disabled')).toBe(true);
    });
  });

  describe('findAutoWritableValue', () => {
    it('finds auto-writable fill value', () => {
      const report = createWriteFeasibilityReport('LoginButton', ['visual.fills']).reports[0];
      const result = findAutoWritableValue('fill', report);
      expect(result).toBeDefined();
      expect(result?.path).toBe('visual.fills');
    });

    it('returns undefined for non-writable property', () => {
      const report = createWriteFeasibilityReport('LoginButton', []).reports[0];
      const result = findAutoWritableValue('fill', report);
      expect(result).toBeUndefined();
    });
  });

  describe('canSuggestAstWrite', () => {
    it('returns false for non-base state', () => {
      const report = createWriteFeasibilityReport('LoginButton', ['visual.fills']).reports[0];
      expect(canSuggestAstWrite('hover', 'fill', report)).toBe(false);
    });

    it('returns true for base state with auto-writable', () => {
      const report = createWriteFeasibilityReport('LoginButton', ['visual.fills']).reports[0];
      expect(canSuggestAstWrite('base', 'fill', report)).toBe(true);
    });

    it('returns false for base state without auto-writable', () => {
      const report = createWriteFeasibilityReport('LoginButton', []).reports[0];
      expect(canSuggestAstWrite('base', 'fill', report)).toBe(false);
    });
  });

  describe('chooseSuggestionTarget', () => {
    it('chooses override for hover state with existing override', () => {
      const result = chooseSuggestionTarget({
        componentKey: 'LoginButton',
        state: 'hover',
        property: 'fill',
        hasOverride: true,
        overrideKey: 'LoginButton::hover',
        hasMarker: false,
        variantNodeId: '23:28',
      });

      expect(result.target).toBe('override');
      expect(result.kind).toBe('UPDATE_OVERRIDE');
      expect(result.evidence.overrideKey).toBe('LoginButton::hover');
    });

    it('chooses marker for hover state with existing marker (no override)', () => {
      const result = chooseSuggestionTarget({
        componentKey: 'LoginButton',
        state: 'hover',
        property: 'fill',
        hasOverride: false,
        hasMarker: true,
        markerLine: 25,
        variantNodeId: '23:28',
      });

      expect(result.target).toBe('marker');
      expect(result.kind).toBe('UPDATE_MARKER');
      expect(result.evidence.markerLine).toBe(25);
    });

    it('suggests override creation for hover state with neither', () => {
      const result = chooseSuggestionTarget({
        componentKey: 'LoginButton',
        state: 'hover',
        property: 'fill',
        hasOverride: false,
        hasMarker: false,
        variantNodeId: '23:28',
      });

      expect(result.target).toBe('override');
      expect(result.kind).toBe('UPDATE_OVERRIDE');
      expect(result.reason).toContain('suggesting new override');
    });

    it('chooses ast for base state with auto-writable', () => {
      const report = createWriteFeasibilityReport('LoginButton', ['visual.fills']).reports[0];
      const result = chooseSuggestionTarget({
        componentKey: 'LoginButton',
        state: 'base',
        property: 'fill',
        hasOverride: false,
        hasMarker: false,
        writeSafetyReport: report,
        variantNodeId: '23:26',
      });

      expect(result.target).toBe('ast');
      expect(result.kind).toBe('AST_WRITE_PATCH');
      expect(result.evidence.astLoc).toBeDefined();
    });

    it('chooses override for base state without auto-writable', () => {
      const report = createWriteFeasibilityReport('LoginButton', []).reports[0];
      const result = chooseSuggestionTarget({
        componentKey: 'LoginButton',
        state: 'base',
        property: 'fill',
        hasOverride: true,
        overrideKey: 'LoginButton',
        hasMarker: false,
        writeSafetyReport: report,
        variantNodeId: '23:26',
      });

      expect(result.target).toBe('override');
      expect(result.kind).toBe('UPDATE_OVERRIDE');
    });
  });
});

// =============================================================================
// SUGGESTION GENERATION TESTS
// =============================================================================

describe('generateDeltaSuggestions', () => {
  it('suggests marker for hover delta with existing hover marker', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [
        {
          node: 'LoginButton',
          state: 'hover',
          rawLine: '// @figma node=LoginButton state=hover fill=#2563EB',
          lineNumber: 25,
        },
      ],
      overrides: null,
      deltas: [
        createDeltaOutput('LoginButton', 'hover', '23:28', [
          createFillDelta('#2563EB', '#10B981', 'color.secondary', 'color.success'),
        ]),
      ],
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.suggestedTarget).toBe('marker');
    expect(suggestion.kind).toBe('UPDATE_MARKER');
    expect(suggestion.evidence.markerLine).toBe(25);
  });

  it('suggests override for hover delta with existing hover override (priority over marker)', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [
        {
          node: 'LoginButton',
          state: 'hover',
          rawLine: '// @figma node=LoginButton state=hover',
          lineNumber: 25,
        },
      ],
      overrides: {
        'LoginButton::hover': {
          nodeId: '23:28',
          lastUpdated: '2025-01-01T00:00:00.000Z',
          fill: '#2563EB',
        },
      },
      deltas: [
        createDeltaOutput('LoginButton', 'hover', '23:28', [
          createFillDelta('#2563EB', '#10B981', 'color.secondary', 'color.success'),
        ]),
      ],
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.suggestedTarget).toBe('override');
    expect(suggestion.kind).toBe('UPDATE_OVERRIDE');
    expect(suggestion.evidence.overrideKey).toBe('LoginButton::hover');
  });

  it('suggests override creation for hover delta with neither marker nor override', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: null,
      deltas: [
        createDeltaOutput('LoginButton', 'hover', '23:28', [
          createFillDelta('#2563EB', '#10B981', 'color.secondary', 'color.success'),
        ]),
      ],
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.suggestedTarget).toBe('override');
    expect(suggestion.reason).toContain('suggesting new override');
  });

  it('suggests ast write for base delta with auto-writable inline style', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: null,
      deltas: [
        createDeltaOutput('LoginButton', 'base', '23:26', [
          createFillDelta('#3B82F6', '#10B981', 'color.primary', 'color.success'),
        ]),
      ],
      writeFeasibility: createWriteFeasibilityReport('LoginButton', ['visual.fills']),
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.suggestedTarget).toBe('ast');
    expect(suggestion.kind).toBe('AST_WRITE_PATCH');
    expect(suggestion.evidence.astLoc).toBeDefined();
  });

  it('suggests override for base delta not auto-writable', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: {
        LoginButton: {
          nodeId: '23:26',
          lastUpdated: '2025-01-01T00:00:00.000Z',
        },
      },
      deltas: [
        createDeltaOutput('LoginButton', 'base', '23:26', [
          createFillDelta('#3B82F6', '#10B981', 'color.primary', 'color.success'),
        ]),
      ],
      writeFeasibility: createWriteFeasibilityReport('LoginButton', []), // Not auto-writable
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.suggestedTarget).toBe('override');
    expect(suggestion.reason).toContain('not auto-writable');
  });

  it('adds canonical policy note when no canonical token matched', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: null,
      deltas: [
        createDeltaOutput('LoginButton', 'base', '23:26', [
          {
            property: 'fill',
            from: '#AABBCC',
            to: '#DDEEFF',
            // No canonical tokens
            confidence: 'low',
            reason: 'Unknown colors',
            normalizationNote: 'Could not map to canonical token',
          },
        ]),
      ],
    };

    const output = generateDeltaSuggestions(input);

    expect(output.suggestions).toHaveLength(1);
    const suggestion = output.suggestions[0];
    expect(suggestion.evidence.canonicalPolicyNotes).toBeDefined();
    expect(suggestion.evidence.canonicalPolicyNotes).toContain(
      'No canonical token matched; raw value proposed.'
    );
  });

  it('produces deterministic sorted output', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: null,
      deltas: [
        // Out of order to test sorting
        createDeltaOutput('LoginButton', 'hover', '23:28', [
          createFillDelta('#2563EB', '#10B981'),
        ]),
        createDeltaOutput('Card', 'base', 'CARD:1', [
          createFillDelta('#FFFFFF', '#F0F0F0'),
        ]),
        createDeltaOutput('LoginButton', 'base', '23:26', [
          createFillDelta('#3B82F6', '#10B981'),
        ]),
      ],
    };

    // Run twice
    const output1 = generateDeltaSuggestions(input);
    const output2 = generateDeltaSuggestions(input);

    // Should be identical
    expect(output1.suggestions).toHaveLength(3);
    expect(JSON.stringify(output1.suggestions)).toBe(JSON.stringify(output2.suggestions));

    // Check sort order: Card::base, LoginButton::base, LoginButton::hover
    expect(output1.suggestions[0].componentKey).toBe('Card');
    expect(output1.suggestions[0].targetState).toBe('base');
    expect(output1.suggestions[1].componentKey).toBe('LoginButton');
    expect(output1.suggestions[1].targetState).toBe('base');
    expect(output1.suggestions[2].componentKey).toBe('LoginButton');
    expect(output1.suggestions[2].targetState).toBe('hover');
  });

  it('builds correct summary', () => {
    const input: SuggestInput = {
      filePath: 'demo-app/src/App.tsx',
      componentMap: createComponentMap(),
      markers: [],
      overrides: null,
      deltas: [
        createDeltaOutput('LoginButton', 'hover', '23:28', [
          createFillDelta('#2563EB', '#10B981'),
          { property: 'padding', from: 16, to: 24, confidence: 'high', reason: 'Changed' },
        ]),
        createDeltaOutput('LoginButton', 'base', '23:26', [
          createFillDelta('#3B82F6', '#FF0000'),
        ]),
      ],
    };

    const output = generateDeltaSuggestions(input);

    expect(output.summary.total).toBe(3);
    expect(output.summary.byTarget.override).toBe(3);
    expect(output.summary.byProperty.fill).toBe(2);
    expect(output.summary.byProperty.padding).toBe(1);
    expect(output.summary.byState.hover).toBe(2);
    expect(output.summary.byState.base).toBe(1);
  });
});
