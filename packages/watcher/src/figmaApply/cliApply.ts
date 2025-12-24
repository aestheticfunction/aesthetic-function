/**
 * @aesthetic-function/watcher - figmaApply/cliApply.ts
 *
 * Phase 11C: CLI Entry Point for Figma Property Application.
 *
 * USAGE:
 *   # Preview only (default)
 *   pnpm --filter @aesthetic-function/watcher figma:apply demo-app/src/App.tsx
 *
 *   # Write artifact only
 *   FIGMA_APPLY_MODE=artifact pnpm figma:apply demo-app/src/App.tsx
 *
 *   # Apply for real
 *   FIGMA_APPLY_ON=true FIGMA_APPLY_MODE=apply FIGMA_APPLY_DRY_RUN=false \
 *     pnpm figma:apply demo-app/src/App.tsx
 *
 * FLAGS:
 *   --apply    Enable apply mode (still requires FIGMA_APPLY_ON=true, FIGMA_APPLY_DRY_RUN=false)
 *   --verbose  Show detailed operation list
 *   --component <name>  Target a specific component
 *   --state <state>     Target a specific state (e.g., hover)
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadApplyConfig, canApply } from './config.js';
import { generateApplyOps } from './generateApplyOps.js';
import {
  buildApplyArtifact,
  writeApplyArtifact,
  formatArtifactSummary,
  formatOperationDetails,
  formatViolationDetails,
  getRepoRoot,
  normalizeSourcePath,
} from './artifact.js';
import { hasStableNodeId } from './applyPolicy.js';
import { extractMarkers } from '../parse/parseIntentFromReact.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import type { ApplyInput, ApplyResult, ApplyConfig } from './types.js';
import type { ComponentMap } from '../reconcile/componentMap.js';
import type { CanonicalResolution } from '../canonicalResolver/types.js';

// =============================================================================
// CLI ARGUMENTS
// =============================================================================

interface CliArgs {
  sourceFile: string;
  apply: boolean;
  verbose: boolean;
  component?: string;
  state?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  let sourceFile = '';
  let apply = false;
  let verbose = false;
  let component: string | undefined;
  let state: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--component') {
      // --component LoginButton
      component = args[++i];
    } else if (arg === '--state') {
      // --state hover
      state = args[++i];
    } else if (!arg.startsWith('-')) {
      // First non-flag arg is the source file
      if (!sourceFile) {
        sourceFile = arg;
      }
    }
  }

  if (!sourceFile) {
    console.error('Usage: figma:apply <source-file> [--apply] [--verbose] [--component <name>] [--state <state>]');
    process.exit(1);
  }

  return { sourceFile, apply, verbose, component, state };
}

// =============================================================================
// MOCK DATA LOADERS (Replace with real implementations)
// =============================================================================

/**
 * Load component map from disk.
 * Looks in repo root for component-map.json.
 */
async function loadComponentMap(): Promise<{ map: ComponentMap; found: boolean }> {
  const repoRoot = getRepoRoot();
  const mapPath = resolve(repoRoot, 'component-map.json');
  try {
    if (!existsSync(mapPath)) {
      return { map: { version: 2, components: {} }, found: false };
    }
    const content = await readFile(mapPath, 'utf-8');
    return { map: JSON.parse(content) as ComponentMap, found: true };
  } catch {
    // Return empty map if parsing fails
    return { map: { version: 2, components: {} }, found: false };
  }
}

/**
 * Create mock canonical resolution for demonstration.
 *
 * In production, this would come from Phase 10F/10G analysis.
 */
function createMockResolution(): CanonicalResolution {
  return {
    colors: {
      'color.primary': {
        canonical: 'color.primary',
        resolved: '#3B82F6',
        confidence: 'high',
        source: 'mock',
      },
    },
    spacing: {
      'space.md': {
        canonical: 'space.md',
        resolved: 16,
        confidence: 'high',
        source: 'mock',
      },
    },
    radius: {},
    typography: {
      'text.size.md': {
        canonical: 'text.size.md',
        resolved: { fontSize: 16 },
        confidence: 'high',
        source: 'mock',
      },
    },
    meta: {
      resolvedCount: 3,
      unresolvedCount: 0,
      notesCount: 0,
    },
  };
}

// =============================================================================
// SERVER COMMUNICATION
// =============================================================================

/**
 * Server response shape for apply operations.
 */
export interface ServerApplyResponse {
  results?: ApplyResult[];
  error?: string;
}

/**
 * Validate server response and extract results array.
 *
 * Throws descriptive errors for invalid responses.
 *
 * @param json - Raw JSON response from server
 * @returns Validated results array
 * @throws Error if response is invalid
 */
export function validateServerResponse(json: unknown): ApplyResult[] {
  // Validate response shape
  if (!json || typeof json !== 'object') {
    throw new Error('Server returned invalid response (not an object)');
  }

  const response = json as ServerApplyResponse;

  if (response.error) {
    throw new Error(`Server error: ${response.error}`);
  }

  if (!Array.isArray(response.results)) {
    throw new Error('Server returned invalid response (missing results array)');
  }

  return response.results;
}

/**
 * Send apply operations to the server.
 *
 * Returns results array on success, or throws on failure.
 * Validates response shape before returning.
 */
async function sendApplyToServer(
  config: ApplyConfig,
  operations: { opId: string; nodeId: string; property: string; to: string | number }[],
  requestId: string
): Promise<ApplyResult[]> {
  const response = await fetch(`${config.serverUrl}/apply-properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations,
      mode: config.dryRun ? 'dry-run' : 'apply',
      requestId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  return validateServerResponse(json);
}

// =============================================================================
// PRECONDITION HELPERS
// =============================================================================

/**
 * Count components with stable Figma nodeIds.
 */
function countMappedComponents(componentMap: ComponentMap): number {
  let count = 0;
  for (const key of Object.keys(componentMap.components)) {
    if (hasStableNodeId(componentMap, key)) {
      count++;
    }
  }
  return count;
}

/**
 * Print preconditions summary to help users understand apply requirements.
 */
function printPreconditions(
  config: ApplyConfig,
  componentMapFound: boolean,
  totalComponents: number,
  mappedComponents: number
): void {
  console.log('=== APPLY PRECONDITIONS ===');

  // Component map status
  if (!componentMapFound) {
    console.log('❌ Component Map: NOT FOUND');
    console.log('   → Create component-map.json using "Send Selection" in Figma plugin');
  } else if (totalComponents === 0) {
    console.log('❌ Component Map: EMPTY (0 components)');
    console.log('   → Use "Send Selection" in Figma plugin to map components');
  } else if (mappedComponents === 0) {
    console.log('⚠️  Component Map: No components have Figma nodeIds');
    console.log('   → Apply ops require mapped nodeIds from "Send Selection"');
  } else {
    console.log(`✓  Component Map: ${mappedComponents}/${totalComponents} components with nodeIds`);
  }

  // Feature flag status
  if (!config.enabled) {
    console.log('ℹ️  Mode: ARTIFACT-ONLY (FIGMA_APPLY_ON=false)');
    console.log('   → Set FIGMA_APPLY_ON=true to enable Figma updates');
  } else if (config.mode === 'artifact') {
    console.log('ℹ️  Mode: ARTIFACT-ONLY (FIGMA_APPLY_MODE=artifact)');
    console.log('   → Set FIGMA_APPLY_MODE=apply to enable Figma updates');
  } else if (config.dryRun) {
    console.log('ℹ️  Mode: DRY-RUN (FIGMA_APPLY_DRY_RUN=true)');
    console.log('   → Set FIGMA_APPLY_DRY_RUN=false to apply changes');
  } else {
    console.log('✓  Mode: APPLY ENABLED');
  }

  // Allow list status
  if (config.allow.length === 0) {
    console.log('⚠️  Allow: NONE (no property categories allowed)');
    console.log('   → Set FIGMA_APPLY_ALLOW=fill,spacing,typography');
  } else {
    console.log(`✓  Allow: ${config.allow.join(', ')}`);
  }

  // Summary of whether ops will be generated
  const canGenerate = mappedComponents > 0 && config.allow.length > 0;
  console.log('');
  if (canGenerate) {
    console.log('→ Operations will be generated for components with nodeIds');
  } else {
    console.log('→ No operations will be generated (missing preconditions above)');
  }
}

// =============================================================================
// MAIN CLI FUNCTION
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Normalize source path for consistent artifact naming
  const normalizedSource = normalizeSourcePath(args.sourceFile);

  console.log('=== FIGMA APPLY CLI (Phase 11C) ===');
  console.log(`Source: ${normalizedSource}`);
  if (args.component) {
    console.log(`Component: ${args.component}`);
  }
  if (args.state) {
    console.log(`State: ${args.state}`);
  }
  console.log('');

  // Load configuration
  let config = loadApplyConfig();

  // Override mode if --apply flag is passed
  if (args.apply) {
    config = { ...config, mode: 'apply' };
  }

  // Load component map
  const { map: componentMap, found: componentMapFound } = await loadComponentMap();
  const totalComponents = Object.keys(componentMap.components).length;
  const mappedComponents = countMappedComponents(componentMap);

  // Print preconditions summary
  printPreconditions(config, componentMapFound, totalComponents, mappedComponents);
  console.log('');

  // Create canonical resolution (mock for now)
  const resolution = createMockResolution();

  // Load markers from source file (for state-specific data detection)
  let markers;
  const absoluteSourcePath = resolve(getRepoRoot(), normalizedSource);
  if (existsSync(absoluteSourcePath)) {
    try {
      const sourceContent = await readFile(absoluteSourcePath, 'utf-8');
      markers = extractMarkers(sourceContent);
      if (args.verbose) {
        console.log(`Loaded ${markers.length} markers from source file`);
      }
    } catch (err) {
      console.warn(`Warning: Could not read source file for markers: ${err}`);
    }
  }

  // Load design overrides (for state-specific data detection)
  const overrides = await loadDesignOverrides() ?? undefined;
  if (args.verbose && overrides) {
    console.log(`Loaded ${Object.keys(overrides).length} design overrides`);
  }

  // Build input using normalized source path
  const input: ApplyInput = {
    resolution,
    componentMap,
    sourceFile: normalizedSource,
    config,
    targetComponent: args.component,
    targetState: args.state,
    markers,
    overrides,
  };

  // Generate apply operations
  const output = generateApplyOps(input);

  console.log(`Generated: ${output.operations.length} operations`);
  console.log(`Violations: ${output.violations.length}`);

  // Build artifact
  let results: ApplyResult[] | undefined;
  let sendFailed = false;

  // If apply mode and fully enabled, send to server
  if (canApply(config) && args.apply) {
    console.log('');
    console.log('Sending operations to server...');

    try {
      const requestId = `apply-${Date.now()}`;
      results = await sendApplyToServer(
        config,
        output.operations.map((op) => ({
          opId: op.opId,
          nodeId: op.nodeId,
          property: op.property,
          to: op.to,
        })),
        requestId
      );

      // Log results summary with safe access
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;
      console.log(`Server response: ${results.length} results (${successCount} succeeded, ${failCount} failed)`);
    } catch (error) {
      sendFailed = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('');
      console.error(`❌ Failed to send to server: ${errorMessage}`);
      console.error('   Check that the server is running (pnpm --filter @aesthetic-function/server dev)');
    }
  }

  // Build and write artifact
  const artifact = buildApplyArtifact(args.sourceFile, output, config, results);
  const artifactPath = await writeApplyArtifact(artifact);

  console.log('');
  console.log(`Artifact written: ${artifactPath}`);

  // Verbose output
  if (args.verbose) {
    console.log('');
    console.log(formatArtifactSummary(artifact));

    if (output.operations.length > 0) {
      console.log('');
      console.log(formatOperationDetails(artifact));
    }

    if (output.violations.length > 0) {
      console.log('');
      console.log(formatViolationDetails(artifact));
    }
  }

  // Exit with error if send failed
  if (sendFailed) {
    console.log('');
    console.log('❌ Apply failed: could not send operations to server');
    process.exit(1);
  }

  // Exit with error if violations in strict mode
  if (output.violations.length > 0) {
    console.log('');
    console.log(`⚠️  ${output.violations.length} policy violations detected`);
  }
}

// Run CLI only when executed directly (not when imported as module)
// Check if this module is being run directly by looking at the import.meta.url
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/^.*[/\\]/, ''));

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
