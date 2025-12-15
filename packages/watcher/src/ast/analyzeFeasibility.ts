/**
 * @aesthetic-function/watcher - ast/analyzeFeasibility.ts
 *
 * Write feasibility analysis for React JSX components.
 *
 * WHY: Phase 6C introduces read-only analysis to classify which extracted
 * semantic values can be safely auto-written back to source code. This
 * prepares for future code modification features without implementing
 * any actual writes.
 *
 * SCOPE:
 * - Read-only analysis only
 * - Does NOT modify any source files
 * - Does NOT change watcher sync behavior
 *
 * CLASSIFICATION:
 * - auto-writable: Direct literals that can be safely replaced
 * - conditionally-writable: Simple expressions that might be replaceable
 * - not-writable: Variables, function calls, className, computed values
 */

import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';
import * as t from '@babel/types';

import type {
  WriteFeasibilityReport,
  WriteSafetyReport,
  ValueWriteSafety,
  SourceLocation,
  AnchoredAstReport,
  Anchor,
} from './types.js';
import { anchorMarkersToAst } from './parseIntentFromReactAst.js';

// Handle ESM/CJS interop for @babel/traverse
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert Babel location to our SourceLocation.
 */
function toSourceLocation(loc: t.SourceLocation | null | undefined): SourceLocation | undefined {
  if (!loc) {
    return undefined;
  }
  return {
    startLine: loc.start.line,
    endLine: loc.end.line,
    startColumn: loc.start.column,
    endColumn: loc.end.column,
  };
}

/**
 * Classify the write safety of an AST node.
 *
 * This is the core analysis function that determines whether a value
 * can be automatically written back to source code.
 */
function classifyNode(
  node: t.Node | null | undefined,
  propPath: string
): ValueWriteSafety {
  if (!node) {
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'computed',
      explanation: 'No AST node found',
    };
  }

  // String literals are auto-writable
  if (t.isStringLiteral(node)) {
    return {
      path: propPath,
      value: node.value,
      level: 'auto-writable',
      reason: 'literal',
      loc: toSourceLocation(node.loc),
      explanation: `String literal "${node.value}" can be directly replaced`,
    };
  }

  // Numeric literals are auto-writable
  if (t.isNumericLiteral(node)) {
    return {
      path: propPath,
      value: node.value,
      level: 'auto-writable',
      reason: 'literal',
      loc: toSourceLocation(node.loc),
      explanation: `Numeric literal ${node.value} can be directly replaced`,
    };
  }

  // Boolean literals are auto-writable
  if (t.isBooleanLiteral(node)) {
    return {
      path: propPath,
      value: node.value,
      level: 'auto-writable',
      reason: 'literal',
      loc: toSourceLocation(node.loc),
      explanation: `Boolean literal ${node.value} can be directly replaced`,
    };
  }

  // JSX Text is auto-writable
  if (t.isJSXText(node)) {
    const trimmed = node.value.trim();
    if (trimmed) {
      return {
        path: propPath,
        value: trimmed,
        level: 'auto-writable',
        reason: 'literal',
        loc: toSourceLocation(node.loc),
        explanation: `JSX text "${trimmed}" can be directly replaced`,
      };
    }
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'computed',
      explanation: 'Empty or whitespace-only JSX text',
    };
  }

  // JSX Expression Container - unwrap and analyze inner expression
  if (t.isJSXExpressionContainer(node)) {
    // Check the inner expression
    return classifyNode(node.expression, propPath);
  }

  // Identifiers (variable references) are not writable
  if (t.isIdentifier(node)) {
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'variable-reference',
      loc: toSourceLocation(node.loc),
      explanation: `Variable reference "${node.name}" - value determined at runtime`,
    };
  }

  // Member expressions (e.g., props.value, styles.color) are not writable
  if (t.isMemberExpression(node)) {
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'variable-reference',
      loc: toSourceLocation(node.loc),
      explanation: 'Member expression - value determined at runtime',
    };
  }

  // Function calls are not writable
  if (t.isCallExpression(node)) {
    let callName = 'unknown';
    if (t.isIdentifier(node.callee)) {
      callName = node.callee.name;
    } else if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      callName = node.callee.property.name;
    }
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'function-call',
      loc: toSourceLocation(node.loc),
      explanation: `Function call "${callName}()" - value determined at runtime`,
    };
  }

  // Template literals are conditionally writable if they have only static parts
  if (t.isTemplateLiteral(node)) {
    if (node.expressions.length === 0) {
      // No expressions, just static parts
      const value = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
      return {
        path: propPath,
        value,
        level: 'auto-writable',
        reason: 'literal',
        loc: toSourceLocation(node.loc),
        explanation: `Template literal with no expressions can be converted to string`,
      };
    }
    return {
      path: propPath,
      level: 'conditionally-writable',
      reason: 'simple-expression',
      loc: toSourceLocation(node.loc),
      explanation: 'Template literal with expressions - may be replaceable if expressions are constant',
    };
  }

  // Ternary/conditional expressions are conditionally writable
  if (t.isConditionalExpression(node)) {
    const consequentSafe = classifyNode(node.consequent, propPath);
    const alternateSafe = classifyNode(node.alternate, propPath);

    if (
      consequentSafe.level === 'auto-writable' &&
      alternateSafe.level === 'auto-writable'
    ) {
      return {
        path: propPath,
        level: 'conditionally-writable',
        reason: 'simple-expression',
        loc: toSourceLocation(node.loc),
        explanation: 'Ternary with literal branches - condition must be evaluated',
      };
    }

    return {
      path: propPath,
      level: 'not-writable',
      reason: 'complex-expression',
      loc: toSourceLocation(node.loc),
      explanation: 'Ternary with non-literal branches - cannot safely modify',
    };
  }

  // Logical expressions (&&, ||) - check if they're used for conditional rendering
  if (t.isLogicalExpression(node)) {
    return {
      path: propPath,
      level: 'conditionally-writable',
      reason: 'simple-expression',
      loc: toSourceLocation(node.loc),
      explanation: 'Logical expression - may be replaceable depending on condition',
    };
  }

  // Binary expressions (arithmetic, etc.) are generally not writable
  if (t.isBinaryExpression(node)) {
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'computed',
      loc: toSourceLocation(node.loc),
      explanation: 'Binary expression - computed value cannot be replaced',
    };
  }

  // Unary expressions (!, -, +, etc.)
  if (t.isUnaryExpression(node)) {
    // Negative numbers like -5 are technically unary expressions
    if (node.operator === '-' && t.isNumericLiteral(node.argument)) {
      return {
        path: propPath,
        value: -node.argument.value,
        level: 'auto-writable',
        reason: 'literal',
        loc: toSourceLocation(node.loc),
        explanation: `Negative number ${-node.argument.value} can be directly replaced`,
      };
    }
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'computed',
      loc: toSourceLocation(node.loc),
      explanation: 'Unary expression - computed value cannot be replaced',
    };
  }

  // Object expressions need property-by-property analysis (for style objects)
  if (t.isObjectExpression(node)) {
    // This shouldn't typically be a leaf value, but handle gracefully
    return {
      path: propPath,
      level: 'conditionally-writable',
      reason: 'simple-expression',
      loc: toSourceLocation(node.loc),
      explanation: 'Object expression - individual properties may be writable',
    };
  }

  // Array expressions
  if (t.isArrayExpression(node)) {
    return {
      path: propPath,
      level: 'not-writable',
      reason: 'complex-expression',
      loc: toSourceLocation(node.loc),
      explanation: 'Array expression - cannot safely modify',
    };
  }

  // Default: unknown expression type
  return {
    path: propPath,
    level: 'not-writable',
    reason: 'complex-expression',
    loc: toSourceLocation(node.loc),
    explanation: `Unknown expression type "${node.type}" - cannot analyze`,
  };
}

// =============================================================================
// PROP CATEGORIES FOR ANALYSIS
// =============================================================================

/** Text-related prop names */
const TEXT_PROPS = ['placeholder', 'title', 'aria-label', 'alt'] as const;

/** Boolean prop names */
const BOOLEAN_PROPS = ['disabled', 'checked', 'selected'] as const;

/** Style props that affect layout */
const LAYOUT_STYLE_PROPS = ['width', 'height', 'padding', 'margin', 'gap'] as const;

/** Style props that affect flex layout */
const FLEX_STYLE_PROPS = ['display', 'flexDirection', 'justifyContent', 'alignItems'] as const;

/** Visual style props */
const VISUAL_STYLE_PROPS = ['backgroundColor', 'color', 'borderColor'] as const;

// =============================================================================
// COMPONENT ANALYSIS
// =============================================================================

interface ComponentInfo {
  name: string;
  startLine: number;
  endLine: number;
  node: t.Node;
}

/**
 * Find component by location in the AST.
 */
function findComponentByLocation(
  ast: t.File,
  startLine: number,
  endLine: number
): ComponentInfo | undefined {
  let found: ComponentInfo | undefined;

  traverse(ast, {
    FunctionDeclaration(path) {
      const loc = path.node.loc;
      if (loc && loc.start.line === startLine && loc.end.line === endLine) {
        found = {
          name: path.node.id?.name ?? 'anonymous',
          startLine: loc.start.line,
          endLine: loc.end.line,
          node: path.node,
        };
        path.stop();
      }
    },
    VariableDeclaration(path) {
      const loc = path.node.loc;
      if (loc && loc.start.line === startLine && loc.end.line === endLine) {
        const decl = path.node.declarations[0];
        if (t.isIdentifier(decl?.id)) {
          found = {
            name: decl.id.name,
            startLine: loc.start.line,
            endLine: loc.end.line,
            node: path.node,
          };
          path.stop();
        }
      }
    },
  });

  return found;
}

/**
 * Analyze write feasibility for a single component.
 */
function analyzeComponentFeasibility(
  componentNode: t.Node,
  anchor: Anchor
): WriteSafetyReport {
  const safetyValues: ValueWriteSafety[] = [];

  // Traverse the component to find all relevant values
  traverse(
    {
      type: 'File',
      program: {
        type: 'Program',
        body: [componentNode as t.Statement],
        directives: [],
        sourceType: 'module',
      },
    } as t.File,
    {
      // Analyze JSX text children
      JSXText(path) {
        const trimmed = path.node.value.trim();
        if (trimmed) {
          safetyValues.push(classifyNode(path.node, 'text.content'));
        }
      },

      // Analyze JSX expression containers (text interpolation)
      JSXExpressionContainer(path) {
        // Skip if this is a child expression (text interpolation)
        const parent = path.parent;
        if (t.isJSXElement(parent) || t.isJSXFragment(parent)) {
          // This is a text child like {variable} or {fn()}
          safetyValues.push(classifyNode(path.node.expression, 'text.content'));
        }
      },

      // Analyze JSX attributes
      JSXAttribute(path) {
        const name = t.isJSXIdentifier(path.node.name) ? path.node.name.name : '';
        const value = path.node.value;

        // Skip style prop (handled separately)
        if (name === 'style') return;

        // Skip className (never auto-writable)
        if (name === 'className' || name === 'class') {
          safetyValues.push({
            path: `props.${name}`,
            level: 'not-writable',
            reason: 'className',
            loc: toSourceLocation(path.node.loc),
            explanation: 'className requires CSS modification, not supported',
          });
          return;
        }

        // Analyze text props
        if (TEXT_PROPS.includes(name as (typeof TEXT_PROPS)[number])) {
          safetyValues.push(classifyNode(value, `text.${name}`));
          return;
        }

        // Analyze boolean props
        if (BOOLEAN_PROPS.includes(name as (typeof BOOLEAN_PROPS)[number])) {
          // Boolean attribute without value (e.g., <button disabled>) is true
          if (value === null) {
            safetyValues.push({
              path: `booleans.${name}`,
              value: true,
              level: 'auto-writable',
              reason: 'literal',
              loc: toSourceLocation(path.node.loc),
              explanation: `Boolean attribute "${name}" (implicit true) can be modified`,
            });
          } else {
            safetyValues.push(classifyNode(value, `booleans.${name}`));
          }
          return;
        }

        // Analyze layout props (width, height as element props)
        if (name === 'width' || name === 'height') {
          safetyValues.push(classifyNode(value, `layout.${name}`));
          return;
        }
      },

      // Analyze style prop
      JSXOpeningElement(path) {
        for (const attr of path.node.attributes) {
          if (!t.isJSXAttribute(attr)) continue;
          if (!t.isJSXIdentifier(attr.name)) continue;
          if (attr.name.name !== 'style') continue;

          // style={...}
          if (!t.isJSXExpressionContainer(attr.value)) continue;
          const expr = attr.value.expression;

          // style={styleVariable} - not writable
          if (t.isIdentifier(expr)) {
            safetyValues.push({
              path: 'style',
              level: 'not-writable',
              reason: 'external-style',
              loc: toSourceLocation(attr.loc),
              explanation: `Style from variable "${expr.name}" - cannot modify inline`,
            });
            continue;
          }

          // style={...spread} or style={{...spread}} - check for spreads
          if (t.isObjectExpression(expr)) {
            for (const prop of expr.properties) {
              // Spread element
              if (t.isSpreadElement(prop)) {
                safetyValues.push({
                  path: 'style.spread',
                  level: 'not-writable',
                  reason: 'spread',
                  loc: toSourceLocation(prop.loc),
                  explanation: 'Spread in style object may override values',
                });
                continue;
              }

              if (!t.isObjectProperty(prop)) continue;

              const key = t.isIdentifier(prop.key)
                ? prop.key.name
                : t.isStringLiteral(prop.key)
                  ? prop.key.value
                  : null;

              if (!key) continue;

              // Check layout style props
              if (LAYOUT_STYLE_PROPS.includes(key as (typeof LAYOUT_STYLE_PROPS)[number])) {
                safetyValues.push(classifyNode(prop.value, `layout.${key}`));
              }

              // Check flex style props
              if (FLEX_STYLE_PROPS.includes(key as (typeof FLEX_STYLE_PROPS)[number])) {
                safetyValues.push(classifyNode(prop.value, `flex.${key}`));
              }

              // Check visual style props
              if (VISUAL_STYLE_PROPS.includes(key as (typeof VISUAL_STYLE_PROPS)[number])) {
                safetyValues.push(classifyNode(prop.value, `visual.${key}`));
              }
            }
          }
        }
      },
    }
  );

  // Categorize results
  const autoWritable = safetyValues.filter((v) => v.level === 'auto-writable');
  const conditionallyWritable = safetyValues.filter((v) => v.level === 'conditionally-writable');
  const notWritable = safetyValues.filter((v) => v.level === 'not-writable');

  return {
    nodeName: anchor.nodeName,
    componentName: anchor.componentName,
    componentLoc: anchor.componentLoc,
    autoWritable,
    conditionallyWritable,
    notWritable,
    summary: {
      totalValues: safetyValues.length,
      autoWritableCount: autoWritable.length,
      conditionallyWritableCount: conditionallyWritable.length,
      notWritableCount: notWritable.length,
    },
  };
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze write feasibility for all anchored components in a file.
 *
 * This is a READ-ONLY analysis that classifies which values could
 * potentially be auto-written back to source code.
 *
 * @param code - Source code to analyze
 * @param filePath - Path to the file (for reporting)
 * @returns WriteFeasibilityReport with safety classifications
 */
export function analyzeWriteFeasibility(
  code: string,
  filePath: string
): WriteFeasibilityReport {
  // Parse AST
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  // Get anchored report
  const anchoredReport: AnchoredAstReport = anchorMarkersToAst(code, filePath);

  // Analyze each anchored component
  const reports: WriteSafetyReport[] = [];

  for (const anchor of anchoredReport.anchors) {
    if (!anchor.componentLoc) {
      // No component found for this anchor
      reports.push({
        nodeName: anchor.nodeName,
        autoWritable: [],
        conditionallyWritable: [],
        notWritable: [],
        summary: {
          totalValues: 0,
          autoWritableCount: 0,
          conditionallyWritableCount: 0,
          notWritableCount: 0,
        },
      });
      continue;
    }

    // Find the component in the AST
    const componentInfo = findComponentByLocation(
      ast,
      anchor.componentLoc.startLine,
      anchor.componentLoc.endLine
    );

    if (!componentInfo) {
      reports.push({
        nodeName: anchor.nodeName,
        componentName: anchor.componentName,
        componentLoc: anchor.componentLoc,
        autoWritable: [],
        conditionallyWritable: [],
        notWritable: [],
        summary: {
          totalValues: 0,
          autoWritableCount: 0,
          conditionallyWritableCount: 0,
          notWritableCount: 0,
        },
      });
      continue;
    }

    // Analyze the component
    const safetyReport = analyzeComponentFeasibility(componentInfo.node, anchor);
    reports.push(safetyReport);
  }

  // Compute file-level summary
  const totalValues = reports.reduce((sum, r) => sum + r.summary.totalValues, 0);
  const autoWritableCount = reports.reduce((sum, r) => sum + r.summary.autoWritableCount, 0);
  const conditionallyWritableCount = reports.reduce(
    (sum, r) => sum + r.summary.conditionallyWritableCount,
    0
  );
  const notWritableCount = reports.reduce((sum, r) => sum + r.summary.notWritableCount, 0);

  return {
    filePath,
    reports,
    summary: {
      totalNodes: reports.length,
      totalValues,
      autoWritableCount,
      conditionallyWritableCount,
      notWritableCount,
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { classifyNode };
