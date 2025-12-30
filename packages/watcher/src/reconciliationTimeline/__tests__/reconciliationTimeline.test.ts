/**
 * @aesthetic-function/watcher - reconciliationTimeline/__tests__/reconciliationTimeline.test.ts
 *
 * Phase 13B: Design Drift Timeline Tests.
 *
 * Tests fixture-based, no demo-app dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  generateRunId,
  getRunLedgerPath,
  loadRunLedger,
  getRuns,
  getRecentRuns,
  createRunEntry,
  appendRunEntry,
  recordRun,
  isTimelineEnabled,
} from '../compute.js';
import { writeRunLedger, formatTimeline } from '../artifact.js';
import type { RunEntry, RunLedgerArtifact, TimelineRecordContext, TimelineReadContext } from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a temporary test directory with optional artifacts.
 */
function createTestDir(): string {
  const testDir = join(tmpdir(), `figma-timeline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
 * Write a fixture artifact to the test directory.
 */
function writeArtifact(
  testDir: string,
  sourceFile: string,
  artifactType: string,
  content: Record<string, unknown>
): void {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  const fileName = `${normalized}.${artifactType}.json`;
  const filePath = join(testDir, 'design-materializations', fileName);
  writeFileSync(filePath, JSON.stringify(content, null, 2));
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

// =============================================================================
// RUN ID GENERATION TESTS
// =============================================================================

describe('generateRunId', () => {
  it('should generate deterministic run ID for same inputs', () => {
    const id1 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', []);
    const id2 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', []);
    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different timestamps', () => {
    const id1 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', []);
    const id2 = generateRunId('demo-app/src/App.tsx', '2025-12-30T11:00:00.000Z', 'figma:status', []);
    expect(id1).not.toBe(id2);
  });

  it('should generate different IDs for different commands', () => {
    const id1 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', []);
    const id2 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:apply', []);
    expect(id1).not.toBe(id2);
  });

  it('should generate different IDs for different artifact paths', () => {
    const id1 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', ['a.json']);
    const id2 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', ['b.json']);
    expect(id1).not.toBe(id2);
  });

  it('should be stable regardless of artifact path order', () => {
    const id1 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', ['a.json', 'b.json']);
    const id2 = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', ['b.json', 'a.json']);
    expect(id1).toBe(id2);
  });

  it('should return 8-character hex string', () => {
    const id = generateRunId('demo-app/src/App.tsx', '2025-12-30T10:00:00.000Z', 'figma:status', []);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});

// =============================================================================
// LEDGER PATH TESTS
// =============================================================================

describe('getRunLedgerPath', () => {
  it('should generate correct ledger path for simple source file', () => {
    const path = getRunLedgerPath('demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.figma-run-ledger.json');
  });

  it('should handle nested paths', () => {
    const path = getRunLedgerPath('packages/watcher/src/index.ts');
    expect(path).toBe('design-materializations/packages__watcher__src__index.figma-run-ledger.json');
  });
});

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

  it('should return undefined when no ledger exists', async () => {
    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const ledger = await loadRunLedger(context);
    expect(ledger).toBeUndefined();
  });

  it('should load existing ledger', async () => {
    const ledgerContent: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [createMockRunEntry()],
    };

    const ledgerPath = join(testDir, 'design-materializations', 'demo-app__src__App.figma-run-ledger.json');
    writeFileSync(ledgerPath, JSON.stringify(ledgerContent, null, 2));

    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const ledger = await loadRunLedger(context);
    expect(ledger).toBeDefined();
    expect(ledger?.version).toBe(1);
    expect(ledger?.runs.length).toBe(1);
  });
});

// =============================================================================
// GET RUNS TESTS
// =============================================================================

describe('getRuns', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return empty array when no ledger exists', async () => {
    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const runs = await getRuns(context);
    expect(runs).toEqual([]);
  });

  it('should return runs from ledger', async () => {
    const entry1 = createMockRunEntry({ runId: 'run1', timestamp: '2025-12-30T10:00:00.000Z' });
    const entry2 = createMockRunEntry({ runId: 'run2', timestamp: '2025-12-30T11:00:00.000Z' });

    const ledgerContent: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [entry1, entry2],
    };

    const ledgerPath = join(testDir, 'design-materializations', 'demo-app__src__App.figma-run-ledger.json');
    writeFileSync(ledgerPath, JSON.stringify(ledgerContent, null, 2));

    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const runs = await getRuns(context);
    expect(runs.length).toBe(2);
    expect(runs[0].runId).toBe('run1');
    expect(runs[1].runId).toBe('run2');
  });
});

// =============================================================================
// GET RECENT RUNS TESTS
// =============================================================================

describe('getRecentRuns', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return runs in newest-first order', async () => {
    const entry1 = createMockRunEntry({ runId: 'run1', timestamp: '2025-12-30T10:00:00.000Z' });
    const entry2 = createMockRunEntry({ runId: 'run2', timestamp: '2025-12-30T11:00:00.000Z' });
    const entry3 = createMockRunEntry({ runId: 'run3', timestamp: '2025-12-30T12:00:00.000Z' });

    const ledgerContent: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [entry1, entry2, entry3], // Oldest first
    };

    const ledgerPath = join(testDir, 'design-materializations', 'demo-app__src__App.figma-run-ledger.json');
    writeFileSync(ledgerPath, JSON.stringify(ledgerContent, null, 2));

    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const runs = await getRecentRuns(context, 10);
    expect(runs[0].runId).toBe('run3'); // Newest first
    expect(runs[1].runId).toBe('run2');
    expect(runs[2].runId).toBe('run1');
  });

  it('should respect limit parameter', async () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      createMockRunEntry({ runId: `run${i}`, timestamp: `2025-12-30T${String(i).padStart(2, '0')}:00:00.000Z` })
    );

    const ledgerContent: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: entries,
    };

    const ledgerPath = join(testDir, 'design-materializations', 'demo-app__src__App.figma-run-ledger.json');
    writeFileSync(ledgerPath, JSON.stringify(ledgerContent, null, 2));

    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const runs = await getRecentRuns(context, 5);
    expect(runs.length).toBe(5);
    expect(runs[0].runId).toBe('run19'); // Newest
  });
});

// =============================================================================
// APPEND RUN ENTRY TESTS
// =============================================================================

describe('appendRunEntry', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should create new ledger when none exists', async () => {
    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const entry = createMockRunEntry({ runId: 'newrun' });
    const ledger = await appendRunEntry(context, entry);

    expect(ledger.version).toBe(1);
    expect(ledger.sourceFile).toBe('demo-app/src/App.tsx');
    expect(ledger.runs.length).toBe(1);
    expect(ledger.runs[0].runId).toBe('newrun');
  });

  it('should append to existing ledger without modifying previous entries', async () => {
    const existingEntry = createMockRunEntry({ runId: 'existing', timestamp: '2025-12-30T10:00:00.000Z' });
    const ledgerContent: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [existingEntry],
    };

    const ledgerPath = join(testDir, 'design-materializations', 'demo-app__src__App.figma-run-ledger.json');
    writeFileSync(ledgerPath, JSON.stringify(ledgerContent, null, 2));

    const context: TimelineReadContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const newEntry = createMockRunEntry({ runId: 'newentry', timestamp: '2025-12-30T11:00:00.000Z' });
    const ledger = await appendRunEntry(context, newEntry);

    expect(ledger.runs.length).toBe(2);
    expect(ledger.runs[0].runId).toBe('existing'); // Unchanged
    expect(ledger.runs[1].runId).toBe('newentry'); // Appended
  });
});

// =============================================================================
// FEATURE FLAG TESTS
// =============================================================================

describe('isTimelineEnabled', () => {
  const originalEnv = process.env.RECONCILIATION_TIMELINE_ON;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RECONCILIATION_TIMELINE_ON;
    } else {
      process.env.RECONCILIATION_TIMELINE_ON = originalEnv;
    }
  });

  it('should return false when env var is not set', () => {
    delete process.env.RECONCILIATION_TIMELINE_ON;
    expect(isTimelineEnabled()).toBe(false);
  });

  it('should return false when env var is "false"', () => {
    process.env.RECONCILIATION_TIMELINE_ON = 'false';
    expect(isTimelineEnabled()).toBe(false);
  });

  it('should return true when env var is "true"', () => {
    process.env.RECONCILIATION_TIMELINE_ON = 'true';
    expect(isTimelineEnabled()).toBe(true);
  });

  it('should return true when env var is "1"', () => {
    process.env.RECONCILIATION_TIMELINE_ON = '1';
    expect(isTimelineEnabled()).toBe(true);
  });
});

// =============================================================================
// RECORD RUN TESTS
// =============================================================================

describe('recordRun', () => {
  let testDir: string;
  const originalEnv = process.env.RECONCILIATION_TIMELINE_ON;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    if (originalEnv === undefined) {
      delete process.env.RECONCILIATION_TIMELINE_ON;
    } else {
      process.env.RECONCILIATION_TIMELINE_ON = originalEnv;
    }
  });

  it('should return written=false when feature flag is off', async () => {
    delete process.env.RECONCILIATION_TIMELINE_ON;

    const context: TimelineRecordContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
      command: 'figma:status',
    };

    const result = await recordRun(context);
    expect(result.written).toBe(false);
    expect(result.entry.command).toBe('figma:status');
  });

  it('should return written=true when feature flag is on', async () => {
    process.env.RECONCILIATION_TIMELINE_ON = 'true';

    const context: TimelineRecordContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
      command: 'figma:status',
    };

    const result = await recordRun(context);
    expect(result.written).toBe(true);
    expect(result.ledger.runs.length).toBe(1);
  });
});

// =============================================================================
// WRITE LEDGER TESTS
// =============================================================================

describe('writeRunLedger', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should write ledger to correct path', async () => {
    const ledger: RunLedgerArtifact = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [createMockRunEntry()],
    };

    const result = await writeRunLedger(ledger, testDir);

    expect(result.written).toBe(true);
    expect(result.path).toBe('design-materializations/demo-app__src__App.figma-run-ledger.json');

    const fullPath = join(testDir, result.path);
    expect(existsSync(fullPath)).toBe(true);

    const content = await readFile(fullPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.runs.length).toBe(1);
  });
});

// =============================================================================
// FORMATTING TESTS
// =============================================================================

describe('formatTimeline', () => {
  it('should format empty timeline correctly', () => {
    const output = formatTimeline([], 'demo-app/src/App.tsx', '/repo', 10);

    expect(output).toContain('=== FIGMA RUN TIMELINE (Phase 13B) ===');
    expect(output).toContain('Source: demo-app/src/App.tsx (canonical)');
    expect(output).toContain('No runs recorded yet');
    expect(output).toContain('RECONCILIATION_TIMELINE_ON=true');
  });

  it('should format runs with summary', () => {
    const entry = createMockRunEntry({
      summary: {
        conflicts: 3,
        decisions: 2,
        appliedOps: 1,
      },
    });

    const output = formatTimeline([entry], 'demo-app/src/App.tsx', '/repo', 10);

    expect(output).toContain('Runs (newest first, showing 1 of 1)');
    expect(output).toContain('[abc12345]');
    expect(output).toContain('Command: figma:status');
    expect(output).toContain('3 conflicts');
    expect(output).toContain('2 decisions');
    expect(output).toContain('1 applied');
  });

  it('should show "more runs" message when limit exceeded', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      createMockRunEntry({ runId: `run${i}` })
    );

    const output = formatTimeline(entries, 'demo-app/src/App.tsx', '/repo', 10);

    expect(output).toContain('showing 10 of 15');
    expect(output).toContain('5 more run(s) not shown');
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

  it('should normalize different source path formats to same ledger path', () => {
    const paths = [
      'demo-app/src/App.tsx',
      './demo-app/src/App.tsx',
    ];

    const ledgerPaths = paths.map(getRunLedgerPath);
    expect(new Set(ledgerPaths).size).toBe(1);
  });
});

// =============================================================================
// CREATE RUN ENTRY TESTS
// =============================================================================

describe('createRunEntry', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should create entry with correct structure', async () => {
    const context: TimelineRecordContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
      command: 'figma:index',
      mode: 'artifact',
      cwd: testDir,
    };

    const entry = await createRunEntry(context);

    expect(entry.runId).toMatch(/^[0-9a-f]{8}$/);
    expect(entry.sourceFile).toBe('demo-app/src/App.tsx');
    expect(entry.command).toBe('figma:index');
    expect(entry.mode).toBe('artifact');
    expect(entry.repoRoot).toBe(testDir);
    expect(entry.cwd).toBe(testDir);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(entry.artifacts).toBeDefined();
    expect(entry.summary).toBeDefined();
  });

  it('should extract artifacts when they exist', async () => {
    // Write a conflicts artifact
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-conflicts', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: { total: 3, blocked: 1 },
      conflicts: [{}, {}, {}],
    });

    const context: TimelineRecordContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
      command: 'figma:status',
    };

    const entry = await createRunEntry(context);

    expect(entry.artifacts.conflicts).toBeDefined();
    expect(entry.summary.conflicts).toBe(3);
  });
});
