/**
 * @aesthetic-function/cli - __tests__/delegate.test.ts
 *
 * Phase 15C: Tests for CLI delegation infrastructure.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { findRepoRoot, checkDelegationPrereqs } from '../delegate.js';

// =============================================================================
// findRepoRoot
// =============================================================================

describe('findRepoRoot', () => {
  it('finds repo root from cwd', () => {
    const root = findRepoRoot();
    // Should find the aesthetic-function repo root
    expect(root).toContain('aesthetic-function');
  });

  it('root contains pnpm-workspace.yaml', () => {
    const root = findRepoRoot();
    expect(existsSync(join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });
});

// =============================================================================
// checkDelegationPrereqs
// =============================================================================

describe('checkDelegationPrereqs', () => {
  it('passes for actual repo root', () => {
    const root = findRepoRoot();
    const error = checkDelegationPrereqs(root);
    expect(error).toBeNull();
  });

  it('fails for non-monorepo directory', () => {
    const error = checkDelegationPrereqs('/tmp');
    expect(error).toBeTruthy();
    expect(error).toContain('Watcher source not found');
  });

  it('verifies watcher source dir exists', () => {
    const root = findRepoRoot();
    const watcherSrc = join(root, 'packages', 'watcher', 'src');
    expect(existsSync(watcherSrc)).toBe(true);
  });
});
