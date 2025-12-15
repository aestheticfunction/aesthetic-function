/**
 * @aesthetic-function/watcher - materialize/materializeAstPatch.ts
 *
 * AST-based patch generation for design → code materialization.
 *
 * WHY: Phase 7A introduces safe AST writes. This module generates review
 * artifacts that show what changes would be made, allowing developers to
 * review before applying. Only operates when WriteSafetyLevel is auto-writable.
 *
 * SCOPE:
 * - Only supports SET_TEXT and SET_FILL operations
 * - Only operates on auto-writable values (literals)
 * - Never modifies className, variables, function calls, spreads, or external styles
 * - Generates artifacts in design-materializations/ directory
 *
 * CONSTRAINTS:
 * - Does not change protocol/server/plugin
 * - Keeps existing marker/patch materializers intact
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';
import * as t from '@babel/types';

import type { DesignOverrides } from '../reconcile/types.js';
import type { AstWriteOp, AstPatchArtifact, AstWriteResult } from './types.js';
import type { SourceLocation } from '../ast/types.js';
import { anchorMarkersToAst } from '../ast/parseIntentFromReactAst.js';
import { isAstWriteOpAllowed } from './config.js';

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
// CONSTANTS
// =============================================================================

/** Directory for AST patch artifacts */
export const AST_MATERIALIZATIONS_DIR = 'design-materializations';

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
 * Get the artifact file path for a source file.
 */
export function getAstPatchArtifactPath(relativePath: string, repoRoot: string): string {
  // Convert path to safe filename
  const safeName = relativePath.replace(/[/\\]/g, '__').replace(/\.[^.]+$/, '');
  return join(repoRoot, AST_MATERIALIZATIONS_DIR, `${safeName}.ast-patch.json`);
}

// =============================================================================
// COMPONENT FINDER
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

// =============================================================================
// VALUE FINDERS
// =============================================================================

interface TextValueInfo {
  value: string;
  loc: SourceLocation;
  writable: boolean;
  reason: 'literal' | 'variable-reference' | 'function-call' | 'complex-expression';
  node: t.Node;
}

interface FillValueInfo {
  value: string;
  loc: SourceLocation;
  writable: boolean;
  reason: 'literal' | 'variable-reference' | 'function-call' | 'external-style' | 'spread' | 'complex-expression';
  node: t.Node;
}

/**
 * Find text values in a component (JSX text children).
 */
function findTextValues(componentNode: t.Node): TextValueInfo[] {
  const values: TextValueInfo[] = [];

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
      JSXText(path) {
        const trimmed = path.node.value.trim();
        if (trimmed) {
          values.push({
            value: trimmed,
            loc: toSourceLocation(path.node.loc),
            writable: true,
            reason: 'literal',
            node: path.node,
          });
        }
      },
      JSXExpressionContainer(path) {
        const parent = path.parent;
        // Only consider text children, not attribute values
        if (!t.isJSXElement(parent) && !t.isJSXFragment(parent)) {
          return;
        }

        const expr = path.node.expression;

        if (t.isStringLiteral(expr)) {
          values.push({
            value: expr.value,
            loc: toSourceLocation(expr.loc),
            writable: true,
            reason: 'literal',
            node: expr,
          });
        } else if (t.isIdentifier(expr)) {
          values.push({
            value: `{${expr.name}}`,
            loc: toSourceLocation(expr.loc),
            writable: false,
            reason: 'variable-reference',
            node: expr,
          });
        } else if (t.isCallExpression(expr)) {
          values.push({
            value: '{fn()}',
            loc: toSourceLocation(expr.loc),
            writable: false,
            reason: 'function-call',
            node: expr,
          });
        } else if (t.isTemplateLiteral(expr)) {
          if (expr.expressions.length === 0) {
            // Static template literal
            const staticValue = expr.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
            values.push({
              value: staticValue,
              loc: toSourceLocation(expr.loc),
              writable: true,
              reason: 'literal',
              node: expr,
            });
          } else {
            values.push({
              value: '{`...${...}`}',
              loc: toSourceLocation(expr.loc),
              writable: false,
              reason: 'complex-expression',
              node: expr,
            });
          }
        }
      },
    }
  );

  return values;
}

/**
 * Find backgroundColor values in a component's inline styles.
 */
function findFillValues(componentNode: t.Node): FillValueInfo[] {
  const values: FillValueInfo[] = [];

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
            values.push({
              value: `{${expr.name}}`,
              loc: toSourceLocation(attr.loc),
              writable: false,
              reason: 'external-style',
              node: expr,
            });
            continue;
          }

          // style={{ ... }}
          if (!t.isObjectExpression(expr)) continue;

          for (const prop of expr.properties) {
            // Spread element
            if (t.isSpreadElement(prop)) {
              values.push({
                value: '{...spread}',
                loc: toSourceLocation(prop.loc),
                writable: false,
                reason: 'spread',
                node: prop,
              });
              continue;
            }

            if (!t.isObjectProperty(prop)) continue;

            const key = t.isIdentifier(prop.key)
              ? prop.key.name
              : t.isStringLiteral(prop.key)
                ? prop.key.value
                : null;

            if (key !== 'backgroundColor') continue;

            if (t.isStringLiteral(prop.value)) {
              values.push({
                value: prop.value.value,
                loc: toSourceLocation(prop.value.loc),
                writable: true,
                reason: 'literal',
                node: prop.value,
              });
            } else if (t.isIdentifier(prop.value)) {
              values.push({
                value: `{${prop.value.name}}`,
                loc: toSourceLocation(prop.value.loc),
                writable: false,
                reason: 'variable-reference',
                node: prop.value,
              });
            } else if (t.isCallExpression(prop.value)) {
              values.push({
                value: '{fn()}',
                loc: toSourceLocation(prop.value.loc),
                writable: false,
                reason: 'function-call',
                node: prop.value,
              });
            } else {
              values.push({
                value: '{...}',
                loc: toSourceLocation(prop.value.loc),
                writable: false,
                reason: 'complex-expression',
                node: prop.value,
              });
            }
          }
        }
      },
    }
  );

  return values;
}

// =============================================================================
// OPERATION COMPUTATION
// =============================================================================

/**
 * Compute AST write operations for a file.
 *
 * This analyzes the file and design overrides to determine what changes
 * could be made, classifying each as writable or not.
 *
 * @param code - Source code
 * @param filePath - Relative file path
 * @param overrides - Design overrides to apply
 * @returns Array of write operations
 */
export function computeAstWriteOps(
  code: string,
  filePath: string,
  overrides: DesignOverrides
): AstWriteOp[] {
  const operations: AstWriteOp[] = [];

  // Parse AST
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  // Get anchored report
  const anchoredReport = anchorMarkersToAst(code, filePath);

  // Process each anchor
  for (const anchor of anchoredReport.anchors) {
    const override = overrides[anchor.nodeName];
    if (!override) continue;

    if (!anchor.componentLoc) {
      // No component found for this anchor
      continue;
    }

    // Find the component in the AST
    const componentInfo = findComponentByLocation(
      ast,
      anchor.componentLoc.startLine,
      anchor.componentLoc.endLine
    );

    if (!componentInfo) continue;

    // Process SET_TEXT operations
    if (override.text !== undefined && isAstWriteOpAllowed('SET_TEXT')) {
      const textValues = findTextValues(componentInfo.node);

      for (const textValue of textValues) {
        // Only create operation if value differs from override
        if (textValue.value !== override.text) {
          operations.push({
            op: 'SET_TEXT',
            nodeName: anchor.nodeName,
            before: textValue.value,
            after: override.text,
            loc: textValue.loc,
            writable: textValue.writable,
            reason: textValue.reason,
            explanation: textValue.writable
              ? `Text literal "${textValue.value}" → "${override.text}"`
              : `Cannot modify: ${textValue.reason}`,
          });
        }
      }
    }

    // Process SET_FILL operations
    if (override.fill !== undefined && isAstWriteOpAllowed('SET_FILL')) {
      const fillValues = findFillValues(componentInfo.node);

      for (const fillValue of fillValues) {
        // Only create operation if value differs from override
        if (fillValue.value !== override.fill) {
          operations.push({
            op: 'SET_FILL',
            nodeName: anchor.nodeName,
            before: fillValue.value,
            after: override.fill,
            loc: fillValue.loc,
            writable: fillValue.writable,
            reason: fillValue.reason,
            explanation: fillValue.writable
              ? `Fill literal "${fillValue.value}" → "${override.fill}"`
              : `Cannot modify: ${fillValue.reason}`,
          });
        }
      }
    }
  }

  return operations;
}

// =============================================================================
// PATCH ARTIFACT GENERATION
// =============================================================================

/**
 * Generate an AST patch artifact for review.
 *
 * This writes a JSON file containing all proposed changes with their
 * writability classifications. Developers can review this before
 * applying changes.
 *
 * @param options - Patch generation options
 * @returns AST write result
 */
export interface AstPatchOptions {
  /** Relative path to the source file */
  relativePath: string;
  /** Repository root path */
  repoRoot: string;
  /** Source code content */
  content: string;
  /** Design overrides to apply */
  overrides: DesignOverrides;
  /** Whether to skip actual file write */
  dryRun?: boolean;
}

export async function materializeAstPatch(
  options: AstPatchOptions
): Promise<AstWriteResult> {
  const { relativePath, repoRoot, content, overrides, dryRun = true } = options;

  // Compute operations
  const operations = computeAstWriteOps(content, relativePath, overrides);

  // Count writable vs not
  const writableOps = operations.filter((op) => op.writable);
  const notWritableOps = operations.filter((op) => !op.writable);

  // Build artifact
  const artifact: AstPatchArtifact = {
    file: relativePath,
    generatedAt: new Date().toISOString(),
    operations,
    summary: {
      total: operations.length,
      writable: writableOps.length,
      notWritable: notWritableOps.length,
    },
  };

  // Write artifact (unless dry run)
  let artifactPath: string | undefined;
  if (!dryRun && operations.length > 0) {
    artifactPath = getAstPatchArtifactPath(relativePath, repoRoot);
    const dir = dirname(artifactPath);
    await mkdir(dir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf-8');
  }

  return {
    mode: 'patch',
    dryRun,
    applied: 0, // Patch mode doesn't apply changes
    skipped: notWritableOps.length,
    artifactPath,
    operations,
  };
}
