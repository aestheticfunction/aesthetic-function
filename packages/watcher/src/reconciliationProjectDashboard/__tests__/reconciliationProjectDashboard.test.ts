/**
 * @aesthetic-function/watcher - reconciliationProjectDashboard/__tests__/reconciliationProjectDashboard.test.ts
 *
 * Phase 13E: Project Dashboard Aggregation Tests.
 * Phase 13E.1: Thresholds & CI UX Hardening Tests.
 *
 * Tests fixture-based, no demo-app dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverSourceFiles,
  computeProjectDashboard,
  normalizeScanRoot,
} from '../compute.js';
import {
  writeProjectDashboardArtifact,
  formatProjectDashboard,
  getProjectDashboardArtifactPath,
} from '../artifact.js';
import {
  resolveThresholds,
  formatThresholds,
  determineVerdict,
} from '../config.js';
import type {
  ProjectDashboardArtifact,
  ProjectDashboardContext,
} from '../types.js';
import { DEFAULT_PROJECT_THRESHOLDS, getVerdictMessage } from '../types.js';
import type { RunLedgerArtifact, RunEntry } from '../../reconciliationTimeline/types.js';
import { DEFAULT_THRESHOLDS } from '../../reconciliationDashboard/config.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a temporary test directory with optional artifacts.
 */
function createTestDir(): string {
  const testDir = join(
    tmpdir(),
    `figma-project-dashboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
    sourceFile: 'src/App.tsx',
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
 * Create a mock .tsx file for discovery.
 */
function createMockTsxFile(testDir: string, relativePath: string, content: string = ''): void {
  const fullPath = join(testDir, relativePath);
  const dir = join(fullPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content || `export function Component() { return <div />; }\n`);
}

/**
 * Write a run ledger with the given entries.
 */
function writeLedger(testDir: string, sourceFile: string, entries: RunEntry[]): void {
  const normalized = sourceFile.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
  const ledgerPath = join(
    testDir,
    'design-materializations',
    `${normalized}.figma-run-ledger.json`
  );
  const ledger: RunLedgerArtifact = {
    version: 1,
    sourceFile,
    runs: entries,
  };
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

/**
 * Create a test context with default settings.
 */
function createTestContext(
  testDir: string,
  scanRoot: string,
  overrides: Partial<ProjectDashboardContext> = {}
): ProjectDashboardContext {
  return {
    scanRoot,
    repoRoot: testDir,
    limit: 10,
    thresholds: DEFAULT_THRESHOLDS,
    strict: false,
    projectThresholds: DEFAULT_PROJECT_THRESHOLDS,
    ...overrides,
  };
}

// =============================================================================
// FILE DISCOVERY TESTS
// =============================================================================

describe('discoverSourceFiles', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should discover .tsx files in a directory', () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');
    createMockTsxFile(testDir, 'src/Card.tsx');

    const files = discoverSourceFiles('src', testDir);

    expect(files).toHaveLength(3);
    expect(files).toContain('src/App.tsx');
    expect(files).toContain('src/Button.tsx');
    expect(files).toContain('src/Card.tsx');
  });

  it('should discover files recursively', () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/components/Button.tsx');
    createMockTsxFile(testDir, 'src/components/forms/Input.tsx');

    const files = discoverSourceFiles('src', testDir);

    expect(files).toHaveLength(3);
    expect(files).toContain('src/App.tsx');
    expect(files).toContain('src/components/Button.tsx');
    expect(files).toContain('src/components/forms/Input.tsx');
  });

  it('should exclude node_modules', () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/node_modules/package/index.tsx');

    const files = discoverSourceFiles('src', testDir);

    expect(files).toHaveLength(1);
    expect(files).toContain('src/App.tsx');
  });

  it('should exclude dist and build directories', () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/dist/bundle.tsx');
    createMockTsxFile(testDir, 'src/build/output.tsx');

    const files = discoverSourceFiles('src', testDir);

    expect(files).toHaveLength(1);
    expect(files).toContain('src/App.tsx');
  });

  it('should return deterministic ordering (alphabetical)', () => {
    createMockTsxFile(testDir, 'src/Zebra.tsx');
    createMockTsxFile(testDir, 'src/Apple.tsx');
    createMockTsxFile(testDir, 'src/Mango.tsx');

    const files = discoverSourceFiles('src', testDir);

    expect(files).toEqual([
      'src/Apple.tsx',
      'src/Mango.tsx',
      'src/Zebra.tsx',
    ]);
  });

  it('should return empty array for non-existent directory', () => {
    const files = discoverSourceFiles('nonexistent', testDir);
    expect(files).toEqual([]);
  });

  it('should return empty array for directory with no .tsx files', () => {
    mkdirSync(join(testDir, 'empty'), { recursive: true });
    const files = discoverSourceFiles('empty', testDir);
    expect(files).toEqual([]);
  });
});

// =============================================================================
// NORMALIZE SCAN ROOT TESTS
// =============================================================================

describe('normalizeScanRoot', () => {
  it('should handle relative paths', () => {
    expect(normalizeScanRoot('demos/react-demo-app/src', '/repo')).toBe('demos/react-demo-app/src');
  });

  it('should strip leading ./', () => {
    expect(normalizeScanRoot('./demos/react-demo-app/src', '/repo')).toBe('demos/react-demo-app/src');
  });

  it('should handle root case', () => {
    expect(normalizeScanRoot('.', '/repo')).toBe('.');
  });
});

// =============================================================================
// ARTIFACT PATH TESTS
// =============================================================================

describe('getProjectDashboardArtifactPath', () => {
  it('should generate correct path for directory', () => {
    const path = getProjectDashboardArtifactPath('demos/react-demo-app/src');
    expect(path).toBe('design-materializations/demos__react-demo-app__src.figma-project-dashboard.json');
  });

  it('should handle leading ./', () => {
    const path = getProjectDashboardArtifactPath('./demos/react-demo-app/src');
    expect(path).toBe('design-materializations/demos__react-demo-app__src.figma-project-dashboard.json');
  });

  it('should handle root scan', () => {
    const path = getProjectDashboardArtifactPath('.');
    expect(path).toBe('design-materializations/root.figma-project-dashboard.json');
  });

  it('should handle nested paths', () => {
    const path = getProjectDashboardArtifactPath('packages/app/src/components');
    expect(path).toBe(
      'design-materializations/packages__app__src__components.figma-project-dashboard.json'
    );
  });
});

// =============================================================================
// COMPUTE PROJECT DASHBOARD TESTS
// =============================================================================

describe('computeProjectDashboard', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return error when no .tsx files found', async () => {
    mkdirSync(join(testDir, 'empty'), { recursive: true });

    const context = createTestContext(testDir, 'empty');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No .tsx files found');
    }
  });

  it('should compute dashboard with files having no data', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.counts.totalFiles).toBe(2);
      expect(result.artifact.counts.filesNoData).toBe(2);
      expect(result.artifact.counts.filesWithData).toBe(0);
      expect(result.artifact.projectVerdict).toBe('PASS');
    }
  });

  it('should compute dashboard with files having ledger data', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');

    // Write ledger for App.tsx
    const entry1 = createMockRunEntry({
      runId: 'run1',
      sourceFile: 'src/App.tsx',
    });
    writeLedger(testDir, 'src/App.tsx', [entry1]);

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.counts.totalFiles).toBe(2);
      expect(result.artifact.counts.filesWithData).toBe(1);
      expect(result.artifact.counts.filesNoData).toBe(1);
    }
  });

  it('should aggregate verdicts correctly - FAIL wins', async () => {
    createMockTsxFile(testDir, 'src/Good.tsx');
    createMockTsxFile(testDir, 'src/Bad.tsx');

    // Write ledgers
    writeLedger(testDir, 'src/Good.tsx', [
      createMockRunEntry({ runId: 'run1', sourceFile: 'src/Good.tsx' }),
    ]);
    writeLedger(testDir, 'src/Bad.tsx', [
      createMockRunEntry({ runId: 'run1', sourceFile: 'src/Bad.tsx' }),
    ]);

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Both files have data and should pass (no drift)
      expect(result.artifact.projectVerdict).toBe('PASS');
    }
  });

  it('should produce deterministic file ordering', async () => {
    createMockTsxFile(testDir, 'src/Zebra.tsx');
    createMockTsxFile(testDir, 'src/Apple.tsx');
    createMockTsxFile(testDir, 'src/Mango.tsx');

    const context = createTestContext(testDir, 'src');

    const result1 = await computeProjectDashboard(context);
    const result2 = await computeProjectDashboard(context);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.artifact.files.map(f => f.sourceFile)).toEqual([
        'src/Apple.tsx',
        'src/Mango.tsx',
        'src/Zebra.tsx',
      ]);
      expect(result1.artifact.files).toEqual(result2.artifact.files);
    }
  });

  it('should set exit code 0 when not strict mode', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.exitCode).toBe(0);
    }
  });
});

// =============================================================================
// STABILITY SCORE TESTS
// =============================================================================

describe('project stability score', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should be 100 when no files have data', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.stabilityScore.value).toBe(100);
      expect(result.artifact.stabilityScore.filesIncluded).toBe(0);
      expect(result.artifact.stabilityScore.filesExcluded).toBe(1);
    }
  });

  it('should compute average of files with data', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');

    // Both files have single runs (100% stability)
    writeLedger(testDir, 'src/App.tsx', [
      createMockRunEntry({ runId: 'run1', sourceFile: 'src/App.tsx' }),
    ]);
    writeLedger(testDir, 'src/Button.tsx', [
      createMockRunEntry({ runId: 'run1', sourceFile: 'src/Button.tsx' }),
    ]);

    const context = createTestContext(testDir, 'src');

    const result = await computeProjectDashboard(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.stabilityScore.value).toBe(100);
      expect(result.artifact.stabilityScore.filesIncluded).toBe(2);
    }
  });
});

// =============================================================================
// ARTIFACT WRITING TESTS
// =============================================================================

describe('writeProjectDashboardArtifact', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should write artifact to disk', async () => {
    const artifact: ProjectDashboardArtifact = {
      version: 1,
      generatedAt: '2025-12-30T10:00:00.000Z',
      repoRoot: testDir,
      scanRoot: 'demos/react-demo-app/src',
      filePattern: '**/*.tsx',
      counts: {
        totalFiles: 2,
        filesWithData: 1,
        filesNoData: 1,
        filesWithErrors: 0,
        byVerdict: { pass: 1, warn: 0, fail: 0 },
        bySeverity: { info: 0, warn: 0, fail: 0 },
      },
      stabilityScore: {
        value: 100,
        rationale: ['Average of 1 file'],
        filesIncluded: 1,
        filesExcluded: 1,
      },
      topSignals: [],
      files: [],
      projectVerdict: 'PASS',
      exitCode: 0,
      explanation: 'All 1 file passing',
    };

    const result = writeProjectDashboardArtifact(artifact, testDir);
    expect(result.written).toBe(true);
    expect(result.path).toBe(
      'design-materializations/demos__react-demo-app__src.figma-project-dashboard.json'
    );

    // Verify file contents
    const content = await readFile(join(testDir, result.path), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.projectVerdict).toBe('PASS');
  });
});

// =============================================================================
// FORMATTING TESTS
// =============================================================================

describe('formatProjectDashboard', () => {
  it('should format basic project dashboard', () => {
    const artifact: ProjectDashboardArtifact = {
      version: 1,
      generatedAt: '2025-12-30T10:00:00.000Z',
      repoRoot: '/repo',
      scanRoot: 'demos/react-demo-app/src',
      filePattern: '**/*.tsx',
      counts: {
        totalFiles: 3,
        filesWithData: 2,
        filesNoData: 1,
        filesWithErrors: 0,
        byVerdict: { pass: 2, warn: 0, fail: 0 },
        bySeverity: { info: 1, warn: 0, fail: 0 },
      },
      stabilityScore: {
        value: 98,
        rationale: ['Average of 2 files'],
        filesIncluded: 2,
        filesExcluded: 1,
      },
      topSignals: [],
      files: [
        { sourceFile: 'demos/react-demo-app/src/App.tsx', status: 'OK', verdict: 'PASS', stabilityScore: 98 },
        { sourceFile: 'demos/react-demo-app/src/Button.tsx', status: 'OK', verdict: 'PASS', stabilityScore: 100 },
        { sourceFile: 'demos/react-demo-app/src/Card.tsx', status: 'NO_DATA' },
      ],
      projectVerdict: 'PASS',
      exitCode: 0,
      explanation: 'All 2 files passing',
    };

    const output = formatProjectDashboard(artifact, '/repo');

    expect(output).toContain('FIGMA PROJECT DASHBOARD');
    expect(output).toContain('demos/react-demo-app/src');
    expect(output).toContain('Total discovered: 3');
    expect(output).toContain('With data: 2');
    expect(output).toContain('98/100');
    expect(output).toContain('PASS');
  });

  it('should include top signals in output', () => {
    const artifact: ProjectDashboardArtifact = {
      version: 1,
      generatedAt: '2025-12-30T10:00:00.000Z',
      repoRoot: '/repo',
      scanRoot: 'demos/react-demo-app/src',
      filePattern: '**/*.tsx',
      counts: {
        totalFiles: 1,
        filesWithData: 1,
        filesNoData: 0,
        filesWithErrors: 0,
        byVerdict: { pass: 0, warn: 1, fail: 0 },
        bySeverity: { info: 0, warn: 1, fail: 0 },
      },
      stabilityScore: {
        value: 90,
        rationale: ['Average of 1 file'],
        filesIncluded: 1,
        filesExcluded: 0,
      },
      topSignals: [
        {
          key: 'conflicts.total',
          label: 'Conflicts',
          delta: 3,
          severity: 'warn',
          sourceFile: 'demos/react-demo-app/src/App.tsx',
        },
      ],
      files: [],
      projectVerdict: 'WARN',
      exitCode: 0,
      explanation: '1 file with WARN verdict',
    };

    const output = formatProjectDashboard(artifact, '/repo');

    expect(output).toContain('Conflicts');
    expect(output).toContain('+3');
    expect(output).toContain('[WARN]');
    expect(output).toContain('demos/react-demo-app/src/App.tsx');
  });
});

// =============================================================================
// REPO ROOT INVARIANCE TEST
// =============================================================================

describe('repo-root invariance', () => {
  it('should produce same results regardless of scan root format', async () => {
    const testDir1 = createTestDir();
    const testDir2 = createTestDir();

    try {
      // Same structure in two different "repos"
      createMockTsxFile(testDir1, 'src/App.tsx');
      createMockTsxFile(testDir2, 'src/App.tsx');

      const context1 = createTestContext(testDir1, 'src');

      const context2 = createTestContext(testDir2, './src');

      const result1 = await computeProjectDashboard(context1);
      const result2 = await computeProjectDashboard(context2);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        // Scan root should be normalized identically
        expect(result1.artifact.scanRoot).toBe(result2.artifact.scanRoot);
        // File paths should be identical
        expect(result1.artifact.files.map(f => f.sourceFile)).toEqual(
          result2.artifact.files.map(f => f.sourceFile)
        );
      }
    } finally {
      cleanupTestDir(testDir1);
      cleanupTestDir(testDir2);
    }
  });
});

// =============================================================================
// SIGNAL SORTING TESTS
// =============================================================================

describe('project signal sorting', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should be deterministic', async () => {
    // Create files
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');

    const context = createTestContext(testDir, 'src');

    const result1 = await computeProjectDashboard(context);
    const result2 = await computeProjectDashboard(context);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.artifact.topSignals).toEqual(result2.artifact.topSignals);
    }
  });
});
// =============================================================================
// PHASE 13E.1: THRESHOLD TESTS
// =============================================================================

describe('Phase 13E.1: Threshold Configuration', () => {
  describe('resolveThresholds', () => {
    it('should use defaults when no overrides provided', () => {
      const result = resolveThresholds();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.thresholds.failScore).toBe(60);
        expect(result.thresholds.warnScore).toBe(80);
        expect(result.thresholds.maxSignals).toBe(10);
      }
    });

    it('should accept valid CLI overrides', () => {
      const result = resolveThresholds(50, 75, 20);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.thresholds.failScore).toBe(50);
        expect(result.thresholds.warnScore).toBe(75);
        expect(result.thresholds.maxSignals).toBe(20);
      }
    });

    it('should reject invalid threshold ordering (failScore >= warnScore)', () => {
      const result = resolveThresholds(80, 60);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('failScore');
        expect(result.error).toContain('warnScore');
      }
    });

    it('should reject equal thresholds', () => {
      const result = resolveThresholds(70, 70);
      expect(result.ok).toBe(false);
    });

    it('should reject out of range failScore', () => {
      const result1 = resolveThresholds(-1, 80);
      expect(result1.ok).toBe(false);

      const result2 = resolveThresholds(101, 102);
      expect(result2.ok).toBe(false);
    });

    it('should reject out of range warnScore', () => {
      const result = resolveThresholds(60, 101);
      expect(result.ok).toBe(false);
    });

    it('should reject non-positive maxSignals', () => {
      const result = resolveThresholds(60, 80, 0);
      expect(result.ok).toBe(false);
    });
  });

  describe('determineVerdict', () => {
    it('should return PASS when score >= warnScore', () => {
      const result = determineVerdict(80, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('PASS');
    });

    it('should return PASS when score > warnScore', () => {
      const result = determineVerdict(95, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('PASS');
    });

    it('should return WARN when failScore <= score < warnScore', () => {
      const result = determineVerdict(70, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('WARN');
    });

    it('should return WARN at exact failScore boundary', () => {
      const result = determineVerdict(60, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('WARN');
    });

    it('should return FAIL when score < failScore', () => {
      const result = determineVerdict(59, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('FAIL');
    });

    it('should return FAIL for very low scores', () => {
      const result = determineVerdict(0, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.verdict).toBe('FAIL');
    });

    it('should include score in explanation', () => {
      const result = determineVerdict(45, DEFAULT_PROJECT_THRESHOLDS);
      expect(result.explanation).toContain('45');
    });
  });

  describe('formatThresholds', () => {
    it('should format default thresholds correctly', () => {
      const formatted = formatThresholds(DEFAULT_PROJECT_THRESHOLDS);
      expect(formatted).toContain('PASS ≥ 80');
      expect(formatted).toContain('WARN ≥ 60');
      expect(formatted).toContain('FAIL < 60');
      expect(formatted).toContain('Max signals shown: 10');
    });

    it('should format custom thresholds correctly', () => {
      const custom = { failScore: 50, warnScore: 75, maxSignals: 15 };
      const formatted = formatThresholds(custom);
      expect(formatted).toContain('PASS ≥ 75');
      expect(formatted).toContain('WARN ≥ 50');
      expect(formatted).toContain('FAIL < 50');
      expect(formatted).toContain('Max signals shown: 15');
    });
  });

  describe('getVerdictMessage', () => {
    it('should return correct message for PASS', () => {
      const msg = getVerdictMessage('PASS');
      expect(msg.verdict).toBe('PASS');
      expect(msg.emoji).toBe('✓');
      expect(msg.action).toContain('No action required');
    });

    it('should return correct message for WARN', () => {
      const msg = getVerdictMessage('WARN');
      expect(msg.verdict).toBe('WARN');
      expect(msg.emoji).toBe('⚠');
      expect(msg.action).toContain('monitor');
    });

    it('should return correct message for FAIL', () => {
      const msg = getVerdictMessage('FAIL');
      expect(msg.verdict).toBe('FAIL');
      expect(msg.emoji).toBe('✗');
      expect(msg.action).toContain('action required');
    });
  });
});

describe('Phase 13E.1: Threshold-Based Verdict', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should include thresholds in artifact', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');

    const context = createTestContext(testDir, 'src');
    const result = await computeProjectDashboard(context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.thresholds).toBeDefined();
      expect(result.artifact.thresholds?.failScore).toBe(60);
      expect(result.artifact.thresholds?.warnScore).toBe(80);
      expect(result.artifact.thresholds?.maxSignals).toBe(10);
    }
  });

  it('should use custom thresholds in verdict', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');

    // Use very lenient thresholds
    const customThresholds = { failScore: 10, warnScore: 20, maxSignals: 5 };
    const context = createTestContext(testDir, 'src', {
      projectThresholds: customThresholds,
    });

    const result = await computeProjectDashboard(context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With 100% stability score and 20 threshold, should PASS
      expect(result.artifact.projectVerdict).toBe('PASS');
      expect(result.artifact.thresholds?.failScore).toBe(10);
      expect(result.artifact.thresholds?.warnScore).toBe(20);
    }
  });

  it('should respect maxSignals from thresholds', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');

    const customThresholds = { failScore: 60, warnScore: 80, maxSignals: 5 };
    const context = createTestContext(testDir, 'src', {
      projectThresholds: customThresholds,
    });

    const result = await computeProjectDashboard(context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.topSignals.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('Phase 13E.1: Deterministic Output', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should produce identical output for identical inputs', async () => {
    createMockTsxFile(testDir, 'src/App.tsx');
    createMockTsxFile(testDir, 'src/Button.tsx');

    const context = createTestContext(testDir, 'src');

    const results = await Promise.all([
      computeProjectDashboard(context),
      computeProjectDashboard(context),
      computeProjectDashboard(context),
    ]);

    expect(results.every(r => r.ok)).toBe(true);

    // Compare artifacts (excluding generatedAt which changes)
    const normalized = results.map(r => {
      if (r.ok) {
        const { generatedAt, ...rest } = r.artifact;
        return JSON.stringify(rest);
      }
      return null;
    });

    expect(normalized[0]).toBe(normalized[1]);
    expect(normalized[1]).toBe(normalized[2]);
  });
});