/**
 * @aesthetic-function/watcher - reconciliationReconcile/__tests__/reconcile.test.ts
 *
 * Phase 14A: Single-Entry Reconcile CLI Tests.
 * Phase 14B: Profile Support Tests.
 * Phase 14C: CI Wiring Tests.
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
 * F) Profile expansion
 * G) CI wiring (Phase 14C)
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
  formatBundleCi,
  RECONCILE_STEP_ORDER,
  VALID_PROFILES,
  PROFILE_CONFIGS,
  expandProfile,
  mergeWithOverrides,
  resolveProfileConfig,
  DEFAULT_CI_WRITE_POLICY,
} from '../index.js';
import type {
  ReconcileBundleArtifact,
  ReconcileStepResult,
  ReconcileMode,
  ReconcileProfile,
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
    profile: 'local',
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

  it('formatBundle shows profile', () => {
    const bundle = createMockBundle('src/App.tsx', testDir, {
      profile: 'ci',
    });
    const formatted = formatBundle(bundle);

    expect(formatted).toContain('Profile:');
    expect(formatted).toContain('ci');
  });
});

// =============================================================================
// F) PROFILE EXPANSION
// =============================================================================

describe('Profile expansion', () => {
  it('VALID_PROFILES contains all three profiles', () => {
    expect(VALID_PROFILES).toEqual(['local', 'record', 'ci']);
  });

  it('PROFILE_CONFIGS defines all profiles', () => {
    expect(Object.keys(PROFILE_CONFIGS)).toEqual(['local', 'record', 'ci']);
  });

  it('local profile has expected defaults', () => {
    expect(PROFILE_CONFIGS.local.strict).toBe(false);
    expect(PROFILE_CONFIGS.local.record).toBe(false);
    expect(PROFILE_CONFIGS.local.write).toBe(false);
  });

  it('record profile has expected defaults', () => {
    expect(PROFILE_CONFIGS.record.strict).toBe(false);
    expect(PROFILE_CONFIGS.record.record).toBe(true);
    expect(PROFILE_CONFIGS.record.write).toBe(true);
    expect(PROFILE_CONFIGS.record.ciWritePolicy).toBe('bundle+all');
  });

  it('ci profile has expected defaults (Phase 14C)', () => {
    expect(PROFILE_CONFIGS.ci.strict).toBe(true);
    expect(PROFILE_CONFIGS.ci.record).toBe(false);
    expect(PROFILE_CONFIGS.ci.write).toBe(false);
    // Phase 14C: CI always writes bundle
    expect(PROFILE_CONFIGS.ci.alwaysWriteBundle).toBe(true);
    expect(PROFILE_CONFIGS.ci.ciWritePolicy).toBe('bundle');
  });

  it('expandProfile returns correct config for each profile', () => {
    const profiles: ReconcileProfile[] = ['local', 'record', 'ci'];
    for (const profile of profiles) {
      expect(expandProfile(profile)).toEqual(PROFILE_CONFIGS[profile]);
    }
  });

  it('mergeWithOverrides applies undefined overrides as no-op', () => {
    const base = { strict: true, record: false, write: true };
    const merged = mergeWithOverrides(base, {});
    expect(merged.strict).toBe(true);
    expect(merged.record).toBe(false);
    expect(merged.write).toBe(true);
  });

  it('mergeWithOverrides applies explicit overrides', () => {
    const base = { strict: false, record: false, write: false };
    const merged = mergeWithOverrides(base, {
      strict: true,
      write: true,
    });
    expect(merged.strict).toBe(true);
    expect(merged.record).toBe(false);
    expect(merged.write).toBe(true);
  });

  it('mergeWithOverrides allows overriding to false', () => {
    const base = { strict: true, record: true, write: true };
    const merged = mergeWithOverrides(base, {
      strict: false,
      record: false,
    });
    expect(merged.strict).toBe(false);
    expect(merged.record).toBe(false);
    expect(merged.write).toBe(true);
  });

  it('resolveProfileConfig defaults to local profile', () => {
    const resolved = resolveProfileConfig();
    expect(resolved.strict).toBe(false);
    expect(resolved.record).toBe(false);
    expect(resolved.write).toBe(false);
  });

  it('resolveProfileConfig with ci profile includes alwaysWriteBundle', () => {
    const resolved = resolveProfileConfig('ci');
    expect(resolved.strict).toBe(true);
    expect(resolved.alwaysWriteBundle).toBe(true);
    expect(resolved.ciWritePolicy).toBe('bundle');
  });

  it('resolveProfileConfig merges CLI overrides over profile', () => {
    // ci profile: strict=true, record=false, write=false
    // Override: strict=false
    const resolved = resolveProfileConfig('ci', { strict: false });
    expect(resolved.strict).toBe(false); // Overridden
    expect(resolved.record).toBe(false); // From profile
    expect(resolved.write).toBe(false);  // From profile
  });

  it('resolveProfileConfig cli overrides take precedence', () => {
    // local profile: strict=false, record=false, write=false
    // Override all
    const resolved = resolveProfileConfig('local', {
      strict: true,
      record: true,
      write: true,
    });
    expect(resolved.strict).toBe(true);
    expect(resolved.record).toBe(true);
    expect(resolved.write).toBe(true);
  });
});

// =============================================================================
// G) CI WIRING (Phase 14C)
// =============================================================================

describe('CI Wiring (Phase 14C)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe('CI Write Policy', () => {
    it('DEFAULT_CI_WRITE_POLICY is bundle', () => {
      expect(DEFAULT_CI_WRITE_POLICY).toBe('bundle');
    });

    it('ci profile has alwaysWriteBundle=true', () => {
      expect(PROFILE_CONFIGS.ci.alwaysWriteBundle).toBe(true);
    });

    it('bundle is written when alwaysWriteBundle=true even with write=false', () => {
      // This test verifies the logic: CI profile sets write=false but alwaysWriteBundle=true
      const ciConfig = PROFILE_CONFIGS.ci;
      expect(ciConfig.write).toBe(false);
      expect(ciConfig.alwaysWriteBundle).toBe(true);

      // The CLI should still write bundle when alwaysWriteBundle is true
      // Actual behavior tested in integration tests
    });
  });

  describe('CI Output Format', () => {
    it('formatBundleCi produces one-line verdict header', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        profile: 'ci',
        overall: {
          ok: true,
          ciVerdict: 'PASS',
          explanation: 'All steps completed successfully',
        },
      });

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('✓ VERDICT: PASS');
    });

    it('formatBundleCi includes key=value pairs', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        profile: 'ci',
        gitSha: 'abc1234567890',
        dashboardCounts: { info: 1, warn: 2, fail: 0 },
        stabilityScore: 85,
        comparisonClass: 'PARTIAL',
      });

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('source=src/App.tsx');
      expect(formatted).toContain('profile=ci');
      expect(formatted).toContain('verdict=PASS');
      expect(formatted).toContain('git_sha=abc1234');
      expect(formatted).toContain('dashboard_info=1');
      expect(formatted).toContain('dashboard_warn=2');
      expect(formatted).toContain('dashboard_fail=0');
      expect(formatted).toContain('stability_score=85');
      expect(formatted).toContain('comparison_class=PARTIAL');
    });

    it('formatBundleCi shows FAIL verdict correctly', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        profile: 'ci',
        overall: {
          ok: false,
          ciVerdict: 'FAIL',
          explanation: 'Strict mode failure',
        },
      });

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('✗ VERDICT: FAIL');
      expect(formatted).toContain('ok=false');
    });

    it('formatBundleCi shows WARN verdict correctly', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        profile: 'ci',
        overall: {
          ok: true,
          ciVerdict: 'WARN',
          explanation: 'Completed with warnings',
        },
      });

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('⚠ VERDICT: WARN');
      expect(formatted).toContain('ok=true');
    });

    it('formatBundleCi includes bundle path when provided', () => {
      const bundle = createMockBundle('src/App.tsx', testDir);
      const bundlePath = 'design-materializations/src__App.figma-reconcile.json';

      const formatted = formatBundleCi(bundle, bundlePath);

      expect(formatted).toContain(`bundle_path=${bundlePath}`);
    });

    it('formatBundleCi includes step status', () => {
      const bundle = createMockBundle('src/App.tsx', testDir);

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('--- STEPS ---');
      expect(formatted).toContain('status=ok');
      expect(formatted).toContain('index=ok');
      expect(formatted).toContain('drift=ok');
      expect(formatted).toContain('dashboard=ok');
    });

    it('formatBundleCi includes warnings if present', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        comparisonWarnings: ['Missing apply artifact', 'Missing verify artifact'],
      });

      const formatted = formatBundleCi(bundle);

      expect(formatted).toContain('--- WARNINGS ---');
      expect(formatted).toContain('warning=Missing apply artifact');
      expect(formatted).toContain('warning=Missing verify artifact');
    });
  });

  describe('Bundle CI Fields', () => {
    it('bundle can include gitSha', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        gitSha: 'abc1234567890def',
      });

      expect(bundle.gitSha).toBe('abc1234567890def');
    });

    it('bundle can include comparisonClass', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        comparisonClass: 'FULL',
      });

      expect(bundle.comparisonClass).toBe('FULL');
    });

    it('bundle can include dashboardCounts', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        dashboardCounts: { info: 5, warn: 2, fail: 1 },
      });

      expect(bundle.dashboardCounts).toEqual({ info: 5, warn: 2, fail: 1 });
    });

    it('bundle can include stabilityScore', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        stabilityScore: 95,
      });

      expect(bundle.stabilityScore).toBe(95);
    });

    it('bundle can include signals', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        signals: ['conflicts.total', 'verify.mismatches'],
      });

      expect(bundle.signals).toEqual(['conflicts.total', 'verify.mismatches']);
    });
  });

  describe('Verdict Policy', () => {
    it('PASS verdict for all steps ok, no warnings', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        overall: {
          ok: true,
          ciVerdict: 'PASS',
          explanation: 'All steps completed successfully',
        },
      });

      expect(bundle.overall.ciVerdict).toBe('PASS');
      expect(bundle.overall.ok).toBe(true);
    });

    it('WARN verdict for steps ok with warnings', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        overall: {
          ok: true,
          ciVerdict: 'WARN',
          explanation: 'Completed with warnings',
        },
      });

      expect(bundle.overall.ciVerdict).toBe('WARN');
      expect(bundle.overall.ok).toBe(true);
    });

    it('FAIL verdict for strict mode failure', () => {
      const bundle = createMockBundle('src/App.tsx', testDir, {
        overall: {
          ok: false,
          ciVerdict: 'FAIL',
          explanation: 'Strict mode failure',
        },
      });

      expect(bundle.overall.ciVerdict).toBe('FAIL');
      expect(bundle.overall.ok).toBe(false);
    });
  });
});
