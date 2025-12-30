/**
 * @aesthetic-function/watcher - figmaResolveApply/config.ts
 *
 * Phase 12F: Apply Resolution Plans - Configuration.
 *
 * WHY: Loads apply configuration from environment variables
 * with safe defaults. All flags default to off/disabled.
 *
 * FEATURE FLAGS:
 * - FIGMA_RESOLVE_APPLY_ON: Master switch (default: false)
 * - FIGMA_RESOLVE_APPLY_MODE: artifact | apply (default: 'artifact')
 * - FIGMA_RESOLVE_APPLY_DRY_RUN: Dry-run mode (default: true)
 * - FIGMA_RESOLVE_APPLY_ALLOW: Comma-separated allow targets (default: 'ast,marker,override')
 * - FIGMA_RESOLVE_APPLY_MIN_CONFIDENCE: Minimum confidence (default: 'high')
 * - FIGMA_RESOLVE_PLAN_PATH: Optional override path for plan artifact
 *
 * Execution is permitted only when:
 * - FIGMA_RESOLVE_APPLY_ON=true
 * - FIGMA_RESOLVE_APPLY_MODE=apply
 * - FIGMA_RESOLVE_APPLY_DRY_RUN=false
 * - and allow-list includes the required target
 */

import type {
  ResolutionApplyConfig,
  ResolutionApplyMode,
  ResolutionApplyAllowTarget,
  PostApplyVerifyConfig,
} from './types.js';
import type { DeltaConfidence } from '../figmaDelta/types.js';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default apply configuration.
 * Everything is off/safe by default.
 */
export const DEFAULT_RESOLVE_APPLY_CONFIG: ResolutionApplyConfig = {
  enabled: false,
  mode: 'artifact',
  dryRun: true,
  allow: ['ast', 'marker', 'override'],
  minConfidence: 'high',
  planPath: undefined,
};

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Parse apply mode from string.
 */
function parseApplyMode(value: string | undefined): ResolutionApplyMode {
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
function parseAllowTargets(value: string | undefined): ResolutionApplyAllowTarget[] {
  if (!value) return ['ast', 'marker', 'override'];

  const validTargets: ResolutionApplyAllowTarget[] = ['ast', 'marker', 'override'];
  const result: ResolutionApplyAllowTarget[] = [];

  const parts = value.split(',').map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    if (validTargets.includes(part as ResolutionApplyAllowTarget)) {
      if (!result.includes(part as ResolutionApplyAllowTarget)) {
        result.push(part as ResolutionApplyAllowTarget);
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
 * Load resolution apply configuration from environment variables.
 *
 * @returns Resolution apply configuration with safe defaults
 */
export function loadResolveApplyConfig(): ResolutionApplyConfig {
  return {
    enabled: parseBoolean(process.env.FIGMA_RESOLVE_APPLY_ON, false),
    mode: parseApplyMode(process.env.FIGMA_RESOLVE_APPLY_MODE),
    dryRun: parseBoolean(process.env.FIGMA_RESOLVE_APPLY_DRY_RUN, true),
    allow: parseAllowTargets(process.env.FIGMA_RESOLVE_APPLY_ALLOW),
    minConfidence: parseConfidenceLevel(process.env.FIGMA_RESOLVE_APPLY_MIN_CONFIDENCE),
    planPath: process.env.FIGMA_RESOLVE_PLAN_PATH,
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a target is allowed by configuration.
 */
export function isResolveTargetAllowed(
  target: ResolutionApplyAllowTarget,
  config: ResolutionApplyConfig
): boolean {
  return config.allow.includes(target);
}

/**
 * Check if confidence meets minimum threshold.
 */
export function meetsResolveConfidenceThreshold(
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
 * - FIGMA_RESOLVE_APPLY_ON=true
 * - FIGMA_RESOLVE_APPLY_MODE=apply
 * - FIGMA_RESOLVE_APPLY_DRY_RUN=false
 */
export function isResolveApplyModeEnabled(config: ResolutionApplyConfig): boolean {
  return config.enabled && config.mode === 'apply' && !config.dryRun;
}

/**
 * Get readable precondition status.
 */
export function getResolvePreconditionStatus(config: ResolutionApplyConfig): {
  canApply: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!config.enabled) {
    reasons.push('FIGMA_RESOLVE_APPLY_ON is not set to true');
  }
  if (config.mode !== 'apply') {
    reasons.push(`FIGMA_RESOLVE_APPLY_MODE is '${config.mode}', must be 'apply'`);
  }
  if (config.dryRun) {
    reasons.push('FIGMA_RESOLVE_APPLY_DRY_RUN is true');
  }

  return {
    canApply: reasons.length === 0,
    reasons,
  };
}

/**
 * Format config for CLI display.
 */
export function formatResolveApplyConfig(config: ResolutionApplyConfig): string {
  const lines = [
    `  enabled:       ${config.enabled ? 'YES' : 'NO'}`,
    `  mode:          ${config.mode}`,
    `  dryRun:        ${config.dryRun}`,
    `  allow:         [${config.allow.join(', ')}]`,
    `  minConfidence: ${config.minConfidence}`,
  ];

  if (config.planPath) {
    lines.push(`  planPath:      ${config.planPath}`);
  }

  return lines.join('\n');
}

// =============================================================================
// POST-APPLY VERIFICATION CONFIG (Phase 12H)
// =============================================================================

/**
 * Default post-apply verification configuration.
 * Disabled by default; strict mode defaults to true.
 */
export const DEFAULT_POST_APPLY_VERIFY_CONFIG: PostApplyVerifyConfig = {
  enabled: false,
  includeFigma: false,
  strict: true,
};

/**
 * Load post-apply verification configuration from environment variables.
 *
 * Environment Variables:
 * - POST_APPLY_VERIFY: Enable/disable verification (default: false)
 * - POST_APPLY_VERIFY_INCLUDE_FIGMA: Include Figma read checks (default: false)
 * - POST_APPLY_VERIFY_STRICT: Exit 1 on mismatch/missing (default: true)
 *
 * @returns Post-apply verification configuration
 */
export function loadPostApplyVerifyConfig(): PostApplyVerifyConfig {
  return {
    enabled: parseBoolean(process.env.POST_APPLY_VERIFY, false),
    includeFigma: parseBoolean(process.env.POST_APPLY_VERIFY_INCLUDE_FIGMA, false),
    strict: parseBoolean(process.env.POST_APPLY_VERIFY_STRICT, true),
  };
}

/**
 * Check if post-apply verification should run.
 *
 * Verification only runs when:
 * - POST_APPLY_VERIFY=true
 * - Apply mode is enabled (not artifact-only)
 * - Dry-run is disabled (actual mutations occurred)
 *
 * @param applyConfig - Resolution apply configuration
 * @param verifyConfig - Post-apply verification configuration
 * @returns Whether verification should run and reason if not
 */
export function shouldRunPostApplyVerification(
  applyConfig: ResolutionApplyConfig,
  verifyConfig: PostApplyVerifyConfig
): { shouldRun: boolean; skipReason?: string } {
  if (!verifyConfig.enabled) {
    return { shouldRun: false, skipReason: 'POST_APPLY_VERIFY is not enabled' };
  }

  if (applyConfig.mode !== 'apply') {
    return {
      shouldRun: false,
      skipReason: `Mode is '${applyConfig.mode}', verification only runs in 'apply' mode`,
    };
  }

  if (applyConfig.dryRun) {
    return { shouldRun: false, skipReason: 'Dry-run mode is enabled, no mutations to verify' };
  }

  return { shouldRun: true };
}

/**
 * Format post-apply verify config for CLI display.
 */
export function formatPostApplyVerifyConfig(config: PostApplyVerifyConfig): string {
  const lines = [
    `  enabled:      ${config.enabled ? 'YES' : 'NO'}`,
    `  includeFigma: ${config.includeFigma ? 'YES' : 'NO'}`,
    `  strict:       ${config.strict ? 'YES (exit 1 on mismatch)' : 'NO (always exit 0)'}`,
  ];

  return lines.join('\n');
}
