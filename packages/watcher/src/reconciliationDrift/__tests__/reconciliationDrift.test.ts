/**
 * @aesthetic-function/watcher - reconciliationDrift/__tests__/reconciliationDrift.test.ts
 *
 * Phase 13C: Drift Diffs (Run-to-Run) Tests.
 *
 * Tests fixture-based, no demo-app dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadRunLedger,
  selectRuns,
  computeDriftDiff,
  computeDriftDiffArtifact,
  createInsufficientHistoryArtifact,
} from '../compute.js';
import {
  writeDriftDiffArtifact,
  formatDriftDiff,
  getDriftDiffArtifactPath,
} from '../artifact.js';
import type { DriftDiffArtifact, RunSnapshot } from '../types.js';
import type { RunLedgerArtifact, RunEntry } from '../../reconciliationTimeline/types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a temporary test directory with optional artifacts.
 */
function createTestDir(): string {
  const testDir = join(tmpdir(), `figma-drift-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  // Create marker for repo root detection
  writeFileSync(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  mkdirSync(join(testDir, 'design-materializations'), { recursive: true });
  return testDir;
}

/**
 * Clean up test directory.
 */
function cleanupTestDir(testDir: string): void {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a mock run entry for testing.
 */
function createMockRunEntry(overrides: Partial<RunEntry> = {}): RunEntry {
  return {
    runId: 'abc12345',
    sourceFile: 'demo-app/src/App.tsx',
    timestamp: '2025-12-30T10:00:00.000Z',
    cwd: '/repo',
    repoRoot: '/repo',
    command: 'figma:status',
    artifacts: {},
    summary: {},
    ...overrides,
  };
}

/**
 * Create a mock run snapshot for testing.
 */
function createMockSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: 'abc12345',
    timestamp: '2025-12-30T10:00:00.000Z',
    command: 'figma:status',
    metrics: {},
    artifactPaths: {},
    ...overrides,
  };
}

/**
 * Write a run ledger with the given entries.
 */
function writeLedger(testDir: string, sourceFile: string, entries: RunEntry[]): void {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  const ledgerPath = join(testDir, 'design-materializations', `${normalized}.figma-run-ledger.json`);
  const ledger: RunLedgerArtifact = {
    version: 1,
    sourceFile,
    runs: entries,
  };
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

// =============================================================================
// LEDGER LOADING TESTS
// =============================================================================

describe('loadRunLedger', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return error when no ledger exists', async () => {
    const result = await loadRunLedger(testDir, 'demo-app/src/App.tsx');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No run ledger found');
    }
  });

  it('should load existing ledger', async () => {
    writeLedger(testDir, 'demo-app/src/App.tsx', [createMockRunEntry()]);

    const result = await loadRunLedger(testDir, 'demo-app/src/App.tsx');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ledger.runs.length).toBe(1);
    }
  });
});

// =============================================================================
// RUN SELECTION TESTS
// =============================================================================

describe('selectRuns', () => {
  it('should return insufficient history with 0 runs', () => {
    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [],
    };

    const result = selectRuns(ledger);
    expect(result.ok).toBe(false);
    if (!result.ok && result.insufficientHistory) {
      expect(result.availableRuns).toBe(0);
    }
  });

  it('should return insufficient history with 1 run', () => {
    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [createMockRunEntry()],
    };

    const result = selectRuns(ledger);
    expect(result.ok).toBe(false);
    if (!result.ok && result.insufficientHistory) {
      expect(result.availableRuns).toBe(1);
    }
  });

  it('should select latest vs previous by default', () => {
    const entry1 = createMockRunEntry({ runId: 'run1', timestamp: '2025-12-30T10:00:00.000Z' });
    const entry2 = createMockRunEntry({ runId: 'run2', timestamp: '2025-12-30T11:00:00.000Z' });
    const entry3 = createMockRunEntry({ runId: 'run3', timestamp: '2025-12-30T12:00:00.000Z' });

    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [entry1, entry2, entry3],
    };

    const result = selectRuns(ledger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fromEntry.runId).toBe('run2'); // Previous
      expect(result.toEntry.runId).toBe('run3'); // Latest
    }
  });

  it('should select explicit from and to run IDs', () => {
    const entry1 = createMockRunEntry({ runId: 'run1' });
    const entry2 = createMockRunEntry({ runId: 'run2' });
    const entry3 = createMockRunEntry({ runId: 'run3' });

    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [entry1, entry2, entry3],
    };

    const result = selectRuns(ledger, 'run1', 'run3');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fromEntry.runId).toBe('run1');
      expect(result.toEntry.runId).toBe('run3');
    }
  });

  it('should return error for unknown from run ID', () => {
    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [createMockRunEntry({ runId: 'run1' }), createMockRunEntry({ runId: 'run2' })],
    };

    const result = selectRuns(ledger, 'unknown');
    expect(result.ok).toBe(false);
    if (!result.ok && !result.insufficientHistory) {
      expect(result.error).toContain('Unknown run ID for --from');
    }
  });

  it('should return error for unknown to run ID', () => {
    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [createMockRunEntry({ runId: 'run1' }), createMockRunEntry({ runId: 'run2' })],
    };

    const result = selectRuns(ledger, undefined, 'unknown');
    expect(result.ok).toBe(false);
    if (!result.ok && !result.insufficientHistory) {
      expect(result.error).toContain('Unknown run ID for --to');
    }
  });
});

// =============================================================================
// DRIFT DIFF COMPUTATION TESTS
// =============================================================================

describe('computeDriftDiff', () => {
  it('should return empty changes when snapshots are identical', () => {
    const from = createMockSnapshot();
    const to = createMockSnapshot();

    const changes = computeDriftDiff(from, to);
    expect(changes).toEqual([]);
  });

  it('should detect status change', () => {
    const from = createMockSnapshot({ overallStatus: 'CLEAN' });
    const to = createMockSnapshot({ overallStatus: 'VERIFIED_OK' });

    const changes = computeDriftDiff(from, to);
    expect(changes.length).toBe(1);
    expect(changes[0].field).toBe('overallStatus');
    expect(changes[0].from).toBe('CLEAN');
    expect(changes[0].to).toBe('VERIFIED_OK');
    expect(changes[0].severity).toBe('info'); // Status improved
  });

  it('should set fail severity for status worsening to VERIFY_FAILED', () => {
    const from = createMockSnapshot({ overallStatus: 'VERIFIED_OK' });
    const to = createMockSnapshot({ overallStatus: 'VERIFY_FAILED' });

    const changes = computeDriftDiff(from, to);
    expect(changes.length).toBe(1);
    expect(changes[0].severity).toBe('fail');
  });

  it('should set warn severity for status worsening to APPLIED_UNVERIFIED', () => {
    const from = createMockSnapshot({ overallStatus: 'CLEAN' });
    const to = createMockSnapshot({ overallStatus: 'APPLIED_UNVERIFIED' });

    const changes = computeDriftDiff(from, to);
    expect(changes.length).toBe(1);
    expect(changes[0].severity).toBe('warn');
  });

  it('should set fail severity for verifyMismatch increase', () => {
    const from = createMockSnapshot({ metrics: { verifyMismatch: 0 } });
    const to = createMockSnapshot({ metrics: { verifyMismatch: 2 } });

    const changes = computeDriftDiff(from, to);
    const mismatchChange = changes.find(c => c.field === 'verifyMismatch');
    expect(mismatchChange).toBeDefined();
    expect(mismatchChange?.severity).toBe('fail');
    expect(mismatchChange?.delta).toBe(2);
  });

  it('should set fail severity for verifyMissing increase', () => {
    const from = createMockSnapshot({ metrics: { verifyMissing: 1 } });
    const to = createMockSnapshot({ metrics: { verifyMissing: 3 } });

    const changes = computeDriftDiff(from, to);
    const missingChange = changes.find(c => c.field === 'verifyMissing');
    expect(missingChange).toBeDefined();
    expect(missingChange?.severity).toBe('fail');
    expect(missingChange?.delta).toBe(2);
  });

  it('should set warn severity for conflictsTotal increase', () => {
    const from = createMockSnapshot({ metrics: { conflictsTotal: 1 } });
    const to = createMockSnapshot({ metrics: { conflictsTotal: 3 } });

    const changes = computeDriftDiff(from, to);
    const conflictChange = changes.find(c => c.field === 'conflictsTotal');
    expect(conflictChange).toBeDefined();
    expect(conflictChange?.severity).toBe('warn');
    expect(conflictChange?.delta).toBe(2);
  });

  it('should set info severity for applyDryRun toggle', () => {
    const from = createMockSnapshot({ metrics: { applyDryRun: true } });
    const to = createMockSnapshot({ metrics: { applyDryRun: false } });

    const changes = computeDriftDiff(from, to);
    const dryRunChange = changes.find(c => c.field === 'applyDryRun');
    expect(dryRunChange).toBeDefined();
    expect(dryRunChange?.severity).toBe('info');
  });
});

// =============================================================================
// DETERMINISTIC ORDERING TESTS
// =============================================================================

describe('deterministic ordering', () => {
  it('should produce changes in fixed field order', () => {
    const from = createMockSnapshot({
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      metrics: {
        verifyMismatch: 0,
        conflictsTotal: 1,
        applyOpsTotal: 5,
      },
    });

    const to = createMockSnapshot({
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'WARN',
      metrics: {
        verifyMismatch: 1,
        conflictsTotal: 2,
        applyOpsTotal: 10,
      },
    });

    const changes = computeDriftDiff(from, to);
    const fields = changes.map(c => c.field);

    // Verify order matches fixed order
    const expectedOrder = ['overallStatus', 'ciVerdict', 'applyOpsTotal', 'verifyMismatch', 'conflictsTotal'];
    expect(fields).toEqual(expectedOrder);
  });

  it('should produce same output for same input', () => {
    const from = createMockSnapshot({
      overallStatus: 'CLEAN',
      metrics: { verifyMismatch: 0, conflictsTotal: 1 },
    });

    const to = createMockSnapshot({
      overallStatus: 'VERIFIED_OK',
      metrics: { verifyMismatch: 2, conflictsTotal: 3 },
    });

    const changes1 = computeDriftDiff(from, to);
    const changes2 = computeDriftDiff(from, to);

    expect(JSON.stringify(changes1)).toBe(JSON.stringify(changes2));
  });
});

// =============================================================================
// ARTIFACT PATH TESTS
// =============================================================================

describe('getDriftDiffArtifactPath', () => {
  it('should generate correct artifact path', () => {
    const path = getDriftDiffArtifactPath('demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.figma-drift-diff.json');
  });

  it('should strip leading ./ from path', () => {
    const path = getDriftDiffArtifactPath('./demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.figma-drift-diff.json');
  });
});

// =============================================================================
// REPO-ROOT INVARIANCE TESTS
// =============================================================================

describe('repo-root invariance', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should normalize different source path formats to same ledger', async () => {
    // Write ledger
    const entry1 = createMockRunEntry({ runId: 'run1', timestamp: '2025-12-30T10:00:00.000Z' });
    const entry2 = createMockRunEntry({ runId: 'run2', timestamp: '2025-12-30T11:00:00.000Z' });
    writeLedger(testDir, 'demo-app/src/App.tsx', [entry1, entry2]);

    // Load with different path formats
    const result1 = await loadRunLedger(testDir, 'demo-app/src/App.tsx');
    const result2 = await loadRunLedger(testDir, './demo-app/src/App.tsx');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.ledger.runs.length).toBe(result2.ledger.runs.length);
    }
  });
});

// =============================================================================
// FULL ARTIFACT TESTS
// =============================================================================

describe('computeDriftDiffArtifact', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return insufficient history error for missing ledger', async () => {
    const result = await computeDriftDiffArtifact({
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    });

    expect('error' in result).toBe(true);
  });

  it('should return insufficient history for single run', async () => {
    writeLedger(testDir, 'demo-app/src/App.tsx', [createMockRunEntry()]);

    const result = await computeDriftDiffArtifact({
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    });

    expect('insufficientHistory' in result).toBe(true);
    if ('insufficientHistory' in result) {
      expect(result.availableRuns).toBe(1);
    }
  });

  it('should compute diff for two runs', async () => {
    const entry1 = createMockRunEntry({
      runId: 'run1',
      timestamp: '2025-12-30T10:00:00.000Z',
    });
    const entry2 = createMockRunEntry({
      runId: 'run2',
      timestamp: '2025-12-30T11:00:00.000Z',
    });
    writeLedger(testDir, 'demo-app/src/App.tsx', [entry1, entry2]);

    const result = await computeDriftDiffArtifact({
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    });

    expect('error' in result).toBe(false);
    expect('insufficientHistory' in result).toBe(false);

    if (!('error' in result) && !('insufficientHistory' in result)) {
      expect(result.version).toBe('1.0');
      expect(result.sourceFile).toBe('demo-app/src/App.tsx');
      expect(result.fromRunId).toBe('run1');
      expect(result.toRunId).toBe('run2');
    }
  });
});

// =============================================================================
// INSUFFICIENT HISTORY ARTIFACT TESTS
// =============================================================================

describe('createInsufficientHistoryArtifact', () => {
  it('should create artifact with correct message for 0 runs', () => {
    const artifact = createInsufficientHistoryArtifact('demo-app/src/App.tsx', 0);

    expect(artifact.summary.insufficientHistory).toBe(true);
    expect(artifact.summary.message).toContain('No runs recorded');
    expect(artifact.changes).toEqual([]);
  });

  it('should create artifact with correct message for 1 run', () => {
    const artifact = createInsufficientHistoryArtifact('demo-app/src/App.tsx', 1);

    expect(artifact.summary.insufficientHistory).toBe(true);
    expect(artifact.summary.message).toContain('Only 1 run');
    expect(artifact.summary.message).toContain('need at least 2');
  });
});

// =============================================================================
// WRITE ARTIFACT TESTS
// =============================================================================

describe('writeDriftDiffArtifact', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should write artifact to correct path', async () => {
    const artifact = createInsufficientHistoryArtifact('demo-app/src/App.tsx', 0);
    const result = writeDriftDiffArtifact(artifact, testDir);

    expect(result.written).toBe(true);
    expect(result.path).toBe('design-materializations/demo-app__src__App.figma-drift-diff.json');

    const fullPath = join(testDir, result.path);
    expect(existsSync(fullPath)).toBe(true);

    const content = await readFile(fullPath, 'utf-8');
    const parsed = JSON.parse(content) as DriftDiffArtifact;
    expect(parsed.version).toBe('1.0');
  });
});

// =============================================================================
// FORMATTING TESTS
// =============================================================================

describe('formatDriftDiff', () => {
  it('should format insufficient history correctly', () => {
    const artifact = createInsufficientHistoryArtifact('demo-app/src/App.tsx', 0);
    const output = formatDriftDiff(artifact, '/repo');

    expect(output).toContain('FIGMA DRIFT DIFF (Phase 13C)');
    expect(output).toContain('demo-app/src/App.tsx (canonical)');
    expect(output).toContain('No runs recorded');
    expect(output).toContain('RECONCILIATION_TIMELINE_ON=true');
  });

  it('should format diff with changes correctly', () => {
    const artifact: DriftDiffArtifact = {
      version: '1.0',
      sourceFile: 'demo-app/src/App.tsx',
      fromRunId: 'run1',
      toRunId: 'run2',
      generatedAt: '2025-12-30T12:00:00.000Z',
      summary: {
        totalChanges: 2,
        infoCount: 1,
        warnCount: 0,
        failCount: 1,
        insufficientHistory: false,
        message: '1 regression(s), 0 warning(s), 1 info change(s)',
      },
      changes: [
        {
          field: 'overallStatus',
          from: 'VERIFIED_OK',
          to: 'VERIFY_FAILED',
          severity: 'fail',
          reason: 'Status worsened from VERIFIED_OK to VERIFY_FAILED',
        },
        {
          field: 'verifyMismatch',
          from: 0,
          to: 2,
          delta: 2,
          severity: 'fail',
          reason: 'Verification mismatches increased by 2',
        },
      ],
      from: createMockSnapshot({ runId: 'run1', overallStatus: 'VERIFIED_OK' }),
      to: createMockSnapshot({ runId: 'run2', overallStatus: 'VERIFY_FAILED' }),
    };

    const output = formatDriftDiff(artifact, '/repo');

    expect(output).toContain('Comparing: [run1] → [run2]');
    expect(output).toContain('Changes (2)');
    expect(output).toContain('[FAIL]');
    expect(output).toContain('overallStatus');
    expect(output).toContain('VERIFIED_OK → VERIFY_FAILED');
    expect(output).toContain('(+2)');
  });
});
