#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - verification/cliVerify.ts
 *
 * CLI tool for post-apply verification (Phase 12G).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:verify <file> [options]
 *
 * Options:
 *   --apply-artifact <path>   Custom apply artifact path
 *   --plan <path>             Custom resolution plan path
 *   --always-write            Always write artifact (not just on failures)
 *   --include-figma           Include Figma node verification (requires server)
 *
 * Exit codes:
 *   0 - All verified or skipped
 *   1 - Mismatches or missing items found
 *
 * Environment Variables:
 *   FIGMA_VERIFY_INCLUDE_FIGMA=true        Include Figma verification
 *   FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT=true  Always write artifact
 *   FIGMA_SERVER_URL=http://localhost:3001   Server URL for Figma queries
 */

import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadVerificationConfig,
  loadApplyArtifact,
  loadPlanArtifact,
  verifyResolutionApply,
  verificationPassed,
  formatVerificationSummary,
} from './verify.js';
import {
  writeVerificationArtifact,
  appendVerificationToAuditLog,
  shouldWriteArtifact,
  getVerificationExitCode,
} from './artifact.js';
import type { VerificationConfig, VerificationContext } from './types.js';

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
  applyArtifactPath?: string;
  planPath?: string;
  alwaysWrite: boolean;
  includeFigma: boolean;
}

function parseArgs(args: string[]): CliArgs | null {
  if (args.length === 0) {
    return null;
  }

  const result: CliArgs = {
    file: '',
    alwaysWrite: false,
    includeFigma: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--apply-artifact' && i + 1 < args.length) {
      result.applyArtifactPath = args[i + 1];
      i += 2;
    } else if (arg === '--plan' && i + 1 < args.length) {
      result.planPath = args[i + 1];
      i += 2;
    } else if (arg === '--always-write') {
      result.alwaysWrite = true;
      i += 1;
    } else if (arg === '--include-figma') {
      result.includeFigma = true;
      i += 1;
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
    console.error('Usage: pnpm --filter @aesthetic-function/watcher figma:verify <file> [options]');
    console.error();
    console.error('Options:');
    console.error('  --apply-artifact <path>   Custom apply artifact path');
    console.error('  --plan <path>             Custom resolution plan path');
    console.error('  --always-write            Always write artifact (not just on failures)');
    console.error('  --include-figma           Include Figma node verification');
    console.error();
    console.error('Exit codes:');
    console.error('  0 - All verified or skipped');
    console.error('  1 - Mismatches or missing items found');
    console.error();
    console.error('Example:');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:verify demo-app/src/App.tsx');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const absolutePath = resolve(repoRoot, parsed.file);
  const relativePath = relative(repoRoot, absolutePath);

  printHeader('POST-APPLY VERIFICATION (Phase 12G)');
  console.log(`  Source file: ${relativePath}`);

  // Load configuration
  const config = loadVerificationConfig();

  // Apply CLI overrides
  const effectiveConfig: VerificationConfig = {
    ...config,
    alwaysWriteArtifact: parsed.alwaysWrite || config.alwaysWriteArtifact,
    includeFigma: parsed.includeFigma || config.includeFigma,
    applyArtifactPath: parsed.applyArtifactPath ?? config.applyArtifactPath,
    planPath: parsed.planPath ?? config.planPath,
  };

  printSection('Configuration');
  console.log(`  includeFigma:       ${effectiveConfig.includeFigma ? 'YES' : 'NO'}`);
  console.log(`  alwaysWriteArtifact: ${effectiveConfig.alwaysWriteArtifact ? 'YES' : 'NO'}`);
  console.log(`  serverUrl:          ${effectiveConfig.serverUrl}`);

  // Load apply artifact
  printSection('Loading Apply Artifact');
  const applyResult = await loadApplyArtifact(
    relativePath,
    repoRoot,
    effectiveConfig.applyArtifactPath
  );

  if (!applyResult.success || !applyResult.artifact) {
    console.error(`  ✗ Failed to load apply artifact: ${applyResult.error}`);
    console.error(`  Tried: ${applyResult.loadedFrom}`);
    console.error();
    console.error('  Run figma:resolve-apply first to generate an apply artifact:');
    console.error(`    pnpm --filter @aesthetic-function/watcher figma:resolve-apply ${relativePath}`);
    process.exit(1);
  }

  console.log(`  ✓ Loaded from: ${applyResult.loadedFrom}`);
  console.log(`  Generated at: ${applyResult.artifact.generatedAt}`);
  console.log(`  Mode: ${applyResult.artifact.mode}`);
  console.log(`  Dry-run: ${applyResult.artifact.dryRun}`);
  console.log(`  Results: ${applyResult.artifact.results.length}`);

  // Load resolution plan (optional, for enhanced context)
  printSection('Loading Resolution Plan');
  const planResult = await loadPlanArtifact(
    relativePath,
    repoRoot,
    effectiveConfig.planPath
  );

  let planForVerify: typeof planResult.plan | undefined;
  if (planResult.success && planResult.plan) {
    console.log(`  ✓ Loaded from: ${planResult.loadedFrom}`);
    console.log(`  Decisions: ${planResult.plan.decisions.length}`);
    planForVerify = planResult.plan;
  } else {
    console.log(`  ⚠ Plan not loaded: ${planResult.error}`);
    console.log('  (Verification will proceed without plan context)');
  }

  // Run verification
  printSection('Running Verification');
  const context: VerificationContext = {
    repoRoot,
    sourceFile: relativePath,
    includeFigma: effectiveConfig.includeFigma,
    serverUrl: effectiveConfig.serverUrl,
  };

  const report = await verifyResolutionApply(
    applyResult.artifact,
    planForVerify,
    context
  );

  // Print summary
  console.log();
  console.log(formatVerificationSummary(report.summary));

  // Print issues if any
  const issues = report.items.filter(
    (item) => item.status === 'mismatch' || item.status === 'missing'
  );

  if (issues.length > 0) {
    printSection('Issues Found');
    for (const issue of issues) {
      const icon = issue.status === 'mismatch' ? '⚠' : '✗';
      console.log(`  ${icon} ${issue.componentKey}::${issue.targetState}::${issue.property}`);
      console.log(`    Status: ${issue.status}`);
      console.log(`    Reason: ${issue.reason}`);
      if (issue.expectedValue !== undefined) {
        console.log(`    Expected: ${issue.expectedValue}`);
      }
      if (issue.observedValue !== undefined) {
        console.log(`    Observed: ${issue.observedValue}`);
      }
      console.log();
    }
  }

  // Write artifact if needed
  if (shouldWriteArtifact(report, effectiveConfig.alwaysWriteArtifact)) {
    printSection('Writing Artifact');
    const artifactPath = await writeVerificationArtifact(report, repoRoot);
    console.log(`  ✓ Written to: ${artifactPath}`);

    // Append to audit log for failures
    if (!verificationPassed(report)) {
      await appendVerificationToAuditLog(report, repoRoot);
      console.log('  ✓ Appended to sync-log.md');
    }
  }

  // Final status
  const passed = verificationPassed(report);
  const exitCode = getVerificationExitCode(report);

  printHeader(passed ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  if (passed) {
    console.log('  All applied items verified successfully.');
  } else {
    console.log(`  ${report.summary.mismatch} mismatches, ${report.summary.missing} missing items.`);
    console.log('  Review the issues above and re-run the apply pipeline if needed.');
  }
  console.log();

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
