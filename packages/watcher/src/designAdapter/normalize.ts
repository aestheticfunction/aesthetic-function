/**
 * @aesthetic-function/watcher - designAdapter/normalize.ts
 *
 * Phase 16A: Design Adapter Normalization Layer.
 *
 * WHY: Raw adapter output (Figma MCP, Builder.io, etc.) uses tool-specific
 * formats. This module normalizes that data into AF-compatible structures:
 * - Design tokens → canonical token vocabulary (Phase 10E)
 * - Components → component-map compatible naming
 * - Deterministic ordering for all outputs
 *
 * CONSTRAINTS:
 * - Read-only normalization — no side effects
 * - No raw adapter formats leak into the watcher pipeline
 * - Unknown values are preserved as unmapped, not discarded
 */

import type { DesignTokenValue, DesignComponent } from '@aesthetic-function/shared/designAdapter';
import type {
  CanonicalColorToken,
  CanonicalSpacingToken,
  CanonicalRadiusToken,
  CanonicalTypographyToken,
} from '../tokens/canonical/types.js';
import type {
  NormalizedToken,
  NormalizedDesignTokens,
  NormalizedDesignComponent,
} from './types.js';

// =============================================================================
// COLOR NORMALIZATION
// =============================================================================

/**
 * Known color name → canonical token mappings.
 * Covers common design system naming conventions.
 */
const COLOR_NAME_MAP: Record<string, CanonicalColorToken> = {
  // Primary / brand
  primary: 'color.primary',
  'primary/500': 'color.primary',
  'primary-500': 'color.primary',
  brand: 'color.primary',

  // Secondary
  secondary: 'color.secondary',
  'secondary/500': 'color.secondary',
  'secondary-500': 'color.secondary',

  // Accent
  accent: 'color.accent',

  // Semantic
  success: 'color.success',
  warning: 'color.warning',
  danger: 'color.danger',
  error: 'color.error',
  info: 'color.info',

  // Material colors
  red: 'color.red',
  pink: 'color.pink',
  purple: 'color.purple',
  indigo: 'color.indigo',
  blue: 'color.blue',
  cyan: 'color.cyan',
  teal: 'color.teal',
  green: 'color.green',
  yellow: 'color.yellow',
  amber: 'color.amber',
  orange: 'color.orange',
  brown: 'color.brown',
  grey: 'color.grey',
  gray: 'color.grey',

  // Neutrals
  'neutral/50': 'color.neutral.50',
  'neutral-50': 'color.neutral.50',
  'gray/50': 'color.neutral.50',
  'neutral/100': 'color.neutral.100',
  'neutral-100': 'color.neutral.100',
  'gray/100': 'color.neutral.100',
  'neutral/500': 'color.neutral.500',
  'neutral-500': 'color.neutral.500',
  'gray/500': 'color.neutral.500',
  'neutral/900': 'color.neutral.900',
  'neutral-900': 'color.neutral.900',
  'gray/900': 'color.neutral.900',
};

/**
 * Attempt to classify a color token name into a canonical color token.
 */
function normalizeColorName(name: string): CanonicalColorToken | null {
  const lower = name.toLowerCase().replace(/\s+/g, '');

  // Direct lookup
  if (COLOR_NAME_MAP[lower]) return COLOR_NAME_MAP[lower];

  // Try last segment (e.g., "colors/primary/500" → "primary/500")
  const segments = lower.split('/');
  if (segments.length >= 2) {
    const lastTwo = segments.slice(-2).join('/');
    if (COLOR_NAME_MAP[lastTwo]) return COLOR_NAME_MAP[lastTwo];
    const last = segments[segments.length - 1];
    if (COLOR_NAME_MAP[last]) return COLOR_NAME_MAP[last];
  }

  // Hyphenated form (e.g., "color-primary" → "primary")
  const dashSegments = lower.split('-');
  if (dashSegments.length >= 2) {
    const last = dashSegments[dashSegments.length - 1];
    if (COLOR_NAME_MAP[last]) return COLOR_NAME_MAP[last];
  }

  return null;
}

// =============================================================================
// SPACING NORMALIZATION
// =============================================================================

/**
 * Numeric spacing → canonical spacing token.
 * Uses 8pt grid scale (matching Phase 10E).
 */
function normalizeSpacingValue(value: string): CanonicalSpacingToken | null {
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  if (num === 0) return 'space.none';
  if (num <= 4) return 'space.xs';
  if (num <= 8) return 'space.sm';
  if (num <= 16) return 'space.md';
  if (num <= 24) return 'space.lg';
  if (num <= 32) return 'space.xl';
  if (num <= 48) return 'space.2xl';
  return 'space.3xl';
}

// =============================================================================
// RADIUS NORMALIZATION
// =============================================================================

function normalizeRadiusValue(value: string): CanonicalRadiusToken | null {
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  if (num === 0) return 'radius.none';
  if (num <= 4) return 'radius.sm';
  if (num <= 8) return 'radius.md';
  if (num <= 16) return 'radius.lg';
  return 'radius.full';
}

// =============================================================================
// TYPOGRAPHY NORMALIZATION
// =============================================================================

function normalizeTypographyValue(
  name: string,
  value: string,
): CanonicalTypographyToken | null {
  const lower = name.toLowerCase();

  // Font size
  if (lower.includes('size') || lower.includes('font-size') || lower.includes('fontSize')) {
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    if (num <= 12) return 'text.size.xs';
    if (num <= 14) return 'text.size.sm';
    if (num <= 16) return 'text.size.md';
    if (num <= 20) return 'text.size.lg';
    if (num <= 24) return 'text.size.xl';
    return 'text.size.2xl';
  }

  // Font weight
  if (lower.includes('weight') || lower.includes('font-weight') || lower.includes('fontWeight')) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      if (num <= 300) return 'text.weight.light';
      if (num <= 400) return 'text.weight.normal';
      if (num <= 500) return 'text.weight.medium';
      if (num <= 600) return 'text.weight.semibold';
      return 'text.weight.bold';
    }
    // String values
    const v = value.toLowerCase();
    if (v === 'light' || v === 'thin') return 'text.weight.light';
    if (v === 'normal' || v === 'regular') return 'text.weight.normal';
    if (v === 'medium') return 'text.weight.medium';
    if (v === 'semibold' || v === 'semi-bold') return 'text.weight.semibold';
    if (v === 'bold' || v === 'heavy') return 'text.weight.bold';
  }

  return null;
}

// =============================================================================
// TOKEN NORMALIZATION
// =============================================================================

/**
 * Normalize a single design token to canonical vocabulary.
 */
function normalizeToken(token: DesignTokenValue): NormalizedToken {
  let canonical:
    | CanonicalColorToken
    | CanonicalSpacingToken
    | CanonicalRadiusToken
    | CanonicalTypographyToken
    | null = null;

  switch (token.type) {
    case 'color':
      canonical = normalizeColorName(token.name);
      break;
    case 'spacing':
      canonical = normalizeSpacingValue(token.value);
      break;
    case 'radius':
      canonical = normalizeRadiusValue(token.value);
      break;
    case 'typography':
      canonical = normalizeTypographyValue(token.name, token.value);
      break;
  }

  return {
    originalName: token.name,
    originalValue: token.value,
    canonical,
    resolvedValue: token.value,
    type: token.type,
    mapped: canonical !== null,
  };
}

/**
 * Normalize all design tokens from an adapter into canonical vocabulary.
 *
 * @param tokens - Raw tokens from adapter
 * @param adapterId - Adapter that produced the tokens
 * @param adapterName - Adapter display name
 */
export function normalizeDesignTokens(
  tokens: DesignTokenValue[],
  adapterId: string,
  adapterName: string,
): NormalizedDesignTokens {
  const normalized = tokens.map(normalizeToken);

  // Sort deterministically: by type, then by name
  normalized.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.originalName.localeCompare(b.originalName);
  });

  // Build summary
  const byType: Record<string, number> = {};
  for (const t of normalized) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
  }

  return {
    tokens: normalized,
    summary: {
      total: normalized.length,
      mapped: normalized.filter((t) => t.mapped).length,
      unmapped: normalized.filter((t) => !t.mapped).length,
      byType,
    },
    source: {
      adapterId,
      adapterName,
      extractedAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// COMPONENT NORMALIZATION
// =============================================================================

/**
 * Normalize a design component into component-map compatible structure.
 *
 * Extracts known properties (fills, text, layout) into typed fields.
 * Unknown properties are preserved in unmappedProperties for traceability.
 */
export function normalizeDesignComponent(
  component: DesignComponent,
): NormalizedDesignComponent {
  const props = component.properties ?? {};
  const unmappedProperties: string[] = [];
  const knownKeys = new Set<string>();

  // Extract known properties
  const normalized: NormalizedDesignComponent = {
    name: component.name,
    nodeId: component.id,
    type: component.type,
    properties: {},
    unmappedProperties: [],
  };

  // Fills
  if (Array.isArray(props.fills)) {
    normalized.properties.fills = extractFillColors(props.fills);
    knownKeys.add('fills');
  }

  // Text
  if (typeof props.characters === 'string') {
    normalized.properties.textContent = props.characters;
    knownKeys.add('characters');
  }

  // Typography
  if (typeof props.fontSize === 'number') {
    normalized.properties.fontSize = props.fontSize;
    knownKeys.add('fontSize');
  }
  if (typeof props.fontWeight === 'number') {
    normalized.properties.fontWeight = props.fontWeight;
    knownKeys.add('fontWeight');
  }

  // Layout
  if (typeof props.cornerRadius === 'number') {
    normalized.properties.cornerRadius = props.cornerRadius;
    knownKeys.add('cornerRadius');
  }
  if (typeof props.itemSpacing === 'number') {
    normalized.properties.gap = props.itemSpacing;
    knownKeys.add('itemSpacing');
  }
  if (typeof props.paddingTop === 'number') {
    normalized.properties.padding = {
      top: props.paddingTop as number,
      right: (props.paddingRight as number) ?? 0,
      bottom: (props.paddingBottom as number) ?? 0,
      left: (props.paddingLeft as number) ?? 0,
    };
    knownKeys.add('paddingTop');
    knownKeys.add('paddingRight');
    knownKeys.add('paddingBottom');
    knownKeys.add('paddingLeft');
  }

  // Dimensions
  if (typeof props.width === 'number') {
    normalized.properties.width = props.width;
    knownKeys.add('width');
  }
  if (typeof props.height === 'number') {
    normalized.properties.height = props.height;
    knownKeys.add('height');
  }

  // Track unmapped keys
  for (const key of Object.keys(props)) {
    if (!knownKeys.has(key)) {
      unmappedProperties.push(key);
    }
  }
  normalized.unmappedProperties = unmappedProperties.sort();

  // Normalize variants
  if (component.variants && component.variants.length > 0) {
    normalized.variants = component.variants
      .map((v) => ({
        name: v.name,
        nodeId: v.id,
        state: inferVariantState(v.properties),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return normalized;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract hex colors from Figma fill arrays.
 */
function extractFillColors(fills: unknown[]): string[] {
  const colors: string[] = [];
  for (const fill of fills) {
    if (typeof fill === 'object' && fill !== null) {
      const f = fill as Record<string, unknown>;
      if (f.type === 'SOLID' && typeof f.color === 'object' && f.color !== null) {
        const c = f.color as { r?: number; g?: number; b?: number };
        if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
          const hex = rgbToHex(c.r, c.g, c.b);
          colors.push(hex);
        }
      } else if (typeof f.hex === 'string') {
        colors.push(f.hex);
      }
    }
  }
  return colors;
}

/**
 * Convert Figma RGB (0-1 range) to hex.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.round(Math.max(0, Math.min(1, n)) * 255);
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Infer a component state from variant properties.
 * Maps common Figma variant property conventions to AF state names.
 */
function inferVariantState(properties: Record<string, string>): string {
  const stateKey = Object.keys(properties).find(
    (k) => k.toLowerCase() === 'state' || k.toLowerCase() === 'status',
  );
  if (stateKey) return properties[stateKey].toLowerCase();

  // Check for common property values
  const values = Object.values(properties).map((v) => v.toLowerCase());
  if (values.includes('hover')) return 'hover';
  if (values.includes('pressed') || values.includes('active')) return 'pressed';
  if (values.includes('disabled')) return 'disabled';
  if (values.includes('focused') || values.includes('focus')) return 'focused';

  // Default: join all property values
  return Object.values(properties).join('-').toLowerCase() || 'base';
}
