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
import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { parseIntentFromReactAst, anchorMarkersToAst } from './parseIntentFromReactAst.js';
import type { AnchoredAstReport, Anchor } from './types.js';
import type { DesignOverrides, DesignOverride } from '../reconcile/types.js';

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
 * Generate marker summary from parsed markers.
 */
function getMarkerSummary(code: string): MarkerSummaryEntry[] {
  const markers = extractMarkers(code);
  return markers.map((m) => ({
    nodeName: m.node,
    line: m.lineNumber,
    text: m.text,
    fill: m.fill,
  }));
}

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

  // Parse markers
  const markerSummary = getMarkerSummary(code);

  // Parse AST and anchor
  const astReport = parseIntentFromReactAst(code, relativePath);
  const anchoredReport = anchorMarkersToAst(code, relativePath, astReport);

  // Load overrides
  const overrides = await loadDesignOverrides();

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

  // Print sections
  printMarkerSummary(markerSummary);
  printAnchoredSummary(anchoredReport);
  printOverridesSummary(overrides);
  printDiffSection('DIFF: JSX vs MARKER', jsxVsMarkerDiffs);
  printDiffSection('DIFF: JSX vs OVERRIDES', jsxVsOverridesDiffs);

  console.log();
  console.log(`Summary: ${markerSummary.length} markers, ${astReport.components.length} components, ${jsxVsMarkerDiffs.length + jsxVsOverridesDiffs.length} mismatches`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
