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
 * Derive component state from boolean semantics (Phase 8A).
 *
 * WHY: When JSX has `disabled={true}` with high confidence,
 * we can infer the component represents a "disabled" state variant.
 *
 * @param booleans - Boolean semantics from AST extraction
 * @returns Inferred component state, or undefined if no high-confidence match
 */
export function deriveStateFromBooleans(
  booleans: BooleanSemantics
): 'disabled' | undefined {
  // Only infer state for high-confidence disabled={true}
  if (
    booleans.disabled &&
    booleans.disabled.value === true &&
    booleans.disabled.confidence === 'high'
  ) {
    return 'disabled';
  }
  // Note: hover/pressed states cannot be inferred from static JSX
  // They would require event handlers or CSS pseudoclass analysis
  return undefined;
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
// COMPONENT KEY DERIVATION (Phase 8D)
// =============================================================================

/**
 * Default source root for component key derivation.
 * Paths are computed relative to this directory.
 */
export const DEFAULT_COMPONENT_KEY_ROOT = 'demo-app/src';

/**
 * Compute a stable component key from file path and export name.
 *
 * WHY: Component keys provide stable identity across renames and refactors.
 * The key is derived from the code structure, making it deterministic and
 * independent of Figma node names.
 *
 * Format: <relativePath>/<exportName> (e.g., "auth/LoginButton", "Card")
 *
 * @param filePath - Absolute or relative path to the source file
 * @param exportName - Name of the exported component
 * @param root - Source root to compute relative paths from (default: demo-app/src)
 * @returns Stable component key
 */
export function computeComponentKey(
  filePath: string,
  exportName: string,
  root: string = DEFAULT_COMPONENT_KEY_ROOT
): string {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedRoot = root.replace(/\\/g, '/');

  // Find the root in the path
  const rootIndex = normalizedPath.indexOf(normalizedRoot);
  let relativePath: string;

  if (rootIndex !== -1) {
    // Extract path after root, remove leading slash
    relativePath = normalizedPath.slice(rootIndex + normalizedRoot.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }
  } else {
    // Root not found, use just the filename
    const lastSlash = normalizedPath.lastIndexOf('/');
    relativePath = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
  }

  // Remove file extension
  const extensionMatch = relativePath.match(/\.(tsx?|jsx?)$/);
  if (extensionMatch) {
    relativePath = relativePath.slice(0, -extensionMatch[0].length);
  }

  // Build the key: dir/exportName or just exportName if at root
  if (relativePath === '' || relativePath === exportName) {
    // File is named same as export (e.g., Card.tsx exports Card)
    return exportName;
  }

  // Get directory path (without filename)
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash >= 0) {
    const dirPath = relativePath.slice(0, lastSlash);
    return `${dirPath}/${exportName}`;
  }

  // File at root level with different name than export
  // Use just the export name for simplicity
  return exportName;
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
  /**
   * Stable component key for mapping registry (Phase 8D).
   * Format: <dir>/<exportName> or just <exportName> if at root.
   * Optional because it requires file path context to compute.
   */
  componentKey?: string;
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
  /**
   * Stable component key for mapping registry (Phase 8D).
   * Populated when componentName is known and file path is available.
   */
  componentKey?: string;
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

// =============================================================================
// WRITE SAFETY ANALYSIS (Phase 6C)
// =============================================================================

/**
 * Classification of how safe it is to auto-write a value back to source.
 *
 * WHY: Before implementing code writing, we need to understand which values
 * can be safely modified programmatically. This analysis runs read-only
 * to inform future write operations.
 */
export type WriteSafetyLevel = 'auto-writable' | 'conditionally-writable' | 'not-writable';

/**
 * Reasons why a value might not be auto-writable.
 */
export type WriteSafetyReason =
  | 'literal' // Auto-writable: direct literal value
  | 'simple-expression' // Conditionally writable: template literal, ternary with literals
  | 'variable-reference' // Not writable: references a variable/prop
  | 'function-call' // Not writable: result of a function call
  | 'className' // Not writable: would require CSS modification
  | 'computed' // Not writable: dynamic computation
  | 'spread' // Not writable: spread operator may override
  | 'external-style' // Not writable: style comes from external source
  | 'complex-expression'; // Not writable: complex expression we can't analyze

/**
 * Write safety assessment for a single semantic value.
 */
export interface ValueWriteSafety {
  /** The property path (e.g., "text.content", "layout.width") */
  path: string;
  /** Current value (if extractable) */
  value?: string | number | boolean;
  /** Safety classification */
  level: WriteSafetyLevel;
  /** Reason for the classification */
  reason: WriteSafetyReason;
  /** Source location where modification would occur */
  loc?: SourceLocation;
  /** Human-readable explanation */
  explanation: string;
}

/**
 * Complete write safety report for an anchored component.
 */
export interface WriteSafetyReport {
  /** Node name from the @figma marker */
  nodeName: string;
  /** Component name */
  componentName?: string;
  /** Location of the component */
  componentLoc?: SourceLocation;
  /** All auto-writable values */
  autoWritable: ValueWriteSafety[];
  /** All conditionally writable values */
  conditionallyWritable: ValueWriteSafety[];
  /** All not-writable values */
  notWritable: ValueWriteSafety[];
  /** Summary counts */
  summary: {
    totalValues: number;
    autoWritableCount: number;
    conditionallyWritableCount: number;
    notWritableCount: number;
  };
}

/**
 * Full write feasibility report for a file.
 */
export interface WriteFeasibilityReport {
  /** Path to the analyzed file */
  filePath: string;
  /** Safety reports per anchored node */
  reports: WriteSafetyReport[];
  /** File-level summary */
  summary: {
    totalNodes: number;
    totalValues: number;
    autoWritableCount: number;
    conditionallyWritableCount: number;
    notWritableCount: number;
  };
}
