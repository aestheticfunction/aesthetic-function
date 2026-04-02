/**
 * @aesthetic-function/watcher - designAdapter/__tests__/storybookAdapter.test.ts
 *
 * Phase 16A Extension: Tests for Storybook Adapter stub.
 */

import { describe, it, expect } from 'vitest';

import { StorybookAdapter } from '../storybookAdapter.js';

describe('StorybookAdapter', () => {
  const adapter = new StorybookAdapter();

  it('has correct id and display name', () => {
    expect(adapter.id).toBe('storybook');
    expect(adapter.displayName).toBe('Storybook Adapter');
  });

  it('has correct surface metadata classification', () => {
    expect(adapter.surfaceMetadata).toEqual({
      surfaceType: 'runtime',
      accessMode: 'read-only',
      authorityRole: 'external-non-authoritative',
      stability: 'observational',
    });
  });

  it('reports as unavailable (stub)', async () => {
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('returns empty design tokens', async () => {
    const result = await adapter.getDesignTokens();
    expect(result.data).toEqual([]);
    expect(result.adapterId).toBe('storybook');
  });

  it('returns mock component by name', async () => {
    const result = await adapter.getComponent('Button');
    expect(result.data).not.toBeNull();
    expect(result.data!.name).toBe('Button');
    expect(result.data!.id).toBe('storybook:Button');
  });

  it('blocks all write capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.writeDesign).toBe(false);
    expect(caps.writeVariables).toBe(false);
    expect(caps.executeDesignCode).toBe(false);
    expect(caps.writeVariableCollections).toBe(false);
    expect(caps.cloudWriteRelay).toBe(false);
    expect(caps.writeFigJam).toBe(false);
    expect(caps.writeSlides).toBe(false);
  });

  it('allows readComponents only', () => {
    const caps = adapter.getCapabilities();
    expect(caps.readComponents).toBe(true);
    expect(caps.readDesignTokens).toBe(false);
    expect(caps.readStyles).toBe(false);
  });
});
