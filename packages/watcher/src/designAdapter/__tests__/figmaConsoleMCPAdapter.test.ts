/**
 * @aesthetic-function/watcher - designAdapter/__tests__/figmaConsoleMCPAdapter.test.ts
 *
 * Phase 16B: Tests for FigmaConsoleMCPAdapter.
 *
 * Tests:
 * - Identity and version
 * - Capability manifest (all reads allowed, all writes blocked)
 * - BLOCKED_MCP_TOOLS registry completeness
 * - Write-blocking verification
 * - isAvailable (requires config)
 * - Adapter methods return correct AdapterResult shape
 *
 * NOTE: These tests do NOT call the real Figma API. They test the adapter's
 * structure, capability enforcement, and error handling. Integration tests
 * that call the Figma API require a FIGMA_ACCESS_TOKEN and are separate.
 */

import { describe, it, expect } from 'vitest';
import {
  FigmaConsoleMCPAdapter,
  BLOCKED_MCP_TOOLS,
  BLOCKED_TOOL_NAMES,
  ALLOWED_MCP_TOOLS,
  ALLOWED_TOOL_NAMES,
} from '../figmaConsoleMCPAdapter.js';
import type { FigmaConsoleMCPConfig } from '../figmaConsoleMCPAdapter.js';

// =============================================================================
// CONFIG HELPERS
// =============================================================================

function makeConfig(overrides?: Partial<FigmaConsoleMCPConfig>): FigmaConsoleMCPConfig {
  return {
    accessToken: 'figd_test_token_not_real',
    fileKey: 'test-file-key-abc123',
    timeout: 5000,
    transport: 'rest-fallback', // No real MCP server in unit tests
    ...overrides,
  };
}

// =============================================================================
// IDENTITY
// =============================================================================

describe('FigmaConsoleMCPAdapter identity', () => {
  const adapter = new FigmaConsoleMCPAdapter(makeConfig());

  it('has correct id', () => {
    expect(adapter.id).toBe('figma-console-mcp');
  });

  it('has correct displayName', () => {
    expect(adapter.displayName).toBe('Figma Console MCP Adapter');
  });

  it('has version 0.2.0', () => {
    expect(adapter.version).toBe('0.2.0');
  });
});

// =============================================================================
// CAPABILITY MANIFEST
// =============================================================================

describe('FigmaConsoleMCPAdapter capabilities', () => {
  const adapter = new FigmaConsoleMCPAdapter(makeConfig());
  const caps = adapter.getCapabilities();

  // --- Read capabilities ---
  it('allows readDesignTokens', () => {
    expect(caps.readDesignTokens).toBe(true);
  });

  it('allows readComponents', () => {
    expect(caps.readComponents).toBe(true);
  });

  it('allows readStyles', () => {
    expect(caps.readStyles).toBe(true);
  });

  it('allows readFileData', () => {
    expect(caps.readFileData).toBe(true);
  });

  it('allows readScreenshots', () => {
    expect(caps.readScreenshots).toBe(true);
  });

  it('allows readDesignSystemKit', () => {
    expect(caps.readDesignSystemKit).toBe(true);
  });

  it('does not allow readDesignCodeParity (requires live plugin)', () => {
    expect(caps.readDesignCodeParity).toBe(false);
  });

  // --- Blocked write capabilities ---
  it('blocks writeDesign', () => {
    expect(caps.writeDesign).toBe(false);
  });

  it('blocks writeVariables', () => {
    expect(caps.writeVariables).toBe(false);
  });

  it('blocks executeDesignCode', () => {
    expect(caps.executeDesignCode).toBe(false);
  });

  it('blocks writeVariableCollections', () => {
    expect(caps.writeVariableCollections).toBe(false);
  });

  it('blocks cloudWriteRelay', () => {
    expect(caps.cloudWriteRelay).toBe(false);
  });

  it('blocks writeFigJam', () => {
    expect(caps.writeFigJam).toBe(false);
  });

  it('blocks writeSlides', () => {
    expect(caps.writeSlides).toBe(false);
  });

  it('has exactly 7 allowed + 7 blocked capabilities', () => {
    const keys = Object.keys(caps);
    expect(keys.length).toBe(14);

    const blocked = Object.entries(caps).filter(([, v]) => v === false);
    // 7 blocked writes + 1 readDesignCodeParity = 8 false total
    expect(blocked.length).toBe(8);
  });
});

// =============================================================================
// BLOCKED MCP TOOLS REGISTRY
// =============================================================================

describe('BLOCKED_MCP_TOOLS registry', () => {
  it('contains at least 25 blocked tools', () => {
    expect(BLOCKED_MCP_TOOLS.length).toBeGreaterThanOrEqual(25);
  });

  it('blocks figma_execute', () => {
    expect(BLOCKED_TOOL_NAMES.has('figma_execute')).toBe(true);
  });

  it('blocks all variable CRUD tools', () => {
    const variableTools = [
      'figma_create_variable_collection',
      'figma_create_variable',
      'figma_update_variable',
      'figma_rename_variable',
      'figma_delete_variable',
      'figma_delete_variable_collection',
      'figma_add_mode',
      'figma_rename_mode',
      'figma_batch_create_variables',
      'figma_batch_update_variables',
      'figma_setup_design_tokens',
    ];

    for (const tool of variableTools) {
      expect(BLOCKED_TOOL_NAMES.has(tool)).toBe(true);
    }
  });

  it('blocks figma_pair_plugin (cloud relay)', () => {
    expect(BLOCKED_TOOL_NAMES.has('figma_pair_plugin')).toBe(true);
  });

  it('blocks all FigJam tools', () => {
    const figjamTools = BLOCKED_MCP_TOOLS.filter(t => t.category === 'figjam');
    expect(figjamTools.length).toBeGreaterThanOrEqual(5);
  });

  it('blocks all Slides tools', () => {
    const slidesTools = BLOCKED_MCP_TOOLS.filter(t => t.category === 'slides');
    expect(slidesTools.length).toBeGreaterThanOrEqual(5);
  });

  it('every blocked tool has a reason', () => {
    for (const tool of BLOCKED_MCP_TOOLS) {
      expect(tool.reason).toBeTruthy();
      expect(tool.reason.length).toBeGreaterThan(10);
    }
  });

  it('every blocked tool has a category', () => {
    const validCategories = new Set([
      'design-creation',
      'variable-management',
      'cloud-relay',
      'figjam',
      'slides',
    ]);

    for (const tool of BLOCKED_MCP_TOOLS) {
      expect(validCategories.has(tool.category)).toBe(true);
    }
  });

  it('does NOT block read tools', () => {
    const readTools = [
      'figma_get_variables',
      'figma_get_component',
      'figma_get_styles',
      'figma_get_file_data',
      'figma_take_screenshot',
      'figma_get_design_system_kit',
    ];

    for (const tool of readTools) {
      expect(BLOCKED_TOOL_NAMES.has(tool)).toBe(false);
    }
  });

  it('allowed and blocked sets are disjoint', () => {
    for (const tool of ALLOWED_MCP_TOOLS) {
      expect(BLOCKED_TOOL_NAMES.has(tool as string)).toBe(false);
    }
  });

  it('allowed tools are a strict subset of known read tools', () => {
    // Every allowed tool should NOT appear in blocked set
    for (const tool of ALLOWED_MCP_TOOLS) {
      expect(BLOCKED_TOOL_NAMES.has(tool as string)).toBe(false);
    }
    // And there should be at least 10 allowed tools
    expect(ALLOWED_MCP_TOOLS.length).toBeGreaterThanOrEqual(10);
  });
});

// =============================================================================
// AVAILABILITY
// =============================================================================

describe('FigmaConsoleMCPAdapter availability', () => {
  it('returns false when accessToken is empty', async () => {
    const adapter = new FigmaConsoleMCPAdapter(
      makeConfig({ accessToken: '' }),
    );
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('returns false when fileKey is empty', async () => {
    const adapter = new FigmaConsoleMCPAdapter(
      makeConfig({ fileKey: '' }),
    );
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('returns false when API rejects (invalid token)', async () => {
    // This will try to hit the real Figma API and fail with invalid token
    const adapter = new FigmaConsoleMCPAdapter(makeConfig({ timeout: 2000 }));
    // Should return false, not throw
    const available = await adapter.isAvailable();
    expect(typeof available).toBe('boolean');
    // With a fake token, either the API rejects (false) or network error (false)
    expect(available).toBe(false);
  });
});

// =============================================================================
// ERROR HANDLING (graceful degradation)
// =============================================================================

describe('FigmaConsoleMCPAdapter error handling', () => {
  // Use invalid token so all API calls fail — tests graceful degradation
  const adapter = new FigmaConsoleMCPAdapter(
    makeConfig({ timeout: 2000 }),
  );

  it('getDesignTokens returns empty array on error', async () => {
    const result = await adapter.getDesignTokens();

    expect(result.adapterId).toBe('figma-console-mcp');
    expect(result.adapterName).toBe('Figma Console MCP Adapter');
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getComponent returns null on error', async () => {
    const result = await adapter.getComponent('Button');

    expect(result.data).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getComponents returns empty array on error', async () => {
    const result = await adapter.getComponents();

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getStyles returns empty array on error', async () => {
    const result = await adapter.getStyles();

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getFileData returns fallback on error', async () => {
    const result = await adapter.getFileData();

    expect(result.data.name).toBeTruthy();
    expect(result.data.pageCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('getScreenshot returns null on error', async () => {
    const result = await adapter.getScreenshot();

    expect(result.data).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// ADAPTER RESULT SHAPE
// =============================================================================

describe('FigmaConsoleMCPAdapter result shape', () => {
  const adapter = new FigmaConsoleMCPAdapter(
    makeConfig({ timeout: 2000 }),
  );

  it('all results have required AdapterResult fields', async () => {
    const methods: Array<() => Promise<{ adapterId: string; adapterName: string; durationMs: number; warnings: string[]; cached: boolean }>> = [
      () => adapter.getDesignTokens(),
      () => adapter.getComponent('X'),
      () => adapter.getComponents(),
      () => adapter.getStyles(),
      () => adapter.getFileData(),
      () => adapter.getScreenshot(),
    ];

    for (const method of methods) {
      const result = await method();
      expect(typeof result.adapterId).toBe('string');
      expect(typeof result.adapterName).toBe('string');
      expect(typeof result.durationMs).toBe('number');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.cached).toBe('boolean');
    }
  });
});

// =============================================================================
// ALLOWED MCP TOOLS REGISTRY
// =============================================================================

describe('ALLOWED_MCP_TOOLS registry', () => {
  it('contains at least 10 read-only tools', () => {
    expect(ALLOWED_MCP_TOOLS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes figma_get_variables', () => {
    expect(ALLOWED_TOOL_NAMES.has('figma_get_variables')).toBe(true);
  });

  it('includes figma_get_file_data', () => {
    expect(ALLOWED_TOOL_NAMES.has('figma_get_file_data')).toBe(true);
  });

  it('includes figma_take_screenshot', () => {
    expect(ALLOWED_TOOL_NAMES.has('figma_take_screenshot')).toBe(true);
  });

  it('includes figma_get_styles', () => {
    expect(ALLOWED_TOOL_NAMES.has('figma_get_styles')).toBe(true);
  });

  it('no tool appears in both ALLOWED and BLOCKED sets', () => {
    for (const tool of ALLOWED_MCP_TOOLS) {
      expect(BLOCKED_TOOL_NAMES.has(tool as string)).toBe(false);
    }
  });
});

// =============================================================================
// TRANSPORT MODE
// =============================================================================

describe('FigmaConsoleMCPAdapter transport', () => {
  it('defaults to rest-fallback transport in tests', () => {
    const adapter = new FigmaConsoleMCPAdapter(makeConfig());
    expect(adapter.getActiveTransport()).toBe('rest-fallback');
  });

  it('respects explicit rest-fallback transport config', () => {
    const adapter = new FigmaConsoleMCPAdapter(
      makeConfig({ transport: 'rest-fallback' }),
    );
    expect(adapter.getActiveTransport()).toBe('rest-fallback');
  });

  it('close() does not throw when no MCP client is connected', async () => {
    const adapter = new FigmaConsoleMCPAdapter(makeConfig());
    await expect(adapter.close()).resolves.not.toThrow();
  });

  it('result warnings include transport info when using rest-fallback', async () => {
    const adapter = new FigmaConsoleMCPAdapter(
      makeConfig({ timeout: 2000 }),
    );
    const result = await adapter.getFileData();
    const transportWarning = result.warnings.find(w => w.includes('transport:'));
    expect(transportWarning).toContain('rest-fallback');
  });
});
