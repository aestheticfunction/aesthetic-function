#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - bootstrap/cliBootstrap.ts
 *
 * CLI tool for generating Component Map Bootstrap Artifacts (Phase 10D).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher map:bootstrap <file>
 *
 * Environment Variables:
 *   MAP_BOOTSTRAP_MODE=artifact|apply (default: artifact)
 *   MAP_BOOTSTRAP_DRY_RUN=true|false (default: true)
 *
 * This tool:
 * 1. Reads the specified file
 * 2. Parses @figma markers and runs adapters
 * 3. Generates Phase 10C suggestions
 * 4. Creates a bootstrap artifact with proposed entries
 * 5. Writes artifact to design-materializations/
 * 6. Optionally applies to component-map.json (if mode=apply, dryRun=false)
 *
 * Output:
 * - Artifact file: design-materializations/<file>.component-map-bootstrap.json
 * - Terminal summary with counts and manual fields
 */

import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { loadComponentMap, getComponentMapPath } from '../reconcile/componentMap.js';
import { parseIntentFromReactAst, anchorMarkersToAst, runAdaptersOnFile } from '../ast/parseIntentFromReactAst.js';
import { generateSuggestions } from '../adapters/suggestions/componentMapSuggestions.js';
import {
  generateBootstrapArtifact,
  getArtifactPath,
} from './generateBootstrapArtifact.js';
import {
  writeBootstrapArtifact,
  mergeBootstrapArtifact,
} from './mergeBootstrap.js';
import { parseBootstrapConfig, type BootstrapConfig, type BootstrapSummary } from './types.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  // This file is at packages/watcher/src/bootstrap/cliBootstrap.ts
  // Repo root is 4 directories up
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// COLORS
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function c(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// =============================================================================
// CLI OUTPUT
// =============================================================================

/**
 * Print CLI header.
 */
function printHeader(filePath: string, config: BootstrapConfig): void {
  console.log();
  console.log(c('bright', '=== COMPONENT MAP BOOTSTRAP (Phase 10D) ==='));
  console.log();
  console.log(`  ${c('dim', 'File:')} ${filePath}`);
  console.log(`  ${c('dim', 'Mode:')} ${config.mode === 'apply' ? c('yellow', 'apply') : c('green', 'artifact-only')}`);
  console.log(`  ${c('dim', 'Dry Run:')} ${config.dryRun ? c('green', 'true') : c('red', 'false')}`);
  console.log();
}

/**
 * Print summary statistics.
 */
function printSummary(summary: BootstrapSummary, artifactPath: string): void {
  console.log(c('bright', '--- Summary ---'));
  console.log();
  console.log(`  ${c('cyan', 'Suggestions read:')} ${summary.suggestionsRead}`);
  console.log(`  ${c('green', 'Entries proposed:')} ${summary.entriesProposed}`);
  console.log(`  ${c('dim', 'Entries skipped:')} ${summary.entriesSkipped}`);
  console.log(`  ${c('yellow', 'Fields needing manual fill:')} ${summary.manualFieldsCount}`);
  console.log();
  console.log(`  ${c('dim', 'Artifact written to:')} ${artifactPath}`);
  console.log();
}

/**
 * Print proposed entries.
 */
function printProposed(artifact: ReturnType<typeof generateBootstrapArtifact>): void {
  if (artifact.proposed.length === 0) {
    console.log(c('dim', '  No new entries to propose.'));
    console.log();
    return;
  }

  console.log(c('bright', '--- Proposed Entries ---'));
  console.log();

  for (const entry of artifact.proposed) {
    const statusColor = entry.status === 'new' ? 'green' : 'yellow';
    console.log(`  ${c(statusColor, `[${entry.status.toUpperCase()}]`)} ${c('bright', entry.componentKey)}`);
    console.log(`    ${c('dim', '→ Suggested name:')} "${entry.figmaNameSuggestion}"`);
    
    if (entry.variantStatesSuggested.length > 0) {
      console.log(`    ${c('dim', '→ Variants:')} [${entry.variantStatesSuggested.join(', ')}]`);
    } else {
      console.log(`    ${c('dim', '→ Variants:')} []`);
    }
    
    console.log(`    ${c('dim', '→ Reason:')} ${entry.reason}`);
    
    if (entry.manualFields.length > 0) {
      console.log(`    ${c('yellow', '→ Manual fill required:')}`);
      for (const field of entry.manualFields) {
        console.log(`       - ${field}`);
      }
    }
    console.log();
  }
}

/**
 * Print skipped entries.
 */
function printSkipped(artifact: ReturnType<typeof generateBootstrapArtifact>): void {
  if (artifact.skipped.length === 0) {
    return;
  }

  console.log(c('dim', '--- Skipped Entries ---'));
  console.log();

  for (const entry of artifact.skipped) {
    console.log(`  ${c('dim', `[SKIP]`)} ${entry.componentKey}`);
    console.log(`    ${c('dim', '→ Reason:')} ${entry.reason}`);
  }
  console.log();
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher map:bootstrap <file>');
    console.error();
    console.error('Environment Variables:');
    console.error('  MAP_BOOTSTRAP_MODE=artifact|apply (default: artifact)');
    console.error('  MAP_BOOTSTRAP_DRY_RUN=true|false (default: true)');
    process.exit(1);
  }

  const inputPath = args[0];
  const repoRoot = getRepoRoot();
  const config = parseBootstrapConfig();

  // Resolve file path
  const absolutePath = resolve(repoRoot, inputPath);
  const relativePath = relative(repoRoot, absolutePath);

  printHeader(relativePath, config);

  // Read file
  let code: string;
  try {
    code = await readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(c('red', `Error: Could not read file: ${absolutePath}`));
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Parse and analyze
  console.log(c('dim', '  Analyzing file...'));

  const markers = extractMarkers(code);
  const astReport = parseIntentFromReactAst(code, relativePath);
  const anchored = anchorMarkersToAst(code, relativePath, astReport);
  const adapterResult = runAdaptersOnFile(code, relativePath, astReport);

  // Load existing map and overrides
  const existingMap = await loadComponentMap({ autoMigrate: false });
  const overrides = await loadDesignOverrides();

  // Generate suggestions (Phase 10C)
  const suggestions = generateSuggestions(
    anchored,
    adapterResult,
    existingMap,
    markers,
    overrides
  );

  console.log(c('dim', `  Found ${suggestions.suggestions.length} component(s) with markers.`));
  console.log();

  // Generate bootstrap artifact
  const artifact = generateBootstrapArtifact({
    filePath: relativePath,
    suggestions,
    existingMap,
    skipExisting: true,
  });

  // Calculate artifact path
  const artifactDir = resolve(repoRoot, 'design-materializations');
  const artifactPath = resolve(repoRoot, getArtifactPath(relativePath));
  const relativeArtifactPath = relative(repoRoot, artifactPath);

  // Ensure output directory exists
  await mkdir(artifactDir, { recursive: true });

  // Write artifact
  await writeBootstrapArtifact(artifact, artifactPath);

  // Print proposed and skipped entries
  printProposed(artifact);
  printSkipped(artifact);

  // Calculate summary
  const summary: BootstrapSummary = {
    suggestionsRead: suggestions.suggestions.length,
    entriesProposed: artifact.proposed.length,
    entriesSkipped: artifact.skipped.length,
    manualFieldsCount: artifact.proposed.reduce((acc, p) => acc + p.manualFields.length, 0),
  };

  // Apply mode
  if (config.mode === 'apply' && !config.dryRun) {
    console.log(c('yellow', '--- Apply Mode ---'));
    console.log();

    const mapPath = getComponentMapPath();
    const mergeResult = await mergeBootstrapArtifact(artifact, mapPath, config);

    if (mergeResult.success) {
      console.log(c('green', '  ✓ Component map updated successfully.'));
      console.log(`    ${c('dim', 'Added:')} ${mergeResult.entriesAdded}`);
      console.log(`    ${c('dim', 'Updated:')} ${mergeResult.entriesUpdated}`);
      console.log(`    ${c('dim', 'Skipped:')} ${mergeResult.entriesSkipped}`);
      
      if (mergeResult.manualDecisionRequired.length > 0) {
        console.log();
        console.log(c('yellow', '  ⚠ Manual decision required for:'));
        for (const key of mergeResult.manualDecisionRequired) {
          console.log(`    - ${key}`);
        }
      }
    } else {
      console.log(c('red', '  ✗ Failed to update component map.'));
      console.log(`    ${mergeResult.error}`);
    }
    console.log();
  } else if (config.mode === 'apply') {
    console.log(c('yellow', '  ℹ Apply mode with dry run - no changes made to component-map.json'));
    console.log(c('dim', '    Set MAP_BOOTSTRAP_DRY_RUN=false to apply changes.'));
    console.log();
  }

  printSummary(summary, relativeArtifactPath);

  console.log(c('dim', '  NOTE: This artifact is READ-ONLY for review.'));
  console.log(c('dim', '  To apply, set MAP_BOOTSTRAP_MODE=apply MAP_BOOTSTRAP_DRY_RUN=false'));
  console.log();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
