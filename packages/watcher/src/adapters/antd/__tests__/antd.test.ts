/**
 * Tests for Ant Design Semantic Adapter (Phase 10B)
 *
 * These tests verify that the AntdSemanticAdapter correctly extracts
 * semantic information from Ant Design components.
 *
 * Test Coverage:
 * - Button literal prop extraction (type, danger)
 * - Button disabled boolean inference
 * - Input placeholder extraction
 * - Card title extraction
 * - Tag color extraction
 * - Confidence level downgrades for dynamic props
 * - Non-AntD components are ignored (import detection)
 * - Adapter registry merge behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import * as babelTypes from '@babel/types';

import {
  AntdSemanticAdapter,
  isAntdComponent,
} from '../index.js';
import {
  registerAdapter,
  clearAdapters,
  runAdapters,
  mergeWithAdapterSemantics,
} from '../../registry.js';
import type { AdapterContext } from '../../types.js';
import type { ComponentSemanticIntent } from '../../../ast/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../__fixtures__/Antd.fixture.tsx'
);

function parseFixture(): babelTypes.File {
  const code = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  return parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
}

/**
 * Build import map from AST.
 * Maps local names to import sources.
 */
function buildImportMap(ast: babelTypes.File): Record<string, string> {
  const imports: Record<string, string> = {};

  for (const node of ast.program.body) {
    if (babelTypes.isImportDeclaration(node)) {
      const source = node.source.value;
      for (const specifier of node.specifiers) {
        if (babelTypes.isImportSpecifier(specifier)) {
          const localName = specifier.local.name;
          imports[localName] = source;
        } else if (babelTypes.isImportDefaultSpecifier(specifier)) {
          const localName = specifier.local.name;
          imports[localName] = source;
        }
      }
    }
  }

  return imports;
}

/**
 * Find a JSX element within a function by component name.
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
  } else if (babelTypes.isVariableDeclaration(node)) {
    for (const decl of node.declarations) {
      if (decl.init) {
        findJSXInNode(decl.init, callback);
      }
    }
  }
}

function createContext(
  componentName: string,
  imports: Record<string, string>,
  tagName?: string
): AdapterContext {
  return {
    filePath: FIXTURE_PATH,
    componentName: tagName ?? componentName,
    imports,
  };
}

// =============================================================================
// isAntdComponent Tests
// =============================================================================

describe('isAntdComponent', () => {
  it('should return true for Button imported from antd', () => {
    const imports = { Button: 'antd', Input: 'antd' };
    expect(isAntdComponent('Button', imports)).toBe(true);
  });

  it('should return true for components from antd/es/*', () => {
    const imports = { Button: 'antd/es/button' };
    expect(isAntdComponent('Button', imports)).toBe(true);
  });

  it('should return false for components not in imports', () => {
    const imports = { Input: 'antd' };
    expect(isAntdComponent('Button', imports)).toBe(false);
  });

  it('should return false for components from other libraries', () => {
    const imports = { Button: '@mui/material' };
    expect(isAntdComponent('Button', imports)).toBe(false);
  });

  it('should return false when imports is undefined', () => {
    expect(isAntdComponent('Button', undefined)).toBe(false);
  });

  it('should return false for local components', () => {
    const imports = { Button: './components/Button' };
    expect(isAntdComponent('Button', imports)).toBe(false);
  });
});

// =============================================================================
// AntdSemanticAdapter Tests
// =============================================================================

describe('AntdSemanticAdapter', () => {
  let adapter: AntdSemanticAdapter;
  let ast: babelTypes.File;
  let imports: Record<string, string>;

  beforeEach(() => {
    adapter = new AntdSemanticAdapter();
    ast = parseFixture();
    imports = buildImportMap(ast);
  });

  describe('adapter properties', () => {
    it('should have correct id', () => {
      expect(adapter.id).toBe('antd');
    });

    it('should have correct displayName', () => {
      expect(adapter.displayName).toBe('Ant Design');
    });

    it('should have priority 51 (after Vuetify)', () => {
      expect(adapter.priority).toBe(51);
    });
  });

  describe('supports()', () => {
    it('should support Button imported from antd', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonPrimary', imports, 'Button');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support Input imported from antd', () => {
      const element = findJSXElementInFunction(ast, 'InputWithPlaceholder');
      expect(element).not.toBeNull();

      const ctx = createContext('InputWithPlaceholder', imports, 'Input');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support Card imported from antd', () => {
      const element = findJSXElementInFunction(ast, 'CardWithTitle');
      expect(element).not.toBeNull();

      const ctx = createContext('CardWithTitle', imports, 'Card');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should support Tag imported from antd', () => {
      const element = findJSXElementInFunction(ast, 'TagGreen');
      expect(element).not.toBeNull();

      const ctx = createContext('TagGreen', imports, 'Tag');
      expect(adapter.supports(element!, ctx)).toBe(true);
    });

    it('should NOT support components not imported from antd', () => {
      const element = findJSXElementInFunction(ast, 'NotAntdButton');
      expect(element).not.toBeNull();

      // LocalButton is not in imports (or imported from a different source)
      const ctx = createContext('NotAntdButton', imports, 'LocalButton');
      expect(adapter.supports(element!, ctx)).toBe(false);
    });

    it('should NOT support unknown component names', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      // Unknown component even with antd import
      const ctx = createContext('ButtonPrimary', imports, 'UnknownComponent');
      expect(adapter.supports(element!, ctx)).toBe(false);
    });
  });

  describe('extract() - Button', () => {
    it('should extract type as fill from Button with type="primary"', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonPrimary', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:primary');
      expect(result.semantics.visual!.fills![0]!.confidence).toBe('high');
    });

    it('should extract text content from Button children', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonPrimary', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.content).toBeDefined();
      expect(result.semantics.text!.content![0]!.value).toBe('Submit');
      expect(result.semantics.text!.content![0]!.confidence).toBe('high');
    });

    it('should extract danger as fill from Button with danger prop', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDanger');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDanger', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:danger');
    });

    it('should prioritize danger over type prop', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDangerWithType');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDangerWithType', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      // danger should take precedence over type
      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:danger');
    });

    it('should extract disabled boolean from Button', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDisabled');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDisabled', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled).toBeDefined();
      expect(result.semantics.booleans!.disabled!.value).toBe(true);
      expect(result.semantics.booleans!.disabled!.confidence).toBe('high');
    });

    it('should extract disabled={true} explicitly', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDisabledExplicit');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDisabledExplicit', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans!.disabled!.value).toBe(true);
      expect(result.semantics.booleans!.disabled!.confidence).toBe('high');
    });

    it('should extract disabled={false}', () => {
      const element = findJSXElementInFunction(ast, 'ButtonEnabled');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonEnabled', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans!.disabled!.value).toBe(false);
      expect(result.semantics.booleans!.disabled!.confidence).toBe('high');
    });

    it('should downgrade confidence for bound disabled prop', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDisabledBound');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDisabledBound', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled).toBeDefined();
      expect(result.semantics.booleans!.disabled!.confidence).toBe('low');
    });

    it('should store size in frameworkMetadata', () => {
      const element = findJSXElementInFunction(ast, 'ButtonLarge');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonLarge', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.size).toBe('large');
    });

    it('should extract dashed type', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDashed');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDashed', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:dashed');
    });

    it('should extract text type', () => {
      const element = findJSXElementInFunction(ast, 'ButtonText');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonText', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:text');
    });

    it('should extract link type', () => {
      const element = findJSXElementInFunction(ast, 'ButtonLink');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonLink', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:link');
    });

    it('should handle Button with no type (default)', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDefault');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDefault', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      // No type prop means no fills
      expect(result.semantics.visual?.fills).toBeUndefined();
      // But text should still be extracted
      expect(result.semantics.text?.content).toBeDefined();
    });

    it('should downgrade confidence for dynamic type', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDynamicType');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonDynamicType', imports, 'Button');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.confidence).toBe('low');
    });
  });

  describe('extract() - Input', () => {
    it('should extract placeholder from Input', () => {
      const element = findJSXElementInFunction(ast, 'InputWithPlaceholder');
      expect(element).not.toBeNull();

      const ctx = createContext('InputWithPlaceholder', imports, 'Input');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.placeholder).toBeDefined();
      expect(result.semantics.text!.placeholder!.value).toBe('Enter your name');
      expect(result.semantics.text!.placeholder!.confidence).toBe('high');
    });

    it('should extract disabled from Input', () => {
      const element = findJSXElementInFunction(ast, 'InputDisabled');
      expect(element).not.toBeNull();

      const ctx = createContext('InputDisabled', imports, 'Input');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled?.value).toBe(true);
    });

    it('should store size in frameworkMetadata for Input', () => {
      const element = findJSXElementInFunction(ast, 'InputLarge');
      expect(element).not.toBeNull();

      const ctx = createContext('InputLarge', imports, 'Input');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.size).toBe('large');
    });

    it('should downgrade confidence for bound disabled prop', () => {
      const element = findJSXElementInFunction(ast, 'InputDisabledBound');
      expect(element).not.toBeNull();

      const ctx = createContext('InputDisabledBound', imports, 'Input');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.booleans?.disabled?.confidence).toBe('low');
    });

    it('should handle Input with no props', () => {
      const element = findJSXElementInFunction(ast, 'InputEmpty');
      expect(element).not.toBeNull();

      const ctx = createContext('InputEmpty', imports, 'Input');
      const result = adapter.extract(element!, ctx);

      // Empty semantics but still valid result
      expect(result.provenance.reason).toBe('Input component');
    });
  });

  describe('extract() - Card', () => {
    it('should extract title from Card as text.title', () => {
      const element = findJSXElementInFunction(ast, 'CardWithTitle');
      expect(element).not.toBeNull();

      const ctx = createContext('CardWithTitle', imports, 'Card');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.title).toBeDefined();
      expect(result.semantics.text!.title!.value).toBe('Card Title');
      expect(result.semantics.text!.title!.confidence).toBe('high');
    });

    it('should store size in frameworkMetadata for Card', () => {
      const element = findJSXElementInFunction(ast, 'CardSmall');
      expect(element).not.toBeNull();

      const ctx = createContext('CardSmall', imports, 'Card');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.size).toBe('small');
    });

    it('should handle Card with no title', () => {
      const element = findJSXElementInFunction(ast, 'CardNoTitle');
      expect(element).not.toBeNull();

      const ctx = createContext('CardNoTitle', imports, 'Card');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.title).toBeUndefined();
    });

    it('should downgrade confidence for dynamic title', () => {
      const element = findJSXElementInFunction(ast, 'CardDynamicTitle');
      expect(element).not.toBeNull();

      const ctx = createContext('CardDynamicTitle', imports, 'Card');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.title?.confidence).toBe('low');
    });
  });

  describe('extract() - Tag', () => {
    it('should extract color from Tag as visual.fills', () => {
      const element = findJSXElementInFunction(ast, 'TagGreen');
      expect(element).not.toBeNull();

      const ctx = createContext('TagGreen', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual?.fills).toBeDefined();
      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:color:green');
      expect(result.semantics.visual!.fills![0]!.confidence).toBe('high');
    });

    it('should extract text content from Tag children', () => {
      const element = findJSXElementInFunction(ast, 'TagGreen');
      expect(element).not.toBeNull();

      const ctx = createContext('TagGreen', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.text?.content).toBeDefined();
      expect(result.semantics.text!.content![0]!.value).toBe('Success');
    });

    it('should handle red color', () => {
      const element = findJSXElementInFunction(ast, 'TagRed');
      expect(element).not.toBeNull();

      const ctx = createContext('TagRed', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:color:red');
    });

    it('should handle preset colors like processing', () => {
      const element = findJSXElementInFunction(ast, 'TagProcessing');
      expect(element).not.toBeNull();

      const ctx = createContext('TagProcessing', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.value).toBe('antd:color:processing');
    });

    it('should handle Tag with no color', () => {
      const element = findJSXElementInFunction(ast, 'TagDefault');
      expect(element).not.toBeNull();

      const ctx = createContext('TagDefault', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual?.fills).toBeUndefined();
      expect(result.semantics.text?.content).toBeDefined();
    });

    it('should downgrade confidence for dynamic color', () => {
      const element = findJSXElementInFunction(ast, 'TagDynamicColor');
      expect(element).not.toBeNull();

      const ctx = createContext('TagDynamicColor', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.semantics.visual!.fills![0]!.confidence).toBe('low');
    });

    it('should store antdColor in frameworkMetadata', () => {
      const element = findJSXElementInFunction(ast, 'TagGreen');
      expect(element).not.toBeNull();

      const ctx = createContext('TagGreen', imports, 'Tag');
      const result = adapter.extract(element!, ctx);

      expect(result.frameworkMetadata?.antdColor).toBe('green');
    });
  });
});

// =============================================================================
// Adapter Registry Tests with AntD
// =============================================================================

describe('AdapterRegistry with AntD', () => {
  beforeEach(() => {
    clearAdapters();
  });

  afterEach(() => {
    clearAdapters();
  });

  describe('registerAdapter()', () => {
    it('should register AntD adapter', () => {
      const adapter = new AntdSemanticAdapter();
      registerAdapter(adapter);
      expect(true).toBe(true);
    });

    it('should throw on duplicate adapter ID', () => {
      const adapter = new AntdSemanticAdapter();
      registerAdapter(adapter);

      expect(() => registerAdapter(adapter)).toThrow(/already registered/);
    });
  });

  describe('runAdapters()', () => {
    let ast: babelTypes.File;
    let imports: Record<string, string>;

    beforeEach(() => {
      ast = parseFixture();
      imports = buildImportMap(ast);
      registerAdapter(new AntdSemanticAdapter());
    });

    it('should run AntD adapter on supported elements', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      const ctx = createContext('ButtonPrimary', imports, 'Button');
      const results = runAdapters(element!, ctx);

      expect(results.hasAdapterMatch).toBe(true);
      expect(results.contributions.length).toBe(1);
      expect(results.contributions[0].adapterId).toBe('antd');
    });

    it('should return empty for non-AntD elements', () => {
      const element = findJSXElementInFunction(ast, 'NotAntdButton');
      expect(element).not.toBeNull();

      const ctx = createContext('NotAntdButton', imports, 'LocalButton');
      const results = runAdapters(element!, ctx);

      expect(results.hasAdapterMatch).toBe(false);
      expect(results.contributions.length).toBe(0);
    });
  });

  describe('mergeWithAdapterSemantics()', () => {
    let ast: babelTypes.File;
    let imports: Record<string, string>;

    beforeEach(() => {
      ast = parseFixture();
      imports = buildImportMap(ast);
      registerAdapter(new AntdSemanticAdapter());
    });

    it('should merge adapter semantics with base semantics', () => {
      const element = findJSXElementInFunction(ast, 'ButtonPrimary');
      expect(element).not.toBeNull();

      const baseSemantics: ComponentSemanticIntent = {
        text: {},
        booleans: {},
        layout: {},
        flex: {},
        visual: {},
      };

      const ctx = createContext('ButtonPrimary', imports, 'Button');
      const adapterResults = runAdapters(element!, ctx);
      const merged = mergeWithAdapterSemantics(baseSemantics, adapterResults);

      // Should have adapter-extracted fills
      expect(merged.visual?.fills).toBeDefined();
      expect(merged.visual!.fills![0]!.value).toBe('antd:primary');
    });

    it('should prefer adapter semantics over base for overlapping fields', () => {
      const element = findJSXElementInFunction(ast, 'ButtonDisabled');
      expect(element).not.toBeNull();

      const baseSemantics: ComponentSemanticIntent = {
        text: {},
        booleans: {
          disabled: {
            value: false,
            loc: { startLine: 1, endLine: 1 },
            confidence: 'low',
          },
        },
        layout: {},
        flex: {},
        visual: {},
      };

      const ctx = createContext('ButtonDisabled', imports, 'Button');
      const adapterResults = runAdapters(element!, ctx);
      const merged = mergeWithAdapterSemantics(baseSemantics, adapterResults);

      // Adapter's high-confidence extraction should win
      expect(merged.booleans?.disabled?.value).toBe(true);
      expect(merged.booleans?.disabled?.confidence).toBe('high');
    });

    it('should not modify base semantics when no adapter matches', () => {
      const element = findJSXElementInFunction(ast, 'NotAntdButton');
      expect(element).not.toBeNull();

      const baseSemantics: ComponentSemanticIntent = {
        text: {},
        booleans: {},
        layout: {},
        flex: {},
        visual: {},
      };

      const ctx = createContext('NotAntdButton', imports, 'LocalButton');
      const adapterResults = runAdapters(element!, ctx);
      const merged = mergeWithAdapterSemantics(baseSemantics, adapterResults);

      expect(merged).toEqual(baseSemantics);
    });
  });
});
