/**
 * @aesthetic-function/watcher - tokens/canonical/normalize.ts
 *
 * Canonical Normalizer (Phase 10E).
 *
 * WHY: This module normalizes adapter-specific and generic JSX semantics
 * into a design-system-agnostic canonical representation. This enables:
 * - Portable Figma component mappings
 * - Cross-adapter comparison
 * - Future MCP-based design token negotiation
 *
 * RULES:
 * - Adapter hints (e.g., "antd:primary") → canonical tokens
 * - Hex colors matching designTokens.ts → canonical tokens
 * - Unknown hex colors → raw value preserved + note
 * - Confidence is preserved from source
 * - Provenance is tracked for each field
 *
 * SCOPE: Read-only normalization. No writes, no mutations.
 */

import type { ComponentSemanticIntent } from '../../ast/types.js';
import type { AdapterResult } from '../../adapters/types.js';
import {
  getDefaultTokenContext,
  hexToTokenName,
  type DesignTokenContext,
} from '../designTokens.js';
import type {
  CanonicalSemantics,
  CanonicalSemanticValue,
  CanonicalColorToken,
  NormalizationNote,
  NormalizationResult,
  CanonicalHintMapper,
  HintMapperEntry,
} from './types.js';

// =============================================================================
// HINT MAPPER REGISTRY
// =============================================================================

/**
 * Registered hint mappers by adapter ID.
 */
const hintMappers: Map<string, CanonicalHintMapper> = new Map();

/**
 * Register a canonical hint mapper for an adapter.
 *
 * WHY: This extensibility hook allows future adapters to add
 * mappings cleanly without touching core logic.
 *
 * @param adapterId - The adapter ID (e.g., "vuetify", "antd")
 * @param mapper - Function that maps adapter hints to canonical tokens
 */
export function registerCanonicalHintMapper(
  adapterId: string,
  mapper: CanonicalHintMapper
): void {
  hintMappers.set(adapterId, mapper);
}

/**
 * Clear all registered hint mappers (for testing).
 */
export function clearHintMappers(): void {
  hintMappers.clear();
}

/**
 * Get all registered hint mappers (for testing/debugging).
 */
export function getHintMappers(): HintMapperEntry[] {
  const entries: HintMapperEntry[] = [];
  for (const [adapterId, mapper] of hintMappers) {
    entries.push({ adapterId, mapper });
  }
  return entries;
}

// =============================================================================
// DEFAULT HINT MAPPERS
// =============================================================================

/**
 * Map Vuetify color names to canonical tokens.
 *
 * Vuetify uses color names like "primary", "success", "error".
 * The adapter already converts these to hex, but if we see the
 * raw Vuetify metadata, we can map directly.
 */
const vuetifyHintMapper: CanonicalHintMapper = (hint: string) => {
  const lower = hint.toLowerCase();

  // Vuetify semantic colors
  const vuetifyMap: Record<string, CanonicalColorToken> = {
    primary: 'color.primary',
    secondary: 'color.secondary',
    accent: 'color.accent',
    success: 'color.success',
    error: 'color.danger',
    warning: 'color.warning',
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
  };

  return vuetifyMap[lower] ?? null;
};

/**
 * Map Ant Design semantic hints to canonical tokens.
 *
 * AntD adapter produces hints like "antd:primary", "antd:danger".
 */
const antdHintMapper: CanonicalHintMapper = (hint: string) => {
  // AntD hints are prefixed with "antd:"
  if (!hint.startsWith('antd:')) {
    return null;
  }

  const type = hint.slice(5).toLowerCase(); // Remove "antd:" prefix

  const antdMap: Record<string, CanonicalColorToken> = {
    primary: 'color.primary',
    default: 'color.neutral.100',
    dashed: 'color.neutral.100',
    text: 'color.neutral.500',
    link: 'color.primary',
    danger: 'color.danger',
    // Tag colors
    'color:red': 'color.red',
    'color:green': 'color.green',
    'color:blue': 'color.blue',
    'color:orange': 'color.orange',
    'color:purple': 'color.purple',
    'color:cyan': 'color.cyan',
  };

  return antdMap[type] ?? null;
};

/**
 * Initialize default hint mappers.
 *
 * Called automatically when normalizing, but can be called
 * explicitly for testing.
 */
export function initializeDefaultHintMappers(): void {
  if (!hintMappers.has('vuetify')) {
    registerCanonicalHintMapper('vuetify', vuetifyHintMapper);
  }
  if (!hintMappers.has('antd')) {
    registerCanonicalHintMapper('antd', antdHintMapper);
  }
}

// =============================================================================
// HEX TO CANONICAL MAPPING
// =============================================================================

/**
 * Map a hex color to a canonical token using design tokens.
 *
 * WHY: Generic JSX extraction produces hex colors. If the hex matches
 * a known design token, we can infer the canonical token.
 *
 * @param hex - Hex color (e.g., "#3B82F6")
 * @param context - Design token context for lookup
 * @returns Canonical token if found, null otherwise
 */
function hexToCanonicalToken(
  hex: string,
  context: DesignTokenContext
): CanonicalColorToken | null {
  const tokenName = hexToTokenName(hex, context);
  if (!tokenName) {
    return null;
  }

  // Map design token names to canonical tokens
  // Token names follow pattern like "Primary/Blue500", "Success/Green500"
  const lowerName = tokenName.toLowerCase();

  if (lowerName.includes('primary') || lowerName.includes('blue500') || lowerName.includes('blue600')) {
    return 'color.primary';
  }
  if (lowerName.includes('success') || lowerName.includes('green500')) {
    return 'color.success';
  }
  if (lowerName.includes('warning') || lowerName.includes('yellow500')) {
    return 'color.warning';
  }
  if (lowerName.includes('error') || lowerName.includes('red500') || lowerName.includes('red600')) {
    return 'color.danger';
  }
  if (lowerName.includes('neutral/gray50') || lowerName.includes('gray50')) {
    return 'color.neutral.50';
  }
  if (lowerName.includes('neutral/gray100') || lowerName.includes('gray100')) {
    return 'color.neutral.100';
  }
  if (lowerName.includes('neutral/gray500') || lowerName.includes('gray500')) {
    return 'color.neutral.500';
  }
  if (lowerName.includes('neutral/gray900') || lowerName.includes('gray900')) {
    return 'color.neutral.900';
  }
  if (lowerName.includes('pure/red')) {
    return 'color.red';
  }
  if (lowerName.includes('pure/green')) {
    return 'color.green';
  }
  if (lowerName.includes('pure/blue')) {
    return 'color.blue';
  }

  return null;
}

// =============================================================================
// SPACING NORMALIZATION
// =============================================================================

/**
 * Map numeric spacing values to canonical tokens.
 *
 * Uses approximate T-shirt sizing based on common design system scales.
 */
function numericToSpacingToken(value: number): string {
  if (value === 0) return 'space.none';
  if (value <= 4) return 'space.xs';
  if (value <= 8) return 'space.sm';
  if (value <= 16) return 'space.md';
  if (value <= 24) return 'space.lg';
  if (value <= 32) return 'space.xl';
  if (value <= 48) return 'space.2xl';
  return 'space.3xl';
}

// =============================================================================
// MAIN NORMALIZER
// =============================================================================

/**
 * Context for normalization.
 */
export interface NormalizationContext {
  /** Adapter results that contributed to the semantics */
  adapters: AdapterResult[];

  /** Optional design token context (uses default if not provided) */
  tokenContext?: DesignTokenContext;
}

/**
 * Normalize component semantic intent to canonical tokens.
 *
 * This is the main entry point for the canonical layer.
 *
 * @param intent - Component semantic intent (from generic JSX + adapters)
 * @param ctx - Normalization context with adapter results
 * @returns Normalized canonical semantics and notes
 */
export function normalizeToCanonical(
  intent: ComponentSemanticIntent,
  ctx: NormalizationContext
): NormalizationResult {
  // Initialize default mappers if not already done
  initializeDefaultHintMappers();

  const tokenContext = ctx.tokenContext ?? getDefaultTokenContext();
  const canonical: CanonicalSemantics = {};
  const notes: NormalizationNote[] = [];
  const sources: string[] = [];

  let canonicalFieldCount = 0;
  let rawFieldCount = 0;

  // ==========================================================================
  // COLOR NORMALIZATION
  // ==========================================================================

  if (intent.visual?.fills && intent.visual.fills.length > 0) {
    const fill = intent.visual.fills[0];
    const rawValue = fill.value;
    let canonicalToken: CanonicalColorToken | null = null;
    let source = 'generic-jsx';

    // First, check if any adapter produced this value
    for (const adapterResult of ctx.adapters) {
      const adapterFills = adapterResult.semantics.visual?.fills;
      if (adapterFills && adapterFills.length > 0) {
        const adapterFill = adapterFills[0];
        source = adapterResult.provenance.adapterId;

        // Try adapter-specific mapper first
        const mapper = hintMappers.get(source);
        if (mapper) {
          canonicalToken = mapper(adapterFill.value);
          if (canonicalToken) {
            if (!sources.includes(source)) {
              sources.push(source);
            }
            break;
          }
        }
      }
    }

    // If no adapter mapping, try to map via Vuetify metadata
    if (!canonicalToken) {
      // Check frameworkMetadata for vuetifyColor
      for (const adapterResult of ctx.adapters) {
        const metadata = adapterResult.frameworkMetadata;
        if (metadata && typeof metadata.vuetifyColor === 'string') {
          const mapper = hintMappers.get('vuetify');
          if (mapper) {
            canonicalToken = mapper(metadata.vuetifyColor);
            if (canonicalToken) {
              source = 'vuetify';
              if (!sources.includes(source)) {
                sources.push(source);
              }
              break;
            }
          }
        }
      }
    }

    // If no adapter mapping, try hex → design token → canonical
    if (!canonicalToken && rawValue.startsWith('#')) {
      canonicalToken = hexToCanonicalToken(rawValue, tokenContext);
      if (canonicalToken) {
        source = 'generic-jsx';
        if (!sources.includes(source)) {
          sources.push(source);
        }
      }
    }

    // If still no mapping, check if it's a raw adapter hint
    if (!canonicalToken && !rawValue.startsWith('#')) {
      // Try all mappers
      for (const [adapterId, mapper] of hintMappers) {
        canonicalToken = mapper(rawValue);
        if (canonicalToken) {
          source = adapterId;
          if (!sources.includes(source)) {
            sources.push(source);
          }
          break;
        }
      }
    }

    // Set the canonical value
    if (canonicalToken) {
      canonical.colors = {
        fill: {
          value: canonicalToken,
          rawValue,
          loc: fill.loc,
          confidence: fill.confidence,
          source,
        },
      };
      canonicalFieldCount++;
    } else {
      // Keep raw value but add note
      if (rawValue.startsWith('#')) {
        notes.push({
          type: 'unmapped_color_hex',
          detail: `Hex color "${rawValue}" not found in design tokens`,
          field: 'colors.fill',
          rawValue,
          source,
        });
      } else {
        notes.push({
          type: 'unmapped_adapter_hint',
          detail: `Adapter hint "${rawValue}" has no canonical mapping`,
          field: 'colors.fill',
          rawValue,
          source,
        });
      }
      rawFieldCount++;
    }
  }

  // ==========================================================================
  // SPACING NORMALIZATION
  // ==========================================================================

  const spacing: Record<string, CanonicalSemanticValue<string>> = {};
  const source = 'generic-jsx';

  if (intent.layout?.gap) {
    const token = numericToSpacingToken(intent.layout.gap.value);
    spacing.gap = {
      value: token,
      rawValue: String(intent.layout.gap.value),
      loc: intent.layout.gap.loc,
      confidence: intent.layout.gap.confidence,
      source,
    };
    canonicalFieldCount++;
    if (!sources.includes(source)) {
      sources.push(source);
    }
  }

  if (intent.layout?.padding) {
    const token = numericToSpacingToken(intent.layout.padding.value);
    spacing.padding = {
      value: token,
      rawValue: String(intent.layout.padding.value),
      loc: intent.layout.padding.loc,
      confidence: intent.layout.padding.confidence,
      source,
    };
    canonicalFieldCount++;
    if (!sources.includes(source)) {
      sources.push(source);
    }
  }

  if (intent.layout?.margin) {
    const token = numericToSpacingToken(intent.layout.margin.value);
    spacing.margin = {
      value: token,
      rawValue: String(intent.layout.margin.value),
      loc: intent.layout.margin.loc,
      confidence: intent.layout.margin.confidence,
      source,
    };
    canonicalFieldCount++;
    if (!sources.includes(source)) {
      sources.push(source);
    }
  }

  if (Object.keys(spacing).length > 0) {
    canonical.spacing = spacing as typeof canonical.spacing;
  }

  // ==========================================================================
  // META
  // ==========================================================================

  canonical.meta = {
    sources,
    canonicalFieldCount,
    rawFieldCount,
  };

  return { canonical, notes };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Normalize a single fill value to canonical token.
 *
 * Useful for testing or when you only need color normalization.
 *
 * @param fillValue - Raw fill value (hex or adapter hint)
 * @param adapterId - Optional adapter ID for hint lookup
 * @param tokenContext - Optional design token context
 * @returns Canonical token or null if unmapped
 */
export function normalizeColorToCanonical(
  fillValue: string,
  adapterId?: string,
  tokenContext?: DesignTokenContext
): CanonicalColorToken | null {
  initializeDefaultHintMappers();

  const context = tokenContext ?? getDefaultTokenContext();

  // Try adapter-specific mapper
  if (adapterId) {
    const mapper = hintMappers.get(adapterId);
    if (mapper) {
      const token = mapper(fillValue);
      if (token) return token;
    }
  }

  // Try all mappers (for hints like "antd:primary")
  for (const [, mapper] of hintMappers) {
    const token = mapper(fillValue);
    if (token) return token;
  }

  // Try hex → design token → canonical
  if (fillValue.startsWith('#')) {
    return hexToCanonicalToken(fillValue, context);
  }

  return null;
}

/**
 * Check if a value is a canonical token (vs raw value).
 */
export function isCanonicalToken(value: string): boolean {
  return value.startsWith('color.') ||
         value.startsWith('space.') ||
         value.startsWith('radius.') ||
         value.startsWith('text.');
}
