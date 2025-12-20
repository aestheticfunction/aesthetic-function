/**
 * @aesthetic-function/watcher - adapters/index.ts
 *
 * Semantic Adapter System (Phase 10A/10B).
 *
 * Exports the adapter infrastructure and all registered adapters.
 * Framework adapters are registered on import.
 */

// Export types
export type {
  SemanticAdapter,
  AdapterContext,
  AdapterResult,
  AdapterProvenance,
  AdapterSemanticValue,
  ComponentTagMapping,
  VuetifyComponentTag,
} from './types.js';
export { isVuetifyTag } from './types.js';

// Export registry
export {
  registerAdapter,
  getRegisteredAdapters,
  clearAdapters,
  lockRegistry,
  unlockRegistry,
  runAdapters,
  mergeWithAdapterSemantics,
} from './registry.js';
export type {
  AdapterExtractionResult,
  AdapterContribution,
} from './registry.js';

// Export adapters
export { VuetifySemanticAdapter } from './vuetify/index.js';
export { AntdSemanticAdapter, isAntdComponent } from './antd/index.js';

// =============================================================================
// DEFAULT ADAPTER REGISTRATION
// =============================================================================

import { registerAdapter } from './registry.js';
import { VuetifySemanticAdapter } from './vuetify/index.js';
import { AntdSemanticAdapter } from './antd/index.js';

/**
 * Initialize default adapters.
 *
 * Called automatically on module import.
 * Registers adapters in deterministic order.
 */
let initialized = false;

export function initializeDefaultAdapters(): void {
  if (initialized) return;
  initialized = true;

  // Register Vuetify adapter (Phase 10A)
  registerAdapter(new VuetifySemanticAdapter());

  // Register Ant Design adapter (Phase 10B)
  registerAdapter(new AntdSemanticAdapter());

  // Future adapters will be registered here:
  // registerAdapter(new MuiSemanticAdapter());       // Phase 10C
  // registerAdapter(new ChakraSemanticAdapter());    // Phase 10D
}

/**
 * Reset adapter initialization (for testing).
 */
export function resetAdapterInitialization(): void {
  initialized = false;
}
