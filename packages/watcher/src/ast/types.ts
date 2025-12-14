/**
 * @aesthetic-function/watcher - ast/types.ts
 *
 * Type definitions for AST-based React analysis.
 *
 * WHY: Phase 6A introduces read-only AST extraction to produce
 * structured reports that can be diffed against markers and design overrides.
 * Phase 6B expands extraction to include additional semantic signals.
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
// CONFIDENCE LEVELS
// =============================================================================

/**
 * Confidence level for extracted semantic values.
 *
 * WHY: Distinguishes between values we're certain about (literals)
 * and values that may need verification.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// =============================================================================
// SEMANTIC INTENT TYPES (Phase 6B)
// =============================================================================

/**
 * Base structure for all semantic extractions.
 * Compatible with IntentModel but read-only.
 */
export interface SemanticValue<T> {
  /** The extracted value */
  value: T;
  /** Source location in the code */
  loc: SourceLocation;
  /** Confidence score - 'high' for literals, lower for inferred values */
  confidence: ConfidenceLevel;
}

/**
 * Text content semantics.
 */
export interface TextSemantics {
  /** JSX text children */
  content?: SemanticValue<string>[];
  /** placeholder attribute */
  placeholder?: SemanticValue<string>;
  /** title attribute */
  title?: SemanticValue<string>;
  /** aria-label attribute */
  ariaLabel?: SemanticValue<string>;
  /** alt attribute */
  alt?: SemanticValue<string>;
}

/**
 * Boolean state semantics.
 */
export interface BooleanSemantics {
  /** disabled prop */
  disabled?: SemanticValue<boolean>;
  /** checked prop */
  checked?: SemanticValue<boolean>;
  /** selected prop */
  selected?: SemanticValue<boolean>;
}

/**
 * Numeric layout semantics (from props and inline styles).
 */
export interface LayoutSemantics {
  /** width (prop or style) */
  width?: SemanticValue<number>;
  /** height (prop or style) */
  height?: SemanticValue<number>;
  /** padding (style) */
  padding?: SemanticValue<number>;
  /** margin (style) */
  margin?: SemanticValue<number>;
  /** gap (style) */
  gap?: SemanticValue<number>;
}

/**
 * Flexbox semantics from inline styles.
 */
export interface FlexSemantics {
  /** display (e.g., 'flex', 'block') */
  display?: SemanticValue<string>;
  /** flexDirection */
  flexDirection?: SemanticValue<string>;
  /** justifyContent */
  justifyContent?: SemanticValue<string>;
  /** alignItems */
  alignItems?: SemanticValue<string>;
}

/**
 * Visual semantics (colors, etc.).
 */
export interface VisualSemantics {
  /** backgroundColor (hex colors only) */
  fills?: SemanticValue<string>[];
}

/**
 * Combined semantic intent for a component.
 * Read-only, compatible with IntentModel shape.
 */
export interface ComponentSemanticIntent {
  /** Text content and accessibility labels */
  text: TextSemantics;
  /** Boolean state props */
  booleans: BooleanSemantics;
  /** Numeric layout values */
  layout: LayoutSemantics;
  /** Flexbox layout */
  flex: FlexSemantics;
  /** Visual properties */
  visual: VisualSemantics;
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
  /** Semantic intent extracted from this component (Phase 6B) */
  semantics: ComponentSemanticIntent;
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
  /** Full semantic intent for the component (Phase 6B) */
  semantics?: ComponentSemanticIntent;
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
