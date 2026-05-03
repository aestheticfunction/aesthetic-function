/**
 * @aesthetic-function/watcher - framework/vue3/parseAst.ts
 *
 * AST-based analyzer for Vue 3 SFC files.
 *
 * WHY: Extracts literal semantics from `<template>` and `<script>`/
 * `<script setup>` blocks to produce an `AstIntentReport` — the same shape
 * the React analyzer produces. The reconciliation engine, server, and Figma
 * plugin consume this shape unchanged.
 *
 * SCOPE (v1):
 * - `<script setup lang="ts">` (priority case) via Babel + TypeScript plugin
 * - `defineComponent` setup / Options API (partial coverage, documented)
 * - Template element literal attributes and text nodes
 * - Inline style literals (`:style="{ prop: 'value' }"`)
 * - CSS custom property resolution via tokens.ts (stages 1–3)
 *
 * OUT OF SCOPE:
 * - Computed properties, mixins, render functions
 * - Vue-JSX (`<script lang="jsx">`)
 * - `<style module>` class token map (deferred to v2)
 * - Scoped class name reconciliation
 */

import { parse as babelParse } from '@babel/parser';
import * as babelTraverse from '@babel/traverse';
import type { TraverseOptions } from '@babel/traverse';
import * as t from '@babel/types';

import type {
  AstIntentReport,
  AstComponentReport,
  JsxTextLiteral,
  JsxPropLiteral,
  InlineStyleLiteral,
  SourceLocation,
  ComponentSemanticIntent,
  SemanticValue,
  TextSemantics,
  BooleanSemantics,
  LayoutSemantics,
  FlexSemantics,
  VisualSemantics,
} from '../../ast/types.js';
import { computeComponentKey } from '../../ast/types.js';

import type { SfcDescriptor } from './parseSfc.js';
import { buildTokenResolverOpts, resolveToken } from './tokens.js';
import type { AnalyzerOpts } from '../types.js';

// =============================================================================
// BABEL TRAVERSE SHIM (identical to parseIntentFromReactAst.ts approach)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTraverse(): (parent: t.Node, opts?: TraverseOptions<unknown>) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = babelTraverse as any;
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  if (mod.default && typeof mod.default.default === 'function') return mod.default.default;
  throw new Error('Could not resolve @babel/traverse');
}
const traverse = getTraverse();

// =============================================================================
// HEX COLOR REGEX
// =============================================================================

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// =============================================================================
// SOURCE LOCATION HELPERS
// =============================================================================

function toSourceLocation(loc: t.SourceLocation | null | undefined): SourceLocation {
  if (!loc) return { startLine: 0, endLine: 0 };
  return {
    startLine: loc.start.line,
    endLine: loc.end.line,
    startColumn: loc.start.column,
    endColumn: loc.end.column,
  };
}

// =============================================================================
// TEMPLATE AST PARSER (lightweight, no @vue/compiler-dom required)
// =============================================================================

/**
 * A minimal template element parsed from a `.vue` `<template>` block.
 *
 * WHY: We need tag names, static attributes, and text children to build
 * JsxTextLiteral / JsxPropLiteral / InlineStyleLiteral shapes. We avoid
 * depending on `@vue/compiler-dom` for this — the regex parser is sufficient
 * for literal extraction and keeps the dependency footprint small.
 */
interface TemplateElement {
  tag: string;
  attrs: Record<string, string>; // static only (no `:binding` or `v-bind`)
  textContent: string[];         // direct text children (trimmed, non-empty)
  isComponent: boolean;          // tag starts with uppercase or contains '-'
}

/**
 * Parse static attributes from an HTML opening tag string.
 *
 * Extracts only non-dynamic attributes: `class="..."`, `id="..."`, etc.
 * Dynamic bindings (`:prop`, `v-bind`, `v-model`, `@event`) are skipped.
 */
function parseStaticAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match key="value", key='value', or key (boolean)
  const staticAttrRegex = /(?<![:\w@])(\w[\w-]*)=["']([^"']+)["']/g;
  let m;
  while ((m = staticAttrRegex.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Parse `:style="{ prop: 'value' }"` into a map of style property → value.
 * Only literal string/number values are extracted.
 */
function parseInlineStyle(styleValue: string): Record<string, string> {
  const styles: Record<string, string> = {};
  // Match { prop: 'value' } or { prop: "value" } or { prop: 123 }
  const kvRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = kvRegex.exec(styleValue)) !== null) {
    styles[m[1]] = m[2];
  }
  return styles;
}

/**
 * Lightweight regex-based extraction of elements from a `<template>` block.
 *
 * Handles: component tags, HTML elements, text nodes, `:style`, static attrs.
 * Does NOT handle: nested scopes, `v-for`, `v-if`, slots (read-only analysis only).
 */
function extractTemplateElements(templateContent: string): TemplateElement[] {
  const elements: TemplateElement[] = [];

  // Match self-closing or opening tags (excluding </closing> tags)
  const tagRegex = /<([A-Za-z][\w.-]*)([^>]*?)(?:\s*\/>|>)/g;
  let m;

  while ((m = tagRegex.exec(templateContent)) !== null) {
    const tag = m[1];
    const attrStr = m[2] ?? '';

    // Skip special Vue built-ins we don't reconcile
    if (['template', 'slot', 'transition', 'keep-alive', 'teleport', 'suspense'].includes(tag)) {
      continue;
    }

    const staticAttrs = parseStaticAttrs(attrStr);

    // Extract :style="{ ... }" binding
    const styleBindingMatch = /:style=["'](\{[^"']+\})["']/.exec(attrStr)
      ?? /:style=["']([^"']+)["']/.exec(attrStr);
    if (styleBindingMatch) {
      const parsedStyle = parseInlineStyle(styleBindingMatch[1]);
      for (const [k, v] of Object.entries(parsedStyle)) {
        staticAttrs[`style:${k}`] = v;
      }
    }

    // Extract static `style="..."` attribute
    const staticStyleMatch = /(?<!:)style=["']([^"']+)["']/.exec(attrStr);
    if (staticStyleMatch) {
      // Inline style: property: value; ...
      const parts = staticStyleMatch[1].split(';');
      for (const part of parts) {
        const colon = part.indexOf(':');
        if (colon === -1) continue;
        const prop = part.slice(0, colon).trim();
        const val = part.slice(colon + 1).trim();
        if (prop && val) {
          staticAttrs[`style:${prop}`] = val;
        }
      }
    }

    // Find text children: text between the opening tag and the next tag
    const afterTag = m.index + m[0].length;
    const nextTagIdx = templateContent.indexOf('<', afterTag);
    const rawText = nextTagIdx === -1
      ? templateContent.slice(afterTag)
      : templateContent.slice(afterTag, nextTagIdx);

    // Exclude template expression {{ }} content (dynamic, not literal)
    const textContent = rawText
      .replace(/\{\{[^}]+\}\}/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    elements.push({
      tag,
      attrs: staticAttrs,
      textContent,
      isComponent: /^[A-Z]/.test(tag) || tag.includes('-'),
    });
  }

  return elements;
}

// =============================================================================
// SCRIPT BLOCK ANALYSIS (Babel)
// =============================================================================

interface ScriptExtraction {
  componentName: string | undefined;
  propLiterals: JsxPropLiteral[];
  styleLiterals: InlineStyleLiteral[];
}

/**
 * Extract component name and literal props/styles from a `<script>` or
 * `<script setup>` block using Babel.
 *
 * Handles:
 * - `defineOptions({ name: 'MyComponent' })`
 * - `defineProps({ label: { type: String, default: 'Click me' } })`
 * - `defineProps({ label: String })` (no default — skipped)
 * - `export default defineComponent({ name: 'Foo', props: { ... } })`
 * - `export default { name: 'Foo', props: { ... } }` (Options API)
 */
function analyzeScriptBlock(content: string, _filePath: string): ScriptExtraction {
  const result: ScriptExtraction = {
    componentName: undefined,
    propLiterals: [],
    styleLiterals: [],
  };

  let ast: t.File;
  try {
    ast = babelParse(content, {
      sourceType: 'module',
      plugins: ['typescript'],
      errorRecovery: true,
    });
  } catch {
    return result;
  }

  traverse(ast, {
    // defineOptions({ name: 'MyComponent' })
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: 'defineOptions' })) return;
      const arg = path.node.arguments[0];
      if (!t.isObjectExpression(arg)) return;

      for (const prop of arg.properties) {
        if (!t.isObjectProperty(prop)) continue;
        if (!t.isIdentifier(prop.key, { name: 'name' })) continue;
        if (t.isStringLiteral(prop.value)) {
          result.componentName = prop.value.value;
        }
      }
    },

    // defineProps({ propName: { type: X, default: 'value' } })
    // Only extracts literal defaults.
  });

  // Second traverse for defineProps (separate to avoid visitor conflicts)
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: 'defineProps' })) return;
      const arg = path.node.arguments[0];
      if (!t.isObjectExpression(arg)) return;

      for (const prop of arg.properties) {
        if (!t.isObjectProperty(prop)) continue;
        const propName = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
          ? prop.key.value
          : undefined;
        if (!propName) continue;

        // { label: { default: 'Click me' } }
        if (t.isObjectExpression(prop.value)) {
          for (const innerProp of prop.value.properties) {
            if (!t.isObjectProperty(innerProp)) continue;
            if (!t.isIdentifier(innerProp.key, { name: 'default' })) continue;
            const val = innerProp.value;
            if (t.isStringLiteral(val) || t.isNumericLiteral(val) || t.isBooleanLiteral(val)) {
              result.propLiterals.push({
                element: 'defineProps',
                prop: propName,
                value: val.value,
                loc: toSourceLocation(val.loc),
              });
            }
          }
        }
      }
    },

    // Options API / defineComponent: `name` field, `props` object
    ObjectExpression(path) {
      // Look for { name: 'Foo', props: {...} } as a direct argument to
      // defineComponent or as an export default expression.
      const parent = path.parent;
      const isDefineComponent =
        t.isCallExpression(parent) &&
        t.isIdentifier(parent.callee, { name: 'defineComponent' });
      const isExportDefault = t.isExportDefaultDeclaration(parent);

      if (!isDefineComponent && !isExportDefault) return;

      for (const prop of path.node.properties) {
        if (!t.isObjectProperty(prop)) continue;

        // `name: 'MyComponent'`
        if (t.isIdentifier(prop.key, { name: 'name' }) && t.isStringLiteral(prop.value)) {
          if (!result.componentName) {
            result.componentName = prop.value.value;
          }
        }

        // `props: { label: { default: '...' } }`
        if (t.isIdentifier(prop.key, { name: 'props' }) && t.isObjectExpression(prop.value)) {
          for (const pDef of prop.value.properties) {
            if (!t.isObjectProperty(pDef)) continue;
            const pName = t.isIdentifier(pDef.key)
              ? pDef.key.name
              : t.isStringLiteral(pDef.key)
              ? pDef.key.value
              : undefined;
            if (!pName) continue;

            if (t.isObjectExpression(pDef.value)) {
              for (const inner of pDef.value.properties) {
                if (!t.isObjectProperty(inner)) continue;
                if (!t.isIdentifier(inner.key, { name: 'default' })) continue;
                const val = inner.value;
                if (t.isStringLiteral(val) || t.isNumericLiteral(val) || t.isBooleanLiteral(val)) {
                  result.propLiterals.push({
                    element: 'props',
                    prop: pName,
                    value: val.value,
                    loc: toSourceLocation(val.loc),
                  });
                }
              }
            }
          }
        }
      }
    },
  });

  return result;
}

// =============================================================================
// SEMANTIC INTENT BUILDER
// =============================================================================

const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);
const BOOL_ATTRS = new Set(['disabled', 'checked', 'selected']);
const LAYOUT_ATTRS = new Set(['width', 'height']);
const LAYOUT_STYLE_PROPS = new Set(['width', 'height', 'padding', 'margin', 'gap']);
const FLEX_STYLE_PROPS = new Set(['display', 'flexDirection', 'justifyContent', 'alignItems']);

function buildSemanticIntent(
  textLiterals: JsxTextLiteral[],
  propLiterals: JsxPropLiteral[],
  styleLiterals: InlineStyleLiteral[]
): ComponentSemanticIntent {
  const text: TextSemantics = {};
  const booleans: BooleanSemantics = {};
  const layout: LayoutSemantics = {};
  const flex: FlexSemantics = {};
  const visual: VisualSemantics = {};

  // Text from template text nodes
  const contentValues: SemanticValue<string>[] = textLiterals
    .filter((l) => l.text.trim().length > 0)
    .map((l) => ({ value: l.text.trim(), loc: l.loc, confidence: 'high' as const }));
  if (contentValues.length > 0) {
    text.content = contentValues;
  }

  // Props
  for (const p of propLiterals) {
    if (TEXT_ATTRS.has(p.prop) && typeof p.value === 'string') {
      const sv: SemanticValue<string> = { value: p.value, loc: p.loc, confidence: 'high' };
      if (p.prop === 'placeholder') text.placeholder = sv;
      else if (p.prop === 'title') text.title = sv;
      else if (p.prop === 'aria-label') text.ariaLabel = sv;
      else if (p.prop === 'alt') text.alt = sv;
    }
    if (BOOL_ATTRS.has(p.prop) && typeof p.value === 'boolean') {
      const sv: SemanticValue<boolean> = { value: p.value, loc: p.loc, confidence: 'high' };
      if (p.prop === 'disabled') booleans.disabled = sv;
      else if (p.prop === 'checked') booleans.checked = sv;
      else if (p.prop === 'selected') booleans.selected = sv;
    }
    if (LAYOUT_ATTRS.has(p.prop) && typeof p.value === 'number') {
      const sv: SemanticValue<number> = { value: p.value, loc: p.loc, confidence: 'high' };
      if (p.prop === 'width') layout.width = sv;
      else if (p.prop === 'height') layout.height = sv;
    }
  }

  // Inline styles
  for (const s of styleLiterals) {
    if (LAYOUT_STYLE_PROPS.has(s.styleProp) && typeof s.value === 'number') {
      const sv: SemanticValue<number> = { value: s.value, loc: s.loc, confidence: 'high' };
      if (s.styleProp === 'width' && !layout.width) layout.width = sv;
      else if (s.styleProp === 'height' && !layout.height) layout.height = sv;
      else if (s.styleProp === 'padding') layout.padding = sv;
      else if (s.styleProp === 'margin') layout.margin = sv;
      else if (s.styleProp === 'gap') layout.gap = sv;
    }
    if (FLEX_STYLE_PROPS.has(s.styleProp) && typeof s.value === 'string') {
      const sv: SemanticValue<string> = { value: s.value, loc: s.loc, confidence: 'high' };
      if (s.styleProp === 'display') flex.display = sv;
      else if (s.styleProp === 'flexDirection') flex.flexDirection = sv;
      else if (s.styleProp === 'justifyContent') flex.justifyContent = sv;
      else if (s.styleProp === 'alignItems') flex.alignItems = sv;
    }
    if (s.styleProp === 'backgroundColor' && typeof s.value === 'string') {
      if (HEX_COLOR_REGEX.test(s.value)) {
        const sv: SemanticValue<string> = { value: s.value, loc: s.loc, confidence: 'high' };
        if (!visual.fills) visual.fills = [];
        visual.fills.push(sv);
      }
    }
  }

  return { text, booleans, layout, flex, visual };
}

// =============================================================================
// COMPONENT NAME DERIVATION
// =============================================================================

/**
 * Derive the component name for a Vue SFC.
 *
 * Priority (per design decision / answer #5):
 *   1. `defineOptions({ name: ... })` — explicit name in `<script setup>`
 *   2. `export default defineComponent({ name: ... })` — explicit in options
 *   3. `export default { name: ... }` — Options API
 *   4. PascalCase of the filename (e.g., `MyButton.vue` → `MyButton`)
 */
function deriveComponentName(
  scriptExtraction: ScriptExtraction,
  filePath: string
): string {
  if (scriptExtraction.componentName) {
    return scriptExtraction.componentName;
  }

  // Fallback: PascalCase filename
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Unknown';
  const base = fileName.replace(/\.vue$/, '');
  // Convert kebab-case to PascalCase
  return base.replace(/(^|-)(\w)/g, (_, _sep, c: string) => c.toUpperCase());
}

// =============================================================================
// MAIN AST PARSER
// =============================================================================

/**
 * Parse a Vue 3 SFC descriptor into an AstIntentReport.
 *
 * @param descriptor - Pre-parsed SFC (from parseSfc / parseSfcSync)
 * @param opts       - Analyzer options (sourceRoots, tokenFilePaths, etc.)
 */
export function parseVueAst(
  descriptor: SfcDescriptor,
  opts: AnalyzerOpts = {}
): AstIntentReport {
  const { filePath } = descriptor;

  // If the SFC failed to parse, return an empty report.
  if (!descriptor.ok) {
    return { filePath, components: [] };
  }

  // Build token resolver options for this SFC.
  const tokenOpts = buildTokenResolverOpts(descriptor);

  // Analyze script block.
  const activeScript = descriptor.scriptSetup ?? descriptor.script;
  const scriptExtraction = activeScript
    ? analyzeScriptBlock(activeScript.content, filePath)
    : { componentName: undefined, propLiterals: [], styleLiterals: [] };

  // Derive component name.
  const componentName = deriveComponentName(scriptExtraction, filePath);

  // Compute component key.
  const sourceRoot = opts.sourceRoots?.find((r) => filePath.includes(r));
  const componentKey = computeComponentKey(filePath, componentName, sourceRoot);

  // Analyze template block.
  const templateElements = descriptor.template
    ? extractTemplateElements(descriptor.template.content)
    : [];

  // Collect all literals from template elements.
  const textLiterals: JsxTextLiteral[] = [];
  const propLiterals: JsxPropLiteral[] = [...scriptExtraction.propLiterals];
  const styleLiterals: InlineStyleLiteral[] = [...scriptExtraction.styleLiterals];

  // Approximate source location for template-derived literals.
  // Use line 1 with 0 columns as a placeholder (exact template line tracking
  // requires the full compiler AST, deferred to Phase 2 full implementation).
  const templateLoc: SourceLocation = { startLine: 1, endLine: 1 };

  for (const el of templateElements) {
    // Text children → JsxTextLiteral
    for (const text of el.textContent) {
      textLiterals.push({ text, loc: templateLoc });
    }

    // Static attributes → JsxPropLiteral
    for (const [attrName, attrVal] of Object.entries(el.attrs)) {
      if (attrName.startsWith('style:')) continue; // handled below
      propLiterals.push({
        element: el.tag,
        prop: attrName,
        value: attrVal,
        loc: templateLoc,
      });
    }

    // Style properties extracted from :style or style=""
    for (const [attrName, styleVal] of Object.entries(el.attrs)) {
      if (!attrName.startsWith('style:')) continue;
      const styleProp = attrName.slice('style:'.length);

      // Run token resolution
      const resolution = resolveToken(styleVal, tokenOpts);
      const finalVal = resolution.resolved ?? styleVal;
      const numVal = parseFloat(finalVal);

      styleLiterals.push({
        element: el.tag,
        styleProp: toCamelCase(styleProp),
        value: isNaN(numVal) ? finalVal : numVal,
        loc: templateLoc,
      });
    }
  }

  const semantics = buildSemanticIntent(textLiterals, propLiterals, styleLiterals);

  const component: AstComponentReport = {
    componentName,
    componentKey,
    isExported: true, // Vue SFC default exports are always the component
    loc: { startLine: 1, endLine: 1 },
    jsxTextLiterals: textLiterals,
    jsxPropLiterals: propLiterals,
    inlineStyleLiterals: styleLiterals,
    semantics,
  };

  return {
    filePath,
    components: [component],
  };
}

// =============================================================================
// UTILITY
// =============================================================================

function toCamelCase(str: string): string {
  return str.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
