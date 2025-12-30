#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - rollbackPreview/cliRollbackPreview.ts
 *
 * CLI tool for generating rollback preview (Phase 12I).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:rollback-preview <file> [options]
 *
 * Options:
 *   --apply-artifact <path>   Custom apply artifact path
 *   --verify-artifact <path>  Custom verification artifact path
 *
 * This is a read-only preview. No rollback is executed.
 * Exit code is always 0 (this never fails CI).
 */

import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRollbackInputs,
  generateRollbackPreview,
  hasRollbackActions,
} from './generate.js';
import {
  writeRollbackPreviewArtifact,
  appendRollbackPreviewToAuditLog,
  formatRollbackPreview,
} from './artifact.js';
import type { RollbackPreviewContext } from './types.js';

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
  applyArtifact?: string;
  verifyArtifact?: string;
}

function parseArgs(args: string[]): CliArgs | null {
  if (args.length === 0) {
    return null;
  }

  const result: CliArgs = {
    file: '',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--apply-artifact' && i + 1 < args.length) {
      result.applyArtifact = args[i + 1];
      i += 2;
    } else if (arg === '--verify-artifact' && i + 1 < args.length) {
      result.verifyArtifact = args[i + 1];
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
    console.error('Usage: pnpm --filter @aesthetic-function/watcher figma:rollback-preview <file> [options]');
    console.error();
    console.error('Options:');
    console.error('  --apply-artifact <path>   Custom apply artifact path');
    console.error('  --verify-artifact <path>  Custom verification artifact path');
    console.error();
    console.error('Example:');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:rollback-preview demo-app/src/App.tsx');
    console.error();
    console.error('Note: This is a read-only preview. No rollback is executed.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const absolutePath = resolve(repoRoot, parsed.file);
  const relativePath = relative(repoRoot, absolutePath);

  printHeader('ROLLBACK PREVIEW (Phase 12I)');
  console.log(`  Source file: ${relativePath}`);
  console.log();
  console.log('  ⚠️  This is a READ-ONLY preview. No rollback will be executed.');

  // Build context
  const context: RollbackPreviewContext = {
    repoRoot,
    sourceFile: relativePath,
    applyArtifactPath: parsed.applyArtifact,
    verificationArtifactPath: parsed.verifyArtifact,
  };

  // Load inputs
  printSection('Loading Artifacts');
  const inputs = await loadRollbackInputs(context);

  if (!inputs.success) {
    console.error(`  ✗ ${inputs.error}`);
    console.error();
    console.error('  Ensure you have run:');
    console.error('    1. figma:resolve-apply (to create apply artifact)');
    console.error('    2. figma:verify (to create verification artifact)');
    console.error();
    console.error('  Or provide explicit paths:');
    console.error('    --apply-artifact <path>');
    console.error('    --verify-artifact <path>');
    process.exit(0); // Always exit 0 (read-only, never fails CI)
  }

  console.log(`  ✓ Apply artifact: ${inputs.applyArtifactPath}`);
  console.log(`  ✓ Verification artifact: ${inputs.verificationArtifactPath}`);

  // Show stats
  const failureCount = inputs.verificationFailures?.length ?? 0;
  console.log(`  Verification failures: ${failureCount}`);

  // Generate preview
  printSection('Generating Rollback Preview');
  const preview = generateRollbackPreview(inputs, relativePath);

  // Display preview
  console.log(formatRollbackPreview(preview));

  // Write artifact if there are actions
  printSection('Artifact');
  if (hasRollbackActions(preview)) {
    const artifactPath = await writeRollbackPreviewArtifact(preview, repoRoot);
    if (artifactPath) {
      console.log(`  ✓ Written to: ${artifactPath}`);

      // Append to audit log
      await appendRollbackPreviewToAuditLog(preview, repoRoot);
      console.log('  ✓ Appended to sync-log.md');
    }
  } else {
    console.log('  No artifact written (no rollback actions)');
  }

  // Final status
  printHeader('COMPLETE');
  console.log('  ⚠️  This was a READ-ONLY preview.');
  console.log('  No files were modified. No rollback was executed.');
  console.log();

  if (preview.actions.length > 0) {
    console.log(`  ${preview.actions.length} rollback action(s) would be needed to revert failed verifications.`);
  } else {
    console.log('  No rollback actions needed. All verifications passed or were skipped.');
  }
  console.log();

  // Always exit 0 (this phase never fails CI)
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  // Even on error, exit 0 (read-only, never fails CI)
  process.exit(0);
});
