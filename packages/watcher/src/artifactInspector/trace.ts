/**
 * @aesthetic-function/watcher - artifactInspector/trace.ts
 *
 * Phase 15D: End-to-End Audit Trail Trace.
 *
 * WHY: Aggregates across artifact types to show the full reconciliation
 * lifecycle for a source file. Cross-references with sync-log.md audit
 * entries by requestId.
 *
 * SCOPE:
 * - Read-only lifecycle trace view
 * - Ordered by reconciliation lifecycle stage
 * - Extracts highlights per artifact
 * - Reads reconcile bundle for profile/policy metadata
 *
 * CONSTRAINTS:
 * - Pure read-only — no disk writes, no mutations
 * - Delegates highlight extraction to inspect module
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  getRepoRoot,
  normalizeSourcePath,
} from '../reconciliationIndex/index.js';
import { listArtifacts } from './list.js';
import { inspectArtifact } from './inspect.js';
import type {
  TraceResult,
  TraceStep,
  HighlightLevel,
  ExtendedArtifactType,
} from './types.js';
import { ARTIFACT_PHASE_MAP, ARTIFACT_DISPLAY_NAMES } from './types.js';

// =============================================================================
// LIFECYCLE STEP ORDER
// =============================================================================

/**
 * Lifecycle step order for the trace view.
 * This mirrors the reconciliation pipeline execution order.
 */
const TRACE_STEP_ORDER: ExtendedArtifactType[] = [
  'delta',
  'deltaSuggestions',
  'conflicts',
  'resolutionPlan',
  'resolutionApply',
  'verification',
  'rollbackPreview',
  'status',
  'runLedger',
  'driftDiff',
  'driftDashboard',
  'reconcileBundle',
];

// =============================================================================
// TRACE COMPUTATION
// =============================================================================

/**
 * Produce an end-to-end lifecycle trace for a source file.
 *
 * @param sourceFile - Source file path (relative or absolute)
 * @param repoRoot - Optional explicit repo root
 * @returns Trace result with lifecycle steps and summary
 */
export async function traceArtifacts(
  sourceFile: string,
  repoRoot?: string,
): Promise<TraceResult> {
  const resolvedRoot = repoRoot ?? getRepoRoot();
  const canonical = normalizeSourcePath(sourceFile, resolvedRoot);

  // 1. Get the artifact list (reuses listArtifacts)
  const listResult = await listArtifacts(canonical, resolvedRoot);

  // 2. Build trace steps
  const steps: TraceStep[] = [];
  const highlightCounts = { ok: 0, warn: 0, fail: 0, info: 0 };

  for (let i = 0; i < TRACE_STEP_ORDER.length; i++) {
    const type = TRACE_STEP_ORDER[i];
    const listEntry = listResult.artifacts.find((a) => a.type === type);

    const step: TraceStep = {
      order: i + 1,
      phase: ARTIFACT_PHASE_MAP[type],
      name: ARTIFACT_DISPLAY_NAMES[type],
      found: listEntry?.found ?? false,
      path: listEntry?.path,
      timestamp: listEntry?.timestamp,
      outcome: listEntry?.summary,
      highlights: [],
    };

    // Inspect the artifact for highlights if found
    if (listEntry?.found && listEntry.path) {
      const fullPath = join(resolvedRoot, listEntry.path);
      if (existsSync(fullPath)) {
        try {
          const inspectResult = inspectArtifact(fullPath);
          step.highlights = inspectResult.highlights;
        } catch {
          // Failed to inspect — still include step with no highlights
        }
      }
    }

    // Count highlights
    for (const h of step.highlights) {
      highlightCounts[h.level]++;
    }

    steps.push(step);
  }

  // 3. Extract profile from bundle if available
  let profile: string | undefined;
  let verdict: string | undefined;
  const bundleEntry = listResult.artifacts.find((a) => a.type === 'reconcileBundle');
  if (bundleEntry?.found && bundleEntry.path) {
    const bundlePath = join(resolvedRoot, bundleEntry.path);
    try {
      const bundleData = JSON.parse(readFileSync(bundlePath, 'utf-8'));
      profile = bundleData?.profile;
      verdict = bundleData?.overall?.ciVerdict;
    } catch {
      // Ignore parse errors
    }
  }

  // 4. Fall back to status artifact for verdict
  if (!verdict) {
    const statusEntry = listResult.artifacts.find((a) => a.type === 'status');
    if (statusEntry?.found && statusEntry.path) {
      const statusPath = join(resolvedRoot, statusEntry.path);
      try {
        const statusData = JSON.parse(readFileSync(statusPath, 'utf-8'));
        verdict = statusData?.ciVerdict;
      } catch {
        // Ignore
      }
    }
  }

  const found = steps.filter((s) => s.found).length;
  const missing = steps.filter((s) => !s.found).length;

  return {
    sourceFile: canonical,
    repoRoot: resolvedRoot,
    generatedAt: new Date().toISOString(),
    steps,
    verdict,
    profile,
    summary: {
      total: steps.length,
      found,
      missing,
      highlights: highlightCounts,
    },
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
 * Format trace result for human-readable CLI output.
 */
export function formatTrace(result: TraceResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`Reconciliation Trace: ${result.sourceFile}`);
  lines.push(`Repository: ${result.repoRoot}`);
  if (result.profile) lines.push(`Profile: ${result.profile}`);
  if (result.verdict) lines.push(`Verdict: ${result.verdict}`);
  lines.push(`Artifacts: ${result.summary.found} / ${result.summary.total}`);
  lines.push('');

  // Lifecycle steps
  lines.push('Lifecycle:');
  for (const step of result.steps) {
    const icon = step.found ? '●' : '○';
    const phase = `[${step.phase}]`.padEnd(6);
    const name = step.name.padEnd(25);

    if (step.found) {
      lines.push(`  ${icon} ${step.order.toString().padStart(2)}. ${phase} ${name} ${step.outcome ?? ''}`);

      // Show highlights inline
      for (const h of step.highlights) {
        const hIcon = HIGHLIGHT_ICONS[h.level];
        const detail = h.detail ? `: ${h.detail}` : '';
        lines.push(`           ${hIcon} ${h.label}${detail}`);
      }
    } else {
      lines.push(`  ${icon} ${step.order.toString().padStart(2)}. ${phase} ${name} (no artifact)`);
    }
  }

  // Summary
  lines.push('');
  lines.push('Highlight Summary:');
  const { highlights } = result.summary;
  if (highlights.fail > 0) lines.push(`  ✗ ${highlights.fail} failure(s)`);
  if (highlights.warn > 0) lines.push(`  ⚠ ${highlights.warn} warning(s)`);
  if (highlights.ok > 0) lines.push(`  ✓ ${highlights.ok} ok`);
  if (highlights.info > 0) lines.push(`  · ${highlights.info} info`);

  return lines.join('\n');
}
