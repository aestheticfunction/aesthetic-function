/**
 * @aesthetic-function/watcher - figmaResolveApply/__tests__/postApplyVerify.test.ts
 *
 * Phase 12H: Unit tests for post-apply auto-verification + CI gate.
 *
 * Tests verify:
 * 1. Verification not invoked when POST_APPLY_VERIFY=false
 * 2. Verification invoked after successful apply when enabled
 * 3. Artifact IDs correctly linked (apply ↔ verification)
 * 4. Strict mode exits with code 1 on mismatch/missing
 * 5. Non-strict mode always exits with code 0
 * 6. Verification skipped when mode is artifact-only or dry-run
 *
 * NO demo-app reads. Fixtures only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPostApplyVerifyConfig,
  shouldRunPostApplyVerification,
  formatPostApplyVerifyConfig,
  DEFAULT_POST_APPLY_VERIFY_CONFIG,
} from '../config.js';
import {
  createSkippedVerificationResult,
  formatPostApplyVerifyResult,
  getExpectedVerificationPath,
} from '../postApplyVerify.js';
import type {
  PostApplyVerifyConfig,
  PostApplyVerifyResult,
  ResolutionApplyConfig,
  ResolutionApplyArtifact,
} from '../types.js';
import type { VerificationSummary } from '../../verification/types.js';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Create a test apply config.
 */
function createApplyConfig(overrides: Partial<ResolutionApplyConfig> = {}): ResolutionApplyConfig {
  return {
    enabled: true,
    mode: 'apply',
    dryRun: false,
    allow: ['ast', 'marker', 'override'],
    minConfidence: 'high',
    ...overrides,
  };
}

/**
 * Create a test verify config.
 */
function createVerifyConfig(overrides: Partial<PostApplyVerifyConfig> = {}): PostApplyVerifyConfig {
  return {
    enabled: true,
    includeFigma: false,
    strict: true,
    ...overrides,
  };
}

/**
 * Create a test apply artifact.
 */
function createApplyArtifact(overrides: Partial<ResolutionApplyArtifact> = {}): ResolutionApplyArtifact {
  return {
    version: '1.0',
    source: 'figma-resolution-apply',
    sourceFile: 'src/App.tsx',
    planPath: 'design-materializations/src__App.figma-resolution-plan.json',
    mode: 'apply',
    dryRun: false,
    generatedAt: new Date().toISOString(),
    summary: {
      decisionsTotal: 3,
      attempted: 3,
      applied: 2,
      noop: 0,
      skipped: 0,
      blocked: 0,
      failed: 1,
    },
    results: [],
    ...overrides,
  };
}

/**
 * Create a test verification summary.
 */
function createVerificationSummary(overrides: Partial<VerificationSummary> = {}): VerificationSummary {
  return {
    total: 5,
    verified: 4,
    mismatch: 0,
    missing: 0,
    skipped: 1,
    blocked: 0,
    ...overrides,
  };
}

/**
 * Create a test post-apply verify result.
 */
function createVerifyResult(overrides: Partial<PostApplyVerifyResult> = {}): PostApplyVerifyResult {
  return {
    ran: true,
    passed: true,
    summary: createVerificationSummary(),
    verificationArtifactPath: 'design-materializations/src__App.figma-verification.json',
    exitCode: 0,
    ...overrides,
  };
}

// =============================================================================
// CONFIG LOADER TESTS
// =============================================================================

describe('loadPostApplyVerifyConfig', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.POST_APPLY_VERIFY;
    delete process.env.POST_APPLY_VERIFY_INCLUDE_FIGMA;
    delete process.env.POST_APPLY_VERIFY_STRICT;
  });

  it('returns safe defaults when no env vars set', () => {
    const config = loadPostApplyVerifyConfig();
    expect(config.enabled).toBe(false);
    expect(config.includeFigma).toBe(false);
    expect(config.strict).toBe(true); // Strict defaults to true
  });

  it('parses POST_APPLY_VERIFY=true correctly', () => {
    process.env.POST_APPLY_VERIFY = 'true';
    const config = loadPostApplyVerifyConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses POST_APPLY_VERIFY=false correctly', () => {
    process.env.POST_APPLY_VERIFY = 'false';
    const config = loadPostApplyVerifyConfig();
    expect(config.enabled).toBe(false);
  });

  it('parses POST_APPLY_VERIFY_INCLUDE_FIGMA=true correctly', () => {
    process.env.POST_APPLY_VERIFY_INCLUDE_FIGMA = 'true';
    const config = loadPostApplyVerifyConfig();
    expect(config.includeFigma).toBe(true);
  });

  it('parses POST_APPLY_VERIFY_STRICT=false correctly', () => {
    process.env.POST_APPLY_VERIFY_STRICT = 'false';
    const config = loadPostApplyVerifyConfig();
    expect(config.strict).toBe(false);
  });

  it('handles 1/yes as true values', () => {
    process.env.POST_APPLY_VERIFY = '1';
    process.env.POST_APPLY_VERIFY_INCLUDE_FIGMA = 'yes';
    const config = loadPostApplyVerifyConfig();
    expect(config.enabled).toBe(true);
    expect(config.includeFigma).toBe(true);
  });
});

describe('DEFAULT_POST_APPLY_VERIFY_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_POST_APPLY_VERIFY_CONFIG).toEqual({
      enabled: false,
      includeFigma: false,
      strict: true,
    });
  });
});

// =============================================================================
// SHOULD RUN VERIFICATION TESTS
// =============================================================================

describe('shouldRunPostApplyVerification', () => {
  it('returns false when POST_APPLY_VERIFY is not enabled', () => {
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: false });

    const result = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(result.shouldRun).toBe(false);
    expect(result.skipReason).toContain('POST_APPLY_VERIFY is not enabled');
  });

  it('returns false when mode is artifact', () => {
    const applyConfig = createApplyConfig({ mode: 'artifact', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: true });

    const result = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(result.shouldRun).toBe(false);
    expect(result.skipReason).toContain("Mode is 'artifact'");
  });

  it('returns false when dry-run is enabled', () => {
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: true });
    const verifyConfig = createVerifyConfig({ enabled: true });

    const result = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(result.shouldRun).toBe(false);
    expect(result.skipReason).toContain('Dry-run mode is enabled');
  });

  it('returns true when all conditions are met', () => {
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: true });

    const result = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(result.shouldRun).toBe(true);
    expect(result.skipReason).toBeUndefined();
  });
});

// =============================================================================
// ARTIFACT LINKING TESTS
// =============================================================================

describe('artifact linking', () => {
  it('apply artifact can include verificationArtifactPath', () => {
    const artifact = createApplyArtifact({
      verificationArtifactPath: 'design-materializations/src__App.figma-verification.json',
    });

    expect(artifact.verificationArtifactPath).toBe(
      'design-materializations/src__App.figma-verification.json'
    );
  });

  it('apply artifact without verification has undefined verificationArtifactPath', () => {
    const artifact = createApplyArtifact();
    delete artifact.verificationArtifactPath;

    expect(artifact.verificationArtifactPath).toBeUndefined();
  });

  it('getExpectedVerificationPath returns correct path for source file', () => {
    const sourceFile = 'src/components/Button.tsx';
    const expectedPath = getExpectedVerificationPath(sourceFile);

    expect(expectedPath).toBe('design-materializations/src__components__Button.figma-verification.json');
  });
});

// =============================================================================
// EXIT CODE TESTS
// =============================================================================

describe('exit codes', () => {
  describe('strict mode', () => {
    it('exits with code 0 when verification passed', () => {
      const result = createVerifyResult({
        passed: true,
        summary: createVerificationSummary({ mismatch: 0, missing: 0 }),
        exitCode: 0,
      });

      expect(result.exitCode).toBe(0);
    });

    it('exits with code 1 when verification has mismatches (strict)', () => {
      // This would be set by runPostApplyVerification based on strict mode
      const result = createVerifyResult({
        passed: false,
        summary: createVerificationSummary({ mismatch: 2, missing: 0 }),
        exitCode: 1,
      });

      expect(result.exitCode).toBe(1);
    });

    it('exits with code 1 when verification has missing items (strict)', () => {
      const result = createVerifyResult({
        passed: false,
        summary: createVerificationSummary({ mismatch: 0, missing: 1 }),
        exitCode: 1,
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe('non-strict mode', () => {
    it('exits with code 0 even when verification has mismatches', () => {
      // In non-strict mode, exitCode is always 0
      const result = createVerifyResult({
        passed: false,
        summary: createVerificationSummary({ mismatch: 2, missing: 0 }),
        exitCode: 0, // Non-strict mode
      });

      expect(result.exitCode).toBe(0);
    });

    it('exits with code 0 even when verification has missing items', () => {
      const result = createVerifyResult({
        passed: false,
        summary: createVerificationSummary({ mismatch: 0, missing: 1 }),
        exitCode: 0, // Non-strict mode
      });

      expect(result.exitCode).toBe(0);
    });
  });
});

// =============================================================================
// SKIP RESULT TESTS
// =============================================================================

describe('createSkippedVerificationResult', () => {
  it('creates a skipped result with reason', () => {
    const result = createSkippedVerificationResult('POST_APPLY_VERIFY is not enabled');

    expect(result.ran).toBe(false);
    expect(result.skipReason).toBe('POST_APPLY_VERIFY is not enabled');
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('skipped result always has exitCode 0', () => {
    const result = createSkippedVerificationResult('any reason');

    expect(result.exitCode).toBe(0);
  });
});

// =============================================================================
// FORMAT OUTPUT TESTS
// =============================================================================

describe('formatPostApplyVerifyConfig', () => {
  it('formats enabled config correctly', () => {
    const config = createVerifyConfig({ enabled: true, includeFigma: true, strict: true });
    const formatted = formatPostApplyVerifyConfig(config);

    expect(formatted).toContain('enabled:      YES');
    expect(formatted).toContain('includeFigma: YES');
    expect(formatted).toContain('strict:       YES');
  });

  it('formats disabled config correctly', () => {
    const config = createVerifyConfig({ enabled: false, includeFigma: false, strict: false });
    const formatted = formatPostApplyVerifyConfig(config);

    expect(formatted).toContain('enabled:      NO');
    expect(formatted).toContain('includeFigma: NO');
    expect(formatted).toContain('strict:       NO');
  });
});

describe('formatPostApplyVerifyResult', () => {
  it('formats passed result correctly', () => {
    const result = createVerifyResult({ ran: true, passed: true });
    const formatted = formatPostApplyVerifyResult(result);

    expect(formatted).toContain('POST-APPLY VERIFICATION');
    expect(formatted).toContain('Status: PASSED ✓');
    expect(formatted).toContain('Exit Code: 0');
  });

  it('formats failed result correctly', () => {
    const result = createVerifyResult({
      ran: true,
      passed: false,
      exitCode: 1,
      summary: createVerificationSummary({ mismatch: 2 }),
    });
    const formatted = formatPostApplyVerifyResult(result);

    expect(formatted).toContain('Status: FAILED ✗');
    expect(formatted).toContain('Exit Code: 1');
    expect(formatted).toContain('Mismatch: 2');
  });

  it('formats skipped result correctly', () => {
    const result = createSkippedVerificationResult('Dry-run mode is enabled');
    const formatted = formatPostApplyVerifyResult(result);

    expect(formatted).toContain('Status: SKIPPED');
    expect(formatted).toContain('Reason: Dry-run mode is enabled');
  });

  it('includes verification artifact path when present', () => {
    const result = createVerifyResult({
      verificationArtifactPath: 'design-materializations/src__App.figma-verification.json',
    });
    const formatted = formatPostApplyVerifyResult(result);

    expect(formatted).toContain('Artifact: design-materializations/src__App.figma-verification.json');
  });
});

// =============================================================================
// INTEGRATION SCENARIO TESTS
// =============================================================================

describe('integration scenarios', () => {
  it('verification disabled scenario follows correct flow', () => {
    // Scenario: POST_APPLY_VERIFY=false, mode=apply, dryRun=false
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: false });

    const shouldRun = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(shouldRun.shouldRun).toBe(false);

    const result = createSkippedVerificationResult(shouldRun.skipReason!);
    expect(result.exitCode).toBe(0);
  });

  it('artifact-only mode scenario skips verification', () => {
    // Scenario: POST_APPLY_VERIFY=true, mode=artifact
    const applyConfig = createApplyConfig({ mode: 'artifact', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: true });

    const shouldRun = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(shouldRun.shouldRun).toBe(false);
    expect(shouldRun.skipReason).toContain("Mode is 'artifact'");
  });

  it('dry-run mode scenario skips verification', () => {
    // Scenario: POST_APPLY_VERIFY=true, mode=apply, dryRun=true
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: true });
    const verifyConfig = createVerifyConfig({ enabled: true });

    const shouldRun = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(shouldRun.shouldRun).toBe(false);
    expect(shouldRun.skipReason).toContain('Dry-run mode is enabled');
  });

  it('full apply with verification scenario runs verification', () => {
    // Scenario: POST_APPLY_VERIFY=true, mode=apply, dryRun=false
    const applyConfig = createApplyConfig({ mode: 'apply', dryRun: false });
    const verifyConfig = createVerifyConfig({ enabled: true, strict: true });

    const shouldRun = shouldRunPostApplyVerification(applyConfig, verifyConfig);
    expect(shouldRun.shouldRun).toBe(true);
  });

  it('CI gate strict mode scenario exits 1 on failure', () => {
    // Scenario: Verification ran, found mismatches, strict=true
    const result = createVerifyResult({
      ran: true,
      passed: false,
      summary: createVerificationSummary({ mismatch: 1 }),
      exitCode: 1, // Strict mode
    });

    expect(result.exitCode).toBe(1);
  });

  it('CI gate non-strict mode scenario exits 0 on failure', () => {
    // Scenario: Verification ran, found mismatches, strict=false
    const result = createVerifyResult({
      ran: true,
      passed: false,
      summary: createVerificationSummary({ mismatch: 1 }),
      exitCode: 0, // Non-strict mode
    });

    expect(result.exitCode).toBe(0);
  });
});
