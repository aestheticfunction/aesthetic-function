/**
 * @aesthetic-function/watcher - compose/__tests__/config.test.ts
 *
 * Unit tests for Phase 11B config loading.
 */

import { describe, it, expect } from 'vitest';
import { loadComposeConfig, DEFAULT_COMPOSE_CONFIG } from '../config.js';

describe('loadComposeConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = loadComposeConfig({});
    expect(config).toEqual(DEFAULT_COMPOSE_CONFIG);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe('off');
    expect(config.allow).toEqual([]);
    expect(config.serverUrl).toBe('http://localhost:3001');
  });

  it('parses FIGMA_COMPOSE_ON=true', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ON: 'true' });
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_COMPOSE_ON=1', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ON: '1' });
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_COMPOSE_ON=yes', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ON: 'yes' });
    expect(config.enabled).toBe(true);
  });

  it('parses FIGMA_COMPOSE_ON=false as disabled', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ON: 'false' });
    expect(config.enabled).toBe(false);
  });

  it('parses FIGMA_COMPOSE_MODE=dry-run', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_MODE: 'dry-run' });
    expect(config.mode).toBe('dry-run');
  });

  it('parses FIGMA_COMPOSE_MODE=dryrun (no hyphen)', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_MODE: 'dryrun' });
    expect(config.mode).toBe('dry-run');
  });

  it('parses FIGMA_COMPOSE_MODE=apply', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_MODE: 'apply' });
    expect(config.mode).toBe('apply');
  });

  it('defaults to off for invalid mode', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_MODE: 'invalid' });
    expect(config.mode).toBe('off');
  });

  it('parses FIGMA_COMPOSE_ALLOW single type', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ALLOW: 'component-set' });
    expect(config.allow).toEqual(['component-set']);
  });

  it('parses FIGMA_COMPOSE_ALLOW multiple types', () => {
    const config = loadComposeConfig({
      FIGMA_COMPOSE_ALLOW: 'component-set,variant,property',
    });
    expect(config.allow).toEqual(['component-set', 'variant', 'property']);
  });

  it('parses FIGMA_COMPOSE_ALLOW with spaces', () => {
    const config = loadComposeConfig({
      FIGMA_COMPOSE_ALLOW: 'component-set, variant, property',
    });
    expect(config.allow).toEqual(['component-set', 'variant', 'property']);
  });

  it('handles componentset alias', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ALLOW: 'componentset' });
    expect(config.allow).toEqual(['component-set']);
  });

  it('handles component_set alias', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ALLOW: 'component_set' });
    expect(config.allow).toEqual(['component-set']);
  });

  it('filters invalid allow types', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_ALLOW: 'component-set,invalid,variant' });
    expect(config.allow).toEqual(['component-set', 'variant']);
  });

  it('deduplicates allow types', () => {
    const config = loadComposeConfig({
      FIGMA_COMPOSE_ALLOW: 'component-set,component-set,variant',
    });
    expect(config.allow).toEqual(['component-set', 'variant']);
  });

  it('parses FIGMA_COMPOSE_SERVER', () => {
    const config = loadComposeConfig({ FIGMA_COMPOSE_SERVER: 'http://example.com:8080' });
    expect(config.serverUrl).toBe('http://example.com:8080');
  });

  it('combines all env vars', () => {
    const config = loadComposeConfig({
      FIGMA_COMPOSE_ON: 'true',
      FIGMA_COMPOSE_MODE: 'apply',
      FIGMA_COMPOSE_ALLOW: 'component-set,variant',
      FIGMA_COMPOSE_SERVER: 'http://my-server:3000',
    });
    expect(config).toEqual({
      enabled: true,
      mode: 'apply',
      allow: ['component-set', 'variant'],
      serverUrl: 'http://my-server:3000',
    });
  });
});
