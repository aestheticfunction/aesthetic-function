/**
 * @aesthetic-function/watcher - reconciliationStatus/__tests__/reconciliationStatus.test.ts
 *
 * Phase 12J: Unit tests for reconciliation status computation.
 *
 * Tests verify:
 * 1. No artifacts → CLEAN status
 * 2. Apply only, no verify → APPLIED_UNVERIFIED
 * 3. Apply + verify success → VERIFIED_OK
 * 4. Verify failed + rollback preview → ROLLBACK_AVAILABLE
 * 5. Verify failed, no rollback → VERIFY_FAILED
 * 6. Dry-run apply → CLEAN
 * 7. Deterministic output ordering
 * 8. Exit codes (PASS/WARN → 0, FAIL → 1)
 * 9. Artifact formatting
 * 10. Legacy artifact path fallback (Phase 12J.1)
 * 11. Repo-root detection (Phase 12J.1)
 *
 * NO demo-app reads. Fixtures only.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  computeReconciliationStatus,
  getStatusExitCode,
  shouldWriteStatusArtifact,
  getDefaultApplyArtifactPath,
  getLegacyApplyArtifactPath,
  getDefaultVerificationArtifactPath,
  getDefaultRollbackPreviewArtifactPath,
  getRepoRoot,
  normalizeSourcePath,
} from '../compute.js';
import {
  getStatusArtifactPath,
  formatReconciliationStatus,
} from '../artifact.js';
import type {
  LoadedArtifacts,
  LoadedApplyData,
  LoadedVerifyData,
  LoadedRollbackPreviewData,
  ReconciliationStatus,
} from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Create empty artifacts (no reconciliation data).
 */
function createEmptyArtifacts(): LoadedArtifacts {
  return {
    apply: { found: false },
    verify: { found: false },
    rollbackPreview: { found: false },
  };
}

/**
 * Create mock apply artifact data.
 */
function createApplyData(overrides: Partial<LoadedApplyData> = {}): LoadedApplyData {
  return {
    found: true,
    path: 'design-materializations/src__App.figma-resolve-apply.json',
    mode: 'unified',
    dryRun: false,
    operationCount: 5,
    successCount: 5,
    failedCount: 0,
    ...overrides,
  };
}

/**
 * Create mock verify artifact data.
 */
function createVerifyData(overrides: Partial<LoadedVerifyData> = {}): LoadedVerifyData {
  return {
    found: true,
    path: 'design-materializations/src__App.figma-verification.json',
    verifiedCount: 5,
    mismatchCount: 0,
    missingCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

/**
 * Create mock rollback preview artifact data.
 */
function createRollbackData(overrides: Partial<LoadedRollbackPreviewData> = {}): LoadedRollbackPreviewData {
  return {
    found: true,
    path: 'design-materializations/src__App.figma-rollback-preview.json',
    actionCount: 3,
    ...overrides,
  };
}

// =============================================================================
// PATH GENERATION TESTS
// =============================================================================

describe('artifact path generation', () => {
  it('generates correct default apply artifact path', () => {
    const path = getDefaultApplyArtifactPath('src/App.tsx');
    // Phase 12J.1: Changed to .figma-resolution-apply.json to match actual pipeline artifacts
    expect(path).toBe('design-materializations/src__App.figma-resolution-apply.json');
  });

  it('generates correct default verification artifact path', () => {
    const path = getDefaultVerificationArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-verification.json');
  });

  it('generates correct default rollback preview artifact path', () => {
    const path = getDefaultRollbackPreviewArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-rollback-preview.json');
  });

  it('generates correct status artifact path', () => {
    const path = getStatusArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-reconciliation-status.json');
  });

  it('handles nested paths correctly', () => {
    const path = getStatusArtifactPath('src/components/Button.tsx');
    expect(path).toBe('design-materializations/src__components__Button.figma-reconciliation-status.json');
  });
});

// =============================================================================
// CLEAN STATUS TESTS
// =============================================================================

describe('CLEAN status', () => {
  it('returns CLEAN when no artifacts exist', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('CLEAN');
    expect(status.ciVerdict).toBe('PASS');
    expect(status.explanation).toContain('No reconciliation artifacts');
  });

  it('returns CLEAN when apply was dry-run only', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: true }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('CLEAN');
    expect(status.ciVerdict).toBe('PASS');
    expect(status.explanation).toContain('dry-run');
  });

  it('does not write artifact for CLEAN status', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(shouldWriteStatusArtifact(status)).toBe(false);
  });

  it('returns exit code 0 for CLEAN status', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(getStatusExitCode(status)).toBe(0);
  });
});

// =============================================================================
// APPLIED_UNVERIFIED STATUS TESTS
// =============================================================================

describe('APPLIED_UNVERIFIED status', () => {
  it('returns APPLIED_UNVERIFIED when apply exists but no verify', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('APPLIED_UNVERIFIED');
    expect(status.ciVerdict).toBe('WARN');
    expect(status.explanation).toContain('verification has not been run');
  });

  it('writes artifact for APPLIED_UNVERIFIED status', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(shouldWriteStatusArtifact(status)).toBe(true);
  });

  it('returns exit code 0 for WARN verdict', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(getStatusExitCode(status)).toBe(0);
  });
});

// =============================================================================
// VERIFIED_OK STATUS TESTS
// =============================================================================

describe('VERIFIED_OK status', () => {
  it('returns VERIFIED_OK when apply + verify both succeed', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 0, missingCount: 0 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('VERIFIED_OK');
    expect(status.ciVerdict).toBe('PASS');
    expect(status.explanation).toContain('verification passed');
  });

  it('writes artifact for VERIFIED_OK status', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 0, missingCount: 0 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(shouldWriteStatusArtifact(status)).toBe(true);
  });

  it('returns exit code 0 for VERIFIED_OK', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 0, missingCount: 0 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(getStatusExitCode(status)).toBe(0);
  });
});

// =============================================================================
// VERIFY_FAILED STATUS TESTS
// =============================================================================

describe('VERIFY_FAILED status', () => {
  it('returns VERIFY_FAILED when verify fails and no rollback preview', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 3, missingCount: 1 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('VERIFY_FAILED');
    expect(status.ciVerdict).toBe('FAIL');
    expect(status.explanation).toContain('3 mismatches');
    expect(status.explanation).toContain('1 missing');
    expect(status.explanation).toContain('No rollback preview');
  });

  it('writes artifact for VERIFY_FAILED status', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(shouldWriteStatusArtifact(status)).toBe(true);
  });

  it('returns exit code 1 for FAIL verdict', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(getStatusExitCode(status)).toBe(1);
  });
});

// =============================================================================
// ROLLBACK_AVAILABLE STATUS TESTS
// =============================================================================

describe('ROLLBACK_AVAILABLE status', () => {
  it('returns ROLLBACK_AVAILABLE when verify fails and rollback preview exists', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 3, missingCount: 0 }),
      rollbackPreview: createRollbackData({ actionCount: 3 }),
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('ROLLBACK_AVAILABLE');
    expect(status.ciVerdict).toBe('FAIL');
    expect(status.explanation).toContain('3 mismatches');
    expect(status.explanation).toContain('Rollback preview available');
    expect(status.explanation).toContain('3 action(s)');
  });

  it('returns VERIFY_FAILED when rollback preview has zero actions', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2 }),
      rollbackPreview: createRollbackData({ actionCount: 0 }),
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('VERIFY_FAILED');
  });

  it('returns exit code 1 for ROLLBACK_AVAILABLE', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2 }),
      rollbackPreview: createRollbackData({ actionCount: 2 }),
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(getStatusExitCode(status)).toBe(1);
  });
});

// =============================================================================
// PHASE STATUS TESTS
// =============================================================================

describe('phase status computation', () => {
  it('includes apply phase status when apply exists', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ operationCount: 5, successCount: 5, failedCount: 0 }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.apply).toBeDefined();
    expect(status.phases.apply?.attempted).toBe(true);
    expect(status.phases.apply?.operationCount).toBe(5);
    expect(status.phases.apply?.success).toBe(true);
  });

  it('includes verify phase status when verify exists', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2, missingCount: 1 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.verify).toBeDefined();
    expect(status.phases.verify?.attempted).toBe(true);
    expect(status.phases.verify?.mismatchCount).toBe(2);
    expect(status.phases.verify?.missingCount).toBe(1);
    expect(status.phases.verify?.success).toBe(false);
  });

  it('includes rollback phase status when rollback preview exists', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 2 }),
      rollbackPreview: createRollbackData({ actionCount: 2 }),
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.rollbackPreview).toBeDefined();
    expect(status.phases.rollbackPreview?.available).toBe(true);
    expect(status.phases.rollbackPreview?.actionCount).toBe(2);
  });

  it('omits phase status when artifact not found', () => {
    const artifacts = createEmptyArtifacts();

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.apply).toBeUndefined();
    expect(status.phases.verify).toBeUndefined();
    expect(status.phases.rollbackPreview).toBeUndefined();
  });
});

// =============================================================================
// STATUS METADATA TESTS
// =============================================================================

describe('status metadata', () => {
  it('includes version in status', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.version).toBe('1.0');
  });

  it('includes source file in status', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/components/Button.tsx');

    expect(status.sourceFile).toBe('src/components/Button.tsx');
  });

  it('includes timestamp in status', () => {
    const artifacts = createEmptyArtifacts();
    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// =============================================================================
// EXIT CODE TESTS
// =============================================================================

describe('exit codes', () => {
  it('PASS verdict returns exit code 0', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      phases: {},
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      explanation: 'Clean',
    };

    expect(getStatusExitCode(status)).toBe(0);
  });

  it('WARN verdict returns exit code 0', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      phases: {},
      overallStatus: 'APPLIED_UNVERIFIED',
      ciVerdict: 'WARN',
      explanation: 'Not verified',
    };

    expect(getStatusExitCode(status)).toBe(0);
  });

  it('FAIL verdict returns exit code 1', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      phases: {},
      overallStatus: 'VERIFY_FAILED',
      ciVerdict: 'FAIL',
      explanation: 'Failed',
    };

    expect(getStatusExitCode(status)).toBe(1);
  });
});

// =============================================================================
// FORMATTING TESTS
// =============================================================================

describe('status formatting', () => {
  it('formats CLEAN status correctly', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: '2025-01-15T12:00:00.000Z',
      phases: {},
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      explanation: 'No reconciliation artifacts found. File is clean.',
    };

    const formatted = formatReconciliationStatus(status);

    expect(formatted).toContain('✅');
    expect(formatted).toContain('CLEAN');
    expect(formatted).toContain('src/App.tsx');
    expect(formatted).toContain('PASS');
    expect(formatted).toContain('Exit Code: 0');
  });

  it('formats VERIFIED_OK status correctly', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: '2025-01-15T12:00:00.000Z',
      phases: {
        apply: { attempted: true, dryRun: false, success: true, operationCount: 5 },
        verify: { attempted: true, success: true, mismatchCount: 0, missingCount: 0 },
      },
      overallStatus: 'VERIFIED_OK',
      ciVerdict: 'PASS',
      explanation: 'Apply succeeded and verification passed.',
    };

    const formatted = formatReconciliationStatus(status);

    expect(formatted).toContain('VERIFIED_OK');
    expect(formatted).toContain('Apply: ✓');
    expect(formatted).toContain('Verify: ✓');
    expect(formatted).toContain('PASS');
  });

  it('formats ROLLBACK_AVAILABLE status correctly', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: '2025-01-15T12:00:00.000Z',
      phases: {
        apply: { attempted: true, dryRun: false, success: true, operationCount: 5 },
        verify: { attempted: true, success: false, mismatchCount: 3, missingCount: 0 },
        rollbackPreview: { available: true, actionCount: 3 },
      },
      overallStatus: 'ROLLBACK_AVAILABLE',
      ciVerdict: 'FAIL',
      explanation: 'Verification failed. Rollback preview available.',
    };

    const formatted = formatReconciliationStatus(status);

    expect(formatted).toContain('❌');
    expect(formatted).toContain('ROLLBACK_AVAILABLE');
    expect(formatted).toContain('Verify: ✗');
    expect(formatted).toContain('Rollback Preview: 3 action(s)');
    expect(formatted).toContain('FAIL');
    expect(formatted).toContain('Exit Code: 1');
  });

  it('formats APPLIED_UNVERIFIED status correctly', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: '2025-01-15T12:00:00.000Z',
      phases: {
        apply: { attempted: true, dryRun: false, success: true, operationCount: 5 },
      },
      overallStatus: 'APPLIED_UNVERIFIED',
      ciVerdict: 'WARN',
      explanation: 'Apply was attempted but verification has not been run.',
    };

    const formatted = formatReconciliationStatus(status);

    expect(formatted).toContain('⚠️');
    expect(formatted).toContain('APPLIED_UNVERIFIED');
    expect(formatted).toContain('Verify: not attempted');
    expect(formatted).toContain('WARN');
  });

  it('shows dry-run indicator in apply phase', () => {
    const status: ReconciliationStatus = {
      version: '1.0',
      sourceFile: 'src/App.tsx',
      timestamp: '2025-01-15T12:00:00.000Z',
      phases: {
        apply: { attempted: true, dryRun: true, success: true, operationCount: 5 },
      },
      overallStatus: 'CLEAN',
      ciVerdict: 'PASS',
      explanation: 'Dry-run only.',
    };

    const formatted = formatReconciliationStatus(status);

    expect(formatted).toContain('(dry-run)');
  });
});

// =============================================================================
// DETERMINISTIC OUTPUT TESTS
// =============================================================================

describe('deterministic output', () => {
  it('produces same status for same inputs', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false, operationCount: 5 }),
      verify: createVerifyData({ mismatchCount: 2, missingCount: 1 }),
      rollbackPreview: createRollbackData({ actionCount: 3 }),
    };

    const status1 = computeReconciliationStatus(artifacts, 'src/App.tsx');
    const status2 = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status1.overallStatus).toBe(status2.overallStatus);
    expect(status1.ciVerdict).toBe(status2.ciVerdict);
    expect(status1.phases.apply).toEqual(status2.phases.apply);
    expect(status1.phases.verify).toEqual(status2.phases.verify);
    expect(status1.phases.rollbackPreview).toEqual(status2.phases.rollbackPreview);
  });

  it('status transitions are deterministic', () => {
    // CLEAN → APPLIED_UNVERIFIED → VERIFIED_OK progression
    const artifacts1: LoadedArtifacts = createEmptyArtifacts();
    const artifacts2: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };
    const artifacts3: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 0, missingCount: 0 }),
      rollbackPreview: { found: false },
    };

    const status1 = computeReconciliationStatus(artifacts1, 'src/App.tsx');
    const status2 = computeReconciliationStatus(artifacts2, 'src/App.tsx');
    const status3 = computeReconciliationStatus(artifacts3, 'src/App.tsx');

    expect(status1.overallStatus).toBe('CLEAN');
    expect(status2.overallStatus).toBe('APPLIED_UNVERIFIED');
    expect(status3.overallStatus).toBe('VERIFIED_OK');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('edge cases', () => {
  it('handles apply with all operations failed', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false, successCount: 0, failedCount: 5 }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.apply?.success).toBe(false);
  });

  it('handles verify with only missing (no mismatches)', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 0, missingCount: 5 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('VERIFY_FAILED');
    expect(status.phases.verify?.success).toBe(false);
  });

  it('handles verify with only mismatches (no missing)', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false }),
      verify: createVerifyData({ mismatchCount: 5, missingCount: 0 }),
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.overallStatus).toBe('VERIFY_FAILED');
    expect(status.phases.verify?.success).toBe(false);
  });

  it('handles zero operation count', () => {
    const artifacts: LoadedArtifacts = {
      apply: createApplyData({ dryRun: false, operationCount: 0 }),
      verify: { found: false },
      rollbackPreview: { found: false },
    };

    const status = computeReconciliationStatus(artifacts, 'src/App.tsx');

    expect(status.phases.apply?.operationCount).toBe(0);
  });
});

// =============================================================================
// PHASE 12J.1: LEGACY PATH AND REPO-ROOT TESTS
// =============================================================================

describe('legacy artifact path backward compatibility', () => {
  it('generates legacy apply artifact path', () => {
    const path = getLegacyApplyArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-resolve-apply.json');
  });

  it('current and legacy paths differ', () => {
    const currentPath = getDefaultApplyArtifactPath('src/App.tsx');
    const legacyPath = getLegacyApplyArtifactPath('src/App.tsx');
    expect(currentPath).not.toBe(legacyPath);
    expect(currentPath).toContain('figma-resolution-apply');
    expect(legacyPath).toContain('figma-resolve-apply');
  });
});

describe('repo-root detection', () => {
  it('returns a valid directory path', () => {
    const repoRoot = getRepoRoot();
    expect(typeof repoRoot).toBe('string');
    expect(repoRoot.length).toBeGreaterThan(0);
  });

  it('finds repo root from nested directory', () => {
    // Start from a nested path within the repo
    const repoRoot = getRepoRoot(process.cwd());
    expect(repoRoot).toBeTruthy();
    // Should not be empty or just "/"
    expect(repoRoot.length).toBeGreaterThan(1);
  });

  it('returns consistent results for same starting point', () => {
    const root1 = getRepoRoot(process.cwd());
    const root2 = getRepoRoot(process.cwd());
    expect(root1).toBe(root2);
  });
});

// =============================================================================
// PHASE 12J.2: SOURCE PATH NORMALIZATION TESTS
// =============================================================================

describe('source path normalization (Phase 12J.2)', () => {
  // Use a mock repo root for testing
  const mockRepoRoot = '/Users/test/aesthetic-function';

  it('normalizes simple relative path (no change needed)', () => {
    const result = normalizeSourcePath('demo-app/src/App.tsx', mockRepoRoot);
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('normalizes path with leading ./', () => {
    const result = normalizeSourcePath('./demo-app/src/App.tsx', mockRepoRoot);
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('strips parent directory references when path is outside repo', () => {
    // When the resolved path would be outside repo, strip parent refs
    const result = normalizeSourcePath('../../demo-app/src/App.tsx', '/some/other/path');
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('normalizes absolute path within repo root', () => {
    const absolutePath = join(mockRepoRoot, 'demo-app/src/App.tsx');
    const result = normalizeSourcePath(absolutePath, mockRepoRoot);
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('converts backslashes to forward slashes', () => {
    const result = normalizeSourcePath('demo-app\\src\\App.tsx', mockRepoRoot);
    expect(result).toBe('demo-app/src/App.tsx');
  });

  it('produces same artifact path from different input forms', () => {
    // All these should produce the same artifact path
    const simple = 'demo-app/src/App.tsx';
    const withDotSlash = './demo-app/src/App.tsx';
    const absolute = join(mockRepoRoot, 'demo-app/src/App.tsx');

    const normalizedSimple = normalizeSourcePath(simple, mockRepoRoot);
    const normalizedDotSlash = normalizeSourcePath(withDotSlash, mockRepoRoot);
    const normalizedAbsolute = normalizeSourcePath(absolute, mockRepoRoot);

    expect(normalizedSimple).toBe('demo-app/src/App.tsx');
    expect(normalizedDotSlash).toBe('demo-app/src/App.tsx');
    expect(normalizedAbsolute).toBe('demo-app/src/App.tsx');

    // All should produce the same artifact path
    const artifactPath1 = getDefaultApplyArtifactPath(normalizedSimple);
    const artifactPath2 = getDefaultApplyArtifactPath(normalizedDotSlash);
    const artifactPath3 = getDefaultApplyArtifactPath(normalizedAbsolute);

    expect(artifactPath1).toBe(artifactPath2);
    expect(artifactPath2).toBe(artifactPath3);
    expect(artifactPath1).toBe('design-materializations/demo-app__src__App.figma-resolution-apply.json');
  });

  it('produces canonical artifact path (no ..__ segments)', () => {
    // Even if input has parent refs, the artifact path should be canonical
    const input = '../../demo-app/src/App.tsx';
    const normalized = normalizeSourcePath(input, '/some/other/path');
    const artifactPath = getDefaultApplyArtifactPath(normalized);

    expect(artifactPath).not.toContain('..__');
    expect(artifactPath).toBe('design-materializations/demo-app__src__App.figma-resolution-apply.json');
  });
});
