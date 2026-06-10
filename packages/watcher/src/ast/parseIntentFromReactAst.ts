/**
 * @aesthetic-function/watcher - ast/parseIntentFromReactAst.ts
 *
 * Read-only AST-based analyzer for React TSX using Babel.
 *
 * WHY: Extracts literal semantics from JSX to produce structured reports
 * that can be diffed against markers and design overrides. This enables
 * deeper code understanding beyond regex-based marker parsing.
 *
 * SCOPE:
 * - Literals only (StringLiteral, NumericLiteral, BooleanLiteral)
 * - No inference from variables
 * - No className parsing
 * - No evaluation
 * - Read-only (never modifies source)
 *
 * ARCHITECTURE:
 * - Uses @babel/parser for TSX parsing
 * - Uses @babel/traverse for AST walking
 * - Extracts components (function declarations & arrow functions)
 * - Collects JSX text, prop literals, and inline style literals
 */

import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';
import * as t from '@babel/types';

// Handle ESM/CJS interop for @babel/traverse
// At runtime, babelTraverse may be { default: function } or { default: { default: function } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTraverseFunction(): (parent: t.Node, opts?: TraverseOptions<unknown>) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = babelTraverse as any;
  if (typeof mod === 'function') {
    return mod;
  }
  if (typeof mod.default === 'function') {
    return mod.default;
  }
  if (mod.default && typeof mod.default.default === 'function') {
    return mod.default.default;
  }
  throw new Error('Could not resolve @babel/traverse function');
}

const traverse = getTraverseFunction();
import type {
  AstIntentReport,
  AstComponentReport,
  JsxTextLiteral,
  JsxPropLiteral,
  InlineStyleLiteral,
  SourceLocation,
  Anchor,
  AnchoredAstReport,
  AnchorExtracted,
  ComponentSemanticIntent,
  SemanticValue,
  TextSemantics,
  BooleanSemantics,
  LayoutSemantics,
  FlexSemantics,
  VisualSemantics,
} from './types.js';
import { computeComponentKey } from './types.js';
import { extractMarkers, type MarkerData } from '../parse/parseIntentFromReact.js';

// Adapter imports (Phase 10A)
import type { AdapterContext, AdapterResult } from '../adapters/types.js';
import type { AdapterExtractionResult, AdapterContribution } from '../adapters/registry.js';
import {
  runAdapters,
  mergeWithAdapterSemantics,
  initializeDefaultAdapters,
} from '../adapters/index.js';

// Canonical normalization imports (Phase 10E)
import {
  normalizeToCanonical,
  type CanonicalSemantics,
  type NormalizationNote,
} from '../tokens/canonical/index.js';

// =============================================================================
// HEX COLOR REGEX
// =============================================================================

/**
 * Matches hex color values (3 or 6 hex digits).
 * Used to identify backgroundColor values that can map to Figma fills.
 */
const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert Babel location to our SourceLocation.
 */
function toSourceLocation(loc: t.SourceLocation | null | undefined): SourceLocation {
  if (!loc) {
    return { startLine: 0, endLine: 0 };
  }
  return {
    startLine: loc.start.line,
    endLine: loc.end.line,
    startColumn: loc.start.column,
    endColumn: loc.end.column,
  };
}

/**
 * Check if a node is a React component (starts with uppercase).
 * React convention: components start with uppercase, elements are lowercase.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Extract the element name from a JSXOpeningElement.
 */
function getJsxElementName(node: t.JSXOpeningElement): string {
  if (t.isJSXIdentifier(node.name)) {
    return node.name.name;
  }
  if (t.isJSXMemberExpression(node.name)) {
    // e.g., Foo.Bar -> "Foo.Bar"
    const parts: string[] = [];
    let current: t.JSXMemberExpression | t.JSXIdentifier = node.name;
    while (t.isJSXMemberExpression(current)) {
      parts.unshift(current.property.name);
      current = current.object as t.JSXMemberExpression | t.JSXIdentifier;
    }
    if (t.isJSXIdentifier(current)) {
      parts.unshift(current.name);
    }
    return parts.join('.');
  }
  return 'unknown';
}

/**
 * Extract literal value from an AST node.
 * Returns undefined for non-literal nodes.
 */
function getLiteralValue(
  node: t.Node | null | undefined
): string | number | boolean | undefined {
  if (!node) return undefined;

  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isNumericLiteral(node)) {
    return node.value;
  }
  if (t.isBooleanLiteral(node)) {
    return node.value;
  }
  // Handle JSX expression container with literal inside
  if (t.isJSXExpressionContainer(node) && t.isExpression(node.expression)) {
    return getLiteralValue(node.expression);
  }

  return undefined;
}

// =============================================================================
// COMPONENT COLLECTOR
// =============================================================================

interface ComponentBounds {
  name: string;
  isExported: boolean;
  startLine: number;
  endLine: number;
  node: t.Node;
}

/**
 * Collect all component definitions in the file.
 *
 * Finds:
 * - export function Foo() {}
 * - export const Foo = () => {}
 * - function Foo() {} with separate export
 * - const Foo = () => {} with separate export
 * - const Foo = React.forwardRef((props, ref) => {}) / forwardRef(...)
 * - const Foo = memo(() => {}) / React.memo(...)
 */
function collectComponents(ast: t.File): ComponentBounds[] {
  const components: ComponentBounds[] = [];
  const exportedNames = new Set<string>();

  // First pass: collect all export names
  traverse(ast, {
    ExportNamedDeclaration(path) {
      // export { Foo, Bar }
      for (const spec of path.node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
          exportedNames.add(spec.exported.name);
        }
      }
      // export function Foo() {} or export const Foo = ...
      if (path.node.declaration) {
        if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
          exportedNames.add(path.node.declaration.id.name);
        }
        if (t.isVariableDeclaration(path.node.declaration)) {
          for (const decl of path.node.declaration.declarations) {
            if (t.isIdentifier(decl.id)) {
              exportedNames.add(decl.id.name);
            }
          }
        }
      }
    },
    ExportDefaultDeclaration(path) {
      // export default function Foo() {} or export default Foo
      if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
        exportedNames.add(path.node.declaration.id.name);
      }
      if (t.isIdentifier(path.node.declaration)) {
        exportedNames.add(path.node.declaration.name);
      }
    },
  });

  // Second pass: collect component definitions
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name && isComponentName(name)) {
        const loc = path.node.loc;
        if (loc) {
          components.push({
            name,
            isExported: exportedNames.has(name),
            startLine: loc.start.line,
            endLine: loc.end.line,
            node: path.node,
          });
        }
      }
    },
    VariableDeclarator(path) {
      // const Foo = () => {} or const Foo = function() {}
      if (!t.isIdentifier(path.node.id)) return;
      const name = path.node.id.name;
      if (!isComponentName(name)) return;

      const init = path.node.init;
      if (!init) return;

      // Unwrap React.forwardRef(...) / memo(...) wrappers so that the dominant
      // shadcn/ui shape `const Button = React.forwardRef((props, ref) => ...)`
      // is recognized. We look at the first argument when it is an arrow/function
      // expression, then fall through to the regular check below.
      let unwrapped: t.Node = init;
      if (t.isCallExpression(init)) {
        const callee = init.callee;
        const calleeName = t.isIdentifier(callee)
          ? callee.name
          : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
            ? callee.property.name
            : undefined;
        if ((calleeName === 'forwardRef' || calleeName === 'memo') && init.arguments.length > 0) {
          const arg = init.arguments[0];
          if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
            unwrapped = arg;
          }
        }
      }

      // Check if it's a function expression or arrow function
      if (t.isArrowFunctionExpression(unwrapped) || t.isFunctionExpression(unwrapped)) {
        // Use the VariableDeclaration (parent of VariableDeclarator) for location
        // path.parent is the VariableDeclaration
        const parent = path.parent;
        if (t.isVariableDeclaration(parent) && parent.loc) {
          components.push({
            name,
            isExported: exportedNames.has(name),
            startLine: parent.loc.start.line,
            endLine: parent.loc.end.line,
            node: parent, // Use the full VariableDeclaration for traversal
          });
        }
      }
    },
  });

  // Sort by start line
  return components.sort((a, b) => a.startLine - b.startLine);
}

// =============================================================================
// JSX LITERAL EXTRACTORS
// =============================================================================

interface LiteralCollector {
  textLiterals: JsxTextLiteral[];
  propLiterals: JsxPropLiteral[];
  styleLiterals: InlineStyleLiteral[];
}

// =============================================================================
// SEMANTIC PROP/STYLE CATEGORIES (Phase 6B)
// =============================================================================

/** Text-related prop names to extract */
const TEXT_PROPS = ['placeholder', 'title', 'aria-label', 'alt'] as const;

/** Boolean prop names to extract */
const BOOLEAN_PROPS = ['disabled', 'checked', 'selected'] as const;

/** Numeric layout prop names to extract (from both props and styles) */
const LAYOUT_PROPS = ['width', 'height'] as const;
const LAYOUT_STYLE_PROPS = ['width', 'height', 'padding', 'margin', 'gap'] as const;

/** Flexbox style props to extract */
const FLEX_STYLE_PROPS = ['display', 'flexDirection', 'justifyContent', 'alignItems'] as const;

/**
 * Build semantic intent from collected literals.
 */
function buildSemanticIntent(
  textLiterals: JsxTextLiteral[],
  propLiterals: JsxPropLiteral[],
  styleLiterals: InlineStyleLiteral[]
): ComponentSemanticIntent {
  // Initialize empty semantics
  const text: TextSemantics = {};
  const booleans: BooleanSemantics = {};
  const layout: LayoutSemantics = {};
  const flex: FlexSemantics = {};
  const visual: VisualSemantics = {};

  // Text content from JSX children
  const contentValues: SemanticValue<string>[] = textLiterals
    .filter((lit) => lit.text.trim().length > 0)
    .map((lit) => ({
      value: lit.text.trim(),
      loc: lit.loc,
      confidence: 'high' as const,
    }));
  if (contentValues.length > 0) {
    text.content = contentValues;
  }

  // Process props
  for (const prop of propLiterals) {
    const propName = prop.prop;
    const loc = prop.loc;

    // Text props
    if (TEXT_PROPS.includes(propName as (typeof TEXT_PROPS)[number])) {
      if (typeof prop.value === 'string') {
        const semanticValue: SemanticValue<string> = {
          value: prop.value,
          loc,
          confidence: 'high',
        };
        if (propName === 'placeholder') text.placeholder = semanticValue;
        else if (propName === 'title') text.title = semanticValue;
        else if (propName === 'aria-label') text.ariaLabel = semanticValue;
        else if (propName === 'alt') text.alt = semanticValue;
      }
    }

    // Boolean props
    if (BOOLEAN_PROPS.includes(propName as (typeof BOOLEAN_PROPS)[number])) {
      if (typeof prop.value === 'boolean') {
        const semanticValue: SemanticValue<boolean> = {
          value: prop.value,
          loc,
          confidence: 'high',
        };
        if (propName === 'disabled') booleans.disabled = semanticValue;
        else if (propName === 'checked') booleans.checked = semanticValue;
        else if (propName === 'selected') booleans.selected = semanticValue;
      }
    }

    // Numeric layout props (width, height from element props)
    if (LAYOUT_PROPS.includes(propName as (typeof LAYOUT_PROPS)[number])) {
      if (typeof prop.value === 'number') {
        const semanticValue: SemanticValue<number> = {
          value: prop.value,
          loc,
          confidence: 'high',
        };
        if (propName === 'width') layout.width = semanticValue;
        else if (propName === 'height') layout.height = semanticValue;
      }
    }
  }

  // Process inline styles
  for (const style of styleLiterals) {
    const styleProp = style.styleProp;
    const loc = style.loc;

    // Layout style props
    if (LAYOUT_STYLE_PROPS.includes(styleProp as (typeof LAYOUT_STYLE_PROPS)[number])) {
      if (typeof style.value === 'number') {
        const semanticValue: SemanticValue<number> = {
          value: style.value,
          loc,
          confidence: 'high',
        };
        // Only set if not already set by a prop
        if (styleProp === 'width' && !layout.width) layout.width = semanticValue;
        else if (styleProp === 'height' && !layout.height) layout.height = semanticValue;
        else if (styleProp === 'padding') layout.padding = semanticValue;
        else if (styleProp === 'margin') layout.margin = semanticValue;
        else if (styleProp === 'gap') layout.gap = semanticValue;
      }
    }

    // Flex style props
    if (FLEX_STYLE_PROPS.includes(styleProp as (typeof FLEX_STYLE_PROPS)[number])) {
      if (typeof style.value === 'string') {
        const semanticValue: SemanticValue<string> = {
          value: style.value,
          loc,
          confidence: 'high',
        };
        if (styleProp === 'display') flex.display = semanticValue;
        else if (styleProp === 'flexDirection') flex.flexDirection = semanticValue;
        else if (styleProp === 'justifyContent') flex.justifyContent = semanticValue;
        else if (styleProp === 'alignItems') flex.alignItems = semanticValue;
      }
    }

    // Visual props (fills)
    if (styleProp === 'backgroundColor' && typeof style.value === 'string') {
      if (HEX_COLOR_REGEX.test(style.value)) {
        const fillValue: SemanticValue<string> = {
          value: style.value,
          loc,
          confidence: 'high',
        };
        if (!visual.fills) visual.fills = [];
        visual.fills.push(fillValue);
      }
    }
  }

  return {
    text,
    booleans,
    layout,
    flex,
    visual,
  };
}

/**
 * Extract all JSX literals from a component's AST node.
 */
function extractJsxLiterals(componentNode: t.Node): LiteralCollector {
  const collector: LiteralCollector = {
    textLiterals: [],
    propLiterals: [],
    styleLiterals: [],
  };

  // We need to traverse just this component, not the whole file
  // Using a minimal AST wrapper approach
  traverse(
    // Wrap the node in a file-like structure for traverse
    { type: 'File', program: { type: 'Program', body: [componentNode as t.Statement], directives: [], sourceType: 'module' } } as t.File,
    {
      // Collect JSX text
      JSXText(path) {
        const text = path.node.value.trim();
        if (text) {
          collector.textLiterals.push({
            text,
            loc: toSourceLocation(path.node.loc),
          });
        }
      },

      // Collect JSX opening elements for props and inline styles
      JSXOpeningElement(path) {
        const elementName = getJsxElementName(path.node);

        for (const attr of path.node.attributes) {
          if (!t.isJSXAttribute(attr)) continue;
          if (!t.isJSXIdentifier(attr.name)) continue;

          const propName = attr.name.name;

          // Handle style prop specially
          if (propName === 'style') {
            extractInlineStyles(attr, elementName, collector);
            continue;
          }

          // Handle regular prop literals
          const value = getLiteralValue(attr.value);
          if (value !== undefined) {
            collector.propLiterals.push({
              element: elementName,
              prop: propName,
              value,
              loc: toSourceLocation(attr.loc),
            });
          }
        }
      },
    }
  );

  return collector;
}

/**
 * Extract inline style literals from a style prop.
 *
 * Handles: style={{ backgroundColor: "#3B82F6", borderRadius: 12 }}
 */
function extractInlineStyles(
  attr: t.JSXAttribute,
  elementName: string,
  collector: LiteralCollector
): void {
  // style={...} -> JSXExpressionContainer
  if (!t.isJSXExpressionContainer(attr.value)) return;

  const expr = attr.value.expression;
  if (!t.isObjectExpression(expr)) return;

  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop)) continue;
    if (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key)) continue;

    const styleProp = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
    const value = getLiteralValue(prop.value);

    if (value !== undefined && (typeof value === 'string' || typeof value === 'number')) {
      collector.styleLiterals.push({
        element: elementName,
        styleProp,
        value,
        loc: toSourceLocation(prop.loc),
      });
    }
  }
}

// =============================================================================
// MAIN AST PARSER
// =============================================================================

/**
 * Parse React TSX code and extract literal semantics from JSX.
 *
 * @param code - The source code to parse
 * @param filePath - Path to the file (for reporting)
 * @returns AstIntentReport with extracted components and literals
 */
export function parseIntentFromReactAst(code: string, filePath: string): AstIntentReport {
  // Parse with Babel
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  // Collect components
  const componentBounds = collectComponents(ast);

  // Build reports for each component
  const components: AstComponentReport[] = componentBounds.map((comp) => {
    const literals = extractJsxLiterals(comp.node);

    // Build semantic intent from literals (Phase 6B)
    const semantics = buildSemanticIntent(
      literals.textLiterals,
      literals.propLiterals,
      literals.styleLiterals
    );

    // Compute componentKey for exported components (Phase 8D)
    const componentKey = comp.isExported
      ? computeComponentKey(filePath, comp.name)
      : undefined;

    return {
      componentName: comp.name,
      componentKey,
      isExported: comp.isExported,
      loc: {
        startLine: comp.startLine,
        endLine: comp.endLine,
      },
      jsxTextLiterals: literals.textLiterals,
      jsxPropLiterals: literals.propLiterals,
      inlineStyleLiterals: literals.styleLiterals,
      semantics,
    };
  });

  return {
    filePath,
    components,
  };
}

// =============================================================================
// MARKER ANCHORING
// =============================================================================

/**
 * Find the first exported component whose start line is after the given line.
 *
 * WHY: @figma markers appear immediately before component definitions.
 * We anchor each marker to the next exported component in the file.
 */
function findNextExportedComponent(
  line: number,
  components: AstComponentReport[]
): AstComponentReport | undefined {
  // Find first exported component that starts after the marker line
  return components.find((c) => c.isExported && c.loc.startLine > line);
}

/**
 * Extract fills from inline backgroundColor styles that look like hex colors.
 */
function extractFills(component: AstComponentReport): string[] {
  const fills: string[] = [];

  for (const style of component.inlineStyleLiterals) {
    if (
      style.styleProp === 'backgroundColor' &&
      typeof style.value === 'string' &&
      HEX_COLOR_REGEX.test(style.value)
    ) {
      fills.push(style.value);
    }
  }

  return fills;
}

/**
 * Extract text literals from a component (trimmed, deduped).
 */
function extractTexts(component: AstComponentReport): string[] {
  const texts: string[] = [];

  for (const lit of component.jsxTextLiterals) {
    const trimmed = lit.text.trim();
    if (trimmed && !texts.includes(trimmed)) {
      texts.push(trimmed);
    }
  }

  return texts;
}

/**
 * Anchor @figma markers to AST components.
 *
 * For each marker, finds the nearest following exported component
 * and extracts relevant literals (text, fills).
 *
 * @param code - Source code
 * @param filePath - Path to the file
 * @param astReport - Pre-parsed AST report (optional, will parse if not provided)
 * @returns AnchoredAstReport with marker-to-component mappings
 */
export function anchorMarkersToAst(
  code: string,
  filePath: string,
  astReport?: AstIntentReport
): AnchoredAstReport {
  // Parse markers using existing regex parser
  const markers: MarkerData[] = extractMarkers(code);

  // Get or create AST report
  const report = astReport ?? parseIntentFromReactAst(code, filePath);

  // Create anchors
  const anchors: Anchor[] = markers.map((marker) => {
    const matchedComponent = findNextExportedComponent(marker.lineNumber, report.components);

    const anchor: Anchor = {
      nodeName: marker.node,
      markerLine: marker.lineNumber,
      extracted: {},
      notes: [],
    };

    if (!matchedComponent) {
      anchor.notes.push('no component found after marker');
      return anchor;
    }

    anchor.componentName = matchedComponent.componentName;
    // Propagate componentKey from matched component (Phase 8D)
    anchor.componentKey = matchedComponent.componentKey;
    anchor.componentLoc = matchedComponent.loc;

    // Extract literals
    const texts = extractTexts(matchedComponent);
    const fills = extractFills(matchedComponent);

    const extracted: AnchorExtracted = {};
    if (texts.length > 0) {
      extracted.text = texts;
    }
    if (fills.length > 0) {
      extracted.fills = fills;
    }
    // Include full semantics (Phase 6B)
    extracted.semantics = matchedComponent.semantics;
    anchor.extracted = extracted;

    return anchor;
  });

  return {
    filePath,
    anchors,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { extractMarkers };

// =============================================================================
// ADAPTER INTEGRATION (Phase 10A)
// =============================================================================

/**
 * Result of running adapters on a component.
 */
export interface ComponentAdapterResult {
  /** Component name */
  componentName: string;
  /** Whether any adapter matched JSX elements in this component */
  hasAdapterMatch: boolean;
  /** Merged semantics (generic JSX + adapters) */
  mergedSemantics: ComponentSemanticIntent;
  /** Adapter contributions for logging/CLI */
  contributions: AdapterContribution[];
  /**
   * Canonical semantics normalized from merged semantics (Phase 10E).
   * This is the design-system-agnostic representation.
   */
  canonicalSemantics?: CanonicalSemantics;
  /**
   * Notes from canonical normalization (Phase 10E).
   * Contains info about unmapped values, ambiguous mappings, etc.
   */
  canonicalNotes?: NormalizationNote[];
}

/**
 * Result of running adapters on an entire file.
 */
export interface FileAdapterResult {
  /** File path */
  filePath: string;
  /** Results for each component */
  components: ComponentAdapterResult[];
  /** Total adapter contributions */
  totalContributions: number;
  /**
   * Summary of canonical normalization across the file (Phase 10E).
   */
  canonicalSummary?: {
    /** Total canonical fields set across all components */
    totalCanonicalFields: number;
    /** Total raw (unmapped) fields across all components */
    totalRawFields: number;
    /** Total normalization notes */
    totalNotes: number;
  };
}

/**
 * Run semantic adapters on a parsed AST report.
 *
 * This is a SEPARATE function from parseIntentFromReactAst to keep
 * adapter logic cleanly isolated. Call this after parsing if you want
 * adapter-augmented semantics.
 *
 * @param code - Source code (for re-traversal)
 * @param filePath - File path
 * @param astReport - Pre-parsed AST report (optional, will parse if not provided)
 * @returns FileAdapterResult with merged semantics
 */
export function runAdaptersOnFile(
  code: string,
  filePath: string,
  astReport?: AstIntentReport
): FileAdapterResult {
  // Initialize adapters if not already done
  initializeDefaultAdapters();

  // Parse if not provided
  const report = astReport ?? parseIntentFromReactAst(code, filePath);

  // Re-parse to get the AST for adapter traversal
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  // Collect component bounds (same as in parseIntentFromReactAst)
  const componentBounds = collectComponents(ast);

  const results: ComponentAdapterResult[] = [];

  // Track canonical summary across file
  let totalCanonicalFields = 0;
  let totalRawFields = 0;
  let totalNotes = 0;

  for (let i = 0; i < report.components.length; i++) {
    const component = report.components[i];
    const bounds = componentBounds[i];

    if (!bounds) {
      results.push({
        componentName: component.componentName,
        hasAdapterMatch: false,
        mergedSemantics: component.semantics,
        contributions: [],
      });
      continue;
    }

    // Run adapters on all JSX elements within this component
    const adapterResult = runAdaptersOnComponent(bounds.node, filePath, component.componentName);

    // Merge adapter semantics with generic JSX semantics
    const mergedSemantics = mergeWithAdapterSemantics(component.semantics, adapterResult);

    // === Phase 10E: Canonical Normalization ===
    // Build AdapterResult array for normalizer from the extraction result
    // We use the combined adapter semantics plus each contribution's metadata
    const adapterResults: AdapterResult[] = adapterResult.contributions.map((contrib) => ({
      semantics: adapterResult.semantics,
      provenance: contrib.provenance,
      frameworkMetadata: contrib.frameworkMetadata,
    }));

    // Normalize to canonical semantics
    const normalizationResult = normalizeToCanonical(mergedSemantics, {
      adapters: adapterResults,
    });

    // Update file-level canonical summary
    if (normalizationResult.canonical.meta) {
      totalCanonicalFields += normalizationResult.canonical.meta.canonicalFieldCount;
      totalRawFields += normalizationResult.canonical.meta.rawFieldCount;
    }
    totalNotes += normalizationResult.notes.length;

    results.push({
      componentName: component.componentName,
      hasAdapterMatch: adapterResult.hasAdapterMatch,
      mergedSemantics,
      contributions: adapterResult.contributions,
      canonicalSemantics: normalizationResult.canonical,
      canonicalNotes: normalizationResult.notes,
    });
  }

  return {
    filePath,
    components: results,
    totalContributions: results.reduce((sum, r) => sum + r.contributions.length, 0),
    canonicalSummary: {
      totalCanonicalFields,
      totalRawFields,
      totalNotes,
    },
  };
}

/**
 * Run adapters on all JSX elements within a single component.
 */
function runAdaptersOnComponent(
  componentNode: t.Node,
  filePath: string,
  componentName: string
): AdapterExtractionResult {
  const allContributions: AdapterContribution[] = [];
  let combinedSemantics: Partial<ComponentSemanticIntent> = {};

  const ctx: AdapterContext = {
    filePath,
    componentName,
  };

  // Traverse the component looking for JSX elements
  traverse(
    { type: 'File', program: { type: 'Program', body: [componentNode as t.Statement], directives: [], sourceType: 'module' } } as t.File,
    {
      JSXElement(path) {
        const node = path.node;

        // Run all registered adapters on this element
        const result = runAdapters(node, ctx);

        if (result.hasAdapterMatch) {
          allContributions.push(...result.contributions);

          // Merge semantics from this element
          combinedSemantics = mergePartialSemantics(combinedSemantics, result.semantics);
        }
      },
    }
  );

  return {
    semantics: combinedSemantics,
    contributions: allContributions,
    hasAdapterMatch: allContributions.length > 0,
  };
}

/**
 * Merge two partial semantic intents.
 */
function mergePartialSemantics(
  base: Partial<ComponentSemanticIntent>,
  overlay: Partial<ComponentSemanticIntent>
): Partial<ComponentSemanticIntent> {
  return {
    text: overlay.text ? { ...base.text, ...overlay.text } : base.text,
    booleans: overlay.booleans ? { ...base.booleans, ...overlay.booleans } : base.booleans,
    layout: overlay.layout ? { ...base.layout, ...overlay.layout } : base.layout,
    flex: overlay.flex ? { ...base.flex, ...overlay.flex } : base.flex,
    visual: overlay.visual ? { ...base.visual, ...overlay.visual } : base.visual,
  };
}
