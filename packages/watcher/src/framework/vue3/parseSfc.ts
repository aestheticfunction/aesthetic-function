/**
 * @aesthetic-function/watcher - framework/vue3/parseSfc.ts
 *
 * SFC (Single File Component) block splitter using @vue/compiler-sfc.
 *
 * WHY: `@vue/compiler-sfc.parse()` is the canonical first-party tool for
 * splitting `.vue` files into their constituent blocks (<template>, <script>,
 * <script setup>, <style>, custom blocks). It tracks source-range offsets,
 * which are required for magic-string write-back in Phase 3.
 *
 * This module is intentionally thin — it only splits the file into blocks and
 * normalises the result into our own `SfcDescriptor` shape. Subsequent modules
 * (extractMarkers, parseAst, tokens) receive `SfcDescriptor` and never need
 * to know about `@vue/compiler-sfc` internals.
 *
 * SCOPE (v1):
 * - Returns template, script, scriptSetup, styles, customBlocks
 * - Custom blocks are parsed but ignored in reconciliation
 * - Preserves source offsets for future write-back
 * - No CSS preprocessing (SCSS/Sass out of scope)
 */

// =============================================================================
// DYNAMIC IMPORT GUARD
// =============================================================================

/**
 * Lazy-load @vue/compiler-sfc.
 *
 * WHY: The Vue compiler is an optional dependency. If it is not installed
 * (e.g., in a pure-React project), the Vue analyzer returns empty results
 * rather than crashing the entire watcher.
 */
async function loadVueCompilerSfc(): Promise<typeof import('@vue/compiler-sfc') | null> {
  try {
    return await import('@vue/compiler-sfc');
  } catch {
    return null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source-range within the original `.vue` file (byte offsets, 0-based).
 * Used for magic-string write-back in Phase 3.
 */
export interface BlockRange {
  start: number;
  end: number;
}

/**
 * A single SFC block extracted from a `.vue` file.
 */
export interface SfcBlock {
  /** Raw text content of the block (between the opening and closing tags). */
  content: string;
  /** Language tag (e.g., 'ts', 'js', 'html', 'scss'). Undefined means default. */
  lang?: string;
  /** Source range of the content within the original file. */
  range: BlockRange;
}

/**
 * A `<style>` block with additional Vue-specific flags.
 */
export interface SfcStyleBlock extends SfcBlock {
  /** `<style scoped>` flag */
  scoped: boolean;
  /** `<style module>` flag */
  cssModule: boolean;
}

/**
 * Parsed descriptor for a `.vue` SFC file.
 */
export interface SfcDescriptor {
  /** Original file path. */
  filePath: string;
  /** Original full source text. */
  source: string;

  /** `<template>` block, or null if absent. */
  template: SfcBlock | null;

  /**
   * `<script>` block (Options API / Composition API without `setup`).
   * Null if absent.
   */
  script: SfcBlock | null;

  /**
   * `<script setup>` block (Composition API with `setup`).
   * Null if absent. Takes precedence over `script` for component name resolution.
   */
  scriptSetup: SfcBlock | null;

  /** All `<style>` blocks. */
  styles: SfcStyleBlock[];

  /**
   * Custom blocks (e.g., `<docs>`, `<i18n>`).
   * Present for completeness; ignored by reconciliation in v1.
   */
  customBlocks: SfcBlock[];

  /** True if the file was parsed successfully. */
  ok: boolean;

  /** Non-fatal parse warnings. */
  warnings: string[];
}

// =============================================================================
// FALLBACK DESCRIPTOR (when @vue/compiler-sfc is unavailable)
// =============================================================================

/**
 * Return an empty descriptor used when `@vue/compiler-sfc` is not installed.
 * Callers check `descriptor.ok` before using any blocks.
 */
function emptyDescriptor(filePath: string, source: string, reason: string): SfcDescriptor {
  return {
    filePath,
    source,
    template: null,
    script: null,
    scriptSetup: null,
    styles: [],
    customBlocks: [],
    ok: false,
    warnings: [`parseSfc: ${reason}`],
  };
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse a `.vue` SFC file into its constituent blocks.
 *
 * @param source   - Full file content
 * @param filePath - Absolute or relative path (for diagnostics)
 * @returns `SfcDescriptor` with all blocks and source ranges
 */
export async function parseSfc(source: string, filePath: string): Promise<SfcDescriptor> {
  const compiler = await loadVueCompilerSfc();

  if (!compiler) {
    return emptyDescriptor(
      filePath,
      source,
      '@vue/compiler-sfc is not installed. Install it with: pnpm add -D @vue/compiler-sfc'
    );
  }

  let parsed;
  try {
    parsed = compiler.parse(source, { filename: filePath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyDescriptor(filePath, source, `@vue/compiler-sfc parse error: ${msg}`);
  }

  const { descriptor, errors } = parsed;
  const warnings = errors.map((e) =>
    typeof e === 'string' ? e : (e as { message: string }).message
  );

  // Map a compiler-sfc block to our SfcBlock shape.
  // The `loc.start.offset` / `loc.end.offset` fields give absolute byte
  // positions in the source — used by magic-string in Phase 3.
  function mapBlock(block: {
    content: string;
    lang?: string;
    loc: { start: { offset: number }; end: { offset: number } };
  }): SfcBlock {
    return {
      content: block.content,
      lang: block.lang,
      range: {
        start: block.loc.start.offset,
        end: block.loc.end.offset,
      },
    };
  }

  return {
    filePath,
    source,
    template: descriptor.template ? mapBlock(descriptor.template) : null,
    script: descriptor.script ? mapBlock(descriptor.script) : null,
    scriptSetup: descriptor.scriptSetup ? mapBlock(descriptor.scriptSetup) : null,
    styles: descriptor.styles.map((s) => ({
      ...mapBlock(s),
      scoped: s.scoped ?? false,
      cssModule: s.module != null,
    })),
    customBlocks: descriptor.customBlocks.map(mapBlock),
    ok: true,
    warnings,
  };
}

/**
 * Synchronous version of `parseSfc` using a simple regex-based block splitter.
 *
 * WHY: The full `@vue/compiler-sfc` parser is async (dynamic import). When
 * callers need synchronous parsing (e.g., unit tests with mock data, or when
 * the watcher already has the compiler loaded), this lightweight version handles
 * the common case: well-formed SFCs with a single `<template>`, `<script>` or
 * `<script setup>`, and zero or more `<style>` blocks.
 *
 * LIMITATIONS compared to `parseSfc`:
 * - Does not handle malformed SFCs gracefully
 * - Source ranges are approximate (byte offsets via indexOf)
 * - Custom blocks are not extracted
 * - No validation or error reporting
 *
 * Use `parseSfc` (async) in production code.
 * Use `parseSfcSync` only in tests when you have already verified the fixture.
 */
export function parseSfcSync(source: string, filePath: string): SfcDescriptor {
  function extractBlock(
    tag: string,
    attrs: string
  ): SfcBlock | null {
    const openTagRegex = new RegExp(`<${tag}(${attrs}[^>]*)?>`, 'i');
    const closeTagRegex = new RegExp(`</${tag}>`, 'i');

    const openMatch = openTagRegex.exec(source);
    if (!openMatch) return null;

    const contentStart = openMatch.index + openMatch[0].length;
    const closeMatch = closeTagRegex.exec(source.slice(contentStart));
    if (!closeMatch) return null;

    const contentEnd = contentStart + closeMatch.index;
    const block = source.slice(contentStart, contentEnd);
    const langMatch = /\blang=["']?(\w+)["']?/.exec(openMatch[1] ?? '');

    return {
      content: block,
      lang: langMatch?.[1],
      range: { start: contentStart, end: contentEnd },
    };
  }

  function extractStyleBlocks(): SfcStyleBlock[] {
    const blocks: SfcStyleBlock[] = [];
    const styleTagRegex = /<style([^>]*)>/gi;
    let match;

    while ((match = styleTagRegex.exec(source)) !== null) {
      const attrStr = match[1] ?? '';
      const contentStart = match.index + match[0].length;
      const closeIdx = source.indexOf('</style>', contentStart);
      if (closeIdx === -1) continue;

      const content = source.slice(contentStart, closeIdx);
      const langMatch = /\blang=["']?(\w+)["']?/.exec(attrStr);
      const scopedMatch = /\bscoped\b/.test(attrStr);
      const moduleMatch = /\bmodule\b/.test(attrStr);

      blocks.push({
        content,
        lang: langMatch?.[1],
        range: { start: contentStart, end: closeIdx },
        scoped: scopedMatch,
        cssModule: moduleMatch,
      });
    }

    return blocks;
  }

  const template = extractBlock('template', '');
  const scriptSetupMatch = /<script\s[^>]*\bsetup\b[^>]*>/i.exec(source);
  const scriptSetup = scriptSetupMatch
    ? extractBlock('script', '[^>]*\\bsetup\\b')
    : null;
  const script = scriptSetup ? null : extractBlock('script', '(?![^>]*\\bsetup\\b)');

  return {
    filePath,
    source,
    template,
    script,
    scriptSetup,
    styles: extractStyleBlocks(),
    customBlocks: [],
    ok: true,
    warnings: [],
  };
}
