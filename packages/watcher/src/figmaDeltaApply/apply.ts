/**
 * @aesthetic-function/watcher - figmaDeltaApply/apply.ts
 *
 * Phase 12C: Apply Figma Delta Suggestions.
 *
 * WHY: Takes Phase 12B suggestions and applies them to the correct storage
 * target (AST write, marker update, override write) using existing pipelines.
 *
 * SCOPE:
 * - Loads suggestions (from deltas or artifact)
 * - Filters by allow list + confidence threshold
 * - Routes ops by target (override, marker, ast)
 * - Never creates new markers (update only, fallback to override)
 * - Reuses existing safety rules
 *
 * CONSTRAINTS:
 * - Deterministic: same inputs → same ops
 * - Auditable: every apply produces artifact + audit log
 * - Variant-safe: never writes to component-set nodeIds
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DeltaApplyOp,
  DeltaApplyInput,
  DeltaApplyConfig,
  DeltaApplyEvidence,
  OpApplyResult,
  DeltaApplySummary,
  DeltaApplyTarget,
} from './types.js';
import type { FigmaDeltaSuggestion, SuggestionArtifact } from '../figmaDeltaSuggest/types.js';
import type { DesignOverrides, DesignOverride } from '../reconcile/types.js';
import type { SourceLocation } from '../ast/types.js';

import { isTargetAllowed, meetsConfidenceThreshold, isApplyModeEnabled } from './config.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// OPERATION ID GENERATION
// =============================================================================

/**
 * Generate deterministic operation ID.
 */
function generateOpId(
  componentKey: string,
  state: string,
  property: string,
  target: string,
  to: string | number
): string {
  const input = `${componentKey}::${state}::${property}::${target}::${String(to)}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// =============================================================================
// SUGGESTION TO OP CONVERSION
// =============================================================================

/**
 * Convert a suggestion to an apply operation.
 */
function suggestionToOp(
  suggestion: FigmaDeltaSuggestion,
  config: DeltaApplyConfig
): DeltaApplyOp | null {
  // Map suggestion target to apply target
  const target: DeltaApplyTarget =
    suggestion.suggestedTarget === 'none' ? 'blocked' : suggestion.suggestedTarget;

  // Check if target is allowed
  if (target !== 'blocked' && !isTargetAllowed(target, config)) {
    return null; // Will be tracked as skipped/notAllowed
  }

  // Check confidence threshold
  if (!meetsConfidenceThreshold(suggestion.confidence, config.minConfidence)) {
    return null; // Will be tracked as skipped/lowConfidence
  }

  // Build evidence
  const evidence: DeltaApplyEvidence = {
    variantNodeId: suggestion.evidence.variantNodeId,
  };

  if (suggestion.evidence.overrideKey) {
    evidence.overrideKey = suggestion.evidence.overrideKey;
  }
  if (suggestion.evidence.markerLine) {
    evidence.markerLine = suggestion.evidence.markerLine;
  }
  if (suggestion.evidence.astLoc) {
    evidence.astLoc = suggestion.evidence.astLoc;
  }
  if (suggestion.toCanonical) {
    evidence.canonicalToken = suggestion.toCanonical;
  }

  const opId = generateOpId(
    suggestion.componentKey,
    suggestion.targetState,
    suggestion.property,
    target,
    suggestion.toRaw
  );

  return {
    opId,
    componentKey: suggestion.componentKey,
    targetState: suggestion.targetState,
    property: suggestion.property,
    from: suggestion.fromRaw,
    to: suggestion.toRaw,
    target,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    evidence,
  };
}

// =============================================================================
// GENERATE OPS
// =============================================================================

/**
 * Generate apply operations from suggestions.
 *
 * Filters by:
 * - Allow list
 * - Confidence threshold
 * - Component filter (optional)
 * - State filter (optional)
 */
export function generateDeltaApplyOps(input: DeltaApplyInput): {
  ops: DeltaApplyOp[];
  skipped: Array<{ suggestion: FigmaDeltaSuggestion; reason: string }>;
} {
  const { suggestions, config, componentFilter, stateFilter } = input;

  const ops: DeltaApplyOp[] = [];
  const skipped: Array<{ suggestion: FigmaDeltaSuggestion; reason: string }> = [];

  for (const suggestion of suggestions) {
    // Apply component filter
    if (componentFilter && suggestion.componentKey !== componentFilter) {
      continue; // Not an error, just not selected
    }

    // Apply state filter
    if (stateFilter && suggestion.targetState !== stateFilter) {
      continue; // Not an error, just not selected
    }

    // Check if blocked
    if (suggestion.suggestedTarget === 'none') {
      skipped.push({
        suggestion,
        reason: suggestion.blockingReason ?? 'Blocked by policy',
      });
      continue;
    }

    // Check target allowed
    if (!isTargetAllowed(suggestion.suggestedTarget, config)) {
      skipped.push({
        suggestion,
        reason: `Target '${suggestion.suggestedTarget}' not in allow list`,
      });
      continue;
    }

    // Check confidence
    if (!meetsConfidenceThreshold(suggestion.confidence, config.minConfidence)) {
      skipped.push({
        suggestion,
        reason: `Confidence '${suggestion.confidence}' below threshold '${config.minConfidence}'`,
      });
      continue;
    }

    const op = suggestionToOp(suggestion, config);
    if (op) {
      ops.push(op);
    }
  }

  // Sort deterministically
  ops.sort((a, b) => {
    if (a.componentKey !== b.componentKey) {
      return a.componentKey.localeCompare(b.componentKey);
    }
    if (a.targetState !== b.targetState) {
      return a.targetState.localeCompare(b.targetState);
    }
    return a.property.localeCompare(b.property);
  });

  return { ops, skipped };
}

// =============================================================================
// OVERRIDE APPLY
// =============================================================================

/**
 * Get the override key for a component and state.
 */
function getOverrideKey(componentKey: string, state: string): string {
  if (state === 'base') {
    return componentKey;
  }
  return `${componentKey}::${state}`;
}

/**
 * Apply an operation to design-overrides.json.
 */
async function applyToOverride(
  op: DeltaApplyOp,
  overrides: DesignOverrides,
  repoRoot: string,
  dryRun: boolean
): Promise<OpApplyResult> {
  const overrideKey = op.evidence.overrideKey ?? getOverrideKey(op.componentKey, op.targetState);

  // Get or create entry
  const existing = overrides[overrideKey] ?? {
    nodeId: op.evidence.variantNodeId ?? `delta-${Date.now()}`,
    lastUpdated: new Date().toISOString(),
  };

  // Update the property
  const updated: DesignOverride = {
    ...existing,
    lastUpdated: new Date().toISOString(),
  };

  // Map delta property to override property
  switch (op.property) {
    case 'fill':
      updated.fill = String(op.to);
      break;
    case 'padding':
      if (!updated.layout) updated.layout = {};
      updated.layout.padding = Number(op.to);
      break;
    case 'gap':
      if (!updated.layout) updated.layout = {};
      updated.layout.gap = Number(op.to);
      break;
    default:
      return {
        opId: op.opId,
        applied: false,
        skipped: true,
        skipReason: `Property '${op.property}' not supported for override writes`,
      };
  }

  if (dryRun) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: 'Dry-run mode: would update override',
      appliedTarget: 'override',
      appliedLocation: overrideKey,
    };
  }

  // Write back
  overrides[overrideKey] = updated;
  const overridesPath = join(repoRoot, 'design-overrides.json');
  await writeFile(overridesPath, JSON.stringify(overrides, null, 2), 'utf-8');

  return {
    opId: op.opId,
    applied: true,
    skipped: false,
    appliedTarget: 'override',
    appliedLocation: overrideKey,
  };
}

// =============================================================================
// MARKER APPLY
// =============================================================================

/**
 * Apply an operation to a marker line.
 */
async function applyToMarker(
  op: DeltaApplyOp,
  sourceCode: string,
  filePath: string,
  repoRoot: string,
  dryRun: boolean
): Promise<OpApplyResult> {
  const markerLine = op.evidence.markerLine;
  if (!markerLine) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: 'No marker line in evidence',
    };
  }

  const lines = sourceCode.split('\n');
  const lineIndex = markerLine - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Marker line ${markerLine} out of range`,
    };
  }

  const line = lines[lineIndex];

  // Check it's actually a marker line
  if (!line.includes('@figma') || !line.includes(`node=${op.componentKey}`)) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Line ${markerLine} is not a marker for ${op.componentKey}`,
    };
  }

  // Update the marker attribute
  const attrName = op.property;
  const value = String(op.to);

  // Pattern to match the attribute
  const quotedPattern = new RegExp(`${attrName}=(?:"[^"]*"|'[^']*'|\\S+)`);
  const needsQuotes = value.includes(' ');
  const formattedValue = needsQuotes ? `"${value}"` : value;
  const replacement = `${attrName}=${formattedValue}`;

  let updatedLine: string;
  if (quotedPattern.test(line)) {
    updatedLine = line.replace(quotedPattern, replacement);
  } else {
    updatedLine = line.trimEnd() + ` ${replacement}`;
  }

  if (dryRun) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Dry-run mode: would update marker at L${markerLine}`,
      appliedTarget: 'marker',
      appliedLocation: `${filePath}:${markerLine}`,
    };
  }

  // Update file
  lines[lineIndex] = updatedLine;
  const absolutePath = join(repoRoot, filePath);
  await writeFile(absolutePath, lines.join('\n'), 'utf-8');

  return {
    opId: op.opId,
    applied: true,
    skipped: false,
    appliedTarget: 'marker',
    appliedLocation: `${filePath}:${markerLine}`,
  };
}

// =============================================================================
// AST APPLY
// =============================================================================

/**
 * Non-base states that cannot have AST writes.
 *
 * WHY: Non-base states (hover, pressed, disabled) exist as runtime variants.
 * There's no static JSX representation for them in base component code.
 * These states should only be stored in:
 * - design-overrides.json (runtime lookup)
 * - @figma markers with state= attribute
 *
 * Never AST-write for non-base states.
 */
const NON_BASE_STATES = ['hover', 'pressed', 'disabled', 'focus', 'active'];

/**
 * Check if a state is a non-base state.
 */
function isNonBaseState(state: string): boolean {
  return NON_BASE_STATES.includes(state.toLowerCase());
}

/**
 * Map delta property to AST write operation type.
 *
 * - fill → SET_FILL (backgroundColor)
 * - text → SET_TEXT (JSX text content)
 * - gap, padding, margin, width, height → SET_LAYOUT
 */
function propertyToAstOpType(property: string): 'SET_TEXT' | 'SET_FILL' | 'SET_LAYOUT' | null {
  switch (property) {
    case 'fill':
      return 'SET_FILL';
    case 'text':
      return 'SET_TEXT';
    case 'gap':
    case 'padding':
    case 'margin':
    case 'width':
    case 'height':
      return 'SET_LAYOUT';
    default:
      return null;
  }
}

/**
 * Apply an operation to AST.
 *
 * Delegates to existing materializeAstWrite pipeline functions.
 *
 * SAFETY:
 * - Non-base states are always rejected (go to override/marker instead)
 * - Only applies to auto-writable literals (from Phase 6C)
 * - Uses atomic file writes
 *
 * @param op - The operation to apply
 * @param sourceCode - Current file source code
 * @param filePath - Relative file path
 * @param repoRoot - Repository root path
 * @param dryRun - Whether to skip actual writes
 * @returns Apply result
 */
async function applyToAst(
  op: DeltaApplyOp,
  sourceCode: string,
  filePath: string,
  repoRoot: string,
  dryRun: boolean
): Promise<OpApplyResult> {
  // SAFETY: Non-base states cannot have AST writes
  // They must go to override or marker targets only
  if (isNonBaseState(op.targetState)) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `non-base-state-refused: ${op.targetState} cannot be AST-written`,
      appliedTarget: 'ast',
      appliedLocation: `${filePath}`,
    };
  }

  const astLoc = op.evidence.astLoc;
  if (!astLoc) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: 'No AST location in evidence',
    };
  }

  // Check AST write mode is enabled
  const { getAstWriteMode, isAstWriteOpAllowed, getAstWriteDryRun } = await import(
    '../materialize/config.js'
  );
  const mode = getAstWriteMode();
  if (mode === 'off') {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: 'AST_WRITE_MODE=off',
      appliedTarget: 'ast',
      appliedLocation: `${filePath}:${astLoc.startLine}`,
    };
  }

  // Determine operation type
  const opType = propertyToAstOpType(op.property);
  if (!opType) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Property '${op.property}' not mappable to AST write op`,
    };
  }

  // Check if op type is allowed
  if (!isAstWriteOpAllowed(opType)) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Op type '${opType}' not in AST_WRITE_ALLOW`,
      appliedTarget: 'ast',
      appliedLocation: `${filePath}:${astLoc.startLine}`,
    };
  }

  // Resolve dry run from config if not explicitly provided
  const effectiveDryRun = dryRun || getAstWriteDryRun();

  if (effectiveDryRun) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Dry-run mode: would update AST at L${astLoc.startLine} (${opType})`,
      appliedTarget: 'ast',
      appliedLocation: `${filePath}:${astLoc.startLine}`,
    };
  }

  // Import Babel tools dynamically to avoid bundle bloat for non-AST paths
  const { parse } = await import('@babel/parser');
  const babelTraverse = await import('@babel/traverse');
  const babelGenerator = await import('@babel/generator');
  const t = await import('@babel/types');

  // Handle ESM/CJS interop
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverse = typeof babelTraverse === 'function' 
    ? babelTraverse 
    : (babelTraverse as any).default ?? (babelTraverse as any).default?.default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generate = typeof babelGenerator === 'function' 
    ? babelGenerator 
    : (babelGenerator as any).default ?? (babelGenerator as any).default?.default;

  // Parse the source
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch (parseError) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Failed to parse AST: ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
    };
  }

  // Apply the change based on operation type
  let modified = false;
  const newValue = String(op.to);

  try {
    switch (opType) {
      case 'SET_TEXT':
        modified = applyTextChangeAtLoc(traverse, t, ast, astLoc, newValue);
        break;
      case 'SET_FILL':
        modified = applyFillChangeAtLoc(traverse, t, ast, astLoc, newValue);
        break;
      case 'SET_LAYOUT':
        modified = applyLayoutChangeAtLoc(traverse, t, ast, astLoc, op.property, newValue);
        break;
    }
  } catch (applyError) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Failed to apply AST change: ${applyError instanceof Error ? applyError.message : 'unknown error'}`,
    };
  }

  if (!modified) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `No AST node found at L${astLoc.startLine}:${astLoc.startColumn ?? 0}`,
    };
  }

  // Regenerate code
  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
  });

  // Atomic write: write to temp file then rename
  const absolutePath = join(repoRoot, filePath);
  const tempPath = absolutePath + '.delta-ast-tmp';
  await writeFile(tempPath, output.code, 'utf-8');

  // Rename for atomic operation
  const { rename } = await import('node:fs/promises');
  await rename(tempPath, absolutePath);

  return {
    opId: op.opId,
    applied: true,
    skipped: false,
    appliedTarget: 'ast',
    appliedLocation: `${filePath}:${astLoc.startLine}`,
  };
}

// =============================================================================
// AST MODIFICATION HELPERS
// =============================================================================

/**
 * Apply a text change at a specific AST location.
 *
 * Targets JSXText nodes and string literals in JSX expressions.
 */
function applyTextChangeAtLoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any,
  targetLoc: SourceLocation,
  newValue: string
): boolean {
  let modified = false;

  traverse(ast, {
    JSXText(path: { node: { loc: { start: { line: number; column: number } }; value: string }; stop: () => void }) {
      const loc = path.node.loc;
      if (!loc) return;

      if (
        loc.start.line === targetLoc.startLine &&
        (targetLoc.startColumn === undefined || loc.start.column === targetLoc.startColumn)
      ) {
        // Preserve leading/trailing whitespace
        const original = path.node.value;
        const leadingWs = original.match(/^(\s*)/)?.[1] ?? '';
        const trailingWs = original.match(/(\s*)$/)?.[1] ?? '';
        path.node.value = leadingWs + newValue + trailingWs;
        modified = true;
        path.stop();
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StringLiteral(path: any) {
      const loc = path.node.loc;
      if (!loc) return;

      // Check if parent is JSXExpressionContainer
      const parent = path.parent;
      if (!t.isJSXExpressionContainer(parent)) return;

      if (
        loc.start.line === targetLoc.startLine &&
        (targetLoc.startColumn === undefined || loc.start.column === targetLoc.startColumn)
      ) {
        path.node.value = newValue;
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

/**
 * Apply a fill (backgroundColor) change at a specific AST location.
 *
 * Targets string literals that are values of backgroundColor property.
 */
function applyFillChangeAtLoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any,
  targetLoc: SourceLocation,
  newValue: string
): boolean {
  let modified = false;

  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StringLiteral(path: any) {
      const loc = path.node.loc;
      if (!loc) return;

      if (
        loc.start.line === targetLoc.startLine &&
        (targetLoc.startColumn === undefined || loc.start.column === targetLoc.startColumn)
      ) {
        // Verify this is a backgroundColor property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== 'backgroundColor') return;

        path.node.value = newValue;
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

/**
 * Apply a layout property change at a specific AST location.
 *
 * Targets numeric or string literals for layout properties (gap, padding, etc.).
 */
function applyLayoutChangeAtLoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any,
  targetLoc: SourceLocation,
  layoutKey: string,
  newValue: string
): boolean {
  let modified = false;

  // Determine if new value should be numeric or string
  const numericValue = parseFloat(newValue);
  const isNumeric = !isNaN(numericValue) && String(numericValue) === newValue;

  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    NumericLiteral(path: any) {
      const loc = path.node.loc;
      if (!loc) return;

      if (
        loc.start.line === targetLoc.startLine &&
        (targetLoc.startColumn === undefined || loc.start.column === targetLoc.startColumn)
      ) {
        // Verify this is a layout property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== layoutKey) return;

        if (isNumeric) {
          path.node.value = numericValue;
        } else {
          path.replaceWith(t.stringLiteral(newValue));
        }
        modified = true;
        path.stop();
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StringLiteral(path: any) {
      const loc = path.node.loc;
      if (!loc) return;

      if (
        loc.start.line === targetLoc.startLine &&
        (targetLoc.startColumn === undefined || loc.start.column === targetLoc.startColumn)
      ) {
        // Verify this is a layout property value
        const parent = path.parent;
        if (!t.isObjectProperty(parent)) return;

        const key = t.isIdentifier(parent.key)
          ? parent.key.name
          : t.isStringLiteral(parent.key)
            ? parent.key.value
            : null;

        if (key !== layoutKey) return;

        if (isNumeric) {
          path.replaceWith(t.numericLiteral(numericValue));
        } else {
          path.node.value = newValue;
        }
        modified = true;
        path.stop();
      }
    },
  });

  return modified;
}

// =============================================================================
// EXECUTE OPS
// =============================================================================

/**
 * Execute apply operations.
 *
 * Routes ops by target:
 * - override → write into design-overrides.json
 * - marker → update existing @figma lines
 * - ast → invoke AST write pipeline
 * - blocked → skip with reason
 */
export async function executeDeltaApplyOps(
  ops: DeltaApplyOp[],
  config: DeltaApplyConfig,
  filePath: string
): Promise<{
  results: OpApplyResult[];
  violations: string[];
}> {
  const repoRoot = getRepoRoot();
  const absoluteFilePath = join(repoRoot, filePath);

  // Load current state
  let sourceCode: string;
  try {
    sourceCode = await readFile(absoluteFilePath, 'utf-8');
  } catch {
    return {
      results: ops.map((op) => ({
        opId: op.opId,
        applied: false,
        skipped: true,
        skipReason: `Cannot read source file: ${filePath}`,
      })),
      violations: [`Cannot read source file: ${filePath}`],
    };
  }

  let overrides: DesignOverrides = {};
  try {
    const overridesPath = join(repoRoot, 'design-overrides.json');
    const content = await readFile(overridesPath, 'utf-8');
    overrides = JSON.parse(content);
  } catch {
    // No overrides file, start fresh
  }

  const results: OpApplyResult[] = [];
  const violations: string[] = [];
  const dryRun = config.dryRun || !isApplyModeEnabled(config);

  for (const op of ops) {
    let result: OpApplyResult;

    switch (op.target) {
      case 'override':
        result = await applyToOverride(op, overrides, repoRoot, dryRun);
        break;

      case 'marker':
        result = await applyToMarker(op, sourceCode, filePath, repoRoot, dryRun);
        break;

      case 'ast':
        result = await applyToAst(op, sourceCode, filePath, repoRoot, dryRun);
        break;

      case 'blocked':
        result = {
          opId: op.opId,
          applied: false,
          skipped: true,
          skipReason: op.reason ?? 'Blocked by policy',
        };
        break;

      default:
        result = {
          opId: op.opId,
          applied: false,
          skipped: true,
          skipReason: `Unknown target: ${op.target}`,
        };
    }

    results.push(result);

    // Track violations for non-applied ops (excluding dry-run)
    if (!result.applied && result.skipped && !result.skipReason?.includes('Dry-run')) {
      violations.push(`${op.componentKey}::${op.targetState}/${op.property}: ${result.skipReason}`);
    }
  }

  return { results, violations };
}

// =============================================================================
// BUILD SUMMARY
// =============================================================================

/**
 * Build summary from results.
 */
export function buildApplySummary(
  ops: DeltaApplyOp[],
  results: OpApplyResult[]
): DeltaApplySummary {
  const summary: DeltaApplySummary = {
    total: ops.length,
    applied: {
      ast: 0,
      marker: 0,
      override: 0,
      total: 0,
    },
    skipped: {
      blocked: 0,
      notAllowed: 0,
      lowConfidence: 0,
      noMarker: 0,
      notWritable: 0,
      dryRun: 0,
      total: 0,
    },
  };

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const op = ops[i];

    if (result.applied) {
      summary.applied.total++;
      if (result.appliedTarget === 'ast') summary.applied.ast++;
      if (result.appliedTarget === 'marker') summary.applied.marker++;
      if (result.appliedTarget === 'override') summary.applied.override++;
    } else if (result.skipped) {
      summary.skipped.total++;
      const reason = result.skipReason ?? '';

      if (reason.includes('Dry-run')) {
        summary.skipped.dryRun++;
      } else if (reason.includes('Blocked')) {
        summary.skipped.blocked++;
      } else if (reason.includes('not in allow')) {
        summary.skipped.notAllowed++;
      } else if (reason.includes('below threshold')) {
        summary.skipped.lowConfidence++;
      } else if (reason.includes('No marker')) {
        summary.skipped.noMarker++;
      } else if (reason.includes('not auto-writable') || reason.includes('AST')) {
        summary.skipped.notWritable++;
      } else if (op.target === 'blocked') {
        summary.skipped.blocked++;
      }
    }
  }

  return summary;
}

// =============================================================================
// LOAD SUGGESTIONS
// =============================================================================

/**
 * Load suggestions from a suggestion artifact file.
 */
export async function loadSuggestionsFromArtifact(
  artifactPath: string
): Promise<FigmaDeltaSuggestion[]> {
  const content = await readFile(artifactPath, 'utf-8');
  const artifact = JSON.parse(content) as SuggestionArtifact;
  return artifact.suggestions;
}
