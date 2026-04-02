/**
 * @aesthetic-function/watcher - artifactInspector/inspect.ts
 *
 * Phase 15D: Artifact Inspection.
 *
 * WHY: Pretty-prints any reconciliation artifact with type-aware formatting.
 * Highlights mismatches, failures, blocked actions, and rollback signals.
 *
 * SCOPE:
 * - Read-only inspection of a single artifact file
 * - Type detection based on filename suffix convention
 * - Key highlight extraction per artifact type
 *
 * CONSTRAINTS:
 * - Pure read-only — no disk writes, no mutations
 * - Works on any artifact file, degrades gracefully for unknown types
 */

import { readFileSync } from 'node:fs';

import type {
  ExtendedArtifactType,
  RecognizedArtifact,
  InspectHighlight,
  InspectResult,
  HighlightLevel,
} from './types.js';
import {
  ARTIFACT_SUFFIX_MAP,
  ARTIFACT_PHASE_MAP,
  ARTIFACT_DISPLAY_NAMES,
} from './types.js';

// =============================================================================
// ARTIFACT TYPE DETECTION
// =============================================================================

/**
 * Detect artifact type from filename.
 *
 * Uses the suffix convention (e.g., `.figma-delta.json`) to identify
 * the artifact type.
 */
export function detectArtifactType(filePath: string): RecognizedArtifact | null {
  for (const [type, suffix] of Object.entries(ARTIFACT_SUFFIX_MAP)) {
    if (filePath.endsWith(suffix)) {
      const t = type as ExtendedArtifactType;
      return {
        type: t,
        phase: ARTIFACT_PHASE_MAP[t],
        displayName: ARTIFACT_DISPLAY_NAMES[t],
      };
    }
  }
  return null;
}

// =============================================================================
// HIGHLIGHT EXTRACTION
// =============================================================================

/**
 * Extract highlights from a status artifact (12J).
 */
function extractStatusHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const status = data.overallStatus as string | undefined;
  const verdict = data.ciVerdict as string | undefined;

  if (status) {
    const level: HighlightLevel =
      status === 'VERIFIED_OK' || status === 'CLEAN' ? 'ok'
      : status === 'VERIFY_FAILED' || status === 'ROLLBACK_AVAILABLE' ? 'fail'
      : 'warn';
    highlights.push({ level, label: 'Status', detail: status });
  }
  if (verdict) {
    const level: HighlightLevel = verdict === 'PASS' ? 'ok' : verdict === 'FAIL' ? 'fail' : 'warn';
    highlights.push({ level, label: 'CI Verdict', detail: verdict });
  }

  return highlights;
}

/**
 * Extract highlights from a verification artifact (12G).
 */
function extractVerificationHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const items = data.items as Array<Record<string, unknown>> | undefined;

  if (items) {
    const mismatch = items.filter((i) => i.result === 'mismatch').length;
    const missing = items.filter((i) => i.result === 'missing').length;
    const passed = items.filter((i) => i.result === 'pass').length;

    if (passed > 0) highlights.push({ level: 'ok', label: 'Passed', detail: `${passed}` });
    if (mismatch > 0) highlights.push({ level: 'fail', label: 'Mismatches', detail: `${mismatch}` });
    if (missing > 0) highlights.push({ level: 'fail', label: 'Missing', detail: `${missing}` });
  }

  return highlights;
}

/**
 * Extract highlights from a conflicts artifact (12D).
 */
function extractConflictsHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const conflicts = data.conflicts as Array<Record<string, unknown>> | undefined;

  if (conflicts) {
    const blocked = conflicts.filter((c) => c.action === 'BLOCK').length;
    highlights.push({ level: 'info', label: 'Total Conflicts', detail: `${conflicts.length}` });
    if (blocked > 0) highlights.push({ level: 'fail', label: 'Blocked', detail: `${blocked}` });
  }

  return highlights;
}

/**
 * Extract highlights from a resolution plan artifact (12E).
 */
function extractResolutionPlanHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const decisions = data.decisions as Array<Record<string, unknown>> | undefined;

  if (decisions) {
    const byAction: Record<string, number> = {};
    for (const d of decisions) {
      const action = (d.action as string) ?? 'unknown';
      byAction[action] = (byAction[action] ?? 0) + 1;
    }
    highlights.push({ level: 'info', label: 'Total Decisions', detail: `${decisions.length}` });
    for (const [action, count] of Object.entries(byAction).sort()) {
      const level: HighlightLevel = action === 'BLOCK' ? 'fail' : action === 'IGNORE' ? 'warn' : 'info';
      highlights.push({ level, label: action, detail: `${count}` });
    }
  }

  return highlights;
}

/**
 * Extract highlights from a resolution apply artifact (12F).
 */
function extractResolutionApplyHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const ops = data.operations as Array<Record<string, unknown>> | undefined;
  const dryRun = data.dryRun as boolean | undefined;

  if (dryRun) highlights.push({ level: 'warn', label: 'Mode', detail: 'dry-run' });
  if (ops) {
    const applied = ops.filter((o) => o.applied === true).length;
    const skipped = ops.filter((o) => o.skipped === true).length;
    const failed = ops.filter((o) => o.failed === true).length;
    highlights.push({ level: 'info', label: 'Total Ops', detail: `${ops.length}` });
    if (applied > 0) highlights.push({ level: 'ok', label: 'Applied', detail: `${applied}` });
    if (skipped > 0) highlights.push({ level: 'warn', label: 'Skipped', detail: `${skipped}` });
    if (failed > 0) highlights.push({ level: 'fail', label: 'Failed', detail: `${failed}` });
  }

  return highlights;
}

/**
 * Extract highlights from a rollback preview artifact (12I).
 */
function extractRollbackPreviewHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const actions = data.actions as Array<Record<string, unknown>> | undefined;

  if (actions && actions.length > 0) {
    highlights.push({ level: 'warn', label: 'Rollback Actions', detail: `${actions.length}` });
    const byTarget: Record<string, number> = {};
    for (const a of actions) {
      const target = (a.target as string) ?? 'unknown';
      byTarget[target] = (byTarget[target] ?? 0) + 1;
    }
    for (const [target, count] of Object.entries(byTarget).sort()) {
      highlights.push({ level: 'info', label: `Target: ${target}`, detail: `${count}` });
    }
  }

  return highlights;
}

/**
 * Extract highlights from a drift diff artifact (13C).
 */
function extractDriftDiffHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const summary = data.summary as Record<string, unknown> | undefined;

  if (summary) {
    const total = (summary.totalChanges as number) ?? 0;
    const fail = (summary.failCount as number) ?? 0;
    const warn = (summary.warnCount as number) ?? 0;
    highlights.push({ level: 'info', label: 'Total Changes', detail: `${total}` });
    if (fail > 0) highlights.push({ level: 'fail', label: 'Fail-Level', detail: `${fail}` });
    if (warn > 0) highlights.push({ level: 'warn', label: 'Warn-Level', detail: `${warn}` });
    if (total === 0) highlights.push({ level: 'ok', label: 'No Drift', detail: 'Clean' });
  }

  return highlights;
}

/**
 * Extract highlights from a drift dashboard artifact (13D).
 */
function extractDriftDashboardHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const score = data.stabilityScore as Record<string, unknown> | undefined;
  const verdict = data.ciVerdict as string | undefined;

  if (score) {
    const value = score.value as number;
    const level: HighlightLevel = value >= 80 ? 'ok' : value >= 50 ? 'warn' : 'fail';
    highlights.push({ level, label: 'Stability Score', detail: `${value}/100` });
  }
  if (verdict) {
    const level: HighlightLevel = verdict === 'PASS' ? 'ok' : verdict === 'FAIL' ? 'fail' : 'warn';
    highlights.push({ level, label: 'CI Verdict', detail: verdict });
  }

  return highlights;
}

/**
 * Extract highlights from a run ledger artifact (13B).
 */
function extractRunLedgerHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const runs = data.runs as Array<Record<string, unknown>> | undefined;

  if (runs) {
    highlights.push({ level: 'info', label: 'Total Runs', detail: `${runs.length}` });
    if (runs.length > 0) {
      const latest = runs[runs.length - 1];
      highlights.push({
        level: 'info',
        label: 'Latest',
        detail: `${latest.command ?? 'unknown'} @ ${latest.timestamp ?? 'unknown'}`,
      });
    }
  }

  return highlights;
}

/**
 * Extract highlights from a reconcile bundle artifact (14C).
 */
function extractReconcileBundleHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const overall = data.overall as Record<string, unknown> | undefined;
  const profile = data.profile as string | undefined;
  const mode = data.mode as string | undefined;

  if (profile) highlights.push({ level: 'info', label: 'Profile', detail: profile });
  if (mode) highlights.push({ level: 'info', label: 'Mode', detail: mode });
  if (overall) {
    const verdict = overall.ciVerdict as string | undefined;
    if (verdict) {
      const level: HighlightLevel = verdict === 'PASS' ? 'ok' : verdict === 'FAIL' ? 'fail' : 'warn';
      highlights.push({ level, label: 'Verdict', detail: verdict });
    }
  }

  const steps = data.steps as Record<string, Record<string, unknown>> | undefined;
  if (steps) {
    for (const [stepName, stepResult] of Object.entries(steps)) {
      if (stepResult.ok === false) {
        highlights.push({ level: 'fail', label: `Step Failed: ${stepName}` });
      }
    }
  }

  return highlights;
}

/**
 * Extract highlights from a delta artifact (12A).
 */
function extractDeltaHighlights(data: Record<string, unknown>): InspectHighlight[] {
  const highlights: InspectHighlight[] = [];
  const deltas = data.deltas as Array<Record<string, unknown>> | undefined;

  if (deltas) {
    highlights.push({ level: 'info', label: 'Total Deltas', detail: `${deltas.length}` });
  }

  return highlights;
}

/**
 * Extract highlights based on artifact type.
 */
function extractHighlights(
  type: ExtendedArtifactType | null,
  data: Record<string, unknown>,
): InspectHighlight[] {
  if (!type) return [];

  switch (type) {
    case 'status': return extractStatusHighlights(data);
    case 'verification': return extractVerificationHighlights(data);
    case 'conflicts': return extractConflictsHighlights(data);
    case 'resolutionPlan': return extractResolutionPlanHighlights(data);
    case 'resolutionApply': return extractResolutionApplyHighlights(data);
    case 'rollbackPreview': return extractRollbackPreviewHighlights(data);
    case 'driftDiff': return extractDriftDiffHighlights(data);
    case 'driftDashboard': return extractDriftDashboardHighlights(data);
    case 'runLedger': return extractRunLedgerHighlights(data);
    case 'reconcileBundle': return extractReconcileBundleHighlights(data);
    case 'delta': return extractDeltaHighlights(data);
    case 'deltaSuggestions': return [{ level: 'info', label: 'Suggestions', detail: `${Array.isArray(data.suggestions) ? data.suggestions.length : 0}` }];
    default: return [];
  }
}

// =============================================================================
// INSPECT
// =============================================================================

/**
 * Inspect a single artifact file.
 *
 * @param artifactPath - Path to the artifact file
 * @returns Inspection result with highlights and formatted output
 */
export function inspectArtifact(artifactPath: string): InspectResult {
  const content = JSON.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown>;
  const artifact = detectArtifactType(artifactPath);
  const highlights = extractHighlights(artifact?.type ?? null, content);

  const formatted = formatInspect(artifactPath, artifact, content, highlights);

  return {
    path: artifactPath,
    artifact,
    content,
    highlights,
    formatted,
  };
}

// =============================================================================
// FORMATTING
// =============================================================================

const HIGHLIGHT_ICONS: Record<HighlightLevel, string> = {
  ok: '✓',
  warn: '⚠',
  fail: '✗',
  info: '·',
};

/**
 * Format inspect result for human-readable CLI output.
 */
function formatInspect(
  path: string,
  artifact: RecognizedArtifact | null,
  content: Record<string, unknown>,
  highlights: InspectHighlight[],
): string {
  const lines: string[] = [];

  // Header
  if (artifact) {
    lines.push(`Artifact: ${artifact.displayName} [Phase ${artifact.phase}]`);
  } else {
    lines.push(`Artifact: (unrecognized type)`);
  }
  lines.push(`Path: ${path}`);

  // Version/timestamp
  if (content.version) lines.push(`Version: ${content.version}`);
  if (content.timestamp) lines.push(`Timestamp: ${content.timestamp}`);
  if (content.generatedAt) lines.push(`Generated: ${content.generatedAt}`);
  if (content.sourceFile) lines.push(`Source: ${content.sourceFile}`);

  // Highlights
  if (highlights.length > 0) {
    lines.push('');
    lines.push('Highlights:');
    for (const h of highlights) {
      const icon = HIGHLIGHT_ICONS[h.level];
      const detail = h.detail ? `: ${h.detail}` : '';
      lines.push(`  ${icon} ${h.label}${detail}`);
    }
  }

  return lines.join('\n');
}
