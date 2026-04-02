#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - designAdapter/cliDesignPull.ts
 *
 * Phase 16A: CLI for Full Design Pull (tokens + components + styles + metadata).
 *
 * USAGE:
 *   af design pull
 *
 * OPTIONS:
 *   --json                Output JSON format
 *   --verbose, -v         Include full normalization detail
 *   --adapter <id>        Use a specific adapter (default: first available)
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - No adapter available
 *   2 - Usage error
 *
 * CONSTRAINTS: Read-only. Does NOT write to Figma or trigger reconciliation.
 */

import {
  getAvailableAdapter,
  getDesignAdapter,
  getRegisteredDesignAdapters,
  registerDesignAdapter,
  normalizeDesignTokens,
  normalizeDesignComponent,
} from './index.js';
import { FigmaMCPAdapter } from './figmaMCPAdapter.js';
import type { DesignAdapterTrace } from './types.js';

// =============================================================================
// ARG PARSING
// =============================================================================

interface PullCliOptions {
  json: boolean;
  verbose: boolean;
  adapterId?: string;
}

function parseArgs(args: string[]): PullCliOptions {
  const options: PullCliOptions = {
    json: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--adapter' && args[i + 1]) {
      options.adapterId = args[i + 1];
      i++;
    }
  }

  return options;
}

// =============================================================================
// MAIN
// =============================================================================

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af design pull — Pull full design data (tokens + components + styles)

Usage: af design pull [options]

Options:
  --json              Output JSON format
  --verbose, -v       Include full normalization detail
  --adapter <id>      Use a specific adapter (default: first available)
  -h, --help          Show this help`);
    return 0;
  }

  // Register default adapter if none registered
  if (getRegisteredDesignAdapters().length === 0) {
    registerDesignAdapter(new FigmaMCPAdapter());
  }

  // Find adapter
  const adapter = options.adapterId
    ? getDesignAdapter(options.adapterId)
    : await getAvailableAdapter();

  if (!adapter) {
    console.error(
      options.adapterId
        ? `Adapter "${options.adapterId}" not found.`
        : 'No design adapter available.',
    );
    return 1;
  }

  const start = Date.now();

  // Pull everything in parallel — all read-only
  const [tokensResult, componentsResult, stylesResult, fileResult] = await Promise.all([
    adapter.getDesignTokens(),
    adapter.getComponents(),
    adapter.getStyles(),
    adapter.getFileData(),
  ]);

  const durationMs = Date.now() - start;

  // Normalize
  const normalizedTokens = normalizeDesignTokens(
    tokensResult.data,
    adapter.id,
    adapter.displayName,
  );
  const normalizedComponents = componentsResult.data.map(c => normalizeDesignComponent(c));

  // Aggregate warnings
  const allWarnings = [
    ...tokensResult.warnings,
    ...componentsResult.warnings,
    ...stylesResult.warnings,
    ...fileResult.warnings,
  ];

  // Trace
  const trace: DesignAdapterTrace = {
    adapterId: adapter.id,
    operation: 'design:pull',
    durationMs,
    itemCount:
      normalizedTokens.summary.total +
      normalizedComponents.length +
      stylesResult.data.length,
    normalization: {
      mapped: normalizedTokens.summary.mapped,
      unmapped: normalizedTokens.summary.unmapped,
      gaps: normalizedTokens.tokens.filter(t => !t.mapped).map(t => t.originalName),
    },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  if (options.json) {
    console.log(JSON.stringify({
      file: fileResult.data,
      tokens: normalizedTokens,
      components: normalizedComponents,
      styles: stylesResult.data,
      trace,
      warnings: allWarnings,
    }, null, 2));
  } else {
    // File info
    const f = fileResult.data;
    console.log(`Design Pull — ${adapter.displayName}`);
    console.log('');
    console.log(`  File: ${f.name}`);
    console.log(`  Last modified: ${f.lastModified}`);
    console.log(`  Pages: ${f.pageCount}  Components: ${f.componentCount}  ` +
      `Styles: ${f.styleCount}  Variables: ${f.variableCount}`);
    console.log('');

    // Tokens summary
    const ts = normalizedTokens.summary;
    console.log(`  Tokens: ${ts.total} total (${ts.mapped} mapped, ${ts.unmapped} unmapped)`);
    const byType = Object.entries(ts.byType)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    console.log(`    By type: ${byType}`);
    console.log('');

    // Components summary
    console.log(`  Components: ${normalizedComponents.length}`);
    for (const comp of normalizedComponents) {
      const variants = (comp.variants?.length ?? 0) > 0
        ? ` (${comp.variants!.length} variants)`
        : '';
      console.log(`    ${comp.name}${variants}`);
    }
    console.log('');

    // Styles summary
    console.log(`  Styles: ${stylesResult.data.length}`);
    for (const style of stylesResult.data) {
      console.log(`    ${style.name} [${style.type}]`);
    }

    // Warnings
    if (allWarnings.length > 0) {
      console.log('');
      for (const w of allWarnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

    // Verbose trace
    if (options.verbose) {
      console.log('');
      console.log(`Trace: adapter=${trace.adapterId} op=${trace.operation} ` +
        `duration=${trace.durationMs}ms items=${trace.itemCount} ` +
        `mapped=${trace.normalization.mapped} unmapped=${trace.normalization.unmapped}`);
    }
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliDesignPull')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
