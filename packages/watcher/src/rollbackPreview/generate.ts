/**
 * @aesthetic-function/watcher - rollbackPreview/generate.ts
 *
 * Phase 12I: Rollback Preview Generation.
 *
 * WHY: Generates rollback preview from verification failures.
 * Shows exactly what would be undone if a rollback were triggered.
 *
 * SCOPE:
 * - Read-only only (no mutations)
 * - Deterministic ordering
 * - Full provenance tracking
 *
 * CONSTRAINTS:
 * - Does NOT execute any rollback
 * - Does NOT modify any files
 * - Purely informational
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DeltaPropertyType } from '../figmaDelta/types.js';
import type { ResolutionApplyArtifact } from '../figmaResolveApply/types.js';
import type { VerificationReport, VerificationItem } from '../verification/types.js';
import type {
  RollbackAction,
  RollbackPreview,
  RollbackPreviewSummary,
  RollbackPreviewContext,
  LoadedRollbackInputs,
  RollbackTarget,
  RollbackTriggerStatus,
} from './types.js';

// =============================================================================
// ACTION ID GENERATION
// =============================================================================

/**
 * Compute a deterministic action ID for a rollback action.
 *
 * Format: First 16 chars of SHA-256 hash of (componentKey::state::property::target)
 */
export function computeRollbackActionId(
  componentKey: string,
  targetState: string,
  property: DeltaPropertyType,
  target: RollbackTarget
): string {
  const input = `${componentKey}::${targetState}::${property}::${target}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return hash.slice(0, 16);
}

// =============================================================================
// ARTIFACT LOADING
// =============================================================================

/**
 * Get the default apply artifact path for a source file.
 */
export function getDefaultApplyArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-resolve-apply.json`;
}

/**
 * Get the default verification artifact path for a source file.
 */
export function getDefaultVerificationArtifactPath(sourceFile: string): string {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  return `design-materializations/${normalized}.figma-verification.json`;
}

/**
 * Load the apply artifact from disk.
 */
async function loadApplyArtifact(
  artifactPath: string,
  repoRoot: string
): Promise<ResolutionApplyArtifact | null> {
  try {
    const fullPath = join(repoRoot, artifactPath);
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as ResolutionApplyArtifact;
  } catch {
    return null;
  }
}

/**
 * Load the verification artifact from disk.
 */
async function loadVerificationArtifact(
  artifactPath: string,
  repoRoot: string
): Promise<VerificationReport | null> {
  try {
    const fullPath = join(repoRoot, artifactPath);
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as VerificationReport;
  } catch {
    return null;
  }
}

/**
 * Load and validate inputs for rollback preview generation.
 */
export async function loadRollbackInputs(
  context: RollbackPreviewContext
): Promise<LoadedRollbackInputs> {
  // Determine artifact paths
  const applyPath = context.applyArtifactPath ?? getDefaultApplyArtifactPath(context.sourceFile);
  const verifyPath = context.verificationArtifactPath ?? getDefaultVerificationArtifactPath(context.sourceFile);

  // Load apply artifact
  const applyArtifact = await loadApplyArtifact(applyPath, context.repoRoot);
  if (!applyArtifact) {
    return {
      success: false,
      error: `Failed to load apply artifact from: ${applyPath}`,
      applyArtifactPath: applyPath,
    };
  }

  // Load verification artifact
  const verificationArtifact = await loadVerificationArtifact(verifyPath, context.repoRoot);
  if (!verificationArtifact) {
    return {
      success: false,
      error: `Failed to load verification artifact from: ${verifyPath}`,
      applyArtifactPath: applyPath,
      verificationArtifactPath: verifyPath,
    };
  }

  // Extract apply results
  const applyResults = applyArtifact.results.map((r) => ({
    decisionId: r.decisionId,
    componentKey: r.componentKey,
    targetState: r.targetState,
    property: r.property,
    target: r.target,
    appliedValue: r.appliedValue,
    previousValue: r.previousValue,
  }));

  // Extract verification failures (mismatch or missing only)
  const verificationFailures = verificationArtifact.items
    .filter((item): item is VerificationItem & { status: 'mismatch' | 'missing' } =>
      item.status === 'mismatch' || item.status === 'missing'
    )
    .map((item) => ({
      decisionId: item.decisionId,
      componentKey: item.componentKey,
      targetState: item.targetState,
      property: item.property,
      target: item.target,
      status: item.status as RollbackTriggerStatus,
      reason: item.reason,
      expectedValue: item.expectedValue,
      observedValue: item.observedValue,
      previousValue: item.previousValue,
    }));

  return {
    success: true,
    applyArtifactPath: applyPath,
    verificationArtifactPath: verifyPath,
    applyResults,
    verificationFailures,
  };
}

// =============================================================================
// ROLLBACK ACTION GENERATION
// =============================================================================

/**
 * Generate a single rollback action from a verification failure.
 */
function generateRollbackAction(
  failure: NonNullable<LoadedRollbackInputs['verificationFailures']>[0],
  applyResult: NonNullable<LoadedRollbackInputs['applyResults']>[0] | undefined
): RollbackAction {
  // Get values from apply result or verification item
  const appliedValue = applyResult?.appliedValue ?? failure.expectedValue ?? 'unknown';
  const previousValue = applyResult?.previousValue ?? failure.previousValue ?? 'unknown';
  const target = (failure.target as RollbackTarget) ?? 'ast';

  // Build reason based on verification status
  let reason: string;
  if (failure.status === 'mismatch') {
    reason = `Verification mismatch: expected ${appliedValue}, observed ${failure.observedValue}`;
  } else {
    reason = `Verification missing: target not found (${failure.reason})`;
  }

  return {
    actionId: computeRollbackActionId(
      failure.componentKey,
      failure.targetState,
      failure.property,
      target
    ),
    target,
    componentKey: failure.componentKey,
    targetState: failure.targetState,
    property: failure.property,
    appliedValue,
    previousValue,
    sourceApplyOpId: failure.decisionId,
    verificationStatus: failure.status,
    reason,
  };
}

// =============================================================================
// SUMMARY GENERATION
// =============================================================================

/**
 * Build summary statistics from rollback actions.
 */
export function buildRollbackSummary(actions: RollbackAction[]): RollbackPreviewSummary {
  const byTarget: Record<string, number> = {};
  const byProperty: Record<string, number> = {};

  for (const action of actions) {
    // Count by target
    byTarget[action.target] = (byTarget[action.target] ?? 0) + 1;

    // Count by property
    byProperty[action.property] = (byProperty[action.property] ?? 0) + 1;
  }

  return {
    total: actions.length,
    byTarget,
    byProperty,
  };
}

// =============================================================================
// ROLLBACK PREVIEW GENERATION
// =============================================================================

/**
 * Generate a rollback preview from loaded inputs.
 *
 * For each verification failure:
 * 1. Locate the originating apply operation
 * 2. Capture applied value and previous value
 * 3. Produce a rollback action describing what would be reverted
 *
 * Rules:
 * - One rollback action per failed verification item
 * - No deduplication across targets
 * - Preserve full provenance
 * - Deterministic ordering: componentKey → state → property
 */
export function generateRollbackPreview(
  inputs: LoadedRollbackInputs,
  sourceFile: string
): RollbackPreview {
  const actions: RollbackAction[] = [];

  // Create lookup map for apply results by decisionId
  const applyResultMap = new Map(
    (inputs.applyResults ?? []).map((r) => [r.decisionId, r])
  );

  // Generate rollback action for each verification failure
  for (const failure of inputs.verificationFailures ?? []) {
    const applyResult = applyResultMap.get(failure.decisionId);
    const action = generateRollbackAction(failure, applyResult);
    actions.push(action);
  }

  // Sort deterministically: componentKey → state → property
  actions.sort((a, b) => {
    const keyCompare = a.componentKey.localeCompare(b.componentKey);
    if (keyCompare !== 0) return keyCompare;

    const stateCompare = a.targetState.localeCompare(b.targetState);
    if (stateCompare !== 0) return stateCompare;

    return a.property.localeCompare(b.property);
  });

  // Build summary
  const summary = buildRollbackSummary(actions);

  return {
    version: '1.0',
    source: 'figma-rollback-preview',
    sourceFile,
    timestamp: new Date().toISOString(),
    applyArtifactPath: inputs.applyArtifactPath ?? '',
    verificationArtifactPath: inputs.verificationArtifactPath ?? '',
    actions,
    summary,
  };
}

/**
 * Check if rollback preview has any actions.
 */
export function hasRollbackActions(preview: RollbackPreview): boolean {
  return preview.actions.length > 0;
}
