/**
 * @aesthetic-function/cli - __tests__/envBridge.test.ts
 *
 * Phase 15C: Tests for config → env bridge.
 *
 * CRITICAL: The env var names in deriveConfigEnv() MUST match what the
 * watcher and server actually read from process.env. The "env var names
 * match watcher/server reads" tests below verify this contract.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveConfigEnv, buildChildEnv } from '../envBridge.js';
import type { ResolvedAfConfig } from '@aesthetic-function/shared/config';

// =============================================================================
// HELPERS
// =============================================================================

function createConfig(overrides: Partial<ResolvedAfConfig> = {}): ResolvedAfConfig {
  return {
    profile: 'designer-first',
    server: { port: 3001, url: 'http://localhost:3001' },
    watcher: { watchPaths: ['demo-app/'] },
    overrides: { enabled: true, precedence: 'always' },
    materialize: { mode: 'off', on: 'design_change', dryRun: true },
    canonical: {
      colorStrategy: 'token-first',
      spacingScale: '8pt',
      radiusScale: 'default',
      typographyScale: 'default',
      strict: false,
    },
    audit: { enabled: false },
    _source: null,
    ...overrides,
  };
}

// =============================================================================
// deriveConfigEnv
// =============================================================================

describe('deriveConfigEnv', () => {
  it('maps all config fields to env vars', () => {
    const config = createConfig();
    const env = deriveConfigEnv(config);

    expect(env.PORT).toBe('3001');
    expect(env.SERVER_URL).toBe('http://localhost:3001');
    expect(env.USE_OVERRIDES).toBe('true');
    expect(env.OVERRIDES_PRECEDENCE).toBe('always');
    expect(env.MATERIALIZE_MODE).toBe('off');
    expect(env.CANONICAL_COLOR_STRATEGY).toBe('token-first');
    expect(env.CANONICAL_SPACING_SCALE).toBe('8pt');
    expect(env.CANONICAL_RADIUS_SCALE).toBe('default');
    expect(env.CANONICAL_TYPOGRAPHY_SCALE).toBe('default');
    expect(env.CANONICAL_STRICT).toBe('false');
    expect(env.RECONCILIATION_POLICY).toBe('designer-first');
  });

  it('sets ENABLE_AUDIT_LOG when audit is enabled', () => {
    const config = createConfig({ audit: { enabled: true } });
    const env = deriveConfigEnv(config);
    expect(env.ENABLE_AUDIT_LOG).toBe('true');
  });

  it('does not set ENABLE_AUDIT_LOG when audit is disabled', () => {
    const config = createConfig({ audit: { enabled: false } });
    const env = deriveConfigEnv(config);
    expect(env.ENABLE_AUDIT_LOG).toBeUndefined();
  });

  it('maps code-first profile correctly', () => {
    const config = createConfig({
      profile: 'code-first',
      overrides: { enabled: true, precedence: 'if_newer_than_code' },
    });
    const env = deriveConfigEnv(config);
    expect(env.RECONCILIATION_POLICY).toBe('code-first');
    expect(env.OVERRIDES_PRECEDENCE).toBe('if_newer_than_code');
  });

  it('maps strict-review profile correctly', () => {
    const config = createConfig({
      profile: 'strict-review',
      canonical: {
        colorStrategy: 'token-only',
        spacingScale: '8pt',
        radiusScale: 'default',
        typographyScale: 'default',
        strict: true,
      },
    });
    const env = deriveConfigEnv(config);
    expect(env.RECONCILIATION_POLICY).toBe('strict-review');
    expect(env.CANONICAL_COLOR_STRATEGY).toBe('token-only');
    expect(env.CANONICAL_STRICT).toBe('true');
  });
});

// =============================================================================
// buildChildEnv
// =============================================================================

describe('buildChildEnv', () => {
  it('merges config env with process.env', () => {
    const config = createConfig();
    const env = buildChildEnv(config);

    // Config-derived values
    expect(env.PORT).toBe('3001');
    expect(env.RECONCILIATION_POLICY).toBe('designer-first');

    // Process env values should be inherited
    expect(env.PATH).toBe(process.env.PATH);
  });
});

// =============================================================================
// ENV VAR CONTRACT: names must match what watcher/server actually read
// =============================================================================

describe('env var names match watcher/server reads', () => {
  /**
   * Smoke test: verify that deriveConfigEnv produces env var names
   * that actually appear in the watcher/server source as process.env.X reads.
   * This catches drift like COLOR_STRATEGY vs CANONICAL_COLOR_STRATEGY.
   */

  function findRepoRoot(): string {
    let dir = __dirname;
    while (dir !== '/') {
      try {
        readFileSync(join(dir, 'pnpm-workspace.yaml'));
        return dir;
      } catch {
        dir = join(dir, '..');
      }
    }
    return __dirname;
  }

  const repoRoot = findRepoRoot();

  // Map of env var → source file that reads it
  const ENV_CONTRACTS: Array<{ envVar: string; sourceFile: string; readPattern: string }> = [
    { envVar: 'PORT', sourceFile: 'packages/server/src/index.ts', readPattern: 'process.env.PORT' },
    { envVar: 'SERVER_URL', sourceFile: 'packages/watcher/src/watch.ts', readPattern: 'SERVER_URL' },
    { envVar: 'USE_OVERRIDES', sourceFile: 'packages/watcher/src/reconcile/config.ts', readPattern: 'USE_OVERRIDES' },
    { envVar: 'OVERRIDES_PRECEDENCE', sourceFile: 'packages/watcher/src/reconcile/config.ts', readPattern: 'OVERRIDES_PRECEDENCE' },
    { envVar: 'MATERIALIZE_MODE', sourceFile: 'packages/watcher/src/materialize/config.ts', readPattern: 'MATERIALIZE_MODE' },
    { envVar: 'MATERIALIZE_ON', sourceFile: 'packages/watcher/src/materialize/config.ts', readPattern: 'MATERIALIZE_ON' },
    { envVar: 'MATERIALIZE_DRY_RUN', sourceFile: 'packages/watcher/src/materialize/config.ts', readPattern: 'MATERIALIZE_DRY_RUN' },
    { envVar: 'CANONICAL_COLOR_STRATEGY', sourceFile: 'packages/watcher/src/canonicalResolverPolicy/policy.ts', readPattern: 'CANONICAL_COLOR_STRATEGY' },
    { envVar: 'CANONICAL_SPACING_SCALE', sourceFile: 'packages/watcher/src/canonicalResolverPolicy/policy.ts', readPattern: 'CANONICAL_SPACING_SCALE' },
    { envVar: 'CANONICAL_RADIUS_SCALE', sourceFile: 'packages/watcher/src/canonicalResolverPolicy/policy.ts', readPattern: 'CANONICAL_RADIUS_SCALE' },
    { envVar: 'CANONICAL_TYPOGRAPHY_SCALE', sourceFile: 'packages/watcher/src/canonicalResolverPolicy/policy.ts', readPattern: 'CANONICAL_TYPOGRAPHY_SCALE' },
    { envVar: 'CANONICAL_STRICT', sourceFile: 'packages/watcher/src/canonicalResolverPolicy/policy.ts', readPattern: 'CANONICAL_STRICT' },
    { envVar: 'RECONCILIATION_POLICY', sourceFile: 'packages/watcher/src/reconcile/profileResolver.ts', readPattern: 'RECONCILIATION_POLICY' },
    { envVar: 'ENABLE_AUDIT_LOG', sourceFile: 'packages/server/src/auditLog.ts', readPattern: 'ENABLE_AUDIT_LOG' },
  ];

  it('deriveConfigEnv produces all expected env var names', () => {
    const config = createConfig({ audit: { enabled: true } });
    const env = deriveConfigEnv(config);

    for (const { envVar } of ENV_CONTRACTS) {
      expect(env).toHaveProperty(envVar, expect.any(String));
    }
  });

  for (const { envVar, sourceFile, readPattern } of ENV_CONTRACTS) {
    it(`${envVar} is read by ${sourceFile}`, () => {
      const fullPath = join(repoRoot, sourceFile);
      const source = readFileSync(fullPath, 'utf-8');
      expect(source).toContain(readPattern);
    });
  }
});
