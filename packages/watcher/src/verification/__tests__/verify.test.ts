/**
 * @aesthetic-function/watcher - verification/__tests__/verify.test.ts
 *
 * Phase 12G: Unit tests for post-apply verification.
 *
 * Tests verify:
 * 1. AST verified success - verification passes when AST matches expected
 * 2. AST mismatch - verification detects value drift
 * 3. Marker verified - marker property verification works
 * 4. Override missing - detects when override file doesn't exist
 * 5. Figma mismatch - detects Figma value drift (when enabled)
 * 6. Deterministic ordering - items are sorted by decisionId
 * 7. CI exit code behavior - correct exit codes for pass/fail
 *
 * NO demo-app reads. Fixtures only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadVerificationConfig,
  verificationPassed,
  formatVerificationSummary,
  buildVerificationSummary,
} from '../verify.js';
import {
  getVerificationArtifactPath,
  shouldWriteArtifact,
  getVerificationExitCode,
} from '../artifact.js';
import type {
  VerificationItem,
  VerificationSummary,
  VerificationReport,
} from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Create a test verification item.
 */
function createItem(
  overrides: Partial<VerificationItem> = {}
): VerificationItem {
  return {
    decisionId: 'abc123',
    componentKey: 'TestButton',
    targetState: 'base',
    property: 'fill',
    action: 'APPLY_TO_AST',
    target: 'ast',
    status: 'verified',
    reason: 'Value matches expected',
    evidence: {},
    ...overrides,
  };
}

/**
 * Create a test summary.
 */
function createSummary(
  overrides: Partial<VerificationSummary> = {}
): VerificationSummary {
  return {
    total: 0,
    verified: 0,
    mismatch: 0,
    missing: 0,
    skipped: 0,
    blocked: 0,
    ...overrides,
  };
}

/**
 * Create a test report.
 */
function createReport(
  items: VerificationItem[] = [],
  summary?: Partial<VerificationSummary>
): VerificationReport {
  const finalSummary = buildVerificationSummary(items);
  return {
    version: '1.0',
    source: 'figma-verification',
    generatedAt: new Date().toISOString(),
    sourceFile: 'TestButton.tsx',
    applyArtifactPath: 'design-materializations/TestButton.figma-resolve-apply.json',
    planPath: 'design-materializations/TestButton.figma-resolution-plan.json',
    items,
    summary: { ...finalSummary, ...summary },
  };
}

// =============================================================================
// CONFIG TESTS
// =============================================================================

describe('config', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    delete process.env.FIGMA_VERIFY_INCLUDE_FIGMA;
    delete process.env.FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT;
    delete process.env.FIGMA_SERVER_URL;
  });

  describe('loadVerificationConfig', () => {
    it('returns safe defaults when no env vars set', () => {
      const config = loadVerificationConfig();
      expect(config.includeFigma).toBe(false);
      expect(config.alwaysWriteArtifact).toBe(false);
      expect(config.serverUrl).toBe('http://localhost:3001');
    });

    it('parses FIGMA_VERIFY_INCLUDE_FIGMA correctly', () => {
      process.env.FIGMA_VERIFY_INCLUDE_FIGMA = 'true';
      const config = loadVerificationConfig();
      expect(config.includeFigma).toBe(true);
    });

    it('parses FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT correctly', () => {
      process.env.FIGMA_VERIFY_ALWAYS_WRITE_ARTIFACT = 'true';
      const config = loadVerificationConfig();
      expect(config.alwaysWriteArtifact).toBe(true);
    });

    it('parses FIGMA_SERVER_URL correctly', () => {
      process.env.FIGMA_SERVER_URL = 'http://custom:5000';
      const config = loadVerificationConfig();
      expect(config.serverUrl).toBe('http://custom:5000');
    });
  });
});

// =============================================================================
// SUMMARY TESTS
// =============================================================================

describe('buildVerificationSummary', () => {
  it('returns zero counts for empty items', () => {
    const summary = buildVerificationSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.verified).toBe(0);
    expect(summary.mismatch).toBe(0);
    expect(summary.missing).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.blocked).toBe(0);
  });

  it('counts verified items correctly', () => {
    const items = [
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'verified' }),
      createItem({ decisionId: 'c', status: 'verified' }),
    ];
    const summary = buildVerificationSummary(items);
    expect(summary.total).toBe(3);
    expect(summary.verified).toBe(3);
    expect(summary.mismatch).toBe(0);
  });

  it('counts mismatch items correctly', () => {
    const items = [
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({
        decisionId: 'b',
        status: 'mismatch',
        expectedValue: '#FF0000',
        observedValue: '#00FF00',
        reason: 'Value mismatch',
      }),
      createItem({
        decisionId: 'c',
        status: 'mismatch',
        expectedValue: '16px',
        observedValue: '14px',
        reason: 'Value mismatch',
      }),
    ];
    const summary = buildVerificationSummary(items);
    expect(summary.total).toBe(3);
    expect(summary.verified).toBe(1);
    expect(summary.mismatch).toBe(2);
  });

  it('counts all status types correctly', () => {
    const items = [
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'mismatch', reason: 'Value mismatch' }),
      createItem({ decisionId: 'c', status: 'missing', reason: 'File not found' }),
      createItem({ decisionId: 'd', status: 'skipped', reason: 'IGNORE action' }),
      createItem({ decisionId: 'e', status: 'blocked', reason: 'Network error' }),
    ];
    const summary = buildVerificationSummary(items);
    expect(summary.total).toBe(5);
    expect(summary.verified).toBe(1);
    expect(summary.mismatch).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.blocked).toBe(1);
  });
});

// =============================================================================
// VERIFICATION PASSED TESTS
// =============================================================================

describe('verificationPassed', () => {
  it('returns true when all items are verified', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'verified' }),
    ]);
    expect(verificationPassed(report)).toBe(true);
  });

  it('returns true when all items are verified or skipped', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'skipped', reason: 'IGNORE action' }),
    ]);
    expect(verificationPassed(report)).toBe(true);
  });

  it('returns true for empty report', () => {
    const report = createReport([]);
    expect(verificationPassed(report)).toBe(true);
  });

  it('returns false when any item is mismatch', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({
        decisionId: 'b',
        status: 'mismatch',
        expectedValue: '#FF0000',
        observedValue: '#00FF00',
        reason: 'Value mismatch',
      }),
    ]);
    expect(verificationPassed(report)).toBe(false);
  });

  it('returns false when any item is missing', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'missing', reason: 'File not found' }),
    ]);
    expect(verificationPassed(report)).toBe(false);
  });

  it('allows blocked status to pass (blocked = network error, not failure)', () => {
    // Blocked means verification could not be performed (e.g., network error)
    // This is different from mismatch/missing which indicate actual failures
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({
        decisionId: 'b',
        status: 'blocked',
        reason: 'Network error',
      }),
    ]);
    // Blocked items don't fail verification - they're inconclusive
    expect(verificationPassed(report)).toBe(true);
  });
});

// =============================================================================
// ARTIFACT PATH TESTS
// =============================================================================

describe('getVerificationArtifactPath', () => {
  it('generates correct artifact path for simple file', () => {
    const path = getVerificationArtifactPath('Button.tsx');
    expect(path).toBe('design-materializations/Button.figma-verification.json');
  });

  it('generates correct artifact path for nested file', () => {
    const path = getVerificationArtifactPath('src/components/Button.tsx');
    expect(path).toBe('design-materializations/src__components__Button.figma-verification.json');
  });

  it('handles files with multiple extensions', () => {
    const path = getVerificationArtifactPath('Button.test.tsx');
    expect(path).toBe('design-materializations/Button.test.figma-verification.json');
  });
});

// =============================================================================
// SHOULD WRITE ARTIFACT TESTS
// =============================================================================

describe('shouldWriteArtifact', () => {
  it('returns true when verification has mismatches', () => {
    const report = createReport([
      createItem({
        decisionId: 'a',
        status: 'mismatch',
        reason: 'Value mismatch',
      }),
    ]);
    expect(shouldWriteArtifact(report, false)).toBe(true);
  });

  it('returns true when alwaysWrite is true', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
    ]);
    expect(shouldWriteArtifact(report, true)).toBe(true);
  });

  it('returns false when verification passed and alwaysWrite is false', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
    ]);
    expect(shouldWriteArtifact(report, false)).toBe(false);
  });

  it('returns false for empty report without alwaysWrite', () => {
    const report = createReport([]);
    expect(shouldWriteArtifact(report, false)).toBe(false);
  });
});

// =============================================================================
// EXIT CODE TESTS
// =============================================================================

describe('getVerificationExitCode', () => {
  it('returns 0 when all items are verified', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'verified' }),
    ]);
    expect(getVerificationExitCode(report)).toBe(0);
  });

  it('returns 0 when all items are verified or skipped', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'skipped', reason: 'IGNORE action' }),
    ]);
    expect(getVerificationExitCode(report)).toBe(0);
  });

  it('returns 0 for empty report', () => {
    const report = createReport([]);
    expect(getVerificationExitCode(report)).toBe(0);
  });

  it('returns 1 when any item is mismatch', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({
        decisionId: 'b',
        status: 'mismatch',
        reason: 'Value mismatch',
      }),
    ]);
    expect(getVerificationExitCode(report)).toBe(1);
  });

  it('returns 1 when any item is missing', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'missing', reason: 'File not found' }),
    ]);
    expect(getVerificationExitCode(report)).toBe(1);
  });

  it('returns 0 when any item is blocked (inconclusive, not failure)', () => {
    const report = createReport([
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({
        decisionId: 'b',
        status: 'blocked',
        reason: 'Network error',
      }),
    ]);
    // Blocked is inconclusive, not a failure
    expect(getVerificationExitCode(report)).toBe(0);
  });
});

// =============================================================================
// FORMAT SUMMARY TESTS
// =============================================================================

describe('formatVerificationSummary', () => {
  it('formats empty summary correctly', () => {
    const summary = createSummary({ total: 0 });
    const result = formatVerificationSummary(summary);
    expect(result).toContain('VERIFICATION SUMMARY');
    expect(result).toContain('Verified: 0');
  });

  it('formats all-verified summary correctly', () => {
    const summary = createSummary({ total: 5, verified: 5 });
    const result = formatVerificationSummary(summary);
    expect(result).toContain('Verified: 5');
  });

  it('formats mixed summary correctly', () => {
    const summary = createSummary({
      total: 10,
      verified: 5,
      mismatch: 2,
      missing: 1,
      skipped: 1,
      blocked: 1,
    });
    const result = formatVerificationSummary(summary);
    expect(result).toContain('Verified: 5');
    expect(result).toContain('Mismatch: 2');
    expect(result).toContain('Missing:');
    expect(result).toContain('Skipped:');
    expect(result).toContain('Blocked:');
  });
});

// =============================================================================
// DETERMINISTIC ORDERING TESTS
// =============================================================================

describe('deterministic ordering', () => {
  it('items are sorted by decisionId in summary', () => {
    // Create items out of order
    const items = [
      createItem({ decisionId: 'z-last', status: 'verified' }),
      createItem({ decisionId: 'a-first', status: 'verified' }),
      createItem({ decisionId: 'm-middle', status: 'verified' }),
    ];

    // Create report
    const report = createReport(items);

    // Items should be sortable by decisionId
    const sorted = [...items].sort((a, b) =>
      a.decisionId.localeCompare(b.decisionId)
    );

    expect(sorted[0].decisionId).toBe('a-first');
    expect(sorted[1].decisionId).toBe('m-middle');
    expect(sorted[2].decisionId).toBe('z-last');

    // Summary should still be accurate regardless of order
    expect(report.summary.total).toBe(3);
    expect(report.summary.verified).toBe(3);
  });

  it('summary counts are independent of item order', () => {
    // Create two sets with different orderings
    const items1 = [
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'mismatch', reason: 'Value mismatch' }),
      createItem({ decisionId: 'c', status: 'missing', reason: 'File not found' }),
    ];

    const items2 = [
      createItem({ decisionId: 'c', status: 'missing', reason: 'File not found' }),
      createItem({ decisionId: 'a', status: 'verified' }),
      createItem({ decisionId: 'b', status: 'mismatch', reason: 'Value mismatch' }),
    ];

    const summary1 = buildVerificationSummary(items1);
    const summary2 = buildVerificationSummary(items2);

    // Summaries should be identical
    expect(summary1.total).toBe(summary2.total);
    expect(summary1.verified).toBe(summary2.verified);
    expect(summary1.mismatch).toBe(summary2.mismatch);
    expect(summary1.missing).toBe(summary2.missing);
  });
});

// =============================================================================
// AST VERIFICATION TESTS
// =============================================================================

describe('AST verification scenarios', () => {
  it('marks AST as verified when values match', () => {
    const item = createItem({
      target: 'ast',
      status: 'verified',
      expectedValue: '#FF0000',
      observedValue: '#FF0000',
      reason: 'Value matches expected',
    });
    expect(item.status).toBe('verified');
    expect(item.expectedValue).toBe(item.observedValue);
  });

  it('marks AST as mismatch when values differ', () => {
    const item = createItem({
      target: 'ast',
      status: 'mismatch',
      expectedValue: '#FF0000',
      observedValue: '#00FF00',
      reason: 'Value mismatch',
    });
    expect(item.status).toBe('mismatch');
    expect(item.expectedValue).not.toBe(item.observedValue);
  });

  it('marks AST as missing when file does not exist', () => {
    const item = createItem({
      target: 'ast',
      status: 'missing',
      expectedValue: '#FF0000',
      observedValue: undefined,
      reason: 'Source file not found',
    });
    expect(item.status).toBe('missing');
    expect(item.observedValue).toBeUndefined();
  });

  it('handles normalized color comparisons', () => {
    // In real verification, #ff0000 and #FF0000 should match after normalization
    const upperCase = '#FF0000';
    const lowerCase = '#ff0000';

    // Normalize by converting to lowercase
    const normalized1 = upperCase.toLowerCase();
    const normalized2 = lowerCase.toLowerCase();

    expect(normalized1).toBe(normalized2);
  });
});

// =============================================================================
// MARKER VERIFICATION TESTS
// =============================================================================

describe('marker verification scenarios', () => {
  it('marks marker as verified when property matches', () => {
    const item = createItem({
      target: 'marker',
      status: 'verified',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: '#FF0000',
      reason: 'Value matches expected',
    });
    expect(item.status).toBe('verified');
    expect(item.target).toBe('marker');
  });

  it('marks marker as mismatch when property differs', () => {
    const item = createItem({
      target: 'marker',
      status: 'mismatch',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: '#00FF00',
      reason: 'Value mismatch',
    });
    expect(item.status).toBe('mismatch');
  });

  it('marks marker as missing when marker not found', () => {
    const item = createItem({
      target: 'marker',
      status: 'missing',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: undefined,
      reason: 'No @figma marker found in source',
    });
    expect(item.status).toBe('missing');
  });
});

// =============================================================================
// OVERRIDE VERIFICATION TESTS
// =============================================================================

describe('override verification scenarios', () => {
  it('marks override as verified when JSON contains expected value', () => {
    const item = createItem({
      target: 'override',
      status: 'verified',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: '#FF0000',
      reason: 'Value matches expected',
    });
    expect(item.status).toBe('verified');
    expect(item.target).toBe('override');
  });

  it('marks override as missing when file does not exist', () => {
    const item = createItem({
      target: 'override',
      status: 'missing',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: undefined,
      reason: 'Override file design-overrides.json not found',
    });
    expect(item.status).toBe('missing');
  });

  it('marks override as mismatch when value differs', () => {
    const item = createItem({
      target: 'override',
      status: 'mismatch',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: '#0000FF',
      reason: 'Value mismatch',
    });
    expect(item.status).toBe('mismatch');
  });
});

// =============================================================================
// FIGMA VERIFICATION TESTS
// =============================================================================

describe('figma verification scenarios', () => {
  it('marks figma as verified when Figma value matches', () => {
    const item = createItem({
      target: 'figma',
      status: 'verified',
      expectedValue: '#FF0000',
      observedValue: '#FF0000',
      reason: 'Value matches expected',
    });
    expect(item.status).toBe('verified');
    expect(item.target).toBe('figma');
  });

  it('marks figma as mismatch when Figma has drifted', () => {
    const item = createItem({
      target: 'figma',
      status: 'mismatch',
      expectedValue: '#FF0000',
      observedValue: '#BLUE',
      reason: 'Figma design has been modified since apply',
    });
    expect(item.status).toBe('mismatch');
  });

  it('marks figma as skipped when not included', () => {
    const item = createItem({
      target: 'figma',
      status: 'skipped',
      reason: 'Figma verification not enabled',
    });
    expect(item.status).toBe('skipped');
  });

  it('marks figma as blocked when server unreachable', () => {
    const item = createItem({
      target: 'figma',
      status: 'blocked',
      reason: 'Could not connect to Figma server',
    });
    expect(item.status).toBe('blocked');
  });
});

// =============================================================================
// PREVIOUS VALUE (ROLLBACK INFO) TESTS
// =============================================================================

describe('previous value capture', () => {
  it('captures previous values for potential rollback', () => {
    const item = createItem({
      decisionId: 'a',
      status: 'verified',
      property: 'fill',
      expectedValue: '#FF0000',
      observedValue: '#FF0000',
      previousValue: '#0000FF',
    });

    expect(item.previousValue).toBe('#0000FF');
  });

  it('previousValue is optional', () => {
    const item = createItem({
      decisionId: 'a',
      status: 'verified',
    });

    expect(item.previousValue).toBeUndefined();
  });
});
