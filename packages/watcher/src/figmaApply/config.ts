/**
 * @aesthetic-function/watcher - figmaApply/config.ts
 *
 * Phase 11C: Apply Configuration Loading.
 *
 * WHY: Loads apply configuration from environment variables
 * with safe defaults. All flags default to off/disabled.
 *
 * FEATURE FLAGS:
 * - FIGMA_APPLY_ON: Master switch (default: false)
 * - FIGMA_APPLY_MODE: artifact | apply (default: 'artifact')
 * - FIGMA_APPLY_DRY_RUN: Dry-run mode (default: true)
 * - FIGMA_APPLY_ALLOW: Comma-separated allow categories (default: empty)
 * - FIGMA_APPLY_SERVER: Server URL (default: http://localhost:3001)
 * - FIGMA_APPLY_MIN_CONFIDENCE: Minimum confidence (default: 'high')
 */

import type { ApplyConfig, ApplyMode, ApplyAllowCategory } from './types.js';
import type { ConfidenceLevel } from '../ast/types.js';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default apply configuration.
 * Everything is off/safe by default.
 */
export const DEFAULT_APPLY_CONFIG: ApplyConfig = {
  enabled: false,
  mode: 'artifact',
  dryRun: true,
  allow: [],
  serverUrl: 'http://localhost:3001',
  minConfidence: 'high',
};

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Parse apply mode from string.
 */
function parseApplyMode(value: string | undefined): ApplyMode {
  if (!value) return 'artifact';
  const normalized = value.toLowerCase().trim();
  if (normalized === 'apply') {
    return 'apply';
  }
  return 'artifact';
}

/**
 * Parse allow categories from comma-separated string.
 */
function parseAllowCategories(value: string | undefined): ApplyAllowCategory[] {
  if (!value) return [];

  const validCategories: ApplyAllowCategory[] = ['fill', 'spacing', 'typography'];
  const result: ApplyAllowCategory[] = [];

  const parts = value.split(',').map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    if (validCategories.includes(part as ApplyAllowCategory)) {
      if (!result.includes(part as ApplyAllowCategory)) {
        result.push(part as ApplyAllowCategory);
      }
    }
  }

  return result;
}

/**
 * Parse boolean from string.
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Parse confidence level from string.
 */
function parseConfidenceLevel(value: string | undefined): ConfidenceLevel {
  if (!value) return 'high';
  const normalized = value.toLowerCase().trim();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return 'high';
}

// =============================================================================
// CONFIG LOADER
// =============================================================================

/**
 * Load apply configuration from environment variables.
 *
 * Environment Variables:
 * - FIGMA_APPLY_ON: Enable apply (default: false)
 * - FIGMA_APPLY_MODE: Execution mode (default: 'artifact')
 * - FIGMA_APPLY_DRY_RUN: Dry-run mode (default: true)
 * - FIGMA_APPLY_ALLOW: Allowed property categories (default: empty)
 * - FIGMA_APPLY_SERVER: Server URL (default: http://localhost:3001)
 * - FIGMA_APPLY_MIN_CONFIDENCE: Minimum confidence (default: 'high')
 *
 * @returns Parsed configuration
 */
export function loadApplyConfig(): ApplyConfig {
  const enabled = parseBoolean(process.env.FIGMA_APPLY_ON, false);
  const mode = parseApplyMode(process.env.FIGMA_APPLY_MODE);
  const dryRun = parseBoolean(process.env.FIGMA_APPLY_DRY_RUN, true);
  const allow = parseAllowCategories(process.env.FIGMA_APPLY_ALLOW);
  const serverUrl = process.env.FIGMA_APPLY_SERVER ?? DEFAULT_APPLY_CONFIG.serverUrl;
  const minConfidence = parseConfidenceLevel(process.env.FIGMA_APPLY_MIN_CONFIDENCE);

  return {
    enabled,
    mode,
    dryRun,
    allow,
    serverUrl,
    minConfidence,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check if a configuration allows apply to proceed.
 *
 * Apply requires:
 * - enabled = true
 * - mode = 'apply'
 * - dryRun = false
 */
export function canApply(config: ApplyConfig): boolean {
  return config.enabled && config.mode === 'apply' && !config.dryRun;
}

/**
 * Check if a property category is allowed.
 */
export function isCategoryAllowed(
  config: ApplyConfig,
  category: ApplyAllowCategory
): boolean {
  // If allow list is empty, nothing is allowed (safe default)
  if (config.allow.length === 0) return false;
  return config.allow.includes(category);
}

/**
 * Get human-readable status of apply configuration.
 */
export function getApplyStatus(config: ApplyConfig): string {
  if (!config.enabled) {
    return 'DISABLED (FIGMA_APPLY_ON=false)';
  }
  if (config.mode === 'artifact') {
    return 'ARTIFACT-ONLY (FIGMA_APPLY_MODE=artifact)';
  }
  if (config.dryRun) {
    return 'DRY-RUN (FIGMA_APPLY_DRY_RUN=true)';
  }
  return 'APPLY ENABLED';
}
