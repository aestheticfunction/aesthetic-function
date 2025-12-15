/**
 * @aesthetic-function/watcher - materialize/materializeAstWrite.ts
 *
 * AST-based code writing for design → code materialization.
 *
 * WHY: Phase 7A introduces safe AST writes. This module actually applies
 * changes to source code when WriteSafetyLevel is auto-writable.
 * Uses Babel parse + regenerate for atomic, safe writes.
 *
 * SCOPE:
 * - Only supports SET_TEXT and SET_FILL operations
 * - Only writes when value is auto-writable (literal)
 * - Never modifies className, variables, function calls, spreads, or external styles
 * - Atomic writes with audit log entries
 *
 * CONSTRAINTS:
 * - Does not change protocol/server/plugin
 * - Keeps existing marker/patch materializers intact
 * - Only writes when AST_WRITE_MODE=write and dryRun=false
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';
import * as t from '@babel/types';
import * as babelGenerator from '@babel/generator';

import type { DesignOverrides } from '../reconcile/types.js';
import type { AstWriteOp, AstWriteResult, LayoutKey } from './types.js';
import type { SourceLocation } from '../ast/types.js';
import { anchorMarkersToAst } from '../ast/parseIntentFromReactAst.js';
import { isAstWriteOpAllowed, getAstWriteDryRun } from './config.js';
import { LAYOUT_KEYS } from './materializeAstPatch.js';

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

// Handle ESM/CJS interop for @babel/generator
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGenerateFunction(): (ast: t.Node, opts?: object) => { code: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = babelGenerator as any;
  if (typeof mod === 'function') {
    return mod;
  }
  if (typeof mod.default === 'function') {
    return mod.default;
  }
  if (mod.default && typeof mod.default.default === 'function') {
    return mod.default.default;
  }
  throw new Error('Could not resolve @babel/generator function');
}

const generate = getGenerateFunction();

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory for audit logs */
export const AST_AUDIT_DIR = 'design-materializations';

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
 * Log an audit entry for an AST write operation.
 */
async function logAuditEntry(
  repoRoot: string,
  filePath: string,
  operations: AstWriteOp[]
): Promise<void> {
  const auditPath = join(repoRoot, AST_AUDIT_DIR, 'ast-write-audit.log');
  const dir = dirname(auditPath);
  await mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `\n## [${timestamp}] AST Write - ${filePath}`,
    `Operations applied: ${operations.length}`,
  ];

  for (const op of operations) {
    lines.push(`- ${op.op} ${op.nodeName}: "${op.before}" → "${op.after}" (L${op.loc.startLine})`);
  }

  lines.push('');

  try {
    await appendToFile(auditPath, lines.join('\n'));
  } catch {
    // Audit logging should not block writes
    console.warn('[AST Write] Failed to write audit log');
  }
}

/**
 * Append content to a file (create if doesn't exist).
 */
async function appendToFile(filePath: string, content: string): Promise<void> {
  const { appendFile: fsAppend } = await import('node:fs/promises');
  try {
    await fsAppend(filePath, content, 'utf-8');
  } catch {
    // If file doesn't exist, create it
    await writeFile(filePath, content, 'utf-8');
  }
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
// AST MODIFICATION
// =============================================================================

/**
 * Apply text changes to the AST.
 * Only modifies JSX text literals and string literals in expressions.
 */
function applyTextChange(
  ast: t.File,
  componentStartLine: number,
  componentEndLine: number,
  targetLoc: SourceLocation,
  newValue: string
): boolean {
  let modified = false;

  traverse(ast, {
    JSXText(path) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if within component bounds and matches target location
      if (
        loc.start.line >= componentStartLine &&
        loc.end.line <= componentEndLine &&
        loc.start.line === targetLoc.startLine &&
        loc.start.column === targetLoc.startColumn
      ) {
        // Preserve leading/trailing whitespace
        const original = path.node.value;
        const leadingWs = original.match(/^(\s*)/)?.[1] ?? '';
        const trailingWs = original.match(/(\s*)$/)?.[1] ?? '';
        path.node.value = leadingWs + newValue + trailingWs;
        modified = true;
        path.stop();
      }
    },
    StringLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if parent is JSXExpressionContainer in a JSX element
      const parent = path.parent;
      if (!t.isJSXExpressionContainer(parent)) return;

      const grandparent = path.parentPath?.parent;
      if (!t.isJSXElement(grandparent) && !t.isJSXFragment(grandparent)) return;

      // Check if within component bounds and matches target location
      if (
        loc.start.line >= componentStartLine &&
        loc.end.line <= componentEndLine &&
        loc.start.line === targetLoc.startLine &&
        loc.start.column === targetLoc.startColumn
      ) {
        path.node.value = newValue;
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

/**
 * Apply fill (backgroundColor) changes to the AST.
 * Only modifies string literals in inline style objects.
 */
function applyFillChange(
  ast: t.File,
  componentStartLine: number,
  componentEndLine: number,
  targetLoc: SourceLocation,
  newValue: string
): boolean {
  let modified = false;

  traverse(ast, {
    StringLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if within component bounds and matches target location
      if (
        loc.start.line >= componentStartLine &&
        loc.end.line <= componentEndLine &&
        loc.start.line === targetLoc.startLine &&
        loc.start.column === targetLoc.startColumn
      ) {
        // Verify this is a backgroundColor property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== 'backgroundColor') return;

        path.node.value = newValue;
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

/**
 * Apply layout property changes to the AST.
 * Modifies numeric or string literals for layout properties in inline style objects.
 * WHY: Layout properties (gap, padding, margin, width, height) map to Figma AutoLayout.
 */
function applyLayoutChange(
  ast: t.File,
  componentStartLine: number,
  componentEndLine: number,
  targetLoc: SourceLocation,
  layoutKey: LayoutKey,
  newValue: string
): boolean {
  let modified = false;

  // Determine if new value should be numeric or string
  const numericValue = parseFloat(newValue);
  const isNumeric = !isNaN(numericValue) && String(numericValue) === newValue;

  traverse(ast, {
    NumericLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if within component bounds and matches target location
      if (
        loc.start.line >= componentStartLine &&
        loc.end.line <= componentEndLine &&
        loc.start.line === targetLoc.startLine &&
        loc.start.column === targetLoc.startColumn
      ) {
        // Verify this is a layout property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== layoutKey) return;

        if (isNumeric) {
          // Replace with numeric value
          path.node.value = numericValue;
        } else {
          // Replace numeric with string literal
          path.replaceWith(t.stringLiteral(newValue));
        }
        modified = true;
        path.stop();
      }
    },
    StringLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if within component bounds and matches target location
      if (
        loc.start.line >= componentStartLine &&
        loc.end.line <= componentEndLine &&
        loc.start.line === targetLoc.startLine &&
        loc.start.column === targetLoc.startColumn
      ) {
        // Verify this is a layout property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== layoutKey) return;

        if (isNumeric) {
          // Replace string with numeric literal
          path.replaceWith(t.numericLiteral(numericValue));
        } else {
          // Replace with new string value
          path.node.value = newValue;
        }
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

// =============================================================================
// MAIN WRITE FUNCTION
// =============================================================================

/**
 * Options for AST write operations.
 */
export interface AstWriteOptions {
  /** Absolute path to the source file */
  absolutePath: string;
  /** Relative path for logging */
  relativePath: string;
  /** Source code content */
  content: string;
  /** Design overrides to apply */
  overrides: DesignOverrides;
  /** Repository root path */
  repoRoot: string;
  /** Whether to skip actual file write */
  dryRun?: boolean;
}

/**
 * Apply AST writes to source code.
 *
 * This function:
 * 1. Parses the source code with Babel
 * 2. Finds writable values that differ from overrides
 * 3. Modifies the AST in-place
 * 4. Regenerates the source code
 * 5. Writes atomically to the file
 * 6. Logs an audit entry
 *
 * @param options - Write options
 * @returns AST write result
 */
export async function materializeAstWrite(
  options: AstWriteOptions
): Promise<AstWriteResult> {
  const {
    absolutePath,
    relativePath,
    content,
    overrides,
    repoRoot,
    dryRun = getAstWriteDryRun(),
  } = options;

  const operations: AstWriteOp[] = [];
  const appliedOps: AstWriteOp[] = [];

  // Parse AST
  const ast = parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  // Get anchored report
  const anchoredReport = anchorMarkersToAst(content, relativePath);

  // Process each anchor
  for (const anchor of anchoredReport.anchors) {
    const override = overrides[anchor.nodeName];
    if (!override) continue;

    if (!anchor.componentLoc) continue;

    // Find the component in the AST
    const componentInfo = findComponentByLocation(
      ast,
      anchor.componentLoc.startLine,
      anchor.componentLoc.endLine
    );

    if (!componentInfo) continue;

    // Process SET_TEXT operations
    if (override.text !== undefined && isAstWriteOpAllowed('SET_TEXT')) {
      // Find text values and apply changes
      const textOps = findAndApplyTextChanges(
        ast,
        componentInfo,
        anchor.nodeName,
        override.text
      );
      operations.push(...textOps);
      appliedOps.push(...textOps.filter((op) => op.writable));
    }

    // Process SET_FILL operations
    if (override.fill !== undefined && isAstWriteOpAllowed('SET_FILL')) {
      // Find fill values and apply changes
      const fillOps = findAndApplyFillChanges(
        ast,
        componentInfo,
        anchor.nodeName,
        override.fill
      );
      operations.push(...fillOps);
      appliedOps.push(...fillOps.filter((op) => op.writable));
    }

    // Process SET_LAYOUT operations
    if (override.layout !== undefined && isAstWriteOpAllowed('SET_LAYOUT')) {
      // Find layout values and apply changes for each key
      const layoutOps = findAndApplyLayoutChanges(
        ast,
        componentInfo,
        anchor.nodeName,
        override.layout
      );
      operations.push(...layoutOps);
      appliedOps.push(...layoutOps.filter((op) => op.writable));
    }
  }

  // If no changes to apply or dry run, return without writing
  if (appliedOps.length === 0 || dryRun) {
    return {
      mode: 'write',
      dryRun,
      applied: appliedOps.length,
      skipped: operations.length - appliedOps.length,
      operations,
    };
  }

  // Regenerate code from modified AST
  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
  });

  // Atomic write: write to temp file then rename
  const tempPath = absolutePath + '.ast-write-tmp';
  await writeFile(tempPath, output.code, 'utf-8');

  // Rename for atomic operation
  const { rename } = await import('node:fs/promises');
  await rename(tempPath, absolutePath);

  // Log audit entry
  await logAuditEntry(repoRoot, relativePath, appliedOps);

  return {
    mode: 'write',
    dryRun: false,
    applied: appliedOps.length,
    skipped: operations.length - appliedOps.length,
    operations,
  };
}

/**
 * Find text values and apply changes, returning operation records.
 */
function findAndApplyTextChanges(
  ast: t.File,
  componentInfo: ComponentInfo,
  nodeName: string,
  targetValue: string
): AstWriteOp[] {
  const operations: AstWriteOp[] = [];

  traverse(
    {
      type: 'File',
      program: {
        type: 'Program',
        body: [componentInfo.node as t.Statement],
        directives: [],
        sourceType: 'module',
      },
    } as t.File,
    {
      JSXText(path) {
        const trimmed = path.node.value.trim();
        if (!trimmed) return;

        const loc = toSourceLocation(path.node.loc);
        
        // Check if different from target
        if (trimmed === targetValue) return;

        const op: AstWriteOp = {
          op: 'SET_TEXT',
          nodeName,
          before: trimmed,
          after: targetValue,
          loc,
          writable: true,
          reason: 'literal',
          explanation: `Text literal "${trimmed}" → "${targetValue}"`,
        };

        // Apply the change
        const applied = applyTextChange(
          ast,
          componentInfo.startLine,
          componentInfo.endLine,
          loc,
          targetValue
        );

        if (applied) {
          operations.push(op);
        }
      },
      JSXExpressionContainer(path) {
        const parent = path.parent;
        if (!t.isJSXElement(parent) && !t.isJSXFragment(parent)) return;

        const expr = path.node.expression;
        const loc = toSourceLocation(expr.loc);

        if (t.isStringLiteral(expr)) {
          if (expr.value === targetValue) return;

          const op: AstWriteOp = {
            op: 'SET_TEXT',
            nodeName,
            before: expr.value,
            after: targetValue,
            loc,
            writable: true,
            reason: 'literal',
            explanation: `String literal "${expr.value}" → "${targetValue}"`,
          };

          const applied = applyTextChange(
            ast,
            componentInfo.startLine,
            componentInfo.endLine,
            loc,
            targetValue
          );

          if (applied) {
            operations.push(op);
          }
        } else if (t.isIdentifier(expr)) {
          operations.push({
            op: 'SET_TEXT',
            nodeName,
            before: `{${expr.name}}`,
            after: targetValue,
            loc,
            writable: false,
            reason: 'variable-reference',
            explanation: `Cannot modify: variable-reference`,
          });
        } else if (t.isCallExpression(expr)) {
          operations.push({
            op: 'SET_TEXT',
            nodeName,
            before: '{fn()}',
            after: targetValue,
            loc,
            writable: false,
            reason: 'function-call',
            explanation: `Cannot modify: function-call`,
          });
        }
      },
    }
  );

  return operations;
}

/**
 * Find fill values and apply changes, returning operation records.
 */
function findAndApplyFillChanges(
  ast: t.File,
  componentInfo: ComponentInfo,
  nodeName: string,
  targetValue: string
): AstWriteOp[] {
  const operations: AstWriteOp[] = [];

  traverse(
    {
      type: 'File',
      program: {
        type: 'Program',
        body: [componentInfo.node as t.Statement],
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

          if (!t.isJSXExpressionContainer(attr.value)) continue;
          const expr = attr.value.expression;

          // External style variable
          if (t.isIdentifier(expr)) {
            operations.push({
              op: 'SET_FILL',
              nodeName,
              before: `{${expr.name}}`,
              after: targetValue,
              loc: toSourceLocation(attr.loc),
              writable: false,
              reason: 'external-style',
              explanation: `Cannot modify: external-style`,
            });
            continue;
          }

          if (!t.isObjectExpression(expr)) continue;

          for (const prop of expr.properties) {
            // Spread
            if (t.isSpreadElement(prop)) {
              operations.push({
                op: 'SET_FILL',
                nodeName,
                before: '{...spread}',
                after: targetValue,
                loc: toSourceLocation(prop.loc),
                writable: false,
                reason: 'spread',
                explanation: `Cannot modify: spread`,
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

            const loc = toSourceLocation(prop.value.loc);

            if (t.isStringLiteral(prop.value)) {
              if (prop.value.value === targetValue) continue;

              const op: AstWriteOp = {
                op: 'SET_FILL',
                nodeName,
                before: prop.value.value,
                after: targetValue,
                loc,
                writable: true,
                reason: 'literal',
                explanation: `Fill literal "${prop.value.value}" → "${targetValue}"`,
              };

              const applied = applyFillChange(
                ast,
                componentInfo.startLine,
                componentInfo.endLine,
                loc,
                targetValue
              );

              if (applied) {
                operations.push(op);
              }
            } else if (t.isIdentifier(prop.value)) {
              operations.push({
                op: 'SET_FILL',
                nodeName,
                before: `{${prop.value.name}}`,
                after: targetValue,
                loc,
                writable: false,
                reason: 'variable-reference',
                explanation: `Cannot modify: variable-reference`,
              });
            } else if (t.isCallExpression(prop.value)) {
              operations.push({
                op: 'SET_FILL',
                nodeName,
                before: '{fn()}',
                after: targetValue,
                loc,
                writable: false,
                reason: 'function-call',
                explanation: `Cannot modify: function-call`,
              });
            }
          }
        }
      },
    }
  );

  return operations;
}

/**
 * Find layout values and apply changes, returning operation records.
 * WHY: Layout properties (gap, padding, margin, width, height) map to Figma AutoLayout.
 */
function findAndApplyLayoutChanges(
  ast: t.File,
  componentInfo: ComponentInfo,
  nodeName: string,
  layoutOverride: { gap?: number | string; padding?: number | string; margin?: number | string; width?: number | string; height?: number | string }
): AstWriteOp[] {
  const operations: AstWriteOp[] = [];

  traverse(
    {
      type: 'File',
      program: {
        type: 'Program',
        body: [componentInfo.node as t.Statement],
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

          if (!t.isJSXExpressionContainer(attr.value)) continue;
          const expr = attr.value.expression;

          // External style variable - report for all layout keys that have overrides
          if (t.isIdentifier(expr)) {
            for (const layoutKey of LAYOUT_KEYS) {
              const overrideValue = layoutOverride[layoutKey];
              if (overrideValue === undefined) continue;

              operations.push({
                op: 'SET_LAYOUT',
                nodeName,
                before: `{${expr.name}}`,
                after: String(overrideValue),
                loc: toSourceLocation(attr.loc),
                writable: false,
                reason: 'external-style',
                explanation: `Cannot modify: external-style`,
                layoutKey,
              });
            }
            continue;
          }

          if (!t.isObjectExpression(expr)) continue;

          for (const prop of expr.properties) {
            // Spread element
            if (t.isSpreadElement(prop)) {
              for (const layoutKey of LAYOUT_KEYS) {
                const overrideValue = layoutOverride[layoutKey];
                if (overrideValue === undefined) continue;

                operations.push({
                  op: 'SET_LAYOUT',
                  nodeName,
                  before: '{...spread}',
                  after: String(overrideValue),
                  loc: toSourceLocation(prop.loc),
                  writable: false,
                  reason: 'spread',
                  explanation: `Cannot modify: spread`,
                  layoutKey,
                });
              }
              continue;
            }

            if (!t.isObjectProperty(prop)) continue;

            const key = t.isIdentifier(prop.key)
              ? prop.key.name
              : t.isStringLiteral(prop.key)
                ? prop.key.value
                : null;

            // Only process layout keys that have overrides
            if (!key || !LAYOUT_KEYS.has(key as LayoutKey)) continue;
            const layoutKey = key as LayoutKey;
            const overrideValue = layoutOverride[layoutKey];
            if (overrideValue === undefined) continue;

            const targetValue = String(overrideValue);
            const loc = toSourceLocation(prop.value.loc);

            // Numeric literal - writable
            if (t.isNumericLiteral(prop.value)) {
              const currentValue = String(prop.value.value);
              if (currentValue === targetValue) continue;

              const op: AstWriteOp = {
                op: 'SET_LAYOUT',
                nodeName,
                before: currentValue,
                after: targetValue,
                loc,
                writable: true,
                reason: 'literal',
                explanation: `Layout ${layoutKey} literal "${currentValue}" → "${targetValue}"`,
                layoutKey,
              };

              const applied = applyLayoutChange(
                ast,
                componentInfo.startLine,
                componentInfo.endLine,
                loc,
                layoutKey,
                targetValue
              );

              if (applied) {
                operations.push(op);
              }
            }
            // String literal - writable
            else if (t.isStringLiteral(prop.value)) {
              if (prop.value.value === targetValue) continue;

              const op: AstWriteOp = {
                op: 'SET_LAYOUT',
                nodeName,
                before: prop.value.value,
                after: targetValue,
                loc,
                writable: true,
                reason: 'literal',
                explanation: `Layout ${layoutKey} literal "${prop.value.value}" → "${targetValue}"`,
                layoutKey,
              };

              const applied = applyLayoutChange(
                ast,
                componentInfo.startLine,
                componentInfo.endLine,
                loc,
                layoutKey,
                targetValue
              );

              if (applied) {
                operations.push(op);
              }
            }
            // Variable reference - not writable
            else if (t.isIdentifier(prop.value)) {
              operations.push({
                op: 'SET_LAYOUT',
                nodeName,
                before: `{${prop.value.name}}`,
                after: targetValue,
                loc,
                writable: false,
                reason: 'variable-reference',
                explanation: `Cannot modify: variable-reference`,
                layoutKey,
              });
            }
            // Function call - not writable
            else if (t.isCallExpression(prop.value)) {
              operations.push({
                op: 'SET_LAYOUT',
                nodeName,
                before: '{fn()}',
                after: targetValue,
                loc,
                writable: false,
                reason: 'function-call',
                explanation: `Cannot modify: function-call`,
                layoutKey,
              });
            }
            // Member expression - not writable
            else if (t.isMemberExpression(prop.value)) {
              operations.push({
                op: 'SET_LAYOUT',
                nodeName,
                before: '{member}',
                after: targetValue,
                loc,
                writable: false,
                reason: 'variable-reference',
                explanation: `Cannot modify: member-expression`,
                layoutKey,
              });
            }
          }
        }
      },
    }
  );

  return operations;
}
