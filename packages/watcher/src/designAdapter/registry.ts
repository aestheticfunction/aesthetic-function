/**
 * @aesthetic-function/watcher - designAdapter/registry.ts
 *
 * Phase 16A: Design Adapter Registry.
 *
 * WHY: Multiple external design systems (Figma MCP, Builder.io, etc.) may
 * provide design intelligence. The registry manages adapter instances and
 * provides a single entry point for reading design data.
 *
 * CONSTRAINTS:
 * - All adapters are READ-ONLY
 * - Registry does not trigger reconciliation or apply operations
 * - Adapters are tested for availability before use
 */

import type { DesignAdapter } from '@aesthetic-function/shared/designAdapter';

// =============================================================================
// REGISTRY STATE
// =============================================================================

const adapters: DesignAdapter[] = [];

// =============================================================================
// REGISTRATION
// =============================================================================

/**
 * Register a design adapter.
 * Later registrations take priority when multiple adapters are available.
 */
export function registerDesignAdapter(adapter: DesignAdapter): void {
  // Prevent duplicate IDs
  const existing = adapters.findIndex((a) => a.id === adapter.id);
  if (existing >= 0) {
    adapters[existing] = adapter;
  } else {
    adapters.push(adapter);
  }
}

/**
 * Get all registered design adapters.
 */
export function getRegisteredDesignAdapters(): readonly DesignAdapter[] {
  return adapters;
}

/**
 * Get a specific adapter by ID.
 */
export function getDesignAdapter(id: string): DesignAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/**
 * Get the first available adapter.
 * Tests each adapter's isAvailable() in registration order (latest first).
 */
export async function getAvailableAdapter(): Promise<DesignAdapter | null> {
  // Check in reverse order (latest registered = highest priority)
  for (let i = adapters.length - 1; i >= 0; i--) {
    try {
      if (await adapters[i].isAvailable()) {
        return adapters[i];
      }
    } catch {
      // Adapter unavailable, try next
    }
  }
  return null;
}

/**
 * Clear all registered adapters. For testing only.
 */
export function clearDesignAdapters(): void {
  adapters.length = 0;
}
