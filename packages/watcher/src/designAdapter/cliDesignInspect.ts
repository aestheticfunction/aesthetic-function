#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - designAdapter/cliDesignInspect.ts
 *
 * Phase 16A: CLI for Design Component Inspection.
 *
 * USAGE:
 *   af design inspect <component-name>
 *   af design inspect --all
 *
 * OPTIONS:
 *   --all                 Inspect all components
 *   --json                Output JSON format
 *   --verbose, -v         Show all properties including unmapped
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
  normalizeDesignComponent,
} from './index.js';
import { FigmaMCPAdapter } from './figmaMCPAdapter.js';
import type { NormalizedDesignComponent, DesignAdapterTrace } from './types.js';

// =============================================================================
// ARG PARSING
// =============================================================================

interface InspectCliOptions {
  componentName: string;
  all: boolean;
  json: boolean;
  verbose: boolean;
  adapterId?: string;
}

function parseArgs(args: string[]): InspectCliOptions {
  const options: InspectCliOptions = {
    componentName: '',
    all: false,
    json: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--adapter' && args[i + 1]) {
      options.adapterId = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      // handled by caller
    } else if (!arg.startsWith('-')) {
      options.componentName = arg;
    }
  }

  return options;
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatComponent(comp: NormalizedDesignComponent, verbose: boolean): string {
  const lines: string[] = [];

  lines.push(`Component: ${comp.name}`);
  if (comp.nodeId) lines.push(`  Node ID: ${comp.nodeId}`);
  lines.push(`  Type: ${comp.type}`);
  lines.push('');

  // Properties
  lines.push('  Properties:');
  const props = comp.properties;
  if (props.fills && props.fills.length > 0) {
    lines.push(`    Fills: ${props.fills.join(', ')}`);
  }
  if (props.textContent !== undefined) {
    lines.push(`    Text: "${props.textContent}"`);
  }
  if (props.fontSize !== undefined) {
    lines.push(`    Font size: ${props.fontSize}`);
  }
  if (props.fontWeight !== undefined) {
    lines.push(`    Font weight: ${props.fontWeight}`);
  }
  if (props.cornerRadius !== undefined) {
    lines.push(`    Corner radius: ${props.cornerRadius}`);
  }
  if (props.padding) {
    const p = props.padding;
    lines.push(`    Padding: ${p.top} ${p.right} ${p.bottom} ${p.left}`);
  }
  if (props.gap !== undefined) {
    lines.push(`    Gap: ${props.gap}`);
  }
  if (props.width !== undefined || props.height !== undefined) {
    lines.push(`    Size: ${props.width ?? '?'} × ${props.height ?? '?'}`);
  }

  // Variants
  if (comp.variants && comp.variants.length > 0) {
    lines.push('');
    lines.push('  Variants:');
    for (const v of comp.variants) {
      lines.push(`    ${v.name} — ${v.state}`);
    }
  }

  // Unmapped
  if (verbose && comp.unmappedProperties.length > 0) {
    lines.push('');
    lines.push('  Unmapped properties:');
    for (const p of comp.unmappedProperties) {
      lines.push(`    ${p}`);
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
    console.log(`af design inspect — Inspect design components

Usage: af design inspect <component-name> [options]
       af design inspect --all [options]

Options:
  --all                 Inspect all components
  --json                Output JSON format
  --verbose, -v         Show unmapped properties
  --adapter <id>        Use a specific adapter (default: first available)
  -h, --help            Show this help`);
    return 0;
  }

  if (!options.componentName && !options.all) {
    console.error('Error: Component name or --all is required');
    console.error('Usage: af design inspect <component-name> [options]');
    return 2;
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

  if (options.all) {
    // Inspect all components
    const result = await adapter.getComponents();
    const normalized = result.data.map(c => normalizeDesignComponent(c));

    const trace: DesignAdapterTrace = {
      adapterId: adapter.id,
      operation: 'getComponents',
      durationMs: Date.now() - start,
      itemCount: normalized.length,
      normalization: {
        mapped: normalized.reduce((sum: number, c: NormalizedDesignComponent) => sum + (c.properties.fills?.length ?? 0), 0),
        unmapped: normalized.reduce((sum: number, c: NormalizedDesignComponent) => sum + c.unmappedProperties.length, 0),
        gaps: normalized.flatMap((c: NormalizedDesignComponent) => c.unmappedProperties),
      },
      errors: [],
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify({ components: normalized, trace, warnings: result.warnings }, null, 2));
    } else {
      for (let i = 0; i < normalized.length; i++) {
        if (i > 0) console.log('');
        console.log(formatComponent(normalized[i], options.verbose));
      }

      if (result.warnings.length > 0) {
        console.log('');
        for (const w of result.warnings) {
          console.log(`  ⚠ ${w}`);
        }
      }
    }

    return 0;
  }

  // Inspect single component
  const result = await adapter.getComponent(options.componentName);

  if (!result.data) {
    console.error(`Component "${options.componentName}" not found.`);
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.error(`  ⚠ ${w}`);
      }
    }
    return 1;
  }

  const normalized = normalizeDesignComponent(result.data);

  const trace: DesignAdapterTrace = {
    adapterId: adapter.id,
    operation: 'getComponent',
    durationMs: Date.now() - start,
    itemCount: 1,
    normalization: {
      mapped: normalized.properties.fills?.length ?? 0,
      unmapped: normalized.unmappedProperties.length,
      gaps: normalized.unmappedProperties,
    },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  if (options.json) {
    console.log(JSON.stringify({ component: normalized, trace, warnings: result.warnings }, null, 2));
  } else {
    console.log(formatComponent(normalized, options.verbose));

    if (result.warnings.length > 0) {
      console.log('');
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

    if (options.verbose) {
      console.log('');
      console.log(`Trace: adapter=${trace.adapterId} op=${trace.operation} ` +
        `duration=${trace.durationMs}ms`);
    }
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliDesignInspect')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
