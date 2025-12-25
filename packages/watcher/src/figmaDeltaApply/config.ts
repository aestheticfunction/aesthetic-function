/**
 * @aesthetic-function/watcher - figmaDeltaApply/config.ts
 *
 * Phase 12C: Apply Configuration Loading.
 *
 * WHY: Loads apply configuration from environment variables
 * with safe defaults. All flags default to off/disabled.
 *
 * FEATURE FLAGS:
 * - FIGMA_DELTA_APPLY_ON: Master switch (default: false)
 * - FIGMA_DELTA_APPLY_MODE: artifact | apply (default: 'artifact')
 * - FIGMA_DELTA_APPLY_DRY_RUN: Dry-run mode (default: true)
 * - FIGMA_DELTA_APPLY_ALLOW: Comma-separated allow targets (default: 'override,marker,ast')
 * - FIGMA_DELTA_APPLY_MIN_CONFIDENCE: Minimum confidence (default: 'high')
 * - FIGMA_DELTA_APPLY_SERVER: Server URL (default: http://localhost:3001)
 */

import type {
  DeltaApplyConfig,
  DeltaApplyMode,
  DeltaApplyAllowTarget,
} from './types.js';
import type { DeltaConfidence } from '../figmaDelta/types.js';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default apply configuration.
 * Everything is off/safe by default.
 */
export const DEFAULT_DELTA_APPLY_CONFIG: DeltaApplyConfig = {
  enabled: false,
  mode: 'artifact',
  dryRun: true,
  allow: ['override', 'marker', 'ast'],
  minConfidence: 'high',
  serverUrl: 'http://localhost:3001',
};

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Parse apply mode from string.
 */
function parseApplyMode(value: string | undefined): DeltaApplyMode {
  if (!value) return 'artifact';
  const normalized = value.toLowerCase().trim();
  if (normalized === 'apply') {
    return 'apply';
  }
  return 'artifact';
}

/**
 * Parse allow targets from comma-separated string.
 */
function parseAllowTargets(value: string | undefined): DeltaApplyAllowTarget[] {
  if (!value) return ['override', 'marker', 'ast'];

  const validTargets: DeltaApplyAllowTarget[] = ['ast', 'marker', 'override'];
  const result: DeltaApplyAllowTarget[] = [];

  const parts = value.split(',').map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    if (validTargets.includes(part as DeltaApplyAllowTarget)) {
      if (!result.includes(part as DeltaApplyAllowTarget)) {
        result.push(part as DeltaApplyAllowTarget);
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
function parseConfidenceLevel(value: string | undefined): DeltaConfidence {
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
 * Load delta apply configuration from environment variables.
 *
 * @returns Delta apply configuration with safe defaults
 */
export function loadDeltaApplyConfig(): DeltaApplyConfig {
  return {
    enabled: parseBoolean(process.env.FIGMA_DELTA_APPLY_ON, false),
    mode: parseApplyMode(process.env.FIGMA_DELTA_APPLY_MODE),
    dryRun: parseBoolean(process.env.FIGMA_DELTA_APPLY_DRY_RUN, true),
    allow: parseAllowTargets(process.env.FIGMA_DELTA_APPLY_ALLOW),
    minConfidence: parseConfidenceLevel(process.env.FIGMA_DELTA_APPLY_MIN_CONFIDENCE),
    serverUrl: process.env.FIGMA_DELTA_APPLY_SERVER ?? 'http://localhost:3001',
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a target is allowed by configuration.
 */
export function isTargetAllowed(
  target: DeltaApplyAllowTarget,
  config: DeltaApplyConfig
): boolean {
  return config.allow.includes(target);
}

/**
 * Check if confidence meets minimum threshold.
 */
export function meetsConfidenceThreshold(
  confidence: DeltaConfidence,
  minConfidence: DeltaConfidence
): boolean {
  const levels: Record<DeltaConfidence, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return levels[confidence] >= levels[minConfidence];
}

/**
 * Check if apply mode is enabled and conditions are met.
 *
 * Requires:
 * - FIGMA_DELTA_APPLY_ON=true
 * - FIGMA_DELTA_APPLY_MODE=apply
 * - FIGMA_DELTA_APPLY_DRY_RUN=false
 */
export function isApplyModeEnabled(config: DeltaApplyConfig): boolean {
  return config.enabled && config.mode === 'apply' && !config.dryRun;
}

/**
 * Get readable precondition status.
 */
export function getPreconditionStatus(config: DeltaApplyConfig): {
  canApply: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!config.enabled) {
    reasons.push('FIGMA_DELTA_APPLY_ON is not set to true');
  }
  if (config.mode !== 'apply') {
    reasons.push(`FIGMA_DELTA_APPLY_MODE is '${config.mode}', must be 'apply'`);
  }
  if (config.dryRun) {
    reasons.push('FIGMA_DELTA_APPLY_DRY_RUN is true');
  }

  return {
    canApply: reasons.length === 0,
    reasons,
  };
}
