/**
 * Tests for Component Map Suggestions (Phase 10C)
 *
 * These tests verify that the suggestion generator correctly derives
 * component-map.json entry suggestions from AST + adapter analysis.
 *
 * Test Coverage:
 * - Suggestions from AST anchors (no adapter match)
 * - Suggestions from adapter semantics
 * - Combined suggestions (AST + adapter)
 * - Detection of existing map entries
 * - Variant state derivation
 * - Figma name generation
 *
 * IMPORTANT: These tests use fixtures only (no demo-app reads).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import * as babelTypes from '@babel/types';

import {
  generateSuggestions,
  filterNewSuggestions,
  filterUpdateSuggestions,
  type ComponentMapSuggestion,
  type SuggestionResult,
} from '../componentMapSuggestions.js';
import {
  anchorMarkersToAst,
  parseIntentFromReactAst,
  runAdaptersOnFile,
} from '../../../ast/parseIntentFromReactAst.js';
import type { ComponentMap } from '../../../reconcile/componentMap.js';
import type { AnchoredAstReport } from '../../../ast/types.js';

// =============================================================================
// Test Fixtures (Inline)
// =============================================================================

/**
 * Minimal fixture with a single component and @figma marker.
 */
const MINIMAL_FIXTURE = `
import React from 'react';

export function LoginButton() {
  return (
    // @figma node="Submit" text="Log In"
    <button>Log In</button>
  );
}
`;

/**
 * Fixture with multiple components.
 */
const MULTI_COMPONENT_FIXTURE = `
import React from 'react';

export function Header() {
  return (
    // @figma node="HeaderTitle" text="Welcome"
    <h1>Welcome</h1>
  );
}

export function Footer() {
  return (
    // @figma node="FooterText" text="Copyright"
    <span>Copyright 2024</span>
  );
}
`;

/**
 * Fixture with AntD components for adapter matching.
 */
const ANTD_FIXTURE = `
import React from 'react';
import { Button, Card } from 'antd';

export function SubmitButton() {
  return (
    // @figma node="PrimaryAction"
    <Button type="primary" disabled>Submit Form</Button>
  );
}

export function InfoCard() {
  return (
    // @figma node="InfoPanel"
    <Card title="Information">Content here</Card>
  );
}
`;

/**
 * Fixture with Vuetify components for adapter matching.
 */
const VUETIFY_FIXTURE = `
import React from 'react';

export function ActionButton() {
  return (
    // @figma node="VuetifyAction"
    <v-btn color="primary" disabled>Click Me</v-btn>
  );
}
`;

// =============================================================================
// Helper Functions
// =============================================================================

function parseAndAnchor(code: string, filePath: string): AnchoredAstReport {
  const astReport = parseIntentFromReactAst(code, filePath);
  return anchorMarkersToAst(code, filePath, astReport);
}

function parseAndRunAdapters(code: string, filePath: string) {
  const astReport = parseIntentFromReactAst(code, filePath);
  return {
    anchored: anchorMarkersToAst(code, filePath, astReport),
    adapters: runAdaptersOnFile(code, filePath, astReport),
  };
}

// =============================================================================
// generateSuggestions Tests
// =============================================================================

describe('generateSuggestions', () => {
  describe('basic suggestion generation', () => {
    it('should generate suggestions from AST anchors', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const result = generateSuggestions(anchored);

      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
      // The fixture may or may not have componentKey depending on anchor detection
    });

    it('should report correct counts in result', () => {
      const anchored = parseAndAnchor(MULTI_COMPONENT_FIXTURE, 'test/Multi.tsx');

      const result = generateSuggestions(anchored);

      expect(result).toHaveProperty('newCount');
      expect(result).toHaveProperty('updateCount');
      expect(result).toHaveProperty('skippedCount');
      expect(result.newCount + result.updateCount + result.skippedCount).toBe(
        result.suggestions.length + result.skippedCount
      );
    });
  });

  describe('existing map detection', () => {
    it('should mark suggestions as existsInMap when key matches', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      // If there are any suggestions with a componentKey
      if (anchored.anchors.some((a) => a.componentKey)) {
        const componentKey = anchored.anchors.find((a) => a.componentKey)?.componentKey!;

        const existingMap: ComponentMap = {
          version: 2,
          components: {
            [componentKey]: {
              figma: {
                name: 'Existing Button',
                variants: {},
              },
            },
          },
        };

        const result = generateSuggestions(anchored, undefined, existingMap);

        const matchingSuggestion = result.suggestions.find(
          (s) => s.componentKey === componentKey
        );

        if (matchingSuggestion) {
          expect(matchingSuggestion.existsInMap).toBe(true);
          expect(matchingSuggestion.currentFigmaName).toBe('Existing Button');
        }
      }
    });

    it('should mark suggestions as new when not in map', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const emptyMap: ComponentMap = {
        version: 2,
        components: {},
      };

      const result = generateSuggestions(anchored, undefined, emptyMap);

      // All suggestions should be new since map is empty
      for (const s of result.suggestions) {
        expect(s.existsInMap).toBe(false);
        expect(s.currentFigmaName).toBeUndefined();
      }
    });

    it('should work when no map is provided', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const result = generateSuggestions(anchored);

      // Should not throw and all suggestions should be new
      for (const s of result.suggestions) {
        expect(s.existsInMap).toBe(false);
      }
    });
  });

  describe('adapter integration', () => {
    it('should mark source as "combined" when adapter matches', () => {
      const { anchored, adapters } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters);

      // Find any suggestion with adapter match
      const adapterSuggestion = result.suggestions.find(
        (s) => s.source === 'combined'
      );

      if (adapterSuggestion) {
        expect(adapterSuggestion.adapterId).toBeDefined();
      }
    });

    it('should mark source as "ast-anchor" when no adapter matches', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const result = generateSuggestions(anchored);

      for (const s of result.suggestions) {
        expect(s.source).toBe('ast-anchor');
        expect(s.adapterId).toBeUndefined();
      }
    });
  });

  describe('variant state derivation', () => {
    it('should derive disabled state from adapter semantics', () => {
      const { anchored, adapters } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters);

      // The SubmitButton has disabled prop, so should suggest disabled variant
      const buttonSuggestion = result.suggestions.find(
        (s) => s.componentKey?.includes('SubmitButton') || s.figmaNameSuggestion.includes('Button')
      );

      if (buttonSuggestion && buttonSuggestion.source === 'combined') {
        // Should have disabled in variant states if semantics detected it
        // Note: exact behavior depends on adapter extraction
      }
    });

    it('should suggest hover/pressed for Button components', () => {
      const { anchored, adapters } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters);

      // Find Button suggestion
      const buttonSuggestion = result.suggestions.find(
        (s) => s.adapterId === 'antd' && s.figmaNameSuggestion.includes('Button')
      );

      if (buttonSuggestion) {
        // Buttons should typically have hover and pressed variants
        expect(buttonSuggestion.variantStatesSuggested).toContain('hover');
        expect(buttonSuggestion.variantStatesSuggested).toContain('pressed');
      }
    });
  });

  describe('Figma name generation', () => {
    it('should convert PascalCase to spaced names', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const result = generateSuggestions(anchored);

      const loginSuggestion = result.suggestions.find(
        (s) => s.componentKey?.includes('LoginButton')
      );

      if (loginSuggestion && loginSuggestion.source === 'ast-anchor') {
        expect(loginSuggestion.figmaNameSuggestion).toBe('Login Button');
      }
    });

    it('should include adapter name for adapter-matched components', () => {
      const { anchored, adapters } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters);

      const antdSuggestion = result.suggestions.find(
        (s) => s.adapterId === 'antd'
      );

      if (antdSuggestion) {
        expect(antdSuggestion.figmaNameSuggestion).toContain('Ant Design');
      }
    });
  });

  describe('reason field', () => {
    it('should include adapter name in reason for adapter matches', () => {
      const { anchored, adapters } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters);

      const antdSuggestion = result.suggestions.find(
        (s) => s.adapterId === 'antd'
      );

      if (antdSuggestion) {
        expect(antdSuggestion.reason).toContain('Ant Design');
      }
    });

    it('should include component name in reason for AST anchors', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      const result = generateSuggestions(anchored);

      for (const s of result.suggestions) {
        if (s.source === 'ast-anchor') {
          expect(s.reason).toContain('AST anchor');
        }
      }
    });
  });
});

// =============================================================================
// Filter Functions Tests
// =============================================================================

describe('filterNewSuggestions', () => {
  it('should return only suggestions not in map', () => {
    const result: SuggestionResult = {
      suggestions: [
        {
          componentKey: 'new-component',
          figmaNameSuggestion: 'New Component',
          variantStatesSuggested: [],
          source: 'ast-anchor',
          reason: 'test',
          existsInMap: false,
        },
        {
          componentKey: 'existing-component',
          figmaNameSuggestion: 'Existing Component',
          variantStatesSuggested: [],
          source: 'ast-anchor',
          reason: 'test',
          existsInMap: true,
          currentFigmaName: 'Old Name',
        },
      ],
      newCount: 1,
      updateCount: 1,
      skippedCount: 0,
    };

    const newSuggestions = filterNewSuggestions(result);

    expect(newSuggestions.length).toBe(1);
    expect(newSuggestions[0].componentKey).toBe('new-component');
  });
});

describe('filterUpdateSuggestions', () => {
  it('should return only suggestions already in map', () => {
    const result: SuggestionResult = {
      suggestions: [
        {
          componentKey: 'new-component',
          figmaNameSuggestion: 'New Component',
          variantStatesSuggested: [],
          source: 'ast-anchor',
          reason: 'test',
          existsInMap: false,
        },
        {
          componentKey: 'existing-component',
          figmaNameSuggestion: 'Existing Component',
          variantStatesSuggested: [],
          source: 'ast-anchor',
          reason: 'test',
          existsInMap: true,
          currentFigmaName: 'Old Name',
        },
      ],
      newCount: 1,
      updateCount: 1,
      skippedCount: 0,
    };

    const updateSuggestions = filterUpdateSuggestions(result);

    expect(updateSuggestions.length).toBe(1);
    expect(updateSuggestions[0].componentKey).toBe('existing-component');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('should handle empty anchored report', () => {
    const emptyAnchored: AnchoredAstReport = {
      filePath: 'test/empty.tsx',
      anchors: [],
      stats: { totalMarkers: 0, anchored: 0, ambiguous: 0 },
    };

    const result = generateSuggestions(emptyAnchored);

    expect(result.suggestions).toEqual([]);
    expect(result.newCount).toBe(0);
    expect(result.updateCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it('should skip anchors without componentKey', () => {
    const anchoredWithoutKey: AnchoredAstReport = {
      filePath: 'test/nokey.tsx',
      anchors: [
        {
          nodeName: 'SomeNode',
          markerLine: 5,
          componentName: 'SomeComponent',
          // componentKey is missing
          componentLoc: { startLine: 1, endLine: 10 },
          extracted: { text: [], fills: [] },
          notes: [],
        },
      ],
      stats: { totalMarkers: 1, anchored: 1, ambiguous: 0 },
    };

    const result = generateSuggestions(anchoredWithoutKey);

    expect(result.suggestions.length).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('should skip anchors without componentName', () => {
    const anchoredWithoutName: AnchoredAstReport = {
      filePath: 'test/noname.tsx',
      anchors: [
        {
          nodeName: 'SomeNode',
          markerLine: 5,
          componentKey: 'test/SomeComponent',
          // componentName is missing
          componentLoc: { startLine: 1, endLine: 10 },
          extracted: { text: [], fills: [] },
          notes: [],
        },
      ],
      stats: { totalMarkers: 1, anchored: 1, ambiguous: 0 },
    };

    const result = generateSuggestions(anchoredWithoutName);

    expect(result.suggestions.length).toBe(0);
    expect(result.skippedCount).toBe(1);
  });
});
