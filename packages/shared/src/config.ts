/**
 * @aesthetic-function/shared - config.ts
 *
 * Project configuration type definitions for af.config.json.
 *
 * WHY: Replaces per-invocation env vars with a portable, version-controlled
 * configuration file while remaining fully backward compatible. All fields
 * are optional — zero-config works (existing env vars + defaults).
 *
 * This file defines the SHAPE of configuration. The loader (configLoader.ts)
 * handles discovery, loading, and merging.
 */

import type { OverridePrecedence } from './policy.js';

// =============================================================================
// CANONICAL TOKEN STRATEGIES (re-exported from watcher, defined here for config)
// =============================================================================

/**
 * Color resolution strategy.
 * Mirrors canonicalResolverPolicy/types.ts for config portability.
 */
export type ColorStrategy = 'token-first' | 'hex-allowed' | 'token-only';

/**
 * Spacing scale strategy.
 */
export type SpacingScaleStrategy = '8pt' | 'token-only' | 'custom';

/**
 * Radius scale strategy.
 */
export type RadiusScaleStrategy = 'default' | 'token-only' | 'custom';

/**
 * Typography scale strategy.
 */
export type TypographyScaleStrategy = 'default' | 'token-only' | 'custom';

// =============================================================================
// MATERIALIZATION TYPES
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
// PROFILE NAME
// =============================================================================

/**
 * Built-in reconciliation policy profile names.
 */
export type PolicyProfileName = 'designer-first' | 'code-first' | 'balanced' | 'strict-review';

// =============================================================================
// AF CONFIG
// =============================================================================

/**
 * Project configuration for af.config.json.
 *
 * All fields are optional. When not specified, the system falls back to
 * environment variables, then to built-in defaults. This ensures full
 * backward compatibility with existing workflows.
 */
export interface AfConfig {
  /**
   * Named reconciliation policy profile.
   * Controls override precedence, canonical policy, and conflict handling.
   *
   * - 'designer-first': Overrides always win (current default behavior)
   * - 'code-first': Overrides only win if newer than code
   * - 'balanced': Like code-first, but conflicts produce warnings
   * - 'strict-review': All conflicts block until human review
   *
   * Default: 'designer-first'
   */
  profile?: PolicyProfileName;

  /**
   * Server configuration.
   */
  server?: {
    /** Server port. Default: 3001 */
    port?: number;
    /** Server URL (for watcher → server communication). Default: http://localhost:3001 */
    url?: string;
  };

  /**
   * Watcher configuration.
   */
  watcher?: {
    /** Paths to watch for file changes. */
    watchPaths?: string[];
  };

  /**
   * Override configuration.
   */
  overrides?: {
    /** Enable/disable design overrides. Default: true */
    enabled?: boolean;
    /** Override precedence mode. Derived from profile if not set. */
    precedence?: OverridePrecedence;
  };

  /**
   * Materialization configuration (Design → Code).
   */
  materialize?: {
    /** Materialization mode. Default: 'off' */
    mode?: MaterializeMode;
    /** Trigger mode. Default: 'design_change' */
    on?: MaterializeOn;
    /** Dry-run mode (no actual writes). Default: true */
    dryRun?: boolean;
  };

  /**
   * Canonical token resolution policy.
   */
  canonical?: {
    /** Color resolution strategy. Default: 'token-first' */
    colorStrategy?: ColorStrategy;
    /** Spacing scale strategy. Default: '8pt' */
    spacingScale?: SpacingScaleStrategy;
    /** Radius scale strategy. Default: 'default' */
    radiusScale?: RadiusScaleStrategy;
    /** Typography scale strategy. Default: 'default' */
    typographyScale?: TypographyScaleStrategy;
    /** Strict mode: missing mappings are violations. Default: false */
    strict?: boolean;
  };

  /**
   * Audit log configuration.
   */
  audit?: {
    /** Enable audit logging to sync-log.md. Default: false */
    enabled?: boolean;
  };
}

// =============================================================================
// RESOLVED CONFIG
// =============================================================================

/**
 * Fully resolved configuration with all fields set to concrete values.
 * Produced by the config loader after merging defaults → file → env vars.
 */
export interface ResolvedAfConfig {
  profile: PolicyProfileName;

  server: {
    port: number;
    url: string;
  };

  watcher: {
    watchPaths: string[];
  };

  overrides: {
    enabled: boolean;
    precedence: OverridePrecedence;
  };

  materialize: {
    mode: MaterializeMode;
    on: MaterializeOn;
    dryRun: boolean;
  };

  canonical: {
    colorStrategy: ColorStrategy;
    spacingScale: SpacingScaleStrategy;
    radiusScale: RadiusScaleStrategy;
    typographyScale: TypographyScaleStrategy;
    strict: boolean;
  };

  audit: {
    enabled: boolean;
  };

  /** Where the config was loaded from, or null if using defaults */
  _source: string | null;
}
