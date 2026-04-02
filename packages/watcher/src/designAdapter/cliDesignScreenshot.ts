#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - designAdapter/cliDesignScreenshot.ts
 *
 * Phase 16B: CLI for Design Screenshot Capture.
 *
 * USAGE:
 *   af design screenshot
 *   af design screenshot --node <node-id>
 *
 * OPTIONS:
 *   --node <id>           Figma node ID to screenshot (default: first page)
 *   --out <path>          Write PNG to file instead of stdout summary
 *   --json                Output JSON format (base64 data)
 *   --verbose, -v         Show trace details
 *   --adapter <id>        Use a specific adapter (default: first available)
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - No adapter available or screenshot not supported
 *   2 - Usage error
 *
 * CONSTRAINTS: Read-only. Does NOT write to Figma or trigger reconciliation.
 */

import { writeFileSync } from 'node:fs';
import {
  getAvailableAdapter,
  getDesignAdapter,
  getRegisteredDesignAdapters,
  registerDesignAdapter,
} from './index.js';
import { FigmaMCPAdapter } from './figmaMCPAdapter.js';
import type { DesignAdapterTrace } from './types.js';

// =============================================================================
// ARG PARSING
// =============================================================================

interface ScreenshotCliOptions {
  nodeId?: string;
  outPath?: string;
  json: boolean;
  verbose: boolean;
  adapterId?: string;
}

function parseArgs(args: string[]): ScreenshotCliOptions {
  const options: ScreenshotCliOptions = {
    json: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--node' && args[i + 1]) {
      options.nodeId = args[i + 1];
      i++;
    } else if (arg === '--out' && args[i + 1]) {
      options.outPath = args[i + 1];
      i++;
    } else if (arg === '--json') {
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
    console.log(`af design screenshot — Capture a design screenshot

Usage: af design screenshot [options]

Options:
  --node <id>           Figma node ID to screenshot (default: first page)
  --out <path>          Write PNG to file instead of stdout summary
  --json                Output JSON format (includes base64 data)
  --verbose, -v         Show trace details
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

  // Check capability
  const caps = adapter.getCapabilities();
  if (!caps.readScreenshots) {
    console.error(`Adapter "${adapter.id}" does not support screenshots.`);
    return 1;
  }

  if (!adapter.getScreenshot) {
    console.error(`Adapter "${adapter.id}" has no getScreenshot() implementation.`);
    return 1;
  }

  const start = Date.now();
  const result = await adapter.getScreenshot(options.nodeId);
  const durationMs = Date.now() - start;

  const trace: DesignAdapterTrace = {
    adapterId: adapter.id,
    operation: 'getScreenshot',
    durationMs,
    itemCount: result.data ? 1 : 0,
    normalization: { mapped: 0, unmapped: 0, gaps: [] },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  if (!result.data) {
    console.error('No screenshot returned.');
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.error(`  ⚠ ${w}`);
      }
    }
    return 1;
  }

  // Write to file if --out specified
  if (options.outPath) {
    const buffer = Buffer.from(result.data.data, 'base64');
    writeFileSync(options.outPath, buffer);
    console.log(`Screenshot written to ${options.outPath} (${buffer.length} bytes)`);
    return 0;
  }

  if (options.json) {
    console.log(JSON.stringify({
      screenshot: result.data,
      trace,
      warnings: result.warnings,
    }, null, 2));
  } else {
    const s = result.data;
    console.log(`Design Screenshot — ${adapter.displayName}`);
    console.log('');
    console.log(`  Subject: ${s.subject ?? 'unknown'}`);
    console.log(`  Format: ${s.format}`);
    if (s.width && s.height) {
      console.log(`  Dimensions: ${s.width} × ${s.height}`);
    }
    console.log(`  Captured: ${s.capturedAt}`);
    console.log(`  Data size: ${s.data.length} chars (base64)`);

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
if (isMain || process.argv[1]?.includes('cliDesignScreenshot')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
