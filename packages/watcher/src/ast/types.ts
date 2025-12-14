/**
 * @aesthetic-function/watcher - ast/types.ts
 *
 * Type definitions for AST-based React analysis.
 *
 * WHY: Phase 6A introduces read-only AST extraction to produce
 * structured reports that can be diffed against markers and design overrides.
 * These types define the output shapes for the AST analyzer.
 *
 * SCOPE: Literals only - no inference from variables, no className parsing.
 */

// =============================================================================
// SOURCE LOCATION
// =============================================================================

/**
 * Location information for AST nodes.
 */
export interface SourceLocation {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

// =============================================================================
// LITERAL EXTRACTIONS
// =============================================================================

/**
 * JSX text literal (text content inside JSX elements).
 *
 * Example:
 *   <h1>Welcome to the Demo</h1>
 *       ^^^^^^^^^^^^^^^^^^^^^ text literal
 */
export interface JsxTextLiteral {
  text: string;
  loc: SourceLocation;
}

/**
 * JSX prop literal (attribute with literal value).
 *
 * Example:
 *   <button disabled={true} aria-label="Submit">
 *           ^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^
 *           boolean literal   string literal
 *
 * Only includes StringLiteral, NumericLiteral, BooleanLiteral values.
 */
export interface JsxPropLiteral {
  /** Element tag name (e.g., "button", "div", "Component") */
  element: string;
  /** Prop name (e.g., "disabled", "aria-label") */
  prop: string;
  /** Literal value */
  value: string | number | boolean;
  loc: SourceLocation;
}

/**
 * Inline style literal (style prop with literal value).
 *
 * Example:
 *   <div style={{ backgroundColor: "#3B82F6", borderRadius: 12 }}>
 *                  ^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
 *                  string literal              number literal
 *
 * Only includes literals from inline style objects.
 */
export interface InlineStyleLiteral {
  /** Element tag name */
  element: string;
  /** Style property name (e.g., "backgroundColor", "borderRadius") */
  styleProp: string;
  /** Literal value */
  value: string | number;
  loc: SourceLocation;
}

// =============================================================================
// COMPONENT REPORTS
// =============================================================================

/**
 * Report for a single React component found in the file.
 */
export interface AstComponentReport {
  /** Function or const name (e.g., "LoginButton", "App") */
  componentName: string;
  /** Whether the component is exported */
  isExported: boolean;
  /** Location of the component definition */
  loc: SourceLocation;
  /** All JSX text literals inside this component */
  jsxTextLiterals: JsxTextLiteral[];
  /** All JSX prop literals inside this component */
  jsxPropLiterals: JsxPropLiteral[];
  /** All inline style literals inside this component */
  inlineStyleLiterals: InlineStyleLiteral[];
}

/**
 * Full AST analysis report for a file.
 */
export interface AstIntentReport {
  /** Path to the analyzed file */
  filePath: string;
  /** All components found in the file */
  components: AstComponentReport[];
}

// =============================================================================
// ANCHORED REPORTS (MARKER MAPPING)
// =============================================================================

/**
 * Extracted values from AST analysis for a single anchor point.
 */
export interface AnchorExtracted {
  /** Text literals found in the component (trimmed) */
  text?: string[];
  /** Fill colors (backgroundColor literals that look like hex) */
  fills?: string[];
}

/**
 * A single anchor mapping a @figma marker to an AST component.
 */
export interface Anchor {
  /** Node name from the @figma marker */
  nodeName: string;
  /** Line number where the marker appears */
  markerLine: number;
  /** Name of the matched component (if found) */
  componentName?: string;
  /** Location of the matched component */
  componentLoc?: SourceLocation;
  /** Extracted literals from the component */
  extracted: AnchorExtracted;
  /** Notes/warnings (e.g., "no component found after marker") */
  notes: string[];
}

/**
 * Full anchored report linking markers to AST components.
 */
export interface AnchoredAstReport {
  /** Path to the analyzed file */
  filePath: string;
  /** All anchor mappings */
  anchors: Anchor[];
}
