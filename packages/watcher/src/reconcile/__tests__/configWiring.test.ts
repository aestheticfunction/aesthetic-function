/**
 * @aesthetic-function/watcher - reconcile/__tests__/configWiring.test.ts
 *
 * Tests for config wiring into materialize and canonical policy modules (Milestone 3).
 *
 * Proves:
 * - getMaterializeMode/getMaterializeOn/getMaterializeDryRun accept optional config
 * - getResolutionPolicyFromEnv accepts optional config
 * - Config-based calls produce identical results to env-based calls
 * - Without config, behavior is identical to Phase 14F
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMaterializeMode,
  getMaterializeOn,
  getMaterializeDryRun,
} from '../../materialize/config.js';
import { getResolutionPolicyFromEnv, DEFAULT_POLICY } from '../../canonicalResolverPolicy/policy.js';
import type { ResolvedAfConfig } from '@aesthetic-function/shared';
import { DEFAULT_CONFIG } from '@aesthetic-function/shared';

// =============================================================================
// HELPERS
// =============================================================================

function makeConfig(overrides: Partial<ResolvedAfConfig>): ResolvedAfConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

// =============================================================================
// MATERIALIZE CONFIG WIRING
// =============================================================================

describe('materialize config wiring', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MATERIALIZE_MODE;
    delete process.env.MATERIALIZE_ON;
    delete process.env.MATERIALIZE_DRY_RUN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getMaterializeMode', () => {
    it('returns "off" by default (no config, no env)', () => {
      expect(getMaterializeMode()).toBe('off');
    });

    it('reads from config when provided', () => {
      const config = makeConfig({
        materialize: { mode: 'patch', on: 'design_change', dryRun: true },
      });
      expect(getMaterializeMode(config)).toBe('patch');
    });

    it('falls back to env when no config', () => {
      process.env.MATERIALIZE_MODE = 'markers';
      expect(getMaterializeMode()).toBe('markers');
    });
  });

  describe('getMaterializeOn', () => {
    it('returns "design_change" by default', () => {
      expect(getMaterializeOn()).toBe('design_change');
    });

    it('reads from config when provided', () => {
      const config = makeConfig({
        materialize: { mode: 'off', on: 'file_save', dryRun: true },
      });
      expect(getMaterializeOn(config)).toBe('file_save');
    });

    it('falls back to env when no config', () => {
      process.env.MATERIALIZE_ON = 'file_save';
      expect(getMaterializeOn()).toBe('file_save');
    });
  });

  describe('getMaterializeDryRun', () => {
    it('returns true by default', () => {
      expect(getMaterializeDryRun()).toBe(true);
    });

    it('reads from config when provided', () => {
      const config = makeConfig({
        materialize: { mode: 'off', on: 'design_change', dryRun: false },
      });
      expect(getMaterializeDryRun(config)).toBe(false);
    });

    it('falls back to env when no config', () => {
      process.env.MATERIALIZE_DRY_RUN = 'false';
      expect(getMaterializeDryRun()).toBe(false);
    });
  });
});

// =============================================================================
// CANONICAL POLICY CONFIG WIRING
// =============================================================================

describe('canonical policy config wiring', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CANONICAL_STRICT;
    delete process.env.CANONICAL_COLOR_STRATEGY;
    delete process.env.CANONICAL_SPACING_SCALE;
    delete process.env.CANONICAL_RADIUS_SCALE;
    delete process.env.CANONICAL_TYPOGRAPHY_SCALE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getResolutionPolicyFromEnv', () => {
    it('returns default policy when no config and no env', () => {
      const policy = getResolutionPolicyFromEnv();

      expect(policy.colorStrategy).toBe('token-first');
      expect(policy.spacingScale).toBe('8pt');
      expect(policy.radiusScale).toBe('default');
      expect(policy.typographyScale).toBe('default');
      expect(policy.strict).toBe(false);
    });

    it('returns policy from config when provided', () => {
      const config = makeConfig({
        canonical: {
          colorStrategy: 'token-only',
          spacingScale: 'token-only',
          radiusScale: 'token-only',
          typographyScale: 'token-only',
          strict: true,
        },
      });
      const policy = getResolutionPolicyFromEnv(config);

      expect(policy.colorStrategy).toBe('token-only');
      expect(policy.spacingScale).toBe('token-only');
      expect(policy.radiusScale).toBe('token-only');
      expect(policy.typographyScale).toBe('token-only');
      expect(policy.strict).toBe(true);
    });

    it('falls back to env when no config', () => {
      process.env.CANONICAL_COLOR_STRATEGY = 'hex-allowed';
      process.env.CANONICAL_STRICT = 'true';
      const policy = getResolutionPolicyFromEnv();

      expect(policy.colorStrategy).toBe('hex-allowed');
      expect(policy.strict).toBe(true);
    });

    it('config with default values matches env-var defaults exactly', () => {
      // Config using DEFAULT_CONFIG values should match calling without config
      const withConfig = getResolutionPolicyFromEnv(DEFAULT_CONFIG);
      const withoutConfig = getResolutionPolicyFromEnv();

      expect(withConfig.colorStrategy).toBe(withoutConfig.colorStrategy);
      expect(withConfig.spacingScale).toBe(withoutConfig.spacingScale);
      expect(withConfig.radiusScale).toBe(withoutConfig.radiusScale);
      expect(withConfig.typographyScale).toBe(withoutConfig.typographyScale);
      expect(withConfig.strict).toBe(withoutConfig.strict);
    });
  });
});
