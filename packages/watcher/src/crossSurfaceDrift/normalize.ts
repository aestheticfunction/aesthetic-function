/**
 * @aesthetic-function/watcher - crossSurfaceDrift/normalize.ts
 *
 * Phase 16D: Pre-comparison normalization layer for cross-surface drift.
 *
 * WHY: Different surfaces use different names for the same concepts.
 * Figma calls a variant axis "State", code calls it "variant". Figma
 * surfaces layout properties (fills, cornerRadius) that aren't API-level
 * props. This creates false-positive drift findings.
 *
 * This module normalizes surface snapshots BEFORE comparison so that
 * equivalent concepts align. It is:
 * - Deterministic (no LLM, no fuzzy matching)
 * - Configurable (alias rules + design-only filter lists)
 * - Explainable (returns metadata about what was changed)
 */

import type {
  SurfaceSnapshot,
  SurfaceProp,
  DriftSurfaceId,
  NormalizationConfig,
  NormalizationMetadata,
} from '@aesthetic-function/shared/crossSurfaceDrift';

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

/**
 * Built-in normalization config for the DemoButton demo and common patterns.
 * Extensible per-project via DriftAnalysisOptions.normalizationConfig.
 */
export const DEFAULT_NORMALIZATION_CONFIG: NormalizationConfig = {
  propAliases: [
    { canonical: 'variant', aliases: ['state', 'variant'] },
    { canonical: 'label', aliases: ['text', 'label'] },
  ],
  designOnlyFields: {
    names: [
      'fills',
      'cornerradius',
      'width',
      'height',
      'padding',
      'gap',
      'fontsize',
      'fontweight',
      'textcontent',
    ],
    strategy: 'exclude',
  },
};

// =============================================================================
// NORMALIZATION RESULT
// =============================================================================

export interface NormalizeSnapshotResult {
  /** The normalized snapshot (mutated in place for efficiency) */
  snapshot: SurfaceSnapshot;
  /** Alias rules that were applied */
  appliedRules: NormalizationMetadata['appliedRules'];
  /** Props that were excluded as design-only */
  excludedProps: NormalizationMetadata['excludedProps'];
}

// =============================================================================
// CORE NORMALIZATION
// =============================================================================

/**
 * Normalize a surface snapshot before drift comparison.
 *
 * Three passes in order:
 * 1. Design-only filtering (Figma only) — remove layout/visual props
 * 2. Alias normalization (all surfaces) — rename equivalent prop names
 * 3. Deduplication — merge props that now share a name after renaming
 */
export function normalizeSnapshot(
  snapshot: SurfaceSnapshot,
  surface: DriftSurfaceId,
  config: NormalizationConfig = DEFAULT_NORMALIZATION_CONFIG,
): NormalizeSnapshotResult {
  const appliedRules: NormalizeSnapshotResult['appliedRules'] = [];
  const excludedProps: NormalizeSnapshotResult['excludedProps'] = [];

  // Build a lowercase lookup: alias → canonical
  const aliasMap = new Map<string, string>();
  for (const rule of config.propAliases) {
    for (const alias of rule.aliases) {
      aliasMap.set(alias.toLowerCase(), rule.canonical);
    }
  }

  // Build design-only name set (lowercased)
  const designOnlyNames = new Set(
    config.designOnlyFields.names.map(n => n.toLowerCase()),
  );

  // Pass 1: Design-only filtering (Figma only, strategy=exclude)
  let props = snapshot.props;
  if (surface === 'figma' && config.designOnlyFields.strategy === 'exclude') {
    const filtered: SurfaceProp[] = [];
    for (const prop of props) {
      if (designOnlyNames.has(prop.name.toLowerCase())) {
        excludedProps.push({
          name: prop.name,
          surface,
          reason: 'design-only',
        });
      } else {
        filtered.push(prop);
      }
    }
    props = filtered;
  }

  // Pass 2: Alias normalization (all surfaces)
  for (const prop of props) {
    const canonical = aliasMap.get(prop.name.toLowerCase());
    if (canonical && prop.name.toLowerCase() !== canonical.toLowerCase()) {
      appliedRules.push({
        originalName: prop.name,
        canonicalName: canonical,
        surface,
      });
      prop.normalizedFrom = prop.name;
      prop.name = canonical;
    }
  }

  // Pass 3: Deduplication (merge props that now share a name)
  props = deduplicateProps(props);

  snapshot.props = props;

  return { snapshot, appliedRules, excludedProps };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deduplicate props by name (case-insensitive), merging values and preserving
 * normalizedFrom from the first occurrence that has it.
 */
function deduplicateProps(props: SurfaceProp[]): SurfaceProp[] {
  const map = new Map<string, SurfaceProp>();
  for (const prop of props) {
    const key = prop.name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      // Merge values
      if (prop.values) {
        existing.values = [...(existing.values ?? []), ...prop.values];
      }
      if (prop.type && !existing.type) {
        existing.type = prop.type;
      }
      // Preserve normalizedFrom if the existing one doesn't have it
      if (prop.normalizedFrom && !existing.normalizedFrom) {
        existing.normalizedFrom = prop.normalizedFrom;
      }
    } else {
      map.set(key, { ...prop });
    }
  }
  return Array.from(map.values());
}
