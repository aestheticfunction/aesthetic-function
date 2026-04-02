#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - designAdapter/cliDesignComponent.ts
 *
 * Phase 16B: CLI for Design Component Listing.
 *
 * USAGE:
 *   af design component              List all components
 *   af design component Button       Show component details
 *
 * OPTIONS:
 *   --json                Output JSON format
 *   --verbose, -v         Show full properties + variants
 *   --adapter <id>        Use a specific adapter (default: first available)
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - No adapter available or component not found
 *   2 - Usage error
 *
 * CONSTRAINTS: Read-only. Does NOT write to Figma or trigger reconciliation.
 */

import {
  getAvailableAdapter,
  getDesignAdapter,
  getRegisteredDesignAdapters,
  registerDesignAdapter,
} from './index.js';
import { FigmaMCPAdapter } from './figmaMCPAdapter.js';
import type { DesignAdapterTrace } from './types.js';
import type { DesignComponent } from '@aesthetic-function/shared/designAdapter';

// =============================================================================
// ARG PARSING
// =============================================================================

interface ComponentCliOptions {
  componentName?: string;
  json: boolean;
  verbose: boolean;
  adapterId?: string;
}

function parseArgs(args: string[]): ComponentCliOptions {
  const options: ComponentCliOptions = {
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
    } else if (arg === '--help' || arg === '-h') {
      // handled below
    } else if (!arg.startsWith('-')) {
      options.componentName = arg;
    }
  }

  return options;
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatComponentSummary(comp: DesignComponent, verbose: boolean): string {
  const lines: string[] = [];
  const variantCount = comp.variants?.length ?? 0;
  const variants = variantCount > 0 ? ` (${variantCount} variants)` : '';

  lines.push(`  ${comp.name} [${comp.type}]${variants}`);
  lines.push(`    ID: ${comp.id}`);

  if (verbose) {
    const propKeys = Object.keys(comp.properties);
    if (propKeys.length > 0) {
      lines.push(`    Properties: ${propKeys.join(', ')}`);
    }
    if (comp.variants) {
      for (const v of comp.variants) {
        const props = Object.entries(v.properties)
          .map(([k, val]) => `${k}=${val}`)
          .join(', ');
        lines.push(`    Variant: ${v.name} (${props})`);
      }
    }
  }

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af design component — List or inspect design components

Usage: af design component [name] [options]

  Without name: list all components
  With name: show component details

Options:
  --json                Output JSON format
  --verbose, -v         Show full properties + variants
  --adapter <id>        Use a specific adapter (default: first available)
  -h, --help            Show this help`);
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

  if (options.componentName) {
    // Single component lookup
    const result = await adapter.getComponent(options.componentName);
    const durationMs = Date.now() - start;

    const trace: DesignAdapterTrace = {
      adapterId: adapter.id,
      operation: 'getComponent',
      durationMs,
      itemCount: result.data ? 1 : 0,
      normalization: { mapped: 0, unmapped: 0, gaps: [] },
      errors: [],
      timestamp: new Date().toISOString(),
    };

    if (!result.data) {
      console.error(`Component "${options.componentName}" not found.`);
      return 1;
    }

    if (options.json) {
      console.log(JSON.stringify({ component: result.data, trace, warnings: result.warnings }, null, 2));
    } else {
      console.log(`Component — ${adapter.displayName}`);
      console.log('');
      console.log(formatComponentSummary(result.data, true)); // Always verbose for single
      if (result.warnings.length > 0) {
        console.log('');
        for (const w of result.warnings) {
          console.log(`  ⚠ ${w}`);
        }
      }
      if (options.verbose) {
        console.log('');
        console.log(`Trace: adapter=${trace.adapterId} op=${trace.operation} duration=${trace.durationMs}ms`);
      }
    }
    return 0;
  }

  // List all components
  const result = await adapter.getComponents();
  const durationMs = Date.now() - start;

  const trace: DesignAdapterTrace = {
    adapterId: adapter.id,
    operation: 'getComponents',
    durationMs,
    itemCount: result.data.length,
    normalization: { mapped: 0, unmapped: 0, gaps: [] },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  if (options.json) {
    console.log(JSON.stringify({ components: result.data, trace, warnings: result.warnings }, null, 2));
  } else {
    console.log(`Components — ${adapter.displayName} (${result.data.length} total)`);
    console.log('');
    for (const comp of result.data) {
      console.log(formatComponentSummary(comp, options.verbose));
    }

    if (result.warnings.length > 0) {
      console.log('');
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

    if (options.verbose) {
      console.log('');
      console.log(`Trace: adapter=${trace.adapterId} op=${trace.operation} ` +
        `duration=${trace.durationMs}ms items=${trace.itemCount}`);
    }
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliDesignComponent')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
