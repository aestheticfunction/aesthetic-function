/**
 * @file Ant Design Semantic Adapter (Phase 10B)
 *
 * READ-ONLY semantic extraction for Ant Design components.
 * This adapter extracts semantic information from AntD components
 * and maps them to the ComponentSemanticIntent interface.
 *
 * Supported Components:
 *   - Button: type, danger, disabled, size, children → semantics
 *   - Input: placeholder, disabled, size → semantics
 *   - Card: title, size → semantics
 *   - Tag: color, children → semantics
 *
 * Detection Strategy:
 *   Uses IMPORT-BASED detection (not tag-name). A component is only
 *   recognized as Ant Design if it's imported from 'antd' or 'antd/es/*'.
 *
 * Semantic Hints:
 *   Instead of hex colors, uses semantic hints like "antd:primary",
 *   "antd:danger", "antd:color:green" to preserve design intent.
 *
 * Confidence Rules:
 *   - high: Literal values (type="primary", disabled={true})
 *   - medium: Ambiguous or default values
 *   - low: Expression/variable bindings (disabled={someVar})
 */

import * as babelTypes from '@babel/types';
import type {
  ComponentSemanticIntent,
  SourceLocation,
  ConfidenceLevel,
  SemanticValue,
} from '../../ast/types.js';
import type {
  SemanticAdapter,
  AdapterContext,
  AdapterResult,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Set of Ant Design component names this adapter supports.
 */
const ANTD_SUPPORTED_COMPONENTS = new Set(['Button', 'Input', 'Card', 'Tag']);

/**
 * Valid module sources for Ant Design imports.
 */
const ANTD_IMPORT_SOURCES = ['antd', 'antd/es'];

// =============================================================================
// HELPER TYPES
// =============================================================================

interface ExtractedProp<T> {
  value: T;
  loc: SourceLocation;
  confidence: ConfidenceLevel;
}

interface ExtractedText {
  text: string;
  loc: SourceLocation;
  confidence: ConfidenceLevel;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a component is imported from Ant Design.
 * Returns true if the component is imported from 'antd' or 'antd/es/*'.
 */
export function isAntdComponent(
  componentName: string,
  imports: Record<string, string> | undefined
): boolean {
  if (!imports) return false;
  const source = imports[componentName];
  if (!source) return false;

  // Match 'antd' or 'antd/es/...'
  return ANTD_IMPORT_SOURCES.some(
    (prefix) => source === prefix || source.startsWith(`${prefix}/`)
  );
}

/**
 * Convert Babel location to SourceLocation.
 */
function toSourceLocation(loc: babelTypes.SourceLocation | null | undefined): SourceLocation {
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
 * Find a JSX attribute by name.
 */
function findAttribute(
  node: babelTypes.JSXElement,
  name: string
): babelTypes.JSXAttribute | null {
  for (const attr of node.openingElement.attributes) {
    if (
      babelTypes.isJSXAttribute(attr) &&
      babelTypes.isJSXIdentifier(attr.name) &&
      attr.name.name === name
    ) {
      return attr;
    }
  }
  return null;
}

/**
 * Extract a string prop value from JSX attributes.
 * Returns the value, location, and confidence level.
 */
function extractStringProp(
  node: babelTypes.JSXElement,
  propName: string
): ExtractedProp<string> | null {
  const attr = findAttribute(node, propName);
  if (!attr) return null;

  // type="primary" -> StringLiteral
  if (babelTypes.isStringLiteral(attr.value)) {
    return {
      value: attr.value.value,
      loc: toSourceLocation(attr.loc),
      confidence: 'high',
    };
  }

  // type={"primary"} -> JSXExpressionContainer with StringLiteral
  if (babelTypes.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;

    if (babelTypes.isStringLiteral(expr)) {
      return {
        value: expr.value,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // type={someVar} -> JSXExpressionContainer with Identifier
    if (babelTypes.isIdentifier(expr)) {
      return {
        value: `{{${expr.name}}}`,
        loc: toSourceLocation(attr.loc),
        confidence: 'low',
      };
    }
  }

  return null;
}

/**
 * Extract a boolean prop value from JSX attributes.
 * Handles: disabled, disabled={true}, disabled={false}, disabled={someVar}
 */
function extractBooleanProp(
  node: babelTypes.JSXElement,
  propName: string
): ExtractedProp<boolean> | null {
  const attr = findAttribute(node, propName);
  if (!attr) return null;

  // <Button disabled /> -> value is null, means true
  if (attr.value === null) {
    return {
      value: true,
      loc: toSourceLocation(attr.loc),
      confidence: 'high',
    };
  }

  // disabled={true} or disabled={false}
  if (babelTypes.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;

    if (babelTypes.isBooleanLiteral(expr)) {
      return {
        value: expr.value,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // disabled={someVar} - assume true but low confidence
    if (babelTypes.isIdentifier(expr)) {
      return {
        value: true,
        loc: toSourceLocation(attr.loc),
        confidence: 'low',
      };
    }
  }

  return null;
}

/**
 * Extract JSX text children from an element.
 * Only extracts direct text/expression children, not nested elements.
 */
function extractJsxTextChildren(node: babelTypes.JSXElement): ExtractedText[] {
  const texts: ExtractedText[] = [];

  for (const child of node.children) {
    // Direct text: <Button>Submit</Button>
    if (babelTypes.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        texts.push({
          text,
          loc: toSourceLocation(child.loc),
          confidence: 'high',
        });
      }
    }

    // Expression text: <Button>{"Submit"}</Button>
    if (babelTypes.isJSXExpressionContainer(child)) {
      const expr = child.expression;
      if (babelTypes.isStringLiteral(expr)) {
        texts.push({
          text: expr.value,
          loc: toSourceLocation(child.loc),
          confidence: 'high',
        });
      }
    }
  }

  return texts;
}

/**
 * Get overall confidence from semantics.
 */
function getOverallConfidence(semantics: Partial<ComponentSemanticIntent>): ConfidenceLevel {
  let hasLow = false;
  let hasHigh = false;

  const checkValue = (val: SemanticValue<unknown> | undefined) => {
    if (val?.confidence === 'low') hasLow = true;
    if (val?.confidence === 'high') hasHigh = true;
  };

  if (semantics.text?.content) {
    for (const c of semantics.text.content) checkValue(c);
  }
  checkValue(semantics.text?.placeholder);
  checkValue(semantics.text?.title);
  checkValue(semantics.booleans?.disabled);
  checkValue(semantics.layout?.width);
  checkValue(semantics.layout?.height);
  if (semantics.visual?.fills) {
    for (const f of semantics.visual.fills) checkValue(f);
  }

  if (hasLow) return 'low';
  if (hasHigh) return 'high';
  return 'medium';
}

/**
 * Create an empty result (for when extraction returns nothing).
 */
function emptyResult(adapterId: string): AdapterResult {
  return {
    semantics: {},
    provenance: {
      adapterId,
      confidence: 'high',
      reason: 'no extraction',
    },
  };
}

// =============================================================================
// COMPONENT EXTRACTORS
// =============================================================================

/**
 * Extract semantics from Ant Design Button.
 *
 * Mapped props:
 *   - type: "primary" | "dashed" | "text" | "link" | "default"
 *   - danger: boolean → adds red fill
 *   - disabled: boolean → booleans.disabled
 *   - children: text content → text.content
 */
function extractButton(
  node: babelTypes.JSXElement,
  _ctx: AdapterContext
): AdapterResult {
  const semantics: Partial<ComponentSemanticIntent> = {};
  const metadata: Record<string, unknown> = { component: 'Button' };

  // Extract type prop
  const typeProp = extractStringProp(node, 'type');
  const dangerProp = extractBooleanProp(node, 'danger');

  // Determine fill color based on type and danger
  if (dangerProp?.value) {
    semantics.visual = {
      fills: [{
        value: 'antd:danger',
        loc: dangerProp.loc,
        confidence: dangerProp.confidence,
      }],
    };
    metadata.variant = 'danger';
  } else if (typeProp) {
    // Map type to semantic hint
    semantics.visual = {
      fills: [{
        value: `antd:${typeProp.value}`,
        loc: typeProp.loc,
        confidence: typeProp.confidence,
      }],
    };
    metadata.variant = typeProp.value;
  }

  // Extract disabled
  const disabledProp = extractBooleanProp(node, 'disabled');
  if (disabledProp) {
    semantics.booleans = {
      disabled: {
        value: disabledProp.value,
        loc: disabledProp.loc,
        confidence: disabledProp.confidence,
      },
    };
  }

  // Extract size (store in metadata only, no layout.size in LayoutSemantics)
  const sizeProp = extractStringProp(node, 'size');
  if (sizeProp) {
    metadata.size = sizeProp.value;
  }

  // Extract children text
  const textChildren = extractJsxTextChildren(node);
  if (textChildren.length > 0) {
    semantics.text = {
      content: textChildren.map((t) => ({
        value: t.text,
        loc: t.loc,
        confidence: t.confidence,
      })),
    };
  }

  return {
    semantics,
    provenance: {
      adapterId: 'antd',
      confidence: getOverallConfidence(semantics),
      reason: 'Button component',
    },
    frameworkMetadata: metadata,
  };
}

/**
 * Extract semantics from Ant Design Input.
 *
 * Mapped props:
 *   - placeholder: string → text.placeholder
 *   - disabled: boolean → booleans.disabled
 */
function extractInput(
  node: babelTypes.JSXElement,
  _ctx: AdapterContext
): AdapterResult {
  const semantics: Partial<ComponentSemanticIntent> = {};
  const metadata: Record<string, unknown> = { component: 'Input' };

  // Extract placeholder
  const placeholderProp = extractStringProp(node, 'placeholder');
  if (placeholderProp) {
    semantics.text = {
      placeholder: {
        value: placeholderProp.value,
        loc: placeholderProp.loc,
        confidence: placeholderProp.confidence,
      },
    };
  }

  // Extract disabled
  const disabledProp = extractBooleanProp(node, 'disabled');
  if (disabledProp) {
    semantics.booleans = {
      disabled: {
        value: disabledProp.value,
        loc: disabledProp.loc,
        confidence: disabledProp.confidence,
      },
    };
  }

  // Extract size (store in metadata only)
  const sizeProp = extractStringProp(node, 'size');
  if (sizeProp) {
    metadata.size = sizeProp.value;
  }

  return {
    semantics,
    provenance: {
      adapterId: 'antd',
      confidence: getOverallConfidence(semantics),
      reason: 'Input component',
    },
    frameworkMetadata: metadata,
  };
}

/**
 * Extract semantics from Ant Design Card.
 *
 * Mapped props:
 *   - title: string → text.title
 */
function extractCard(
  node: babelTypes.JSXElement,
  _ctx: AdapterContext
): AdapterResult {
  const semantics: Partial<ComponentSemanticIntent> = {};
  const metadata: Record<string, unknown> = { component: 'Card' };

  // Extract title
  const titleProp = extractStringProp(node, 'title');
  if (titleProp) {
    semantics.text = {
      title: {
        value: titleProp.value,
        loc: titleProp.loc,
        confidence: titleProp.confidence,
      },
    };
  }

  // Extract size (store in metadata only)
  const sizeProp = extractStringProp(node, 'size');
  if (sizeProp) {
    metadata.size = sizeProp.value;
  }

  return {
    semantics,
    provenance: {
      adapterId: 'antd',
      confidence: getOverallConfidence(semantics),
      reason: 'Card component',
    },
    frameworkMetadata: metadata,
  };
}

/**
 * Extract semantics from Ant Design Tag.
 *
 * Mapped props:
 *   - color: string → visual.fills (as "antd:color:{color}")
 *   - children: text → text.content
 */
function extractTag(
  node: babelTypes.JSXElement,
  _ctx: AdapterContext
): AdapterResult {
  const semantics: Partial<ComponentSemanticIntent> = {};
  const metadata: Record<string, unknown> = { component: 'Tag' };

  // Extract color
  const colorProp = extractStringProp(node, 'color');
  if (colorProp) {
    // Use semantic hint format: "antd:color:green"
    semantics.visual = {
      fills: [{
        value: `antd:color:${colorProp.value}`,
        loc: colorProp.loc,
        confidence: colorProp.confidence,
      }],
    };
    metadata.antdColor = colorProp.value;
  }

  // Extract children text
  const textChildren = extractJsxTextChildren(node);
  if (textChildren.length > 0) {
    semantics.text = {
      content: textChildren.map((t) => ({
        value: t.text,
        loc: t.loc,
        confidence: t.confidence,
      })),
    };
  }

  return {
    semantics,
    provenance: {
      adapterId: 'antd',
      confidence: getOverallConfidence(semantics),
      reason: 'Tag component',
    },
    frameworkMetadata: metadata,
  };
}

// =============================================================================
// ADAPTER CLASS
// =============================================================================

/**
 * Semantic adapter for Ant Design components.
 *
 * Uses import-based detection to verify components are from 'antd' package.
 * Extracts semantic information and maps to ComponentSemanticIntent.
 */
export class AntdSemanticAdapter implements SemanticAdapter {
  readonly id = 'antd';
  readonly displayName = 'Ant Design';
  readonly priority = 51; // After Vuetify (50)

  /**
   * Check if this adapter supports the given JSX element.
   * Uses import-based detection - must be imported from 'antd' or 'antd/es/*'.
   */
  supports(_node: babelTypes.JSXElement, ctx: AdapterContext): boolean {
    const { componentName, imports } = ctx;

    // Must have component name
    if (!componentName) return false;

    // Must be a supported component name
    if (!ANTD_SUPPORTED_COMPONENTS.has(componentName)) {
      return false;
    }

    // Must be imported from antd
    return isAntdComponent(componentName, imports);
  }

  /**
   * Extract semantic information from the JSX element.
   */
  extract(node: babelTypes.JSXElement, ctx: AdapterContext): AdapterResult {
    const { componentName } = ctx;

    switch (componentName) {
      case 'Button':
        return extractButton(node, ctx);
      case 'Input':
        return extractInput(node, ctx);
      case 'Card':
        return extractCard(node, ctx);
      case 'Tag':
        return extractTag(node, ctx);
      default:
        return emptyResult(this.id);
    }
  }
}

// Export singleton instance for registration
export const antdAdapter = new AntdSemanticAdapter();
