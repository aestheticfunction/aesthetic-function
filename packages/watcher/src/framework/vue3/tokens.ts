/**
 * @aesthetic-function/watcher - framework/vue3/tokens.ts
 *
 * Token resolver pipeline for Vue 3 SFCs (v1: stages 1–3).
 *
 * WHY (answer #4): CSS-variable resolution in v1 is scoped to:
 *   1. The current SFC's own <style> blocks
 *   2. Explicitly configured token/style files (AnalyzerOpts.tokenFilePaths)
 *   No workspace-wide scan is performed.
 *
 * PIPELINE (ordered — first match wins):
 *   Stage 1: Literal hex / rgb()
 *   Stage 2: var(--token) resolved from <style> :root declarations +
 *            configured token files
 *   Stage 3: TS/JS token import: `import { tokens } from '@/tokens'`
 *            resolved only for top-level literals
 *   [stub]  Stage 4: Tailwind/UnoCSS — hook only, returns 'unresolved'
 *
 * SCOPE: Returns a `TokenResolution` for any color/style value.
 * The caller decides what to do with 'unresolved' resolutions.
 */

import type { SfcDescriptor } from './parseSfc.js';

// =============================================================================
// TYPES
// =============================================================================

/** Confidence level for a resolved token. */
export type TokenConfidence = 'high' | 'medium' | 'low';

/** Result of the token resolver pipeline. */
export interface TokenResolution {
  /** Original input value (e.g., 'var(--primary)', '#3B82F6'). */
  input: string;
  /** Resolved canonical value (e.g., '#3B82F6'). Undefined if unresolved. */
  resolved: string | undefined;
  /** Which pipeline stage resolved the value. */
  stage: 'literal' | 'css-var' | 'ts-import' | 'tailwind-stub' | 'unresolved';
  /** Confidence in the resolved value. */
  confidence: TokenConfidence;
  /** Human-readable note for diagnostics. */
  note?: string;
}

// =============================================================================
// HEX / RGB LITERALS (Stage 1)
// =============================================================================

/** Matches #RGB, #RRGGBB, #RGBA, #RRGGBBAA */
const HEX_COLOR_REGEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Matches rgb(R, G, B) and rgba(R, G, B, A) */
const RGB_COLOR_REGEX = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/i;

function resolveStage1(value: string): TokenResolution | null {
  const trimmed = value.trim();
  if (HEX_COLOR_REGEX.test(trimmed) || RGB_COLOR_REGEX.test(trimmed)) {
    return {
      input: value,
      resolved: trimmed,
      stage: 'literal',
      confidence: 'high',
    };
  }
  return null;
}

// =============================================================================
// CSS CUSTOM PROPERTIES (Stage 2)
// =============================================================================

/**
 * Scan CSS text for `--token-name: value;` declarations in `:root` blocks.
 *
 * WHY (answer #4): Only the current SFC's <style> blocks are scanned unless
 * the caller provides `extraCssTexts` from `tokenFilePaths`.
 */
function buildCssVarMap(cssTexts: string[]): Map<string, string> {
  const map = new Map<string, string>();
  // Match :root { ... } blocks first, then global --var: value pairs
  const rootBlockRegex = /:root\s*\{([^}]+)\}/g;
  const varDeclRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;

  for (const css of cssTexts) {
    // Try :root blocks first
    let blockMatch;
    rootBlockRegex.lastIndex = 0;
    while ((blockMatch = rootBlockRegex.exec(css)) !== null) {
      const block = blockMatch[1];
      varDeclRegex.lastIndex = 0;
      let varMatch;
      while ((varMatch = varDeclRegex.exec(block)) !== null) {
        map.set(varMatch[1].trim(), varMatch[2].trim());
      }
    }
    // Also scan global-scope declarations (outside :root, for scoped blocks)
    varDeclRegex.lastIndex = 0;
    let varMatch;
    while ((varMatch = varDeclRegex.exec(css)) !== null) {
      const name = varMatch[1].trim();
      if (!map.has(name)) {
        map.set(name, varMatch[2].trim());
      }
    }
  }

  return map;
}

/** Matches `var(--token-name)` or `var(--token-name, fallback)` */
const CSS_VAR_USAGE_REGEX = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\s*\)$/i;

function resolveStage2(
  value: string,
  cssVarMap: Map<string, string>
): TokenResolution | null {
  const trimmed = value.trim();
  const match = CSS_VAR_USAGE_REGEX.exec(trimmed);
  if (!match) return null;

  const varName = match[1];
  const fallback = match[2]?.trim();
  const resolved = cssVarMap.get(varName);

  if (resolved) {
    return {
      input: value,
      resolved,
      stage: 'css-var',
      confidence: 'high',
      note: `resolved ${varName} from <style> block`,
    };
  }

  if (fallback) {
    return {
      input: value,
      resolved: fallback,
      stage: 'css-var',
      confidence: 'medium',
      note: `${varName} not found, used fallback`,
    };
  }

  return {
    input: value,
    resolved: undefined,
    stage: 'css-var',
    confidence: 'low',
    note: `${varName} not found in configured style files`,
  };
}

// =============================================================================
// TS/JS TOKEN IMPORTS (Stage 3)
// =============================================================================

/**
 * Build a simple token map from script content.
 *
 * Handles only top-level `export const <name> = '<value>'` and
 * `export default { <key>: '<value>' }` patterns (literal values only).
 *
 * WHY: Deep resolution (nested objects, re-exports) is out of scope for v1.
 * Only one-hop literals are trustworthy without running a type-checker.
 */
function buildTokenImportMap(scriptContent: string): Map<string, string> {
  const map = new Map<string, string>();

  // export const primary = '#3B82F6';
  const constExportRegex = /export\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = constExportRegex.exec(scriptContent)) !== null) {
    map.set(match[1], match[2]);
  }

  // export default { key: '#value', ... }
  const defaultObjRegex = /export\s+default\s+\{([^}]+)\}/s;
  const defaultMatch = defaultObjRegex.exec(scriptContent);
  if (defaultMatch) {
    const objBody = defaultMatch[1];
    const kvRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
    let kv;
    while ((kv = kvRegex.exec(objBody)) !== null) {
      map.set(kv[1], kv[2]);
    }
  }

  return map;
}

/**
 * Resolve a `tokens.primary` or `colors.primary500` style reference
 * using a flat identifier → value map.
 */
function resolveStage3(
  value: string,
  tokenMap: Map<string, string>
): TokenResolution | null {
  // Simple identifier: `primary`, `primaryColor`
  const simpleIdent = /^[a-zA-Z_$][\w$]*$/.test(value.trim());
  if (simpleIdent) {
    const resolved = tokenMap.get(value.trim());
    if (resolved) {
      return {
        input: value,
        resolved,
        stage: 'ts-import',
        confidence: 'high',
        note: `resolved ${value} from token import`,
      };
    }
  }

  // Dot access: `tokens.primary` — extract last segment
  const dotAccess = /\.(\w+)$/.exec(value.trim());
  if (dotAccess) {
    const key = dotAccess[1];
    const resolved = tokenMap.get(key);
    if (resolved) {
      return {
        input: value,
        resolved,
        stage: 'ts-import',
        confidence: 'medium',
        note: `resolved .${key} from token import (partial path match)`,
      };
    }
  }

  return null;
}

// =============================================================================
// TAILWIND STUB (Stage 4 — hook only)
// =============================================================================

function resolveStage4(value: string): TokenResolution {
  // Placeholder — always returns unresolved.
  // Full implementation deferred to v1.1 (requires running Tailwind config).
  return {
    input: value,
    resolved: undefined,
    stage: 'tailwind-stub',
    confidence: 'low',
    note: 'Tailwind/UnoCSS resolution is not implemented in v1',
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Options for the token resolver.
 */
export interface TokenResolverOpts {
  /** Content of the current SFC's <style> blocks. */
  sfcStyleContents: string[];
  /**
   * Additional CSS texts from explicitly configured token/style files.
   * WHY (answer #4): No workspace scan; only these files are read.
   */
  extraCssTexts?: string[];
  /**
   * Content of the script block where token imports may be found.
   * Used for Stage 3 (TS/JS token import resolution).
   */
  scriptContent?: string;
}

/**
 * Resolve a single color/style value through the pipeline.
 *
 * @param value - Raw value string (from attribute, style, or prop)
 * @param opts  - Token resolver options
 * @returns TokenResolution (never throws; returns 'unresolved' if no stage matches)
 */
export function resolveToken(value: string, opts: TokenResolverOpts): TokenResolution {
  const trimmed = value.trim();
  if (!trimmed) {
    return { input: value, resolved: undefined, stage: 'unresolved', confidence: 'low' };
  }

  // Stage 1: literal
  const s1 = resolveStage1(trimmed);
  if (s1) return s1;

  // Stage 2: css var
  if (trimmed.startsWith('var(')) {
    const allCssTexts = [...opts.sfcStyleContents, ...(opts.extraCssTexts ?? [])];
    const cssVarMap = buildCssVarMap(allCssTexts);
    const s2 = resolveStage2(trimmed, cssVarMap);
    if (s2) return s2;
  }

  // Stage 3: TS/JS token import
  if (opts.scriptContent) {
    const tokenMap = buildTokenImportMap(opts.scriptContent);
    if (tokenMap.size > 0) {
      const s3 = resolveStage3(trimmed, tokenMap);
      if (s3) return s3;
    }
  }

  // Stage 4: Tailwind (stub)
  if (/^[a-z]+-\d+$/.test(trimmed) || /^(bg|text|border)-/.test(trimmed)) {
    return resolveStage4(trimmed);
  }

  return {
    input: value,
    resolved: undefined,
    stage: 'unresolved',
    confidence: 'low',
    note: 'no pipeline stage matched',
  };
}

/**
 * Build token resolver options from a parsed SFC descriptor.
 *
 * @param descriptor   - Parsed SFC
 * @param extraCssTexts - Additional CSS content from configured token files
 */
export function buildTokenResolverOpts(
  descriptor: SfcDescriptor,
  extraCssTexts: string[] = []
): TokenResolverOpts {
  return {
    sfcStyleContents: descriptor.styles.map((s) => s.content),
    extraCssTexts,
    scriptContent:
      descriptor.scriptSetup?.content ?? descriptor.script?.content,
  };
}
