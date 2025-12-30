/**
 * @aesthetic-function/watcher - reconciliationIndex/__tests__/reconciliationIndex.test.ts
 *
 * Phase 13A: Reconciliation Run Index Tests.
 *
 * Tests fixture-based, no demo-app dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  computeRunIndex,
  computeRunIndexSimple,
  getRepoRoot,
  normalizeSourcePath,
} from '../compute.js';
import {
  getRunIndexArtifactPath,
  formatRunIndex,
} from '../artifact.js';
import type { RunIndexArtifact, RunIndexContext } from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a temporary test directory with optional artifacts.
 */
function createTestDir(): string {
  const testDir = join(tmpdir(), `figma-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// =============================================================================
// PATH NORMALIZATION TESTS
// =============================================================================

describe('normalizeSourcePath', () => {
  it('should pass through simple relative paths unchanged', () => {
    const result = normalizeSourcePath('demo-app/src/App.tsx', '/repo');
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('should normalize windows-style backslashes', () => {
    const result = normalizeSourcePath('demo-app\\src\\App.tsx', '/repo');
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('should strip leading ./', () => {
    const result = normalizeSourcePath('./demo-app/src/App.tsx', '/repo');
    expect(result).toBe('demo-app/src/App.tsx');
  });
});

// =============================================================================
// ARTIFACT PATH TESTS
// =============================================================================

describe('getRunIndexArtifactPath', () => {
  it('should generate correct artifact path for simple source file', () => {
    const path = getRunIndexArtifactPath('demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.figma-run-index.json');
  });

  it('should handle nested paths', () => {
    const path = getRunIndexArtifactPath('packages/watcher/src/index.ts');
    expect(path).toBe('design-materializations/packages__watcher__src__index.figma-run-index.json');
  });
});

// =============================================================================
// RUN INDEX COMPUTATION TESTS
// =============================================================================

describe('computeRunIndex', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return all artifacts as not found when directory is empty', async () => {
    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.version).toBe('1.0');
    expect(result.index.sourceFile).toBe('demo-app/src/App.tsx');
    expect(result.index.repoRoot).toBe(testDir);
    expect(result.index.artifacts.delta.found).toBe(false);
    expect(result.index.artifacts.conflicts.found).toBe(false);
    expect(result.index.artifacts.resolutionPlan.found).toBe(false);
    expect(result.index.artifacts.resolutionApply.found).toBe(false);
    expect(result.index.artifacts.verification.found).toBe(false);
    expect(result.index.artifacts.rollbackPreview.found).toBe(false);
    expect(result.index.artifacts.status.found).toBe(false);
  });

  it('should find conflicts artifact and extract summary', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-conflicts', {
      version: '1.0',
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: {
        total: 3,
        blocked: 1,
      },
      conflicts: [{}, {}, {}],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.conflicts.found).toBe(true);
    if (result.index.artifacts.conflicts.found) {
      expect(result.index.artifacts.conflicts.timestamp).toBe('2025-12-30T10:00:00.000Z');
      expect(result.index.artifacts.conflicts.summary).toEqual({
        conflicts: 3,
        blocked: 1,
      });
    }
  });

  it('should find resolution plan artifact and extract summary', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-resolution-plan', {
      version: '1.0',
      generatedAt: '2025-12-30T11:00:00.000Z',
      decisions: [
        { action: 'APPLY_TO_AST' },
        { action: 'APPLY_TO_OVERRIDE' },
        { action: 'IGNORE' },
      ],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.resolutionPlan.found).toBe(true);
    if (result.index.artifacts.resolutionPlan.found) {
      expect(result.index.artifacts.resolutionPlan.summary).toEqual({
        decisions: 3,
      });
    }
  });

  it('should find resolution apply artifact and extract dry-run status', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-resolution-apply', {
      version: '1.0',
      generatedAt: '2025-12-30T12:00:00.000Z',
      dryRun: true,
      summary: {
        decisionsTotal: 5,
        applied: 2,
        skipped: 2,
        failed: 1,
      },
      results: [{}, {}, {}, {}, {}],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.resolutionApply.found).toBe(true);
    if (result.index.artifacts.resolutionApply.found) {
      expect(result.index.artifacts.resolutionApply.summary).toEqual({
        ops: 5,
        dryRun: true,
        applied: 2,
        skipped: 2,
        failed: 1,
      });
    }
  });

  it('should find verification artifact and extract summary', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-verification', {
      version: '1.0',
      generatedAt: '2025-12-30T13:00:00.000Z',
      summary: {
        verified: 10,
        mismatch: 2,
        missing: 1,
        skipped: 3,
      },
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.verification.found).toBe(true);
    if (result.index.artifacts.verification.found) {
      expect(result.index.artifacts.verification.summary).toEqual({
        verified: 10,
        mismatch: 2,
        missing: 1,
      });
    }
  });

  it('should find rollback preview artifact and extract summary', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-rollback-preview', {
      version: '1.0',
      timestamp: '2025-12-30T14:00:00.000Z',
      actions: [{}, {}, {}],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.rollbackPreview.found).toBe(true);
    if (result.index.artifacts.rollbackPreview.found) {
      expect(result.index.artifacts.rollbackPreview.summary).toEqual({
        actions: 3,
      });
    }
  });

  it('should find status artifact and extract summary', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-reconciliation-status', {
      version: '1.0',
      timestamp: '2025-12-30T15:00:00.000Z',
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.status.found).toBe(true);
    if (result.index.artifacts.status.found) {
      expect(result.index.artifacts.status.summary).toEqual({
        overallStatus: 'VERIFIED_OK',
        ciVerdict: 'PASS',
      });
    }
  });

  it('should find multiple artifacts', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-conflicts', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: { total: 2, blocked: 0 },
    });
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-resolution-plan', {
      generatedAt: '2025-12-30T11:00:00.000Z',
      decisions: [{}],
    });
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-resolution-apply', {
      generatedAt: '2025-12-30T12:00:00.000Z',
      dryRun: false,
      summary: { decisionsTotal: 1, applied: 1, skipped: 0, failed: 0 },
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.conflicts.found).toBe(true);
    expect(result.index.artifacts.resolutionPlan.found).toBe(true);
    expect(result.index.artifacts.resolutionApply.found).toBe(true);
    expect(result.index.artifacts.verification.found).toBe(false);
  });
});

// =============================================================================
// LEGACY NAME SUPPORT TESTS
// =============================================================================

describe('legacy artifact name support', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should find legacy .figma-resolve-apply.json artifact', async () => {
    // Write with legacy name
    const normalized = 'demo-app/src/App.tsx'.replace(/\//g, '__').replace(/\.(tsx?|jsx?)$/, '');
    const legacyPath = join(testDir, 'design-materializations', `${normalized}.figma-resolve-apply.json`);
    writeFileSync(legacyPath, JSON.stringify({
      generatedAt: '2025-12-30T10:00:00.000Z',
      dryRun: true,
      summary: { decisionsTotal: 2, applied: 0, skipped: 2, failed: 0 },
    }));

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.resolutionApply.found).toBe(true);
  });
});

// =============================================================================
// DETERMINISTIC OUTPUT TESTS
// =============================================================================

describe('deterministic output', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should produce same output for same input', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-conflicts', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: { total: 1, blocked: 0 },
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result1 = await computeRunIndex(context);
    const result2 = await computeRunIndex(context);

    // Compare without generatedAt (which is computed fresh each time)
    const index1 = { ...result1.index, generatedAt: 'STABLE' };
    const index2 = { ...result2.index, generatedAt: 'STABLE' };

    expect(JSON.stringify(index1)).toBe(JSON.stringify(index2));
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

  it('should normalize different source path formats to same canonical form', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-conflicts', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: { total: 1, blocked: 0 },
    });

    // Simulate different input paths
    const paths = [
      'demo-app/src/App.tsx',
      './demo-app/src/App.tsx',
    ];

    const results = await Promise.all(
      paths.map((path) =>
        computeRunIndex({
          sourceFile: path,
          repoRoot: testDir,
        })
      )
    );

    // All should produce the same canonical source file
    const canonicalPaths = results.map((r) => r.index.sourceFile);
    expect(new Set(canonicalPaths).size).toBe(1);

    // All should find the same artifacts
    expect(results.every((r) => r.index.artifacts.conflicts.found)).toBe(true);
  });
});

// =============================================================================
// FORMATTING TESTS
// =============================================================================

describe('formatRunIndex', () => {
  it('should format empty index correctly', () => {
    const index: RunIndexArtifact = {
      version: '1.0',
      repoRoot: '/repo',
      sourceFile: 'demo-app/src/App.tsx',
      generatedAt: '2025-12-30T10:00:00.000Z',
      artifacts: {
        delta: { found: false },
        deltaSuggestions: { found: false },
        conflicts: { found: false },
        resolutionPlan: { found: false },
        resolutionApply: { found: false },
        verification: { found: false },
        rollbackPreview: { found: false },
        status: { found: false },
      },
      notes: [],
    };

    const output = formatRunIndex(index);

    expect(output).toContain('=== FIGMA RUN INDEX (Phase 13A) ===');
    expect(output).toContain('Repo Root: /repo');
    expect(output).toContain('Source: demo-app/src/App.tsx (canonical)');
    expect(output).toContain('✗ delta');
    expect(output).toContain('✗ conflicts');
    expect(output).toContain('Notes: none');
  });

  it('should format found artifacts with summaries', () => {
    const index: RunIndexArtifact = {
      version: '1.0',
      repoRoot: '/repo',
      sourceFile: 'demo-app/src/App.tsx',
      generatedAt: '2025-12-30T10:00:00.000Z',
      artifacts: {
        delta: { found: false },
        deltaSuggestions: { found: false },
        conflicts: {
          found: true,
          path: 'design-materializations/demo-app__src__App.figma-conflicts.json',
          timestamp: '2025-12-30T10:00:00.000Z',
          summary: { conflicts: 3, blocked: 1 },
        },
        resolutionPlan: {
          found: true,
          path: 'design-materializations/demo-app__src__App.figma-resolution-plan.json',
          timestamp: '2025-12-30T11:00:00.000Z',
          summary: { decisions: 2 },
        },
        resolutionApply: { found: false },
        verification: { found: false },
        rollbackPreview: { found: false },
        status: { found: false },
      },
      notes: [],
    };

    const output = formatRunIndex(index);

    expect(output).toContain('✓ conflicts (3 conflicts, 1 blocked)');
    expect(output).toContain('✓ resolution-plan (2 decisions)');
    expect(output).toContain('✗ delta');
    expect(output).toContain('✗ verification');
  });

  it('should format notes', () => {
    const index: RunIndexArtifact = {
      version: '1.0',
      repoRoot: '/repo',
      sourceFile: 'demo-app/src/App.tsx',
      generatedAt: '2025-12-30T10:00:00.000Z',
      artifacts: {
        delta: { found: false },
        deltaSuggestions: { found: false },
        conflicts: { found: false },
        resolutionPlan: { found: false },
        resolutionApply: { found: false },
        verification: { found: false },
        rollbackPreview: { found: false },
        status: { found: false },
      },
      notes: [
        { level: 'warn', message: 'Multiple apply artifacts found; chose newest by timestamp.' },
      ],
    };

    const output = formatRunIndex(index);

    expect(output).toContain('Notes:');
    expect(output).toContain('⚠️ Multiple apply artifacts found');
  });
});

// =============================================================================
// SIMPLE API TESTS
// =============================================================================

describe('computeRunIndexSimple', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return just the index without discovery details', async () => {
    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const index = await computeRunIndexSimple(context);

    expect(index.version).toBe('1.0');
    expect(index.sourceFile).toBe('demo-app/src/App.tsx');
    expect(index.artifacts).toBeDefined();
    expect(index.notes).toBeDefined();
  });
});

// =============================================================================
// DELTA ARTIFACT TESTS
// =============================================================================

describe('delta artifact support', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should find delta artifact and extract summary from deltas array', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-delta', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      deltas: [{}, {}],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.delta.found).toBe(true);
    if (result.index.artifacts.delta.found) {
      expect(result.index.artifacts.delta.summary).toEqual({
        deltas: 2,
      });
    }
  });

  it('should find delta artifact and extract summary from summary.total', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-delta', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      summary: { total: 5 },
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.delta.found).toBe(true);
    if (result.index.artifacts.delta.found) {
      expect(result.index.artifacts.delta.summary).toEqual({
        deltas: 5,
      });
    }
  });
});

// =============================================================================
// DELTA SUGGESTIONS ARTIFACT TESTS
// =============================================================================

describe('delta suggestions artifact support', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should find delta suggestions artifact', async () => {
    writeArtifact(testDir, 'demo-app/src/App.tsx', 'figma-delta-suggestions', {
      generatedAt: '2025-12-30T10:00:00.000Z',
      suggestions: [{}, {}, {}],
    });

    const context: RunIndexContext = {
      sourceFile: 'demo-app/src/App.tsx',
      repoRoot: testDir,
    };

    const result = await computeRunIndex(context);

    expect(result.index.artifacts.deltaSuggestions.found).toBe(true);
    if (result.index.artifacts.deltaSuggestions.found) {
      expect(result.index.artifacts.deltaSuggestions.summary).toEqual({
        suggestions: 3,
      });
    }
  });
});
