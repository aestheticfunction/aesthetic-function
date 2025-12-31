/**
 * @aesthetic-function/watcher - reconciliationReconcile/compute.ts
 *
 * Phase 14A: Single-Entry Reconcile Computation.
 *
 * WHY: Runs the core Phase 12-13 read-only analysis sequence for a single
 * source file, producing a single bundle artifact that links all outputs.
 *
 * SCOPE:
 * - Orchestration + artifact plumbing only
 * - No new inference, no new semantics, no new mutation behaviors
 * - Deterministic step order
 *
 * CONSTRAINTS:
 * - Same inputs + same artifacts present → same bundle output
 * - Repo-root invariant
 * - Read-only by default
 */

import { dirname, join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import type {
  ReconcileCliOptions,
  ReconcileStepId,
  ReconcileStepResult,
  ReconcileBundleArtifact,
  ReconcileResult,
  ReconcileMode,
  ReconcileOverall,
} from './types.js';

// Step runners - import main functions from CLI modules
import { main as statusMain } from '../reconciliationStatus/cliStatus.js';
import { main as indexMain } from '../reconciliationIndex/cliIndex.js';
import { main as timelineMain } from '../reconciliationTimeline/cliTimeline.js';
import { main as driftMain } from '../reconciliationDrift/cliDrift.js';
import { main as dashboardMain } from '../reconciliationDashboard/cliDashboard.js';

// Timeline env check
import { isTimelineEnabled } from '../reconciliationTimeline/compute.js';

// =============================================================================
// REPO ROOT DETECTION
// =============================================================================

/** High-priority markers that definitively indicate repository root */
const REPO_ROOT_PRIMARY_MARKERS = ['pnpm-workspace.yaml', '.git'];

/** Fallback marker (less reliable in monorepos) */
const REPO_ROOT_FALLBACK_MARKER = 'package.json';

/**
 * Get the repository root directory.
 *
 * Looks for pnpm-workspace.yaml or .git directory first (primary markers).
 * Falls back to package.json only if primary markers not found.
 * This ensures correct behavior in monorepos where each package has package.json.
 *
 * @param startDir - Starting directory (defaults to process.cwd())
 * @returns Absolute path to the repository root
 */
export function getRepoRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);
  const fsRoot = dirname(currentDir) === currentDir ? currentDir : '/';

  // First pass: look for primary markers (pnpm-workspace.yaml or .git)
  let checkDir = currentDir;
  while (checkDir !== fsRoot) {
    for (const marker of REPO_ROOT_PRIMARY_MARKERS) {
      const markerPath = join(checkDir, marker);
      if (existsSync(markerPath)) {
        return checkDir;
      }
    }
    checkDir = dirname(checkDir);
  }

  // Second pass: fallback to package.json if no primary marker found
  checkDir = currentDir;
  while (checkDir !== fsRoot) {
    const markerPath = join(checkDir, REPO_ROOT_FALLBACK_MARKER);
    if (existsSync(markerPath)) {
      return checkDir;
    }
    checkDir = dirname(checkDir);
  }

  // Final fallback to process.cwd()
  return process.cwd();
}

/**
 * Normalize a source file path to be repo-relative (canonical).
 *
 * Handles:
 * - Relative paths with ../ (e.g., ../../demo-app/src/App.tsx)
 * - Paths with ./ (e.g., ./demo-app/src/App.tsx)
 * - Absolute paths (e.g., /Users/.../demo-app/src/App.tsx)
 * - Backslashes (Windows)
 *
 * @param sourceFile - Raw source file path from user
 * @param repoRoot - Repository root directory
 * @returns Canonical repo-relative path (forward slashes, no leading ./)
 */
export function normalizeSourcePath(sourceFile: string, repoRoot: string): string {
  // Convert backslashes to forward slashes
  let normalized = sourceFile.replace(/\\/g, '/');

  // If absolute path, make relative to repo root
  if (normalized.startsWith('/')) {
    normalized = relative(repoRoot, normalized);
  }

  // Resolve any ../ or ./ by combining with repo root and making relative again
  const resolved = resolve(repoRoot, normalized);
  normalized = relative(repoRoot, resolved);

  // Convert any remaining backslashes
  normalized = normalized.replace(/\\/g, '/');

  // Remove leading ./ if present
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

// =============================================================================
// STEP RUNNERS
// =============================================================================

/**
 * Context for running a step.
 */
interface StepContext {
  sourceFile: string;
  repoRoot: string;
  write: boolean;
  verbose: boolean;
  strict: boolean;
  record: boolean;
  limit: number;
}

/**
 * Run the status step.
 */
async function runStatusStep(ctx: StepContext): Promise<ReconcileStepResult> {
  const args: string[] = [ctx.sourceFile, '--repo-root', ctx.repoRoot];
  if (ctx.write) args.push('--write');
  if (ctx.verbose) args.push('--verbose');

  try {
    // Import dynamically to avoid circular dependencies with CLI main
    const exitCode = await statusMain(args);
    const artifactPath = ctx.write
      ? `design-materializations/${ctx.sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '')}.figma-reconciliation-status.json`
      : undefined;

    return {
      step: 'status',
      ok: exitCode === 0,
      exitCode: exitCode as 0 | 1 | 2,
      artifactPath,
      summary: exitCode === 0 ? 'Status computed' : 'Status check failed',
    };
  } catch (error) {
    return {
      step: 'status',
      ok: false,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run the index step.
 */
async function runIndexStep(ctx: StepContext): Promise<ReconcileStepResult> {
  const args: string[] = [ctx.sourceFile, '--repo-root', ctx.repoRoot];
  if (ctx.write) args.push('--write');
  if (ctx.verbose) args.push('--verbose');

  try {
    const exitCode = await indexMain(args);
    const artifactPath = ctx.write
      ? `design-materializations/${ctx.sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '')}.figma-run-index.json`
      : undefined;

    return {
      step: 'index',
      ok: exitCode === 0,
      exitCode: exitCode as 0 | 1 | 2,
      artifactPath,
      summary: exitCode === 0 ? 'Index computed' : 'Index computation failed',
    };
  } catch (error) {
    return {
      step: 'index',
      ok: false,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run the timeline step.
 */
async function runTimelineStep(ctx: StepContext, recordEnabled: boolean): Promise<ReconcileStepResult> {
  const warnings: string[] = [];
  const args: string[] = [ctx.sourceFile, '--repo-root', ctx.repoRoot];
  if (ctx.write) args.push('--write');
  if (ctx.verbose) args.push('--verbose');

  // Handle dual-gated record behavior
  if (ctx.record) {
    if (recordEnabled) {
      args.push('--record');
    } else {
      warnings.push('--record requested but RECONCILIATION_TIMELINE_ON is not set to "true"');
    }
  }

  try {
    const exitCode = await timelineMain(args);
    const artifactPath = ctx.write
      ? `design-materializations/${ctx.sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '')}.figma-run-ledger.json`
      : undefined;

    return {
      step: 'timeline',
      ok: exitCode === 0,
      exitCode: exitCode as 0 | 1 | 2,
      artifactPath,
      summary: exitCode === 0 ? 'Timeline loaded' : 'Timeline failed',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      step: 'timeline',
      ok: false,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Run the drift step.
 */
async function runDriftStep(ctx: StepContext): Promise<ReconcileStepResult> {
  const warnings: string[] = [];
  const args: string[] = [ctx.sourceFile, '--repo-root', ctx.repoRoot];
  if (ctx.write) args.push('--write');
  if (ctx.verbose) args.push('--verbose');
  if (ctx.strict) args.push('--strict');

  try {
    const exitCode = await driftMain(args);

    // In non-strict mode, treat INVALID/WEAK comparison as warning, not failure
    if (!ctx.strict && exitCode === 1) {
      warnings.push('Drift comparison had issues (INVALID/WEAK); ignored in non-strict mode');
    }

    const artifactPath = ctx.write
      ? `design-materializations/${ctx.sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '')}.figma-drift-diff.json`
      : undefined;

    return {
      step: 'drift',
      ok: ctx.strict ? exitCode === 0 : true, // In non-strict, always ok
      exitCode: ctx.strict ? (exitCode as 0 | 1 | 2) : 0,
      artifactPath,
      summary: exitCode === 0 ? 'Drift computed' : (ctx.strict ? 'Drift check failed (strict)' : 'Drift computed (with warnings)'),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      step: 'drift',
      ok: false,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Run the dashboard step.
 */
async function runDashboardStep(ctx: StepContext): Promise<ReconcileStepResult> {
  const args: string[] = [ctx.sourceFile, '--repo-root', ctx.repoRoot];
  if (ctx.write) args.push('--write');
  if (ctx.verbose) args.push('--verbose');
  if (ctx.strict) args.push('--strict');
  if (ctx.limit) args.push('--limit', String(ctx.limit));

  try {
    const exitCode = await dashboardMain(args);
    const artifactPath = ctx.write
      ? `design-materializations/${ctx.sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '')}.figma-drift-dashboard.json`
      : undefined;

    return {
      step: 'dashboard',
      ok: exitCode === 0,
      exitCode: exitCode as 0 | 1 | 2,
      artifactPath,
      summary: exitCode === 0 ? 'Dashboard computed' : 'Dashboard failed',
    };
  } catch (error) {
    return {
      step: 'dashboard',
      ok: false,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// MAIN RECONCILE FUNCTION
// =============================================================================

/**
 * Run the full reconcile sequence for a source file.
 *
 * Executes steps in deterministic order:
 * 1. status
 * 2. index
 * 3. timeline
 * 4. drift
 * 5. dashboard
 *
 * @param options - CLI options
 * @returns Bundle artifact and exit code
 */
export async function runReconcile(options: ReconcileCliOptions): Promise<ReconcileResult> {
  // Resolve repo root
  const repoRoot = options.repoRoot
    ? resolve(options.repoRoot)
    : getRepoRoot();

  // Normalize source path
  const sourceFileCanonical = normalizeSourcePath(options.sourceFile, repoRoot);

  // Determine mode
  const timelineEnabled = isTimelineEnabled();
  const mode: ReconcileMode = options.record && timelineEnabled ? 'record' : 'read-only';

  // Build step context
  const ctx: StepContext = {
    sourceFile: sourceFileCanonical,
    repoRoot,
    write: options.write !== false, // Default true
    verbose: options.verbose ?? false,
    strict: options.strict ?? false,
    record: options.record ?? false,
    limit: options.limit ?? 10,
  };

  // Run steps in deterministic order
  const steps: ReconcileStepResult[] = [];
  const artifacts: Partial<Record<ReconcileStepId, string>> = {};
  const allWarnings: string[] = [];

  // Status
  const statusResult = await runStatusStep(ctx);
  steps.push(statusResult);
  if (statusResult.artifactPath) artifacts.status = statusResult.artifactPath;
  if (statusResult.warnings) allWarnings.push(...statusResult.warnings);

  // Index
  const indexResult = await runIndexStep(ctx);
  steps.push(indexResult);
  if (indexResult.artifactPath) artifacts.index = indexResult.artifactPath;
  if (indexResult.warnings) allWarnings.push(...indexResult.warnings);

  // Timeline
  const timelineResult = await runTimelineStep(ctx, timelineEnabled);
  steps.push(timelineResult);
  if (timelineResult.artifactPath) artifacts.timeline = timelineResult.artifactPath;
  if (timelineResult.warnings) allWarnings.push(...timelineResult.warnings);

  // Drift
  const driftResult = await runDriftStep(ctx);
  steps.push(driftResult);
  if (driftResult.artifactPath) artifacts.drift = driftResult.artifactPath;
  if (driftResult.warnings) allWarnings.push(...driftResult.warnings);

  // Dashboard
  const dashboardResult = await runDashboardStep(ctx);
  steps.push(dashboardResult);
  if (dashboardResult.artifactPath) artifacts.dashboard = dashboardResult.artifactPath;
  if (dashboardResult.warnings) allWarnings.push(...dashboardResult.warnings);

  // Compute overall result
  const overall = computeOverall(steps, options.strict ?? false);

  // Compute exit code
  let exitCode: 0 | 1 | 2 = 0;
  if (steps.some(s => s.exitCode === 2)) {
    exitCode = 2;
  } else if (options.strict && steps.some(s => s.exitCode === 1)) {
    exitCode = 1;
  }

  // Build bundle artifact
  const bundle: ReconcileBundleArtifact = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    repoRoot,
    sourceFileInput: options.sourceFile,
    sourceFileCanonical,
    mode,
    steps,
    artifacts,
    overall,
  };

  return { bundle, exitCode };
}

/**
 * Compute overall result from step results.
 */
function computeOverall(steps: ReconcileStepResult[], strict: boolean): ReconcileOverall {
  // Check for usage/config errors first
  if (steps.some(s => s.exitCode === 2)) {
    return {
      ok: false,
      ciVerdict: 'FAIL',
      explanation: 'Usage/config error in one or more steps',
    };
  }

  // In strict mode, any failure means overall failure
  if (strict && steps.some(s => s.exitCode === 1)) {
    return {
      ok: false,
      ciVerdict: 'FAIL',
      explanation: 'Strict mode failure in one or more steps',
    };
  }

  // Check for any non-strict failures (warnings)
  const hasWarnings = steps.some(s => s.warnings && s.warnings.length > 0);

  return {
    ok: true,
    ciVerdict: hasWarnings ? 'WARN' : 'PASS',
    explanation: hasWarnings
      ? 'Reconcile completed with warnings'
      : 'All steps completed successfully',
  };
}
