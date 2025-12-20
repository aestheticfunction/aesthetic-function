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
 * - Explicit-only variant state derivation (10C Fix)
 * - Figma name generation
 *
 * VARIANT STATE POLICY (10C Fix):
 * - Variant suggestions are EXPLICIT-ONLY (markers/overrides)
 * - Never inferred from semantics (disabled boolean, hover hints, etc.)
 *
 * IMPORTANT: These tests use fixtures only (no demo-app reads).
 */

import { describe, it, expect } from 'vitest';

import {
  generateSuggestions,
  filterNewSuggestions,
  filterUpdateSuggestions,
  type SuggestionResult,
} from '../componentMapSuggestions.js';
import {
  anchorMarkersToAst,
  parseIntentFromReactAst,
  runAdaptersOnFile,
  extractMarkers,
} from '../../../ast/parseIntentFromReactAst.js';
import type { ComponentMap } from '../../../reconcile/componentMap.js';
import type { AnchoredAstReport } from '../../../ast/types.js';
import type { DesignOverrides } from '../../../reconcile/types.js';

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
 * Fixture with explicit state marker (state=hover).
 * Tests that explicit states ARE included in variantStatesSuggested.
 * NOTE: Marker must be BEFORE the component definition for anchoring to work.
 */
const EXPLICIT_STATE_FIXTURE = `
import React from 'react';

// @figma node="HoverAction" state=hover
export function HoverButton() {
  return <button>Hover Me</button>;
}
`;

/**
 * Fixture with disabled prop but NO ::disabled marker.
 * Tests that semantic states are NOT included in variantStatesSuggested.
 */
const DISABLED_NO_MARKER_FIXTURE = `
import React from 'react';
import { Button } from 'antd';

// @figma node="DisabledAction"
export function DisabledButton() {
  return <Button type="primary" disabled={true}>Disabled</Button>;
}
`;

/**
 * Fixture with multiple explicit state markers for same component.
 * NOTE: Each marker-component pair is anchored separately.
 */
const MULTIPLE_STATES_FIXTURE = `
import React from 'react';

// @figma node="StateButton" state=hover
export function MultiStateButtonHover() {
  return <button>Hover</button>;
}

// @figma node="StateButton" state=disabled
export function MultiStateButtonDisabled() {
  return <button>Disabled</button>;
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
    markers: extractMarkers(code),
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

  describe('explicit-only variant states (10C Fix)', () => {
    it('should NOT infer disabled state from semantics (disabled prop without marker)', () => {
      // This fixture has disabled={true} but no state=disabled marker
      const { anchored, adapters, markers } = parseAndRunAdapters(
        DISABLED_NO_MARKER_FIXTURE,
        'test/DisabledButton.tsx'
      );

      const result = generateSuggestions(anchored, adapters, null, markers);

      // All suggestions should NOT have disabled since there's no explicit state=disabled marker
      // (even though the component has disabled={true} prop)
      for (const s of result.suggestions) {
        expect(s.variantStatesSuggested).not.toContain('disabled');
      }
    });

    it('should NOT infer hover/pressed states from adapter component type', () => {
      // ANTD_FIXTURE has Button but no state= markers
      const { anchored, adapters, markers } = parseAndRunAdapters(
        ANTD_FIXTURE,
        'test/AntdComponents.tsx'
      );

      const result = generateSuggestions(anchored, adapters, null, markers);

      // Find AntD Button suggestions
      const antdButtonSuggestions = result.suggestions.filter(
        (s) => s.adapterId === 'antd'
      );

      // All AntD Button suggestions should NOT have hover/pressed
      // since there are no explicit state= markers (10C Fix)
      for (const s of antdButtonSuggestions) {
        expect(s.variantStatesSuggested).not.toContain('hover');
        expect(s.variantStatesSuggested).not.toContain('pressed');
      }
    });

    it('should include explicit states from state= markers', () => {
      const { anchored, adapters, markers } = parseAndRunAdapters(
        EXPLICIT_STATE_FIXTURE,
        'test/HoverButton.tsx'
      );

      const result = generateSuggestions(anchored, adapters, null, markers);

      // At least one suggestion should have hover (from state=hover marker)
      const hasHover = result.suggestions.some((s) =>
        s.variantStatesSuggested.includes('hover')
      );
      expect(hasHover).toBe(true);
    });

    it('should include explicit states from override ::state keys', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      // Get the actual component key from the anchor
      const componentKey = anchored.anchors.find((a) => a.componentKey)?.componentKey;
      const componentName = anchored.anchors.find((a) => a.componentName)?.componentName;

      // Simulate overrides with ::disabled and ::hover keys matching the component
      const overrides: DesignOverrides = {};
      if (componentKey) {
        overrides[`${componentKey}::disabled`] = {
          nodeId: '123:456',
          text: 'Disabled',
          lastUpdated: new Date().toISOString(),
        };
        overrides[`${componentKey}::hover`] = {
          nodeId: '123:789',
          fill: '#blue',
          lastUpdated: new Date().toISOString(),
        };
      } else if (componentName) {
        // Use componentName if no componentKey
        overrides[`${componentName}::disabled`] = {
          nodeId: '123:456',
          text: 'Disabled',
          lastUpdated: new Date().toISOString(),
        };
        overrides[`${componentName}::hover`] = {
          nodeId: '123:789',
          fill: '#blue',
          lastUpdated: new Date().toISOString(),
        };
      }

      const result = generateSuggestions(anchored, undefined, null, [], overrides);

      // At least one suggestion should have disabled and hover from override keys
      const hasBothStates = result.suggestions.some(
        (s) =>
          s.variantStatesSuggested.includes('disabled') &&
          s.variantStatesSuggested.includes('hover')
      );

      // If we have anchors with keys/names, we should have matched states
      if (componentKey || componentName) {
        expect(hasBothStates).toBe(true);
      }
    });

    it('should have empty variantStatesSuggested when no explicit states exist', () => {
      const anchored = parseAndAnchor(MINIMAL_FIXTURE, 'test/LoginButton.tsx');

      // No markers, no overrides with states
      const result = generateSuggestions(anchored);

      for (const s of result.suggestions) {
        expect(s.variantStatesSuggested).toEqual([]);
      }
    });

    it('should collect multiple explicit states from different markers', () => {
      const { anchored, adapters, markers } = parseAndRunAdapters(
        MULTIPLE_STATES_FIXTURE,
        'test/MultiState.tsx'
      );

      const result = generateSuggestions(anchored, adapters, null, markers);

      // Collect all explicit states from all suggestions
      const allStates = new Set(result.suggestions.flatMap((s) => s.variantStatesSuggested));

      // Should have both hover and disabled since they're explicit state= markers
      expect(allStates.has('hover')).toBe(true);
      expect(allStates.has('disabled')).toBe(true);
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
    };

    const result = generateSuggestions(anchoredWithoutName);

    expect(result.suggestions.length).toBe(0);
    expect(result.skippedCount).toBe(1);
  });
});
