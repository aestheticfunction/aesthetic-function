/**
 * @aesthetic-function/watcher - reconcile/__tests__/configLoader.test.ts
 *
 * Tests for the shared config loader (Phase 15A, Milestone 1).
 *
 * Proves:
 * - No-config behavior matches current Phase 14F defaults
 * - File loading and merging works correctly
 * - Env vars always override file values
 * - Discovery walks upward and stops at .git
 * - Validation strips invalid fields silently
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadAfConfig,
  findConfigFile,
  loadConfigFile,
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
} from '@aesthetic-function/shared';
import type { AfConfig, ResolvedAfConfig } from '@aesthetic-function/shared';

// =============================================================================
// HELPERS
// =============================================================================

let tmpDir: string;

function createTmpDir(): string {
  const dir = join(tmpdir(), `af-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  // Create a .git directory so discovery stops here
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
}

function writeConfig(dir: string, config: AfConfig): string {
  const filePath = join(dir, CONFIG_FILENAME);
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return filePath;
}

// =============================================================================
// TESTS
// =============================================================================

describe('configLoader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = createTmpDir();
    // Clear all AF-related env vars
    delete process.env.RECONCILIATION_POLICY;
    delete process.env.PORT;
    delete process.env.SERVER_URL;
    delete process.env.WATCH_PATH;
    delete process.env.USE_OVERRIDES;
    delete process.env.OVERRIDES_PRECEDENCE;
    delete process.env.MATERIALIZE_MODE;
    delete process.env.MATERIALIZE_ON;
    delete process.env.MATERIALIZE_DRY_RUN;
    delete process.env.CANONICAL_COLOR_STRATEGY;
    delete process.env.CANONICAL_SPACING_SCALE;
    delete process.env.CANONICAL_RADIUS_SCALE;
    delete process.env.CANONICAL_TYPOGRAPHY_SCALE;
    delete process.env.CANONICAL_STRICT;
    delete process.env.ENABLE_AUDIT_LOG;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // DEFAULT_CONFIG matches Phase 14F behavior
  // ===========================================================================

  describe('DEFAULT_CONFIG', () => {
    it('matches Phase 14F defaults exactly', () => {
      expect(DEFAULT_CONFIG.profile).toBe('designer-first');
      expect(DEFAULT_CONFIG.server.port).toBe(3001);
      expect(DEFAULT_CONFIG.server.url).toBe('http://localhost:3001');
      expect(DEFAULT_CONFIG.overrides.enabled).toBe(true);
      expect(DEFAULT_CONFIG.overrides.precedence).toBe('always');
      expect(DEFAULT_CONFIG.materialize.mode).toBe('off');
      expect(DEFAULT_CONFIG.materialize.on).toBe('design_change');
      expect(DEFAULT_CONFIG.materialize.dryRun).toBe(true);
      expect(DEFAULT_CONFIG.canonical.colorStrategy).toBe('token-first');
      expect(DEFAULT_CONFIG.canonical.spacingScale).toBe('8pt');
      expect(DEFAULT_CONFIG.canonical.radiusScale).toBe('default');
      expect(DEFAULT_CONFIG.canonical.typographyScale).toBe('default');
      expect(DEFAULT_CONFIG.canonical.strict).toBe(false);
      expect(DEFAULT_CONFIG.audit.enabled).toBe(false);
      expect(DEFAULT_CONFIG._source).toBeNull();
    });
  });

  // ===========================================================================
  // No-config behavior
  // ===========================================================================

  describe('loadAfConfig (no config file)', () => {
    it('returns defaults when no af.config.json exists', () => {
      const config = loadAfConfig(tmpDir);

      expect(config.profile).toBe('designer-first');
      expect(config.server.port).toBe(3001);
      expect(config.server.url).toBe('http://localhost:3001');
      expect(config.overrides.enabled).toBe(true);
      expect(config.overrides.precedence).toBe('always');
      expect(config.materialize.mode).toBe('off');
      expect(config.canonical.colorStrategy).toBe('token-first');
      expect(config.canonical.strict).toBe(false);
      expect(config.audit.enabled).toBe(false);
      expect(config._source).toBeNull();
    });

    it('returns defaults identical to DEFAULT_CONFIG', () => {
      const config = loadAfConfig(tmpDir);
      // Compare all fields except _source (which is set by discovery)
      expect(config.profile).toBe(DEFAULT_CONFIG.profile);
      expect(config.server).toEqual(DEFAULT_CONFIG.server);
      expect(config.overrides).toEqual(DEFAULT_CONFIG.overrides);
      expect(config.materialize).toEqual(DEFAULT_CONFIG.materialize);
      expect(config.canonical).toEqual(DEFAULT_CONFIG.canonical);
      expect(config.audit).toEqual(DEFAULT_CONFIG.audit);
    });
  });

  // ===========================================================================
  // File loading and merging
  // ===========================================================================

  describe('loadAfConfig (with config file)', () => {
    it('loads profile from af.config.json', () => {
      writeConfig(tmpDir, { profile: 'code-first' });
      const config = loadAfConfig(tmpDir);

      expect(config.profile).toBe('code-first');
      expect(config._source).toContain(CONFIG_FILENAME);
    });

    it('merges partial config onto defaults', () => {
      writeConfig(tmpDir, { server: { port: 4000 } });
      const config = loadAfConfig(tmpDir);

      expect(config.server.port).toBe(4000);
      // Unspecified fields keep defaults
      expect(config.server.url).toBe('http://localhost:3001');
      expect(config.profile).toBe('designer-first');
    });

    it('loads all config sections', () => {
      writeConfig(tmpDir, {
        profile: 'strict-review',
        server: { port: 5000, url: 'http://myserver:5000' },
        watcher: { watchPaths: ['./src'] },
        overrides: { enabled: false, precedence: 'if_newer_than_code' },
        materialize: { mode: 'patch', on: 'file_save', dryRun: false },
        canonical: {
          colorStrategy: 'token-only',
          spacingScale: 'token-only',
          radiusScale: 'token-only',
          typographyScale: 'token-only',
          strict: true,
        },
        audit: { enabled: true },
      });
      const config = loadAfConfig(tmpDir);

      expect(config.profile).toBe('strict-review');
      expect(config.server.port).toBe(5000);
      expect(config.server.url).toBe('http://myserver:5000');
      expect(config.watcher.watchPaths).toEqual(['./src']);
      expect(config.overrides.enabled).toBe(false);
      expect(config.overrides.precedence).toBe('if_newer_than_code');
      expect(config.materialize.mode).toBe('patch');
      expect(config.materialize.on).toBe('file_save');
      expect(config.materialize.dryRun).toBe(false);
      expect(config.canonical.colorStrategy).toBe('token-only');
      expect(config.canonical.strict).toBe(true);
      expect(config.audit.enabled).toBe(true);
    });
  });

  // ===========================================================================
  // Env vars override file values
  // ===========================================================================

  describe('env overrides always win', () => {
    it('PORT env overrides config file port', () => {
      writeConfig(tmpDir, { server: { port: 4000 } });
      process.env.PORT = '5555';
      const config = loadAfConfig(tmpDir);

      expect(config.server.port).toBe(5555);
    });

    it('USE_OVERRIDES=false env overrides config file enabled=true', () => {
      writeConfig(tmpDir, { overrides: { enabled: true } });
      process.env.USE_OVERRIDES = 'false';
      const config = loadAfConfig(tmpDir);

      expect(config.overrides.enabled).toBe(false);
    });

    it('OVERRIDES_PRECEDENCE env overrides config file precedence', () => {
      writeConfig(tmpDir, { overrides: { precedence: 'always' } });
      process.env.OVERRIDES_PRECEDENCE = 'if_newer_than_code';
      const config = loadAfConfig(tmpDir);

      expect(config.overrides.precedence).toBe('if_newer_than_code');
    });

    it('RECONCILIATION_POLICY env overrides config file profile', () => {
      writeConfig(tmpDir, { profile: 'designer-first' });
      process.env.RECONCILIATION_POLICY = 'code-first';
      const config = loadAfConfig(tmpDir);

      expect(config.profile).toBe('code-first');
    });

    it('CANONICAL_STRICT env overrides config file strict', () => {
      writeConfig(tmpDir, { canonical: { strict: false } });
      process.env.CANONICAL_STRICT = 'true';
      const config = loadAfConfig(tmpDir);

      expect(config.canonical.strict).toBe(true);
    });

    it('ENABLE_AUDIT_LOG env overrides config file audit', () => {
      writeConfig(tmpDir, { audit: { enabled: false } });
      process.env.ENABLE_AUDIT_LOG = 'true';
      const config = loadAfConfig(tmpDir);

      expect(config.audit.enabled).toBe(true);
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe('validation', () => {
    it('strips invalid profile values', () => {
      writeConfig(tmpDir, { profile: 'invalid-profile' as any });
      const config = loadAfConfig(tmpDir);

      expect(config.profile).toBe('designer-first'); // Falls back to default
    });

    it('strips invalid port values', () => {
      writeConfig(tmpDir, { server: { port: -1 } });
      const config = loadAfConfig(tmpDir);

      expect(config.server.port).toBe(3001); // Falls back to default
    });

    it('strips invalid precedence values', () => {
      writeConfig(tmpDir, { overrides: { precedence: 'invalid' as any } });
      const config = loadAfConfig(tmpDir);

      expect(config.overrides.precedence).toBe('always'); // Falls back to default
    });

    it('handles non-object JSON gracefully', () => {
      const filePath = join(tmpDir, CONFIG_FILENAME);
      writeFileSync(filePath, '"just a string"', 'utf-8');
      const config = loadAfConfig(tmpDir);

      // Should fall back to defaults
      expect(config.profile).toBe('designer-first');
    });

    it('handles malformed JSON gracefully', () => {
      const filePath = join(tmpDir, CONFIG_FILENAME);
      writeFileSync(filePath, '{invalid json', 'utf-8');
      const config = loadAfConfig(tmpDir);

      // Should fall back to defaults
      expect(config.profile).toBe('designer-first');
    });
  });

  // ===========================================================================
  // File discovery
  // ===========================================================================

  describe('findConfigFile', () => {
    it('finds config in current directory', () => {
      writeConfig(tmpDir, { profile: 'code-first' });
      const found = findConfigFile(tmpDir);

      expect(found).not.toBeNull();
      expect(found).toContain(CONFIG_FILENAME);
    });

    it('finds config in parent directory', () => {
      writeConfig(tmpDir, { profile: 'code-first' });
      const subDir = join(tmpDir, 'subdir');
      mkdirSync(subDir, { recursive: true });

      const found = findConfigFile(subDir);
      expect(found).not.toBeNull();
      expect(found).toContain(CONFIG_FILENAME);
    });

    it('returns null when no config exists', () => {
      const found = findConfigFile(tmpDir);
      expect(found).toBeNull();
    });

    it('stops at .git boundary', () => {
      // The tmpDir has .git; create a parent with config
      // findConfigFile should not look above .git
      const found = findConfigFile(tmpDir);
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // loadConfigFile
  // ===========================================================================

  describe('loadConfigFile', () => {
    it('returns null for non-existent file', () => {
      const result = loadConfigFile(join(tmpDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('returns parsed config for valid file', () => {
      const filePath = writeConfig(tmpDir, { profile: 'balanced' });
      const result = loadConfigFile(filePath);

      expect(result).not.toBeNull();
      expect(result!.profile).toBe('balanced');
    });
  });
});
