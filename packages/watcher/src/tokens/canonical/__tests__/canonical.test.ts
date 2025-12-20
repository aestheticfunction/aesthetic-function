/**
 * @aesthetic-function/watcher - tokens/canonical/__tests__/canonical.test.ts
 *
 * Tests for the Canonical Token Layer (Phase 10E).
 *
 * FIXTURE-BASED ONLY: Tests use inline fixtures, no demo-app reads.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeToCanonical,
  normalizeColorToCanonical,
  isCanonicalToken,
  registerCanonicalHintMapper,
  clearHintMappers,
  initializeDefaultHintMappers,
} from '../normalize.js';
import type { ComponentSemanticIntent } from '../../../ast/types.js';
import type { AdapterResult } from '../../../adapters/types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a semantic intent with a fill color.
 */
function createFillIntent(
  fillValue: string,
  confidence: 'high' | 'medium' | 'low' = 'high'
): ComponentSemanticIntent {
  return {
    text: {},
    booleans: {},
    layout: {},
    flex: {},
    visual: {
      fills: [
        {
          value: fillValue,
          loc: { startLine: 1, endLine: 1 },
          confidence,
        },
      ],
    },
  };
}

/**
 * Create a semantic intent with layout values.
 */
function createLayoutIntent(layout: {
  gap?: number;
  padding?: number;
  margin?: number;
}): ComponentSemanticIntent {
  const layoutSemantics: ComponentSemanticIntent['layout'] = {};

  if (layout.gap !== undefined) {
    layoutSemantics.gap = {
      value: layout.gap,
      loc: { startLine: 1, endLine: 1 },
      confidence: 'high',
    };
  }
  if (layout.padding !== undefined) {
    layoutSemantics.padding = {
      value: layout.padding,
      loc: { startLine: 1, endLine: 1 },
      confidence: 'high',
    };
  }
  if (layout.margin !== undefined) {
    layoutSemantics.margin = {
      value: layout.margin,
      loc: { startLine: 1, endLine: 1 },
      confidence: 'high',
    };
  }

  return {
    text: {},
    booleans: {},
    layout: layoutSemantics,
    flex: {},
    visual: {},
  };
}

/**
 * Create a Vuetify adapter result.
 */
function createVuetifyAdapterResult(
  vuetifyColor: string,
  hexValue: string,
  confidence: 'high' | 'medium' | 'low' = 'high'
): AdapterResult {
  return {
    semantics: {
      visual: {
        fills: [
          {
            value: hexValue,
            loc: { startLine: 1, endLine: 1 },
            confidence,
          },
        ],
      },
    },
    provenance: {
      adapterId: 'vuetify',
      confidence,
      reason: 'v-btn component',
    },
    frameworkMetadata: {
      component: 'v-btn',
      vuetifyColor,
    },
  };
}

/**
 * Create an AntD adapter result.
 */
function createAntdAdapterResult(
  type: string,
  confidence: 'high' | 'medium' | 'low' = 'high'
): AdapterResult {
  return {
    semantics: {
      visual: {
        fills: [
          {
            value: `antd:${type}`,
            loc: { startLine: 1, endLine: 1 },
            confidence,
          },
        ],
      },
    },
    provenance: {
      adapterId: 'antd',
      confidence,
      reason: 'Button component',
    },
    frameworkMetadata: {
      component: 'Button',
      variant: type,
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Canonical Token Layer (Phase 10E)', () => {
  beforeEach(() => {
    clearHintMappers();
  });

  afterEach(() => {
    clearHintMappers();
  });

  // ===========================================================================
  // Vuetify → Canonical Mapping
  // ===========================================================================

  describe('Vuetify color → canonical', () => {
    it('should map Vuetify primary to color.primary', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#1976D2'); // Vuetify primary hex
      const adapters = [createVuetifyAdapterResult('primary', '#1976D2')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
      expect(result.canonical.colors?.fill?.source).toBe('vuetify');
      expect(result.canonical.colors?.fill?.rawValue).toBe('#1976D2');
      expect(result.canonical.colors?.fill?.confidence).toBe('high');
    });

    it('should map Vuetify success to color.success', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#4CAF50');
      const adapters = [createVuetifyAdapterResult('success', '#4CAF50')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.success');
      expect(result.canonical.colors?.fill?.source).toBe('vuetify');
    });

    it('should map Vuetify error to color.danger', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#FF5252');
      const adapters = [createVuetifyAdapterResult('error', '#FF5252')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.danger');
    });

    it('should map Vuetify warning to color.warning', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#FB8C00');
      const adapters = [createVuetifyAdapterResult('warning', '#FB8C00')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.warning');
    });

    it('should map Vuetify info to color.info', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#2196F3');
      const adapters = [createVuetifyAdapterResult('info', '#2196F3')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.info');
    });

    it('should map Vuetify material colors', () => {
      initializeDefaultHintMappers();

      const colorMappings = [
        { vuetify: 'red', canonical: 'color.red' },
        { vuetify: 'blue', canonical: 'color.blue' },
        { vuetify: 'green', canonical: 'color.green' },
        { vuetify: 'purple', canonical: 'color.purple' },
        { vuetify: 'orange', canonical: 'color.orange' },
      ];

      for (const { vuetify, canonical } of colorMappings) {
        const intent = createFillIntent('#000000');
        const adapters = [createVuetifyAdapterResult(vuetify, '#000000')];

        const result = normalizeToCanonical(intent, { adapters });

        expect(result.canonical.colors?.fill?.value).toBe(canonical);
      }
    });
  });

  // ===========================================================================
  // AntD → Canonical Mapping
  // ===========================================================================

  describe('AntD type → canonical', () => {
    it('should map AntD Button type="primary" to color.primary', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:primary');
      const adapters = [createAntdAdapterResult('primary')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
      expect(result.canonical.colors?.fill?.source).toBe('antd');
      expect(result.canonical.colors?.fill?.rawValue).toBe('antd:primary');
    });

    it('should map AntD danger to color.danger', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:danger');
      const adapters = [createAntdAdapterResult('danger')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.danger');
    });

    it('should map AntD default to color.neutral.100', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:default');
      const adapters = [createAntdAdapterResult('default')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.neutral.100');
    });

    it('should map AntD link to color.primary', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:link');
      const adapters = [createAntdAdapterResult('link')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
    });
  });

  // ===========================================================================
  // Hex → Canonical via Design Tokens
  // ===========================================================================

  describe('Hex → canonical via design tokens', () => {
    it('should map known hex to canonical when it matches design token', () => {
      initializeDefaultHintMappers();

      // #3B82F6 is Primary/Blue500 in designTokens.ts
      const intent = createFillIntent('#3B82F6');

      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
      expect(result.canonical.colors?.fill?.source).toBe('generic-jsx');
    });

    it('should map success hex to color.success', () => {
      initializeDefaultHintMappers();

      // #10B981 is Success/Green500 in designTokens.ts
      const intent = createFillIntent('#10B981');

      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill?.value).toBe('color.success');
    });

    it('should map error hex to color.danger', () => {
      initializeDefaultHintMappers();

      // #EF4444 is Error/Red500 in designTokens.ts
      const intent = createFillIntent('#EF4444');

      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill?.value).toBe('color.danger');
    });

    it('should produce note for unknown hex', () => {
      initializeDefaultHintMappers();

      // Unknown hex not in design tokens
      const intent = createFillIntent('#123456');

      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill).toBeUndefined();
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].type).toBe('unmapped_color_hex');
      expect(result.notes[0].rawValue).toBe('#123456');
    });
  });

  // ===========================================================================
  // Confidence Preservation
  // ===========================================================================

  describe('Confidence preservation', () => {
    it('should preserve high confidence from adapter', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:primary', 'high');
      const adapters = [createAntdAdapterResult('primary', 'high')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.confidence).toBe('high');
    });

    it('should preserve low confidence for bound/dynamic props', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:primary', 'low');
      const adapters = [createAntdAdapterResult('primary', 'low')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.confidence).toBe('low');
    });

    it('should preserve medium confidence from generic JSX', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#3B82F6', 'medium');

      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill?.confidence).toBe('medium');
    });
  });

  // ===========================================================================
  // Spacing Normalization
  // ===========================================================================

  describe('Spacing normalization', () => {
    it('should map gap values to canonical tokens', () => {
      initializeDefaultHintMappers();

      const testCases = [
        { value: 0, expected: 'space.none' },
        { value: 4, expected: 'space.xs' },
        { value: 8, expected: 'space.sm' },
        { value: 16, expected: 'space.md' },
        { value: 24, expected: 'space.lg' },
        { value: 32, expected: 'space.xl' },
        { value: 48, expected: 'space.2xl' },
        { value: 64, expected: 'space.3xl' },
      ];

      for (const { value, expected } of testCases) {
        const intent = createLayoutIntent({ gap: value });
        const result = normalizeToCanonical(intent, { adapters: [] });

        expect(result.canonical.spacing?.gap?.value).toBe(expected);
        expect(result.canonical.spacing?.gap?.rawValue).toBe(String(value));
      }
    });

    it('should map padding values to canonical tokens', () => {
      initializeDefaultHintMappers();

      const intent = createLayoutIntent({ padding: 16 });
      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.spacing?.padding?.value).toBe('space.md');
      expect(result.canonical.spacing?.padding?.source).toBe('generic-jsx');
    });

    it('should map margin values to canonical tokens', () => {
      initializeDefaultHintMappers();

      const intent = createLayoutIntent({ margin: 24 });
      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.spacing?.margin?.value).toBe('space.lg');
    });
  });

  // ===========================================================================
  // Meta and Sources Tracking
  // ===========================================================================

  describe('Meta and sources tracking', () => {
    it('should track sources that contributed', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:primary');
      const adapters = [createAntdAdapterResult('primary')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.meta?.sources).toContain('antd');
    });

    it('should count canonical fields', () => {
      initializeDefaultHintMappers();

      const intent = createLayoutIntent({ gap: 16, padding: 8 });
      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.meta?.canonicalFieldCount).toBe(2);
    });

    it('should count raw fields when unmapped', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('#123456'); // Unknown hex
      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.meta?.rawFieldCount).toBe(1);
    });
  });

  // ===========================================================================
  // Normalization does not overwrite unrelated fields
  // ===========================================================================

  describe('Field isolation', () => {
    it('should not affect text semantics', () => {
      initializeDefaultHintMappers();

      const intent: ComponentSemanticIntent = {
        text: {
          content: [
            {
              value: 'Submit',
              loc: { startLine: 1, endLine: 1 },
              confidence: 'high',
            },
          ],
        },
        booleans: {},
        layout: { gap: { value: 16, loc: { startLine: 1, endLine: 1 }, confidence: 'high' } },
        flex: {},
        visual: {},
      };

      const result = normalizeToCanonical(intent, { adapters: [] });

      // Canonical semantics don't include text
      expect(result.canonical.spacing?.gap?.value).toBe('space.md');
      // Original intent text is not affected (immutable)
      expect(intent.text.content?.[0]?.value).toBe('Submit');
    });

    it('should not affect boolean semantics', () => {
      initializeDefaultHintMappers();

      const intent: ComponentSemanticIntent = {
        text: {},
        booleans: {
          disabled: { value: true, loc: { startLine: 1, endLine: 1 }, confidence: 'high' },
        },
        layout: {},
        flex: {},
        visual: { fills: [{ value: '#3B82F6', loc: { startLine: 1, endLine: 1 }, confidence: 'high' }] },
      };

      const result = normalizeToCanonical(intent, { adapters: [] });

      // Canonical semantics include color
      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
      // Original intent booleans not affected
      expect(intent.booleans.disabled?.value).toBe(true);
    });
  });

  // ===========================================================================
  // Deterministic Output
  // ===========================================================================

  describe('Deterministic output', () => {
    it('should produce consistent output for same input', () => {
      initializeDefaultHintMappers();

      const intent = createFillIntent('antd:primary');
      const adapters = [createAntdAdapterResult('primary')];

      const result1 = normalizeToCanonical(intent, { adapters });
      const result2 = normalizeToCanonical(intent, { adapters });

      expect(result1).toEqual(result2);
    });

    it('should produce stable JSON stringification', () => {
      initializeDefaultHintMappers();

      const intent = createLayoutIntent({ gap: 16, padding: 8, margin: 24 });
      const result = normalizeToCanonical(intent, { adapters: [] });

      const json1 = JSON.stringify(result);
      const json2 = JSON.stringify(result);

      expect(json1).toBe(json2);
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  describe('normalizeColorToCanonical helper', () => {
    it('should map adapter hint without full intent', () => {
      initializeDefaultHintMappers();

      const token = normalizeColorToCanonical('antd:primary', 'antd');

      expect(token).toBe('color.primary');
    });

    it('should map hex via design tokens', () => {
      initializeDefaultHintMappers();

      const token = normalizeColorToCanonical('#3B82F6');

      expect(token).toBe('color.primary');
    });

    it('should return null for unknown values', () => {
      initializeDefaultHintMappers();

      const token = normalizeColorToCanonical('#123456');

      expect(token).toBeNull();
    });
  });

  describe('isCanonicalToken helper', () => {
    it('should recognize color tokens', () => {
      expect(isCanonicalToken('color.primary')).toBe(true);
      expect(isCanonicalToken('color.danger')).toBe(true);
    });

    it('should recognize space tokens', () => {
      expect(isCanonicalToken('space.md')).toBe(true);
      expect(isCanonicalToken('space.xl')).toBe(true);
    });

    it('should recognize radius tokens', () => {
      expect(isCanonicalToken('radius.md')).toBe(true);
    });

    it('should recognize text tokens', () => {
      expect(isCanonicalToken('text.size.md')).toBe(true);
    });

    it('should reject non-canonical values', () => {
      expect(isCanonicalToken('#3B82F6')).toBe(false);
      expect(isCanonicalToken('antd:primary')).toBe(false);
      expect(isCanonicalToken('16px')).toBe(false);
    });
  });

  // ===========================================================================
  // Extensibility Hook
  // ===========================================================================

  describe('registerCanonicalHintMapper extensibility', () => {
    it('should allow registering custom mappers', () => {
      registerCanonicalHintMapper('custom', (hint) => {
        if (hint === 'custom:brand') return 'color.primary';
        return null;
      });

      const intent = createFillIntent('custom:brand');
      const result = normalizeToCanonical(intent, { adapters: [] });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
    });

    it('should prefer adapter-specific mapper over generic', () => {
      initializeDefaultHintMappers();

      // Register a custom mapper that would match the same pattern
      registerCanonicalHintMapper('mui', (hint) => {
        if (hint.startsWith('mui:')) return 'color.secondary';
        return null;
      });

      // Use antd hint - should use antd mapper, not mui
      const intent = createFillIntent('antd:primary');
      const adapters = [createAntdAdapterResult('primary')];

      const result = normalizeToCanonical(intent, { adapters });

      expect(result.canonical.colors?.fill?.value).toBe('color.primary');
    });
  });
});
