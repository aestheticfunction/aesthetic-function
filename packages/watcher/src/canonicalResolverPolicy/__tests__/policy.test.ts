/**
 * @aesthetic-function/watcher - canonicalResolverPolicy/__tests__/policy.test.ts
 *
 * Unit tests for the Canonical Resolution Policy (Phase 10G).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getResolutionPolicyFromEnv,
  applyPolicyToResolution,
  formatPolicy,
  DEFAULT_POLICY,
} from '../policy.js';
import type { ResolutionPolicy } from '../types.js';
import type { CanonicalResolution } from '../../canonicalResolver/types.js';

describe('getResolutionPolicyFromEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.CANONICAL_STRICT;
    delete process.env.CANONICAL_COLOR_STRATEGY;
    delete process.env.CANONICAL_SPACING_SCALE;
    delete process.env.CANONICAL_RADIUS_SCALE;
    delete process.env.CANONICAL_TYPOGRAPHY_SCALE;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('returns default policy when no env vars set', () => {
    const policy = getResolutionPolicyFromEnv();

    expect(policy.colorStrategy).toBe('token-first');
    expect(policy.spacingScale).toBe('8pt');
    expect(policy.radiusScale).toBe('default');
    expect(policy.typographyScale).toBe('default');
    expect(policy.strict).toBe(false);
  });

  it('reads CANONICAL_STRICT=true', () => {
    process.env.CANONICAL_STRICT = 'true';

    const policy = getResolutionPolicyFromEnv();

    expect(policy.strict).toBe(true);
  });

  it('reads CANONICAL_COLOR_STRATEGY=token-only', () => {
    process.env.CANONICAL_COLOR_STRATEGY = 'token-only';

    const policy = getResolutionPolicyFromEnv();

    expect(policy.colorStrategy).toBe('token-only');
  });

  it('reads CANONICAL_COLOR_STRATEGY=hex-allowed', () => {
    process.env.CANONICAL_COLOR_STRATEGY = 'hex-allowed';

    const policy = getResolutionPolicyFromEnv();

    expect(policy.colorStrategy).toBe('hex-allowed');
  });

  it('reads CANONICAL_SPACING_SCALE=token-only', () => {
    process.env.CANONICAL_SPACING_SCALE = 'token-only';

    const policy = getResolutionPolicyFromEnv();

    expect(policy.spacingScale).toBe('token-only');
  });

  it('falls back to default for invalid values', () => {
    process.env.CANONICAL_COLOR_STRATEGY = 'invalid';
    process.env.CANONICAL_SPACING_SCALE = 'invalid';

    const policy = getResolutionPolicyFromEnv();

    expect(policy.colorStrategy).toBe('token-first');
    expect(policy.spacingScale).toBe('8pt');
  });
});

describe('applyPolicyToResolution', () => {
  describe('token-first color strategy (default)', () => {
    const policy: ResolutionPolicy = {
      ...DEFAULT_POLICY,
      colorStrategy: 'token-first',
    };

    it('allows resolved canonical tokens', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: 'color.primary',
            resolved: '#3B82F6',
            confidence: 'high',
            source: 'vuetify',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.passed).toBe(1);
      expect(result.violated).toBe(0);
      expect(result.violations).toHaveLength(0);
    });

    it('allows raw hex colors in token-first mode', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: '#FF5733',
            resolved: '#FF5733',
            confidence: 'medium',
            source: 'generic-jsx',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.passed).toBe(1);
      expect(result.violated).toBe(0);
    });
  });

  describe('token-only color strategy', () => {
    const policy: ResolutionPolicy = {
      ...DEFAULT_POLICY,
      colorStrategy: 'token-only',
    };

    it('marks raw hex colors as violations', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: '#FF5733',
            resolved: '#FF5733',
            confidence: 'medium',
            source: 'generic-jsx',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.passed).toBe(0);
      expect(result.violated).toBe(1);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].canonical).toBe('#FF5733');
      expect(result.violations[0].category).toBe('colors');
      expect(result.violations[0].reason).toContain('token-only');
    });

    it('allows canonical tokens that resolved', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: 'color.primary',
            resolved: '#3B82F6',
            confidence: 'high',
            source: 'vuetify',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.passed).toBe(1);
      expect(result.violated).toBe(0);
    });
  });

  describe('strict mode', () => {
    const strictPolicy: ResolutionPolicy = {
      ...DEFAULT_POLICY,
      strict: true,
    };

    it('marks unresolved canonical tokens as violations', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: 'color.unknown',
            resolved: undefined,
            confidence: 'low',
            source: 'generic-jsx',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 0, unresolvedCount: 1, notesCount: 1 },
      };

      const result = applyPolicyToResolution(resolution, strictPolicy);

      expect(result.violated).toBe(1);
      expect(result.violations[0].canonical).toBe('color.unknown');
      expect(result.violations[0].reason).toContain('could not be resolved');
    });

    it('does not mark resolved tokens as violations', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: 'color.primary',
            resolved: '#3B82F6',
            confidence: 'high',
            source: 'vuetify',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, strictPolicy);

      expect(result.violated).toBe(0);
    });
  });

  describe('token-only spacing strategy', () => {
    const policy: ResolutionPolicy = {
      ...DEFAULT_POLICY,
      spacingScale: 'token-only',
    };

    it('marks raw numeric spacing as violations', () => {
      const resolution: CanonicalResolution = {
        colors: {},
        spacing: {
          gap: {
            canonical: '12px',
            resolved: 12,
            confidence: 'low',
            source: 'generic-jsx',
            note: 'Raw numeric value',
          },
        },
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 1 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.violated).toBe(1);
      expect(result.violations[0].canonical).toBe('12px');
      expect(result.violations[0].category).toBe('spacing');
    });

    it('allows canonical spacing tokens', () => {
      const resolution: CanonicalResolution = {
        colors: {},
        spacing: {
          gap: {
            canonical: 'space.md',
            resolved: 16,
            confidence: 'high',
            source: 'vuetify',
          },
        },
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const result = applyPolicyToResolution(resolution, policy);

      expect(result.passed).toBe(1);
      expect(result.violated).toBe(0);
    });
  });

  describe('context tracking', () => {
    it('includes file and componentKey in violations', () => {
      const resolution: CanonicalResolution = {
        colors: {
          fill: {
            canonical: '#FF5733',
            resolved: '#FF5733',
            confidence: 'medium',
            source: 'generic-jsx',
          },
        },
        spacing: {},
        radius: {},
        typography: {},
        meta: { resolvedCount: 1, unresolvedCount: 0, notesCount: 0 },
      };

      const policy: ResolutionPolicy = {
        ...DEFAULT_POLICY,
        colorStrategy: 'token-only',
      };

      const result = applyPolicyToResolution(resolution, policy, {
        file: 'src/components/Button.tsx',
        componentKey: 'PrimaryButton',
      });

      expect(result.violations[0].file).toBe('src/components/Button.tsx');
      expect(result.violations[0].componentKey).toBe('PrimaryButton');
    });
  });
});

describe('formatPolicy', () => {
  it('formats default policy', () => {
    const formatted = formatPolicy(DEFAULT_POLICY);

    expect(formatted).toContain('color=token-first');
    expect(formatted).toContain('spacing=8pt');
    expect(formatted).toContain('radius=default');
    expect(formatted).toContain('typography=default');
    expect(formatted).not.toContain('strict=true');
  });

  it('includes strict=true when enabled', () => {
    const strictPolicy: ResolutionPolicy = {
      ...DEFAULT_POLICY,
      strict: true,
    };

    const formatted = formatPolicy(strictPolicy);

    expect(formatted).toContain('strict=true');
  });

  it('shows custom strategies', () => {
    const customPolicy: ResolutionPolicy = {
      colorStrategy: 'token-only',
      spacingScale: 'token-only',
      radiusScale: 'token-only',
      typographyScale: 'token-only',
      strict: true,
    };

    const formatted = formatPolicy(customPolicy);

    expect(formatted).toContain('color=token-only');
    expect(formatted).toContain('spacing=token-only');
    expect(formatted).toContain('radius=token-only');
    expect(formatted).toContain('typography=token-only');
    expect(formatted).toContain('strict=true');
  });
});

describe('policy result determinism', () => {
  it('produces deterministic results for same input', () => {
    const resolution: CanonicalResolution = {
      colors: {
        fill: { canonical: '#FF5733', resolved: '#FF5733', confidence: 'medium', source: 'generic-jsx' },
      },
      spacing: {
        gap: { canonical: 'space.md', resolved: 16, confidence: 'high', source: 'vuetify' },
      },
      radius: {},
      typography: {},
      meta: { resolvedCount: 2, unresolvedCount: 0, notesCount: 0 },
    };

    const policy: ResolutionPolicy = {
      colorStrategy: 'token-only',
      spacingScale: '8pt',
      radiusScale: 'default',
      typographyScale: 'default',
      strict: false,
    };

    const result1 = applyPolicyToResolution(resolution, policy);
    const result2 = applyPolicyToResolution(resolution, policy);

    expect(result1.passed).toBe(result2.passed);
    expect(result1.violated).toBe(result2.violated);
    expect(result1.violations.length).toBe(result2.violations.length);
    expect(result1.violations[0].canonical).toBe(result2.violations[0].canonical);
  });
});
