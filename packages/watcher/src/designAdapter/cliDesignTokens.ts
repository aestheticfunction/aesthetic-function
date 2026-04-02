#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - designAdapter/cliDesignTokens.ts
 *
 * Phase 16A: CLI for Design Token Pull + Normalization.
 *
 * USAGE:
 *   af design tokens
 *   pnpm design:tokens
 *
 * OPTIONS:
 *   --json                Output JSON format
 *   --verbose, -v         Show unmapped tokens + normalization details
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
} from './index.js';
import { FigmaMCPAdapter } from './figmaMCPAdapter.js';
import type { NormalizedDesignTokens, DesignAdapterTrace } from './types.js';

// =============================================================================
// ARG PARSING
// =============================================================================

interface TokensCliOptions {
  json: boolean;
  verbose: boolean;
  adapterId?: string;
}

function parseArgs(args: string[]): TokensCliOptions {
  const options: TokensCliOptions = {
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
      // handled by caller
    }
  }

  return options;
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatTokens(normalized: NormalizedDesignTokens, verbose: boolean): string {
  const lines: string[] = [];

  lines.push(`Design Tokens — ${normalized.source.adapterName} (${normalized.source.adapterId})`);
  lines.push(`Extracted: ${normalized.source.extractedAt}`);
  lines.push('');

  // Summary
  const s = normalized.summary;
  lines.push(`Total: ${s.total}  Mapped: ${s.mapped}  Unmapped: ${s.unmapped}`);
  const byType = Object.entries(s.byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  lines.push(`By type: ${byType}`);
  lines.push('');

  // Token table
  lines.push('  Token Name                          Type         Canonical                 Value');
  lines.push('  ' + '─'.repeat(90));

  for (const token of normalized.tokens) {
    if (!verbose && !token.mapped) continue;

    const name = token.originalName.padEnd(34);
    const type = token.type.padEnd(13);
    const canonical = (token.canonical ?? '—').padEnd(24);
    const value = token.resolvedValue;

    lines.push(`  ${name}${type}${canonical}${value}`);
  }

  if (!verbose && normalized.summary.unmapped > 0) {
    lines.push('');
    lines.push(`  (${normalized.summary.unmapped} unmapped tokens hidden — use --verbose to show)`);
  }

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`af design tokens — Pull and normalize design tokens

Usage: af design tokens [options]

Options:
  --json              Output JSON format
  --verbose, -v       Show unmapped tokens + normalization details
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
    console.error('Registered adapters:', getRegisteredDesignAdapters().map(a => a.id).join(', ') || '(none)');
    return 1;
  }

  // Pull tokens
  const start = Date.now();
  const result = await adapter.getDesignTokens();
  const normalized = normalizeDesignTokens(result.data, adapter.id, adapter.displayName);

  // Trace
  const trace: DesignAdapterTrace = {
    adapterId: adapter.id,
    operation: 'getDesignTokens',
    durationMs: Date.now() - start,
    itemCount: normalized.summary.total,
    normalization: {
      mapped: normalized.summary.mapped,
      unmapped: normalized.summary.unmapped,
      gaps: normalized.tokens.filter(t => !t.mapped).map(t => t.originalName),
    },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  if (options.json) {
    console.log(JSON.stringify({ normalized, trace, warnings: result.warnings }, null, 2));
  } else {
    console.log(formatTokens(normalized, options.verbose));

    if (result.warnings.length > 0) {
      console.log('');
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

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
if (isMain || process.argv[1]?.includes('cliDesignTokens')) {
  main().then(code => process.exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
