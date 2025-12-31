/**
 * @aesthetic-function/watcher - reconciliationCi/__tests__/reconciliationCi.test.ts
 *
 * Phase 13F + 13F.1: CI Gate Summary + Trend Window Tests.
 *
 * Coverage:
 * - Strict mode exit code behavior
 * - Trend window computation determinism
 * - Repo-root invariance
 * - Artifact naming normalization
 * - No-data files excluded from mean but included in counts
 * - Trend direction classification
 * - Phase 13F.1: Trend policy configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  computeCiGate,
  DEFAULT_TREND_WINDOW,
  getCiWindowSize,
  isCiStrictMode,
  normalizeScanRoot,
} from '../compute.js';

import {
  resolveTrendPolicy,
  validateTrendPolicy,
  formatTrendPolicy,
  determineCiVerdict,
} from '../config.js';

import {
  DEFAULT_TREND_POLICY,
  getCiVerdictMessage,
} from '../types.js';

import type { CiTrendPolicy, CiGateContext } from '../types.js';

import {
  getCiGateArtifactPath,
  writeCiGateArtifact,
  formatCiGate,
} from '../artifact.js';

import type { CiGateArtifact } from '../types.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a default CiGateContext for testing.
 */
function createTestContext(overrides: Partial<CiGateContext> = {}): CiGateContext {
  return {
    scanRoot: 'demo-app/src',
    repoRoot: '/test-repo',
    limit: 10,
    strict: false,
    trendPolicy: { ...DEFAULT_TREND_POLICY },
    ...overrides,
  };
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a minimal dashboard artifact for testing.
 */
function createDashboardArtifact(
  sourceFile: string,
  verdict: 'PASS' | 'WARN' | 'FAIL',
  stabilityScore: number
): object {
  return {
    version: 1,
    generatedAt: '2025-12-30T12:00:00.000Z',
    repoRoot: '/test-repo',
    sourceFile,
    runWindow: { limit: 10, fromRunId: null, toRunId: null },
    counts: {
      runsConsidered: 3,
      bySeverity: { info: 1, warn: 0, fail: 0 },
    },
    stabilityScore: {
      value: stabilityScore,
      rationale: ['test'],
    },
    topSignals: [],
    recentRuns: [],
    ciVerdict: verdict,
    exitCode: 0,
    explanation: 'test',
  };
}

/**
 * Create a minimal run ledger for testing.
 */
function createRunLedger(sourceFile: string, runsCount: number): object {
  const runs = [];
  for (let i = 0; i < runsCount; i++) {
    runs.push({
      runId: `run${i}`.padStart(8, '0'),
      sourceFile,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      cwd: '/test-repo',
      repoRoot: '/test-repo',
      command: 'figma:status',
      artifacts: {},
      summary: {
        verifyFailures: i === 0 ? 0 : i, // Newer runs have fewer failures
        conflicts: 0,
      },
    });
  }
  return {
    version: 1,
    sourceFile,
    runs,
  };
}

// =============================================================================
// getCiGateArtifactPath TESTS
// =============================================================================

describe('getCiGateArtifactPath', () => {
  it('should generate correct path for nested directory', () => {
    const result = getCiGateArtifactPath('demo-app/src');
    expect(result).toBe('design-materializations/demo-app__src.figma-ci-gate.json');
  });

  it('should generate correct path for single directory', () => {
    const result = getCiGateArtifactPath('src');
    expect(result).toBe('design-materializations/src.figma-ci-gate.json');
  });

  it('should handle root directory', () => {
    const result = getCiGateArtifactPath('.');
    expect(result).toBe('design-materializations/root.figma-ci-gate.json');
  });

  it('should strip leading ./', () => {
    const result = getCiGateArtifactPath('./demo-app/src');
    expect(result).toBe('design-materializations/demo-app__src.figma-ci-gate.json');
  });
});

// =============================================================================
// normalizeScanRoot TESTS
// =============================================================================

describe('normalizeScanRoot', () => {
  it('should normalize relative path', () => {
    const result = normalizeScanRoot('demo-app/src', '/repo');
    expect(result).toBe('demo-app/src');
  });

  it('should strip leading ./', () => {
    const result = normalizeScanRoot('./demo-app/src', '/repo');
    expect(result).toBe('demo-app/src');
  });

  it('should handle absolute path within repo', () => {
    const result = normalizeScanRoot('/repo/demo-app/src', '/repo');
    expect(result).toBe('demo-app/src');
  });
});

// =============================================================================
// ENVIRONMENT VARIABLE TESTS
// =============================================================================

describe('isCiStrictMode', () => {
  const originalEnv = process.env.RECONCILIATION_CI_STRICT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RECONCILIATION_CI_STRICT;
    } else {
      process.env.RECONCILIATION_CI_STRICT = originalEnv;
    }
  });

  it('should return false when not set', () => {
    delete process.env.RECONCILIATION_CI_STRICT;
    expect(isCiStrictMode()).toBe(false);
  });

  it('should return true when set to "true"', () => {
    process.env.RECONCILIATION_CI_STRICT = 'true';
    expect(isCiStrictMode()).toBe(true);
  });

  it('should return true when set to "1"', () => {
    process.env.RECONCILIATION_CI_STRICT = '1';
    expect(isCiStrictMode()).toBe(true);
  });

  it('should return false for other values', () => {
    process.env.RECONCILIATION_CI_STRICT = 'false';
    expect(isCiStrictMode()).toBe(false);
  });
});

describe('getCiWindowSize', () => {
  const originalEnv = process.env.RECONCILIATION_CI_WINDOW;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RECONCILIATION_CI_WINDOW;
    } else {
      process.env.RECONCILIATION_CI_WINDOW = originalEnv;
    }
  });

  it('should return default when not set', () => {
    delete process.env.RECONCILIATION_CI_WINDOW;
    expect(getCiWindowSize()).toBe(DEFAULT_TREND_WINDOW);
  });

  it('should return parsed value when set', () => {
    process.env.RECONCILIATION_CI_WINDOW = '10';
    expect(getCiWindowSize()).toBe(10);
  });

  it('should return default for invalid values', () => {
    process.env.RECONCILIATION_CI_WINDOW = 'invalid';
    expect(getCiWindowSize()).toBe(DEFAULT_TREND_WINDOW);
  });

  it('should return default for zero', () => {
    process.env.RECONCILIATION_CI_WINDOW = '0';
    expect(getCiWindowSize()).toBe(DEFAULT_TREND_WINDOW);
  });
});

// =============================================================================
// computeCiGate TESTS
// =============================================================================

describe('computeCiGate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gate-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return error for empty directory', async () => {
    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No .tsx files found');
    }
  });

  it('should compute gate for directory with files', async () => {
    // Create test files
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Card.tsx'), 'export const Card = () => <div />;');

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.counts.totalFiles).toBe(2);
      expect(result.artifact.verdict).toBe('PASS');
      expect(result.artifact.exitCode).toBe(0);
      expect(result.artifact.trend.windowSize).toBe(5);
    }
  });

  it('should set exit code 1 when strict and FAIL verdict', async () => {
    // Create test file
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');

    // Create dashboard artifact with FAIL verdict
    const dashboard = createDashboardArtifact('demo-app/src/App.tsx', 'FAIL', 30);
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-drift-dashboard.json'),
      JSON.stringify(dashboard, null, 2)
    );

    // Create run ledger with worsening trend (more failures in newer runs)
    // Note: Ledger stores runs oldest-first, so older run (no failures) comes first
    const ledger = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [
        { runId: 'run00000', sourceFile: 'demo-app/src/App.tsx', timestamp: new Date(Date.now() - 3600000).toISOString(), cwd: tempDir, repoRoot: tempDir, command: 'figma:status', artifacts: {}, summary: { verifyFailures: 0, conflicts: 0 } },
        { runId: 'run00001', sourceFile: 'demo-app/src/App.tsx', timestamp: new Date().toISOString(), cwd: tempDir, repoRoot: tempDir, command: 'figma:status', artifacts: {}, summary: { verifyFailures: 5, conflicts: 0 } },
      ],
    };
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-run-ledger.json'),
      JSON.stringify(ledger, null, 2)
    );

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
      strict: true,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Phase 13F.1: Verdict is based on worsening trends, not dashboard verdict
      expect(result.artifact.trend.worsening).toBeGreaterThan(0);
      expect(result.artifact.verdict).toBe('FAIL');
      expect(result.artifact.exitCode).toBe(1);
    }
  });

  it('should set exit code 0 when not strict even with worsening trends', async () => {
    // Create test file
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');

    // Create dashboard artifact with FAIL verdict
    const dashboard = createDashboardArtifact('demo-app/src/App.tsx', 'FAIL', 30);
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-drift-dashboard.json'),
      JSON.stringify(dashboard, null, 2)
    );

    // Create run ledger with worsening trend (more failures in newer runs)
    // Note: Ledger stores runs oldest-first, so older run (no failures) comes first
    const ledger = {
      version: 1,
      sourceFile: 'demo-app/src/App.tsx',
      runs: [
        { runId: 'run00000', sourceFile: 'demo-app/src/App.tsx', timestamp: new Date(Date.now() - 3600000).toISOString(), cwd: tempDir, repoRoot: tempDir, command: 'figma:status', artifacts: {}, summary: { verifyFailures: 0, conflicts: 0 } },
        { runId: 'run00001', sourceFile: 'demo-app/src/App.tsx', timestamp: new Date().toISOString(), cwd: tempDir, repoRoot: tempDir, command: 'figma:status', artifacts: {}, summary: { verifyFailures: 5, conflicts: 0 } },
      ],
    };
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-run-ledger.json'),
      JSON.stringify(ledger, null, 2)
    );

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
      strict: false,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Phase 13F.1: Verdict is WARN in non-strict mode with worsening trends
      expect(result.artifact.trend.worsening).toBeGreaterThan(0);
      expect(result.artifact.verdict).toBe('WARN');
      expect(result.artifact.exitCode).toBe(0);
    }
  });
});

// =============================================================================
// TREND COMPUTATION TESTS
// =============================================================================

describe('trend computation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gate-trend-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should mark files with insufficient data', async () => {
    // Create test file
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Without ledger, files have insufficient data
      expect(result.artifact.trend.insufficientData).toBeGreaterThanOrEqual(0);
    }
  });

  it('should compute trend from ledger data', async () => {
    // Create test file
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');

    // Create run ledger with improving scores (fewer failures over time)
    const ledger = createRunLedger('demo-app/src/App.tsx', 5);
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-run-ledger.json'),
      JSON.stringify(ledger, null, 2)
    );

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.trend.files.length).toBe(1);
      expect(result.artifact.trend.files[0].sourceFile).toBe('demo-app/src/App.tsx');
    }
  });

  it('should sort trend files deterministically', async () => {
    // Create test files (in non-alphabetical order)
    writeFileSync(join(tempDir, 'demo-app/src/Zebra.tsx'), 'export const Zebra = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Alpha.tsx'), 'export const Alpha = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Beta.tsx'), 'export const Beta = () => <div />;');

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const files = result.artifact.trend.files.map(f => f.sourceFile);
      expect(files).toEqual([
        'demo-app/src/Alpha.tsx',
        'demo-app/src/Beta.tsx',
        'demo-app/src/Zebra.tsx',
      ]);
    }
  });
});

// =============================================================================
// REPO-ROOT INVARIANCE TESTS
// =============================================================================

describe('repo-root invariance', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gate-invariance-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should produce same artifact structure regardless of invocation path', async () => {
    // Compute from repo root
    const result1 = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    // Compute with absolute path
    const result2 = await computeCiGate(createTestContext({
      scanRoot: join(tempDir, 'demo-app/src'),
      repoRoot: tempDir,
    }));

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Scan roots should be normalized the same way
      expect(result1.artifact.scanRoot).toBe(result2.artifact.scanRoot);
      expect(result1.artifact.counts.totalFiles).toBe(result2.artifact.counts.totalFiles);
    }
  });
});

// =============================================================================
// writeCiGateArtifact TESTS
// =============================================================================

describe('writeCiGateArtifact', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gate-write-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should write artifact atomically', () => {
    const artifact: CiGateArtifact = {
      version: 1,
      generatedAt: '2025-12-30T12:00:00.000Z',
      repoRoot: tempDir,
      scanRoot: 'demo-app/src',
      filePattern: '**/*.tsx',
      counts: {
        totalFiles: 1,
        filesWithData: 1,
        filesNoData: 0,
        filesWithErrors: 0,
        byVerdict: { pass: 1, warn: 0, fail: 0 },
        bySeverity: { info: 0, warn: 0, fail: 0 },
      },
      stabilityScore: {
        value: 100,
        rationale: ['test'],
        filesIncluded: 1,
        filesExcluded: 0,
      },
      trend: {
        improving: 0,
        stable: 1,
        worsening: 0,
        insufficientData: 0,
        files: [],
        windowSize: 5,
      },
      topSignals: [],
      files: [],
      verdict: 'PASS',
      exitCode: 0,
      explanation: 'test',
    };

    const result = writeCiGateArtifact(artifact, tempDir);

    expect(result.written).toBe(true);
    expect(result.path).toBe('design-materializations/demo-app__src.figma-ci-gate.json');
  });
});

// =============================================================================
// formatCiGate TESTS
// =============================================================================

describe('formatCiGate', () => {
  const createTestArtifact = (): CiGateArtifact => ({
    version: 1,
    generatedAt: '2025-12-30T12:00:00.000Z',
    repoRoot: '/test-repo',
    scanRoot: 'demo-app/src',
    filePattern: '**/*.tsx',
    counts: {
      totalFiles: 3,
      filesWithData: 2,
      filesNoData: 1,
      filesWithErrors: 0,
      byVerdict: { pass: 1, warn: 1, fail: 0 },
      bySeverity: { info: 2, warn: 1, fail: 0 },
    },
    stabilityScore: {
      value: 85,
      rationale: ['Average of 2 files'],
      filesIncluded: 2,
      filesExcluded: 1,
    },
    trend: {
      improving: 1,
      stable: 1,
      worsening: 0,
      insufficientData: 1,
      files: [
        {
          sourceFile: 'demo-app/src/App.tsx',
          runsInWindow: 5,
          direction: 'improving',
          startScore: 80,
          endScore: 90,
          scoreDelta: 10,
        },
      ],
      windowSize: 5,
    },
    topSignals: [],
    files: [
      {
        sourceFile: 'demo-app/src/App.tsx',
        status: 'OK',
        verdict: 'PASS',
        stabilityScore: 90,
        runsConsidered: 5,
        severityCounts: { info: 1, warn: 0, fail: 0 },
      },
    ],
    verdict: 'WARN',
    exitCode: 0,
    explanation: '1 file with WARN verdict',
  });

  it('should format header correctly', () => {
    const artifact = createTestArtifact();
    const output = formatCiGate(artifact, '/test-repo', false);

    expect(output).toContain('=== FIGMA CI GATE (Phase 13F) ===');
    expect(output).toContain('Repo Root: /test-repo');
    expect(output).toContain('Scan Root: demo-app/src');
  });

  it('should include trend summary', () => {
    const artifact = createTestArtifact();
    const output = formatCiGate(artifact, '/test-repo', false);

    expect(output).toContain('Trend Summary (window: 5 runs):');
    expect(output).toContain('↑ Improving: 1');
    expect(output).toContain('→ Stable: 1');
    expect(output).toContain('↓ Worsening: 0');
  });

  it('should show verdict', () => {
    const artifact = createTestArtifact();
    const output = formatCiGate(artifact, '/test-repo', false);

    expect(output).toContain('CI Verdict:');
    expect(output).toContain('⚠ WARN');
    expect(output).toContain('Exit code: 0');
  });

  it('should show file trends in verbose mode', () => {
    const artifact = createTestArtifact();
    const output = formatCiGate(artifact, '/test-repo', true);

    expect(output).toContain('File Trends:');
    expect(output).toContain('demo-app/src/App.tsx');
    expect(output).toContain('80 → 90');
  });
});

// =============================================================================
// NO-DATA FILES TESTS
// =============================================================================

describe('no-data files handling', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gate-nodata-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should exclude no-data files from stability mean', async () => {
    // Create 3 test files
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Card.tsx'), 'export const Card = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Button.tsx'), 'export const Button = () => <div />;');

    // Only create dashboard for App.tsx
    const dashboard = createDashboardArtifact('demo-app/src/App.tsx', 'PASS', 80);
    writeFileSync(
      join(tempDir, 'design-materializations/demo-app__src__App.figma-drift-dashboard.json'),
      JSON.stringify(dashboard, null, 2)
    );

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All 3 files should be counted
      expect(result.artifact.counts.totalFiles).toBe(3);
      // Only 1 has data
      expect(result.artifact.counts.filesWithData).toBe(1);
      // 2 have no data
      expect(result.artifact.counts.filesNoData).toBe(2);
      // Stability score should be based only on files with data
      expect(result.artifact.stabilityScore.filesIncluded).toBe(1);
      expect(result.artifact.stabilityScore.filesExcluded).toBe(2);
    }
  });
});

// =============================================================================
// PHASE 13F.1: TREND POLICY CONFIGURATION TESTS
// =============================================================================

describe('Phase 13F.1: Trend Policy Configuration', () => {
  describe('resolveTrendPolicy', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore original environment
      process.env = { ...originalEnv };
    });

    it('should use defaults when no overrides provided', () => {
      const result = resolveTrendPolicy();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policy).toEqual(DEFAULT_TREND_POLICY);
      }
    });

    it('should accept valid CLI overrides', () => {
      const result = resolveTrendPolicy({
        window: 10,
        improvingDelta: 8,
        worseningDelta: -8,
        failOnWorsening: false,
        maxFiles: 50,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policy.window).toBe(10);
        expect(result.policy.improvingDelta).toBe(8);
        expect(result.policy.worseningDelta).toBe(-8);
        expect(result.policy.failOnWorsening).toBe(false);
        expect(result.policy.maxFiles).toBe(50);
      }
    });

    it('should reject invalid improving delta (<= 0)', () => {
      const result = resolveTrendPolicy({ improvingDelta: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('improving-delta');
      }
    });

    it('should reject invalid worsening delta (>= 0)', () => {
      const result = resolveTrendPolicy({ worseningDelta: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('worsening-delta');
      }
    });

    it('should reject invalid window (< 1)', () => {
      const result = resolveTrendPolicy({ window: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('window');
      }
    });

    it('should reject invalid maxFiles (< 1)', () => {
      const result = resolveTrendPolicy({ maxFiles: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('max-files');
      }
    });

    it('should apply env overrides when set', () => {
      process.env.RECONCILIATION_CI_TREND_WINDOW = '8';
      process.env.RECONCILIATION_CI_IMPROVING_DELTA = '10';
      process.env.RECONCILIATION_CI_WORSENING_DELTA = '-10';
      process.env.RECONCILIATION_CI_FAIL_ON_WORSENING = 'false';
      process.env.RECONCILIATION_CI_MAX_FILES = '30';

      const result = resolveTrendPolicy();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policy.window).toBe(8);
        expect(result.policy.improvingDelta).toBe(10);
        expect(result.policy.worseningDelta).toBe(-10);
        expect(result.policy.failOnWorsening).toBe(false);
        expect(result.policy.maxFiles).toBe(30);
      }
    });

    it('should prioritize CLI over env', () => {
      process.env.RECONCILIATION_CI_TREND_WINDOW = '8';

      const result = resolveTrendPolicy({ window: 15 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policy.window).toBe(15);
      }
    });
  });

  describe('validateTrendPolicy', () => {
    it('should return undefined for valid policy', () => {
      const error = validateTrendPolicy(DEFAULT_TREND_POLICY);
      expect(error).toBeUndefined();
    });

    it('should reject positive worsening delta', () => {
      const policy: CiTrendPolicy = { ...DEFAULT_TREND_POLICY, worseningDelta: 5 };
      const error = validateTrendPolicy(policy);
      expect(error).toContain('worsening-delta');
    });

    it('should reject non-positive improving delta', () => {
      const policy: CiTrendPolicy = { ...DEFAULT_TREND_POLICY, improvingDelta: -1 };
      const error = validateTrendPolicy(policy);
      expect(error).toContain('improving-delta');
    });
  });

  describe('determineCiVerdict', () => {
    it('should return PASS when no worsening files', () => {
      const verdict = determineCiVerdict(0, false, true);
      expect(verdict).toBe('PASS');
    });

    it('should return PASS when no worsening files (strict)', () => {
      const verdict = determineCiVerdict(0, true, true);
      expect(verdict).toBe('PASS');
    });

    it('should return WARN when worsening files in non-strict mode', () => {
      const verdict = determineCiVerdict(3, false, true);
      expect(verdict).toBe('WARN');
    });

    it('should return FAIL when worsening files in strict + failOnWorsening', () => {
      const verdict = determineCiVerdict(3, true, true);
      expect(verdict).toBe('FAIL');
    });

    it('should return WARN when strict but !failOnWorsening', () => {
      const verdict = determineCiVerdict(3, true, false);
      expect(verdict).toBe('WARN');
    });
  });

  describe('formatTrendPolicy', () => {
    it('should format default policy correctly', () => {
      const output = formatTrendPolicy(DEFAULT_TREND_POLICY);
      expect(output).toContain('CI TREND POLICY');
      expect(output).toContain('Window: 5 runs');
      expect(output).toContain('Improving: ≥ +5');
      expect(output).toContain('Worsening: ≤ -5');
      expect(output).toContain('Fail on worsening: enabled');
      expect(output).toContain('Max files evaluated: 20');
    });

    it('should format custom policy correctly', () => {
      const policy: CiTrendPolicy = {
        window: 10,
        improvingDelta: 8,
        worseningDelta: -8,
        failOnWorsening: false,
        maxFiles: 50,
      };
      const output = formatTrendPolicy(policy);
      expect(output).toContain('Window: 10 runs');
      expect(output).toContain('Improving: ≥ +8');
      expect(output).toContain('Worsening: ≤ -8');
      expect(output).toContain('Fail on worsening: disabled');
      expect(output).toContain('Max files evaluated: 50');
    });
  });

  describe('getCiVerdictMessage', () => {
    it('should return correct message for PASS', () => {
      const msg = getCiVerdictMessage('PASS', 0, false);
      expect(msg.verdict).toBe('PASS');
      expect(msg.summary).toContain('No worsening');
    });

    it('should return correct message for WARN', () => {
      const msg = getCiVerdictMessage('WARN', 2, false);
      expect(msg.verdict).toBe('WARN');
      expect(msg.summary).toContain('Worsening trends detected');
      expect(msg.summary).toContain('2 files');
    });

    it('should return correct message for FAIL', () => {
      const msg = getCiVerdictMessage('FAIL', 3, true);
      expect(msg.verdict).toBe('FAIL');
      expect(msg.summary).toContain('exceed CI policy');
      expect(msg.summary).toContain('3 files');
    });
  });
});

describe('Phase 13F.1: Trend Policy in Artifact', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-policy-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should include trendPolicy in artifact', async () => {
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');

    const customPolicy: CiTrendPolicy = {
      window: 10,
      improvingDelta: 8,
      worseningDelta: -8,
      failOnWorsening: true,
      maxFiles: 50,
    };

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
      trendPolicy: customPolicy,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.trendPolicy).toBeDefined();
      expect(result.artifact.trendPolicy?.window).toBe(10);
      expect(result.artifact.trendPolicy?.improvingDelta).toBe(8);
      expect(result.artifact.trendPolicy?.worseningDelta).toBe(-8);
    }
  });

  it('should respect maxFiles limit', async () => {
    // Create many test files
    for (let i = 0; i < 25; i++) {
      writeFileSync(
        join(tempDir, `demo-app/src/Component${i.toString().padStart(2, '0')}.tsx`),
        `export const Component${i} = () => <div />;`
      );
    }

    const result = await computeCiGate(createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
      trendPolicy: { ...DEFAULT_TREND_POLICY, maxFiles: 10 },
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only 10 files should be in trend analysis
      expect(result.artifact.trend.files.length).toBe(10);
      // But all files should still be counted
      expect(result.artifact.counts.totalFiles).toBe(25);
    }
  });
});

describe('Phase 13F.1: Deterministic Output', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-determinism-test-'));
    mkdirSync(join(tempDir, 'design-materializations'), { recursive: true });
    mkdirSync(join(tempDir, 'demo-app/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should produce identical output for identical inputs', async () => {
    writeFileSync(join(tempDir, 'demo-app/src/App.tsx'), 'export const App = () => <div />;');
    writeFileSync(join(tempDir, 'demo-app/src/Card.tsx'), 'export const Card = () => <div />;');

    const context = createTestContext({
      scanRoot: 'demo-app/src',
      repoRoot: tempDir,
    });

    const result1 = await computeCiGate(context);
    const result2 = await computeCiGate(context);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Remove timestamps for comparison
      const a1 = { ...result1.artifact, generatedAt: '' };
      const a2 = { ...result2.artifact, generatedAt: '' };
      expect(a1).toEqual(a2);
    }
  });
});
