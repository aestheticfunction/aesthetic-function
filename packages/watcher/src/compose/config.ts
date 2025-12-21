/**
 * @aesthetic-function/watcher - compose/config.ts
 *
 * Phase 11B: Compose Configuration Loading.
 *
 * WHY: Loads compose configuration from environment variables
 * with safe defaults. All flags default to off/disabled.
 *
 * FEATURE FLAGS:
 * - FIGMA_COMPOSE_ON: Master switch (default: false)
 * - FIGMA_COMPOSE_MODE: off | dry-run | apply (default: off)
 * - FIGMA_COMPOSE_ALLOW: Comma-separated allow types (default: empty)
 * - FIGMA_COMPOSE_SERVER: Server URL (default: http://localhost:3001)
 */

import type { ComposeConfig, ComposeMode, ComposeAllowType } from './types.js';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default compose configuration.
 * Everything is off by default for safety.
 */
export const DEFAULT_COMPOSE_CONFIG: ComposeConfig = {
  mode: 'off',
  allow: [],
  enabled: false,
  serverUrl: 'http://localhost:3001',
};

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Parse compose mode from string.
 */
function parseComposeMode(value: string | undefined): ComposeMode {
  if (!value) return 'off';
  const normalized = value.toLowerCase().trim();
  switch (normalized) {
    case 'dry-run':
    case 'dryrun':
      return 'dry-run';
    case 'apply':
      return 'apply';
    default:
      return 'off';
  }
}

/**
 * Parse allow types from comma-separated string.
 */
function parseAllowTypes(value: string | undefined): ComposeAllowType[] {
  if (!value) return [];

  const validTypes: ComposeAllowType[] = ['component-set', 'variant', 'property'];
  const result: ComposeAllowType[] = [];

  const parts = value.split(',').map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    // Handle aliases
    let normalized = part;
    if (normalized === 'componentset' || normalized === 'component_set') {
      normalized = 'component-set';
    }

    if (validTypes.includes(normalized as ComposeAllowType)) {
      if (!result.includes(normalized as ComposeAllowType)) {
        result.push(normalized as ComposeAllowType);
      }
    }
  }

  return result;
}

/**
 * Parse boolean from string.
 */
function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

// =============================================================================
// CONFIG LOADER
// =============================================================================

/**
 * Load compose configuration from environment variables.
 *
 * Environment Variables:
 * - FIGMA_COMPOSE_ON: Enable compose (default: false)
 * - FIGMA_COMPOSE_MODE: Execution mode (default: off)
 * - FIGMA_COMPOSE_ALLOW: Allowed operation types (default: empty)
 * - FIGMA_COMPOSE_SERVER: Server URL (default: http://localhost:3001)
 */
export function loadComposeConfig(
  env: Record<string, string | undefined> = process.env
): ComposeConfig {
  const enabled = parseBoolean(env['FIGMA_COMPOSE_ON']);
  const mode = parseComposeMode(env['FIGMA_COMPOSE_MODE']);
  const allow = parseAllowTypes(env['FIGMA_COMPOSE_ALLOW']);
  const serverUrl = env['FIGMA_COMPOSE_SERVER'] || DEFAULT_COMPOSE_CONFIG.serverUrl;

  return {
    enabled,
    mode,
    allow,
    serverUrl,
  };
}

/**
 * Create a compose config for testing.
 */
export function createTestConfig(
  overrides: Partial<ComposeConfig> = {}
): ComposeConfig {
  return {
    ...DEFAULT_COMPOSE_CONFIG,
    ...overrides,
  };
}
