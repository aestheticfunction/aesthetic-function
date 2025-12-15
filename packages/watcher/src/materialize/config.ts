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
 *
 * AST Write Mode (Phase 7A):
 * - AST_WRITE_MODE (default: off) - Control AST-based writes
 *   - "off": No AST writes (default)
 *   - "patch": Generate review artifacts only
 *   - "write": Actually write changes to source files
 * - AST_WRITE_DRY_RUN (default: true) - Safety flag for AST writes
 *   - When true, log what would change without writing
 * - AST_WRITE_ALLOW (default: SET_TEXT,SET_FILL) - Allowed operations
 *   - Comma-separated list of allowed operation types
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

/**
 * AST write modes (Phase 7A).
 */
export type AstWriteMode = 'off' | 'patch' | 'write';

/**
 * Allowed AST write operation types.
 */
export type AstWriteOpType = 'SET_TEXT' | 'SET_FILL';

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

// =============================================================================
// AST WRITE CONFIGURATION (Phase 7A)
// =============================================================================

/**
 * Default allowed AST write operations.
 * MVP only supports SET_TEXT and SET_FILL.
 */
const DEFAULT_AST_WRITE_ALLOW: AstWriteOpType[] = ['SET_TEXT', 'SET_FILL'];

/**
 * Get the AST write mode.
 *
 * @returns 'off', 'patch', or 'write'
 */
export function getAstWriteMode(): AstWriteMode {
  const value = process.env.AST_WRITE_MODE?.toLowerCase();
  if (value === 'patch') {
    return 'patch';
  }
  if (value === 'write') {
    return 'write';
  }
  // Default to 'off' - no AST writes
  return 'off';
}

/**
 * Check if AST write is in dry-run mode (no actual writes).
 *
 * @returns true if AST_WRITE_DRY_RUN is not explicitly set to 'false' or '0'
 */
export function getAstWriteDryRun(): boolean {
  const flag = process.env.AST_WRITE_DRY_RUN?.toLowerCase();
  // Default to true (safe mode)
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag !== 'false' && flag !== '0';
}

/**
 * Get allowed AST write operations.
 *
 * @returns Array of allowed operation types
 */
export function getAstWriteAllow(): AstWriteOpType[] {
  const value = process.env.AST_WRITE_ALLOW;
  if (!value) {
    return DEFAULT_AST_WRITE_ALLOW;
  }
  
  const ops = value.split(',').map((s) => s.trim().toUpperCase());
  const valid: AstWriteOpType[] = [];
  
  for (const op of ops) {
    if (op === 'SET_TEXT' || op === 'SET_FILL') {
      valid.push(op);
    }
  }
  
  return valid.length > 0 ? valid : DEFAULT_AST_WRITE_ALLOW;
}

/**
 * Check if AST writes are enabled (mode is not 'off').
 *
 * @returns true if AST_WRITE_MODE is 'patch' or 'write'
 */
export function isAstWriteEnabled(): boolean {
  return getAstWriteMode() !== 'off';
}

/**
 * Check if a specific operation type is allowed for AST writes.
 *
 * @param opType - The operation type to check
 * @returns true if the operation is allowed
 */
export function isAstWriteOpAllowed(opType: 'SET_TEXT' | 'SET_FILL'): boolean {
  return getAstWriteAllow().includes(opType);
}
