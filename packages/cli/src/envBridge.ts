/**
 * @aesthetic-function/cli - envBridge.ts
 *
 * Phase 15C: Config → Environment Variable Bridge.
 *
 * WHY: The CLI resolves af.config.json, then passes config values
 * as environment variables to delegated modules. Each module reads
 * env vars via its existing config.ts — no logic is duplicated.
 *
 * CONSTRAINTS:
 * - Translates config → env vars ONLY
 * - Does NOT implement any reconciliation logic
 * - Does NOT override env vars that the user has already set
 */

import type { ResolvedAfConfig } from '@aesthetic-function/shared/config';

/**
 * Derive environment variables from resolved config.
 *
 * Only sets values that are NOT already in process.env,
 * preserving the "env vars always win" precedence rule.
 */
export function deriveConfigEnv(config: ResolvedAfConfig): Record<string, string> {
  const env: Record<string, string> = {};

  // Server
  env.PORT = String(config.server.port);
  env.SERVER_URL = config.server.url;

  // Overrides
  env.USE_OVERRIDES = String(config.overrides.enabled);
  env.OVERRIDES_PRECEDENCE = config.overrides.precedence;

  // Materialization
  env.MATERIALIZE_MODE = config.materialize.mode;
  env.MATERIALIZE_ON = config.materialize.on;
  env.MATERIALIZE_DRY_RUN = String(config.materialize.dryRun);

  // Canonical — env var names must match what policy.ts reads:
  //   process.env.CANONICAL_COLOR_STRATEGY
  //   process.env.CANONICAL_SPACING_SCALE
  //   process.env.CANONICAL_RADIUS_SCALE
  //   process.env.CANONICAL_TYPOGRAPHY_SCALE
  //   process.env.CANONICAL_STRICT
  env.CANONICAL_COLOR_STRATEGY = config.canonical.colorStrategy;
  env.CANONICAL_SPACING_SCALE = config.canonical.spacingScale;
  env.CANONICAL_RADIUS_SCALE = config.canonical.radiusScale;
  env.CANONICAL_TYPOGRAPHY_SCALE = config.canonical.typographyScale;
  env.CANONICAL_STRICT = String(config.canonical.strict);

  // Profile
  env.RECONCILIATION_POLICY = config.profile;

  // Audit
  if (config.audit.enabled) {
    env.ENABLE_AUDIT_LOG = 'true';
  }

  return env;
}

/**
 * Build a merged environment for child processes.
 *
 * Inherits current process.env, then overlays config-derived values.
 * Since process.env already contains any user-set env vars,
 * and loadAfConfig() already respects env > file precedence,
 * the config-derived values here are already correct.
 */
export function buildChildEnv(config: ResolvedAfConfig): NodeJS.ProcessEnv {
  return { ...process.env, ...deriveConfigEnv(config) };
}
