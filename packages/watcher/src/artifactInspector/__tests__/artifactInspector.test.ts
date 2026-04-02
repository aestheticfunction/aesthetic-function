/**
 * @aesthetic-function/watcher - artifactInspector/__tests__/artifactInspector.test.ts
 *
 * Phase 15D: Tests for Artifact Inspector module.
 *
 * Tests: detectArtifactType, inspectArtifact highlight extraction,
 * listArtifacts with real temp directory, formatArtifactList, traceArtifacts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { detectArtifactType, inspectArtifact } from '../inspect.js';
import { listArtifacts, formatArtifactList } from '../list.js';
import { traceArtifacts, formatTrace } from '../trace.js';
import {
  ARTIFACT_SUFFIX_MAP,
  ARTIFACT_PHASE_MAP,
  ARTIFACT_DISPLAY_NAMES,
} from '../types.js';
import type { ExtendedArtifactType } from '../types.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestDir(): string {
  const testDir = join(
    tmpdir(),
    `figma-artifact-inspector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  // pnpm-workspace.yaml is required for getRepoRoot detection
  writeFileSync(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  mkdirSync(join(testDir, 'design-materializations'), { recursive: true });
  return testDir;
}

function cleanupTestDir(testDir: string): void {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function writeArtifact(testDir: string, filename: string, data: Record<string, unknown>): string {
  const filePath = join(testDir, 'design-materializations', filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// =============================================================================
// detectArtifactType
// =============================================================================

describe('detectArtifactType', () => {
  it('detects all 12 artifact types from filename', () => {
    const expected: Record<string, ExtendedArtifactType> = {
      'demo-app__src__App.figma-delta.json': 'delta',
      'demo-app__src__App.figma-delta-suggestions.json': 'deltaSuggestions',
      'demo-app__src__App.figma-conflicts.json': 'conflicts',
      'demo-app__src__App.figma-resolution-plan.json': 'resolutionPlan',
      'demo-app__src__App.figma-resolution-apply.json': 'resolutionApply',
      'demo-app__src__App.figma-verification.json': 'verification',
      'demo-app__src__App.figma-rollback-preview.json': 'rollbackPreview',
      'demo-app__src__App.figma-reconciliation-status.json': 'status',
      'demo-app__src__App.figma-drift-diff.json': 'driftDiff',
      'demo-app__src__App.figma-drift-dashboard.json': 'driftDashboard',
      'demo-app__src__App.figma-run-ledger.json': 'runLedger',
      'demo-app__src__App.figma-reconcile.json': 'reconcileBundle',
    };

    for (const [filename, expectedType] of Object.entries(expected)) {
      const result = detectArtifactType(filename);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(expectedType);
      expect(result!.phase).toBe(ARTIFACT_PHASE_MAP[expectedType]);
      expect(result!.displayName).toBe(ARTIFACT_DISPLAY_NAMES[expectedType]);
    }
  });

  it('returns null for unrecognized filenames', () => {
    expect(detectArtifactType('random-file.json')).toBeNull();
    expect(detectArtifactType('App.tsx')).toBeNull();
    expect(detectArtifactType('')).toBeNull();
  });
});

// =============================================================================
// inspectArtifact — highlight extraction
// =============================================================================

describe('inspectArtifact', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('extracts status highlights', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-reconciliation-status.json', {
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: new Date().toISOString(),
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('status');
    expect(result.highlights.length).toBeGreaterThanOrEqual(2);
    expect(result.highlights.find((h) => h.label === 'Status')?.level).toBe('ok');
    expect(result.highlights.find((h) => h.label === 'CI Verdict')?.level).toBe('ok');
  });

  it('extracts verification highlights with mismatches', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-verification.json', {
      items: [
        { result: 'pass' },
        { result: 'pass' },
        { result: 'mismatch' },
        { result: 'missing' },
      ],
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('verification');
    expect(result.highlights.find((h) => h.label === 'Passed')?.detail).toBe('2');
    expect(result.highlights.find((h) => h.label === 'Mismatches')?.level).toBe('fail');
    expect(result.highlights.find((h) => h.label === 'Missing')?.level).toBe('fail');
  });

  it('extracts conflicts highlights with blocked items', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-conflicts.json', {
      conflicts: [
        { action: 'BLOCK' },
        { action: 'WARN' },
        { action: 'BLOCK' },
      ],
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('conflicts');
    expect(result.highlights.find((h) => h.label === 'Total Conflicts')?.detail).toBe('3');
    expect(result.highlights.find((h) => h.label === 'Blocked')?.detail).toBe('2');
  });

  it('extracts delta highlights', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-delta.json', {
      deltas: [{ field: 'color' }, { field: 'text' }],
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('delta');
    expect(result.highlights.find((h) => h.label === 'Total Deltas')?.detail).toBe('2');
  });

  it('extracts reconcile bundle highlights with profile', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-reconcile.json', {
      profile: 'strict',
      mode: 'full',
      overall: { ciVerdict: 'PASS' },
      steps: { delta: { ok: true }, verify: { ok: false } },
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('reconcileBundle');
    expect(result.highlights.find((h) => h.label === 'Profile')?.detail).toBe('strict');
    expect(result.highlights.find((h) => h.label === 'Verdict')?.level).toBe('ok');
    expect(result.highlights.find((h) => h.label === 'Step Failed: verify')).toBeDefined();
  });

  it('extracts drift diff highlights', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-drift-diff.json', {
      summary: { totalChanges: 3, failCount: 1, warnCount: 1 },
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('driftDiff');
    expect(result.highlights.find((h) => h.label === 'Total Changes')?.detail).toBe('3');
    expect(result.highlights.find((h) => h.label === 'Fail-Level')?.level).toBe('fail');
  });

  it('extracts run ledger highlights', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-run-ledger.json', {
      runs: [
        { command: 'reconcile', timestamp: '2024-01-01T00:00:00Z' },
        { command: 'verify', timestamp: '2024-01-02T00:00:00Z' },
      ],
    });

    const result = inspectArtifact(path);
    expect(result.artifact?.type).toBe('runLedger');
    expect(result.highlights.find((h) => h.label === 'Total Runs')?.detail).toBe('2');
  });

  it('produces formatted output', () => {
    const path = writeArtifact(testDir, 'demo__App.figma-reconciliation-status.json', {
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const result = inspectArtifact(path);
    expect(result.formatted).toContain('Reconciliation Status');
    expect(result.formatted).toContain('Phase 12J');
    expect(result.formatted).toContain('Highlights:');
  });
});

// =============================================================================
// listArtifacts
// =============================================================================

describe('listArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    // Create a source file that matches artifact naming
    mkdirSync(join(testDir, 'demo-app', 'src'), { recursive: true });
    writeFileSync(join(testDir, 'demo-app', 'src', 'App.tsx'), 'export default function App() {}');
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('returns all 12 types with found=false when no artifacts exist', async () => {
    const result = await listArtifacts('demo-app/src/App.tsx', testDir);

    expect(result.sourceFile).toBe('demo-app/src/App.tsx');
    expect(result.repoRoot).toBe(testDir);
    expect(result.totalCount).toBe(12);
    expect(result.foundCount).toBe(0);
    expect(result.artifacts.length).toBe(12);

    for (const entry of result.artifacts) {
      expect(entry.found).toBe(false);
    }
  });

  it('detects existing run-index artifacts', async () => {
    // Write a status artifact
    writeArtifact(testDir, 'demo-app__src__App.figma-reconciliation-status.json', {
      version: '1.0.0',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    // Write a delta artifact
    writeArtifact(testDir, 'demo-app__src__App.figma-delta.json', {
      version: '1.0.0',
      deltas: [{ field: 'color' }],
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    const result = await listArtifacts('demo-app/src/App.tsx', testDir);
    expect(result.foundCount).toBeGreaterThanOrEqual(2);

    const status = result.artifacts.find((a) => a.type === 'status');
    expect(status?.found).toBe(true);
    expect(status?.path).toContain('figma-reconciliation-status');

    const delta = result.artifacts.find((a) => a.type === 'delta');
    expect(delta?.found).toBe(true);
  });

  it('detects run ledger and reconcile bundle', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-run-ledger.json', {
      runs: [{ command: 'reconcile', timestamp: '2024-01-01T00:00:00Z' }],
    });
    writeArtifact(testDir, 'demo-app__src__App.figma-reconcile.json', {
      profile: 'default',
      overall: { ciVerdict: 'PASS' },
    });

    const result = await listArtifacts('demo-app/src/App.tsx', testDir);

    const ledger = result.artifacts.find((a) => a.type === 'runLedger');
    expect(ledger?.found).toBe(true);
    expect(ledger?.summary).toContain('1 run');

    const bundle = result.artifacts.find((a) => a.type === 'reconcileBundle');
    expect(bundle?.found).toBe(true);
  });

  it('formats list output with human-readable table', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-reconciliation-status.json', {
      version: '1.0.0',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    const result = await listArtifacts('demo-app/src/App.tsx', testDir);
    const output = formatArtifactList(result);

    expect(output).toContain('Artifact List');
    expect(output).toContain('demo-app/src/App.tsx');
    expect(output).toContain('Reconciliation Status');
  });
});

// =============================================================================
// traceArtifacts
// =============================================================================

describe('traceArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    mkdirSync(join(testDir, 'demo-app', 'src'), { recursive: true });
    writeFileSync(join(testDir, 'demo-app', 'src', 'App.tsx'), 'export default function App() {}');
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('produces trace with all 12 lifecycle steps', async () => {
    const result = await traceArtifacts('demo-app/src/App.tsx', testDir);

    expect(result.sourceFile).toBe('demo-app/src/App.tsx');
    expect(result.steps.length).toBe(12);
    expect(result.summary.total).toBe(12);
    expect(result.summary.found).toBe(0);
    expect(result.summary.missing).toBe(12);
  });

  it('extracts profile and verdict from bundle', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-reconcile.json', {
      profile: 'strict',
      overall: { ciVerdict: 'PASS' },
    });

    const result = await traceArtifacts('demo-app/src/App.tsx', testDir);
    expect(result.profile).toBe('strict');
    expect(result.verdict).toBe('PASS');
  });

  it('falls back to status artifact for verdict', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-reconciliation-status.json', {
      version: '1.0.0',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'FAIL',
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    const result = await traceArtifacts('demo-app/src/App.tsx', testDir);
    expect(result.verdict).toBe('FAIL');
  });

  it('aggregates highlight counts in summary', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-reconciliation-status.json', {
      version: '1.0.0',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });
    writeArtifact(testDir, 'demo-app__src__App.figma-verification.json', {
      version: '1.0.0',
      items: [{ result: 'pass' }, { result: 'mismatch' }],
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    const result = await traceArtifacts('demo-app/src/App.tsx', testDir);
    expect(result.summary.highlights.ok).toBeGreaterThan(0);
    expect(result.summary.highlights.fail).toBeGreaterThan(0);
  });

  it('formats trace output with lifecycle view', async () => {
    writeArtifact(testDir, 'demo-app__src__App.figma-reconciliation-status.json', {
      version: '1.0.0',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      timestamp: '2024-01-01T00:00:00Z',
      sourceFile: 'demo-app/src/App.tsx',
    });

    const result = await traceArtifacts('demo-app/src/App.tsx', testDir);
    const output = formatTrace(result);

    expect(output).toContain('Reconciliation Trace');
    expect(output).toContain('Lifecycle:');
    expect(output).toContain('Highlight Summary');
    expect(output).toContain('●'); // Found step
    expect(output).toContain('○'); // Missing step
  });
});

// =============================================================================
// ARTIFACT_SUFFIX_MAP completeness
// =============================================================================

describe('type constants', () => {
  it('ARTIFACT_SUFFIX_MAP covers all ExtendedArtifactType values', () => {
    const types: ExtendedArtifactType[] = [
      'delta', 'deltaSuggestions', 'conflicts', 'resolutionPlan',
      'resolutionApply', 'verification', 'rollbackPreview', 'status',
      'driftDiff', 'driftDashboard', 'runLedger', 'reconcileBundle',
    ];
    for (const t of types) {
      expect(ARTIFACT_SUFFIX_MAP[t]).toBeDefined();
      expect(ARTIFACT_PHASE_MAP[t]).toBeDefined();
      expect(ARTIFACT_DISPLAY_NAMES[t]).toBeDefined();
    }
  });

  it('all suffixes start with .figma- and end with .json', () => {
    for (const suffix of Object.values(ARTIFACT_SUFFIX_MAP)) {
      expect(suffix).toMatch(/^\.figma-.*\.json$/);
    }
  });
});
