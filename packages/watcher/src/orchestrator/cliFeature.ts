#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - orchestrator/cliFeature.ts
 *
 * CLI entry point for the Feature Orchestrator.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher feature \
 *     --file demo-app/src/App.tsx \
 *     --component LoginButton \
 *     --state hover \
 *     --prompt "Make the hover state button use the success green token"
 *
 * WHY: Provides a command-line interface for generating code patches from
 * natural language prompts. The patch artifact is saved for review before
 * applying to code.
 */

import { resolve } from 'node:path';
import { featureFromPrompt } from './featureFromPrompt.js';
import type { FeatureRequest, ComponentState } from './types.js';
import { getAstWriteDryRun, getAstWriteMode } from '../materialize/config.js';

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

interface CliArgs {
  file?: string;
  component?: string;
  state?: ComponentState;
  prompt?: string;
  apply?: boolean;
  dryRun?: boolean;
  noDryRun?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--file':
      case '-f':
        result.file = nextArg;
        i++;
        break;
      case '--component':
      case '-c':
        result.component = nextArg;
        i++;
        break;
      case '--state':
      case '-s':
        result.state = nextArg as ComponentState;
        i++;
        break;
      case '--prompt':
      case '-p':
        result.prompt = nextArg;
        i++;
        break;
      case '--apply':
        result.apply = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--no-dry-run':
        result.noDryRun = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Feature Orchestrator CLI - Prompt → Code → Figma

Usage:
  pnpm --filter @aesthetic-function/watcher feature [options]

Required:
  --file, -f <path>       Target file path (relative to repo root)
  --prompt, -p <text>     Natural language feature request

Optional:
  --component, -c <key>   Target component key (inferred from AST if not given)
  --state, -s <state>     Target state: base, hover, pressed, disabled (default: base)
  --apply                 Apply the patch after generation (requires AST_WRITE_MODE=write)
  --dry-run               Preview what would be applied without writing (overrides env)
  --no-dry-run            Actually write changes (overrides env, requires AST_WRITE_MODE=write)
  --help, -h              Show this help message

Examples:
  # Generate a patch artifact only (dry-run by default)
  pnpm --filter @aesthetic-function/watcher feature \\
    --file demo-app/src/App.tsx \\
    --component LoginButton \\
    --state hover \\
    --prompt "Make the hover state button use the success green token"

  # Preview what would be applied (--dry-run or AST_WRITE_DRY_RUN=true)
  AST_WRITE_MODE=write pnpm --filter @aesthetic-function/watcher feature \\
    --file demo-app/src/App.tsx \\
    --prompt "Change the Card title to 'Welcome'" \\
    --apply --dry-run

  # Actually apply the patch to source code
  AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false pnpm --filter @aesthetic-function/watcher feature \\
    --file demo-app/src/App.tsx \\
    --prompt "Change the Card title to 'Welcome'" \\
    --apply

  # Or use the --no-dry-run CLI flag (same result)
  AST_WRITE_MODE=write pnpm --filter @aesthetic-function/watcher feature \\
    --file demo-app/src/App.tsx \\
    --prompt "Change the Card title to 'Welcome'" \\
    --apply --no-dry-run

  # Apply AND immediately push to Figma (no watcher delay)
  POST_APPLY_EMIT=true AST_WRITE_MODE=write AST_WRITE_DRY_RUN=false \\
    pnpm --filter @aesthetic-function/watcher feature \\
    --file demo-app/src/App.tsx \\
    --component LoginButton \\
    --state hover \\
    --prompt "Make the hover state button use the success green token" \\
    --apply

Environment Variables:
  OPENAI_API_KEY              OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY           Anthropic API key (for Claude models)
  LLM_PROVIDER                LLM provider: openai (default) or anthropic
  LLM_MODEL                   Model name (e.g., gpt-4o, claude-3-5-sonnet-20241022)
  AST_WRITE_MODE              Write mode: off, patch (default), write
  AST_WRITE_DRY_RUN           Dry run: true (default), false
  POST_APPLY_EMIT             Immediately emit to Figma after apply: true, false (default)
  POST_APPLY_EMIT_DEBOUNCE_MS Debounce delay in ms (default: 200)

Output:
  Generates a patch artifact at:
    design-materializations/<file-path>.prompt-patch.json

  With POST_APPLY_EMIT=true, Figma updates immediately after apply.
  Otherwise, the normal watcher flow will emit Figma operations on file change.
`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  // Skip node and script path
  const args = process.argv.slice(2);

  // Check for help
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  // Validate required args
  if (!parsed.file) {
    console.error('Error: --file is required');
    printUsage();
    process.exit(1);
  }

  if (!parsed.prompt) {
    console.error('Error: --prompt is required');
    printUsage();
    process.exit(1);
  }

  // Determine repo root (watcher runs from packages/watcher)
  const repoRoot = resolve(process.cwd(), '..', '..');

  // Build request
  const request: FeatureRequest = {
    prompt: parsed.prompt,
    targetFile: parsed.file,
    targetComponentKey: parsed.component,
    state: parsed.state,
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Feature Orchestrator - Prompt → Code → Figma');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Resolve dryRun with precedence: CLI flag > env var > default (true)
  // --dry-run forces true, --no-dry-run forces false, otherwise use env
  const resolveDryRun = (): boolean => {
    if (parsed.dryRun) return true;      // --dry-run flag wins
    if (parsed.noDryRun) return false;   // --no-dry-run flag wins
    return getAstWriteDryRun();          // Otherwise use env (defaults to true)
  };

  const effectiveDryRun = resolveDryRun();
  const effectiveMode = getAstWriteMode();

  // Log effective configuration for transparency
  console.log(`  Configuration:`);
  console.log(`    AST_WRITE_MODE=${effectiveMode}`);
  console.log(`    AST_WRITE_DRY_RUN=${effectiveDryRun}`);
  console.log(`    --apply=${parsed.apply ?? false}`);
  console.log('');

  try {
    const result = await featureFromPrompt(request, {
      repoRoot,
      apply: parsed.apply,
      dryRun: effectiveDryRun,
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Result');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  ✓ Artifact saved: ${result.artifactPath}`);
    console.log(`  ✓ Changes: ${result.changesCount}`);
    console.log(`  ✓ Skipped: ${result.skippedCount}`);

    if (result.changesCount > 0) {
      console.log('');
      console.log('  Proposed Changes:');
      for (const change of result.artifact.changes) {
        console.log(`    • ${change.op}: ${change.nodeName}`);
        console.log(`      "${change.before}" → "${change.after}"`);
        console.log(`      Reason: ${change.reason}`);
      }
    }

    if (result.skippedCount > 0) {
      console.log('');
      console.log('  Skipped Changes:');
      for (const skip of result.artifact.skipped) {
        console.log(`    • ${skip.field}: ${skip.reason}`);
      }
    }

    // Show post-apply emit result
    if (result.postApplyEmit) {
      console.log('');
      if (result.postApplyEmit.sent) {
        console.log(`  ✓ Post-apply emit: ${result.postApplyEmit.opsCount} ops sent to Figma (${result.postApplyEmit.clientsNotified ?? 0} client(s))`);
      } else if (result.postApplyEmit.error) {
        console.log(`  ⚠ Post-apply emit: failed - ${result.postApplyEmit.error}`);
      } else if (!result.postApplyEmit.attempted) {
        console.log('  ℹ Post-apply emit: disabled (set POST_APPLY_EMIT=true to enable)');
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    if (!parsed.apply) {
      console.log('  Next steps:');
      console.log('    1. Review the patch artifact');
      console.log('    2. To apply: re-run with --apply flag');
      console.log('    3. Normal watcher flow will emit Figma operations');
      console.log('         (Or set POST_APPLY_EMIT=true for immediate Figma refresh)');
      console.log('');
    }
  } catch (err) {
    console.error('');
    console.error('Error:', err instanceof Error ? err.message : String(err));
    console.error('');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
