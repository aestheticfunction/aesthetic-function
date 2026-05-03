/**
 * @aesthetic-function/watcher - framework/types.ts
 *
 * FrameworkAnalyzer interface and related types.
 *
 * WHY: A single pluggable interface lets the watcher dispatch to React,
 * Vue 3, or future analyzers (Svelte, Solid, Astro) based solely on file
 * extension. Downstream shapes (AstIntentReport, IntentModel, AnchoredAstReport)
 * are unchanged — only the per-framework parsing code differs.
 *
 * TERMINOLOGY (to avoid confusion with the existing SemanticAdapter system):
 *   FrameworkAnalyzer — top-level: file → AstIntentReport + IntentModel
 *   SemanticAdapter   — lower-level: JSX element → ComponentSemanticIntent (React-only)
 *
 * Adding a new framework: implement FrameworkAnalyzer, call registerFrameworkAnalyzer()
 * in packages/watcher/src/framework/index.ts. No other changes required.
 */

import type { AstIntentReport, AnchoredAstReport } from '../ast/types.js';
import type { IntentModel } from '../transform/types.js';

// =============================================================================
// ANALYZER OPTIONS
// =============================================================================

/**
 * Per-invocation options passed to every FrameworkAnalyzer method.
 *
 * All fields are optional. Analyzers must operate correctly when the options
 * object is empty or omitted entirely.
 */
export interface AnalyzerOpts {
  /**
   * Config-driven source roots for component-key computation.
   * Relative to the repository root (e.g., ["react-demo-app/src", "src"]).
   * When absent, the analyzer uses the file's own directory.
   */
  sourceRoots?: string[];

  /**
   * Paths of additional CSS/token files whose CSS custom properties
   * (--token-name: value) should be available for token resolution.
   * Relative to the repository root.
   *
   * WHY (answer #4): v1 CSS-variable resolution is scoped to the current
   * SFC plus these explicitly configured files. No workspace-wide scan.
   */
  tokenFilePaths?: string[];

  /**
   * Hints for third-party library component prop allow-lists.
   * Zero library names are hardcoded in core.
   */
  libraryHints?: LibraryHint[];

  /**
   * When true, attempt AST-based write-back of reconciled values.
   * Defaults to false. Set to true only after Phase 3 round-trip spike passes.
   */
  enableWriteBack?: boolean;
}

/**
 * Allow-list hint for a third-party component library.
 *
 * WHY: Lets projects like Vuetify or PrimeVue declare which props are
 * reconcilable without any library-specific code in the core analyzer.
 */
export interface LibraryHint {
  /** Match against the import specifier (string or regex). */
  matchSpecifier: string | RegExp;
  /** Prop names that are safe to reconcile for components from this library. */
  allowProps: string[];
}

// =============================================================================
// FRAMEWORK ANALYZER INTERFACE
// =============================================================================

/**
 * A FrameworkAnalyzer converts a source file into the framework-agnostic
 * shapes the reconciliation engine consumes.
 *
 * Contract:
 * - All methods are pure (no side effects, no file I/O).
 * - All methods are synchronous in v1. Async is reserved for future
 *   type-server integration (e.g., Volar for Vue).
 * - Output shapes (AstIntentReport, IntentModel, AnchoredAstReport) are
 *   identical to those produced by the existing React analyzer.
 */
export interface FrameworkAnalyzer {
  /**
   * Stable identifier for this analyzer (e.g., 'react', 'vue3').
   * Used in log messages and error attribution.
   */
  readonly id: string;

  /**
   * File extensions this analyzer handles (e.g., ['.tsx', '.jsx', '.ts', '.js']).
   * Extensions must include the leading dot and be lowercase.
   * The registry uses the first registered analyzer that matches.
   */
  readonly extensions: ReadonlyArray<string>;

  /**
   * Parse a source file and return an AST-level intent report.
   *
   * Equivalent to parseIntentFromReactAst() for React files.
   *
   * @param code     - Full source file content
   * @param filePath - Absolute or relative path (for reporting and key derivation)
   * @param opts     - Optional per-invocation options
   */
  parseAst(code: string, filePath: string, opts?: AnalyzerOpts): AstIntentReport;

  /**
   * Parse a source file and return a marker-based IntentModel.
   *
   * Equivalent to parseIntentFromReact() for React files.
   *
   * @param code     - Full source file content
   * @param filePath - Absolute or relative path
   * @param opts     - Optional per-invocation options
   */
  parseIntent(code: string, filePath: string, opts?: AnalyzerOpts): IntentModel;

  /**
   * Anchor @figma markers to their closest component definitions.
   *
   * Equivalent to anchorMarkersToAst() for React files.
   *
   * @param code     - Full source file content
   * @param filePath - Absolute or relative path
   * @param opts     - Optional per-invocation options
   */
  anchorMarkers(code: string, filePath: string, opts?: AnalyzerOpts): AnchoredAstReport;

  /**
   * Quick check: does this file contain any @figma markers?
   *
   * Equivalent to hasFigmaMarkers() for React files.
   * Used to skip files with no markers without running the full parser.
   *
   * @param code - Full source file content
   */
  hasMarkers(code: string): boolean;
}
