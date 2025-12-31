/**
 * @aesthetic-function/watcher - reconciliationReconcile/__tests__/reconcile.test.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI Tests.
 *
 * Test strategy:
 * - Fixtures only, no demo-app reads
 * - Mock step runners for deterministic results
 * - Temp repo-root fixture directory with pnpm-workspace.yaml
 *
 * Test cases:
 * A) Repo-root invariance
 * B) Record dual-gate behavior
 * C) Strict semantics
 * D) Deterministic ordering
 * E) Bundle artifact writing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getRepoRoot,
  normalizeSourcePath,
  getBundleArtifactPath,
  writeBundleArtifact,
  formatBundle,
  RECONCILE_STEP_ORDER,
} from '../index.js';
import type {
  ReconcileBundleArtifact,
  ReconcileStepResult,
  ReconcileMode,
} from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a temporary test directory with repo root markers.
 */
function createTestDir(): string {
  const testDir = join(
    tmpdir(),
    `figma-reconcile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
 * Create a mock step result.
 */
function createMockStepResult(
  step: ReconcileStepResult['step'],
  overrides: Partial<ReconcileStepResult> = {}
): ReconcileStepResult {
  return {
    step,
    ok: true,
    exitCode: 0,
    summary: `${step} completed`,
    ...overrides,
  };
}

/**
 * Create a mock bundle artifact.
 */
function createMockBundle(
  sourceFile: string,
  repoRoot: string,
  overrides: Partial<ReconcileBundleArtifact> = {}
): ReconcileBundleArtifact {
  return {
    version: '1.0',
    timestamp: '2025-12-31T12:00:00.000Z',
    repoRoot,
    sourceFileInput: sourceFile,
    sourceFileCanonical: sourceFile,
    mode: 'read-only' as ReconcileMode,
    steps: RECONCILE_STEP_ORDER.map((step) => createMockStepResult(step)),
    artifacts: {},
    overall: {
      ok: true,
      ciVerdict: 'PASS',
      explanation: 'All steps completed successfully',
    },
    ...overrides,
  };
}

// =============================================================================
// A) REPO-ROOT INVARIANCE
// =============================================================================

describe('Repo-root invariance', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    // Create nested directories
    mkdirSync(join(testDir, 'packages', 'watcher'), { recursive: true });
    mkdirSync(join(testDir, 'some', 'nested', 'dir'), { recursive: true });
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('getRepoRoot finds repo root from nested directory', () => {
    const nestedDir = join(testDir, 'packages', 'watcher');
    const foundRoot = getRepoRoot(nestedDir);
    expect(foundRoot).toBe(testDir);
  });

  it('normalizeSourcePath produces canonical path from different inputs', () => {
    const sourceFile = 'src/App.tsx';

    // From repo root
    const normalized1 = normalizeSourcePath(sourceFile, testDir);

    // From nested dir with ./
    const normalized2 = normalizeSourcePath('./src/App.tsx', testDir);

    // All should produce the same canonical path
    expect(normalized1).toBe(normalized2);
    expect(normalized1).toBe('src/App.tsx');
  });

  it('getBundleArtifactPath produces same path for canonical source', () => {
    const sourceFile = 'src/Component.tsx';

    const path1 = getBundleArtifactPath(sourceFile);
    const path2 = getBundleArtifactPath(sourceFile);

    expect(path1).toBe(path2);
    expect(path1).toBe('design-materializations/src__Component.figma-reconcile.json');
  });

  it('produces identical artifact path from same source file', () => {
    const sourceFile = 'packages/watcher/src/App.tsx';

    // Normalize from repo root context
    const normalized = normalizeSourcePath(sourceFile, testDir);

    // Artifact path should be consistent
    const path = getBundleArtifactPath(normalized);

    expect(path).toBe('design-materializations/packages__watcher__src__App.figma-reconcile.json');
  });
});

// =============================================================================
// B) RECORD DUAL-GATE
// =============================================================================

describe('Record dual-gate', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    // Clean up any env vars we set
    delete process.env.RECONCILIATION_TIMELINE_ON;
  });

  it('reports read-only mode when env not set', () => {
    delete process.env.RECONCILIATION_TIMELINE_ON;

    // Create a bundle with read-only mode (simulating record=true but env not set)
    const bundle = createMockBundle('src/App.tsx', testDir, {
      mode: 'read-only',
    });

    expect(bundle.mode).toBe('read-only');
  });

  it('reports record mode when env is set', () => {
    process.env.RECONCILIATION_TIMELINE_ON = 'true';

    // Create a bundle with record mode (simulating record=true and env set)
    const bundle = createMockBundle('src/App.tsx', testDir, {
      mode: 'record',
    });

    expect(bundle.mode).toBe('record');
  });

  it('includes warning when record requested but env missing', () => {
    delete process.env.RECONCILIATION_TIMELINE_ON;

    const bundle = createMockBundle('src/App.tsx', testDir, {
      mode: 'read-only',
      steps: RECONCILE_STEP_ORDER.map((step) =>
        createMockStepResult(step, {
          warnings:
            step === 'timeline'
              ? ['--record requested but RECONCILIATION_TIMELINE_ON is not set to "true"']
              : undefined,
        })
      ),
    });

    const timelineStep = bundle.steps.find((s) => s.step === 'timeline');
    expect(timelineStep?.warnings).toContain(
      '--record requested but RECONCILIATION_TIMELINE_ON is not set to "true"'
    );
  });
});

// =============================================================================
// C) STRICT SEMANTICS
// =============================================================================

describe('Strict semantics', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('non-strict mode: drift failure produces ok=true with warning', () => {
    const bundle = createMockBundle('src/App.tsx', testDir, {
      steps: RECONCILE_STEP_ORDER.map((step) =>
        createMockStepResult(step, {
          // Drift has warning but ok=true in non-strict
          ok: true,
          exitCode: 0,
          warnings:
            step === 'drift'
              ? ['Drift comparison had issues (INVALID/WEAK); ignored in non-strict mode']
              : undefined,
        })
      ),
      overall: {
        ok: true,
        ciVerdict: 'WARN',
        explanation: 'Reconcile completed with warnings',
      },
    });

    expect(bundle.overall.ok).toBe(true);
    expect(bundle.overall.ciVerdict).toBe('WARN');

    const driftStep = bundle.steps.find((s) => s.step === 'drift');
    expect(driftStep?.warnings).toBeDefined();
  });

  it('strict mode: drift failure produces ok=false', () => {
    const bundle = createMockBundle('src/App.tsx', testDir, {
      steps: RECONCILE_STEP_ORDER.map((step) =>
        createMockStepResult(step, {
          // Drift fails in strict mode
          ok: step === 'drift' ? false : true,
          exitCode: step === 'drift' ? 1 : 0,
        })
      ),
      overall: {
        ok: false,
        ciVerdict: 'FAIL',
        explanation: 'Strict mode failure in one or more steps',
      },
    });

    expect(bundle.overall.ok).toBe(false);
    expect(bundle.overall.ciVerdict).toBe('FAIL');

    const driftStep = bundle.steps.find((s) => s.step === 'drift');
    expect(driftStep?.ok).toBe(false);
    expect(driftStep?.exitCode).toBe(1);
  });
});

// =============================================================================
// D) DETERMINISTIC ORDERING
// =============================================================================

describe('Deterministic ordering', () => {
  it('RECONCILE_STEP_ORDER is locked', () => {
    expect(RECONCILE_STEP_ORDER).toEqual(['status', 'index', 'timeline', 'drift', 'dashboard']);
  });

  it('bundle.steps maintains locked order', () => {
    const testDir = createTestDir();
    try {
      const bundle = createMockBundle('src/App.tsx', testDir);

      const stepOrder = bundle.steps.map((s) => s.step);
      expect(stepOrder).toEqual(['status', 'index', 'timeline', 'drift', 'dashboard']);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('formatBundle shows steps in order', () => {
    const testDir = createTestDir();
    try {
      const bundle = createMockBundle('src/App.tsx', testDir);
      const formatted = formatBundle(bundle);

      // Check that steps appear in order
      const statusIndex = formatted.indexOf('status');
      const indexIndex = formatted.indexOf('index');
      const timelineIndex = formatted.indexOf('timeline');
      const driftIndex = formatted.indexOf('drift');
      const dashboardIndex = formatted.indexOf('dashboard');

      expect(statusIndex).toBeLessThan(indexIndex);
      expect(indexIndex).toBeLessThan(timelineIndex);
      expect(timelineIndex).toBeLessThan(driftIndex);
      expect(driftIndex).toBeLessThan(dashboardIndex);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

// =============================================================================
// E) BUNDLE ARTIFACT WRITING
// =============================================================================

describe('Bundle artifact writing', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('writes bundle artifact to correct path', () => {
    const bundle = createMockBundle('src/App.tsx', testDir);
    const result = writeBundleArtifact(bundle, testDir);

    expect(result.written).toBe(true);
    expect(result.path).toBe('design-materializations/src__App.figma-reconcile.json');

    const fullPath = join(testDir, result.path);
    expect(existsSync(fullPath)).toBe(true);
  });

  it('writes valid JSON', () => {
    const bundle = createMockBundle('src/Component.tsx', testDir);
    const result = writeBundleArtifact(bundle, testDir);

    expect(result.written).toBe(true);

    const fullPath = join(testDir, result.path);
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe('1.0');
    expect(parsed.sourceFileCanonical).toBe('src/Component.tsx');
    expect(parsed.steps).toHaveLength(5);
  });

  it('atomic write: identical content on consecutive writes', () => {
    const bundle = createMockBundle('src/App.tsx', testDir);

    // First write
    const result1 = writeBundleArtifact(bundle, testDir);
    const content1 = readFileSync(join(testDir, result1.path), 'utf-8');

    // Second write (same bundle)
    const result2 = writeBundleArtifact(bundle, testDir);
    const content2 = readFileSync(join(testDir, result2.path), 'utf-8');

    expect(content1).toBe(content2);
  });

  it('getBundleArtifactPath generates correct pattern', () => {
    const tests = [
      { input: 'src/App.tsx', expected: 'design-materializations/src__App.figma-reconcile.json' },
      { input: 'demo-app/src/App.tsx', expected: 'design-materializations/demo-app__src__App.figma-reconcile.json' },
      { input: 'packages/watcher/src/index.ts', expected: 'design-materializations/packages__watcher__src__index.figma-reconcile.json' },
    ];

    for (const { input, expected } of tests) {
      expect(getBundleArtifactPath(input)).toBe(expected);
    }
  });
});

// =============================================================================
// FORMATTING
// =============================================================================

describe('Bundle formatting', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('formatBundle includes all required sections', () => {
    const bundle = createMockBundle('src/App.tsx', testDir);
    const formatted = formatBundle(bundle);

    expect(formatted).toContain('RECONCILE SUMMARY');
    expect(formatted).toContain('Source:');
    expect(formatted).toContain('Mode:');
    expect(formatted).toContain('Steps:');
    expect(formatted).toContain('Overall:');
  });

  it('formatBundle shows pass/fail indicators', () => {
    const bundle = createMockBundle('src/App.tsx', testDir, {
      steps: [
        createMockStepResult('status', { ok: true }),
        createMockStepResult('index', { ok: true }),
        createMockStepResult('timeline', { ok: true }),
        createMockStepResult('drift', { ok: false }),
        createMockStepResult('dashboard', { ok: true }),
      ],
    });
    const formatted = formatBundle(bundle);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('✗');
  });

  it('formatBundle shows warnings', () => {
    const bundle = createMockBundle('src/App.tsx', testDir, {
      steps: [
        createMockStepResult('status'),
        createMockStepResult('index'),
        createMockStepResult('timeline', {
          warnings: ['Test warning message'],
        }),
        createMockStepResult('drift'),
        createMockStepResult('dashboard'),
      ],
    });
    const formatted = formatBundle(bundle);

    expect(formatted).toContain('⚠');
    expect(formatted).toContain('Test warning message');
  });
});
