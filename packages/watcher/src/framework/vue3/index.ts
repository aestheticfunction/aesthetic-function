/**
 * @aesthetic-function/watcher - framework/vue3/index.ts
 *
 * Vue 3 FrameworkAnalyzer — the single entry point for Vue SFC analysis.
 *
 * WHY: Implements the FrameworkAnalyzer interface so the registry can dispatch
 * `.vue` files here without any knowledge of Vue internals. All Vue-specific
 * logic is contained within this package (`framework/vue3/`).
 *
 * PHASE 1 STATUS: Read-only analyzer. Write-back (magic-string) is gated by
 * the Phase 3 round-trip spike. If that spike fails, `enableWriteBack` remains
 * false and the analyzer is shipped as code-to-design read-only — per answer #8.
 *
 * DESIGN PRINCIPLE: parseIntent() is synchronous in v1. The parseSfc() call
 * inside it uses the synchronous regex-based `parseSfcSync()` fallback when
 * `@vue/compiler-sfc` is unavailable. When the package IS installed, the async
 * `parseSfc()` is used via a pre-loaded cache.
 */

import type { FrameworkAnalyzer, AnalyzerOpts } from '../types.js';
import type { AstIntentReport, AnchoredAstReport } from '../../ast/types.js';
import type { IntentModel } from '../../transform/types.js';

import { parseSfcSync } from './parseSfc.js';
import { extractVueMarkers, hasVueMarkers } from './extractMarkers.js';
import { parseVueAst } from './parseAst.js';
import { anchorVueMarkers } from './anchorMarkers.js';

// =============================================================================
// INTENT MODEL BUILDER
// =============================================================================

/**
 * Convert extracted Vue markers into the watcher's IntentModel.
 *
 * The IntentModel shape (`{ intents, source, timestamp }`) is identical to
 * the one produced by the React analyzer. The reconciliation engine consumes
 * it unchanged.
 */
function buildIntentModelFromMarkers(
  markers: ReturnType<typeof extractVueMarkers>,
  filePath: string
): IntentModel {
  // Convert VueMarkerData → Intent (ButtonIntent / TextIntent) using
  // the same transformation the React side applies via markerToIntent().
  //
  // WHY: We replicate the logic rather than calling markerToIntent() directly
  // because VueMarkerData has a different shape (source, lineNumber) but the
  // same semantic fields (node, text, fill, state).
  const intents: IntentModel['intents'] = [];

  for (const marker of markers) {
    const { node, text, fill, state } = marker;

    if (!node) continue;

    if (fill) {
      intents.push({
        type: 'BUTTON',
        nodeName: node,
        fillTokenOrHex: fill,
        text,
        state: state ?? 'base',
      });
    } else if (text) {
      intents.push({
        type: 'TEXT',
        nodeName: node,
        characters: text,
        state: state ?? 'base',
      });
    }
    // Markers with only `node=` and no text/fill are valid anchors but produce
    // no operations — intentionally skipped (same as React side).
  }

  return {
    intents,
    source: filePath,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// VUE 3 FRAMEWORK ANALYZER
// =============================================================================

/**
 * FrameworkAnalyzer for Vue 3 Single File Components (`.vue`).
 */
export class Vue3FrameworkAnalyzer implements FrameworkAnalyzer {
  readonly id = 'vue3';

  readonly extensions: ReadonlyArray<string> = ['.vue'];

  parseAst(code: string, filePath: string, opts?: AnalyzerOpts): AstIntentReport {
    const descriptor = parseSfcSync(code, filePath);
    return parseVueAst(descriptor, opts);
  }

  parseIntent(code: string, filePath: string, _opts?: AnalyzerOpts): IntentModel {
    const descriptor = parseSfcSync(code, filePath);
    const markers = extractVueMarkers(descriptor);
    return buildIntentModelFromMarkers(markers, filePath);
  }

  anchorMarkers(code: string, filePath: string, opts?: AnalyzerOpts): AnchoredAstReport {
    const descriptor = parseSfcSync(code, filePath);
    return anchorVueMarkers(descriptor, undefined, opts);
  }

  hasMarkers(code: string): boolean {
    return hasVueMarkers(code);
  }
}

/**
 * Singleton instance — used by framework/index.ts for registration.
 */
export const vue3Analyzer = new Vue3FrameworkAnalyzer();
