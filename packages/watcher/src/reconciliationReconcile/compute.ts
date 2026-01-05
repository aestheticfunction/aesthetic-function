/**
 * @aesthetic-function/watcher - reconciliationReconcile/compute.ts
 *
 * Phase 14A: Single-Entry Reconcile Computation.
 * Phase 14C: CI Wiring (Deterministic Gate + Run Capture).
 *
 * WHY: Runs the core Phase 12-13 read-only analysis sequence for a single
 * source file, producing a single bundle artifact that links all outputs.
 *
 * SCOPE:
 * - Orchestration + artifact plumbing only
 * - No new inference, no new semantics, no new mutation behaviors
 * - Deterministic step order
 * - CI-specific capture and verdict semantics (Phase 14C)
 *
 * CONSTRAINTS:
 * - Same inputs + same artifacts present → same bundle output
 * - Repo-root invariant
 * - Read-only by default
 */

import { dirname, join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import type {
  ReconcileCliOptions,
  ReconcileStepId,
  ReconcileStepResult,
  ReconcileBundleArtifact,
  ReconcileResult,
  ReconcileMode,
  ReconcileOverall,
  ColdStartInfo,
} from './types.js';

import { COLD_START_WARNINGS } from './types.js';

import type { ComparisonClass } from '../reconciliationDrift/types.js';

// Step runners - import main functions from CLI modules
import { main as statusMain } from '../reconciliationStatus/cliStatus.js';
import { main as indexMain } from '../reconciliationIndex/cliIndex.js';
import { main as timelineMain } from '../reconciliationTimeline/cliTimeline.js';
import { main as driftMain } from '../reconciliationDrift/cliDrift.js';
import { main as dashboardMain } from '../reconciliationDashboard/cliDashboard.js';

// Timeline env check
import { isTimelineEnabled } from '../reconciliationTimeline/compute.js';

// Ledger loading for cold-start detection
import { loadRunLedger } from '../reconciliationDrift/compute.js';

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
// GIT SHA HELPER (Phase 14C)
// =============================================================================

/**
 * Get the current git SHA for traceability.
 * Returns undefined if not in a git repo or git command fails.
 */
export function getGitSha(repoRoot: string): string | undefined {
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the short git SHA (first 7 characters).
 */
export function getShortGitSha(repoRoot: string): string | undefined {
  const sha = getGitSha(repoRoot);
  return sha ? sha.slice(0, 7) : undefined;
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
 * Detect cold-start conditions by checking ledger state.
 * Exported for testing (Phase 14D.1).
 */
export async function detectColdStart(repoRoot: string, sourceFile: string): Promise<ColdStartInfo> {
  const warnings: string[] = [];

  // Check if design-materializations exists
  const materializationsDir = join(repoRoot, 'design-materializations');
  if (!existsSync(materializationsDir)) {
    warnings.push(COLD_START_WARNINGS.NO_MATERIALIZATIONS);
  }

  // Try to load the ledger
  const ledgerResult = await loadRunLedger(repoRoot, sourceFile);

  if (!ledgerResult.ok) {
    warnings.push(COLD_START_WARNINGS.NO_LEDGER);
    return {
      ledgerExists: false,
      runCount: 0,
      hasEnoughRuns: false,
      warnings,
    };
  }

  const runCount = ledgerResult.ledger.runs.length;

  // Need at least 2 runs for meaningful drift comparison
  if (runCount < 2) {
    warnings.push(COLD_START_WARNINGS.NO_RUNS);
  }

  return {
    ledgerExists: true,
    runCount,
    hasEnoughRuns: runCount >= 2,
    warnings,
  };
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
 *
 * Phase 14D.1: If cold-start conditions are detected (no ledger or insufficient runs),
 * skip the step gracefully instead of failing.
 */
async function runDriftStep(ctx: StepContext, coldStart: ColdStartInfo): Promise<ReconcileStepResult> {
  const warnings: string[] = [];

  // Phase 14D.1: Handle cold-start conditions
  if (!coldStart.ledgerExists || !coldStart.hasEnoughRuns) {
    // Skip drift step gracefully
    return {
      step: 'drift',
      ok: true,
      exitCode: 0,
      skipped: true,
      summary: 'Skipped: ' + (
        !coldStart.ledgerExists
          ? 'no run ledger (first run)'
          : 'insufficient runs for comparison'
      ),
      warnings: coldStart.warnings,
    };
  }

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
 *
 * Phase 14D.1: If cold-start conditions are detected (no ledger or no runs),
 * skip the step gracefully instead of failing.
 */
async function runDashboardStep(ctx: StepContext, coldStart: ColdStartInfo): Promise<ReconcileStepResult> {
  // Phase 14D.1: Handle cold-start conditions
  // Dashboard needs at least 1 run (unlike drift which needs 2)
  if (!coldStart.ledgerExists || coldStart.runCount === 0) {
    return {
      step: 'dashboard',
      ok: true,
      exitCode: 0,
      skipped: true,
      summary: 'Skipped: no run ledger (first run)',
      warnings: coldStart.warnings,
    };
  }

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
 * Phase 14D.1: Handles cold-start conditions gracefully.
 * If no ledger or insufficient runs exist, drift/dashboard steps are skipped
 * (not failed), and the overall verdict is WARN (not FAIL).
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

  // Phase 14D.1: Detect cold-start conditions before running drift/dashboard
  const coldStart = await detectColdStart(repoRoot, sourceFileCanonical);

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

  // Drift (may skip on cold-start)
  const driftResult = await runDriftStep(ctx, coldStart);
  steps.push(driftResult);
  if (driftResult.artifactPath) artifacts.drift = driftResult.artifactPath;
  if (driftResult.warnings) allWarnings.push(...driftResult.warnings);

  // Dashboard (may skip on cold-start)
  const dashboardResult = await runDashboardStep(ctx, coldStart);
  steps.push(dashboardResult);
  if (dashboardResult.artifactPath) artifacts.dashboard = dashboardResult.artifactPath;
  if (dashboardResult.warnings) allWarnings.push(...dashboardResult.warnings);

  // Compute overall result (Phase 14D.1: skipped steps don't cause FAIL)
  const overall = computeOverall(steps, options.strict ?? false);

  // Compute exit code based on Phase 14C verdict policy
  let exitCode: 0 | 1 | 2 = 0;
  if (steps.some(s => s.exitCode === 2)) {
    exitCode = 2;
  } else if (overall.ciVerdict === 'FAIL') {
    exitCode = 1;
  }

  // Phase 14C: Capture git SHA for traceability
  const gitSha = getGitSha(repoRoot);

  // Phase 14C: Try to extract CI-specific data from artifacts
  const ciData = await extractCiData(sourceFileCanonical, repoRoot);

  // Build bundle artifact with CI-specific fields
  const bundle: ReconcileBundleArtifact = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    repoRoot,
    sourceFileInput: options.sourceFile,
    sourceFileCanonical,
    mode,
    profile: options.profile ?? 'local',
    steps,
    artifacts,
    overall,
    // Phase 14C: CI-specific fields
    gitSha,
    comparisonClass: ciData.comparisonClass,
    comparisonWarnings: ciData.comparisonWarnings,
    dashboardCounts: ciData.dashboardCounts,
    stabilityScore: ciData.stabilityScore,
    signals: ciData.signals,
  };

  return { bundle, exitCode };
}

// =============================================================================
// CI DATA EXTRACTION (Phase 14C)
// =============================================================================

/**
 * CI-specific data extracted from artifacts.
 */
interface CiData {
  comparisonClass?: ComparisonClass;
  comparisonWarnings?: string[];
  dashboardCounts?: { info: number; warn: number; fail: number };
  stabilityScore?: number;
  signals?: string[];
}

/**
 * Extract CI-specific data from existing artifacts.
 * 
 * This reads the drift-diff and drift-dashboard artifacts to extract
 * comparison class, counts, and signals for CI summary.
 */
async function extractCiData(
  sourceFileCanonical: string,
  repoRoot: string
): Promise<CiData> {
  const { readFile } = await import('node:fs/promises');
  const result: CiData = {};

  const normalized = sourceFileCanonical.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');

  // Try to read drift-diff artifact
  try {
    const driftPath = join(repoRoot, 'design-materializations', `${normalized}.figma-drift-diff.json`);
    const driftContent = await readFile(driftPath, 'utf-8');
    const drift = JSON.parse(driftContent);

    // Extract comparison class and warnings
    if (drift.comparisonClass) {
      result.comparisonClass = drift.comparisonClass as ComparisonClass;
    }
    if (drift.comparisonWarnings && Array.isArray(drift.comparisonWarnings)) {
      result.comparisonWarnings = drift.comparisonWarnings;
    }
  } catch {
    // Drift artifact not available - not an error
  }

  // Try to read drift-dashboard artifact
  try {
    const dashboardPath = join(repoRoot, 'design-materializations', `${normalized}.figma-drift-dashboard.json`);
    const dashboardContent = await readFile(dashboardPath, 'utf-8');
    const dashboard = JSON.parse(dashboardContent);

    // Extract counts
    if (dashboard.counts?.bySeverity) {
      result.dashboardCounts = {
        info: dashboard.counts.bySeverity.info ?? 0,
        warn: dashboard.counts.bySeverity.warn ?? 0,
        fail: dashboard.counts.bySeverity.fail ?? 0,
      };
    }

    // Extract stability score
    if (dashboard.stabilityScore?.value !== undefined) {
      result.stabilityScore = dashboard.stabilityScore.value;
    } else if (dashboard.stabilityScore?.score !== undefined) {
      result.stabilityScore = dashboard.stabilityScore.score;
    }

    // Extract top signals as strings
    if (dashboard.topSignals && Array.isArray(dashboard.topSignals)) {
      result.signals = dashboard.topSignals.slice(0, 5).map((s: { label?: string; key?: string }) =>
        s.label ?? s.key ?? 'unknown'
      );
    }
  } catch {
    // Dashboard artifact not available - not an error
  }

  return result;
}

/**
 * Compute overall result from step results.
 *
 * Phase 14C Verdict Policy:
 * - FAIL (exit 1) if:
 *   - Any step has exit code 2 (config/usage error)
 *   - In strict mode: drift INVALID or dashboard fail > 0
 *   - Any step returns exit code 1 in strict mode
 * - WARN (exit 0) if:
 *   - Dashboard has warn > 0 but no fails
 *   - Drift is PARTIAL/WEAK with warnings
 * - PASS (exit 0) if:
 *   - All steps ok, no warnings
 *
 * Phase 14D.1: Skipped steps (cold-start) are treated as WARN, not FAIL.
 * Skipped steps have ok=true, skipped=true, and exitCode=0.
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

  // Phase 14D.1: Separate skipped steps from actual failures
  // Skipped steps have ok=true and skipped=true, so they won't match exitCode === 1
  const skippedSteps = steps.filter(s => s.skipped === true);
  const nonSkippedSteps = steps.filter(s => s.skipped !== true);

  // In strict mode, any actual failure (non-skipped) means overall failure
  if (strict && nonSkippedSteps.some(s => s.exitCode === 1)) {
    // Find which step failed for better explanation
    const failedStep = nonSkippedSteps.find(s => s.exitCode === 1);
    return {
      ok: false,
      ciVerdict: 'FAIL',
      explanation: `Strict mode failure: ${failedStep?.step ?? 'unknown step'} failed`,
    };
  }

  // Check for any warnings (including skipped step warnings)
  const hasWarnings = steps.some(s => s.warnings && s.warnings.length > 0);
  const hasSkipped = skippedSteps.length > 0;

  // If we have skipped steps or warnings, return WARN
  if (hasSkipped || hasWarnings) {
    const skippedNames = skippedSteps.map(s => s.step).join(', ');
    const explanation = hasSkipped
      ? `Cold-start: skipped ${skippedNames} (no ledger data yet)`
      : 'Reconcile completed with warnings';
    return {
      ok: true,
      ciVerdict: 'WARN',
      explanation,
    };
  }

  return {
    ok: true,
    ciVerdict: 'PASS',
    explanation: 'All steps completed successfully',
  };
}
