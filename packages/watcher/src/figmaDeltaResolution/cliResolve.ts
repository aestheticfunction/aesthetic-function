#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - figmaDeltaResolution/cliResolve.ts
 *
 * CLI tool for generating conflict resolution plans (Phase 12E).
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:resolve <file>
 *
 * This tool:
 * 1. Reads the specified file
 * 2. Parses @figma markers
 * 3. Loads design overrides and component map
 * 4. Generates Figma → Code deltas (Phase 12A)
 * 5. Generates delta suggestions (Phase 12B)
 * 6. Generates conflict report (Phase 12D)
 * 7. Generates resolution plan (Phase 12E)
 * 8. Prints the resolution plan and writes artifact
 *
 * Output sections:
 * - CONFLICT RESOLUTION PLAN (Phase 12E)
 *
 * CRITICAL: This tool does NOT apply changes.
 * It only produces a human-reviewable resolution plan.
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { loadComponentMap } from '../reconcile/componentMap.js';
import {
  generateDeltas,
  type BatchDeltaInput,
  type DeltaInput,
} from '../figmaDelta/index.js';
import {
  generateDeltaSuggestions,
  type SuggestInput,
} from '../figmaDeltaSuggest/index.js';
import {
  generateConflictReport,
  type ConflictDetectionInput,
} from '../figmaDelta/conflicts/index.js';
import {
  generateResolutionPlan,
  writeResolutionArtifact,
  type ResolutionPlan,
} from './index.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  // This file is at packages/watcher/src/figmaDeltaResolution/cliResolve.ts
  // Repo root is 4 directories up
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

/**
 * Print a section header.
 */
function printHeader(title: string): void {
  console.log();
  console.log('='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

/**
 * Print the resolution plan.
 */
function printResolutionPlan(
  plan: ResolutionPlan,
  artifactPath: string | null
): void {
  printHeader('CONFLICT RESOLUTION PLAN (Phase 12E)');

  if (plan.decisions.length === 0) {
    console.log('  (no conflicts to resolve)');
    return;
  }

  // Group decisions by component::state
  const byState = new Map<string, typeof plan.decisions>();
  for (const decision of plan.decisions) {
    const key = `${decision.componentKey}::${decision.targetState}`;
    const group = byState.get(key) ?? [];
    group.push(decision);
    byState.set(key, group);
  }

  // Print decisions grouped by component::state
  for (const [key, decisions] of byState) {
    const [componentKey, state] = key.split('::');
    console.log();
    console.log(`  Component: ${componentKey}`);
    console.log(`  State: ${state}`);

    for (const d of decisions) {
      console.log();
      console.log(`    Property: ${d.property}`);
      console.log(`    Conflict: ${d.sourceConflictId}`);
      console.log(`    Suggested Resolution: ${d.action}`);
      console.log(`    Reason: ${d.reason}`);
    }
  }

  // Print summary
  console.log();
  console.log('  Summary:');
  console.log(`    - Apply to AST: ${plan.summary.applyAst}`);
  console.log(`    - Apply to Marker: ${plan.summary.applyMarker}`);
  console.log(`    - Apply to Override: ${plan.summary.applyOverride}`);
  console.log(`    - Ignored: ${plan.summary.ignored}`);
  console.log(`    - Blocked: ${plan.summary.blocked}`);

  // Print artifact path
  if (artifactPath) {
    console.log();
    console.log(`  Resolution plan written to:`);
    console.log(`    ${artifactPath}`);
  }
}

// =============================================================================
// MAIN CLI
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher figma:resolve <file>');
    console.error('Example: pnpm --filter @aesthetic-function/watcher figma:resolve demos/react-demo-app/src/App.tsx');
    console.error();
    console.error('This command generates a resolution plan for Figma → Code conflicts.');
    console.error('It does NOT apply any changes - only produces a reviewable plan.');
    process.exit(1);
  }

  const inputPath = args[0];
  const repoRoot = getRepoRoot();
  
  // Resolve path relative to repo root
  const absolutePath = resolve(repoRoot, inputPath);
  const relativePath = relative(repoRoot, absolutePath);

  console.log(`Generating resolution plan for: ${relativePath}`);
  console.log();

  // Read source file
  let code: string;
  try {
    code = await readFile(absolutePath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file: ${absolutePath}`);
    process.exit(1);
  }

  // Load dependencies
  const markers = extractMarkers(code);
  const overrides = await loadDesignOverrides();
  const componentMap = await loadComponentMap();

  // Build delta inputs from component-map + overrides
  const deltaInputs: DeltaInput[] = [];

  if (componentMap && overrides) {
    for (const [componentKey, entry] of Object.entries(componentMap.components)) {
      const variants = entry.figma?.variants ?? {};
      const componentSetNodeId = entry.figma?.componentSetNodeId;

      for (const [state, variantMapping] of Object.entries(variants)) {
        const nodeId = variantMapping.nodeId;

        // Skip if nodeId matches Component Set (invalid target)
        if (componentSetNodeId && nodeId === componentSetNodeId) {
          continue;
        }

        // Get override
        let override = overrides[`${componentKey}::${state}`];
        if (!override && state === 'base') {
          override = overrides[componentKey];
        }

        // Build Figma state from override
        const figmaState: DeltaInput['figmaState'] = {};
        if (override?.fill) {
          figmaState.fill = { raw: override.fill, isExplicit: true };
        }
        if (override?.layout?.padding !== undefined) {
          figmaState.padding = { raw: override.layout.padding, isExplicit: true };
        }
        if (override?.layout?.gap !== undefined) {
          figmaState.gap = { raw: override.layout.gap, isExplicit: true };
        }

        // Only add if there's Figma state to compare
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

  // Phase 12A: Generate deltas
  const deltaInput: BatchDeltaInput = {
    sourceFile: relativePath,
    inputs: deltaInputs,
  };
  const deltaOutput = generateDeltas(deltaInput);

  console.log(`Phase 12A: ${deltaOutput.results.length} delta results`);

  // Phase 12B: Generate suggestions
  const suggestInput: SuggestInput = {
    filePath: relativePath,
    componentMap: componentMap ?? { version: 2, components: {} },
    markers,
    overrides,
    deltas: deltaOutput.results,
  };
  const suggestionOutput = generateDeltaSuggestions(suggestInput);

  console.log(`Phase 12B: ${suggestionOutput.suggestions.length} suggestions`);

  // Phase 12D: Generate conflict report
  const conflictInput: ConflictDetectionInput = {
    filePath: relativePath,
    deltas: deltaOutput.results,
    suggestions: suggestionOutput.suggestions,
    markers,
    overrides,
  };
  const conflictReport = generateConflictReport(conflictInput);

  console.log(`Phase 12D: ${conflictReport.conflicts.length} conflicts`);

  // Phase 12E: Generate resolution plan
  const resolutionPlan = generateResolutionPlan({ conflictReport });

  console.log(`Phase 12E: ${resolutionPlan.decisions.length} decisions`);

  // Write resolution artifact (only if decisions exist)
  let artifactPath: string | null = null;
  if (resolutionPlan.decisions.length > 0) {
    const result = await writeResolutionArtifact(resolutionPlan, repoRoot);
    artifactPath = result ?? null;
  }

  // Print resolution plan
  printResolutionPlan(resolutionPlan, artifactPath);

  // Final status
  console.log();
  console.log('='.repeat(60));
  console.log('  NOTE: This is a PROPOSED resolution plan.');
  console.log('  No changes have been applied.');
  console.log('  Review the plan before any application.');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
