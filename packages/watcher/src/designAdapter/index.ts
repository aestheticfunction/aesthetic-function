/**
 * @aesthetic-function/watcher - designAdapter/index.ts
 *
 * Phase 16A: Design Adapter public API.
 *
 * Re-exports registry and normalization functions.
 */

export {
  registerDesignAdapter,
  getRegisteredDesignAdapters,
  getDesignAdapter,
  getAvailableAdapter,
  clearDesignAdapters,
  getDesignAdaptersBySurface,
} from './registry.js';

export {
  normalizeDesignTokens,
  normalizeDesignComponent,
} from './normalize.js';

export { FigmaMCPAdapter } from './figmaMCPAdapter.js';

export { FigmaConsoleMCPAdapter } from './figmaConsoleMCPAdapter.js';
export type { FigmaConsoleMCPConfig, MCPTransportMode } from './figmaConsoleMCPAdapter.js';
export { BLOCKED_MCP_TOOLS, BLOCKED_TOOL_NAMES, ALLOWED_MCP_TOOLS, ALLOWED_TOOL_NAMES } from './figmaConsoleMCPAdapter.js';

// Phase 16C: Storybook MCP Adapter — connects to @storybook/addon-mcp for
// read-only component metadata extraction and cross-surface drift analysis.
export { StorybookMCPAdapter } from './storybookAdapter.js';
export {
  BLOCKED_STORYBOOK_TOOLS,
  BLOCKED_STORYBOOK_TOOL_NAMES,
  ALLOWED_STORYBOOK_TOOLS,
  ALLOWED_STORYBOOK_TOOL_NAMES,
} from './storybookAdapter.js';

export type {
  NormalizedToken,
  NormalizedDesignTokens,
  NormalizedDesignComponent,
  DesignAdapterTrace,
} from './types.js';
