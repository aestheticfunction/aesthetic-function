/**
 * @aesthetic-function/watcher - materialize/config.ts
 *
 * Configuration helpers for materialization feature flags.
 *
 * Environment Variables:
 * - MATERIALIZE_MODE (default: off) - Control materialization mode
 *   - "off": No materialization (default, behavior unchanged)
 *   - "patch": Generate patch artifacts in design-materializations/
 *   - "markers": Update @figma marker lines in source files
 * - MATERIALIZE_ON (default: design_change) - When to trigger materialization
 *   - "design_change": Materialize when DESIGN_CHANGE is received
 *   - "file_save": Materialize during normal file processing
 * - MATERIALIZE_DRY_RUN (default: true) - Safety flag
 *   - When true, log what would change without writing files
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Materialization modes.
 */
export type MaterializeMode = 'off' | 'patch' | 'markers';

/**
 * Trigger modes for materialization.
 */
export type MaterializeOn = 'design_change' | 'file_save';

// =============================================================================
// CONFIGURATION HELPERS
// =============================================================================

/**
 * Get the materialization mode.
 *
 * @returns 'off', 'patch', or 'markers'
 */
export function getMaterializeMode(): MaterializeMode {
  const value = process.env.MATERIALIZE_MODE?.toLowerCase();
  if (value === 'patch') {
    return 'patch';
  }
  if (value === 'markers') {
    return 'markers';
  }
  // Default to 'off' - no materialization
  return 'off';
}

/**
 * Get the materialization trigger.
 *
 * @returns 'design_change' or 'file_save'
 */
export function getMaterializeOn(): MaterializeOn {
  const value = process.env.MATERIALIZE_ON?.toLowerCase();
  if (value === 'file_save') {
    return 'file_save';
  }
  // Default to 'design_change'
  return 'design_change';
}

/**
 * Check if materialization is in dry-run mode (no actual writes).
 *
 * @returns true if MATERIALIZE_DRY_RUN is not explicitly set to 'false' or '0'
 */
export function getMaterializeDryRun(): boolean {
  const flag = process.env.MATERIALIZE_DRY_RUN?.toLowerCase();
  // Default to true (safe mode)
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag !== 'false' && flag !== '0';
}

/**
 * Check if materialization is enabled (mode is not 'off').
 *
 * @returns true if MATERIALIZE_MODE is 'patch' or 'markers'
 */
export function isMaterializeEnabled(): boolean {
  return getMaterializeMode() !== 'off';
}
