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

// Stub only — NOT auto-registered. Validates the Surface Classification Metadata model.
// Future Storybook integration would replace this with a real implementation.
export { StorybookAdapter } from './storybookAdapter.js';

export type {
  NormalizedToken,
  NormalizedDesignTokens,
  NormalizedDesignComponent,
  DesignAdapterTrace,
} from './types.js';
