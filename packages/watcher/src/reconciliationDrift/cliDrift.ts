#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - reconciliationDrift/cliDrift.ts
 *
 * Phase 13C: CLI for Drift Diffs (Run-to-Run).
 * Phase 13C.1: UX Hardening + Guardrails.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher figma:drift <file> [options]
 *
 * Options:
 *   --from <runId>   Compare from this run ID (default: previous run)
 *   --to <runId>     Compare to this run ID (default: latest run)
 *   --json           Output JSON instead of formatted text
 *   --write          Write artifact to disk
 *   --verbose        Show detailed output (artifact paths, reasons)
 *   --explain        Explain run selection (why from/to were chosen)
 *   --strict         Exit 1 if any drift item has severity 'fail'
 *   --repo-root <path>  Explicit repository root
 */

import { argv, cwd, exit, stdout } from 'node:process';

import {
  getRepoRoot,
  normalizeSourcePath,
  computeDriftDiffArtifact,
  createInsufficientHistoryArtifact,
  loadRunLedger,
  selectRuns,
  validateRunCandidates,
} from './compute.js';

import {
  formatDriftDiff,
  writeDriftDiffArtifact,
} from './artifact.js';

import type {
  CandidateValidationResult,
  DriftCliOptions,
  DriftDiffArtifact,
  RunSelectionExplanation,
} from './types.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse CLI arguments.
 */
function parseArgs(args: string[]): DriftCliOptions | { error: string } {
  const options: DriftCliOptions = {
    sourceFile: '',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--from') {
      i++;
      if (i >= args.length) {
        return { error: '--from requires a run ID' };
      }
      options.fromRunId = args[i];
    } else if (arg === '--to') {
      i++;
      if (i >= args.length) {
        return { error: '--to requires a run ID' };
      }
      options.toRunId = args[i];
    } else if (arg === '--repo-root') {
      i++;
      if (i >= args.length) {
        return { error: '--repo-root requires a path' };
      }
      options.repoRoot = args[i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--explain') {
      options.explain = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else if (!options.sourceFile) {
      options.sourceFile = arg;
    } else {
      return { error: `Unexpected argument: ${arg}` };
    }

    i++;
  }

  if (!options.sourceFile) {
    return { error: 'Missing required source file argument' };
  }

  return options;
}

/**
 * Print usage information.
 */
function printUsage(): void {
  console.log(`
Usage: figma:drift <file> [options]

Compare two reconciliation runs for a source file.

Arguments:
  <file>              Source file to analyze (e.g., demo-app/src/App.tsx)

Options:
  --from <runId>      Compare from this run ID (default: previous run)
  --to <runId>        Compare to this run ID (default: latest run)
  --json              Output JSON instead of formatted text
  --write             Write artifact to disk
  --verbose           Show detailed output (artifact paths, reasons)
  --explain           Explain run selection (why from/to were chosen)
  --strict            Exit 1 if any drift item has severity 'fail'
  --repo-root <path>  Explicit repository root

Exit Codes:
  0                   Success (default), or no 'fail' severity changes
  1                   Error, or (with --strict) any 'fail' severity change
  2                   Usage error

Examples:
  figma:drift demo-app/src/App.tsx
  figma:drift demo-app/src/App.tsx --json
  figma:drift demo-app/src/App.tsx --from abc12345 --to def67890
  figma:drift demo-app/src/App.tsx --write --verbose
  figma:drift demo-app/src/App.tsx --explain
  figma:drift demo-app/src/App.tsx --strict
`.trim());
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Check if drift artifact represents "no material drift".
 *
 * Definition: No drift items exist OR all drift changes are 'info' severity
 * AND all numeric deltas are zero.
 */
function isNoMaterialDrift(artifact: DriftDiffArtifact): boolean {
  if (artifact.summary.insufficientHistory) {
    return false;
  }

  if (artifact.changes.length === 0) {
    return true;
  }

  // All changes must be info severity
  const allInfo = artifact.changes.every((c) => c.severity === 'info');
  if (!allInfo) {
    return false;
  }

  // All numeric deltas must be zero
  const allZeroDelta = artifact.changes.every((c) => c.delta === undefined || c.delta === 0);
  return allZeroDelta;
}

/**
 * Check if artifact has any 'fail' severity changes.
 */
function hasFailSeverity(artifact: DriftDiffArtifact): boolean {
  return artifact.changes.some((c) => c.severity === 'fail');
}

/**
 * Main CLI entry point.
 */
export async function main(args: string[] = argv.slice(2)): Promise<number> {
  // Parse arguments
  const parsed = parseArgs(args);

  if ('error' in parsed) {
    console.error(`Error: ${parsed.error}`);
    printUsage();
    return 2;
  }

  const options = parsed;

  // Resolve repo root
  const startCwd = cwd();
  const repoRoot = options.repoRoot ?? getRepoRoot(startCwd);

  // Normalize source path
  const sourceCanonical = normalizeSourcePath(options.sourceFile, repoRoot);

  // Load ledger to get run selection info
  const ledgerResult = await loadRunLedger(repoRoot, sourceCanonical);
  const ledgerExists = ledgerResult.ok;

  // Get run selection explanation if ledger exists and has enough runs
  let explanation: RunSelectionExplanation | undefined;
  let fromRunId: string | undefined;
  let fromTimestamp: string | undefined;
  let toRunId: string | undefined;
  let toTimestamp: string | undefined;
  let candidateValidation: CandidateValidationResult | undefined;

  if (ledgerResult.ok) {
    const selectResult = selectRuns(ledgerResult.ledger, options.fromRunId, options.toRunId);
    if (selectResult.ok) {
      explanation = selectResult.explanation;
      fromRunId = selectResult.fromEntry.runId;
      fromTimestamp = selectResult.fromEntry.timestamp;
      toRunId = selectResult.toEntry.runId;
      toTimestamp = selectResult.toEntry.timestamp;

      // Phase 13C.2: Validate run candidates
      candidateValidation = validateRunCandidates(selectResult.fromEntry, selectResult.toEntry);
    }
  }

  // Print preconditions banner (Phase 13C.1) - always in non-JSON mode
  if (!options.json) {
    console.log('=== DRIFT DIFF PRECONDITIONS ===');
    console.log(`Repo Root: ${repoRoot}`);
    console.log(`Source (input): ${options.sourceFile}`);
    console.log(`Source (canonical): ${sourceCanonical}`);
    console.log(`Ledger: ${ledgerExists ? '✓ found' : '✗ missing'}`);

    if (fromRunId && toRunId) {
      console.log('Run selection:');
      console.log(`  from: ${fromRunId} (${fromTimestamp})`);
      console.log(`  to:   ${toRunId} (${toTimestamp})`);
    }

    // Phase 13C.2: Print candidate classification
    if (candidateValidation) {
      console.log('');
      console.log('=== CANDIDATE CLASSIFICATION (Phase 13C.2) ===');
      console.log(`From Run: ${candidateValidation.fromCandidate.runId}`);
      console.log(`  State: ${candidateValidation.fromCandidate.state}`);
      console.log(`  Artifacts: ${candidateValidation.fromCandidate.availableArtifacts.join(', ') || 'none'}`);
      console.log(`To Run: ${candidateValidation.toCandidate.runId}`);
      console.log(`  State: ${candidateValidation.toCandidate.state}`);
      console.log(`  Artifacts: ${candidateValidation.toCandidate.availableArtifacts.join(', ') || 'none'}`);
      console.log(`Comparison Class: ${candidateValidation.comparisonClass}`);

      // Print warning banner if comparison is not FULL
      if (candidateValidation.warningMessage) {
        console.log('');
        console.log(candidateValidation.warningMessage);
      }

      // Print validation issues if any
      if (candidateValidation.issues.length > 0) {
        console.log('');
        console.log('Issues:');
        for (const issue of candidateValidation.issues) {
          console.log(`  - ${issue}`);
        }
      }
    }

    console.log('');
  }

  // Print --explain output if requested (Phase 13C.1)
  if (options.explain && !options.json) {
    console.log('=== RUN SELECTION EXPLANATION ===');

    if (!ledgerExists) {
      console.log('Cannot explain: ledger not found');
    } else if (!explanation) {
      console.log('Cannot explain: insufficient history for comparison');
    } else {
      console.log('From Run:');
      console.log(`  Method: ${explanation.fromMethod}`);
      console.log(`  Reason: ${explanation.fromReason}`);
      console.log(`  Explicit: ${explanation.explicitFrom ? 'yes (--from provided)' : 'no (auto-selected)'}`);
      console.log('');
      console.log('To Run:');
      console.log(`  Method: ${explanation.toMethod}`);
      console.log(`  Reason: ${explanation.toReason}`);
      console.log(`  Explicit: ${explanation.explicitTo ? 'yes (--to provided)' : 'no (auto-selected)'}`);
    }

    console.log('');
  }

  // Compute drift diff
  const result = await computeDriftDiffArtifact({
    sourceFile: sourceCanonical,
    repoRoot,
    fromRunId: options.fromRunId,
    toRunId: options.toRunId,
  });

  // Handle errors
  if ('error' in result) {
    if (options.json) {
      stdout.write(JSON.stringify({ error: result.error }, null, 2) + '\n');
    } else {
      console.error(`Error: ${result.error}`);
    }
    return 1;
  }

  // Handle insufficient history
  let artifact: DriftDiffArtifact;
  if ('insufficientHistory' in result) {
    artifact = createInsufficientHistoryArtifact(sourceCanonical, result.availableRuns);
  } else {
    artifact = result;
  }

  // Write artifact if requested
  if (options.write) {
    const writeResult = writeDriftDiffArtifact(artifact, repoRoot);

    if (!writeResult.written) {
      if (options.json) {
        stdout.write(JSON.stringify({ error: writeResult.error }, null, 2) + '\n');
      } else {
        console.error(`Error writing artifact: ${writeResult.error}`);
      }
      return 1;
    }

    if (!options.json) {
      console.log(`Wrote: ${writeResult.path}`);
      console.log('');
    }
  }

  // Output
  if (options.json) {
    stdout.write(JSON.stringify(artifact, null, 2) + '\n');
  } else {
    // Check for no material drift (Phase 13C.1)
    if (isNoMaterialDrift(artifact)) {
      console.log('✓ No material drift detected between runs.');
    } else {
      const formatted = formatDriftDiff(artifact, repoRoot, options.verbose);
      console.log(formatted);
    }
  }

  // Determine exit code (Phase 13C.1 + 13C.2)
  // Default: 0
  // With --strict:
  //   - exit 1 if any drift item has severity 'fail'
  //   - exit 1 if comparison class is INVALID or WEAK (Phase 13C.2)
  if (options.strict) {
    // Phase 13C.2: Check comparison class
    if (candidateValidation) {
      const { comparisonClass } = candidateValidation;
      if (comparisonClass === 'INVALID' || comparisonClass === 'WEAK') {
        if (!options.json) {
          console.log('');
          console.log(`✗ Strict mode failed: comparison class is ${comparisonClass}`);
        }
        return 1;
      }
    }

    // Phase 13C.1: Check for fail severity
    if (hasFailSeverity(artifact)) {
      return 1;
    }
  }

  return 0;
}

// Run when invoked directly
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '');
if (isMain || process.argv[1]?.includes('cliDrift')) {
  main().then(code => exit(code)).catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    exit(2);
  });
}
