/**
 * @aesthetic-function/shared - configLoader.ts
 *
 * Configuration discovery, loading, and merging.
 *
 * MERGE PRECEDENCE (lowest → highest):
 *   1. Built-in defaults
 *   2. af.config.json file values
 *   3. Environment variables (always override file values)
 *
 * DISCOVERY:
 *   Search cwd → parent dirs → stop at .git root or filesystem root.
 *
 * BACKWARD COMPATIBILITY:
 *   Without af.config.json, returns defaults that match existing env-var behavior exactly.
 *   Existing env vars (USE_OVERRIDES, OVERRIDES_PRECEDENCE, etc.) always win over file values.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

import type {
  AfConfig,
  ResolvedAfConfig,
  PolicyProfileName,
  ColorStrategy,
  SpacingScaleStrategy,
  RadiusScaleStrategy,
  TypographyScaleStrategy,
  MaterializeMode,
  MaterializeOn,
} from './config.js';
import type { OverridePrecedence } from './policy.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const CONFIG_FILENAME = 'af.config.json';

/**
 * Default configuration values.
 * These match the existing Phase 14F defaults exactly.
 */
export const DEFAULT_CONFIG: ResolvedAfConfig = {
  profile: 'designer-first',
  server: {
    port: 3001,
    url: 'http://localhost:3001',
  },
  watcher: {
    watchPaths: ['./demo-app/src'],
  },
  overrides: {
    enabled: true,
    precedence: 'always',
  },
  materialize: {
    mode: 'off',
    on: 'design_change',
    dryRun: true,
  },
  canonical: {
    colorStrategy: 'token-first',
    spacingScale: '8pt',
    radiusScale: 'default',
    typographyScale: 'default',
    strict: false,
  },
  audit: {
    enabled: false,
  },
  _source: null,
};

// =============================================================================
// FILE DISCOVERY
// =============================================================================

/**
 * Search for af.config.json starting from startDir, walking up to .git root
 * or filesystem root.
 *
 * @param startDir - Directory to start searching from
 * @returns Absolute path to config file, or null if not found
 */
export function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = resolve('/');

  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      // Verify it's a file, not a directory
      try {
        const s = statSync(candidate);
        if (s.isFile()) {
          return candidate;
        }
      } catch {
        // stat failed, skip
      }
    }

    // Stop at .git boundary
    const gitDir = join(dir, '.git');
    if (existsSync(gitDir)) {
      break;
    }

    // Move up
    const parent = dirname(dir);
    if (parent === dir || parent === root) {
      break;
    }
    dir = parent;
  }

  return null;
}

// =============================================================================
// FILE LOADING
// =============================================================================

/**
 * Load and parse af.config.json from a given path.
 * Returns null if the file doesn't exist or is invalid JSON.
 *
 * @param configPath - Absolute path to config file
 * @returns Parsed config or null
 */
export function loadConfigFile(configPath: string): AfConfig | null {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    // Basic type guard: must be a non-null object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(`[Config] ${configPath}: expected JSON object, got ${typeof parsed}`);
      return null;
    }

    return validateAfConfig(parsed as Record<string, unknown>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.warn(`[Config] Failed to load ${configPath}: ${(err as Error).message}`);
    return null;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

const VALID_PROFILES: PolicyProfileName[] = ['designer-first', 'code-first', 'balanced', 'strict-review'];
const VALID_COLOR_STRATEGIES: ColorStrategy[] = ['token-first', 'hex-allowed', 'token-only'];
const VALID_SPACING_SCALES: SpacingScaleStrategy[] = ['8pt', 'token-only', 'custom'];
const VALID_RADIUS_SCALES: RadiusScaleStrategy[] = ['default', 'token-only', 'custom'];
const VALID_TYPOGRAPHY_SCALES: TypographyScaleStrategy[] = ['default', 'token-only', 'custom'];
const VALID_PRECEDENCE: OverridePrecedence[] = ['always', 'if_newer_than_code'];
const VALID_MATERIALIZE_MODES: MaterializeMode[] = ['off', 'patch', 'markers'];
const VALID_MATERIALIZE_ON: MaterializeOn[] = ['design_change', 'file_save'];

/**
 * Validate a parsed JSON object as AfConfig.
 * Strips invalid fields silently — config is advisory, not strict.
 */
function validateAfConfig(raw: Record<string, unknown>): AfConfig {
  const config: AfConfig = {};

  // Profile
  if (typeof raw.profile === 'string' && VALID_PROFILES.includes(raw.profile as PolicyProfileName)) {
    config.profile = raw.profile as PolicyProfileName;
  }

  // Server
  if (typeof raw.server === 'object' && raw.server !== null && !Array.isArray(raw.server)) {
    const srv = raw.server as Record<string, unknown>;
    config.server = {};
    if (typeof srv.port === 'number' && srv.port > 0 && srv.port < 65536) {
      config.server.port = srv.port;
    }
    if (typeof srv.url === 'string' && srv.url.length > 0) {
      config.server.url = srv.url;
    }
  }

  // Watcher
  if (typeof raw.watcher === 'object' && raw.watcher !== null && !Array.isArray(raw.watcher)) {
    const w = raw.watcher as Record<string, unknown>;
    config.watcher = {};
    if (Array.isArray(w.watchPaths) && w.watchPaths.every((p: unknown) => typeof p === 'string')) {
      config.watcher.watchPaths = w.watchPaths as string[];
    }
  }

  // Overrides
  if (typeof raw.overrides === 'object' && raw.overrides !== null && !Array.isArray(raw.overrides)) {
    const o = raw.overrides as Record<string, unknown>;
    config.overrides = {};
    if (typeof o.enabled === 'boolean') {
      config.overrides.enabled = o.enabled;
    }
    if (typeof o.precedence === 'string' && VALID_PRECEDENCE.includes(o.precedence as OverridePrecedence)) {
      config.overrides.precedence = o.precedence as OverridePrecedence;
    }
  }

  // Materialize
  if (typeof raw.materialize === 'object' && raw.materialize !== null && !Array.isArray(raw.materialize)) {
    const m = raw.materialize as Record<string, unknown>;
    config.materialize = {};
    if (typeof m.mode === 'string' && VALID_MATERIALIZE_MODES.includes(m.mode as MaterializeMode)) {
      config.materialize.mode = m.mode as MaterializeMode;
    }
    if (typeof m.on === 'string' && VALID_MATERIALIZE_ON.includes(m.on as MaterializeOn)) {
      config.materialize.on = m.on as MaterializeOn;
    }
    if (typeof m.dryRun === 'boolean') {
      config.materialize.dryRun = m.dryRun;
    }
  }

  // Canonical
  if (typeof raw.canonical === 'object' && raw.canonical !== null && !Array.isArray(raw.canonical)) {
    const c = raw.canonical as Record<string, unknown>;
    config.canonical = {};
    if (typeof c.colorStrategy === 'string' && VALID_COLOR_STRATEGIES.includes(c.colorStrategy as ColorStrategy)) {
      config.canonical.colorStrategy = c.colorStrategy as ColorStrategy;
    }
    if (typeof c.spacingScale === 'string' && VALID_SPACING_SCALES.includes(c.spacingScale as SpacingScaleStrategy)) {
      config.canonical.spacingScale = c.spacingScale as SpacingScaleStrategy;
    }
    if (typeof c.radiusScale === 'string' && VALID_RADIUS_SCALES.includes(c.radiusScale as RadiusScaleStrategy)) {
      config.canonical.radiusScale = c.radiusScale as RadiusScaleStrategy;
    }
    if (typeof c.typographyScale === 'string' && VALID_TYPOGRAPHY_SCALES.includes(c.typographyScale as TypographyScaleStrategy)) {
      config.canonical.typographyScale = c.typographyScale as TypographyScaleStrategy;
    }
    if (typeof c.strict === 'boolean') {
      config.canonical.strict = c.strict;
    }
  }

  // Audit
  if (typeof raw.audit === 'object' && raw.audit !== null && !Array.isArray(raw.audit)) {
    const a = raw.audit as Record<string, unknown>;
    config.audit = {};
    if (typeof a.enabled === 'boolean') {
      config.audit.enabled = a.enabled;
    }
  }

  return config;
}

// =============================================================================
// ENVIRONMENT VARIABLE OVERLAY
// =============================================================================

/**
 * Read environment variables and overlay them onto a config.
 * Env vars always win over file values (backward compatibility).
 */
function applyEnvOverrides(base: ResolvedAfConfig): ResolvedAfConfig {
  const config = structuredClone(base);

  // Profile from env
  const profileEnv = process.env.RECONCILIATION_POLICY?.toLowerCase();
  if (profileEnv && VALID_PROFILES.includes(profileEnv as PolicyProfileName)) {
    config.profile = profileEnv as PolicyProfileName;
  }

  // Server
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (port > 0 && port < 65536) {
      config.server.port = port;
    }
  }
  if (process.env.SERVER_URL) {
    config.server.url = process.env.SERVER_URL;
  }

  // Watcher
  if (process.env.WATCH_PATH) {
    config.watcher.watchPaths = [process.env.WATCH_PATH];
  }

  // Overrides
  const useOverrides = process.env.USE_OVERRIDES?.toLowerCase();
  if (useOverrides !== undefined && useOverrides !== '') {
    config.overrides.enabled = useOverrides !== 'false' && useOverrides !== '0';
  }

  const precedence = process.env.OVERRIDES_PRECEDENCE?.toLowerCase();
  if (precedence && VALID_PRECEDENCE.includes(precedence as OverridePrecedence)) {
    config.overrides.precedence = precedence as OverridePrecedence;
  }

  // Materialize
  const materializeMode = process.env.MATERIALIZE_MODE?.toLowerCase();
  if (materializeMode && VALID_MATERIALIZE_MODES.includes(materializeMode as MaterializeMode)) {
    config.materialize.mode = materializeMode as MaterializeMode;
  }

  const materializeOn = process.env.MATERIALIZE_ON?.toLowerCase();
  if (materializeOn && VALID_MATERIALIZE_ON.includes(materializeOn as MaterializeOn)) {
    config.materialize.on = materializeOn as MaterializeOn;
  }

  const materializeDryRun = process.env.MATERIALIZE_DRY_RUN?.toLowerCase();
  if (materializeDryRun !== undefined && materializeDryRun !== '') {
    config.materialize.dryRun = materializeDryRun !== 'false' && materializeDryRun !== '0';
  }

  // Canonical
  const colorStrategy = process.env.CANONICAL_COLOR_STRATEGY;
  if (colorStrategy && VALID_COLOR_STRATEGIES.includes(colorStrategy as ColorStrategy)) {
    config.canonical.colorStrategy = colorStrategy as ColorStrategy;
  }

  const spacingScale = process.env.CANONICAL_SPACING_SCALE;
  if (spacingScale && VALID_SPACING_SCALES.includes(spacingScale as SpacingScaleStrategy)) {
    config.canonical.spacingScale = spacingScale as SpacingScaleStrategy;
  }

  const radiusScale = process.env.CANONICAL_RADIUS_SCALE;
  if (radiusScale && VALID_RADIUS_SCALES.includes(radiusScale as RadiusScaleStrategy)) {
    config.canonical.radiusScale = radiusScale as RadiusScaleStrategy;
  }

  const typographyScale = process.env.CANONICAL_TYPOGRAPHY_SCALE;
  if (typographyScale && VALID_TYPOGRAPHY_SCALES.includes(typographyScale as TypographyScaleStrategy)) {
    config.canonical.typographyScale = typographyScale as TypographyScaleStrategy;
  }

  const canonicalStrict = process.env.CANONICAL_STRICT;
  if (canonicalStrict === 'true') {
    config.canonical.strict = true;
  } else if (canonicalStrict === 'false') {
    config.canonical.strict = false;
  }

  // Audit
  const auditEnabled = process.env.ENABLE_AUDIT_LOG?.toLowerCase();
  if (auditEnabled === 'true' || auditEnabled === '1') {
    config.audit.enabled = true;
  } else if (auditEnabled === 'false' || auditEnabled === '0') {
    config.audit.enabled = false;
  }

  return config;
}

// =============================================================================
// MERGE
// =============================================================================

/**
 * Merge file config onto defaults. File values override defaults
 * but only for explicitly set fields.
 */
function mergeFileConfig(defaults: ResolvedAfConfig, file: AfConfig, source: string): ResolvedAfConfig {
  const config = structuredClone(defaults);
  config._source = source;

  if (file.profile !== undefined) config.profile = file.profile;

  // Server
  if (file.server?.port !== undefined) config.server.port = file.server.port;
  if (file.server?.url !== undefined) config.server.url = file.server.url;

  // Watcher
  if (file.watcher?.watchPaths !== undefined) config.watcher.watchPaths = file.watcher.watchPaths;

  // Overrides
  if (file.overrides?.enabled !== undefined) config.overrides.enabled = file.overrides.enabled;
  if (file.overrides?.precedence !== undefined) config.overrides.precedence = file.overrides.precedence;

  // Materialize
  if (file.materialize?.mode !== undefined) config.materialize.mode = file.materialize.mode;
  if (file.materialize?.on !== undefined) config.materialize.on = file.materialize.on;
  if (file.materialize?.dryRun !== undefined) config.materialize.dryRun = file.materialize.dryRun;

  // Canonical
  if (file.canonical?.colorStrategy !== undefined) config.canonical.colorStrategy = file.canonical.colorStrategy;
  if (file.canonical?.spacingScale !== undefined) config.canonical.spacingScale = file.canonical.spacingScale;
  if (file.canonical?.radiusScale !== undefined) config.canonical.radiusScale = file.canonical.radiusScale;
  if (file.canonical?.typographyScale !== undefined) config.canonical.typographyScale = file.canonical.typographyScale;
  if (file.canonical?.strict !== undefined) config.canonical.strict = file.canonical.strict;

  // Audit
  if (file.audit?.enabled !== undefined) config.audit.enabled = file.audit.enabled;

  return config;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Load and resolve the full configuration.
 *
 * Merge precedence: defaults → af.config.json → env vars
 *
 * Without af.config.json and no new env vars, returns defaults that match
 * existing Phase 14F behavior exactly.
 *
 * @param startDir - Directory to start searching for af.config.json (default: cwd)
 * @returns Fully resolved configuration
 */
export function loadAfConfig(startDir?: string): ResolvedAfConfig {
  const searchDir = startDir ?? process.cwd();

  // 1. Start with defaults
  let config = structuredClone(DEFAULT_CONFIG);

  // 2. Try to load af.config.json
  const configPath = findConfigFile(searchDir);
  if (configPath) {
    const fileConfig = loadConfigFile(configPath);
    if (fileConfig) {
      config = mergeFileConfig(config, fileConfig, configPath);
    }
  }

  // 3. Apply environment variable overrides (always wins)
  config = applyEnvOverrides(config);

  return config;
}
