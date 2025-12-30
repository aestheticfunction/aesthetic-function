#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationTimeline/cliTimeline.ts
 *
 * Phase 13B: CLI for Design Drift Timeline.
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
 *
 * RECORDING:
 *   Runs are recorded ONLY when both:
 *   - --record flag is present
 *   - RECONCILIATION_TIMELINE_ON=true
 *
 * EXIT CODES:
 *   0 - Always (diagnostic only)
 *   2 - Usage error
 */

import { resolve } from 'node:path';
import { join } from 'node:path';

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
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): CliOptions {
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

  return options;
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate source file
  if (!options.sourceFile) {
    console.error('Error: Source file is required');
    console.error('');
    console.error('Usage: pnpm figma:timeline <source-file> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --repo-root <path>  Repository root (default: auto-detect)');
    console.error('  --json              Output JSON format');
    console.error('  --limit <n>         Maximum runs to show (default: 10)');
    console.error('  --write             Force write ledger artifact');
    console.error('  --record            Explicitly append a new run to the ledger');
    console.error('  --verbose, -v       Show discovery paths');
    console.error('');
    console.error('Recording:');
    console.error('  Runs are recorded ONLY when both:');
    console.error('  - --record flag is present');
    console.error('  - RECONCILIATION_TIMELINE_ON=true');
    process.exit(2);
  }

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
        cwd: process.cwd(),
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

  // Always exit 0 (diagnostic only)
  process.exit(0);
}

// Run
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
