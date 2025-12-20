/**
 * @aesthetic-function/watcher - canonicalResolver/resolve.ts
 *
 * Canonical → Design System Resolver (Phase 10F).
 *
 * WHY: After Phase 10E normalizes adapter values into canonical tokens,
 * this module resolves those tokens into concrete design system values
 * (hex colors, pixel values, etc.).
 *
 * SCOPE: Read-only analysis + reporting. No writes, no mutations, no emitting ops.
 *
 * DESIGN DECISIONS:
 * - Adapter-agnostic: Works for Vuetify, AntD, generic JSX equally
 * - Deterministic: Same input always produces same output
 * - Gap reporting: Unresolved tokens produce notes, not errors
 */

import type {
  CanonicalSemantics,
  CanonicalSemanticValue,
} from '../tokens/canonical/types.js';
import { getDefaultTokenContext } from '../tokens/designTokens.js';
import type {
  ResolvedValue,
  CanonicalResolution,
  TypographyValue,
  ResolutionMeta,
  CoverageReport,
  CategoryCoverage,
  CoverageGap,
  ResolverContext,
} from './types.js';

// =============================================================================
// DEFAULT SCALES (Fallbacks when not configured)
// =============================================================================

/**
 * Default spacing scale mapping canonical tokens to pixel values.
 * Standard 8-point grid system.
 */
const DEFAULT_SPACING_SCALE: Record<string, number> = {
  'space.none': 0,
  'space.xs': 4,
  'space.sm': 8,
  'space.md': 16,
  'space.lg': 24,
  'space.xl': 32,
  'space.2xl': 48,
  'space.3xl': 64,
};

/**
 * Default radius scale mapping canonical tokens to pixel values.
 */
const DEFAULT_RADIUS_SCALE: Record<string, number> = {
  'radius.none': 0,
  'radius.sm': 4,
  'radius.md': 8,
  'radius.lg': 16,
  'radius.full': 9999,
};

/**
 * Default typography scale mapping canonical tokens to values.
 */
const DEFAULT_TYPOGRAPHY_SCALE: Record<string, TypographyValue> = {
  // Font sizes
  'text.size.xs': { fontSize: 12 },
  'text.size.sm': { fontSize: 14 },
  'text.size.md': { fontSize: 16 },
  'text.size.lg': { fontSize: 18 },
  'text.size.xl': { fontSize: 20 },
  'text.size.2xl': { fontSize: 24 },
  // Font weights
  'text.weight.light': { fontWeight: 300 },
  'text.weight.normal': { fontWeight: 400 },
  'text.weight.medium': { fontWeight: 500 },
  'text.weight.semibold': { fontWeight: 600 },
  'text.weight.bold': { fontWeight: 700 },
};

// =============================================================================
// CANONICAL TOKEN → HEX MAPPING
// =============================================================================

/**
 * Map canonical color tokens to design system token names.
 * This bridges canonical tokens to the MOCK_TOKENS in designTokens.ts.
 */
const CANONICAL_TO_TOKEN_NAME: Record<string, string> = {
  // Primary palette
  'color.primary': 'Primary/Blue500',
  'color.secondary': 'Primary/Blue600',
  'color.accent': 'Primary/Blue700',
  // Semantic colors
  'color.success': 'Success/Green500',
  'color.warning': 'Warning/Yellow500',
  'color.danger': 'Error/Red500',
  'color.error': 'Error/Red600',
  // Neutral colors
  'color.neutral.50': 'Neutral/Gray50',
  'color.neutral.100': 'Neutral/Gray100',
  'color.neutral.500': 'Neutral/Gray500',
  'color.neutral.900': 'Neutral/Gray900',
  // Material colors (mapped to pure colors where available)
  'color.red': 'Pure/Red',
  'color.green': 'Pure/Green',
  'color.blue': 'Pure/Blue',
};

// =============================================================================
// RESOLVER CORE
// =============================================================================

/**
 * Resolve a canonical color token to a hex value.
 *
 * @param canonicalValue - The canonical semantic value containing the token
 * @param context - Resolver context with token lookups
 * @returns Resolved value with provenance
 */
function resolveColor(
  canonicalValue: CanonicalSemanticValue<string>,
  context: ResolverContext,
): ResolvedValue<string> {
  const tokenContext = context.tokenContext ?? getDefaultTokenContext();
  const canonical = canonicalValue.value;

  // Check if it's already a hex value (passthrough)
  if (canonical.startsWith('#')) {
    // Try to find matching token name
    const tokenName = tokenContext.hexToToken.get(canonical.toUpperCase());
    return {
      canonical: tokenName ?? canonical,
      resolved: canonical,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: tokenName ? undefined : 'Raw hex value, no token match',
    };
  }

  // Look up canonical token → design system token name
  const tokenName = CANONICAL_TO_TOKEN_NAME[canonical];
  if (!tokenName) {
    return {
      canonical,
      resolved: undefined,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: `Canonical token "${canonical}" not mapped to design system`,
    };
  }

  // Look up design system token → hex value
  const token = tokenContext.tokens.get(tokenName);
  if (!token) {
    return {
      canonical,
      resolved: undefined,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: `Design token "${tokenName}" not found in token context`,
    };
  }

  return {
    canonical,
    resolved: token.value,
    confidence: canonicalValue.confidence,
    source: canonicalValue.source,
  };
}

/**
 * Resolve a canonical spacing token to a pixel value.
 */
function resolveSpacing(
  canonicalValue: CanonicalSemanticValue<string>,
  context: ResolverContext,
): ResolvedValue<number> {
  const scale = context.spacingScale ?? DEFAULT_SPACING_SCALE;
  const canonical = canonicalValue.value;

  // Check if it's a numeric value already
  const numericMatch = canonical.match(/^(\d+)(px)?$/);
  if (numericMatch) {
    const px = parseInt(numericMatch[1], 10);
    return {
      canonical,
      resolved: px,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: 'Raw numeric value, not a canonical token',
    };
  }

  // Look up in spacing scale
  const resolved = scale[canonical];
  if (resolved === undefined) {
    return {
      canonical,
      resolved: undefined,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: `Spacing token "${canonical}" not found in scale`,
    };
  }

  return {
    canonical,
    resolved,
    confidence: canonicalValue.confidence,
    source: canonicalValue.source,
  };
}

/**
 * Resolve a canonical radius token to a pixel value.
 */
function resolveRadius(
  canonicalValue: CanonicalSemanticValue<string>,
  context: ResolverContext,
): ResolvedValue<number> {
  const scale = context.radiusScale ?? DEFAULT_RADIUS_SCALE;
  const canonical = canonicalValue.value;

  // Check if it's a numeric value already
  const numericMatch = canonical.match(/^(\d+)(px)?$/);
  if (numericMatch) {
    const px = parseInt(numericMatch[1], 10);
    return {
      canonical,
      resolved: px,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: 'Raw numeric value, not a canonical token',
    };
  }

  // Look up in radius scale
  const resolved = scale[canonical];
  if (resolved === undefined) {
    return {
      canonical,
      resolved: undefined,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: `Radius token "${canonical}" not found in scale`,
    };
  }

  return {
    canonical,
    resolved,
    confidence: canonicalValue.confidence,
    source: canonicalValue.source,
  };
}

/**
 * Resolve a canonical typography token to a value.
 */
function resolveTypography(
  canonicalValue: CanonicalSemanticValue<string>,
  context: ResolverContext,
): ResolvedValue<TypographyValue> {
  const scale = context.typographyScale ?? DEFAULT_TYPOGRAPHY_SCALE;
  const canonical = canonicalValue.value;

  // Check if it's a numeric value (font size) or raw weight
  const numericMatch = canonical.match(/^(\d+)(px)?$/);
  if (numericMatch) {
    const value = parseInt(numericMatch[1], 10);
    // Heuristic: values >= 100 are weights, < 100 are sizes
    if (value >= 100) {
      return {
        canonical,
        resolved: { fontWeight: value },
        confidence: canonicalValue.confidence,
        source: canonicalValue.source,
        note: 'Raw numeric weight, not a canonical token',
      };
    } else {
      return {
        canonical,
        resolved: { fontSize: value },
        confidence: canonicalValue.confidence,
        source: canonicalValue.source,
        note: 'Raw numeric size, not a canonical token',
      };
    }
  }

  // Look up in typography scale
  const resolved = scale[canonical];
  if (resolved === undefined) {
    return {
      canonical,
      resolved: undefined,
      confidence: canonicalValue.confidence,
      source: canonicalValue.source,
      note: `Typography token "${canonical}" not found in scale`,
    };
  }

  return {
    canonical,
    resolved,
    confidence: canonicalValue.confidence,
    source: canonicalValue.source,
  };
}

// =============================================================================
// MAIN RESOLVER FUNCTION
// =============================================================================

/**
 * Resolve canonical semantics to concrete design system values.
 *
 * This function maps canonical tokens (e.g., "color.primary", "space.md")
 * to actual values (hex colors, pixel measurements) using the configured
 * token context and scales.
 *
 * @param canonical - The canonical semantics from Phase 10E normalization
 * @param context - Optional resolver context with custom token/scale configuration
 * @returns Complete resolution with all categories and metadata
 */
export function resolveCanonicalSemantics(
  canonical: CanonicalSemantics,
  context: ResolverContext = {},
): CanonicalResolution {
  const colors: Record<string, ResolvedValue<string>> = {};
  const spacing: Record<string, ResolvedValue<number>> = {};
  const radius: Record<string, ResolvedValue<number>> = {};
  const typography: Record<string, ResolvedValue<TypographyValue>> = {};

  let resolvedCount = 0;
  let unresolvedCount = 0;
  let notesCount = 0;

  // Resolve colors
  if (canonical.colors) {
    if (canonical.colors.fill) {
      const resolved = resolveColor(canonical.colors.fill, context);
      colors['fill'] = resolved;
      if (resolved.resolved !== undefined) {
        resolvedCount++;
      } else {
        unresolvedCount++;
      }
      if (resolved.note) {
        notesCount++;
      }
    }
  }

  // Resolve spacing
  if (canonical.spacing) {
    const spacingFields: (keyof typeof canonical.spacing)[] = ['gap', 'padding', 'margin'];
    for (const field of spacingFields) {
      const value = canonical.spacing[field];
      if (value) {
        const resolved = resolveSpacing(value, context);
        spacing[field] = resolved;
        if (resolved.resolved !== undefined) {
          resolvedCount++;
        } else {
          unresolvedCount++;
        }
        if (resolved.note) {
          notesCount++;
        }
      }
    }
  }

  // Resolve radius
  if (canonical.radius) {
    if (canonical.radius.borderRadius) {
      const resolved = resolveRadius(canonical.radius.borderRadius, context);
      radius['borderRadius'] = resolved;
      if (resolved.resolved !== undefined) {
        resolvedCount++;
      } else {
        unresolvedCount++;
      }
      if (resolved.note) {
        notesCount++;
      }
    }
  }

  // Resolve typography
  if (canonical.typography) {
    const typographyFields: (keyof typeof canonical.typography)[] = ['fontSize', 'fontWeight'];
    for (const field of typographyFields) {
      const value = canonical.typography[field];
      if (value) {
        const resolved = resolveTypography(value, context);
        typography[field] = resolved;
        if (resolved.resolved !== undefined) {
          resolvedCount++;
        } else {
          unresolvedCount++;
        }
        if (resolved.note) {
          notesCount++;
        }
      }
    }
  }

  const meta: ResolutionMeta = {
    resolvedCount,
    unresolvedCount,
    notesCount,
  };

  return {
    colors,
    spacing,
    radius,
    typography,
    meta,
  };
}

// =============================================================================
// COVERAGE REPORT
// =============================================================================

/**
 * Build a coverage report from a canonical resolution.
 *
 * The report shows:
 * - How many canonical tokens were successfully resolved
 * - Per-category breakdown
 * - List of all gaps (unresolved tokens)
 *
 * @param resolution - The resolved canonical semantics
 * @returns Coverage report with totals, by-category breakdown, and gaps
 */
export function buildCoverageReport(resolution: CanonicalResolution): CoverageReport {
  const gaps: CoverageGap[] = [];

  // Build per-category coverage
  const buildCategoryCoverage = <T>(
    values: Record<string, ResolvedValue<T>>,
    category: 'colors' | 'spacing' | 'radius' | 'typography',
  ): CategoryCoverage => {
    const entries = Object.entries(values);
    let resolved = 0;
    let unresolved = 0;

    for (const [_field, value] of entries) {
      if (value.resolved !== undefined) {
        resolved++;
      } else {
        unresolved++;
        gaps.push({
          canonical: value.canonical,
          category,
          note: value.note ?? 'No resolution found',
        });
      }
    }

    return {
      canonicalFields: entries.length,
      resolved,
      unresolved,
    };
  };

  const byCategory = {
    colors: buildCategoryCoverage(resolution.colors, 'colors'),
    spacing: buildCategoryCoverage(resolution.spacing, 'spacing'),
    radius: buildCategoryCoverage(resolution.radius, 'radius'),
    typography: buildCategoryCoverage(resolution.typography, 'typography'),
  };

  // Calculate totals
  const totals = {
    canonicalFields:
      byCategory.colors.canonicalFields +
      byCategory.spacing.canonicalFields +
      byCategory.radius.canonicalFields +
      byCategory.typography.canonicalFields,
    resolved:
      byCategory.colors.resolved +
      byCategory.spacing.resolved +
      byCategory.radius.resolved +
      byCategory.typography.resolved,
    unresolved:
      byCategory.colors.unresolved +
      byCategory.spacing.unresolved +
      byCategory.radius.unresolved +
      byCategory.typography.unresolved,
  };

  return {
    totals,
    byCategory,
    gaps,
  };
}

// =============================================================================
// UTILITY: FORMAT FOR CLI
// =============================================================================

/**
 * Format a coverage report as a human-readable string.
 *
 * @param report - Coverage report to format
 * @returns Multi-line string suitable for CLI output
 */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];

  // Header
  lines.push('┌─────────────────────────────────────────────────────────┐');
  lines.push('│                   COVERAGE REPORT                       │');
  lines.push('├─────────────────────────────────────────────────────────┤');

  // Totals
  const percent = report.totals.canonicalFields > 0
    ? Math.round((report.totals.resolved / report.totals.canonicalFields) * 100)
    : 100;
  lines.push(`│ Total: ${report.totals.resolved}/${report.totals.canonicalFields} resolved (${percent}%)`.padEnd(60) + '│');
  lines.push('├─────────────────────────────────────────────────────────┤');

  // By category
  lines.push('│ By Category:'.padEnd(60) + '│');
  const categories: (keyof typeof report.byCategory)[] = ['colors', 'spacing', 'radius', 'typography'];
  for (const cat of categories) {
    const c = report.byCategory[cat];
    if (c.canonicalFields > 0) {
      const catPercent = Math.round((c.resolved / c.canonicalFields) * 100);
      lines.push(`│   ${cat}: ${c.resolved}/${c.canonicalFields} (${catPercent}%)`.padEnd(60) + '│');
    } else {
      lines.push(`│   ${cat}: (none)`.padEnd(60) + '│');
    }
  }

  // Gaps
  if (report.gaps.length > 0) {
    lines.push('├─────────────────────────────────────────────────────────┤');
    lines.push('│ Gaps:'.padEnd(60) + '│');
    for (const gap of report.gaps) {
      const truncatedNote = gap.note.length > 40 ? gap.note.slice(0, 37) + '...' : gap.note;
      lines.push(`│   [${gap.category}] ${gap.canonical}`.padEnd(60) + '│');
      lines.push(`│     → ${truncatedNote}`.padEnd(60) + '│');
    }
  } else {
    lines.push('├─────────────────────────────────────────────────────────┤');
    lines.push('│ ✓ No gaps - all tokens resolved!'.padEnd(60) + '│');
  }

  lines.push('└─────────────────────────────────────────────────────────┘');

  return lines.join('\n');
}
