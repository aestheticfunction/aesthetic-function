/**
 * @aesthetic-function/watcher - reconcile/index.ts
 *
 * Public API for the reconciliation module.
 */

export { loadDesignOverrides, clearOverridesCache, setOverridesPath, resetOverridesPath, getOverridesPath } from './loadDesignOverrides.js';
export { applyOverridesToIntentModel, type ApplyOverridesOptions } from './applyOverrides.js';
export { getUseOverrides, getOverridesPrecedence, isOverrideNewerThanFile, type OverridePrecedence } from './config.js';
export type { DesignOverrides, DesignOverride, ReconcileResult } from './types.js';
