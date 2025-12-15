/**
 * @aesthetic-function/watcher - reconcile/index.ts
 *
 * Public API for the reconciliation module.
 */

export { loadDesignOverrides, clearOverridesCache, setOverridesPath, resetOverridesPath, getOverridesPath } from './loadDesignOverrides.js';
export { applyOverridesToIntentModel, type ApplyOverridesOptions } from './applyOverrides.js';
export { getUseOverrides, getOverridesPrecedence, isOverrideNewerThanFile, type OverridePrecedence } from './config.js';
export type { DesignOverrides, DesignOverride, ReconcileResult, LayoutOverride } from './types.js';

// Phase 7C: Precedence policy
export {
  resolveWithPolicy,
  resolveField,
  formatResolutionSummary,
  logResolutionSummary,
  type PolicyOptions,
  type ValueSource,
  type FieldResolution,
  type NodeResolution,
  type ResolutionSummary,
  type ResolutionReport,
  type ResolvedIntent,
  type ResolvedIntentModel,
  type MarkerIntent,
  type AstSemantics,
} from './policy.js';

// Phase 7C: Echo suppression guard
export {
  recordAppliedValue,
  shouldSuppress,
  checkOperations,
  filterSuppressed,
  clearEchoCache,
  pruneExpiredEntries,
  getCacheSize,
  logSuppressionSummary,
  isEchoGuardEnabled,
  parseCacheKey,
  type EchoCacheKey,
  type EchoCacheEntry,
  type SuppressionCheck,
  type SuppressionSummary,
} from './echoGuard.js';
