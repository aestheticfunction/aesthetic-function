/**
 * @aesthetic-function/watcher - crossSurfaceDrift/cliCrossSurfaceDrift.ts
 *
 * Phase 16C: CLI entry point for `af design drift` command.
 *
 * Runs cross-surface drift analysis comparing component data from
 * Figma, Storybook, and code (AST). Produces a human-readable or
 * JSON report of parity gaps between surfaces.
 *
 * This is a READ-ONLY operation — it does not modify reconciliation
 * resolution or write to any surface.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { CrossSurfaceDriftReport } from '@aesthetic-function/shared/crossSurfaceDrift';
import type { StorybookMCPConfig } from '@aesthetic-function/shared/storybookAdapter';
import { loadAfConfig } from '@aesthetic-function/shared/configLoader';
import { StorybookMCPAdapter } from '../designAdapter/storybookAdapter.js';
import { getAvailableAdapter, registerDesignAdapter } from '../designAdapter/registry.js';
import { FigmaConsoleMCPAdapter } from '../designAdapter/figmaConsoleMCPAdapter.js';
import { normalizeDesignComponent } from '../designAdapter/normalize.js';
import { analyzeCrossSurfaceDrift } from './analyze.js';
import type { CodeSurfaceData } from './analyze.js';

// =============================================================================
// REPO ROOT
// =============================================================================

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

// =============================================================================
// CODE SURFACE — file-based component scanner
// =============================================================================

/**
 * Recursively collect .ts/.tsx/.js/.jsx files under a directory.
 * Skips node_modules, dist, and .git.
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Return CodeSurfaceData for `componentName` if found in the watched source
 * files, or null if the component doesn't exist in code.
 *
 * Detection: looks for `function ComponentName`, `class ComponentName`,
 * or `const ComponentName =` in any TSX/TS source file inside watchPaths.
 *
 * Props: extracted from destructured function parameters.
 * Variants: extracted from string-literal union types in the same file.
 */
function findCodeSurface(
  componentName: string,
  watchPaths: string[],
  repoRoot: string,
): CodeSurfaceData | null {
  const namePattern = new RegExp(
    `(?:function|class)\\s+${componentName}\\b|` +
    `const\\s+${componentName}\\s*[=:]|` +
    `export\\s+(?:default\\s+)?(?:function|class)\\s+${componentName}\\b`,
  );

  for (const watchPath of watchPaths) {
    const absPath = resolve(repoRoot, watchPath);
    if (!existsSync(absPath)) continue;

    for (const file of collectSourceFiles(absPath)) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      if (!namePattern.test(content)) continue;

      // Extract props from destructured function parameters
      const props: string[] = [];
      const destructuredMatch = content.match(
        new RegExp(`(?:function|const)\\s+${componentName}[^(]*\\(\\s*\\{([^}]+)\\}`),
      );
      if (destructuredMatch) {
        for (const raw of destructuredMatch[1].split(',')) {
          const name = raw.trim().split(/[?:=\s]/)[0].trim();
          if (name && /^[a-zA-Z_$]/.test(name)) props.push(name);
        }
      }

      // Extract string-literal union values as variant candidates
      const variants: string[] = [];
      const unionRe = /'([^']+)'\s*\|/g;
      let m;
      while ((m = unionRe.exec(content)) !== null) {
        if (!variants.includes(m[1])) variants.push(m[1]);
      }

      return { props, variants };
    }
  }

  return null;
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

interface CliOptions {
  componentName?: string;
  json: boolean;
  verbose: boolean;
  includeUncorroborated: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    verbose: false,
    includeUncorroborated: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--include-uncorroborated') {
      options.includeUncorroborated = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.componentName) {
      options.componentName = arg;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`af design drift — Cross-surface drift analysis (read-only)

Usage: af design drift [component-name] [options]

Compares component metadata across Figma, Storybook, and code to detect
parity gaps. This is a read-only analysis — it does not modify reconciliation.

Arguments:
  component-name            Component to analyze (optional; analyzes all if omitted)

Options:
  --json                    Output JSON format
  --verbose, -v             Verbose output with trace details
  --include-uncorroborated  Include uncorroborated story-derived variants
  -h, --help                Show this help

Examples:
  af design drift Button
  af design drift Card --json
  af design drift --include-uncorroborated`);
}

export async function main(args: string[]): Promise<number> {
  const options = parseArgs(args);
  const config = loadAfConfig();

  // Register Figma adapter if credentials are available
  if (process.env.FIGMA_ACCESS_TOKEN && process.env.FIGMA_FILE_KEY) {
    registerDesignAdapter(new FigmaConsoleMCPAdapter({
      accessToken: process.env.FIGMA_ACCESS_TOKEN,
      fileKey: process.env.FIGMA_FILE_KEY,
    }));
  }

  // Check adapter availability
  const figmaAdapter = await getAvailableAdapter();
  const storybookConfig: StorybookMCPConfig = {
    url: config.storybook.url,
    mcpPath: config.storybook.mcpPath,
    timeout: config.storybook.timeout,
    framework: config.storybook.framework,
  };
  const storybookAdapter = new StorybookMCPAdapter(storybookConfig);
  const storybookAvailable = await storybookAdapter.isAvailable();

  // Report surface availability
  if (!options.json) {
    const figmaStatus = figmaAdapter ? `available` : 'unavailable';
    const storybookStatus = storybookAvailable
      ? `available (${storybookAdapter.operatingMode})`
      : 'unavailable';

    if (!storybookAvailable && !figmaAdapter) {
      console.log(`\u2717 Cross-Surface Drift Analysis: aborted\n`);
      console.log(`Figma adapter: unavailable`);
      console.log(`Storybook adapter: unavailable`);
      if (storybookAdapter.unavailableReason) {
        console.log(`  \u2192 ${storybookAdapter.unavailableReason}`);
        console.log(`  \u2192 Start it with: pnpm dev:storybook`);
        console.log(`  \u2192 Or configure a different URL in af.config.json \u2192 storybook.url`);
      }
      console.log(`\nCannot run drift analysis without at least 2 surfaces. Exiting.`);
      return 2;
    }

    if (!storybookAvailable) {
      console.log(`Storybook adapter: unavailable`);
      if (storybookAdapter.unavailableReason) {
        console.log(`  \u2192 ${storybookAdapter.unavailableReason}`);
        console.log(`  \u2192 Start it with: pnpm dev:storybook`);
      }
      console.log(`Continuing with Figma + Code only.\n`);
    }

    if (options.verbose) {
      console.log(`Figma adapter: ${figmaStatus}`);
      console.log(`Storybook adapter: ${storybookStatus}\n`);
    }
  }

  // Get component data from available surfaces
  const reports: CrossSurfaceDriftReport[] = [];

  if (options.componentName) {
    // Analyze a single component
    const report = await analyzeComponent(
      options.componentName,
      figmaAdapter,
      storybookAvailable ? storybookAdapter : null,
      options,
      config,
    );
    reports.push(report);
  } else {
    // Analyze all components from Storybook inventory
    if (storybookAvailable) {
      const inventory = await storybookAdapter.getInventory();
      for (const component of inventory.data.components) {
        const report = await analyzeComponent(
          component.name,
          figmaAdapter,
          storybookAdapter,
          options,
          config,
        );
        reports.push(report);
      }
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) {
      formatReport(report, options.verbose);
    }
  }

  // Return exit code based on severity
  const hasFailures = reports.some(r => r.severity === 'fail');
  return hasFailures ? 1 : 0;
}

// =============================================================================
// COMPONENT ANALYSIS
// =============================================================================

async function analyzeComponent(
  componentName: string,
  figmaAdapter: Awaited<ReturnType<typeof getAvailableAdapter>>,
  storybookAdapter: StorybookMCPAdapter | null,
  options: CliOptions,
  afConfig: ReturnType<typeof loadAfConfig>,
): Promise<CrossSurfaceDriftReport> {
  // Track which surfaces we actually query
  const queriedSurfaces: ('figma' | 'storybook' | 'code')[] = [];

  // Fetch Figma data
  let figmaData = null;
  if (figmaAdapter) {
    queriedSurfaces.push('figma');
    try {
      const result = await figmaAdapter.getComponent(componentName);
      if (result.data) {
        figmaData = normalizeDesignComponent(result.data);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[af:drift] Figma adapter error for "${componentName}": ${msg}`);
    }
  }

  // Fetch Storybook data
  let storybookData = null;
  if (storybookAdapter) {
    queriedSurfaces.push('storybook');
    try {
      const result = await storybookAdapter.getComponentMeta(componentName);
      storybookData = result.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[af:drift] Storybook adapter error for "${componentName}": ${msg}`);
    }
  }

  // Scan source files for this component
  queriedSurfaces.push('code');
  const repoRoot = findRepoRoot();
  const codeData: CodeSurfaceData | null = findCodeSurface(
    componentName,
    afConfig.watcher.watchPaths,
    repoRoot,
  );

  return analyzeCrossSurfaceDrift(
    componentName,
    figmaData,
    storybookData,
    codeData,
    { includeUncorroborated: options.includeUncorroborated, queriedSurfaces },
  );
}

// =============================================================================
// HUMAN-READABLE FORMATTING
// =============================================================================

function formatReport(report: CrossSurfaceDriftReport, verbose: boolean): void {
  console.log(`Cross-Surface Drift Analysis: ${report.componentName}`);
  console.log('\u2501'.repeat(40));

  // Surface status
  const surfaces: string[] = [];
  const queried = new Set(report.queriedSurfaces);

  if (!queried.has('figma')) surfaces.push('Figma \u2014');
  else if (report.surfaces.figma && (report.surfaces.figma.props.length > 0 || report.surfaces.figma.variants.length > 0)) surfaces.push('Figma \u2713');
  else surfaces.push('Figma \u2717');

  if (!queried.has('storybook')) surfaces.push('Storybook \u2014');
  else if (report.surfaces.storybook && (report.surfaces.storybook.props.length > 0 || report.surfaces.storybook.variants.length > 0)) surfaces.push('Storybook \u2713');
  else surfaces.push('Storybook \u2717');

  if (!queried.has('code')) surfaces.push('Code (AST) \u2014');
  else if (report.surfaces.code && (report.surfaces.code.props.length > 0 || report.surfaces.code.variants.length > 0)) surfaces.push('Code (AST) \u2713');
  else surfaces.push('Code (AST) \u2717');

  console.log(`Surfaces: ${surfaces.join('  ')}`);
  console.log('');

  if (report.findings.length === 0) {
    console.log('No drift detected.');
  } else {
    console.log('Findings:');
    for (const finding of report.findings) {
      const icon = finding.severity === 'warn' ? '\u26A0' :
                   finding.severity === 'fail' ? '\u2717' : '\u2139';
      const severityLabel = finding.severity.toUpperCase();
      console.log(`  ${icon} ${severityLabel}  ${finding.field} \u2014 ${finding.message}  [confidence: ${finding.confidence}]`);
      if (finding.storyRef && verbose) {
        console.log(`          \u2192 Story ref: ${finding.storyRef}`);
      }
    }
  }

  console.log('');

  // Summary
  const warnCount = report.findings.filter(f => f.severity === 'warn').length;
  const infoCount = report.findings.filter(f => f.severity === 'info').length;
  const failCount = report.findings.filter(f => f.severity === 'fail').length;

  if (report.findings.length > 0) {
    const parts: string[] = [];
    if (failCount > 0) parts.push(`${failCount} failure${failCount !== 1 ? 's' : ''}`);
    if (warnCount > 0) parts.push(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`);
    if (infoCount > 0) parts.push(`${infoCount} info`);
    console.log(`Severity: ${report.severity} (${parts.join(', ')})`);
  }
  console.log('');
}

// Allow direct execution via tsx
if (process.argv[1]?.endsWith('cliCrossSurfaceDrift.ts') || process.argv[1]?.endsWith('cliCrossSurfaceDrift.js')) {
  main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
