/**
 * @aesthetic-function/watcher - designAdapter/__tests__/figmaMCPAdapter.test.ts
 *
 * Phase 16A: Tests for FigmaMCPAdapter stub.
 */

import { describe, it, expect } from 'vitest';
import { FigmaMCPAdapter } from '../figmaMCPAdapter.js';

describe('FigmaMCPAdapter', () => {
  const adapter = new FigmaMCPAdapter();

  it('has correct identity', () => {
    expect(adapter.id).toBe('figma-mcp');
    expect(adapter.displayName).toBe('Figma MCP Adapter');
    expect(adapter.version).toBe('0.1.0');
  });

  it('isAvailable returns true by default', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable can be disabled', async () => {
    const disabled = new FigmaMCPAdapter({ available: false });
    expect(await disabled.isAvailable()).toBe(false);
  });

  it('getDesignTokens returns mock tokens', async () => {
    const result = await adapter.getDesignTokens();

    expect(result.adapterId).toBe('figma-mcp');
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.cached).toBe(false);

    // Should include color, spacing, radius, and typography tokens
    const types = new Set(result.data.map(t => t.type));
    expect(types.has('color')).toBe(true);
    expect(types.has('spacing')).toBe(true);
    expect(types.has('radius')).toBe(true);
    expect(types.has('typography')).toBe(true);
  });

  it('getComponent finds Button', async () => {
    const result = await adapter.getComponent('Button');

    expect(result.data).not.toBeNull();
    expect(result.data?.name).toBe('Button');
    expect(result.data?.variants).toBeDefined();
    expect(result.data!.variants!.length).toBeGreaterThan(0);
  });

  it('getComponent is case-insensitive', async () => {
    const result = await adapter.getComponent('button');
    expect(result.data?.name).toBe('Button');
  });

  it('getComponent returns null for unknown', async () => {
    const result = await adapter.getComponent('NonExistent');
    expect(result.data).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getComponents returns all mock components', async () => {
    const result = await adapter.getComponents();
    expect(result.data.length).toBeGreaterThan(0);

    const names = result.data.map(c => c.name);
    expect(names).toContain('Button');
    expect(names).toContain('Card');
  });

  it('getStyles returns mock styles', async () => {
    const result = await adapter.getStyles();
    expect(result.data.length).toBeGreaterThan(0);

    const types = new Set(result.data.map(s => s.type));
    expect(types.has('fill')).toBe(true);
    expect(types.has('text')).toBe(true);
  });

  it('getFileData returns metadata', async () => {
    const result = await adapter.getFileData();

    expect(result.data.name).toBeTruthy();
    expect(result.data.componentCount).toBeGreaterThan(0);
    expect(result.data.styleCount).toBeGreaterThan(0);
    expect(result.data.variableCount).toBeGreaterThan(0);
    expect(result.data.meta?.transport).toBe('mock');
    expect(result.warnings.length).toBeGreaterThan(0); // stub warning
  });
});
