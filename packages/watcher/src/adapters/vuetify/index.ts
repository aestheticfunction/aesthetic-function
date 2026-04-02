/**
 * @aesthetic-function/watcher - adapters/vuetify/index.ts
 *
 * Vuetify Semantic Adapter (Phase 10A).
 *
 * First concrete implementation of the SemanticAdapter interface.
 * Extracts semantic intent from Vuetify-specific components.
 *
 * SUPPORTED COMPONENTS (Phase 10A):
 * - v-btn: Button with text, color, disabled, size
 * - v-card: Card with width, height, elevation, title/subtitle
 * - v-text-field: Input with label (as placeholder), disabled
 * - v-chip: Chip with text, color, variant
 *
 * DETECTION:
 * - Tag name based only (no import resolution in Phase 10A)
 * - Does NOT assume Vuetify is globally present
 *
 * CONFIDENCE RULES:
 * - Literal props → high
 * - Static strings → high
 * - Slots → medium
 * - Bound expressions / variables → low
 * - Runtime values → ignored
 *
 * SCOPE: Read-only extraction only. No modifications.
 */

import * as babelTypes from '@babel/types';
import type {
  ComponentSemanticIntent,
  SemanticValue,
  SourceLocation,
  ConfidenceLevel,
} from '../../ast/types.js';
import type {
  SemanticAdapter,
  AdapterContext,
  AdapterResult,
  VuetifyComponentTag,
} from '../types.js';
import { isVuetifyTag } from '../types.js';

// =============================================================================
// VUETIFY ADAPTER
// =============================================================================

/**
 * Vuetify Semantic Adapter.
 *
 * Extracts semantics from Vuetify components based on their
 * framework-specific prop conventions.
 */
export class VuetifySemanticAdapter implements SemanticAdapter {
  readonly id = 'vuetify';
  readonly displayName = 'Vuetify';
  readonly priority = 50; // Run before generic adapters (100)

  /** Surface classification: runtime framework, no-mutation, non-authoritative, derived */
  readonly surfaceMetadata = {
    surfaceType: 'runtime' as const,
    accessMode: 'no-mutation' as const,
    authorityRole: 'external-non-authoritative' as const,
    stability: 'derived' as const,
  };

  /**
   * Check if this adapter supports the given JSX element.
   * Supports v-btn, v-card, v-text-field, v-chip.
   */
  supports(node: babelTypes.JSXElement, _ctx: AdapterContext): boolean {
    const tagName = getTagName(node);
    return tagName !== null && isVuetifyTag(tagName);
  }

  /**
   * Extract semantic intent from a Vuetify component.
   */
  extract(node: babelTypes.JSXElement, ctx: AdapterContext): AdapterResult {
    const tagName = getTagName(node) as VuetifyComponentTag;

    switch (tagName) {
      case 'v-btn':
        return this.extractVBtn(node, ctx);
      case 'v-card':
        return this.extractVCard(node, ctx);
      case 'v-text-field':
        return this.extractVTextField(node, ctx);
      case 'v-chip':
        return this.extractVChip(node, ctx);
      default:
        return emptyResult(this.id);
    }
  }

  // ---------------------------------------------------------------------------
  // V-BTN EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extract semantics from v-btn.
   *
   * Maps:
   * - JSX text → text.content
   * - color prop → visual.fills
   * - variant="outlined" → frameworkMetadata
   * - disabled → booleans.disabled
   * - size → layout (height hint)
   */
  private extractVBtn(node: babelTypes.JSXElement, _ctx: AdapterContext): AdapterResult {
    const semantics: Partial<ComponentSemanticIntent> = {};
    const metadata: Record<string, unknown> = { component: 'v-btn' };

    // Extract text content from children
    const textContent = extractJsxTextChildren(node);
    if (textContent.length > 0) {
      semantics.text = {
        content: textContent.map((tc) => ({
          value: tc.text,
          loc: tc.loc,
          confidence: tc.confidence,
        })),
      };
    }

    // Extract props
    const colorProp = extractStringProp(node, 'color');
    if (colorProp) {
      const hexColor = vuetifyColorToHex(colorProp.value);
      if (hexColor) {
        semantics.visual = {
          fills: [{
            value: hexColor,
            loc: colorProp.loc,
            confidence: colorProp.confidence,
          }],
        };
      }
      metadata.vuetifyColor = colorProp.value;
    }

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

    const variantProp = extractStringProp(node, 'variant');
    if (variantProp) {
      metadata.variant = variantProp.value;
    }

    const sizeProp = extractStringProp(node, 'size');
    if (sizeProp) {
      metadata.size = sizeProp.value;
      // Map size to layout hint
      const heightValue = vuetifySizeToHeight(sizeProp.value);
      if (heightValue !== null) {
        semantics.layout = {
          height: {
            value: heightValue,
            loc: sizeProp.loc,
            confidence: 'medium', // Inferred from size
          },
        };
      }
    }

    return {
      semantics,
      provenance: {
        adapterId: this.id,
        confidence: getOverallConfidence(semantics),
        reason: 'v-btn component',
      },
      frameworkMetadata: metadata,
    };
  }

  // ---------------------------------------------------------------------------
  // V-CARD EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extract semantics from v-card.
   *
   * Maps:
   * - width / height → layout
   * - elevation → visual hint (metadata)
   * - title / subtitle slots → text
   */
  private extractVCard(node: babelTypes.JSXElement, _ctx: AdapterContext): AdapterResult {
    const semantics: Partial<ComponentSemanticIntent> = {};
    const metadata: Record<string, unknown> = { component: 'v-card' };

    // Extract layout props
    const widthProp = extractNumericProp(node, 'width');
    const heightProp = extractNumericProp(node, 'height');

    if (widthProp || heightProp) {
      semantics.layout = {};
      if (widthProp) {
        semantics.layout.width = {
          value: widthProp.value,
          loc: widthProp.loc,
          confidence: widthProp.confidence,
        };
      }
      if (heightProp) {
        semantics.layout.height = {
          value: heightProp.value,
          loc: heightProp.loc,
          confidence: heightProp.confidence,
        };
      }
    }

    // Extract elevation (Vuetify-specific visual hint)
    const elevationProp = extractNumericProp(node, 'elevation');
    if (elevationProp) {
      metadata.elevation = elevationProp.value;
    }

    // Extract title prop (Vuetify v-card shorthand)
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

    // Extract subtitle prop
    const subtitleProp = extractStringProp(node, 'subtitle');
    if (subtitleProp) {
      metadata.subtitle = subtitleProp.value;
    }

    return {
      semantics,
      provenance: {
        adapterId: this.id,
        confidence: getOverallConfidence(semantics),
        reason: 'v-card component',
      },
      frameworkMetadata: metadata,
    };
  }

  // ---------------------------------------------------------------------------
  // V-TEXT-FIELD EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extract semantics from v-text-field.
   *
   * Maps:
   * - label → text.placeholder
   * - disabled → booleans.disabled
   * - modelValue → ignored (runtime)
   */
  private extractVTextField(node: babelTypes.JSXElement, _ctx: AdapterContext): AdapterResult {
    const semantics: Partial<ComponentSemanticIntent> = {};
    const metadata: Record<string, unknown> = { component: 'v-text-field' };

    // Extract label as placeholder
    const labelProp = extractStringProp(node, 'label');
    if (labelProp) {
      semantics.text = {
        placeholder: {
          value: labelProp.value,
          loc: labelProp.loc,
          confidence: labelProp.confidence,
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

    // Note: modelValue is runtime, ignored

    return {
      semantics,
      provenance: {
        adapterId: this.id,
        confidence: getOverallConfidence(semantics),
        reason: 'v-text-field component',
      },
      frameworkMetadata: metadata,
    };
  }

  // ---------------------------------------------------------------------------
  // V-CHIP EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extract semantics from v-chip.
   *
   * Maps:
   * - Text content → text.content
   * - color → visual.fills
   * - variant → visual hint (metadata)
   */
  private extractVChip(node: babelTypes.JSXElement, _ctx: AdapterContext): AdapterResult {
    const semantics: Partial<ComponentSemanticIntent> = {};
    const metadata: Record<string, unknown> = { component: 'v-chip' };

    // Extract text content from children
    const textContent = extractJsxTextChildren(node);
    if (textContent.length > 0) {
      semantics.text = {
        content: textContent.map((tc) => ({
          value: tc.text,
          loc: tc.loc,
          confidence: tc.confidence,
        })),
      };
    }

    // Extract color
    const colorProp = extractStringProp(node, 'color');
    if (colorProp) {
      const hexColor = vuetifyColorToHex(colorProp.value);
      if (hexColor) {
        semantics.visual = {
          fills: [{
            value: hexColor,
            loc: colorProp.loc,
            confidence: colorProp.confidence,
          }],
        };
      }
      metadata.vuetifyColor = colorProp.value;
    }

    // Extract variant
    const variantProp = extractStringProp(node, 'variant');
    if (variantProp) {
      metadata.variant = variantProp.value;
    }

    return {
      semantics,
      provenance: {
        adapterId: this.id,
        confidence: getOverallConfidence(semantics),
        reason: 'v-chip component',
      },
      frameworkMetadata: metadata,
    };
  }
}

// =============================================================================
// PROP EXTRACTION HELPERS
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

/**
 * Get the tag name from a JSX element.
 */
function getTagName(node: babelTypes.JSXElement): string | null {
  const opening = node.openingElement;
  if (babelTypes.isJSXIdentifier(opening.name)) {
    return opening.name.name;
  }
  return null;
}

/**
 * Extract a string prop value from a JSX element.
 */
function extractStringProp(
  node: babelTypes.JSXElement,
  propName: string
): ExtractedProp<string> | null {
  const attr = findAttribute(node, propName);
  if (!attr) return null;

  // String literal: prop="value"
  if (babelTypes.isStringLiteral(attr.value)) {
    return {
      value: attr.value.value,
      loc: toSourceLocation(attr.loc),
      confidence: 'high',
    };
  }

  // Expression container: prop={value}
  if (babelTypes.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;

    // String literal in expression: prop={"value"}
    if (babelTypes.isStringLiteral(expr)) {
      return {
        value: expr.value,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // Template literal with no expressions: prop={`value`}
    if (babelTypes.isTemplateLiteral(expr) && expr.expressions.length === 0 && expr.quasis.length === 1) {
      return {
        value: expr.quasis[0].value.cooked ?? expr.quasis[0].value.raw,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // Variable/expression - low confidence, return the expression text
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
 * Extract a boolean prop value from a JSX element.
 */
function extractBooleanProp(
  node: babelTypes.JSXElement,
  propName: string
): ExtractedProp<boolean> | null {
  const attr = findAttribute(node, propName);
  if (!attr) return null;

  // Boolean shorthand: disabled (no value = true)
  if (attr.value === null) {
    return {
      value: true,
      loc: toSourceLocation(attr.loc),
      confidence: 'high',
    };
  }

  // Expression container: disabled={true}
  if (babelTypes.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;

    if (babelTypes.isBooleanLiteral(expr)) {
      return {
        value: expr.value,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // Variable - low confidence
    if (babelTypes.isIdentifier(expr)) {
      return {
        value: true, // Assume true for presence
        loc: toSourceLocation(attr.loc),
        confidence: 'low',
      };
    }
  }

  return null;
}

/**
 * Extract a numeric prop value from a JSX element.
 */
function extractNumericProp(
  node: babelTypes.JSXElement,
  propName: string
): ExtractedProp<number> | null {
  const attr = findAttribute(node, propName);
  if (!attr) return null;

  // String that's numeric: width="100"
  if (babelTypes.isStringLiteral(attr.value)) {
    const num = parseFloat(attr.value.value);
    if (!isNaN(num)) {
      return {
        value: num,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }
  }

  // Expression container: width={100}
  if (babelTypes.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;

    if (babelTypes.isNumericLiteral(expr)) {
      return {
        value: expr.value,
        loc: toSourceLocation(attr.loc),
        confidence: 'high',
      };
    }

    // Variable - cannot determine value
    return null;
  }

  return null;
}

/**
 * Extract text content from JSX children.
 */
function extractJsxTextChildren(node: babelTypes.JSXElement): ExtractedText[] {
  const texts: ExtractedText[] = [];

  for (const child of node.children) {
    if (babelTypes.isJSXText(child)) {
      const trimmed = child.value.trim();
      if (trimmed) {
        texts.push({
          text: trimmed,
          loc: toSourceLocation(child.loc),
          confidence: 'high',
        });
      }
    }

    // Expression container with string literal
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
 * Find a JSX attribute by name.
 */
function findAttribute(node: babelTypes.JSXElement, name: string): babelTypes.JSXAttribute | null {
  for (const attr of node.openingElement.attributes) {
    if (babelTypes.isJSXAttribute(attr) && babelTypes.isJSXIdentifier(attr.name) && attr.name.name === name) {
      return attr;
    }
  }
  return null;
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

// =============================================================================
// VUETIFY-SPECIFIC HELPERS
// =============================================================================

/**
 * Map Vuetify color names to hex values.
 *
 * WHY: Vuetify uses semantic color names like "primary", "success".
 * We map these to approximate hex values for design extraction.
 */
export const VUETIFY_COLOR_MAP: Record<string, string> = {
  // Primary palette
  primary: '#1976D2',
  secondary: '#424242',
  accent: '#82B1FF',

  // Semantic colors
  success: '#4CAF50',
  error: '#FF5252',
  warning: '#FB8C00',
  info: '#2196F3',

  // Material colors (subset)
  red: '#F44336',
  pink: '#E91E63',
  purple: '#9C27B0',
  'deep-purple': '#673AB7',
  indigo: '#3F51B5',
  blue: '#2196F3',
  'light-blue': '#03A9F4',
  cyan: '#00BCD4',
  teal: '#009688',
  green: '#4CAF50',
  'light-green': '#8BC34A',
  lime: '#CDDC39',
  yellow: '#FFEB3B',
  amber: '#FFC107',
  orange: '#FF9800',
  'deep-orange': '#FF5722',
  brown: '#795548',
  'blue-grey': '#607D8B',
  grey: '#9E9E9E',
};

/**
 * Convert a Vuetify color name to hex.
 * Returns null if not a known Vuetify color.
 */
export function vuetifyColorToHex(color: string): string | null {
  // Already a hex color
  if (color.startsWith('#')) {
    return color;
  }

  // Check if it's a Vuetify color name
  const lowerColor = color.toLowerCase();
  return VUETIFY_COLOR_MAP[lowerColor] ?? null;
}

/**
 * Map Vuetify size prop to approximate height in pixels.
 */
function vuetifySizeToHeight(size: string): number | null {
  const SIZE_MAP: Record<string, number> = {
    'x-small': 20,
    small: 28,
    default: 36,
    large: 44,
    'x-large': 52,
  };
  return SIZE_MAP[size.toLowerCase()] ?? null;
}

/**
 * Get overall confidence for a semantic extraction.
 */
function getOverallConfidence(semantics: Partial<ComponentSemanticIntent>): ConfidenceLevel {
  // Check for any low confidence values
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
 * Create an empty adapter result.
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
