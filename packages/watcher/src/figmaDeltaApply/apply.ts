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
 * Apply an operation to AST.
 *
 * Delegates to existing materializeAstWrite pipeline.
 */
async function applyToAst(
  op: DeltaApplyOp,
  _sourceCode: string,
  filePath: string,
  _repoRoot: string,
  dryRun: boolean
): Promise<OpApplyResult> {
  const astLoc = op.evidence.astLoc;
  if (!astLoc) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: 'No AST location in evidence',
    };
  }

  // For now, AST writes are not fully implemented in Phase 12C
  // They require integration with the full materializeAstWrite pipeline
  // which needs WriteFeasibilityReport etc.

  // This is a placeholder that returns a "not implemented" result
  // Full implementation would:
  // 1. Parse AST with Babel
  // 2. Find the value at astLoc
  // 3. Replace if it's a literal
  // 4. Regenerate code

  if (dryRun) {
    return {
      opId: op.opId,
      applied: false,
      skipped: true,
      skipReason: `Dry-run mode: would update AST at L${astLoc.startLine}`,
      appliedTarget: 'ast',
      appliedLocation: `${filePath}:${astLoc.startLine}`,
    };
  }

  // For Phase 12C MVP, AST writes require WriteFeasibility which we may not have
  // Return as skipped with explanation
  return {
    opId: op.opId,
    applied: false,
    skipped: true,
    skipReason: 'AST writes require WriteFeasibilityReport (not provided)',
    appliedTarget: 'ast',
    appliedLocation: `${filePath}:${astLoc.startLine}`,
  };
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
