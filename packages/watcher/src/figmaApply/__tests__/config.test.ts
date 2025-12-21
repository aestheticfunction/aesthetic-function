/**
 * @aesthetic-function/watcher - figmaApply/__tests__/config.test.ts
 *
 * Unit tests for Phase 11C config loading.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadApplyConfig,
  DEFAULT_APPLY_CONFIG,
  canApply,
  isCategoryAllowed,
  getApplyStatus,
} from '../config.js';
import type { ApplyConfig } from '../types.js';

describe('loadApplyConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.FIGMA_APPLY_ON;
    delete process.env.FIGMA_APPLY_MODE;
    delete process.env.FIGMA_APPLY_DRY_RUN;
    delete process.env.FIGMA_APPLY_ALLOW;
    delete process.env.FIGMA_APPLY_SERVER;
    delete process.env.FIGMA_APPLY_MIN_CONFIDENCE;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars set', () => {
    const config = loadApplyConfig();
    expect(config).toEqual(DEFAULT_APPLY_CONFIG);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe('artifact');
    expect(config.dryRun).toBe(true);
    expect(config.allow).toEqual([]);
    expect(config.serverUrl).toBe('http://localhost:3001');
    expect(config.minConfidence).toBe('high');
  });

  it('parses FIGMA_APPLY_ON=true', () => {
    process.env.FIGMA_APPLY_ON = 'true';
    const config = loadApplyConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_APPLY_ON=1', () => {
    process.env.FIGMA_APPLY_ON = '1';
    const config = loadApplyConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_APPLY_ON=yes', () => {
    process.env.FIGMA_APPLY_ON = 'yes';
    const config = loadApplyConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_APPLY_ON=false as disabled', () => {
    process.env.FIGMA_APPLY_ON = 'false';
    const config = loadApplyConfig();
    expect(config.enabled).toBe(false);
  });

  it('parses FIGMA_APPLY_MODE=apply', () => {
    process.env.FIGMA_APPLY_MODE = 'apply';
    const config = loadApplyConfig();
    expect(config.mode).toBe('apply');
  });

  it('parses FIGMA_APPLY_MODE=artifact', () => {
    process.env.FIGMA_APPLY_MODE = 'artifact';
    const config = loadApplyConfig();
    expect(config.mode).toBe('artifact');
  });

  it('defaults to artifact for invalid mode', () => {
    process.env.FIGMA_APPLY_MODE = 'invalid';
    const config = loadApplyConfig();
    expect(config.mode).toBe('artifact');
  });

  it('parses FIGMA_APPLY_DRY_RUN=false', () => {
    process.env.FIGMA_APPLY_DRY_RUN = 'false';
    const config = loadApplyConfig();
    expect(config.dryRun).toBe(false);
  });

  it('parses FIGMA_APPLY_DRY_RUN=true', () => {
    process.env.FIGMA_APPLY_DRY_RUN = 'true';
    const config = loadApplyConfig();
    expect(config.dryRun).toBe(true);
  });

  it('parses FIGMA_APPLY_ALLOW single category', () => {
    process.env.FIGMA_APPLY_ALLOW = 'fill';
    const config = loadApplyConfig();
    expect(config.allow).toEqual(['fill']);
  });

  it('parses FIGMA_APPLY_ALLOW multiple categories', () => {
    process.env.FIGMA_APPLY_ALLOW = 'fill,spacing,typography';
    const config = loadApplyConfig();
    expect(config.allow).toEqual(['fill', 'spacing', 'typography']);
  });

  it('parses FIGMA_APPLY_ALLOW with spaces', () => {
    process.env.FIGMA_APPLY_ALLOW = 'fill, spacing, typography';
    const config = loadApplyConfig();
    expect(config.allow).toEqual(['fill', 'spacing', 'typography']);
  });

  it('filters invalid allow categories', () => {
    process.env.FIGMA_APPLY_ALLOW = 'fill,invalid,spacing';
    const config = loadApplyConfig();
    expect(config.allow).toEqual(['fill', 'spacing']);
  });

  it('deduplicates allow categories', () => {
    process.env.FIGMA_APPLY_ALLOW = 'fill,fill,spacing';
    const config = loadApplyConfig();
    expect(config.allow).toEqual(['fill', 'spacing']);
  });

  it('parses FIGMA_APPLY_SERVER', () => {
    process.env.FIGMA_APPLY_SERVER = 'http://custom:8080';
    const config = loadApplyConfig();
    expect(config.serverUrl).toBe('http://custom:8080');
  });

  it('parses FIGMA_APPLY_MIN_CONFIDENCE=low', () => {
    process.env.FIGMA_APPLY_MIN_CONFIDENCE = 'low';
    const config = loadApplyConfig();
    expect(config.minConfidence).toBe('low');
  });

  it('parses FIGMA_APPLY_MIN_CONFIDENCE=medium', () => {
    process.env.FIGMA_APPLY_MIN_CONFIDENCE = 'medium';
    const config = loadApplyConfig();
    expect(config.minConfidence).toBe('medium');
  });

  it('defaults to high for invalid confidence', () => {
    process.env.FIGMA_APPLY_MIN_CONFIDENCE = 'invalid';
    const config = loadApplyConfig();
    expect(config.minConfidence).toBe('high');
  });
});

describe('canApply', () => {
  it('returns false when disabled', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: false,
      mode: 'apply',
      dryRun: false,
    };
    expect(canApply(config)).toBe(false);
  });

  it('returns false when mode is artifact', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'artifact',
      dryRun: false,
    };
    expect(canApply(config)).toBe(false);
  });

  it('returns false when dryRun is true', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'apply',
      dryRun: true,
    };
    expect(canApply(config)).toBe(false);
  });

  it('returns true when enabled, mode=apply, dryRun=false', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'apply',
      dryRun: false,
    };
    expect(canApply(config)).toBe(true);
  });
});

describe('isCategoryAllowed', () => {
  it('returns false when allow list is empty', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: [],
    };
    expect(isCategoryAllowed(config, 'fill')).toBe(false);
    expect(isCategoryAllowed(config, 'spacing')).toBe(false);
    expect(isCategoryAllowed(config, 'typography')).toBe(false);
  });

  it('returns true for allowed category', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
    };
    expect(isCategoryAllowed(config, 'fill')).toBe(true);
  });

  it('returns false for non-allowed category', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
    };
    expect(isCategoryAllowed(config, 'spacing')).toBe(false);
  });

  it('allows multiple categories', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill', 'typography'],
    };
    expect(isCategoryAllowed(config, 'fill')).toBe(true);
    expect(isCategoryAllowed(config, 'typography')).toBe(true);
    expect(isCategoryAllowed(config, 'spacing')).toBe(false);
  });
});

describe('getApplyStatus', () => {
  it('returns DISABLED when not enabled', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: false,
    };
    expect(getApplyStatus(config)).toContain('DISABLED');
  });

  it('returns ARTIFACT-ONLY when mode is artifact', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'artifact',
    };
    expect(getApplyStatus(config)).toContain('ARTIFACT');
  });

  it('returns DRY-RUN when dryRun is true', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'apply',
      dryRun: true,
    };
    expect(getApplyStatus(config)).toContain('DRY-RUN');
  });

  it('returns APPLY ENABLED when fully enabled', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      enabled: true,
      mode: 'apply',
      dryRun: false,
    };
    expect(getApplyStatus(config)).toContain('APPLY ENABLED');
  });
});
