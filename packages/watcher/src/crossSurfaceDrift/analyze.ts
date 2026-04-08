/**
 * @aesthetic-function/watcher - crossSurfaceDrift/analyze.ts
 *
 * Phase 16C: Cross-Surface Drift Analysis Engine.
 *
 * WHY: When AF has component data from multiple surfaces (Figma, Storybook,
 * code AST), this engine compares them and reports parity gaps. This is a
 * SEPARATE read-only pass — it does NOT modify reconciliation resolution.
 *
 * The existing precedence stack (override > marker > ast > code) is frozen
 * at Phase 14F. Cross-surface comparison runs AFTER reconciliation and
 * produces an informational report, not a precedence layer.
 */

import type {
  CrossSurfaceDriftReport,
  DriftFinding,
  DriftSeverity,
  DriftConfidence,
  SurfaceSnapshot,
  SurfaceProp,
  DriftAnalysisOptions,
} from '@aesthetic-function/shared/crossSurfaceDrift';
import type { StorybookComponentMeta, StorybookProp } from '@aesthetic-function/shared/storybookAdapter';
import type { NormalizedDesignComponent } from '../designAdapter/types.js';

// =============================================================================
// CORE ANALYSIS
// =============================================================================

/**
 * Input data for the code surface (from AST analysis).
 */
export interface CodeSurfaceData {
  /** Prop names found in the component's TypeScript/JSX */
  props: string[];
  /** Variant values (from union types, e.g., 'primary' | 'secondary') */
  variants: string[];
}

/**
 * Analyze cross-surface drift for a single component.
 *
 * Compares component data from up to three surfaces:
 * - Figma (design) — from FigmaConsoleMCPAdapter
 * - Storybook (code-adjacent) — from StorybookMCPAdapter
 * - Code (AST) — from watcher's AST analysis
 *
 * Returns findings about where surfaces disagree.
 */
export function analyzeCrossSurfaceDrift(
  componentName: string,
  figmaData: NormalizedDesignComponent | null,
  storybookData: StorybookComponentMeta | null,
  codeData: CodeSurfaceData | null,
  options?: DriftAnalysisOptions,
): CrossSurfaceDriftReport {
  const findings: DriftFinding[] = [];
  const now = new Date().toISOString();

  // Determine which surfaces were queried.
  // If caller provides queriedSurfaces, use that. Otherwise derive from
  // non-null data params (backward compat for direct callers).
  const queriedSurfaces: ('figma' | 'storybook' | 'code')[] =
    options?.queriedSurfaces ?? [
      ...(figmaData ? ['figma' as const] : []),
      ...(storybookData ? ['storybook' as const] : []),
      ...(codeData ? ['code' as const] : []),
    ];

  // Build surface snapshots
  const surfaces: CrossSurfaceDriftReport['surfaces'] = {};

  if (figmaData) {
    surfaces.figma = buildFigmaSnapshot(figmaData);
  } else if (queriedSurfaces.includes('figma')) {
    // Figma was queried but returned no data — record an empty snapshot
    // so the surface is visible in the report.
    surfaces.figma = buildEmptySnapshot('figma-console-mcp', componentName);
  }
  if (storybookData) {
    surfaces.storybook = buildStorybookSnapshot(storybookData);
  } else if (queriedSurfaces.includes('storybook')) {
    surfaces.storybook = buildEmptySnapshot('storybook-mcp', componentName);
  }
  if (codeData) {
    surfaces.code = buildCodeSnapshot(componentName, codeData);
  } else if (queriedSurfaces.includes('code')) {
    surfaces.code = buildEmptySnapshot('code-ast', componentName);
  }

  // Run comparisons
  findings.push(...compareComponentPresence(componentName, surfaces, queriedSurfaces));
  findings.push(...comparePropInventory(surfaces));
  findings.push(
    ...compareVariantCoverage(surfaces, storybookData, options),
  );

  // Compute severity (highest finding wins)
  const severity = computeOverallSeverity(findings);

  return {
    componentName,
    surfaces,
    findings,
    severity,
    queriedSurfaces,
    analyzedAt: now,
  };
}

// =============================================================================
// SNAPSHOT BUILDERS
// =============================================================================

/**
 * Build an empty snapshot for a surface that was queried but returned no data.
 * This ensures the surface appears in the report's surfaces map.
 */
function buildEmptySnapshot(source: string, componentName: string): SurfaceSnapshot {
  return {
    source,
    componentName,
    props: [],
    variants: [],
    lastObserved: new Date().toISOString(),
  };
}

function buildFigmaSnapshot(data: NormalizedDesignComponent): SurfaceSnapshot {
  const props: SurfaceProp[] = [];
  const variants: string[] = [];

  // Extract structured metadata from componentPropertyDefinitions
  // This is the canonical source for variant axes and text properties
  if (data.componentPropertyDefinitions) {
    for (const [key, def] of Object.entries(data.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT' && def.variantOptions) {
        props.push({ name: key, type: 'VARIANT', values: def.variantOptions });
        for (const option of def.variantOptions) {
          if (!variants.includes(option)) variants.push(option);
        }
      } else if (def.type === 'TEXT') {
        // Clean "Text#id" → "Text" style names
        const cleanName = key.replace(/#\d+:\d+$/, '').trim();
        props.push({ name: cleanName, type: 'TEXT' });
      } else if (def.type === 'BOOLEAN') {
        props.push({ name: key, type: 'BOOLEAN' });
      } else if (def.type === 'INSTANCE_SWAP') {
        props.push({ name: key, type: 'INSTANCE_SWAP' });
      }
    }
  }

  // Supplemental: extract variants from normalized children (if CPD didn't provide them)
  if (data.variants && variants.length === 0) {
    for (const variant of data.variants) {
      variants.push(variant.name);
    }
  }

  // Supplemental: extract state-based props from normalized variants.
  // Skip when CPD already provided a VARIANT prop (avoids duplicate "State"/"state").
  const hasVariantPropFromCPD = props.some(p => p.type === 'VARIANT');
  if (data.variants && !hasVariantPropFromCPD) {
    for (const variant of data.variants) {
      if (variant.state && !props.some(p => p.name === 'state')) {
        const stateValues = data.variants.map(v => v.state).filter(Boolean);
        props.push({ name: 'state', values: stateValues });
        break;
      }
    }
  }

  // Extract property-based props (fills, cornerRadius, etc.)
  if (data.properties) {
    for (const key of Object.keys(data.properties)) {
      const value = data.properties[key as keyof typeof data.properties];
      if (value !== undefined && !props.some(p => p.name === key)) {
        props.push({ name: key, type: typeof value === 'string' ? value : undefined });
      }
    }
  }

  return {
    source: 'figma-console-mcp',
    componentName: data.name,
    props: deduplicateProps(props),
    variants,
    lastObserved: new Date().toISOString(),
  };
}

function buildStorybookSnapshot(data: StorybookComponentMeta): SurfaceSnapshot {
  const props: SurfaceProp[] = data.props.map(p => ({
    name: p.name,
    type: p.type,
    values: extractUnionValues(p.type),
  }));

  const variants: string[] = [];
  for (const story of data.stories) {
    if (story.variantAxes) {
      for (const value of Object.values(story.variantAxes)) {
        if (!variants.includes(value)) {
          variants.push(value);
        }
      }
    }
  }

  // Fallback: if no variant axes were inferred but stories exist, use story
  // names as variant candidates. This captures common patterns where stories
  // like "Default" and "Hover" represent variant values even without
  // reactDocgen prop data to match against.
  const SKIP_STORY_NAMES = new Set(['docs', 'overview', 'page', 'playground', 'template']);
  if (variants.length === 0 && data.stories.length > 0) {
    for (const story of data.stories) {
      const normalized = story.name.toLowerCase().trim();
      if (!SKIP_STORY_NAMES.has(normalized) && !variants.includes(story.name)) {
        variants.push(story.name);
      }
    }
  }

  return {
    source: 'storybook-mcp',
    componentName: data.name,
    props: deduplicateProps(props),
    variants,
    lastObserved: new Date().toISOString(),
  };
}

function buildCodeSnapshot(name: string, data: CodeSurfaceData): SurfaceSnapshot {
  return {
    source: 'code-ast',
    componentName: name,
    props: data.props.map(p => ({ name: p })),
    variants: data.variants,
    lastObserved: new Date().toISOString(),
  };
}

// =============================================================================
// COMPARISON FUNCTIONS
// =============================================================================

/**
 * Check if the component exists in all available surfaces.
 *
 * Uses queriedSurfaces to distinguish "not checked" from "checked, not found".
 * A surface that was queried but has an empty snapshot (no props, no variants)
 * is treated as "component not found in that surface".
 * A surface that was NOT queried never generates a missing-in-X finding.
 */
function compareComponentPresence(
  componentName: string,
  surfaces: CrossSurfaceDriftReport['surfaces'],
  queriedSurfaces: ('figma' | 'storybook' | 'code')[],
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // A surface counts as "has data" when it was queried AND has props or variants.
  // An empty snapshot (queried, no data) means the component wasn't found there.
  const figmaQueried = queriedSurfaces.includes('figma');
  const storybookQueried = queriedSurfaces.includes('storybook');
  const codeQueried = queriedSurfaces.includes('code');

  const figmaHasData = surfaces.figma != null &&
    (surfaces.figma.props.length > 0 || surfaces.figma.variants.length > 0);
  const storybookHasData = surfaces.storybook != null &&
    (surfaces.storybook.props.length > 0 || surfaces.storybook.variants.length > 0);
  const codeHasData = surfaces.code != null &&
    (surfaces.code.props.length > 0 || surfaces.code.variants.length > 0);

  // Need at least 2 queried surfaces to compare
  const queriedCount = [figmaQueried, storybookQueried, codeQueried].filter(Boolean).length;
  if (queriedCount < 2) {
    return findings;
  }

  // missing-in-figma: only when figma was queried but has no data,
  // AND at least one other queried surface has data
  if (figmaQueried && !figmaHasData && (storybookHasData || codeHasData)) {
    findings.push({
      field: 'component',
      type: 'missing-in-figma',
      severity: 'warn',
      message: `Component "${componentName}" exists in ${storybookHasData ? 'Storybook' : 'Code'} but not found in Figma`,
      storybookValue: storybookHasData ? componentName : undefined,
      codeValue: !storybookHasData && codeHasData ? componentName : undefined,
      confidence: 'high',
    });
  }

  // missing-in-storybook: only when storybook was queried but has no data
  if (storybookQueried && !storybookHasData && (figmaHasData || codeHasData)) {
    findings.push({
      field: 'component',
      type: 'missing-in-storybook',
      severity: 'info',
      message: `Component "${componentName}" exists in ${figmaHasData ? 'Figma' : 'Code'} but not found in Storybook`,
      figmaValue: figmaHasData ? componentName : undefined,
      codeValue: !figmaHasData && codeHasData ? componentName : undefined,
      confidence: 'high',
    });
  }

  // missing-in-code: only when code was queried but has no data
  if (codeQueried && !codeHasData && (figmaHasData || storybookHasData)) {
    findings.push({
      field: 'component',
      type: 'missing-in-code',
      severity: 'warn',
      message: `Component "${componentName}" exists in design surfaces but not found in code`,
      confidence: 'high',
    });
  }

  return findings;
}

/**
 * Compare prop names across surfaces.
 */
function comparePropInventory(
  surfaces: CrossSurfaceDriftReport['surfaces'],
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // Collect all prop names from each surface
  const figmaProps = new Set(
    surfaces.figma?.props.map(p => p.name.toLowerCase()) ?? [],
  );
  const storybookProps = new Set(
    surfaces.storybook?.props.map(p => p.name.toLowerCase()) ?? [],
  );
  const codeProps = new Set(
    surfaces.code?.props.map(p => p.name.toLowerCase()) ?? [],
  );

  // Find props in Storybook but not in Figma
  if (surfaces.storybook && surfaces.figma) {
    for (const prop of storybookProps) {
      if (!figmaProps.has(prop)) {
        findings.push({
          field: `prop:${prop}`,
          type: 'missing-in-figma',
          severity: 'info',
          message: `Prop "${prop}" present in Storybook but not in Figma component properties`,
          storybookValue: prop,
          confidence: 'high',
        });
      }
    }
  }

  // Find props in Figma but not in Storybook
  if (surfaces.figma && surfaces.storybook) {
    for (const prop of figmaProps) {
      if (!storybookProps.has(prop)) {
        findings.push({
          field: `prop:${prop}`,
          type: 'missing-in-storybook',
          severity: 'info',
          message: `Prop "${prop}" present in Figma but not in Storybook`,
          figmaValue: prop,
          confidence: 'high',
        });
      }
    }
  }

  // Find props in code but not in Figma
  if (surfaces.code && surfaces.figma) {
    for (const prop of codeProps) {
      if (!figmaProps.has(prop) && !storybookProps.has(prop)) {
        findings.push({
          field: `prop:${prop}`,
          type: 'missing-in-figma',
          severity: 'info',
          message: `Prop "${prop}" present in Code but not in Figma or Storybook`,
          codeValue: prop,
          confidence: 'high',
        });
      }
    }
  }

  return findings;
}

/**
 * Compare variant coverage across surfaces.
 * Uses corroboration rules to filter noise from decorative stories.
 */
function compareVariantCoverage(
  surfaces: CrossSurfaceDriftReport['surfaces'],
  storybookData: StorybookComponentMeta | null,
  options?: DriftAnalysisOptions,
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  if (!surfaces.storybook || !storybookData) return findings;

  // Collect Figma variant values (case-normalized)
  const figmaVariants = new Set(
    (surfaces.figma?.variants ?? []).map(v => v.toLowerCase()),
  );

  // Collect code variant values (case-normalized)
  const codeVariants = new Set(
    (surfaces.code?.variants ?? []).map(v => v.toLowerCase()),
  );

  // Process each Storybook story's variant axes
  for (const story of storybookData.stories) {
    if (!story.variantAxes) continue;

    for (const [propName, value] of Object.entries(story.variantAxes)) {
      // Corroboration check: does the prop exist in the component?
      const matchingProp = storybookData.props.find(
        p => p.name.toLowerCase() === propName.toLowerCase(),
      );

      if (!matchingProp) {
        // Uncorroborated: story claims a variant axis but no matching prop
        if (options?.includeUncorroborated) {
          findings.push({
            field: `variant:${propName}:${value}`,
            type: 'missing-in-figma',
            severity: 'info',
            message: `Story "${story.name}" has uncorroborated variant axis {${propName}: "${value}"} — no matching prop in component manifest`,
            storybookValue: value,
            storyRef: story.id,
            confidence: 'low',
          });
        }
        continue;
      }

      // Determine confidence based on prop type
      const confidence = determineConfidence(matchingProp, value);

      // Check if Figma has this variant
      const normalizedValue = value.toLowerCase();
      if (surfaces.figma && !figmaVariants.has(normalizedValue)) {
        findings.push({
          field: `variant:${propName}:${value}`,
          type: 'missing-in-figma',
          severity: 'warn',
          message: `Storybook has ${propName}="${value}" but Figma is missing this variant`,
          storybookValue: value,
          storyRef: story.id,
          confidence,
        });
      }

      // Check if code has this variant
      if (surfaces.code && !codeVariants.has(normalizedValue)) {
        findings.push({
          field: `variant:${propName}:${value}`,
          type: 'missing-in-code',
          severity: 'info',
          message: `Storybook has ${propName}="${value}" but not found in code variants`,
          storybookValue: value,
          storyRef: story.id,
          confidence,
        });
      }
    }
  }

  // Check Figma variants missing from Storybook
  if (surfaces.figma) {
    const storybookVariantValues = new Set<string>();
    for (const story of storybookData.stories) {
      if (story.variantAxes) {
        for (const value of Object.values(story.variantAxes)) {
          storybookVariantValues.add(value.toLowerCase());
        }
      }
    }

    for (const variant of surfaces.figma.variants) {
      if (!storybookVariantValues.has(variant.toLowerCase())) {
        findings.push({
          field: `variant:${variant}`,
          type: 'missing-in-storybook',
          severity: 'info',
          message: `Figma has variant "${variant}" but no matching Storybook story found`,
          figmaValue: variant,
          confidence: 'high',
        });
      }
    }
  }

  return findings;
}

// =============================================================================
// CORROBORATION HELPERS
// =============================================================================

/**
 * Determine confidence level for a variant finding.
 *
 * - 'high': prop type is a constrained union and the value appears in it
 * - 'low': prop type is unconstrained (e.g., string)
 */
function determineConfidence(prop: StorybookProp, value: string): DriftConfidence {
  const unionValues = extractUnionValues(prop.type);

  if (unionValues.length === 0) {
    // Unconstrained type (e.g., "string", "any")
    return 'low';
  }

  // Check if value appears in the union
  const normalizedValue = value.toLowerCase();
  const found = unionValues.some(v => v.toLowerCase() === normalizedValue);
  return found ? 'high' : 'low';
}

// =============================================================================
// UTILITY HELPERS
// =============================================================================

/**
 * Extract string literal values from a union type.
 * "'primary' | 'secondary' | 'ghost'" → ['primary', 'secondary', 'ghost']
 */
function extractUnionValues(typeStr: string): string[] {
  const matches = typeStr.match(/'([^']+)'/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/'/g, ''));
}

/**
 * Compute the highest severity from a list of findings.
 */
function computeOverallSeverity(findings: DriftFinding[]): DriftSeverity {
  if (findings.length === 0) return 'none';

  const severityOrder: DriftSeverity[] = ['none', 'info', 'warn', 'fail'];
  let highest = 0;

  for (const f of findings) {
    const idx = severityOrder.indexOf(f.severity);
    if (idx > highest) highest = idx;
  }

  return severityOrder[highest];
}

/**
 * Deduplicate props by name (case-insensitive), merging values.
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
    } else {
      map.set(key, { ...prop });
    }
  }
  return Array.from(map.values());
}
