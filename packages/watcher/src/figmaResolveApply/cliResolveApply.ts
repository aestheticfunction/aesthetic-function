#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - figmaResolveApply/cliResolveApply.ts
 *
 * CLI tool for applying resolution plans (Phase 12F).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:resolve-apply <file> [options]
 *
 * Options:
 *   --from <path>      Use custom plan artifact path
 *   --apply            Set mode to 'apply' (still requires env flags for actual writes)
 *   --component <key>  Filter by component key
 *   --state <state>    Filter by state (base, hover, etc.)
 *
 * Environment Variables:
 *   FIGMA_RESOLVE_APPLY_ON=true          Master switch
 *   FIGMA_RESOLVE_APPLY_MODE=apply       Apply mode (default: artifact)
 *   FIGMA_RESOLVE_APPLY_DRY_RUN=false    Disable dry-run
 *   FIGMA_RESOLVE_APPLY_ALLOW=ast,marker,override  Allowed targets
 *   FIGMA_RESOLVE_APPLY_MIN_CONFIDENCE=high        Min confidence
 *   FIGMA_RESOLVE_PLAN_PATH=<path>       Custom plan path
 *
 * For AST writes, also set:
 *   AST_WRITE_MODE=write
 *   AST_WRITE_DRY_RUN=false
 */

import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadResolveApplyConfig,
  formatResolveApplyConfig,
  getResolvePreconditionStatus,
  isResolveApplyModeEnabled,
} from './config.js';
import {
  loadResolutionPlan,
  executeResolutionPlan,
  buildResolveSummary,
} from './apply.js';
import {
  buildResolveApplyArtifact,
  writeResolveApplyArtifact,
  appendResolveApplyToAuditLog,
} from './artifact.js';

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
// CLI ARGUMENT PARSING
// =============================================================================

interface CliArgs {
  file: string;
  fromPath?: string;
  applyFlag: boolean;
  componentFilter?: string;
  stateFilter?: string;
}

function parseArgs(args: string[]): CliArgs | null {
  if (args.length === 0) {
    return null;
  }

  const result: CliArgs = {
    file: '',
    applyFlag: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--from' && i + 1 < args.length) {
      result.fromPath = args[i + 1];
      i += 2;
    } else if (arg === '--apply') {
      result.applyFlag = true;
      i += 1;
    } else if (arg === '--component' && i + 1 < args.length) {
      result.componentFilter = args[i + 1];
      i += 2;
    } else if (arg === '--state' && i + 1 < args.length) {
      result.stateFilter = args[i + 1];
      i += 2;
    } else if (!arg.startsWith('--') && !result.file) {
      result.file = arg;
      i += 1;
    } else {
      i += 1;
    }
  }

  if (!result.file) {
    return null;
  }

  return result;
}

// =============================================================================
// CLI OUTPUT
// =============================================================================

function printHeader(title: string): void {
  console.log();
  console.log('='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printSection(title: string): void {
  console.log();
  console.log(`--- ${title} ---`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher figma:resolve-apply <file> [options]');
    console.error();
    console.error('Options:');
    console.error('  --from <path>      Use custom plan artifact path');
    console.error('  --apply            Set mode to apply (still requires env flags)');
    console.error('  --component <key>  Filter by component key');
    console.error('  --state <state>    Filter by state (base, hover, etc.)');
    console.error();
    console.error('Environment Variables:');
    console.error('  FIGMA_RESOLVE_APPLY_ON=true');
    console.error('  FIGMA_RESOLVE_APPLY_MODE=apply');
    console.error('  FIGMA_RESOLVE_APPLY_DRY_RUN=false');
    console.error('  FIGMA_RESOLVE_APPLY_ALLOW=ast,marker,override');
    console.error('  FIGMA_RESOLVE_APPLY_MIN_CONFIDENCE=high');
    console.error();
    console.error('Example:');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx');
    console.error();
    console.error('Full apply (opt-in):');
    console.error('  FIGMA_RESOLVE_APPLY_ON=true FIGMA_RESOLVE_APPLY_MODE=apply FIGMA_RESOLVE_APPLY_DRY_RUN=false \\');
    console.error('    pnpm --filter @aesthetic-function/watcher figma:resolve-apply demo-app/src/App.tsx --apply');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const absolutePath = resolve(repoRoot, parsed.file);
  const relativePath = relative(repoRoot, absolutePath);

  printHeader('RESOLUTION PLAN APPLICATION (Phase 12F)');
  console.log(`  Source file: ${relativePath}`);

  // Load configuration
  let config = loadResolveApplyConfig();

  // Override mode if --apply flag is set
  if (parsed.applyFlag) {
    config = { ...config, mode: 'apply' };
  }

  // Override plan path if --from is set
  if (parsed.fromPath) {
    config = { ...config, planPath: parsed.fromPath };
  }

  printSection('Configuration');
  console.log(formatResolveApplyConfig(config));

  // Show filters if set
  if (parsed.componentFilter || parsed.stateFilter) {
    printSection('Filters');
    if (parsed.componentFilter) {
      console.log(`  component: ${parsed.componentFilter}`);
    }
    if (parsed.stateFilter) {
      console.log(`  state: ${parsed.stateFilter}`);
    }
  }

  // Check preconditions
  printSection('Preconditions');
  const preconditions = getResolvePreconditionStatus(config);
  if (preconditions.canApply) {
    console.log('  ✓ All preconditions met for apply mode');
  } else {
    console.log('  ⚠ Apply mode not enabled:');
    for (const reason of preconditions.reasons) {
      console.log(`    - ${reason}`);
    }
    console.log();
    console.log('  Mode: ARTIFACT-ONLY (no mutations)');
  }

  // Load resolution plan
  printSection('Loading Resolution Plan');
  const loadResult = await loadResolutionPlan(relativePath, repoRoot, config.planPath);

  if (!loadResult.success) {
    console.error(`  ✗ Failed to load plan: ${loadResult.error}`);
    console.error(`  Tried: ${loadResult.loadedFrom}`);
    console.error();
    console.error('  Run figma:resolve first to generate a resolution plan:');
    console.error(`    pnpm --filter @aesthetic-function/watcher figma:resolve ${relativePath}`);
    process.exit(1);
  }

  console.log(`  ✓ Loaded from: ${loadResult.loadedFrom}`);
  console.log(`  Generated at: ${loadResult.plan.generatedAt}`);
  console.log(`  Decisions: ${loadResult.plan.decisions.length}`);

  // Execute plan
  printSection('Executing Resolution Plan');
  const results = await executeResolutionPlan({
    plan: loadResult.plan,
    config,
    componentFilter: parsed.componentFilter,
    stateFilter: parsed.stateFilter,
    repoRoot,
  });

  // Build summary
  const summary = buildResolveSummary(loadResult.plan.decisions.length, results);

  console.log();
  console.log(`  Total decisions: ${summary.decisionsTotal}`);
  console.log(`  Attempted:       ${summary.attempted}`);
  console.log(`  Applied:         ${summary.applied}`);
  console.log(`  No-op:           ${summary.noop}`);
  console.log(`  Skipped:         ${summary.skipped}`);
  console.log(`  Blocked:         ${summary.blocked}`);
  console.log(`  Failed:          ${summary.failed}`);

  // Show failed details
  const failures = results.filter((r) => r.status === 'failed');
  if (failures.length > 0) {
    printSection('Failures');
    for (const failure of failures) {
      console.log(`  ✗ ${failure.componentKey}::${failure.targetState}::${failure.property}`);
      console.log(`    Action: ${failure.action}`);
      console.log(`    Error: ${failure.error}`);
    }
  }

  // Build and write artifact
  printSection('Writing Artifact');
  const artifact = buildResolveApplyArtifact(
    relativePath,
    loadResult.loadedFrom,
    config.mode,
    config.dryRun,
    summary,
    results
  );

  const artifactPath = await writeResolveApplyArtifact(artifact, repoRoot);
  console.log(`  ✓ Written to: ${artifactPath}`);

  // Append to audit log (only for actual applies)
  if (isResolveApplyModeEnabled(config)) {
    await appendResolveApplyToAuditLog(artifact, repoRoot);
    console.log('  ✓ Appended to sync-log.md');
  }

  // Final status
  printHeader('COMPLETE');
  if (config.mode === 'artifact' || config.dryRun) {
    console.log('  Mode: ARTIFACT-ONLY — no files were modified');
    console.log();
    console.log('  To apply changes, run with:');
    console.log('    FIGMA_RESOLVE_APPLY_ON=true FIGMA_RESOLVE_APPLY_MODE=apply FIGMA_RESOLVE_APPLY_DRY_RUN=false \\');
    console.log(`      pnpm --filter @aesthetic-function/watcher figma:resolve-apply ${relativePath} --apply`);
  } else {
    console.log(`  Applied: ${summary.applied} | No-op: ${summary.noop} | Failed: ${summary.failed}`);
  }
  console.log();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
