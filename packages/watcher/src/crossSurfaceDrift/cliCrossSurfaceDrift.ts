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

import type { CrossSurfaceDriftReport, DriftSurfaceId } from '@aesthetic-function/shared/crossSurfaceDrift';
import type { StorybookMCPConfig } from '@aesthetic-function/shared/storybookAdapter';
import { loadAfConfig } from '@aesthetic-function/shared/configLoader';
import { StorybookMCPAdapter } from '../designAdapter/storybookAdapter.js';
import { getAvailableAdapter, registerDesignAdapter } from '../designAdapter/registry.js';
import { FigmaConsoleMCPAdapter } from '../designAdapter/figmaConsoleMCPAdapter.js';
import { normalizeDesignComponent } from '../designAdapter/normalize.js';
import { loadContract, findContractComponent, listContractComponentNames } from '../contractSurface/index.js';
import type { DspackDocument } from '../contractSurface/index.js';
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

  // Collect all matching files and their extracted metadata so we can pick
  // the richest match rather than the first alphabetical hit.
  let bestResult: CodeSurfaceData | null = null;
  let bestScore = -1;
  let bestFileMatchesName = false;

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

      // Extract props from interface/type definitions (e.g., interface ButtonProps { ... })
      const interfaceRe = new RegExp(
        `(?:interface|type)\\s+${componentName}Props\\s*(?:=\\s*)?\\{([^}]+)\\}`,
      );
      const interfaceMatch = content.match(interfaceRe);
      if (interfaceMatch) {
        for (const raw of interfaceMatch[1].split(/[;\n]/)) {
          const trimmed = raw.trim();
          if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          const name = trimmed.split(/[?:]/)[0].trim();
          if (name && /^[a-zA-Z_$]/.test(name) && !props.includes(name)) {
            props.push(name);
          }
        }
      }

      // Extract string-literal union values as variant candidates.
      // Find lines that contain both '...' string literals and | (union syntax),
      // then extract all quoted values from those lines.
      const variants: string[] = [];
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('|') && /'[^']+'/.test(line)) {
          const valueRe = /'([^']+)'/g;
          let m;
          while ((m = valueRe.exec(line)) !== null) {
            if (!variants.includes(m[1])) variants.push(m[1]);
          }
        }
      }

      // Rank this candidate: richest metadata wins.
      // Tiebreaker: prefer file whose basename matches the component name.
      const score = props.length + variants.length;
      const basename = file.split('/').pop() ?? '';
      const fileMatchesName = basename.replace(/\.(tsx?|jsx?)$/, '').toLowerCase() === componentName.toLowerCase();

      if (
        score > bestScore ||
        (score === bestScore && fileMatchesName && !bestFileMatchesName)
      ) {
        bestResult = { props, variants };
        bestScore = score;
        bestFileMatchesName = fileMatchesName;
      }
    }
  }

  return bestResult;
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

interface CliOptions {
  componentName?: string;
  json: boolean;
  verbose: boolean;
  includeUncorroborated: boolean;
  dspackPath?: string;
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
    } else if (arg === '--dspack') {
      const next = args[i + 1];
      if (!next || next.startsWith('-')) {
        console.error('--dspack requires a file path argument');
        process.exit(2);
      }
      options.dspackPath = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.componentName) {
      options.componentName = arg;
    }
  }

  return options;
}

/**
 * Resolve the dspack contract path from CLI flag (first priority) or
 * af.config.json `contract.dspackPath`. Relative paths are tried against
 * the current working directory, then the repo root (matching how
 * watchPaths resolve). Returns null when no contract is configured.
 */
function resolveContractPath(
  options: CliOptions,
  configPath: string | null,
  repoRoot: string,
): string | null {
  const raw = options.dspackPath ?? configPath;
  if (!raw) return null;

  const candidates = [resolve(process.cwd(), raw), resolve(repoRoot, raw)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  console.error(`dspack contract file not found: ${raw}`);
  console.error(`  Tried: ${[...new Set(candidates)].join(', ')}`);
  return null;
}

function printHelp(): void {
  console.log(`af design drift — Cross-surface drift analysis (read-only)

Usage: af design drift [component-name] [options]

Compares component metadata across Figma, Storybook, code, and an optional
dspack contract file to detect parity gaps. This is a read-only analysis —
it does not modify reconciliation, and the contract file is never written.

Arguments:
  component-name            Component to analyze (optional; analyzes all if omitted)

Options:
  --json                    Output JSON format
  --verbose, -v             Verbose output with trace details
  --include-uncorroborated  Include uncorroborated story-derived variants
  --dspack <file>           dspack contract file to compare against
                            (or set contract.dspackPath in af.config.json)
  -h, --help                Show this help

Examples:
  af design drift Button
  af design drift Card --json
  af design drift Button --dspack ./my-system.dspack.json
  af design drift --include-uncorroborated`);
}

export async function main(args: string[]): Promise<number> {
  const options = parseArgs(args);
  const config = loadAfConfig();

  // Load the dspack contract surface, if configured (read-only)
  let contractDoc: DspackDocument | null = null;
  let contractPath: string | null = null;
  if (options.dspackPath || config.contract.dspackPath) {
    contractPath = resolveContractPath(options, config.contract.dspackPath, findRepoRoot());
    if (!contractPath) {
      return 2;
    }
    try {
      contractDoc = loadContract(contractPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(msg);
      return 2;
    }
  }

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

    if (!storybookAvailable && !figmaAdapter && !contractDoc) {
      console.log(`\u2717 Cross-Surface Drift Analysis: aborted\n`);
      console.log(`Figma adapter: unavailable`);
      console.log(`Storybook adapter: unavailable`);
      if (storybookAdapter.unavailableReason) {
        console.log(`  \u2192 ${storybookAdapter.unavailableReason}`);
        console.log(`  \u2192 Start it with: pnpm dev:storybook`);
        console.log(`  \u2192 Or configure a different URL in af.config.json \u2192 storybook.url`);
      }
      console.log(`  \u2192 Or compare against a dspack contract: --dspack <file>`);
      console.log(`\nCannot run drift analysis without at least 2 surfaces. Exiting.`);
      return 2;
    }

    if (!storybookAvailable && !figmaAdapter && contractDoc) {
      console.log(`Figma adapter: unavailable`);
      console.log(`Storybook adapter: unavailable`);
      console.log(`Continuing with Contract + Code only.\n`);
    } else if (!storybookAvailable) {
      console.log(`Storybook adapter: unavailable`);
      if (storybookAdapter.unavailableReason) {
        console.log(`  \u2192 ${storybookAdapter.unavailableReason}`);
        console.log(`  \u2192 Start it with: pnpm dev:storybook`);
      }
      console.log(`Continuing with ${contractDoc ? 'Figma + Code + Contract' : 'Figma + Code'} only.\n`);
    }

    if (options.verbose) {
      console.log(`Figma adapter: ${figmaStatus}`);
      console.log(`Storybook adapter: ${storybookStatus}`);
      console.log(`Contract: ${contractDoc ? `loaded (${contractPath})` : 'not configured'}\n`);
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
      contractDoc,
      options,
      config,
    );
    reports.push(report);
  } else {
    // Analyze all components. Inventory comes from Storybook when available,
    // otherwise from the contract's declared components.
    if (storybookAvailable) {
      const inventory = await storybookAdapter.getInventory();
      for (const component of inventory.data.components) {
        const report = await analyzeComponent(
          component.name,
          figmaAdapter,
          storybookAdapter,
          contractDoc,
          options,
          config,
        );
        reports.push(report);
      }
    } else if (contractDoc) {
      for (const name of listContractComponentNames(contractDoc)) {
        const report = await analyzeComponent(
          name,
          figmaAdapter,
          null,
          contractDoc,
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
  contractDoc: DspackDocument | null,
  options: CliOptions,
  afConfig: ReturnType<typeof loadAfConfig>,
): Promise<CrossSurfaceDriftReport> {
  // Track which surfaces we actually query
  const queriedSurfaces: DriftSurfaceId[] = [];

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

  // Look up the component in the dspack contract (read-only, in-memory)
  let contractData = null;
  if (contractDoc) {
    queriedSurfaces.push('contract');
    contractData = findContractComponent(contractDoc, componentName);
  }

  return analyzeCrossSurfaceDrift(
    componentName,
    figmaData,
    storybookData,
    codeData,
    { includeUncorroborated: options.includeUncorroborated, queriedSurfaces, contractData },
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

  if (queried.has('contract')) {
    if (report.surfaces.contract && (report.surfaces.contract.props.length > 0 || report.surfaces.contract.variants.length > 0)) surfaces.push('Contract \u2713');
    else surfaces.push('Contract \u2717');
  }

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

    // One remediation hint per report when code-vs-contract staleness was found
    if (report.findings.some(f => f.field.startsWith('contract-staleness:'))) {
      console.log('');
      console.log('  \u2192 Contract may be stale. Regenerate the dspack snapshot with: dspack-export generate');
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
