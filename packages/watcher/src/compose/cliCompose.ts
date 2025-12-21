#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - compose/cliCompose.ts
 *
 * CLI tool for Phase 11B Controlled Figma Composition.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:compose <file>
 *   pnpm --filter @aesthetic-function/watcher figma:compose <file> --apply
 *
 * Environment Variables:
 *   FIGMA_COMPOSE_ON=true|false (default: false)
 *   FIGMA_COMPOSE_MODE=off|dry-run|apply (default: off)
 *   FIGMA_COMPOSE_ALLOW=component-set,variant,property (default: empty)
 *   FIGMA_COMPOSE_SERVER=http://localhost:3001 (default)
 *
 * This tool:
 * 1. Reads the specified file and generates Phase 11A suggestions
 * 2. Transforms suggestions into typed compose operations
 * 3. Filters by allow list
 * 4. Writes compose artifact to design-materializations/
 * 5. If --apply flag is set, sends operations to server for Figma application
 *
 * Output:
 * - Artifact file: design-materializations/<file>.compose.json
 * - Terminal summary with counts and filtered operations
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { loadComponentMap } from '../reconcile/componentMap.js';
import {
  parseIntentFromReactAst,
  anchorMarkersToAst,
  runAdaptersOnFile,
} from '../ast/parseIntentFromReactAst.js';
import { generateFigmaSuggestions } from '../figmaSuggestions/index.js';
import {
  loadComposeConfig,
  composeFromSuggestions,
  writeComposeResult,
  type ComposeResult,
  type ComposeConfig,
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
  // This file is at packages/watcher/src/compose/cliCompose.ts
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
function printHeader(filePath: string, config: ComposeConfig, applyFlag: boolean): void {
  console.log();
  console.log(c('bright', '=== FIGMA COMPOSE (Phase 11B) ==='));
  console.log();
  console.log(`  ${c('dim', 'File:')} ${filePath}`);
  console.log(`  ${c('dim', 'Enabled:')} ${config.enabled ? c('green', 'true') : c('red', 'false')}`);
  console.log(`  ${c('dim', 'Mode:')} ${config.mode === 'apply' ? c('yellow', 'apply') : c('green', config.mode)}`);
  console.log(`  ${c('dim', 'Allow:')} ${config.allow.length > 0 ? config.allow.join(', ') : c('dim', '(none)')}`);
  console.log(`  ${c('dim', '--apply flag:')} ${applyFlag ? c('yellow', 'true') : c('green', 'false')}`);
  console.log();
}

/**
 * Print summary statistics.
 */
function printSummary(result: ComposeResult, artifactPath: string): void {
  console.log(c('bright', '--- Summary ---'));
  console.log();
  console.log(`  ${c('cyan', 'Total generated:')} ${result.totalGenerated}`);
  console.log(`  ${c('green', 'Total allowed:')} ${result.totalAllowed}`);
  console.log(`  ${c('dim', 'Filtered out:')} ${result.filtered.length}`);
  console.log(`  ${c('dim', 'Mode:')} ${result.mode}`);
  console.log();

  // Count by type
  if (Object.keys(result.countByType).length > 0) {
    console.log(c('dim', '  By type:'));
    for (const [type, count] of Object.entries(result.countByType)) {
      console.log(`    ${type}: ${count}`);
    }
    console.log();
  }

  console.log(`  ${c('dim', 'Artifact written to:')} ${artifactPath}`);
  console.log();
}

/**
 * Print operations.
 */
function printOperations(result: ComposeResult): void {
  if (result.operations.length === 0) {
    console.log(c('dim', '  No operations to apply.'));
    console.log();
    return;
  }

  console.log(c('bright', '--- Compose Operations ---'));
  console.log();

  for (const op of result.operations) {
    const typeColor = op.type === 'ENSURE_COMPONENT_SET' ? 'green' :
      op.type === 'ENSURE_VARIANT' ? 'cyan' : 'magenta';
    console.log(`  ${c(typeColor, `[${op.type}]`)} ${c('bright', op.figmaName)}`);
    console.log(`    ${c('dim', 'opId:')} ${op.opId}`);
    console.log(`    ${c('dim', 'componentKey:')} ${op.componentKey}`);
    console.log(`    ${c('dim', 'reason:')} ${op.reason}`);
    console.log();
  }
}

/**
 * Print filtered operations.
 */
function printFiltered(result: ComposeResult): void {
  if (result.filtered.length === 0) {
    return;
  }

  console.log(c('dim', '--- Filtered Operations (not in allow list) ---'));
  console.log();

  for (const op of result.filtered) {
    console.log(`  ${c('dim', `[${op.type}]`)} ${op.figmaName}`);
  }
  console.log();
}

/**
 * Print apply notice.
 */
function printApplyNotice(serverUrl: string): void {
  console.log(c('yellow', '--- Apply Mode ---'));
  console.log();
  console.log(`  Sending operations to server: ${serverUrl}`);
  console.log();
}

// =============================================================================
// SERVER COMMUNICATION
// =============================================================================

/**
 * Send compose operations to the server.
 */
async function sendComposeToServer(
  result: ComposeResult,
  serverUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: result.operations,
        mode: result.mode,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Server returned ${response.status}: ${text}` };
    }

    const data = await response.json() as { success: boolean; error?: string };
    return { success: data.success, error: data.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(2);
  const applyFlag = args.includes('--apply');
  const fileArg = args.find((arg) => !arg.startsWith('--'));

  if (!fileArg) {
    console.error(c('red', 'Error: No file specified'));
    console.error();
    console.error('Usage:');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:compose <file>');
    console.error('  pnpm --filter @aesthetic-function/watcher figma:compose <file> --apply');
    console.error();
    console.error('Environment Variables:');
    console.error('  FIGMA_COMPOSE_ON=true          # Master switch');
    console.error('  FIGMA_COMPOSE_MODE=dry-run     # off | dry-run | apply');
    console.error('  FIGMA_COMPOSE_ALLOW=component-set,variant  # Allowed types');
    process.exit(1);
  }

  // Load configuration
  const config = loadComposeConfig();

  // If --apply flag is set, override mode to 'apply'
  if (applyFlag) {
    config.mode = 'apply';
    config.enabled = true;
  }

  // Resolve file path
  const repoRoot = getRepoRoot();
  const filePath = resolve(repoRoot, fileArg);
  const relPath = relative(repoRoot, filePath);

  // Print header
  printHeader(relPath, config, applyFlag);

  // Check if compose is enabled
  if (!config.enabled) {
    console.log(c('yellow', '  Compose is disabled. Set FIGMA_COMPOSE_ON=true to enable.'));
    console.log();
    process.exit(0);
  }

  if (config.mode === 'off') {
    console.log(c('yellow', '  Compose mode is off. Set FIGMA_COMPOSE_MODE=dry-run or apply.'));
    console.log();
    process.exit(0);
  }

  try {
    // Read source file
    const content = await readFile(filePath, 'utf-8');

    // Extract markers
    const markers = extractMarkers(content);

    // Load component map (overrides not needed for compose)
    const componentMap = await loadComponentMap();
    // Note: loadDesignOverrides() available if needed in future

    // Parse AST and run adapters
    const astReport = parseIntentFromReactAst(content, filePath);
    const adapterResult = runAdaptersOnFile(content, filePath, astReport);
    const anchoredReport = anchorMarkersToAst(content, relPath, astReport);

    // Build explicit variant states from markers
    const explicitVariantStates = new Map<string, string[]>();
    for (const marker of markers) {
      if (marker.state) {
        // Use node name as approximation for component
        const states = explicitVariantStates.get(marker.node) || [];
        if (!states.includes(marker.state)) {
          states.push(marker.state);
          explicitVariantStates.set(marker.node, states);
        }
      }
    }

    // Generate Phase 11A suggestions with minimal input
    // Note: Some fields like canonicalSemantics are optional or empty for basic usage
    const suggestionResult = generateFigmaSuggestions({
      anchoredReport,
      adapterResult,
      canonicalSemantics: new Map(),
      canonicalResolution: new Map(),
      policyViolations: [],
      componentMap: componentMap || { version: 2, components: {} },
      explicitVariantStates,
    });

    // Transform to compose operations
    const composeResult = composeFromSuggestions({
      suggestions: suggestionResult.suggestions,
      sourceFile: relPath,
      config,
    });

    // Print operations and filtered
    printOperations(composeResult);
    printFiltered(composeResult);

    // Write artifact
    const artifactMeta = await writeComposeResult(composeResult, relPath, repoRoot);

    // Print summary
    printSummary(composeResult, relative(repoRoot, artifactMeta.artifactPath));

    // If apply mode and there are operations, send to server
    if (config.mode === 'apply' && composeResult.operations.length > 0) {
      printApplyNotice(config.serverUrl);
      const applyResult = await sendComposeToServer(composeResult, config.serverUrl);

      if (applyResult.success) {
        console.log(c('green', '  ✓ Operations sent to server successfully'));
      } else {
        console.log(c('red', `  ✗ Failed to send operations: ${applyResult.error}`));
        console.log(c('dim', '    Ensure the server is running: pnpm --filter @aesthetic-function/server dev'));
      }
      console.log();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(c('red', `Error: ${message}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
