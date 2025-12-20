/**
 * Tests for Vuetify Semantic Adapter (Phase 10A)
 *
 * These tests verify that the VuetifySemanticAdapter correctly extracts
 * semantic information from Vuetify-style components.
 *
 * Test Coverage:
 * - v-btn literal prop extraction (color, size, variant)
 * - v-btn disabled boolean inference
 * - v-card layout extraction (width, height, elevation)
 * - Confidence level downgrades for dynamic props
 * - Non-Vuetify components are ignored
 * - Adapter registry merge behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import * as babelTypes from '@babel/types';

import {
  VuetifySemanticAdapter,
  VUETIFY_COLOR_MAP,
} from '../vuetify/index.js';
import {
  registerAdapter,
  clearAdapters,
  runAdapters,
  mergeWithAdapterSemantics,
} from '../registry.js';
import { isVuetifyTag, type AdapterContext } from '../types.js';
import type { ComponentSemanticIntent } from '../../ast/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../__fixtures__/Vuetify.fixture.tsx'
);

function parseFixture(): babelTypes.File {
  const code = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  return parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
}

/**
 * Find a JSX element within a function by component name and optional tag filter.
 * Uses manual AST traversal to avoid Babel traverse interop issues.
 */
function findJSXElementInFunction(
  ast: babelTypes.File,
  componentName: string,
  tagFilter?: (tagName: string) => boolean
): babelTypes.JSXElement | null {
  let result: babelTypes.JSXElement | null = null;

  // Find the function declaration (could be in ExportNamedDeclaration)
  for (const node of ast.program.body) {
    let funcDecl: babelTypes.FunctionDeclaration | null = null;

    if (
      babelTypes.isFunctionDeclaration(node) &&
      node.id?.name === componentName
    ) {
      funcDecl = node;
    } else if (
      babelTypes.isExportNamedDeclaration(node) &&
      babelTypes.isFunctionDeclaration(node.declaration) &&
      node.declaration.id?.name === componentName
    ) {
      funcDecl = node.declaration;
    }

    if (funcDecl) {
      // Search for JSX elements in the function body
      findJSXInNode(funcDecl.body, (element) => {
        if (result) return;
        const tagName = getTagName(element);
        if (tagFilter) {
          if (tagName && tagFilter(tagName)) {
            result = element;
          }
        } else {
          result = element;
        }
      });
    }
  }

  return result;
}

/**
 * Get the tag name from a JSX element.
 */
function getTagName(element: babelTypes.JSXElement): string | null {
  const opening = element.openingElement;
  if (babelTypes.isJSXIdentifier(opening.name)) {
    return opening.name.name;
  }
  return null;
}

/**
 * Recursively find JSX elements in a node.
 */
function findJSXInNode(
  node: babelTypes.Node,
  callback: (element: babelTypes.JSXElement) => void
): void {
  if (babelTypes.isJSXElement(node)) {
    callback(node);
    // Continue searching in children
    for (const child of node.children) {
      if (babelTypes.isNode(child)) {
        findJSXInNode(child, callback);
      }
    }
    return;
  }

  // Handle different node types
  if (babelTypes.isBlockStatement(node)) {
    for (const stmt of node.body) {
      findJSXInNode(stmt, callback);
    }
  } else if (babelTypes.isReturnStatement(node) && node.argument) {
    findJSXInNode(node.argument, callback);
  } else if (babelTypes.isParenthesizedExpression(node)) {
    findJSXInNode(node.expression, callback);
  } else if (babelTypes.isJSXFragment(node)) {
    for (const child of node.children) {
      if (babelTypes.isNode(child)) {
        findJSXInNode(child, callback);
      }
    }
  }
}

function createContext(componentName: string): AdapterContext {
  return {
    filePath: FIXTURE_PATH,
    componentName,
  };
}

// =============================================================================
// VuetifySemanticAdapter Tests
// =============================================================================

describe('VuetifySemanticAdapter', () => {
  let adapter: VuetifySemanticAdapter;
  let ast: babelTypes.File;

  beforeEach(() => {
    adapter = new VuetifySemanticAdapter();
    ast = parseFixture();
  });

  describe('supports()', () => {
    it('should support v-btn elements', () => {
      const element = findJSXElementInFunction(ast, 'LoginButton');
      expect(element).not.toBeNull();

      const ctx = createContext('LoginButton');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support v-card elements', () => {
      const element = findJSXElementInFunction(ast, 'ProfileCard');
      expect(element).not.toBeNull();

      const ctx = createContext('ProfileCard');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support v-text-field elements', () => {
      const element = findJSXElementInFunction(ast, 'EmailInput');
      expect(element).not.toBeNull();

      const ctx = createContext('EmailInput');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support v-chip elements', () => {
      const element = findJSXElementInFunction(ast, 'StatusChip');
      expect(element).not.toBeNull();

      const ctx = createContext('StatusChip');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should NOT support regular HTML elements', () => {
      const element = findJSXElementInFunction(ast, 'RegularButton');
      expect(element).not.toBeNull();

      const ctx = createContext('RegularButton');
      expect(adapter.supports(element!, ctx)).toBe(false);
    });
  });

  describe('extract() - v-btn', () => {
    it('should extract color as fill from v-btn with literal color', () => {
      const element = findJSXElementInFunction(ast, 'LoginButton');
      expect(element).not.toBeNull();

      const ctx = createContext('LoginButton');
      const result = adapter.extract(element!, ctx);

      // Should have primary color mapped to hex via visual.fills
      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.primary);
      expect(result.semantics.visual!.fills![0]!.confidence).toBe('high');
    });

    it('should extract disabled boolean from v-btn', () => {
      const element = findJSXElementInFunction(ast, 'DisabledButton');
      expect(element).not.toBeNull();

      const ctx = createContext('DisabledButton');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled).toBeDefined();
      expect(result.semantics.booleans!.disabled!.value).toBe(true);
      expect(result.semantics.booleans!.disabled!.confidence).toBe('high');

      // Error color should also be extracted
      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.error);
    });

    it('should extract variant from v-btn as frameworkMetadata', () => {
      const element = findJSXElementInFunction(ast, 'OutlinedButton');
      expect(element).not.toBeNull();

      const ctx = createContext('OutlinedButton');
      const result = adapter.extract(element!, ctx);

      // Variant should be in frameworkMetadata
      expect(result.frameworkMetadata?.variant).toBe('outlined');
      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.success);
    });
  });

  describe('extract() - v-card', () => {
    it('should extract dimensions from v-card', () => {
      const element = findJSXElementInFunction(ast, 'ProfileCard');
      expect(element).not.toBeNull();

      const ctx = createContext('ProfileCard');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.layout).toBeDefined();
      expect(result.semantics.layout!.width?.value).toBe(300);
      expect(result.semantics.layout!.height?.value).toBe(400);
      expect(result.semantics.layout!.width?.confidence).toBe('high');
    });

    it('should extract title from v-card as text.title', () => {
      const element = findJSXElementInFunction(ast, 'ProfileCard');
      expect(element).not.toBeNull();

      const ctx = createContext('ProfileCard');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.title?.value).toBe('User Profile');
      expect(result.semantics.text?.title?.confidence).toBe('high');
    });

    it('should handle string width values', () => {
      const element = findJSXElementInFunction(ast, 'SimpleCard');
      expect(element).not.toBeNull();

      const ctx = createContext('SimpleCard');
      const result = adapter.extract(element!, ctx);

      // Width "200" should be parsed as number 200
      expect(result.semantics.layout?.width?.value).toBe(200);
    });

    it('should extract elevation as frameworkMetadata', () => {
      const element = findJSXElementInFunction(ast, 'ProfileCard');
      expect(element).not.toBeNull();

      const ctx = createContext('ProfileCard');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.elevation).toBe(4);
    });
  });

  describe('extract() - v-text-field', () => {
    it('should extract label as text.placeholder', () => {
      const element = findJSXElementInFunction(ast, 'EmailInput');
      expect(element).not.toBeNull();

      const ctx = createContext('EmailInput');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.placeholder?.value).toBe('Email Address');
      expect(result.semantics.text?.placeholder?.confidence).toBe('high');
    });

    it('should extract disabled from v-text-field', () => {
      const element = findJSXElementInFunction(ast, 'DisabledInput');
      expect(element).not.toBeNull();

      const ctx = createContext('DisabledInput');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled?.value).toBe(true);
    });
  });

  describe('extract() - v-chip', () => {
    it('should extract color from v-chip', () => {
      const element = findJSXElementInFunction(ast, 'StatusChip');
      expect(element).not.toBeNull();

      const ctx = createContext('StatusChip');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.success);
    });

    it('should extract variant from v-chip', () => {
      const element = findJSXElementInFunction(ast, 'OutlinedChip');
      expect(element).not.toBeNull();

      const ctx = createContext('OutlinedChip');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.variant).toBe('outlined');
      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.info);
    });
  });

  describe('confidence levels', () => {
    it('should downgrade confidence to low for dynamic props', () => {
      const element = findJSXElementInFunction(ast, 'DynamicProps');
      expect(element).not.toBeNull();

      const ctx = createContext('DynamicProps');
      const result = adapter.extract(element!, ctx);

      // Dynamic color and disabled should have low confidence
      // Note: For dynamic color, vuetifyColorToHex returns null for {{variable}} values
      // so fills may not be set, but disabled should still be extracted with low confidence
      expect(result.semantics.booleans?.disabled?.confidence).toBe('low');
    });
  });

  describe('MixedComponent handling', () => {
    it('should extract from v-btn within mixed component', () => {
      // For MixedComponent, we need to find the v-btn specifically
      const element = findJSXElementInFunction(ast, 'MixedComponent', isVuetifyTag);
      expect(element).not.toBeNull();

      const ctx = createContext('MixedComponent');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.primary);
    });
  });
});

// =============================================================================
// Adapter Registry Tests
// =============================================================================

describe('AdapterRegistry', () => {
  beforeEach(() => {
    clearAdapters();
  });

  afterEach(() => {
    clearAdapters();
  });

  describe('registerAdapter()', () => {
    it('should register an adapter', () => {
      const adapter = new VuetifySemanticAdapter();
      registerAdapter(adapter);

      // No error means success - internal state is verified via runAdapters
      expect(true).toBe(true);
    });

    it('should throw on duplicate adapter ID', () => {
      const adapter = new VuetifySemanticAdapter();
      registerAdapter(adapter);

      expect(() => registerAdapter(adapter)).toThrow(
        /already registered/
      );
    });
  });

  describe('runAdapters()', () => {
    let ast: babelTypes.File;

    beforeEach(() => {
      ast = parseFixture();
      registerAdapter(new VuetifySemanticAdapter());
    });

    it('should return results from registered adapters', () => {
      const element = findJSXElementInFunction(ast, 'LoginButton');
      expect(element).not.toBeNull();

      const ctx = createContext('LoginButton');
      const result = runAdapters(element!, ctx);

      expect(result.hasAdapterMatch).toBe(true);
      expect(result.contributions.length).toBe(1);
      expect(result.contributions[0]!.adapterId).toBe('vuetify');
    });

    it('should return empty array for non-Vuetify elements', () => {
      const element = findJSXElementInFunction(ast, 'RegularButton');
      expect(element).not.toBeNull();

      const ctx = createContext('RegularButton');
      const result = runAdapters(element!, ctx);

      expect(result.hasAdapterMatch).toBe(false);
      expect(result.contributions.length).toBe(0);
    });
  });

  describe('mergeWithAdapterSemantics()', () => {
    let ast: babelTypes.File;

    beforeEach(() => {
      ast = parseFixture();
      registerAdapter(new VuetifySemanticAdapter());
    });

    it('should merge adapter semantics with generic JSX semantics', () => {
      const element = findJSXElementInFunction(ast, 'LoginButton');
      expect(element).not.toBeNull();

      const ctx = createContext('LoginButton');
      const adapterResults = runAdapters(element!, ctx);

      const genericSemantics: ComponentSemanticIntent = {
        text: { content: [{ value: 'Sign In', loc: { startLine: 1, endLine: 1 }, confidence: 'high' }] },
        booleans: {},
        layout: {},
        flex: {},
        visual: {},
      };

      const merged = mergeWithAdapterSemantics(genericSemantics, adapterResults);

      // Should have both adapter fills and generic text
      expect(merged.visual.fills).toBeDefined();
      expect(merged.visual.fills![0]!.value).toBe(VUETIFY_COLOR_MAP.primary);
      expect(merged.text.content![0]!.value).toBe('Sign In');
    });

    it('should let adapter semantics override generic semantics for text.title', () => {
      const element = findJSXElementInFunction(ast, 'ProfileCard');
      expect(element).not.toBeNull();

      const ctx = createContext('ProfileCard');
      const adapterResults = runAdapters(element!, ctx);

      const genericSemantics: ComponentSemanticIntent = {
        text: { title: { value: 'Wrong Title', loc: { startLine: 1, endLine: 1 }, confidence: 'high' } },
        booleans: {},
        layout: {},
        flex: {},
        visual: { fills: [{ value: '#000000', loc: { startLine: 1, endLine: 1 }, confidence: 'high' }] },
      };

      const merged = mergeWithAdapterSemantics(genericSemantics, adapterResults);

      // Adapter title should override generic
      expect(merged.text.title?.value).toBe('User Profile');
      // Generic fills should remain since adapter doesn't set it
      expect(merged.visual.fills![0]!.value).toBe('#000000');
    });

    it('should preserve generic semantics when adapter does not set them', () => {
      const element = findJSXElementInFunction(ast, 'EmailInput');
      expect(element).not.toBeNull();

      const ctx = createContext('EmailInput');
      const adapterResults = runAdapters(element!, ctx);

      const genericSemantics: ComponentSemanticIntent = {
        text: {},
        booleans: {},
        layout: { width: { value: 100, loc: { startLine: 1, endLine: 1 }, confidence: 'medium' } },
        flex: { display: { value: 'flex', loc: { startLine: 1, endLine: 1 }, confidence: 'high' } },
        visual: { fills: [{ value: '#FF0000', loc: { startLine: 1, endLine: 1 }, confidence: 'high' }] },
      };

      const merged = mergeWithAdapterSemantics(genericSemantics, adapterResults);

      // Adapter sets placeholder, but not layout, flex, or fills
      expect(merged.text.placeholder?.value).toBe('Email Address');
      expect(merged.layout.width?.value).toBe(100);
      expect(merged.flex.display?.value).toBe('flex');
      expect(merged.visual.fills![0]!.value).toBe('#FF0000');
    });

    it('should return generic semantics unchanged when no adapter results', () => {
      const genericSemantics: ComponentSemanticIntent = {
        text: {},
        booleans: {},
        layout: {},
        flex: {},
        visual: { fills: [{ value: '#123456', loc: { startLine: 1, endLine: 1 }, confidence: 'medium' }] },
      };

      const emptyResult = {
        semantics: {},
        contributions: [],
        hasAdapterMatch: false,
      };

      const merged = mergeWithAdapterSemantics(genericSemantics, emptyResult);

      expect(merged).toEqual(genericSemantics);
    });
  });
});

// =============================================================================
// isVuetifyTag Tests
// =============================================================================

describe('isVuetifyTag', () => {
  it('should return true for v-btn', () => {
    expect(isVuetifyTag('v-btn')).toBe(true);
  });

  it('should return true for v-card', () => {
    expect(isVuetifyTag('v-card')).toBe(true);
  });

  it('should return true for v-text-field', () => {
    expect(isVuetifyTag('v-text-field')).toBe(true);
  });

  it('should return true for v-chip', () => {
    expect(isVuetifyTag('v-chip')).toBe(true);
  });

  it('should return false for div', () => {
    expect(isVuetifyTag('div')).toBe(false);
  });

  it('should return false for button', () => {
    expect(isVuetifyTag('button')).toBe(false);
  });

  it('should return false for CustomComponent', () => {
    expect(isVuetifyTag('CustomComponent')).toBe(false);
  });

  it('should return false for v-unknown', () => {
    // Only supported Vuetify tags return true
    expect(isVuetifyTag('v-unknown')).toBe(false);
  });
});

// =============================================================================
// VUETIFY_COLOR_MAP Tests
// =============================================================================

describe('VUETIFY_COLOR_MAP', () => {
  it('should have correct hex for primary', () => {
    expect(VUETIFY_COLOR_MAP.primary).toBe('#1976D2');
  });

  it('should have correct hex for success', () => {
    expect(VUETIFY_COLOR_MAP.success).toBe('#4CAF50');
  });

  it('should have correct hex for error', () => {
    expect(VUETIFY_COLOR_MAP.error).toBe('#FF5252');
  });

  it('should have correct hex for warning', () => {
    expect(VUETIFY_COLOR_MAP.warning).toBe('#FB8C00');
  });

  it('should have correct hex for info', () => {
    expect(VUETIFY_COLOR_MAP.info).toBe('#2196F3');
  });
});
