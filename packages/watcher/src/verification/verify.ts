/**
 * @aesthetic-function/watcher - verification/verify.ts
 *
 * Phase 12G: Post-Apply Verification.
 *
 * WHY: Verifies that applied resolution plans landed as intended.
 * This provides confidence, auditability, and rollback preparedness.
 *
 * SCOPE:
 * - Verification-only (no mutations)
 * - Re-reads targets to confirm values
 * - Detects drift or partial failure
 * - Records previous values for rollback
 *
 * CONSTRAINTS:
 * - Does NOT modify AST, markers, overrides, or Figma
 * - Does NOT re-run apply logic
 * - Does NOT infer intent or auto-correct failures
 * - No retries. No fixes. Observe only.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  VerificationTarget,
  VerificationItem,
  VerificationSummary,
  VerificationReport,
  VerificationContext,
  VerificationConfig,
  LoadedApplyArtifact,
  LoadedPlanArtifact,
} from './types.js';
import type { ResolutionApplyArtifact, ResolutionApplyResultItem } from '../figmaResolveApply/types.js';
import type { ResolutionPlan } from '../figmaDeltaResolution/types.js';
import type { DesignOverrides } from '../reconcile/types.js';

import { getResolveApplyArtifactPath } from '../figmaResolveApply/artifact.js';
import { getResolutionArtifactPath } from '../figmaDeltaResolution/artifact.js';

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

/**
 * Default verification configuration.
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  includeFigma: false,
  serverUrl: 'http://localhost:3001',
  alwaysWriteArtifact: false,
};

// =============================================================================
// CONFIG LOADER
// =============================================================================

/**
 * Load verification configuration from environment variables.
 */
export function loadVerificationConfig(): VerificationConfig {
  return {
    includeFigma: process.env.FIGMA_VERIFY_INCLUDE_FIGMA === 'true',
    serverUrl: process.env.FIGMA_SERVER_URL ?? 'http://localhost:3001',
    alwaysWriteArtifact: process.env.FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT === 'true',
    applyArtifactPath: process.env.FIGMA_VERIFY_APPLY_ARTIFACT_PATH,
    planPath: process.env.FIGMA_VERIFY_PLAN_PATH,
  };
}

// =============================================================================
// LOAD ARTIFACTS
// =============================================================================

/**
 * Load the apply artifact for a source file.
 */
export async function loadApplyArtifact(
  sourceFile: string,
  repoRoot: string,
  customPath?: string
): Promise<LoadedApplyArtifact> {
  const artifactPath = customPath ?? getResolveApplyArtifactPath(sourceFile);
  const fullPath = join(repoRoot, artifactPath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    const artifact = JSON.parse(content) as ResolutionApplyArtifact;
    return {
      success: true,
      artifact,
      loadedFrom: artifactPath,
    };
  } catch (error) {
    return {
      success: false,
      loadedFrom: artifactPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load the resolution plan artifact for a source file.
 */
export async function loadPlanArtifact(
  sourceFile: string,
  repoRoot: string,
  customPath?: string
): Promise<LoadedPlanArtifact> {
  const artifactPath = customPath ?? getResolutionArtifactPath(sourceFile);
  const fullPath = join(repoRoot, artifactPath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    const plan = JSON.parse(content) as ResolutionPlan;
    return {
      success: true,
      plan,
      loadedFrom: artifactPath,
    };
  } catch (error) {
    return {
      success: false,
      loadedFrom: artifactPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// VERIFICATION HELPERS
// =============================================================================

/**
 * Load design-overrides.json.
 */
async function loadOverrides(repoRoot: string): Promise<DesignOverrides | null> {
  const overridesPath = join(repoRoot, 'design-overrides.json');
  try {
    const content = await readFile(overridesPath, 'utf-8');
    return JSON.parse(content) as DesignOverrides;
  } catch {
    return null;
  }
}

/**
 * Load source file content.
 */
async function loadSourceFile(sourceFile: string, repoRoot: string): Promise<string | null> {
  const fullPath = join(repoRoot, sourceFile);
  try {
    return await readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Normalize value for comparison.
 * Handles string/number coercion and case insensitivity for hex colors.
 */
function normalizeValue(value: string | number | undefined): string {
  if (value === undefined) return '';
  const str = String(value).trim();
  // Normalize hex colors to lowercase
  if (str.startsWith('#')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Compare two values for equality.
 */
function valuesMatch(expected: string | number | undefined, observed: string | number | undefined): boolean {
  return normalizeValue(expected) === normalizeValue(observed);
}

// =============================================================================
// TARGET VERIFICATION
// =============================================================================

/**
 * Verify an AST apply result.
 *
 * Re-reads the source file and checks if the value at the recorded location
 * matches the expected value.
 */
async function verifyAstResult(
  result: ResolutionApplyResultItem,
  sourceContent: string,
  _repoRoot: string
): Promise<VerificationItem> {
  const baseItem: Omit<VerificationItem, 'status' | 'reason' | 'observedValue'> = {
    decisionId: result.decisionId,
    componentKey: result.componentKey,
    targetState: result.targetState,
    property: result.property,
    action: result.action,
    target: 'ast',
    expectedValue: result.appliedValue,
    evidence: {
      astLoc: result.evidenceSummary.astLoc,
    },
    previousValue: result.previousValue,
  };

  // If the result was not applied, skip verification
  if (result.status !== 'applied') {
    return {
      ...baseItem,
      status: 'skipped',
      reason: `Apply status was '${result.status}', not 'applied'`,
    };
  }

  // Check if we have location info
  const loc = result.evidenceSummary.astLoc;
  if (!loc) {
    return {
      ...baseItem,
      status: 'blocked',
      reason: 'No AST location recorded in apply result',
    };
  }

  // Extract the line from source
  const lines = sourceContent.split('\n');
  const lineNumber = loc.startLine;
  if (lineNumber < 1 || lineNumber > lines.length) {
    return {
      ...baseItem,
      status: 'missing',
      reason: `Line ${lineNumber} out of range (file has ${lines.length} lines)`,
    };
  }

  const line = lines[lineNumber - 1];

  // Try to find the expected value in the line
  // This is a simplified check - we look for the value in the line
  const expectedStr = normalizeValue(result.appliedValue);

  // Check for the value in various formats
  const valuePatterns = [
    expectedStr,                              // Direct match
    `"${expectedStr}"`,                       // Double quoted
    `'${expectedStr}'`,                       // Single quoted
    `{${expectedStr}}`,                       // JSX expression
    `{${Number(expectedStr)}}`,               // Numeric in JSX
  ];

  let found = false;
  for (const pattern of valuePatterns) {
    if (line.toLowerCase().includes(pattern.toLowerCase())) {
      found = true;
      break;
    }
  }

  if (found) {
    return {
      ...baseItem,
      status: 'verified',
      reason: `Value found at line ${lineNumber}`,
      observedValue: result.appliedValue,
    };
  }

  // Value not found - try to extract what's actually there
  // This is a best-effort extraction
  return {
    ...baseItem,
    status: 'mismatch',
    reason: `Expected value '${expectedStr}' not found at line ${lineNumber}`,
    observedValue: `(line content: ${line.slice(0, 80)}...)`,
  };
}

/**
 * Verify a marker apply result.
 *
 * Re-reads the source file and checks if the marker at the recorded line
 * contains the expected value.
 */
async function verifyMarkerResult(
  result: ResolutionApplyResultItem,
  sourceContent: string,
  _repoRoot: string
): Promise<VerificationItem> {
  const baseItem: Omit<VerificationItem, 'status' | 'reason' | 'observedValue'> = {
    decisionId: result.decisionId,
    componentKey: result.componentKey,
    targetState: result.targetState,
    property: result.property,
    action: result.action,
    target: 'marker',
    expectedValue: result.appliedValue,
    evidence: {
      markerLine: result.evidenceSummary.markerLine,
    },
    previousValue: result.previousValue,
  };

  // If the result was not applied, skip verification
  if (result.status !== 'applied') {
    return {
      ...baseItem,
      status: 'skipped',
      reason: `Apply status was '${result.status}', not 'applied'`,
    };
  }

  const markerLine = result.evidenceSummary.markerLine;
  if (!markerLine) {
    return {
      ...baseItem,
      status: 'blocked',
      reason: 'No marker line recorded in apply result',
    };
  }

  const lines = sourceContent.split('\n');
  if (markerLine < 1 || markerLine > lines.length) {
    return {
      ...baseItem,
      status: 'missing',
      reason: `Marker line ${markerLine} out of range (file has ${lines.length} lines)`,
    };
  }

  const line = lines[markerLine - 1];

  // Check if line is a marker
  if (!line.includes('@figma')) {
    return {
      ...baseItem,
      status: 'missing',
      reason: `Line ${markerLine} is not a @figma marker`,
      observedValue: line.trim(),
    };
  }

  // Check for expected value in marker
  const expectedStr = normalizeValue(result.appliedValue);
  const property = result.property;

  // Look for property=value pattern
  const patterns = [
    `${property}=${expectedStr}`,
    `${property}="${expectedStr}"`,
    `${property}='${expectedStr}'`,
  ];

  for (const pattern of patterns) {
    if (line.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        ...baseItem,
        status: 'verified',
        reason: `Marker at line ${markerLine} contains expected ${property} value`,
        observedValue: result.appliedValue,
      };
    }
  }

  // Value not found - extract current value if possible
  const propRegex = new RegExp(`${property}=(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'i');
  const match = line.match(propRegex);
  const currentValue = match ? (match[1] ?? match[2] ?? match[3]) : undefined;

  return {
    ...baseItem,
    status: 'mismatch',
    reason: `Marker at line ${markerLine} has different ${property} value`,
    observedValue: currentValue ?? '(not found)',
  };
}

/**
 * Verify an override apply result.
 *
 * Re-reads design-overrides.json and checks if the key has the expected value.
 */
async function verifyOverrideResult(
  result: ResolutionApplyResultItem,
  overrides: DesignOverrides | null,
  _repoRoot: string
): Promise<VerificationItem> {
  const overrideKey = result.evidenceSummary.overrideKey ??
    (result.targetState === 'base'
      ? result.componentKey
      : `${result.componentKey}::${result.targetState}`);

  const baseItem: Omit<VerificationItem, 'status' | 'reason' | 'observedValue'> = {
    decisionId: result.decisionId,
    componentKey: result.componentKey,
    targetState: result.targetState,
    property: result.property,
    action: result.action,
    target: 'override',
    expectedValue: result.appliedValue,
    evidence: {
      overrideKey,
    },
    previousValue: result.previousValue,
  };

  // If the result was not applied, skip verification
  if (result.status !== 'applied') {
    return {
      ...baseItem,
      status: 'skipped',
      reason: `Apply status was '${result.status}', not 'applied'`,
    };
  }

  if (!overrides) {
    return {
      ...baseItem,
      status: 'missing',
      reason: 'design-overrides.json not found or not readable',
    };
  }

  const entry = overrides[overrideKey];
  if (!entry) {
    return {
      ...baseItem,
      status: 'missing',
      reason: `Override key '${overrideKey}' not found in design-overrides.json`,
    };
  }

  // Check the property value
  // DesignOverride has: fill?, text?, layout? (with gap, padding, etc.)
  let observedValue: string | number | undefined;
  const property = result.property;

  switch (property) {
    case 'fill':
      observedValue = entry.fill;
      break;
    case 'padding':
      observedValue = entry.layout?.padding;
      break;
    case 'gap':
      observedValue = entry.layout?.gap;
      break;
    case 'fontSize':
    case 'fontWeight':
      // DesignOverride doesn't directly store typography - these would be in text or layout
      observedValue = undefined;
      break;
    default:
      return {
        ...baseItem,
        status: 'blocked',
        reason: `Property '${property}' not supported for override verification`,
      };
  }

  if (valuesMatch(result.appliedValue, observedValue)) {
    return {
      ...baseItem,
      status: 'verified',
      reason: `Override '${overrideKey}' has expected ${property} value`,
      observedValue,
    };
  }

  return {
    ...baseItem,
    status: 'mismatch',
    reason: `Override '${overrideKey}' has different ${property} value`,
    observedValue: observedValue ?? '(not set)',
  };
}

/**
 * Map apply result target to verification target.
 */
function mapApplyTargetToVerificationTarget(target: string): VerificationTarget {
  switch (target) {
    case 'ast':
      return 'ast';
    case 'marker':
      return 'marker';
    case 'override':
      return 'override';
    default:
      return 'ast'; // Fallback
  }
}

// =============================================================================
// MAIN VERIFICATION
// =============================================================================

/**
 * Verify a single apply result.
 */
async function verifyResult(
  result: ResolutionApplyResultItem,
  sourceContent: string | null,
  overrides: DesignOverrides | null,
  context: VerificationContext
): Promise<VerificationItem> {
  const target = result.target;

  // Skip ignored/blocked results
  if (target === 'ignored' || target === 'blocked') {
    return {
      decisionId: result.decisionId,
      componentKey: result.componentKey,
      targetState: result.targetState,
      property: result.property,
      action: result.action,
      target: mapApplyTargetToVerificationTarget(target),
      status: 'skipped',
      reason: `Apply target was '${target}'`,
      evidence: {},
      previousValue: result.previousValue,
    };
  }

  // If source content is needed but not available
  if ((target === 'ast' || target === 'marker') && !sourceContent) {
    return {
      decisionId: result.decisionId,
      componentKey: result.componentKey,
      targetState: result.targetState,
      property: result.property,
      action: result.action,
      target: mapApplyTargetToVerificationTarget(target),
      status: 'blocked',
      reason: 'Source file not readable',
      evidence: {},
      previousValue: result.previousValue,
    };
  }

  switch (target) {
    case 'ast':
      return verifyAstResult(result, sourceContent!, context.repoRoot);
    case 'marker':
      return verifyMarkerResult(result, sourceContent!, context.repoRoot);
    case 'override':
      return verifyOverrideResult(result, overrides, context.repoRoot);
    default:
      return {
        decisionId: result.decisionId,
        componentKey: result.componentKey,
        targetState: result.targetState,
        property: result.property,
        action: result.action,
        target: mapApplyTargetToVerificationTarget(target),
        status: 'skipped',
        reason: `Unknown target type '${target}'`,
        evidence: {},
      };
  }
}

/**
 * Build verification summary from items.
 */
export function buildVerificationSummary(items: VerificationItem[]): VerificationSummary {
  const summary: VerificationSummary = {
    total: items.length,
    verified: 0,
    mismatch: 0,
    missing: 0,
    skipped: 0,
    blocked: 0,
  };

  for (const item of items) {
    switch (item.status) {
      case 'verified':
        summary.verified++;
        break;
      case 'mismatch':
        summary.mismatch++;
        break;
      case 'missing':
        summary.missing++;
        break;
      case 'skipped':
        summary.skipped++;
        break;
      case 'blocked':
        summary.blocked++;
        break;
    }
  }

  return summary;
}

/**
 * Verify a resolution apply artifact.
 *
 * @param applyArtifact - The apply artifact to verify
 * @param planArtifact - The resolution plan that was used (optional)
 * @param context - Verification context
 * @returns Verification report
 */
export async function verifyResolutionApply(
  applyArtifact: ResolutionApplyArtifact,
  planArtifact: ResolutionPlan | undefined,
  context: VerificationContext
): Promise<VerificationReport> {
  // Load source file content
  const sourceContent = await loadSourceFile(applyArtifact.sourceFile, context.repoRoot);

  // Load overrides
  const overrides = await loadOverrides(context.repoRoot);

  // Verify each result
  const items: VerificationItem[] = [];
  for (const result of applyArtifact.results) {
    const item = await verifyResult(result, sourceContent, overrides, context);
    items.push(item);
  }

  // Build summary
  const summary = buildVerificationSummary(items);

  // Build report
  const report: VerificationReport = {
    version: '1.0',
    source: 'figma-verification',
    sourceFile: applyArtifact.sourceFile,
    applyArtifactPath: applyArtifact.planPath,
    planPath: planArtifact ? applyArtifact.planPath.replace('resolve-apply', 'resolution-plan') : applyArtifact.planPath,
    generatedAt: new Date().toISOString(),
    summary,
    items,
  };

  return report;
}

/**
 * Check if verification passed (no mismatches or missing).
 */
export function verificationPassed(report: VerificationReport): boolean {
  return report.summary.mismatch === 0 && report.summary.missing === 0;
}

/**
 * Format verification summary for CLI output.
 */
export function formatVerificationSummary(summary: VerificationSummary): string {
  const lines: string[] = [];
  lines.push('VERIFICATION SUMMARY');
  lines.push(`  ✓ Verified: ${summary.verified}`);
  lines.push(`  ⚠ Mismatch: ${summary.mismatch}`);
  lines.push(`  ✗ Missing:  ${summary.missing}`);
  lines.push(`  ⏭ Skipped:  ${summary.skipped}`);
  lines.push(`  ⊘ Blocked:  ${summary.blocked}`);
  return lines.join('\n');
}
