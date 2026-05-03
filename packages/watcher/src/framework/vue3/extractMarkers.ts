/**
 * @aesthetic-function/watcher - framework/vue3/extractMarkers.ts
 *
 * Marker extraction for Vue 3 SFC files.
 *
 * WHY (answer #6): Vue SFCs have two syntactically distinct comment forms:
 *   - `<template>` — HTML comments: `<!-- @figma node=Foo text="..." -->`
 *   - `<script>` / `<script setup>` — Line comments: `// @figma node=Foo`
 *
 * Both forms use the same attribute grammar as the React marker parser
 * ((\w+)=(?:"([^"]+)"|'([^']+)'|(\S+))). This module re-uses the React
 * `parseAttributes` helper to keep the grammars 100% identical.
 *
 * SCOPE (v1):
 * - Line comments (`// @figma`) in <script>/<script setup>
 * - HTML comments (`<!-- @figma -->`) in <template>
 * - Block comments (block-style @figma) NOT supported (same as React side)
 * - JSDoc (@figma in JSDoc) NOT supported in v1
 *
 * ANCHOR SEMANTICS:
 * - A marker in `<script>` attaches to the next exported component declaration.
 * - A marker in `<template>` attaches to the next element sibling node.
 * - Both conventions mirror the React demo (App.tsx:26-34 uses instance-site markers).
 */

import type { SfcDescriptor } from './parseSfc.js';
import { parseAttributes, isPlaceholderNode } from '../../parse/parseIntentFromReact.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source of the marker within the SFC.
 */
export type MarkerSource = 'script' | 'template';

/**
 * A parsed @figma marker found in a `.vue` file.
 */
export interface VueMarkerData {
  /** Target Figma node name (required). */
  node: string;
  /** Optional text content. */
  text?: string;
  /** Optional fill color (token or hex). */
  fill?: string;
  /** Component state (base | disabled | hover | pressed). */
  state?: 'base' | 'disabled' | 'hover' | 'pressed';
  /** Which SFC block the marker came from. */
  source: MarkerSource;
  /** Line number within the *full SFC file*. */
  lineNumber: number;
  /** Raw marker text for debugging. */
  rawLine: string;
}

// =============================================================================
// REGEX
// =============================================================================

/**
 * Matches `// @figma ...` in script blocks (identical to React parser).
 * Groups: [1] attributes string
 */
const SCRIPT_MARKER_REGEX = /^[ \t]*\/\/\s*@figma\s+(.+)$/gm;

/**
 * Matches `<!-- @figma ... -->` in template blocks.
 * Groups: [1] attributes string
 */
const TEMPLATE_MARKER_REGEX = /<!--\s*@figma\s+([^>]+?)\s*-->/gm;

// =============================================================================
// LINE OFFSET HELPER
// =============================================================================

/**
 * Given a full-file source and an offset within it, return the 1-based line number.
 * Caches newline positions for repeated calls on the same source.
 */
function makeLineResolver(source: string): (offset: number) => number {
  const newlines: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') newlines.push(i);
  }

  return (offset: number): number => {
    let lo = 0;
    let hi = newlines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlines[mid] < offset) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo + 1; // 1-based
  };
}

// =============================================================================
// VALID STATES
// =============================================================================

const VALID_STATES = new Set(['base', 'disabled', 'hover', 'pressed']);

function isValidState(v: string): v is NonNullable<VueMarkerData['state']> {
  return VALID_STATES.has(v);
}

// =============================================================================
// MARKER PARSERS
// =============================================================================

/**
 * Extract markers from a `<script>` or `<script setup>` block.
 *
 * Block content offsets within the full SFC file are used to compute
 * correct line numbers.
 */
function extractScriptMarkers(
  blockContent: string,
  blockStartOffset: number,
  fullSource: string
): VueMarkerData[] {
  const markers: VueMarkerData[] = [];
  const resolveLine = makeLineResolver(fullSource);

  SCRIPT_MARKER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SCRIPT_MARKER_REGEX.exec(blockContent)) !== null) {
    const attrStr = match[1].trim();
    const attrs = parseAttributes(attrStr);

    const nodeVal = attrs['node'];
    if (!nodeVal || isPlaceholderNode(nodeVal)) {
      continue;
    }

    const absoluteOffset = blockStartOffset + match.index;
    const lineNumber = resolveLine(absoluteOffset);

    const stateVal = attrs['state'];

    markers.push({
      node: nodeVal,
      text: attrs['text'],
      fill: attrs['fill'],
      state: stateVal && isValidState(stateVal) ? stateVal : undefined,
      source: 'script',
      lineNumber,
      rawLine: match[0].trim(),
    });
  }

  return markers;
}

/**
 * Extract markers from a `<template>` block.
 */
function extractTemplateMarkers(
  blockContent: string,
  blockStartOffset: number,
  fullSource: string
): VueMarkerData[] {
  const markers: VueMarkerData[] = [];
  const resolveLine = makeLineResolver(fullSource);

  TEMPLATE_MARKER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TEMPLATE_MARKER_REGEX.exec(blockContent)) !== null) {
    const attrStr = match[1].trim();
    const attrs = parseAttributes(attrStr);

    const nodeVal = attrs['node'];
    if (!nodeVal || isPlaceholderNode(nodeVal)) {
      continue;
    }

    const absoluteOffset = blockStartOffset + match.index;
    const lineNumber = resolveLine(absoluteOffset);

    const stateVal = attrs['state'];

    markers.push({
      node: nodeVal,
      text: attrs['text'],
      fill: attrs['fill'],
      state: stateVal && isValidState(stateVal) ? stateVal : undefined,
      source: 'template',
      lineNumber,
      rawLine: match[0].trim(),
    });
  }

  return markers;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract all @figma markers from a parsed SFC descriptor.
 *
 * Markers from `<script>` and `<script setup>` blocks come first (in document
 * order), followed by `<template>` markers. Within each block, markers are
 * returned in source order.
 *
 * @param descriptor - Parsed SFC from `parseSfc()` or `parseSfcSync()`
 * @returns All markers found in the SFC, in source order
 */
export function extractVueMarkers(descriptor: SfcDescriptor): VueMarkerData[] {
  const markers: VueMarkerData[] = [];
  const { source } = descriptor;

  // Script block markers (line comments)
  for (const block of [descriptor.scriptSetup, descriptor.script]) {
    if (block) {
      const blockMarkers = extractScriptMarkers(
        block.content,
        block.range.start,
        source
      );
      markers.push(...blockMarkers);
    }
  }

  // Template block markers (HTML comments)
  if (descriptor.template) {
    const templateMarkers = extractTemplateMarkers(
      descriptor.template.content,
      descriptor.template.range.start,
      source
    );
    markers.push(...templateMarkers);
  }

  // Sort by line number (ascending)
  markers.sort((a, b) => a.lineNumber - b.lineNumber);

  return markers;
}

/**
 * Quick check: does the SFC source contain any @figma markers?
 *
 * Searches both comment forms without full parsing.
 */
export function hasVueMarkers(source: string): boolean {
  return source.includes('@figma');
}
