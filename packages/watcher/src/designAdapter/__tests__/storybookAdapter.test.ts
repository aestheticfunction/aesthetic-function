/**
 * @aesthetic-function/watcher - designAdapter/__tests__/storybookAdapter.test.ts
 *
 * Phase 16C: Tests for StorybookMCPAdapter.
 *
 * Tests:
 * - Identity and version
 * - Surface metadata classification
 * - Capability manifest (reflects operating mode, write blocking)
 * - BLOCKED/ALLOWED tool registries
 * - isAvailable behavior (dev server unreachable, framework guard)
 * - AdapterResult shape compliance
 *
 * NOTE: These tests do NOT call a real Storybook server. They test the adapter's
 * structure, capability enforcement, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  StorybookMCPAdapter,
  BLOCKED_STORYBOOK_TOOLS,
  BLOCKED_STORYBOOK_TOOL_NAMES,
  ALLOWED_STORYBOOK_TOOLS,
  ALLOWED_STORYBOOK_TOOL_NAMES,
} from '../storybookAdapter.js';
import type { StorybookMCPConfig } from '@aesthetic-function/shared/storybookAdapter';

// =============================================================================
// CONFIG HELPERS
// =============================================================================

function makeConfig(overrides?: Partial<StorybookMCPConfig>): StorybookMCPConfig {
  return {
    url: 'http://localhost:6006',
    mcpPath: '/mcp',
    timeout: 5000,
    framework: 'react',
    ...overrides,
  };
}

// =============================================================================
// IDENTITY
// =============================================================================

describe('StorybookMCPAdapter identity', () => {
  const adapter = new StorybookMCPAdapter(makeConfig());

  it('has correct id', () => {
    expect(adapter.id).toBe('storybook-mcp');
  });

  it('has correct displayName', () => {
    expect(adapter.displayName).toBe('Storybook MCP Adapter');
  });

  it('has version 0.1.0', () => {
    expect(adapter.version).toBe('0.1.0');
  });
});

// =============================================================================
// SURFACE METADATA
// =============================================================================

describe('StorybookMCPAdapter surface metadata', () => {
  const adapter = new StorybookMCPAdapter(makeConfig());

  it('has correct surface classification', () => {
    expect(adapter.surfaceMetadata).toEqual({
      surfaceType: 'runtime',
      accessMode: 'read-only',
      authorityRole: 'external-non-authoritative',
      stability: 'observational',
    });
  });
});

// =============================================================================
// CAPABILITY MANIFEST
// =============================================================================

describe('StorybookMCPAdapter capabilities', () => {
  it('reports correct capabilities in default (unavailable) state', () => {
    const adapter = new StorybookMCPAdapter(makeConfig());
    const caps = adapter.getCapabilities();

    // Storybook-specific: no tokens, no styles, no screenshots
    expect(caps.readDesignTokens).toBe(false);
    expect(caps.readComponents).toBe(true);
    expect(caps.readStyles).toBe(false);
    expect(caps.readFileData).toBe(true);
    expect(caps.readScreenshots).toBe(false);
  });

  it('all write capabilities are literally false (non-negotiable)', () => {
    const adapter = new StorybookMCPAdapter(makeConfig());
    const caps = adapter.getCapabilities();

    expect(caps.writeDesign).toStrictEqual(false);
    expect(caps.writeVariables).toStrictEqual(false);
    expect(caps.executeDesignCode).toStrictEqual(false);
    expect(caps.writeVariableCollections).toStrictEqual(false);
    expect(caps.cloudWriteRelay).toStrictEqual(false);
    expect(caps.writeFigJam).toStrictEqual(false);
    expect(caps.writeSlides).toStrictEqual(false);
  });
});

// =============================================================================
// TOOL REGISTRIES
// =============================================================================

describe('StorybookMCPAdapter tool registries', () => {
  it('BLOCKED_STORYBOOK_TOOLS has entries with required fields', () => {
    expect(BLOCKED_STORYBOOK_TOOLS.length).toBeGreaterThan(0);
    for (const entry of BLOCKED_STORYBOOK_TOOLS) {
      expect(entry.tool).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.category).toBeTruthy();
    }
  });

  it('BLOCKED_STORYBOOK_TOOL_NAMES matches BLOCKED_STORYBOOK_TOOLS', () => {
    expect(BLOCKED_STORYBOOK_TOOL_NAMES.size).toBe(BLOCKED_STORYBOOK_TOOLS.length);
    for (const entry of BLOCKED_STORYBOOK_TOOLS) {
      expect(BLOCKED_STORYBOOK_TOOL_NAMES.has(entry.tool)).toBe(true);
    }
  });

  it('run-story-tests is blocked (has side-effects)', () => {
    expect(BLOCKED_STORYBOOK_TOOL_NAMES.has('run-story-tests')).toBe(true);
  });

  it('preview-stories is blocked', () => {
    expect(BLOCKED_STORYBOOK_TOOL_NAMES.has('preview-stories')).toBe(true);
  });

  it('ALLOWED_STORYBOOK_TOOLS contains only documentation/read tools', () => {
    for (const tool of ALLOWED_STORYBOOK_TOOLS) {
      expect(tool).toMatch(/^(list-|get-)/);
    }
  });

  it('allowed and blocked tools do not overlap', () => {
    for (const tool of ALLOWED_STORYBOOK_TOOLS) {
      expect(BLOCKED_STORYBOOK_TOOL_NAMES.has(tool)).toBe(false);
    }
  });

  it('list-all-documentation is allowed', () => {
    expect(ALLOWED_STORYBOOK_TOOL_NAMES.has('list-all-documentation')).toBe(true);
  });

  it('get-documentation is allowed', () => {
    expect(ALLOWED_STORYBOOK_TOOL_NAMES.has('get-documentation')).toBe(true);
  });
});

// =============================================================================
// AVAILABILITY
// =============================================================================

describe('StorybookMCPAdapter availability', () => {
  it('returns false when dev server is not running', async () => {
    const adapter = new StorybookMCPAdapter(makeConfig({
      url: 'http://localhost:59999',
    }));
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
    expect(adapter.operatingMode).toBe('unavailable');
  });

  it('provides actionable unavailableReason with configured URL', async () => {
    const url = 'http://localhost:59999';
    const adapter = new StorybookMCPAdapter(makeConfig({ url }));
    await adapter.isAvailable();
    expect(adapter.unavailableReason).toContain('not reachable');
    expect(adapter.unavailableReason).toContain(url);
  });

  it('isAvailable completes quickly when server is down (< 5s)', async () => {
    const adapter = new StorybookMCPAdapter(makeConfig({
      url: 'http://localhost:59999',
    }));
    const start = Date.now();
    await adapter.isAvailable();
    const elapsed = Date.now() - start;
    // Should complete within health check timeout (2s) + buffer
    expect(elapsed).toBeLessThan(5000);
  });
});

// =============================================================================
// ADAPTER RESULT SHAPE
// =============================================================================

describe('StorybookMCPAdapter result shape', () => {
  const adapter = new StorybookMCPAdapter(makeConfig());

  it('getDesignTokens returns empty (Storybook has no tokens)', async () => {
    const result = await adapter.getDesignTokens();
    expect(result.data).toEqual([]);
    expect(result.adapterId).toBe('storybook-mcp');
    expect(result.adapterName).toBe('Storybook MCP Adapter');
    expect(typeof result.durationMs).toBe('number');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.cached).toBe('boolean');
  });

  it('getStyles returns empty (Storybook has no style defs)', async () => {
    const result = await adapter.getStyles();
    expect(result.data).toEqual([]);
    expect(result.adapterId).toBe('storybook-mcp');
  });

  it('getScreenshot returns null (not supported in Phase 16C)', async () => {
    const result = await adapter.getScreenshot();
    expect(result.data).toBeNull();
    expect(result.warnings).toContain('Screenshots not supported in Phase 16C');
  });

  it('getFileData returns valid DesignFileData shape', async () => {
    const result = await adapter.getFileData();
    expect(result.data.name).toBe('Storybook');
    expect(typeof result.data.lastModified).toBe('string');
    expect(typeof result.data.pageCount).toBe('number');
    expect(typeof result.data.componentCount).toBe('number');
    expect(typeof result.data.styleCount).toBe('number');
    expect(typeof result.data.variableCount).toBe('number');
  });
});
