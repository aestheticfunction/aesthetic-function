/**
 * @aesthetic-function/watcher - framework/vue3/anchorMarkers.ts
 *
 * Anchors @figma markers to their corresponding template elements or
 * script-side component definitions in a Vue 3 SFC.
 *
 * WHY: `anchorMarkersToAst()` in the React module links each `// @figma`
 * comment to the next exported component definition. Vue SFCs have two
 * distinct anchor locations:
 *
 *   - Template markers (`<!-- @figma node=Foo -->`): anchor to the next
 *     sibling element in the template (the one immediately after the comment
 *     in source order).
 *
 *   - Script markers (`// @figma node=Foo`): anchor to the SFC's default
 *     component (since a `.vue` file always has exactly one component).
 *
 * Output: `AnchoredAstReport` — identical shape to the React anchored report,
 * consumed by the reconciliation engine unchanged.
 */

import type { AnchoredAstReport, Anchor, AnchorExtracted, AstIntentReport } from '../../ast/types.js';
import type { SfcDescriptor } from './parseSfc.js';
import type { VueMarkerData } from './extractMarkers.js';
import { extractVueMarkers } from './extractMarkers.js';
import type { AnalyzerOpts } from '../types.js';
import { parseVueAst } from './parseAst.js';

// =============================================================================
// TEMPLATE ELEMENT ASSOCIATION
// =============================================================================

/**
 * A lightweight description of a template element for anchor association.
 */
interface TemplateElementSummary {
  /** Tag name. */
  tag: string;
  /** 1-based line number of the opening tag within the *full SFC source*. */
  lineNumber: number;
}

/**
 * Build a sorted list of template element positions so that a marker can
 * find the "next" element after its line number.
 */
function buildTemplateSummaries(
  templateContent: string,
  templateStartOffset: number,
  fullSource: string
): TemplateElementSummary[] {
  const summaries: TemplateElementSummary[] = [];

  // Count newlines up to `offset` in `fullSource` (1-based line number)
  function lineAt(contentOffset: number): number {
    const absoluteOffset = templateStartOffset + contentOffset;
    let line = 1;
    for (let i = 0; i < absoluteOffset && i < fullSource.length; i++) {
      if (fullSource[i] === '\n') line++;
    }
    return line;
  }

  // Match all opening tags (skip closing tags, skip self-closing special tags)
  const tagRegex = /<([A-Za-z][\w.-]*)([^>]*?)(?:\s*\/?>)/g;
  let m;

  while ((m = tagRegex.exec(templateContent)) !== null) {
    const tag = m[1];
    // Skip Vue built-ins that are never reconciliation targets
    if (['template', 'slot', 'transition', 'keep-alive', 'teleport', 'suspense'].includes(tag)) {
      continue;
    }
    summaries.push({
      tag,
      lineNumber: lineAt(m.index),
    });
  }

  return summaries;
}

/**
 * Find the template element immediately after the marker's line number.
 */
function findNextElement(
  markerLine: number,
  elements: TemplateElementSummary[]
): TemplateElementSummary | undefined {
  return elements.find((el) => el.lineNumber > markerLine);
}

// =============================================================================
// MAIN ANCHOR FUNCTION
// =============================================================================

/**
 * Anchor @figma markers in a Vue SFC to their nearest template element or
 * script-side component definition.
 *
 * @param descriptor - Parsed SFC from parseSfc / parseSfcSync
 * @param astReport  - Pre-computed AST report (optional; computed if absent)
 * @param opts       - Analyzer options
 */
export function anchorVueMarkers(
  descriptor: SfcDescriptor,
  astReport?: AstIntentReport,
  opts: AnalyzerOpts = {}
): AnchoredAstReport {
  const { filePath, source } = descriptor;

  const markers: VueMarkerData[] = extractVueMarkers(descriptor);

  const report = astReport ?? parseVueAst(descriptor, opts);
  const primaryComponent = report.components[0];

  // Build template element summaries for template-marker association.
  const templateSummaries: TemplateElementSummary[] = descriptor.template
    ? buildTemplateSummaries(
        descriptor.template.content,
        descriptor.template.range.start,
        source
      )
    : [];

  const anchors: Anchor[] = markers.map((marker): Anchor => {
    const anchor: Anchor = {
      nodeName: marker.node,
      markerLine: marker.lineNumber,
      extracted: {},
      notes: [],
    };

    if (marker.source === 'script') {
      // Script markers anchor to the SFC's primary component.
      if (!primaryComponent) {
        anchor.notes.push('no component found in script block');
        return anchor;
      }
      anchor.componentName = primaryComponent.componentName;
      anchor.componentKey = primaryComponent.componentKey;
      anchor.componentLoc = primaryComponent.loc;

      const extracted: AnchorExtracted = {};

      const texts = primaryComponent.jsxTextLiterals.map((l) => l.text).filter(Boolean);
      if (texts.length > 0) extracted.text = texts;

      const fills = primaryComponent.inlineStyleLiterals
        .filter((l) => l.styleProp === 'backgroundColor' && /^#[0-9a-f]{3,6}$/i.test(String(l.value)))
        .map((l) => String(l.value));
      if (fills.length > 0) extracted.fills = fills;

      extracted.semantics = primaryComponent.semantics;
      anchor.extracted = extracted;

    } else {
      // Template markers anchor to the next element sibling.
      const nextEl = findNextElement(marker.lineNumber, templateSummaries);

      if (!nextEl) {
        anchor.notes.push('no element found after template marker');
        return anchor;
      }

      // For template markers the "component" is the next element's tag.
      anchor.componentName = nextEl.tag;
      // componentKey uses the SFC's key as a prefix when the tag is a component
      if (primaryComponent && /^[A-Z]/.test(nextEl.tag)) {
        anchor.componentKey = primaryComponent.componentKey;
      }

      const extracted: AnchorExtracted = {};

      // Use the primary component's semantics (best available context).
      if (primaryComponent) {
        extracted.semantics = primaryComponent.semantics;
        const texts = primaryComponent.jsxTextLiterals.map((l) => l.text).filter(Boolean);
        if (texts.length > 0) extracted.text = texts;
        const fills = primaryComponent.inlineStyleLiterals
          .filter((l) => l.styleProp === 'backgroundColor' && /^#[0-9a-f]{3,6}$/i.test(String(l.value)))
          .map((l) => String(l.value));
        if (fills.length > 0) extracted.fills = fills;
      }

      anchor.extracted = extracted;
    }

    return anchor;
  });

  return { filePath, anchors };
}
