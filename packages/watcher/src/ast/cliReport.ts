#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - ast/cliReport.ts
 *
 * CLI tool for generating AST-based analysis reports.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher ast:report <file>
 *
 * This tool:
 * 1. Reads the specified file
 * 2. Parses @figma markers (existing regex parser)
 * 3. Loads design overrides from design-overrides.json
 * 4. Runs AST analyzer + anchoring
 * 5. Prints a diff report showing mismatches
 *
 * Output sections:
 * - Marker Summary: nodes and their text/fill values from markers
 * - AST Anchored Summary: node → component → extracted literals
 * - Diff: JSX vs Marker and JSX vs Overrides mismatches
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkers, type MarkerData } from '../parse/parseIntentFromReact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { loadComponentMap } from '../reconcile/componentMap.js';
import { parseIntentFromReactAst, anchorMarkersToAst, runAdaptersOnFile } from './parseIntentFromReactAst.js';
import {
  generateSuggestions,
  type SuggestionResult,
} from '../adapters/suggestions/componentMapSuggestions.js';
import type { AnchoredAstReport, Anchor } from './types.js';
import type { DesignOverrides, DesignOverride } from '../reconcile/types.js';
import type { FileAdapterResult } from './parseIntentFromReactAst.js';
import {
  resolveCanonicalSemantics,
  buildCoverageReport,
} from '../canonicalResolver/index.js';
import {
  getResolutionPolicyFromEnv,
  applyPolicyToResolution,
  formatPolicy,
} from '../canonicalResolverPolicy/index.js';
import {
  generateFigmaSuggestions,
  type FigmaSuggestionResult,
  type FigmaSuggestionInput,
} from '../figmaSuggestions/index.js';
import type { CanonicalSemantics } from '../tokens/canonical/types.js';
import type { CanonicalResolution, CoverageReport } from '../canonicalResolver/types.js';
import {
  generateDeltas,
  type BatchDeltaInput,
  type BatchDeltaOutput,
  type DeltaInput,
} from '../figmaDelta/index.js';
import {
  generateDeltaSuggestions,
  writeSuggestionArtifact,
  type SuggestInput,
  type SuggestOutput,
} from '../figmaDeltaSuggest/index.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 * Computed relative to this file's location.
 */
function getRepoRoot(): string {
  // This file is at packages/watcher/src/ast/cliReport.ts
  // Repo root is 4 directories up
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// TYPES
// =============================================================================

interface MarkerSummaryEntry {
  nodeName: string;
  line: number;
  text?: string;
  fill?: string;
}

interface DiffEntry {
  nodeName: string;
  field: 'text' | 'fill';
  source: string;
  target: string;
  sourceValue: string | undefined;
  targetValue: string | undefined;
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Compare JSX values with marker values for a single anchor.
 */
function diffJsxVsMarker(
  anchor: Anchor,
  markerEntry: MarkerSummaryEntry | undefined
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  if (!markerEntry) return diffs;
  if (!anchor.componentName) return diffs;

  // Compare text
  if (markerEntry.text !== undefined && anchor.extracted.text) {
    const jsxTexts = anchor.extracted.text;
    // Check if marker text appears in any JSX text
    const markerTextLower = markerEntry.text.toLowerCase();
    const hasMatch = jsxTexts.some((t) => t.toLowerCase().includes(markerTextLower));
    
    if (!hasMatch) {
      diffs.push({
        nodeName: anchor.nodeName,
        field: 'text',
        source: 'JSX',
        target: 'Marker',
        sourceValue: jsxTexts.join(' | '),
        targetValue: markerEntry.text,
      });
    }
  }

  // Compare fill
  if (markerEntry.fill !== undefined && anchor.extracted.fills) {
    const jsxFills = anchor.extracted.fills.map((f) => f.toLowerCase());
    const markerFill = markerEntry.fill.toLowerCase();
    
    if (!jsxFills.includes(markerFill)) {
      diffs.push({
        nodeName: anchor.nodeName,
        field: 'fill',
        source: 'JSX',
        target: 'Marker',
        sourceValue: anchor.extracted.fills.join(' | '),
        targetValue: markerEntry.fill,
      });
    }
  }

  return diffs;
}

/**
 * Compare JSX values with override values for a single anchor.
 */
function diffJsxVsOverrides(
  anchor: Anchor,
  override: DesignOverride | undefined
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  if (!override) return diffs;
  if (!anchor.componentName) return diffs;

  // Compare text
  if (override.text !== undefined && anchor.extracted.text) {
    const jsxTexts = anchor.extracted.text;
    const overrideTextLower = override.text.toLowerCase();
    const hasMatch = jsxTexts.some((t) => t.toLowerCase().includes(overrideTextLower));
    
    if (!hasMatch) {
      diffs.push({
        nodeName: anchor.nodeName,
        field: 'text',
        source: 'JSX',
        target: 'Override',
        sourceValue: jsxTexts.join(' | '),
        targetValue: override.text,
      });
    }
  }

  // Compare fill
  if (override.fill !== undefined && anchor.extracted.fills) {
    const jsxFills = anchor.extracted.fills.map((f) => f.toLowerCase());
    const overrideFill = override.fill.toLowerCase();
    
    if (!jsxFills.includes(overrideFill)) {
      diffs.push({
        nodeName: anchor.nodeName,
        field: 'fill',
        source: 'JSX',
        target: 'Override',
        sourceValue: anchor.extracted.fills.join(' | '),
        targetValue: override.fill,
      });
    }
  }

  return diffs;
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

function printHeader(title: string): void {
  console.log();
  console.log('='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function printMarkerSummary(markers: MarkerSummaryEntry[]): void {
  printHeader('MARKER SUMMARY');
  
  if (markers.length === 0) {
    console.log('  (no @figma markers found)');
    return;
  }

  for (const m of markers) {
    console.log(`  [L${m.line}] ${m.nodeName}`);
    if (m.text) console.log(`    text: "${m.text}"`);
    if (m.fill) console.log(`    fill: ${m.fill}`);
  }
}

function printAnchoredSummary(anchored: AnchoredAstReport): void {
  printHeader('AST ANCHORED SUMMARY');
  
  if (anchored.anchors.length === 0) {
    console.log('  (no anchors)');
    return;
  }

  for (const anchor of anchored.anchors) {
    console.log(`  [L${anchor.markerLine}] ${anchor.nodeName}`);
    
    if (anchor.componentName) {
      console.log(`    → ${anchor.componentName} (L${anchor.componentLoc?.startLine}-${anchor.componentLoc?.endLine})`);
    }
    
    if (anchor.extracted.text && anchor.extracted.text.length > 0) {
      console.log(`    text: [${anchor.extracted.text.map((t) => `"${t}"`).join(', ')}]`);
    }
    
    if (anchor.extracted.fills && anchor.extracted.fills.length > 0) {
      console.log(`    fills: [${anchor.extracted.fills.join(', ')}]`);
    }

    // Print semantic intent (Phase 6B)
    const sem = anchor.extracted.semantics;
    if (sem) {
      // Text semantics
      if (sem.text.placeholder) {
        console.log(`    placeholder: "${sem.text.placeholder.value}"`);
      }
      if (sem.text.title) {
        console.log(`    title: "${sem.text.title.value}"`);
      }
      if (sem.text.ariaLabel) {
        console.log(`    aria-label: "${sem.text.ariaLabel.value}"`);
      }
      if (sem.text.alt) {
        console.log(`    alt: "${sem.text.alt.value}"`);
      }

      // Boolean semantics
      if (sem.booleans.disabled !== undefined) {
        console.log(`    disabled: ${sem.booleans.disabled.value}`);
      }
      if (sem.booleans.checked !== undefined) {
        console.log(`    checked: ${sem.booleans.checked.value}`);
      }
      if (sem.booleans.selected !== undefined) {
        console.log(`    selected: ${sem.booleans.selected.value}`);
      }

      // Layout semantics
      const layoutParts: string[] = [];
      if (sem.layout.width) layoutParts.push(`width=${sem.layout.width.value}`);
      if (sem.layout.height) layoutParts.push(`height=${sem.layout.height.value}`);
      if (sem.layout.padding) layoutParts.push(`padding=${sem.layout.padding.value}`);
      if (sem.layout.margin) layoutParts.push(`margin=${sem.layout.margin.value}`);
      if (sem.layout.gap) layoutParts.push(`gap=${sem.layout.gap.value}`);
      if (layoutParts.length > 0) {
        console.log(`    layout: { ${layoutParts.join(', ')} }`);
      }

      // Flex semantics
      const flexParts: string[] = [];
      if (sem.flex.display) flexParts.push(`display=${sem.flex.display.value}`);
      if (sem.flex.flexDirection) flexParts.push(`flexDirection=${sem.flex.flexDirection.value}`);
      if (sem.flex.justifyContent) flexParts.push(`justifyContent=${sem.flex.justifyContent.value}`);
      if (sem.flex.alignItems) flexParts.push(`alignItems=${sem.flex.alignItems.value}`);
      if (flexParts.length > 0) {
        console.log(`    flex: { ${flexParts.join(', ')} }`);
      }
    }
    
    for (const note of anchor.notes) {
      console.log(`    ⚠ ${note}`);
    }
  }
}

function printOverridesSummary(overrides: DesignOverrides | null): void {
  printHeader('DESIGN OVERRIDES');
  
  if (!overrides) {
    console.log('  (no design-overrides.json found)');
    return;
  }

  const keys = Object.keys(overrides);
  if (keys.length === 0) {
    console.log('  (empty)');
    return;
  }

  for (const key of keys) {
    const ov = overrides[key];
    console.log(`  ${key}`);
    if (ov.text) console.log(`    text: "${ov.text}"`);
    if (ov.fill) console.log(`    fill: ${ov.fill}`);
    console.log(`    nodeId: ${ov.nodeId}`);
    console.log(`    lastUpdated: ${ov.lastUpdated}`);
  }
}

function printDiffSection(
  title: string,
  diffs: DiffEntry[]
): void {
  printHeader(title);
  
  if (diffs.length === 0) {
    console.log('  ✓ No mismatches');
    return;
  }

  for (const diff of diffs) {
    console.log(`  ✗ ${diff.nodeName}.${diff.field}`);
    console.log(`    ${diff.source}: ${diff.sourceValue ?? '(none)'}`);
    console.log(`    ${diff.target}: ${diff.targetValue ?? '(none)'}`);
  }
}

/**
 * Print adapter extraction results (Phase 10A).
 */
function printAdapterSummary(adapterResult: FileAdapterResult): void {
  printHeader('ADAPTER SEMANTICS (Phase 10A)');

  if (adapterResult.totalContributions === 0) {
    console.log('  (no adapter matches)');
    return;
  }

  for (const comp of adapterResult.components) {
    if (!comp.hasAdapterMatch) continue;

    console.log(`  ${comp.componentName}`);

    for (const contrib of comp.contributions) {
      console.log(`    [${contrib.displayName}] ${contrib.provenance.reason ?? 'extracted'}`);

      // Show fields set by this adapter
      for (const field of contrib.fieldsSet) {
        console.log(`      → ${field}`);
      }

      // Show framework metadata if available
      if (contrib.frameworkMetadata) {
        const meta = contrib.frameworkMetadata;
        const metaParts: string[] = [];
        if (meta.component) metaParts.push(`component=${meta.component}`);
        if (meta.vuetifyColor) metaParts.push(`vuetifyColor=${meta.vuetifyColor}`);
        if (meta.variant) metaParts.push(`variant=${meta.variant}`);
        if (meta.size) metaParts.push(`size=${meta.size}`);
        if (meta.elevation) metaParts.push(`elevation=${meta.elevation}`);
        if (metaParts.length > 0) {
          console.log(`      metadata: { ${metaParts.join(', ')} }`);
        }
      }
    }

    // Show merged semantics for this component
    const sem = comp.mergedSemantics;
    const textContent = sem.text?.content?.map((c) => c.value).join(', ');
    const fills = sem.visual?.fills?.map((f) => f.value).join(', ');

    if (textContent) {
      console.log(`      text: "${textContent}"`);
    }
    if (fills) {
      console.log(`      fills: ${fills}`);
    }
    if (sem.booleans?.disabled !== undefined) {
      console.log(`      disabled: ${sem.booleans.disabled.value}`);
    }
  }

  console.log();
  console.log(`  Total adapter contributions: ${adapterResult.totalContributions}`);
}

/**
 * Print canonical semantics summary (Phase 10E).
 *
 * READ-ONLY: Shows design-system-agnostic semantic tokens normalized from
 * adapter and generic JSX semantics.
 */
function printCanonicalSummary(adapterResult: FileAdapterResult): void {
  printHeader('CANONICAL SEMANTICS (Phase 10E)');

  const summary = adapterResult.canonicalSummary;
  if (!summary || (summary.totalCanonicalFields === 0 && summary.totalRawFields === 0)) {
    console.log('  (no semantic fields to normalize)');
    return;
  }

  // Print per-component canonical semantics
  for (const comp of adapterResult.components) {
    const canonical = comp.canonicalSemantics;
    const notes = comp.canonicalNotes ?? [];

    // Skip if no canonical data
    if (!canonical?.colors && !canonical?.spacing && !canonical?.radius && !canonical?.typography) {
      continue;
    }

    console.log(`  ${comp.componentName}:`);

    // Color semantics
    if (canonical.colors?.fill) {
      const fill = canonical.colors.fill;
      console.log(`    fill: ${fill.value} (confidence=${fill.confidence}, source=${fill.source})`);
      if (fill.rawValue && fill.rawValue !== fill.value) {
        console.log(`      raw: ${fill.rawValue}`);
      }
    }

    // Spacing semantics
    if (canonical.spacing) {
      if (canonical.spacing.gap) {
        const gap = canonical.spacing.gap;
        console.log(`    gap: ${gap.value} (confidence=${gap.confidence}, source=${gap.source})`);
      }
      if (canonical.spacing.padding) {
        const padding = canonical.spacing.padding;
        console.log(`    padding: ${padding.value} (confidence=${padding.confidence}, source=${padding.source})`);
      }
      if (canonical.spacing.margin) {
        const margin = canonical.spacing.margin;
        console.log(`    margin: ${margin.value} (confidence=${margin.confidence}, source=${margin.source})`);
      }
    }

    // Radius semantics
    if (canonical.radius?.borderRadius) {
      const radius = canonical.radius.borderRadius;
      console.log(`    borderRadius: ${radius.value} (confidence=${radius.confidence}, source=${radius.source})`);
    }

    // Typography semantics
    if (canonical.typography) {
      if (canonical.typography.fontSize) {
        const fontSize = canonical.typography.fontSize;
        console.log(`    fontSize: ${fontSize.value} (confidence=${fontSize.confidence}, source=${fontSize.source})`);
      }
      if (canonical.typography.fontWeight) {
        const fontWeight = canonical.typography.fontWeight;
        console.log(`    fontWeight: ${fontWeight.value} (confidence=${fontWeight.confidence}, source=${fontWeight.source})`);
      }
    }

    // Print notes for this component
    if (notes.length > 0) {
      console.log('    Notes:');
      for (const note of notes) {
        console.log(`      ⚠ ${note.type}: ${note.detail}`);
      }
    }
  }

  // Print file-level summary
  console.log();
  console.log(`  Summary: ${summary.totalCanonicalFields} canonical fields, ${summary.totalRawFields} raw fields, ${summary.totalNotes} notes`);
}

/**
 * Print canonical resolution and coverage report (Phase 10F + 10G policy).
 *
 * READ-ONLY: This section shows how canonical tokens resolve to concrete
 * design system values (hex colors, pixel values) and coverage statistics.
 * Also shows policy mode and any violations (Phase 10G).
 */
function printResolutionSummary(adapterResult: FileAdapterResult): void {
  printHeader('CANONICAL RESOLUTION (Phase 10F/10G)');

  // Get policy from environment
  const policy = getResolutionPolicyFromEnv();
  console.log(`  Policy: ${formatPolicy(policy)}`);
  console.log();

  // Track totals across all components
  let totalResolved = 0;
  let totalUnresolved = 0;
  let hasAnyResolution = false;
  const allViolations: Array<{ component: string; canonical: string; reason: string }> = [];

  for (const comp of adapterResult.components) {
    const canonical = comp.canonicalSemantics;

    // Skip if no canonical data
    if (!canonical) {
      continue;
    }

    // Resolve canonical semantics
    const resolution = resolveCanonicalSemantics(canonical);

    // Check if there's any resolution data
    const hasData = Object.keys(resolution.colors).length > 0 ||
      Object.keys(resolution.spacing).length > 0 ||
      Object.keys(resolution.radius).length > 0 ||
      Object.keys(resolution.typography).length > 0;

    if (!hasData) {
      continue;
    }

    hasAnyResolution = true;
    console.log(`  ${comp.componentName}:`);

    // Print resolved colors
    for (const [field, value] of Object.entries(resolution.colors)) {
      const status = value.resolved !== undefined ? `→ ${value.resolved}` : '→ (unresolved)';
      console.log(`    ${field}: ${value.canonical} ${status}`);
      if (value.note) {
        console.log(`      ⚠ ${value.note}`);
      }
    }

    // Print resolved spacing
    for (const [field, value] of Object.entries(resolution.spacing)) {
      const status = value.resolved !== undefined ? `→ ${value.resolved}px` : '→ (unresolved)';
      console.log(`    ${field}: ${value.canonical} ${status}`);
      if (value.note) {
        console.log(`      ⚠ ${value.note}`);
      }
    }

    // Print resolved radius
    for (const [field, value] of Object.entries(resolution.radius)) {
      const status = value.resolved !== undefined ? `→ ${value.resolved}px` : '→ (unresolved)';
      console.log(`    ${field}: ${value.canonical} ${status}`);
      if (value.note) {
        console.log(`      ⚠ ${value.note}`);
      }
    }

    // Print resolved typography
    for (const [field, value] of Object.entries(resolution.typography)) {
      let status = '→ (unresolved)';
      if (value.resolved !== undefined) {
        const parts: string[] = [];
        if (value.resolved.fontSize !== undefined) {
          parts.push(`fontSize: ${value.resolved.fontSize}px`);
        }
        if (value.resolved.fontWeight !== undefined) {
          parts.push(`fontWeight: ${value.resolved.fontWeight}`);
        }
        status = `→ { ${parts.join(', ')} }`;
      }
      console.log(`    ${field}: ${value.canonical} ${status}`);
      if (value.note) {
        console.log(`      ⚠ ${value.note}`);
      }
    }

    // Build coverage report for this component
    const coverage = buildCoverageReport(resolution);
    totalResolved += coverage.totals.resolved;
    totalUnresolved += coverage.totals.unresolved;

    // Apply policy and collect violations (Phase 10G)
    const policyResult = applyPolicyToResolution(resolution, policy, {
      componentKey: comp.componentName,
    });
    for (const v of policyResult.violations) {
      allViolations.push({
        component: comp.componentName,
        canonical: v.canonical,
        reason: v.reason,
      });
    }
  }

  if (!hasAnyResolution) {
    console.log('  (no canonical tokens to resolve)');
    return;
  }

  // Print overall coverage
  console.log();
  const total = totalResolved + totalUnresolved;
  const percent = total > 0 ? Math.round((totalResolved / total) * 100) : 100;
  console.log(`  Coverage: ${totalResolved}/${total} resolved (${percent}%)`);

  // Print violations if strict mode or any exist
  if (allViolations.length > 0) {
    console.log();
    console.log(`  Policy Violations (${allViolations.length}):`);
    for (const v of allViolations.slice(0, 5)) {
      console.log(`    [${v.component}] ${v.canonical}: ${v.reason}`);
    }
    if (allViolations.length > 5) {
      console.log(`    ... and ${allViolations.length - 5} more`);
    }
    if (policy.strict) {
      console.log();
      console.log('  ⛔ strict mode: these violations would fail CI');
    }
  }
}

/**
 * Print component map suggestions (Phase 10C).
 *
 * READ-ONLY: This section shows suggestions for component-map.json entries
 * but does NOT write any files. Users must manually add entries if desired.
 */
function printSuggestionsSummary(suggestionResult: SuggestionResult): void {
  printHeader('COMPONENT MAP SUGGESTIONS (READ-ONLY)');

  console.log('  NOTE: These suggestions are READ-ONLY. To use them, manually');
  console.log('  add entries to component-map.json or use Figma plugin "Send Selection".');
  console.log();

  if (suggestionResult.suggestions.length === 0) {
    console.log('  (no suggestions - no components with stable keys found)');
    return;
  }

  // Print new suggestions first
  const newSuggestions = suggestionResult.suggestions.filter((s) => !s.existsInMap);
  if (newSuggestions.length > 0) {
    console.log('  NEW (not in component-map.json):');
    for (const s of newSuggestions) {
      console.log(`    ${s.componentKey}`);
      console.log(`      → Suggested name: "${s.figmaNameSuggestion}"`);
      if (s.variantStatesSuggested.length > 0) {
        console.log(`      → Variants: [${s.variantStatesSuggested.join(', ')}]`);
      }
      console.log(`      → Source: ${s.source}${s.adapterId ? ` (${s.adapterId})` : ''}`);
      console.log(`      → Reason: ${s.reason}`);
    }
    console.log();
  }

  // Print update suggestions
  const updateSuggestions = suggestionResult.suggestions.filter((s) => s.existsInMap);
  if (updateSuggestions.length > 0) {
    console.log('  EXISTING (already in component-map.json):');
    for (const s of updateSuggestions) {
      console.log(`    ${s.componentKey}`);
      console.log(`      → Current: "${s.currentFigmaName}"`);
      if (s.currentFigmaName !== s.figmaNameSuggestion) {
        console.log(`      → Suggested: "${s.figmaNameSuggestion}" (differs)`);
      }
      if (s.variantStatesSuggested.length > 0) {
        console.log(`      → Detected variants: [${s.variantStatesSuggested.join(', ')}]`);
      }
    }
    console.log();
  }

  // Summary
  console.log(`  Summary: ${suggestionResult.newCount} new, ${suggestionResult.updateCount} existing, ${suggestionResult.skippedCount} skipped`);
}

/**
 * Print Figma composition suggestions (Phase 11A).
 *
 * READ-ONLY: This section shows actionable Figma composition guidance
 * based on canonical semantics. No writes, no mutations.
 */
function printFigmaSuggestionsSummary(result: FigmaSuggestionResult): void {
  printHeader('FIGMA COMPOSITION SUGGESTIONS (Phase 11A)');

  if (result.total === 0) {
    console.log('  (no suggestions generated)');
    return;
  }

  // Group suggestions by type for organized output
  const componentSets = result.suggestions.filter((s) => s.type === 'component-set');
  const variants = result.suggestions.filter((s) => s.type === 'variant');
  const properties = result.suggestions.filter((s) => s.type === 'property');
  const tokenUsage = result.suggestions.filter((s) => s.type === 'token-usage');
  const coverageGaps = result.suggestions.filter((s) => s.type === 'coverage-gap');

  // NEW COMPONENT SET
  if (componentSets.length > 0) {
    console.log('  [NEW COMPONENT SET]');
    for (const s of componentSets) {
      console.log(`    - ${s.figmaNameSuggestion} (${s.componentKey})`);
    }
    console.log();
  }

  // VARIANTS
  if (variants.length > 0) {
    console.log('  [VARIANTS]');
    // Group by componentKey for cleaner output
    const byComponent = new Map<string, string[]>();
    for (const s of variants) {
      const states = byComponent.get(s.componentKey) ?? [];
      const variantState = s.details?.variantState as string | undefined;
      if (variantState) {
        states.push(variantState);
      }
      byComponent.set(s.componentKey, states);
    }
    for (const [componentKey, states] of byComponent) {
      console.log(`    - ${componentKey}: [${states.join(', ')}]`);
    }
    console.log();
  }

  // TOKEN USAGE
  if (tokenUsage.length > 0) {
    console.log('  [TOKEN USAGE]');
    for (const s of tokenUsage.slice(0, 10)) {
      const category = s.details?.category as string | undefined;
      const token = s.details?.canonicalToken as string | undefined;
      const prop = s.details?.figmaProperty as string | undefined;
      console.log(`    - ${prop ?? category} → ${token}`);
    }
    if (tokenUsage.length > 10) {
      console.log(`    ... and ${tokenUsage.length - 10} more`);
    }
    console.log();
  }

  // PROPERTIES
  if (properties.length > 0) {
    console.log('  [PROPERTIES]');
    for (const s of properties.slice(0, 10)) {
      const category = s.details?.category as string | undefined;
      const token = s.details?.canonicalToken as string | undefined;
      const prop = s.details?.figmaProperty as string | undefined;
      console.log(`    - [${s.componentKey}] ${prop ?? category}: ${token}`);
    }
    if (properties.length > 10) {
      console.log(`    ... and ${properties.length - 10} more`);
    }
    console.log();
  }

  // COVERAGE GAPS
  if (coverageGaps.length > 0) {
    console.log('  [COVERAGE GAPS]');
    for (const s of coverageGaps.slice(0, 5)) {
      const canonical = s.details?.canonical as string | undefined;
      const category = s.details?.category as string | undefined;
      console.log(`    - Missing ${category} token for ${canonical ?? 'unknown'}`);
    }
    if (coverageGaps.length > 5) {
      console.log(`    ... and ${coverageGaps.length - 5} more`);
    }
    console.log();
  }

  // Summary by type and source
  console.log(`  Summary: ${result.total} suggestions`);
  console.log(`    By type: ${result.countByType['component-set']} component-sets, ${result.countByType.variant} variants, ${result.countByType.property} properties, ${result.countByType['token-usage']} token-usage, ${result.countByType['coverage-gap']} coverage-gaps`);
  console.log(`    By source: ${result.countBySource.canonical} canonical, ${result.countBySource.adapter} adapter, ${result.countBySource.policy} policy, ${result.countBySource.coverage} coverage`);
}

/**
 * Print Figma → Code deltas (Phase 12A).
 *
 * READ-ONLY: This section shows detected changes in Figma relative to
 * the known baseline from code/canonical resolution.
 *
 * NOTE: This is analysis only. No writes to code, markers, or overrides.
 */
function printFigmaDeltaSummary(deltaOutput: BatchDeltaOutput): void {
  printHeader('FIGMA → CODE DELTAS (Phase 12A)');

  if (deltaOutput.summary.totalDeltas === 0) {
    console.log('  (no deltas detected)');
    return;
  }

  // Print deltas grouped by component::state
  for (const result of deltaOutput.results) {
    if (result.deltas.length === 0) {
      continue;
    }

    console.log(`  - ${result.componentKey}::${result.state}`);

    for (const delta of result.deltas) {
      // Format: property: from → to (canonicalFrom → canonicalTo)
      const fromStr = delta.from !== undefined ? String(delta.from) : '(none)';
      const toStr = String(delta.to);
      
      let canonicalInfo = '';
      if (delta.canonicalFrom || delta.canonicalTo) {
        const cfrom = delta.canonicalFrom ?? '?';
        const cto = delta.canonicalTo ?? '?';
        canonicalInfo = ` (${cfrom} → ${cto})`;
      }

      console.log(`    ${delta.property}: ${fromStr} → ${toStr}${canonicalInfo}`);

      // Print normalization note if present
      if (delta.normalizationNote) {
        console.log(`      ⚠ ${delta.normalizationNote}`);
      }
    }
  }

  // Print summary
  console.log();
  console.log(`  Summary: ${deltaOutput.summary.totalDeltas} deltas across ${deltaOutput.summary.variantsWithDeltas} variants`);

  // Print by property counts
  const propCounts = Object.entries(deltaOutput.summary.deltasByProperty)
    .filter(([, count]) => count > 0)
    .map(([prop, count]) => `${prop}: ${count}`)
    .join(', ');
  if (propCounts) {
    console.log(`    By property: ${propCounts}`);
  }

  // Print by confidence counts
  const confCounts = Object.entries(deltaOutput.summary.deltasByConfidence)
    .filter(([, count]) => count > 0)
    .map(([conf, count]) => `${conf}: ${count}`)
    .join(', ');
  if (confCounts) {
    console.log(`    By confidence: ${confCounts}`);
  }
}

/**
 * Print Figma delta suggestions (Phase 12B).
 *
 * READ-ONLY: This section shows where each delta should land:
 * - AST: Direct code write (literal values only)
 * - marker: Update existing @figma comment
 * - override: Update design-overrides.json
 * - none: Blocked (manual intervention required)
 *
 * NOTE: This is analysis only. No writes to code, markers, or overrides.
 */
function printDeltaSuggestionsSummary(
  suggestionOutput: SuggestOutput,
  artifactPath: string | null
): void {
  printHeader('FIGMA DELTA SUGGESTIONS (Phase 12B)');

  if (suggestionOutput.suggestions.length === 0) {
    console.log('  (no suggestions - no deltas to process)');
    return;
  }

  // Group suggestions by state, then by property
  const byState = new Map<string, typeof suggestionOutput.suggestions>();
  for (const suggestion of suggestionOutput.suggestions) {
    const key = `${suggestion.componentKey}::${suggestion.targetState}`;
    const group = byState.get(key) ?? [];
    group.push(suggestion);
    byState.set(key, group);
  }

  // Print suggestions grouped by component::state
  for (const [key, suggestions] of byState) {
    console.log(`  - ${key}`);

    for (const s of suggestions) {
      // Format target with icon
      const targetIcon =
        s.suggestedTarget === 'ast'
          ? '📝'
          : s.suggestedTarget === 'marker'
            ? '💬'
            : s.suggestedTarget === 'override'
              ? '📦'
              : '🚫';

      // Format delta values
      const fromStr = s.fromRaw !== undefined ? String(s.fromRaw) : '(none)';
      const toStr = String(s.toRaw);

      console.log(
        `    ${targetIcon} ${s.property}: ${fromStr} → ${toStr} [target: ${s.suggestedTarget}]`
      );

      // Print reason if blocked
      if (s.suggestedTarget === 'none') {
        console.log(`      ⚠ ${s.reason}`);
      }

      // Print evidence hints
      if (s.evidence.overrideKey) {
        console.log(`      via override: ${s.evidence.overrideKey}`);
      }
      if (s.evidence.markerLine) {
        console.log(`      via marker L${s.evidence.markerLine}`);
      }
      if (s.evidence.astLoc) {
        console.log(
          `      via AST L${s.evidence.astLoc.startLine}-${s.evidence.astLoc.endLine}`
        );
      }
      if (s.evidence.canonicalPolicyNotes) {
        console.log(`      note: ${s.evidence.canonicalPolicyNotes}`);
      }
    }
  }

  // Print summary
  console.log();
  console.log(`  Summary: ${suggestionOutput.summary.total} suggestions`);

  // By target
  const targetCounts = Object.entries(suggestionOutput.summary.byTarget)
    .filter(([, count]) => count > 0)
    .map(([target, count]) => `${target}: ${count}`)
    .join(', ');
  if (targetCounts) {
    console.log(`    By target: ${targetCounts}`);
  }

  // By property
  const propCounts = Object.entries(suggestionOutput.summary.byProperty)
    .filter(([, count]) => count > 0)
    .map(([prop, count]) => `${prop}: ${count}`)
    .join(', ');
  if (propCounts) {
    console.log(`    By property: ${propCounts}`);
  }

  // Print artifact path
  if (artifactPath) {
    console.log();
    console.log(`  Artifact: ${artifactPath}`);
  }
}

// =============================================================================
// MAIN CLI
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher ast:report <file>');
    console.error('Example: pnpm --filter @aesthetic-function/watcher ast:report demo-app/src/App.tsx');
    process.exit(1);
  }

  const inputPath = args[0];
  const repoRoot = getRepoRoot();
  
  // Resolve path relative to repo root (not cwd, which may be packages/watcher)
  const absolutePath = resolve(repoRoot, inputPath);
  const relativePath = relative(repoRoot, absolutePath);

  // Read file
  let code: string;
  try {
    code = await readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${absolutePath}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('AST REPORT');
  console.log(`File: ${relativePath}`);

  // Parse markers (also used for explicit state extraction in 10C)
  const markers: MarkerData[] = extractMarkers(code);
  const markerSummary = markers.map((m) => ({
    nodeName: m.node,
    line: m.lineNumber,
    text: m.text,
    fill: m.fill,
  }));

  // Parse AST and anchor
  const astReport = parseIntentFromReactAst(code, relativePath);
  const anchoredReport = anchorMarkersToAst(code, relativePath, astReport);

  // Run adapters (Phase 10A)
  const adapterResult = runAdaptersOnFile(code, relativePath, astReport);

  // Load overrides
  const overrides = await loadDesignOverrides();

  // Load component map (Phase 10C)
  const componentMap = await loadComponentMap();

  // Generate component map suggestions (Phase 10C - READ-ONLY)
  // Pass markers and overrides for explicit-only variant state extraction
  const suggestionResult = generateSuggestions(
    anchoredReport,
    adapterResult,
    componentMap,
    markers,
    overrides
  );

  // Build data structures for Phase 11A Figma suggestions
  // 1. Canonical semantics map (componentKey → CanonicalSemantics)
  const canonicalSemanticsMap = new Map<string, CanonicalSemantics>();
  // 2. Resolution map (componentKey → CanonicalResolution)
  const resolutionMap = new Map<string, CanonicalResolution>();
  // 3. Aggregate coverage report
  let aggregateCoverage: CoverageReport | undefined;

  const policy = getResolutionPolicyFromEnv();
  const allPolicyViolations: Array<{
    canonical: string;
    category: 'colors' | 'spacing' | 'radius' | 'typography';
    reason: string;
    componentKey?: string;
  }> = [];

  for (const comp of adapterResult.components) {
    const componentKey = comp.componentName; // Use componentName as key
    if (!componentKey || !comp.canonicalSemantics) continue;

    // Store canonical semantics
    canonicalSemanticsMap.set(componentKey, comp.canonicalSemantics);

    // Resolve and store resolution
    const resolution = resolveCanonicalSemantics(comp.canonicalSemantics);
    resolutionMap.set(componentKey, resolution);

    // Build coverage (use last one as aggregate, or merge if needed)
    aggregateCoverage = buildCoverageReport(resolution);

    // Collect policy violations
    const policyResult = applyPolicyToResolution(resolution, policy, {
      componentKey,
    });
    for (const v of policyResult.violations) {
      allPolicyViolations.push({
        canonical: v.canonical,
        category: v.category,
        reason: v.reason,
        componentKey: v.componentKey,
      });
    }
  }

  // 4. Explicit variant states from markers and overrides
  const explicitVariantStates = new Map<string, string[]>();

  // From markers: @figma state=X
  for (const marker of markers) {
    if (marker.state) {
      const componentKey = marker.node;
      const states = explicitVariantStates.get(componentKey) ?? [];
      if (!states.includes(marker.state)) {
        states.push(marker.state);
      }
      explicitVariantStates.set(componentKey, states);
    }
  }

  // From overrides: keys with ::state pattern
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      if (key.includes('::')) {
        const [componentKey, state] = key.split('::');
        const states = explicitVariantStates.get(componentKey) ?? [];
        if (!states.includes(state)) {
          states.push(state);
        }
        explicitVariantStates.set(componentKey, states);
      }
    }
  }

  // Generate Figma composition suggestions (Phase 11A - READ-ONLY)
  const figmaSuggestionInput: FigmaSuggestionInput = {
    anchoredReport,
    adapterResult,
    canonicalSemantics: canonicalSemanticsMap,
    canonicalResolution: resolutionMap,
    coverageReport: aggregateCoverage,
    policyViolations: allPolicyViolations,
    componentMap: componentMap ?? { version: 2, components: {} },
    explicitVariantStates,
  };
  const figmaSuggestionResult = generateFigmaSuggestions(figmaSuggestionInput);

  // Build marker lookup
  const markerByNode = new Map<string, MarkerSummaryEntry>();
  for (const m of markerSummary) {
    markerByNode.set(m.nodeName, m);
  }

  // Compute diffs
  const jsxVsMarkerDiffs: DiffEntry[] = [];
  const jsxVsOverridesDiffs: DiffEntry[] = [];

  for (const anchor of anchoredReport.anchors) {
    // JSX vs Marker
    const marker = markerByNode.get(anchor.nodeName);
    jsxVsMarkerDiffs.push(...diffJsxVsMarker(anchor, marker));

    // JSX vs Overrides
    const override = overrides?.[anchor.nodeName];
    jsxVsOverridesDiffs.push(...diffJsxVsOverrides(anchor, override));
  }

  // Generate Figma → Code deltas (Phase 12A - READ-ONLY)
  // Build delta inputs from canonical resolution (baseline) vs design-overrides (Figma state)
  const deltaInputs: DeltaInput[] = [];

  // For each component in component-map with overrides, detect deltas
  if (componentMap && overrides) {
    for (const [componentKey, entry] of Object.entries(componentMap.components)) {
      // Get variants from component-map
      const variants = entry.figma?.variants ?? {};
      const componentSetNodeId = entry.figma?.componentSetNodeId;

      for (const [state, variantMapping] of Object.entries(variants)) {
        const nodeId = variantMapping.nodeId;

        // Skip if nodeId matches Component Set (invalid target)
        if (componentSetNodeId && nodeId === componentSetNodeId) {
          continue;
        }

        // Get override - check both "Component" and "Component::base" for base state
        let override = overrides[`${componentKey}::${state}`];
        if (!override && state === 'base') {
          override = overrides[componentKey];
        }

        // Get baseline from canonical resolution
        const resolution = resolutionMap.get(componentKey);

        // Build baseline from resolution
        const baseline: DeltaInput['baseline'] = {};
        if (resolution?.colors.fill?.resolved) {
          baseline.fill = {
            raw: resolution.colors.fill.resolved,
            canonical: resolution.colors.fill.canonical,
            source: 'canonical-resolution',
          };
        }

        // Build Figma state from override
        const figmaState: DeltaInput['figmaState'] = {};
        if (override?.fill) {
          figmaState.fill = {
            raw: override.fill,
            isExplicit: true,
          };
        }
        if (override?.layout?.padding !== undefined) {
          figmaState.padding = {
            raw: override.layout.padding,
            isExplicit: true,
          };
        }
        if (override?.layout?.gap !== undefined) {
          figmaState.gap = {
            raw: override.layout.gap,
            isExplicit: true,
          };
        }

        // Only add if there's Figma state to compare
        if (Object.keys(figmaState).length > 0) {
          deltaInputs.push({
            componentKey,
            state,
            nodeId,
            baseline,
            figmaState,
          });
        }
      }
    }
  }

  const deltaInput: BatchDeltaInput = {
    sourceFile: relativePath,
    inputs: deltaInputs,
  };
  const deltaOutput = generateDeltas(deltaInput);

  // Generate Figma delta suggestions (Phase 12B - READ-ONLY)
  // Build suggestion input from delta output and available context
  const suggestInput: SuggestInput = {
    filePath: relativePath,
    componentMap: componentMap ?? { version: 2, components: {} },
    markers,
    overrides,
    deltas: deltaOutput.results,
    // Note: writeFeasibility would enable AST write suggestions for base state
    // but we don't have it wired up in cliReport yet
  };
  const suggestionOutput = generateDeltaSuggestions(suggestInput);

  // Write suggestion artifact
  let suggestionArtifactPath: string | null = null;
  if (suggestionOutput.suggestions.length > 0) {
    suggestionArtifactPath = await writeSuggestionArtifact(
      suggestionOutput,
      relativePath
    );
  }

  // Print sections
  printMarkerSummary(markerSummary);
  printAnchoredSummary(anchoredReport);
  printAdapterSummary(adapterResult);
  printCanonicalSummary(adapterResult);
  printResolutionSummary(adapterResult);
  printSuggestionsSummary(suggestionResult);
  printFigmaSuggestionsSummary(figmaSuggestionResult);
  printFigmaDeltaSummary(deltaOutput);
  printDeltaSuggestionsSummary(suggestionOutput, suggestionArtifactPath);
  printOverridesSummary(overrides);
  printDiffSection('DIFF: JSX vs MARKER', jsxVsMarkerDiffs);
  printDiffSection('DIFF: JSX vs OVERRIDES', jsxVsOverridesDiffs);

  console.log();
  console.log(`Summary: ${markerSummary.length} markers, ${astReport.components.length} components, ${jsxVsMarkerDiffs.length + jsxVsOverridesDiffs.length} mismatches, ${suggestionResult.newCount} new suggestions`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
