/**
 * @aesthetic-function/watcher - reconcile/__tests__/profiles.test.ts
 *
 * Tests for policy profiles and profile resolver (Phase 15B, Milestones 2–3).
 *
 * Proves:
 * - designer-first matches current Phase 14F default behavior exactly
 * - code-first maps to existing if_newer_than_code behavior
 * - Profile resolver returns correct PolicyOptions
 * - No-config resolves to designer-first
 * - Profile names all map to valid built-in profiles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BUILT_IN_PROFILES,
  DESIGNER_FIRST,
  CODE_FIRST,
  BALANCED,
  STRICT_REVIEW,
  getProfile,
  getDefaultProfile,
} from '../profiles.js';
import {
  resolveProfileToPolicyOptions,
  resolveProfileName,
} from '../profileResolver.js';
import { getUseOverrides, getOverridesPrecedence } from '../config.js';
import type { ResolvedAfConfig } from '@aesthetic-function/shared';
import { DEFAULT_CONFIG } from '@aesthetic-function/shared';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a ResolvedAfConfig with overrides from the given partial config.
 */
function makeConfig(overrides: Partial<ResolvedAfConfig>): ResolvedAfConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

// =============================================================================
// TESTS: PROFILE DEFINITIONS (Milestone 2)
// =============================================================================

describe('profiles', () => {
  describe('designer-first profile', () => {
    it('has useOverrides=true (overrides are always on)', () => {
      expect(DESIGNER_FIRST.useOverrides).toBe(true);
    });

    it('has overridePrecedence=always (overrides always win)', () => {
      expect(DESIGNER_FIRST.overridePrecedence).toBe('always');
    });

    it('has colorStrategy=token-first', () => {
      expect(DESIGNER_FIRST.colorStrategy).toBe('token-first');
    });

    it('has canonicalStrict=false', () => {
      expect(DESIGNER_FIRST.canonicalStrict).toBe(false);
    });

    it('has conflictAction=apply (silent)', () => {
      expect(DESIGNER_FIRST.conflictAction).toBe('apply');
    });
  });

  describe('code-first profile', () => {
    it('has useOverrides=true', () => {
      expect(CODE_FIRST.useOverrides).toBe(true);
    });

    it('has overridePrecedence=if_newer_than_code', () => {
      expect(CODE_FIRST.overridePrecedence).toBe('if_newer_than_code');
    });

    it('has conflictAction=apply', () => {
      expect(CODE_FIRST.conflictAction).toBe('apply');
    });
  });

  describe('balanced profile', () => {
    it('has overridePrecedence=if_newer_than_code (same as code-first)', () => {
      expect(BALANCED.overridePrecedence).toBe('if_newer_than_code');
    });

    it('has conflictAction=warn (unlike code-first which is apply)', () => {
      expect(BALANCED.conflictAction).toBe('warn');
    });
  });

  describe('strict-review profile', () => {
    it('has overridePrecedence=always', () => {
      expect(STRICT_REVIEW.overridePrecedence).toBe('always');
    });

    it('has colorStrategy=token-only (strict mode)', () => {
      expect(STRICT_REVIEW.colorStrategy).toBe('token-only');
    });

    it('has canonicalStrict=true', () => {
      expect(STRICT_REVIEW.canonicalStrict).toBe(true);
    });

    it('has conflictAction=block', () => {
      expect(STRICT_REVIEW.conflictAction).toBe('block');
    });
  });

  describe('BUILT_IN_PROFILES registry', () => {
    it('has exactly 4 profiles', () => {
      expect(Object.keys(BUILT_IN_PROFILES)).toHaveLength(4);
    });

    it('includes all named profiles', () => {
      expect(BUILT_IN_PROFILES['designer-first']).toBeDefined();
      expect(BUILT_IN_PROFILES['code-first']).toBeDefined();
      expect(BUILT_IN_PROFILES['balanced']).toBeDefined();
      expect(BUILT_IN_PROFILES['strict-review']).toBeDefined();
    });
  });

  describe('getProfile', () => {
    it('returns correct profile by name', () => {
      expect(getProfile('designer-first')).toBe(DESIGNER_FIRST);
      expect(getProfile('code-first')).toBe(CODE_FIRST);
      expect(getProfile('balanced')).toBe(BALANCED);
      expect(getProfile('strict-review')).toBe(STRICT_REVIEW);
    });
  });

  describe('getDefaultProfile', () => {
    it('returns designer-first', () => {
      expect(getDefaultProfile()).toBe(DESIGNER_FIRST);
    });
  });
});

// =============================================================================
// TESTS: PROFILE RESOLVER (Milestone 3)
// =============================================================================

describe('profileResolver', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.RECONCILIATION_POLICY;
    delete process.env.USE_OVERRIDES;
    delete process.env.OVERRIDES_PRECEDENCE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveProfileName', () => {
    it('returns designer-first when no config and no env', () => {
      expect(resolveProfileName()).toBe('designer-first');
    });

    it('returns profile from config', () => {
      const config = makeConfig({ profile: 'code-first' });
      expect(resolveProfileName(config)).toBe('code-first');
    });

    it('reads RECONCILIATION_POLICY env when no config', () => {
      process.env.RECONCILIATION_POLICY = 'balanced';
      expect(resolveProfileName()).toBe('balanced');
    });

    it('config profile takes priority (env already merged by loader)', () => {
      const config = makeConfig({ profile: 'strict-review' });
      process.env.RECONCILIATION_POLICY = 'code-first';
      // Config already has env merged so config.profile wins
      expect(resolveProfileName(config)).toBe('strict-review');
    });

    it('ignores invalid RECONCILIATION_POLICY env values', () => {
      process.env.RECONCILIATION_POLICY = 'invalid';
      expect(resolveProfileName()).toBe('designer-first');
    });
  });

  describe('resolveProfileToPolicyOptions', () => {
    it('returns designer-first PolicyOptions when no config', () => {
      const options = resolveProfileToPolicyOptions();

      expect(options.useOverrides).toBe(true);
      expect(options.precedence).toBe('always');
    });

    it('returns code-first PolicyOptions', () => {
      const config = makeConfig({ profile: 'code-first' });
      const options = resolveProfileToPolicyOptions(config);

      expect(options.useOverrides).toBe(true);
      expect(options.precedence).toBe('if_newer_than_code');
    });

    it('returns strict-review PolicyOptions', () => {
      const config = makeConfig({ profile: 'strict-review' });
      const options = resolveProfileToPolicyOptions(config);

      expect(options.useOverrides).toBe(true);
      expect(options.precedence).toBe('always');
    });
  });

  // ===========================================================================
  // CRITICAL: designer-first = current default behavior
  // ===========================================================================

  describe('designer-first matches Phase 14F defaults', () => {
    it('designer-first PolicyOptions matches env-var defaults', () => {
      // No env vars set → getUseOverrides() returns true, getOverridesPrecedence() returns 'always'
      const envDefaults = {
        useOverrides: getUseOverrides(),
        precedence: getOverridesPrecedence(),
      };

      const profileOptions = resolveProfileToPolicyOptions();

      expect(profileOptions.useOverrides).toBe(envDefaults.useOverrides);
      expect(profileOptions.precedence).toBe(envDefaults.precedence);
    });

    it('designer-first profile values match DEFAULT_CONFIG values', () => {
      expect(DESIGNER_FIRST.useOverrides).toBe(DEFAULT_CONFIG.overrides.enabled);
      expect(DESIGNER_FIRST.overridePrecedence).toBe(DEFAULT_CONFIG.overrides.precedence);
      expect(DESIGNER_FIRST.colorStrategy).toBe(DEFAULT_CONFIG.canonical.colorStrategy);
      expect(DESIGNER_FIRST.canonicalStrict).toBe(DEFAULT_CONFIG.canonical.strict);
    });
  });

  // ===========================================================================
  // CRITICAL: code-first = existing if_newer_than_code
  // ===========================================================================

  describe('code-first maps to existing if_newer_than_code behavior', () => {
    it('code-first overridePrecedence equals if_newer_than_code', () => {
      expect(CODE_FIRST.overridePrecedence).toBe('if_newer_than_code');
    });

    it('code-first PolicyOptions match OVERRIDES_PRECEDENCE=if_newer_than_code env', () => {
      process.env.OVERRIDES_PRECEDENCE = 'if_newer_than_code';
      const envBehavior = {
        useOverrides: getUseOverrides(),
        precedence: getOverridesPrecedence(),
      };

      const config = makeConfig({ profile: 'code-first' });
      const profileOptions = resolveProfileToPolicyOptions(config);

      expect(profileOptions.useOverrides).toBe(envBehavior.useOverrides);
      expect(profileOptions.precedence).toBe(envBehavior.precedence);
    });
  });
});

// =============================================================================
// TESTS: CONFIG WIRING (Milestone 3)
// =============================================================================

describe('config wiring', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.USE_OVERRIDES;
    delete process.env.OVERRIDES_PRECEDENCE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getUseOverrides with config', () => {
    it('reads from config when provided', () => {
      const config = makeConfig({ overrides: { enabled: false, precedence: 'always' } });
      expect(getUseOverrides(config)).toBe(false);
    });

    it('config overrides env vars (because config already merged env)', () => {
      process.env.USE_OVERRIDES = 'true';
      const config = makeConfig({ overrides: { enabled: false, precedence: 'always' } });
      // Config takes priority when passed directly
      expect(getUseOverrides(config)).toBe(false);
    });

    it('falls back to env when no config provided', () => {
      process.env.USE_OVERRIDES = 'false';
      expect(getUseOverrides()).toBe(false);
    });

    it('falls back to default when no config and no env', () => {
      expect(getUseOverrides()).toBe(true);
    });
  });

  describe('getOverridesPrecedence with config', () => {
    it('reads from config when provided', () => {
      const config = makeConfig({ overrides: { enabled: true, precedence: 'if_newer_than_code' } });
      expect(getOverridesPrecedence(config)).toBe('if_newer_than_code');
    });

    it('falls back to env when no config provided', () => {
      process.env.OVERRIDES_PRECEDENCE = 'if_newer_than_code';
      expect(getOverridesPrecedence()).toBe('if_newer_than_code');
    });

    it('falls back to always when no config and no env', () => {
      expect(getOverridesPrecedence()).toBe('always');
    });
  });
});
