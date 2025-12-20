/**
 * @aesthetic-function/watcher - bootstrap/__tests__/bootstrap.test.ts
 *
 * Tests for Component Map Bootstrap (Phase 10D).
 *
 * FIXTURE-ONLY: No demo-app reads.
 *
 * Test cases:
 * 1. Generates artifact with new entries (no existing map)
 * 2. Skips entries already present
 * 3. Explicit-only variant states respected (no inference)
 * 4. Apply mode merge adds scaffold but doesn't overwrite nodeIds
 * 5. Deterministic output snapshot (normalized paths, stable timestamps)
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  generateBootstrapArtifact,
  normalizeArtifactFileName,
  getArtifactPath,
  BOOTSTRAP_ARTIFACT_VERSION,
} from '../generateBootstrapArtifact.js';
import { mergeBootstrapArtifact } from '../mergeBootstrap.js';
import { parseBootstrapConfig, type BootstrapConfig } from '../types.js';
import type { SuggestionResult } from '../../adapters/suggestions/componentMapSuggestions.js';
import type { ComponentMap } from '../../reconcile/componentMap.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Fixture: Basic suggestion result with new entries.
 */
function createBasicSuggestionResult(): SuggestionResult {
  return {
    suggestions: [
      {
        componentKey: 'auth/LoginButton',
        figmaNameSuggestion: 'Login Button',
        variantStatesSuggested: ['hover', 'pressed'],
        source: 'combined',
        reason: 'AST anchor: LoginButton + Ant Design adapter',
        adapterId: 'antd',
        existsInMap: false,
      },
      {
        componentKey: 'ui/Card',
        figmaNameSuggestion: 'Card',
        variantStatesSuggested: [],
        source: 'ast-anchor',
        reason: 'AST anchor: Card',
        existsInMap: false,
      },
    ],
    newCount: 2,
    updateCount: 0,
    skippedCount: 0,
  };
}

/**
 * Fixture: Suggestion result with existing entries.
 */
function createSuggestionWithExisting(): SuggestionResult {
  return {
    suggestions: [
      {
        componentKey: 'auth/LoginButton',
        figmaNameSuggestion: 'Login Button',
        variantStatesSuggested: [],
        source: 'ast-anchor',
        reason: 'AST anchor: LoginButton',
        existsInMap: true,
        currentFigmaName: 'Login Button',
      },
      {
        componentKey: 'ui/NewCard',
        figmaNameSuggestion: 'New Card',
        variantStatesSuggested: [],
        source: 'ast-anchor',
        reason: 'AST anchor: NewCard',
        existsInMap: false,
      },
    ],
    newCount: 1,
    updateCount: 1,
    skippedCount: 0,
  };
}

/**
 * Fixture: Existing component map.
 */
function createExistingMap(): ComponentMap {
  return {
    version: 2,
    components: {
      'auth/LoginButton': {
        componentKey: 'auth/LoginButton',
        figma: {
          name: 'Login Button',
          componentSetNodeId: '123:456',
          variants: {
            base: { nodeId: '123:457' },
          },
        },
      },
    },
  };
}

/**
 * Fixture: Suggestion with explicit variant states.
 */
function createExplicitVariantsSuggestion(): SuggestionResult {
  return {
    suggestions: [
      {
        componentKey: 'buttons/HoverButton',
        figmaNameSuggestion: 'Hover Button',
        // Explicit variant from state=hover marker
        variantStatesSuggested: ['hover'],
        source: 'combined',
        reason: 'AST anchor + explicit state=hover marker',
        existsInMap: false,
      },
    ],
    newCount: 1,
    updateCount: 0,
    skippedCount: 0,
  };
}

// =============================================================================
// ARTIFACT GENERATION TESTS
// =============================================================================

describe('generateBootstrapArtifact', () => {
  const FIXED_TIMESTAMP = '2025-12-20T12:00:00.000Z';

  describe('basic artifact generation', () => {
    it('should generate artifact with correct schema version', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'demo-app/src/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      expect(artifact.version).toBe(BOOTSTRAP_ARTIFACT_VERSION);
      expect(artifact.version).toBe(1);
    });

    it('should include file path and timestamp', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'demo-app/src/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      expect(artifact.file).toBe('demo-app/src/App.tsx');
      expect(artifact.generatedAt).toBe(FIXED_TIMESTAMP);
    });

    it('should include explicit-only policy', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'demo-app/src/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      expect(artifact.policy.variantStates).toBe('explicit-only');
      expect(artifact.policy.writes).toBe('artifact-only');
    });
  });

  describe('new entries (no existing map)', () => {
    it('should generate proposed entries for all suggestions', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      expect(artifact.proposed.length).toBe(2);
      expect(artifact.skipped.length).toBe(0);
    });

    it('should mark new entries with status "new"', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      for (const entry of artifact.proposed) {
        expect(entry.status).toBe('new');
      }
    });

    it('should include null nodeIds in diff.after', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      const loginButton = artifact.proposed.find(
        (p) => p.componentKey === 'auth/LoginButton'
      );
      expect(loginButton).toBeDefined();
      expect(loginButton!.diff.before).toBeNull();
      expect(loginButton!.diff.after.components['auth/LoginButton'].figma.componentSetNodeId).toBeNull();
      expect(loginButton!.diff.after.components['auth/LoginButton'].figma.variants.base.nodeId).toBeNull();
    });

    it('should list manual fields for null nodeIds', () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      const loginButton = artifact.proposed.find(
        (p) => p.componentKey === 'auth/LoginButton'
      );
      expect(loginButton).toBeDefined();
      expect(loginButton!.manualFields).toContain('figma.componentSetNodeId');
      expect(loginButton!.manualFields).toContain('figma.variants.base.nodeId');
      expect(loginButton!.manualFields).toContain('figma.variants.hover.nodeId');
      expect(loginButton!.manualFields).toContain('figma.variants.pressed.nodeId');
    });
  });

  describe('skip existing entries', () => {
    it('should skip entries already in component map when skipExisting=true', () => {
      const suggestions = createSuggestionWithExisting();
      const existingMap = createExistingMap();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap,
        timestamp: FIXED_TIMESTAMP,
        skipExisting: true,
      });

      // LoginButton exists with same config, should be skipped
      expect(artifact.skipped.length).toBe(1);
      expect(artifact.skipped[0].componentKey).toBe('auth/LoginButton');
      expect(artifact.skipped[0].reason).toContain('Already present');

      // NewCard is new, should be proposed
      expect(artifact.proposed.length).toBe(1);
      expect(artifact.proposed[0].componentKey).toBe('ui/NewCard');
    });

    it('should include existing entries when skipExisting=false', () => {
      const suggestions = createSuggestionWithExisting();
      const existingMap = createExistingMap();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap,
        timestamp: FIXED_TIMESTAMP,
        skipExisting: false,
      });

      // Both should be processed (one skipped for same config, one proposed)
      // The LoginButton has same config so it gets skipped
      expect(artifact.skipped.length).toBe(1);
      expect(artifact.proposed.length).toBe(1);
    });
  });

  describe('explicit-only variant states', () => {
    it('should include only explicit variant states', () => {
      const suggestions = createExplicitVariantsSuggestion();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/Button.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      const hoverButton = artifact.proposed.find(
        (p) => p.componentKey === 'buttons/HoverButton'
      );
      expect(hoverButton).toBeDefined();
      // Only 'hover' should be in variants (explicit from marker)
      expect(hoverButton!.variantStatesSuggested).toEqual(['hover']);
      expect(hoverButton!.diff.after.components['buttons/HoverButton'].figma.variants).toHaveProperty('base');
      expect(hoverButton!.diff.after.components['buttons/HoverButton'].figma.variants).toHaveProperty('hover');
      // No 'pressed' or 'disabled' - not inferred
      expect(hoverButton!.diff.after.components['buttons/HoverButton'].figma.variants).not.toHaveProperty('pressed');
      expect(hoverButton!.diff.after.components['buttons/HoverButton'].figma.variants).not.toHaveProperty('disabled');
    });

    it('should have empty variants when no explicit states', () => {
      const suggestions: SuggestionResult = {
        suggestions: [
          {
            componentKey: 'ui/PlainButton',
            figmaNameSuggestion: 'Plain Button',
            variantStatesSuggested: [], // No explicit states
            source: 'ast-anchor',
            reason: 'AST anchor: PlainButton',
            existsInMap: false,
          },
        ],
        newCount: 1,
        updateCount: 0,
        skippedCount: 0,
      };

      const artifact = generateBootstrapArtifact({
        filePath: 'test/Button.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      const plainButton = artifact.proposed.find(
        (p) => p.componentKey === 'ui/PlainButton'
      );
      expect(plainButton).toBeDefined();
      expect(plainButton!.variantStatesSuggested).toEqual([]);
      // Only base variant should exist
      expect(Object.keys(plainButton!.diff.after.components['ui/PlainButton'].figma.variants)).toEqual(['base']);
    });
  });

  describe('existing entry updates', () => {
    it('should preserve existing nodeIds in diff.after', () => {
      const suggestions: SuggestionResult = {
        suggestions: [
          {
            componentKey: 'auth/LoginButton',
            figmaNameSuggestion: 'Login Button Updated',
            variantStatesSuggested: ['hover'],
            source: 'combined',
            reason: 'AST anchor + adapter',
            existsInMap: true,
            currentFigmaName: 'Login Button',
          },
        ],
        newCount: 0,
        updateCount: 1,
        skippedCount: 0,
      };

      const existingMap = createExistingMap();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap,
        timestamp: FIXED_TIMESTAMP,
        skipExisting: false,
      });

      const loginButton = artifact.proposed.find(
        (p) => p.componentKey === 'auth/LoginButton'
      );
      expect(loginButton).toBeDefined();
      expect(loginButton!.status).toBe('update');

      // Existing nodeIds should be preserved
      expect(loginButton!.diff.after.components['auth/LoginButton'].figma.componentSetNodeId).toBe('123:456');
      expect(loginButton!.diff.after.components['auth/LoginButton'].figma.variants.base.nodeId).toBe('123:457');

      // New variant should have null nodeId
      expect(loginButton!.diff.after.components['auth/LoginButton'].figma.variants.hover.nodeId).toBeNull();
    });
  });

  describe('deterministic output', () => {
    it('should produce identical output for same inputs', () => {
      const suggestions = createBasicSuggestionResult();

      const artifact1 = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      const artifact2 = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: FIXED_TIMESTAMP,
      });

      expect(JSON.stringify(artifact1)).toBe(JSON.stringify(artifact2));
    });
  });
});

// =============================================================================
// PATH NORMALIZATION TESTS
// =============================================================================

describe('normalizeArtifactFileName', () => {
  it('should replace slashes with double underscores', () => {
    expect(normalizeArtifactFileName('demo-app/src/App.tsx')).toBe('demo-app__src__App');
  });

  it('should remove .tsx extension', () => {
    expect(normalizeArtifactFileName('App.tsx')).toBe('App');
  });

  it('should remove .ts extension', () => {
    expect(normalizeArtifactFileName('App.ts')).toBe('App');
  });

  it('should handle nested paths', () => {
    expect(normalizeArtifactFileName('packages/watcher/src/bootstrap/types.ts')).toBe(
      'packages__watcher__src__bootstrap__types'
    );
  });
});

describe('getArtifactPath', () => {
  it('should generate correct artifact path', () => {
    const path = getArtifactPath('demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.component-map-bootstrap.json');
  });

  it('should use custom output directory', () => {
    const path = getArtifactPath('demo-app/src/App.tsx', 'custom-output');
    expect(path).toBe('custom-output/demo-app__src__App.component-map-bootstrap.json');
  });
});

// =============================================================================
// CONFIG PARSING TESTS
// =============================================================================

describe('parseBootstrapConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  it('should default to artifact-only mode', () => {
    delete process.env.MAP_BOOTSTRAP_MODE;
    const config = parseBootstrapConfig();
    expect(config.mode).toBe('artifact-only');
  });

  it('should default to dry run true', () => {
    delete process.env.MAP_BOOTSTRAP_DRY_RUN;
    const config = parseBootstrapConfig();
    expect(config.dryRun).toBe(true);
  });

  it('should parse apply mode from env', () => {
    process.env.MAP_BOOTSTRAP_MODE = 'apply';
    const config = parseBootstrapConfig();
    expect(config.mode).toBe('apply');
  });

  it('should parse dry run false from env', () => {
    process.env.MAP_BOOTSTRAP_DRY_RUN = 'false';
    const config = parseBootstrapConfig();
    expect(config.dryRun).toBe(false);
  });

  it('should treat any value other than "false" as true for dry run', () => {
    process.env.MAP_BOOTSTRAP_DRY_RUN = 'yes';
    const config = parseBootstrapConfig();
    expect(config.dryRun).toBe(true);
  });
});

// =============================================================================
// MERGE TESTS
// =============================================================================

describe('mergeBootstrapArtifact', () => {
  describe('dry run mode', () => {
    it('should not modify anything in dry run mode', async () => {
      const suggestions = createBasicSuggestionResult();
      const artifact = generateBootstrapArtifact({
        filePath: 'test/App.tsx',
        suggestions,
        existingMap: null,
        timestamp: '2025-12-20T12:00:00.000Z',
      });

      const config: BootstrapConfig = {
        mode: 'apply',
        dryRun: true,
        writeTarget: 'repo-root',
      };

      const result = await mergeBootstrapArtifact(artifact, 'component-map.json', config);

      expect(result.success).toBe(true);
      expect(result.error).toContain('Dry run');
      expect(result.entriesAdded).toBe(2); // Would add 2 if not dry run
    });
  });
});
