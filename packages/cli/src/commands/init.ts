/**
 * @aesthetic-function/cli - commands/init.ts
 *
 * Phase 15C: `af init` — Generate af.config.json for project setup.
 *
 * WHY: Convenience for project setup. Detects existing project artifacts
 * and generates a valid config file. Does NOT start the system.
 *
 * CONSTRAINTS:
 * - Only writes af.config.json — no other files
 * - Does not start watcher or server
 * - Does not modify reconciliation behavior
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type { AfConfig, PolicyProfileName } from '@aesthetic-function/shared/config';

// =============================================================================
// ARGS
// =============================================================================

interface InitOptions {
  profile?: PolicyProfileName;
  force?: boolean;
  json?: boolean;
}

function parseArgs(args: string[]): InitOptions {
  const options: InitOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile' && args[i + 1]) {
      options.profile = args[i + 1] as PolicyProfileName;
      i++;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

// =============================================================================
// DETECTION
// =============================================================================

interface DetectedContext {
  hasComponentMap: boolean;
  hasDesignOverrides: boolean;
  hasReconcileSources: boolean;
  framework: string | null;
}

function detectProjectContext(cwd: string): DetectedContext {
  const ctx: DetectedContext = {
    hasComponentMap: existsSync(join(cwd, 'component-map.json')),
    hasDesignOverrides: existsSync(join(cwd, 'design-overrides.json')),
    hasReconcileSources: existsSync(join(cwd, 'reconcile.sources.json')),
    framework: null,
  };

  // Detect framework from package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) ctx.framework = 'react';
      else if (deps.vue) ctx.framework = 'vue';
      else if (deps.svelte) ctx.framework = 'svelte';
    } catch {
      // Ignore
    }
  }

  return ctx;
}

// =============================================================================
// PROMPT HELPER
// =============================================================================

async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

// =============================================================================
// CONFIG GENERATION
// =============================================================================

function generateConfig(
  profile: PolicyProfileName,
  ctx: DetectedContext,
): AfConfig {
  const config: AfConfig = {
    profile,
  };

  // Server defaults
  config.server = {
    port: 3001,
  };

  // Include framework if detected
  if (ctx.framework === 'react') {
    // Default watch path for React projects — src/ is the common convention
    config.watcher = { watchPaths: ['./src'] };
  }

  // If design-overrides.json exists, the project already uses overrides
  if (ctx.hasDesignOverrides) {
    config.overrides = { enabled: true };
  }

  return config;
}

// =============================================================================
// MAIN
// =============================================================================

export async function init(args: string[]): Promise<number> {
  const options = parseArgs(args);
  const cwd = process.cwd();
  const configPath = join(cwd, 'af.config.json');

  // Check for --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af init — Generate af.config.json

Usage: af init [options]

Options:
  --profile <name>  Set policy profile (designer-first|code-first|balanced|strict-review)
  --force, -f       Overwrite existing af.config.json
  --json            Output generated config as JSON (no file write)
  -h, --help        Show this help`);
    return 0;
  }

  // Check for existing config
  if (existsSync(configPath) && !options.force) {
    console.error('af.config.json already exists. Use --force to overwrite.');
    return 1;
  }

  // Detect project context
  const ctx = detectProjectContext(cwd);

  // Determine profile
  let profile: PolicyProfileName;
  const validProfiles: PolicyProfileName[] = ['designer-first', 'code-first', 'balanced', 'strict-review'];

  if (options.profile) {
    if (!validProfiles.includes(options.profile)) {
      console.error(`Invalid profile: ${options.profile}`);
      console.error(`Valid profiles: ${validProfiles.join(', ')}`);
      return 2;
    }
    profile = options.profile;
  } else if (process.stdin.isTTY) {
    // Interactive prompt
    console.log('Aesthetic Function — Project Setup');
    console.log('');
    if (ctx.framework) console.log(`  Framework detected: ${ctx.framework}`);
    if (ctx.hasComponentMap) console.log('  Found: component-map.json');
    if (ctx.hasDesignOverrides) console.log('  Found: design-overrides.json');
    if (ctx.hasReconcileSources) console.log('  Found: reconcile.sources.json');
    console.log('');
    console.log('Available profiles:');
    console.log('  designer-first   — Overrides always win (default)');
    console.log('  code-first       — Overrides win only if newer than code');
    console.log('  balanced         — Code-first + conflict warnings');
    console.log('  strict-review    — Block all conflicts for human review');
    console.log('');

    const answer = await prompt('Profile', 'designer-first');
    profile = validProfiles.includes(answer as PolicyProfileName)
      ? (answer as PolicyProfileName)
      : 'designer-first';
  } else {
    // Non-interactive: use default
    profile = 'designer-first';
  }

  // Generate config
  const config = generateConfig(profile, ctx);

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return 0;
  }

  // Write config file
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`Created af.config.json (profile: ${profile})`);

  return 0;
}
