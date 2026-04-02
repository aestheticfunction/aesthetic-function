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
} from './registry.js';

export {
  normalizeDesignTokens,
  normalizeDesignComponent,
} from './normalize.js';

export { FigmaMCPAdapter } from './figmaMCPAdapter.js';

export type {
  NormalizedToken,
  NormalizedDesignTokens,
  NormalizedDesignComponent,
  DesignAdapterTrace,
} from './types.js';
