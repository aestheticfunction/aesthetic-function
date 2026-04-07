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

import type { CrossSurfaceDriftReport } from '@aesthetic-function/shared/crossSurfaceDrift';
import type { StorybookMCPConfig } from '@aesthetic-function/shared/storybookAdapter';
import { loadAfConfig } from '@aesthetic-function/shared/configLoader';
import { StorybookMCPAdapter } from '../designAdapter/storybookAdapter.js';
import { getAvailableAdapter } from '../designAdapter/registry.js';
import { normalizeDesignComponent } from '../designAdapter/normalize.js';
import { analyzeCrossSurfaceDrift } from './analyze.js';
import type { CodeSurfaceData } from './analyze.js';

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
): Promise<CrossSurfaceDriftReport> {
  // Fetch Figma data
  let figmaData = null;
  if (figmaAdapter) {
    try {
      const result = await figmaAdapter.getComponent(componentName);
      if (result.data) {
        figmaData = normalizeDesignComponent(result.data);
      }
    } catch {
      // Figma data unavailable for this component
    }
  }

  // Fetch Storybook data
  let storybookData = null;
  if (storybookAdapter) {
    try {
      const result = await storybookAdapter.getComponentMeta(componentName);
      storybookData = result.data;
    } catch {
      // Storybook data unavailable for this component
    }
  }

  // Code data would come from AST analysis — placeholder for now
  const codeData: CodeSurfaceData | null = null;

  return analyzeCrossSurfaceDrift(
    componentName,
    figmaData,
    storybookData,
    codeData,
    { includeUncorroborated: options.includeUncorroborated },
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
  if (report.surfaces.figma) surfaces.push('Figma \u2713');
  else surfaces.push('Figma \u2717');
  if (report.surfaces.storybook) surfaces.push('Storybook \u2713');
  else surfaces.push('Storybook \u2717');
  if (report.surfaces.code) surfaces.push('Code (AST) \u2713');
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
