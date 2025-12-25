#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - figmaDeltaApply/cliDeltaApply.ts
 *
 * Phase 12C: CLI for applying delta suggestions.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:delta-apply <file> [options]
 *
 * Options:
 *   --apply             Enable apply mode (requires env flags)
 *   --from <path>       Load suggestions from artifact file
 *   --component <key>   Filter by component key
 *   --state <state>     Filter by state (base, hover, etc.)
 *
 * Environment flags required for --apply:
 *   FIGMA_DELTA_APPLY_ON=true
 *   FIGMA_DELTA_APPLY_MODE=apply
 *   FIGMA_DELTA_APPLY_DRY_RUN=false
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDeltaApplyConfig, getPreconditionStatus } from './config.js';
import {
  generateDeltaApplyOps,
  executeDeltaApplyOps,
  buildApplySummary,
  loadSuggestionsFromArtifact,
} from './apply.js';
import { writeDeltaApplyArtifact, appendToAuditLog } from './artifact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { loadComponentMap } from '../reconcile/componentMap.js';
import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { generateDeltaSuggestions } from '../figmaDeltaSuggest/suggest.js';
import { generateDeltas } from '../figmaDelta/generateDeltas.js';
import { getAstWriteMode, getAstWriteDryRun, getAstWriteAllow, isAstWriteEnabled } from '../materialize/config.js';

import type { DeltaApplyInput, DeltaApplyOp, OpApplyResult } from './types.js';
import type { FigmaDeltaSuggestion } from '../figmaDeltaSuggest/types.js';
import type { DeltaInput, BatchDeltaInput } from '../figmaDelta/types.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getRepoRoot(): string {
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// CLI ARGUMENTS
// =============================================================================

interface CliArgs {
  filePath: string;
  applyMode: boolean;
  fromArtifact?: string;
  componentFilter?: string;
  stateFilter?: string;
}

function parseArgs(args: string[]): CliArgs | null {
  if (args.length === 0) {
    return null;
  }

  const result: CliArgs = {
    filePath: args[0],
    applyMode: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--apply') {
      result.applyMode = true;
    } else if (arg === '--from' && i + 1 < args.length) {
      result.fromArtifact = args[++i];
    } else if (arg === '--component' && i + 1 < args.length) {
      result.componentFilter = args[++i];
    } else if (arg === '--state' && i + 1 < args.length) {
      result.stateFilter = args[++i];
    }
  }

  return result;
}

// =============================================================================
// OUTPUT HELPERS
// =============================================================================

function printHeader(title: string): void {
  console.log();
  console.log('='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function printPreconditions(
  componentMapPresent: boolean,
  overridesPath: string,
  markersFound: number,
  astFeasibilityAvailable: boolean
): void {
  printHeader('PRECONDITIONS');

  console.log(`  Component Map: ${componentMapPresent ? '✓ present' : '✗ missing'}`);
  console.log(`  Overrides Path: ${overridesPath}`);
  console.log(`  Markers Found: ${markersFound}`);
  console.log(`  AST Feasibility: ${astFeasibilityAvailable ? '✓ available' : '⚠ not loaded'}`);
}

function printConfigStatus(
  enabled: boolean,
  mode: string,
  dryRun: boolean,
  allow: string[],
  minConfidence: string
): void {
  printHeader('CONFIGURATION');

  console.log(`  FIGMA_DELTA_APPLY_ON: ${enabled}`);
  console.log(`  FIGMA_DELTA_APPLY_MODE: ${mode}`);
  console.log(`  FIGMA_DELTA_APPLY_DRY_RUN: ${dryRun}`);
  console.log(`  FIGMA_DELTA_APPLY_ALLOW: ${allow.join(', ')}`);
  console.log(`  FIGMA_DELTA_APPLY_MIN_CONFIDENCE: ${minConfidence}`);

  // AST write status
  const astWriteMode = getAstWriteMode();
  const astWriteDryRun = getAstWriteDryRun();
  const astWriteAllow = getAstWriteAllow();
  const astWriteActive = isAstWriteEnabled() && !astWriteDryRun;

  console.log();
  console.log('  AST Write Status:');
  console.log(`    AST_WRITE_MODE: ${astWriteMode} ${astWriteMode === 'off' ? '🔴' : '🟢'}`);
  console.log(`    AST_WRITE_DRY_RUN: ${astWriteDryRun}`);
  console.log(`    AST_WRITE_ALLOW: ${astWriteAllow.join(', ')}`);
  console.log(`    Status: ${astWriteActive ? '✓ ACTIVE (will write to AST)' : '⚠ SKIPPED (dry-run or off)'}`);
}

function printOperationPlan(ops: DeltaApplyOp[]): void {
  printHeader('OPERATION PLAN');

  if (ops.length === 0) {
    console.log('  (no operations to apply)');
    return;
  }

  // Group by target
  const byTarget = new Map<string, DeltaApplyOp[]>();
  for (const op of ops) {
    const group = byTarget.get(op.target) ?? [];
    group.push(op);
    byTarget.set(op.target, group);
  }

  const targetIcons: Record<string, string> = {
    ast: '📝',
    marker: '💬',
    override: '📦',
    blocked: '🚫',
  };

  for (const [target, targetOps] of byTarget) {
    const icon = targetIcons[target] ?? '?';
    console.log(`\n  ${icon} ${target.toUpperCase()} (${targetOps.length})`);

    for (const op of targetOps) {
      const fromStr = op.from !== undefined ? String(op.from) : '(none)';
      console.log(`    - ${op.componentKey}::${op.targetState}/${op.property}`);
      console.log(`      ${fromStr} → ${op.to}`);

      if (op.evidence.overrideKey) {
        console.log(`      via override: ${op.evidence.overrideKey}`);
      }
      if (op.evidence.markerLine) {
        console.log(`      via marker: L${op.evidence.markerLine}`);
      }
      if (op.evidence.astLoc) {
        console.log(`      via AST: L${op.evidence.astLoc.startLine}`);
      }
    }
  }
}

function printResults(
  ops: DeltaApplyOp[],
  results: OpApplyResult[],
  violations: string[]
): void {
  printHeader('RESULTS');

  let appliedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const op = ops[i];

    if (result.applied) {
      appliedCount++;
      console.log(`  ✓ APPLIED [${result.appliedTarget}] ${op.componentKey}::${op.targetState}/${op.property}`);
      if (result.appliedLocation) {
        console.log(`    Location: ${result.appliedLocation}`);
      }
    } else if (result.skipped) {
      skippedCount++;
      console.log(`  ✗ SKIPPED [${op.target}] ${op.componentKey}::${op.targetState}/${op.property}`);
      console.log(`    Reason: ${result.skipReason}`);
    }
  }

  console.log();
  console.log(`  Summary: ${appliedCount} applied, ${skippedCount} skipped`);

  if (violations.length > 0) {
    console.log();
    console.log('  Violations:');
    for (const v of violations) {
      console.log(`    - ${v}`);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher figma:delta-apply <file> [options]');
    console.error();
    console.error('Options:');
    console.error('  --apply             Enable apply mode (requires env flags)');
    console.error('  --from <path>       Load suggestions from artifact file');
    console.error('  --component <key>   Filter by component key');
    console.error('  --state <state>     Filter by state');
    console.error();
    console.error('Example:');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:delta-apply demo-app/src/App.tsx');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const { filePath, applyMode, fromArtifact, componentFilter, stateFilter } = args;

  // Resolve paths
  const absolutePath = resolve(repoRoot, filePath);
  const relativePath = relative(repoRoot, absolutePath);

  console.log('DELTA APPLY');
  console.log(`File: ${relativePath}`);

  // Load configuration
  const config = loadDeltaApplyConfig();

  // If --apply flag is set, check preconditions
  if (applyMode) {
    const preconditions = getPreconditionStatus(config);
    if (!preconditions.canApply) {
      console.error();
      console.error('ERROR: Apply mode requires the following environment flags:');
      for (const reason of preconditions.reasons) {
        console.error(`  - ${reason}`);
      }
      console.error();
      console.error('Set these flags and try again:');
      console.error('  FIGMA_DELTA_APPLY_ON=true FIGMA_DELTA_APPLY_MODE=apply FIGMA_DELTA_APPLY_DRY_RUN=false \\');
      console.error('    pnpm --filter @aesthetic-function/watcher figma:delta-apply <file> --apply');
      process.exit(1);
    }
  }

  // Load context
  const componentMap = await loadComponentMap();
  const overrides = await loadDesignOverrides();

  // Read source file
  let sourceCode: string;
  try {
    sourceCode = await readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${absolutePath}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const markers = extractMarkers(sourceCode);

  // Print preconditions
  printPreconditions(
    componentMap !== null,
    join(repoRoot, 'design-overrides.json'),
    markers.length,
    false // AST feasibility not loaded in CLI for now
  );

  // Print config
  printConfigStatus(
    config.enabled,
    config.mode,
    config.dryRun,
    config.allow,
    config.minConfidence
  );

  // Load or generate suggestions
  let suggestions: FigmaDeltaSuggestion[];

  if (fromArtifact) {
    // Load from artifact file
    console.log();
    console.log(`Loading suggestions from: ${fromArtifact}`);
    try {
      suggestions = await loadSuggestionsFromArtifact(resolve(repoRoot, fromArtifact));
    } catch (err) {
      console.error(`Error loading artifact: ${fromArtifact}`);
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    // Generate from delta detection (12A → 12B)
    console.log();
    console.log('Generating suggestions from delta detection...');

    // Build delta inputs from component map and overrides
    const deltaInputs: DeltaInput[] = [];

    if (componentMap && overrides) {
      for (const [componentKey, entry] of Object.entries(componentMap.components)) {
        const variants = entry.figma?.variants ?? {};
        const componentSetNodeId = entry.figma?.componentSetNodeId;

        for (const [state, variantMapping] of Object.entries(variants)) {
          const nodeId = variantMapping.nodeId;

          // Skip component set nodeIds
          if (componentSetNodeId && nodeId === componentSetNodeId) {
            continue;
          }

          // Get override
          let override = overrides[`${componentKey}::${state}`];
          if (!override && state === 'base') {
            override = overrides[componentKey];
          }

          if (!override) continue;

          // Build Figma state from override
          const figmaState: DeltaInput['figmaState'] = {};
          if (override.fill) {
            figmaState.fill = { raw: override.fill, isExplicit: true };
          }
          if (override.layout?.padding !== undefined) {
            figmaState.padding = { raw: override.layout.padding, isExplicit: true };
          }
          if (override.layout?.gap !== undefined) {
            figmaState.gap = { raw: override.layout.gap, isExplicit: true };
          }

          if (Object.keys(figmaState).length > 0) {
            deltaInputs.push({
              componentKey,
              state,
              nodeId,
              baseline: {},
              figmaState,
            });
          }
        }
      }
    }

    const deltaInput: BatchDeltaInput = {
      sourceFile: relativePath,
      inputs: deltaInputs,
    };
    const deltaOutput = generateDeltas(deltaInput);

    // Generate suggestions (12B)
    const suggestOutput = generateDeltaSuggestions({
      filePath: relativePath,
      componentMap: componentMap ?? { version: 2, components: {} },
      markers,
      overrides,
      deltas: deltaOutput.results,
    });

    suggestions = suggestOutput.suggestions;
    console.log(`Generated ${suggestions.length} suggestions from ${deltaOutput.summary.totalDeltas} deltas`);
  }

  // Generate apply operations
  const applyInput: DeltaApplyInput = {
    filePath: relativePath,
    suggestions,
    config,
    componentFilter,
    stateFilter,
  };

  const { ops, skipped } = generateDeltaApplyOps(applyInput);

  // Print skipped suggestions (before ops)
  if (skipped.length > 0) {
    console.log();
    console.log(`Skipped ${skipped.length} suggestions:`);
    for (const s of skipped.slice(0, 5)) {
      console.log(`  - ${s.suggestion.componentKey}::${s.suggestion.targetState}/${s.suggestion.property}: ${s.reason}`);
    }
    if (skipped.length > 5) {
      console.log(`  ... and ${skipped.length - 5} more`);
    }
  }

  // Print operation plan
  printOperationPlan(ops);

  // Execute operations
  const effectiveConfig = applyMode ? config : { ...config, dryRun: true };
  const { results, violations } = await executeDeltaApplyOps(ops, effectiveConfig, relativePath);

  // Print results
  printResults(ops, results, violations);

  // Build summary
  const summary = buildApplySummary(ops, results);

  // Write artifact
  const artifactPath = await writeDeltaApplyArtifact(
    relativePath,
    effectiveConfig.mode,
    effectiveConfig.dryRun,
    ops,
    results,
    violations,
    summary
  );

  console.log();
  console.log(`Artifact: ${artifactPath}`);

  // Append to audit log if any ops were applied
  if (summary.applied.total > 0) {
    await appendToAuditLog(relativePath, ops, results, summary);
    console.log(`Audit log updated: ${join(repoRoot, 'design-materializations', 'delta-apply-audit.log')}`);
  }

  // Final summary
  console.log();
  console.log('='.repeat(60));
  console.log(`Applied: ${summary.applied.total} (ast: ${summary.applied.ast}, marker: ${summary.applied.marker}, override: ${summary.applied.override})`);
  console.log(`Skipped: ${summary.skipped.total} (blocked: ${summary.skipped.blocked}, dryRun: ${summary.skipped.dryRun}, other: ${summary.skipped.total - summary.skipped.blocked - summary.skipped.dryRun})`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
