/**
 * @aesthetic-function/watcher - figmaApply/__tests__/artifact.test.ts
 *
 * Unit tests for Phase 11C artifact generation and repo root detection.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  getRepoRoot,
  generateArtifactName,
  getArtifactPath,
  buildApplyArtifact,
  DEFAULT_ARTIFACT_DIR,
} from '../artifact.js';
import type { ApplyOutput } from '../types.js';
import { DEFAULT_APPLY_CONFIG } from '../config.js';

// =============================================================================
// REPO ROOT DETECTION
// =============================================================================

describe('getRepoRoot', () => {
  it('finds repo root from current directory', () => {
    const repoRoot = getRepoRoot();

    // Should find the actual repo root
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('finds repo root from nested directory (packages/watcher)', () => {
    // Start from packages/watcher directory
    const startDir = resolve(__dirname, '..', '..', '..');
    const repoRoot = getRepoRoot(startDir);

    // Should find the same repo root
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('finds repo root from deeply nested directory', () => {
    // Start from this test file's directory
    const startDir = __dirname;
    const repoRoot = getRepoRoot(startDir);

    // Should find the repo root
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('returns same root regardless of starting directory', () => {
    // From repo root
    const fromRepoRoot = getRepoRoot(resolve(__dirname, '..', '..', '..', '..', '..'));
    // From packages/watcher/src/figmaApply/__tests__
    const fromTests = getRepoRoot(__dirname);
    // From packages/watcher
    const fromWatcher = getRepoRoot(resolve(__dirname, '..', '..', '..'));

    expect(fromRepoRoot).toBe(fromTests);
    expect(fromRepoRoot).toBe(fromWatcher);
  });

  it('falls back to cwd when no markers found', () => {
    // Mock a directory that won't have markers
    // This is a fallback test - in practice we always find markers
    const fallback = getRepoRoot('/');

    // Falls back to process.cwd()
    expect(fallback).toBe(process.cwd());
  });
});

// =============================================================================
// ARTIFACT NAMING
// =============================================================================

describe('generateArtifactName', () => {
  it('handles simple file path', () => {
    const result = generateArtifactName('App.tsx');
    expect(result).toBe('App.figma-apply.json');
  });

  it('handles nested path with slashes', () => {
    const result = generateArtifactName('demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App.figma-apply.json');
  });

  it('removes leading slashes', () => {
    const result = generateArtifactName('/demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App.figma-apply.json');
  });

  it('removes leading ./', () => {
    const result = generateArtifactName('./demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App.figma-apply.json');
  });

  it('handles .jsx extension', () => {
    const result = generateArtifactName('components/Button.jsx');
    expect(result).toBe('components__Button.figma-apply.json');
  });

  it('handles .ts extension', () => {
    const result = generateArtifactName('utils/helpers.ts');
    expect(result).toBe('utils__helpers.figma-apply.json');
  });

  it('handles .js extension', () => {
    const result = generateArtifactName('lib/utils.js');
    expect(result).toBe('lib__utils.figma-apply.json');
  });
});

// =============================================================================
// ARTIFACT PATH
// =============================================================================

describe('getArtifactPath', () => {
  it('resolves to repo-root/design-materializations/', () => {
    const path = getArtifactPath('demo-app/src/App.tsx');
    const repoRoot = getRepoRoot();

    // Should be under repo root
    expect(path).toContain(repoRoot);
    expect(path).toContain(DEFAULT_ARTIFACT_DIR);
    expect(path).toContain('demo-app__src__App.figma-apply.json');
  });

  it('returns absolute path', () => {
    const path = getArtifactPath('App.tsx');

    // Should be absolute
    expect(path.startsWith('/')).toBe(true);
  });

  it('uses provided repoRoot override', () => {
    const customRoot = '/custom/root';
    const path = getArtifactPath('App.tsx', customRoot);

    expect(path).toBe('/custom/root/design-materializations/App.figma-apply.json');
  });

  it('returns same path from different working directories', () => {
    // Get path from current location
    const path1 = getArtifactPath('demo-app/src/App.tsx');

    // Get path with explicit repo root (same as auto-detected)
    const repoRoot = getRepoRoot();
    const path2 = getArtifactPath('demo-app/src/App.tsx', repoRoot);

    expect(path1).toBe(path2);
  });
});

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

describe('buildApplyArtifact', () => {
  const mockOutput: ApplyOutput = {
    operations: [
      {
        opId: 'apply-abc123',
        nodeId: 'CS:btn-123',
        componentKey: 'Button',
        property: 'fill',
        to: '#3498db',
        canonicalSource: 'color.primary.500',
        confidence: 'high',
        source: 'canonical-resolution',
        reason: 'Apply resolved color',
      },
    ],
    violations: [
      {
        type: 'property-not-allowed',
        componentKey: 'Card',
        property: 'padding',
        message: 'Spacing not allowed',
      },
    ],
    summary: {
      totalOperations: 1,
      byProperty: { fill: 1 },
      totalViolations: 1,
      byViolationType: { 'property-not-allowed': 1 },
    },
  };

  it('builds artifact with correct structure', () => {
    const artifact = buildApplyArtifact('demo-app/src/App.tsx', mockOutput, DEFAULT_APPLY_CONFIG);

    expect(artifact.version).toBe('1.0');
    expect(artifact.sourceFile).toBe('demo-app/src/App.tsx');
    expect(artifact.mode).toBe('artifact');
    expect(artifact.dryRun).toBe(true);
    expect(artifact.operations).toHaveLength(1);
    expect(artifact.violations).toHaveLength(1);
    expect(artifact.timestamp).toBeDefined();
    expect(artifact.results).toBeUndefined();
  });

  it('includes results when provided', () => {
    const results = [
      { opId: 'apply-abc123', success: true, nodeId: 'CS:btn-123', property: 'fill' as const },
    ];
    const artifact = buildApplyArtifact('App.tsx', mockOutput, DEFAULT_APPLY_CONFIG, results);

    expect(artifact.results).toHaveLength(1);
    expect(artifact.results?.[0].success).toBe(true);
  });

  it('preserves config settings', () => {
    const config = { ...DEFAULT_APPLY_CONFIG, mode: 'apply' as const, dryRun: false };
    const artifact = buildApplyArtifact('App.tsx', mockOutput, config);

    expect(artifact.mode).toBe('apply');
    expect(artifact.dryRun).toBe(false);
  });

  it('generates valid timestamp', () => {
    const artifact = buildApplyArtifact('App.tsx', mockOutput, DEFAULT_APPLY_CONFIG);

    // Should be valid ISO date
    const date = new Date(artifact.timestamp);
    expect(date.toISOString()).toBe(artifact.timestamp);
  });
});
