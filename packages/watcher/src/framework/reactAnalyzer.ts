/**
 * @aesthetic-function/watcher - framework/reactAnalyzer.ts
 *
 * FrameworkAnalyzer wrapper for the existing React/JSX analyzer.
 *
 * WHY: The existing React parser modules (parseIntentFromReact,
 * parseIntentFromReactAst, anchorMarkersToAst) predate the FrameworkAnalyzer
 * interface. This wrapper adapts them to the registry interface without
 * changing any of their behavior or signatures.
 *
 * All existing import paths remain stable — other code in the watcher that
 * imports directly from the ast/ and parse/ modules continues to work unchanged.
 */

import type { FrameworkAnalyzer, AnalyzerOpts } from './types.js';
import type { AstIntentReport, AnchoredAstReport } from '../ast/types.js';
import type { IntentModel } from '../transform/types.js';

import {
  parseIntentFromReactAst,
  anchorMarkersToAst,
} from '../ast/parseIntentFromReactAst.js';
import {
  parseIntentFromReact,
  hasFigmaMarkers,
} from '../parse/parseIntentFromReact.js';
import { createIntentModel } from '../transform/intentToFigmaOps.js';

// =============================================================================
// REACT FRAMEWORK ANALYZER
// =============================================================================

/**
 * FrameworkAnalyzer for React and TypeScript files (.tsx, .jsx, .ts, .js).
 *
 * Delegates to the existing React analyzer modules. All behavior is identical
 * to calling those modules directly; this class is purely an adapter shim.
 */
export class ReactFrameworkAnalyzer implements FrameworkAnalyzer {
  readonly id = 'react';

  /**
   * File extensions handled by this analyzer.
   * Note: .ts and .js are included because React projects often have TypeScript
   * utility modules that use @figma markers alongside their TSX entry points.
   */
  readonly extensions: ReadonlyArray<string> = ['.tsx', '.jsx', '.ts', '.js'];

  parseAst(code: string, filePath: string, _opts?: AnalyzerOpts): AstIntentReport {
    // opts are not used by the React analyzer in v1.
    // sourceRoots: the React AST uses computeComponentKey()'s default root logic.
    return parseIntentFromReactAst(code, filePath);
  }

  parseIntent(code: string, filePath: string, _opts?: AnalyzerOpts): IntentModel {
    const parseResult = parseIntentFromReact(code, filePath);
    return createIntentModel(parseResult.intents, filePath);
  }

  anchorMarkers(code: string, filePath: string, _opts?: AnalyzerOpts): AnchoredAstReport {
    return anchorMarkersToAst(code, filePath);
  }

  hasMarkers(code: string): boolean {
    return hasFigmaMarkers(code);
  }
}

/**
 * Singleton instance — registration in framework/index.ts uses this.
 */
export const reactAnalyzer = new ReactFrameworkAnalyzer();
