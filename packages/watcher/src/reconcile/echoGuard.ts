/**
 * @aesthetic-function/watcher - reconcile/echoGuard.ts
 *
 * Echo suppression guard to prevent feedback loops.
 *
 * WHY: After an AST write occurs, the next watcher cycle should not
 * immediately re-apply the same value back to Figma as a "new change"
 * unless it truly differs from what was just written.
 *
 * MECHANISM:
 * - In-memory cache keyed by {filePath, nodeName, field}
 * - Stores lastAppliedValue + timestamp
 * - Suppresses no-op operations (value already matching)
 * - Logs when suppression happens
 *
 * LIFECYCLE:
 * - Cache entries expire after ECHO_GUARD_TTL_MS (default: 5000ms)
 * - Cache is cleared on process restart (in-memory only)
 */

// =============================================================================
// TYPES
// =============================================================================

import type { ComponentState } from '../transform/types.js';

/**
 * Cache key components.
 * Now includes state for Phase 8A variant/state mapping.
 */
export interface EchoCacheKey {
  filePath: string;
  nodeName: string;
  field: string;
  /** Component state (default: 'base') */
  state?: ComponentState;
}

/**
 * Cache entry with value and timestamp.
 */
export interface EchoCacheEntry {
  value: string | number;
  timestamp: number;
}

/**
 * Suppression result for a single operation.
 */
export interface SuppressionCheck {
  /** Whether the operation should be suppressed */
  suppressed: boolean;
  /** Reason for suppression (if suppressed) */
  reason?: string;
}

/**
 * Summary of suppression checks.
 */
export interface SuppressionSummary {
  /** Number of operations checked */
  total: number;
  /** Number of operations suppressed */
  suppressed: number;
  /** Number of operations allowed */
  allowed: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Time-to-live for cache entries in milliseconds.
 * After this duration, entries are considered expired and won't suppress.
 */
const ECHO_GUARD_TTL_MS = parseInt(process.env.ECHO_GUARD_TTL_MS ?? '5000', 10);

/**
 * Check if echo guard is enabled.
 * Default: true (enabled)
 */
export function isEchoGuardEnabled(): boolean {
  const flag = process.env.ECHO_GUARD?.toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  return true;
}

// =============================================================================
// CACHE
// =============================================================================

/**
 * In-memory cache for last applied values.
 * Key format: `${filePath}|${nodeName}|${field}|${state}`
 * Note: state is included to support per-state echo suppression (Phase 8A).
 */
const echoCache = new Map<string, EchoCacheEntry>();

/**
 * Build cache key string.
 * Includes state to differentiate between base/hover/disabled/pressed.
 */
function buildCacheKey(key: EchoCacheKey): string {
  const state = key.state ?? 'base';
  return `${key.filePath}|${key.nodeName}|${key.field}|${state}`;
}

/**
 * Parse cache key string back to components.
 * Exported for testing/debugging purposes.
 */
export function parseCacheKey(keyStr: string): EchoCacheKey {
  const parts = keyStr.split('|');
  // Support both old format (3 parts) and new format (4 parts)
  if (parts.length === 4) {
    const [filePath, nodeName, field, state] = parts;
    return { filePath, nodeName, field, state: state as ComponentState };
  }
  const [filePath, nodeName, field] = parts;
  return { filePath, nodeName, field, state: 'base' };
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

/**
 * Record a value that was applied (after successful AST write or Figma op).
 *
 * @param key - Cache key components
 * @param value - The value that was applied
 */
export function recordAppliedValue(key: EchoCacheKey, value: string | number): void {
  const keyStr = buildCacheKey(key);
  echoCache.set(keyStr, {
    value,
    timestamp: Date.now(),
  });
}

/**
 * Check if an operation should be suppressed (echo guard).
 *
 * @param key - Cache key components
 * @param newValue - The proposed new value
 * @returns Suppression check result
 */
export function shouldSuppress(key: EchoCacheKey, newValue: string | number): SuppressionCheck {
  if (!isEchoGuardEnabled()) {
    return { suppressed: false };
  }

  const keyStr = buildCacheKey(key);
  const entry = echoCache.get(keyStr);

  if (!entry) {
    return { suppressed: false };
  }

  // Check if entry is expired
  const age = Date.now() - entry.timestamp;
  if (age > ECHO_GUARD_TTL_MS) {
    // Expired, remove from cache
    echoCache.delete(keyStr);
    return { suppressed: false };
  }

  // Check if value matches
  if (String(entry.value) === String(newValue)) {
    return {
      suppressed: true,
      reason: `Echo suppressed: ${key.nodeName}.${key.field}="${newValue}" (applied ${age}ms ago)`,
    };
  }

  return { suppressed: false };
}

/**
 * Check multiple operations and return suppression summary.
 *
 * @param operations - Array of { key, value } pairs to check
 * @returns Summary with counts
 */
export function checkOperations(
  operations: Array<{ key: EchoCacheKey; value: string | number }>
): SuppressionSummary {
  let suppressed = 0;
  let allowed = 0;

  for (const op of operations) {
    const check = shouldSuppress(op.key, op.value);
    if (check.suppressed) {
      suppressed++;
    } else {
      allowed++;
    }
  }

  return {
    total: operations.length,
    suppressed,
    allowed,
  };
}

/**
 * Filter operations, keeping only non-suppressed ones.
 *
 * @param operations - Array of operations with keys
 * @returns Filtered array with only allowed operations
 */
export function filterSuppressed<T extends { filePath?: string; nodeName: string; field: string; value: string | number }>(
  operations: T[],
  getFilePath: (op: T) => string
): { allowed: T[]; summary: SuppressionSummary } {
  const allowed: T[] = [];
  let suppressed = 0;

  for (const op of operations) {
    const key: EchoCacheKey = {
      filePath: getFilePath(op),
      nodeName: op.nodeName,
      field: op.field,
    };
    const check = shouldSuppress(key, op.value);
    if (check.suppressed) {
      suppressed++;
    } else {
      allowed.push(op);
    }
  }

  return {
    allowed,
    summary: {
      total: operations.length,
      suppressed,
      allowed: allowed.length,
    },
  };
}

/**
 * Clear all cache entries.
 * Useful for testing.
 */
export function clearEchoCache(): void {
  echoCache.clear();
}

/**
 * Clear expired entries from cache.
 * Can be called periodically to prevent memory leaks.
 */
export function pruneExpiredEntries(): number {
  const now = Date.now();
  let pruned = 0;

  for (const [keyStr, entry] of echoCache.entries()) {
    if (now - entry.timestamp > ECHO_GUARD_TTL_MS) {
      echoCache.delete(keyStr);
      pruned++;
    }
  }

  return pruned;
}

/**
 * Get cache size (for debugging/testing).
 */
export function getCacheSize(): number {
  return echoCache.size;
}

/**
 * Log suppression summary.
 */
export function logSuppressionSummary(
  summary: SuppressionSummary,
  prefix = '[EchoGuard]'
): void {
  if (summary.suppressed > 0) {
    console.log(`${prefix} Suppressed ${summary.suppressed} no-op ops (echo guard)`);
  }
}
