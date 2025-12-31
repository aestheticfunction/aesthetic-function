#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationTimeline/cliTimeline.ts
 *
 * Phase 13B + 13B.2: CLI for Design Drift Timeline.
 *
 * WHY: Single command to view the time-ordered reconciliation history
 * for a source file, with explicit opt-in run recording.
 *
 * USAGE:
 *   pnpm figma:timeline <source-file>
 *
 * OPTIONS:
 *   --repo-root <path>    Repository root (default: auto-detect)
 *   --json                Output JSON format
 *   --limit <n>           Maximum runs to show (default: 10)
 *   --write               Force write ledger artifact even if empty
 *   --record              Explicitly append a new run to the ledger
 *   --verbose             Show discovery paths
 *   --help, -h            Show this help message and exit
 *
 * RECORDING:
 *   Runs are recorded ONLY when both:
 *   - --record flag is present
 *   - RECONCILIATION_TIMELINE_ON=true
 *
 * EXIT CODES:
 *   0 - Success / help
 *   2 - Usage error
 */

import { resolve } from 'node:path';
import { join } from 'node:path';
import { argv, exit, cwd } from 'node:process';

import type { TimelineReadContext, TimelineRecordContext } from './types.js';
import {
  getRepoRoot,
  normalizeSourcePath,
  getRecentRuns,
  loadRunLedger,
  getRunLedgerPath,
  createRunEntry,
  appendRunEntry,
  isTimelineEnabled,
} from './compute.js';
import { writeRunLedger, formatTimeline, formatTimelineVerbose } from './artifact.js';

interface CliOptions {
  sourceFile: string;
  repoRoot: string;
  json: boolean;
  limit: number;
  write: boolean;
  record: boolean;
  verbose: boolean;
}

/**
 * Result of parsing CLI arguments.
 *
 * Phase 13B.2: Structured result for testability and help priority.
 */
type ParseArgsResult =
  | CliOptions
  | { error: string };

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:timeline <source-file> [options]

View time-ordered reconciliation history for a source file.

Arguments:
  <source-file>           Source file to show timeline for (e.g., demo-app/src/App.tsx)

Options:
  --repo-root <path>      Repository root (default: auto-detect)
  --json                  Output JSON format
  --limit <n>             Maximum runs to show (default: 10)
  --write                 Force write ledger artifact even if empty
  --record                Explicitly append a new run to the ledger
  --verbose, -v           Show discovery paths
  --help, -h              Show this help message and exit

Recording:
  Runs are recorded ONLY when both:
  - --record flag is present
  - RECONCILIATION_TIMELINE_ON=true

Exit Codes:
  0                       Success / help
  2                       Usage error

Examples:
  figma:timeline demo-app/src/App.tsx
  figma:timeline demo-app/src/App.tsx --json
  figma:timeline demo-app/src/App.tsx --limit 5
  figma:timeline demo-app/src/App.tsx --record
`.trim());
}

/**
 * Parse CLI arguments.
 *
 * Phase 13B.2: Check --help/-h BEFORE positional validation.
 * Returns structured result for testability.
 */
function parseArgs(args: string[]): ParseArgsResult {
  // Phase 13B.2: Check for help flag FIRST, before any validation
  // Help wins regardless of argument order or other flags
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return { error: '' }; // Empty error signals help (exit 0)
  }

  const options: CliOptions = {
    sourceFile: '',
    repoRoot: '', // Empty means auto-detect
    json: false,
    limit: 10,
    write: false,
    record: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = resolve(args[i + 1]);
      i++;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10) || 10;
      i++;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--record') {
      options.record = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      options.sourceFile = arg;
    }
  }

  // Validate source file (only if help was not requested)
  if (!options.sourceFile) {
    return { error: 'Source file is required' };
  }

  return options;
}

/**
 * Main CLI entry point.
 *
 * Phase 13B.2: Accepts args for testability, returns exit code.
 */
export async function main(args: string[] = argv.slice(2)): Promise<number> {
  const parsed = parseArgs(args);

  // Handle parse result
  if ('error' in parsed) {
    if (parsed.error) {
      // Usage error - print error and exit 2
      console.error(`Error: ${parsed.error}`);
      printUsage();
      return 2;
    }
    // Help was requested - already printed, exit 0
    return 0;
  }

  const options = parsed;

  // Auto-detect repo root if not provided
  const repoRoot = options.repoRoot || getRepoRoot();
  const normalizedSource = normalizeSourcePath(options.sourceFile, repoRoot);

  // Create context
  const context: TimelineReadContext = {
    sourceFile: normalizedSource,
    repoRoot,
  };

  // Handle --record flag: explicit run recording
  let recordedRunId: string | undefined;
  if (options.record) {
    if (!isTimelineEnabled()) {
      // Feature flag is off - warn and skip recording
      if (!options.json) {
        console.warn('⚠️  Recording disabled: RECONCILIATION_TIMELINE_ON is not set to "true"');
        console.warn('');
      }
    } else {
      // Create and append a new run entry
      const recordContext: TimelineRecordContext = {
        sourceFile: normalizedSource,
        repoRoot,
        command: 'figma:timeline --record',
        cwd: cwd(),
      };

      const entry = await createRunEntry(recordContext);
      const updatedLedger = await appendRunEntry(context, entry);
      await writeRunLedger(updatedLedger, repoRoot);
      recordedRunId = entry.runId;

      if (!options.json) {
        console.log(`✓ Run recorded (runId: ${entry.runId})`);
        console.log('');
      }
    }
  }

  // Load ledger and get runs (after potential recording)
  const ledger = await loadRunLedger(context);
  const runs = await getRecentRuns(context, options.limit);
  const ledgerPath = ledger ? join(repoRoot, getRunLedgerPath(normalizedSource)) : undefined;

  // Write artifact if requested (separate from --record)
  if (options.write) {
    const ledgerToWrite = ledger ?? {
      version: 1 as const,
      sourceFile: normalizedSource,
      runs: [],
    };
    const result = await writeRunLedger(ledgerToWrite, repoRoot);
    if (!options.json) {
      console.log(`Ledger artifact written: ${result.path}`);
      console.log('');
    }
  }

  // Output
  if (options.json) {
    const output = {
      sourceFile: normalizedSource,
      repoRoot,
      totalRuns: ledger?.runs.length ?? 0,
      displayedRuns: runs.length,
      limit: options.limit,
      recordedRunId,
      runs,
    };
    console.log(JSON.stringify(output, null, 2));
  } else if (options.verbose) {
    console.log(formatTimelineVerbose(runs, normalizedSource, repoRoot, ledgerPath, options.limit, !options.record));
  } else {
    console.log(formatTimeline(runs, normalizedSource, repoRoot, options.limit, !options.record));
  }

  // Success
  return 0;
}

// Run CLI only when invoked directly (not when imported for testing)
// In ESM, we check if this file is the entry point
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliTimeline')) {
  main().then(code => exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    exit(2);
  });
}
