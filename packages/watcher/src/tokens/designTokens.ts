/**
 * @aesthetic-function/watcher - tokens/designTokens.ts
 *
 * Design token context and resolution utilities.
 *
 * WHY: Prefer semantic tokens over raw values.
 * Token resolution happens BEFORE Figma updates.
 *
 * This is a mock implementation with hardcoded tokens.
 * In production, tokens would be loaded from a design system
 * (e.g., Figma Variables, Style Dictionary, Tokens Studio).
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DesignToken {
  /** Token path, e.g. "Primary/Blue500" */
  name: string;
  /** Resolved hex value, e.g. "#3B82F6" */
  value: string;
  /** Optional category for organization */
  category?: 'color' | 'spacing' | 'typography';
}

export interface DesignTokenContext {
  /** Map of token name → token definition */
  tokens: Map<string, DesignToken>;
  /** Map of hex value → token name (reverse lookup) */
  hexToToken: Map<string, string>;
}

// =============================================================================
// MOCK TOKEN DEFINITIONS
// =============================================================================

/**
 * Mock design tokens representing a typical design system.
 * These would normally come from Figma Variables or a tokens file.
 */
const MOCK_TOKENS: DesignToken[] = [
  // Primary colors
  { name: 'Primary/Blue500', value: '#3B82F6', category: 'color' },
  { name: 'Primary/Blue600', value: '#2563EB', category: 'color' },
  { name: 'Primary/Blue700', value: '#1D4ED8', category: 'color' },

  // Semantic colors
  { name: 'Success/Green500', value: '#10B981', category: 'color' },
  { name: 'Warning/Yellow500', value: '#F59E0B', category: 'color' },
  { name: 'Error/Red500', value: '#EF4444', category: 'color' },
  { name: 'Error/Red600', value: '#DC2626', category: 'color' },

  // Neutral colors
  { name: 'Neutral/Gray50', value: '#F9FAFB', category: 'color' },
  { name: 'Neutral/Gray100', value: '#F3F4F6', category: 'color' },
  { name: 'Neutral/Gray500', value: '#6B7280', category: 'color' },
  { name: 'Neutral/Gray900', value: '#111827', category: 'color' },

  // Pure colors (for testing)
  { name: 'Pure/Red', value: '#FF0000', category: 'color' },
  { name: 'Pure/Green', value: '#00FF00', category: 'color' },
  { name: 'Pure/Blue', value: '#0000FF', category: 'color' },
];

// =============================================================================
// TOKEN CONTEXT FACTORY
// =============================================================================

/**
 * Create a design token context from a list of tokens.
 * Builds both forward (name→value) and reverse (value→name) lookups.
 */
export function createTokenContext(tokens: DesignToken[]): DesignTokenContext {
  const tokenMap = new Map<string, DesignToken>();
  const hexToTokenMap = new Map<string, string>();

  for (const token of tokens) {
    tokenMap.set(token.name, token);
    // Normalize hex to uppercase for consistent lookup
    hexToTokenMap.set(token.value.toUpperCase(), token.name);
  }

  return {
    tokens: tokenMap,
    hexToToken: hexToTokenMap,
  };
}

/**
 * Get the default mock token context.
 * Use this for testing and development.
 */
export function getDefaultTokenContext(): DesignTokenContext {
  return createTokenContext(MOCK_TOKENS);
}

// =============================================================================
// TOKEN RESOLUTION
// =============================================================================

/**
 * Resolve a color value to its hex representation.
 *
 * - If input is a token name (e.g., "Primary/Blue500"), returns the hex value
 * - If input is already a hex value, returns it as-is
 * - If token not found, returns the input unchanged (allows passthrough)
 *
 * @param value - Token name or hex value
 * @param context - Design token context
 * @returns Resolved hex color value
 */
export function resolveColorToken(
  value: string,
  context: DesignTokenContext
): string {
  // Check if it's a hex color (starts with #)
  if (value.startsWith('#')) {
    return value;
  }

  // Try to resolve as token name
  const token = context.tokens.get(value);
  if (token) {
    return token.value;
  }

  // Fallback: return as-is (might be a CSS color name or unknown token)
  console.warn(`[Tokens] Unknown token: "${value}", passing through as-is`);
  return value;
}

/**
 * Look up a token name from a hex value.
 *
 * - If hex matches a known token, returns the token name
 * - Otherwise returns null
 *
 * WHY: Useful for converting raw values back to semantic tokens
 * when syncing from Figma to code.
 *
 * @param hex - Hex color value (e.g., "#3B82F6")
 * @param context - Design token context
 * @returns Token name or null if no match
 */
export function hexToTokenName(
  hex: string,
  context: DesignTokenContext
): string | null {
  const normalized = hex.toUpperCase();
  return context.hexToToken.get(normalized) ?? null;
}

/**
 * Get token info for display/debugging.
 * Returns both the token name and resolved value.
 */
export function getTokenInfo(
  value: string,
  context: DesignTokenContext
): { tokenName: string | null; resolvedValue: string } {
  if (value.startsWith('#')) {
    // It's a hex value - try to find matching token
    const tokenName = hexToTokenName(value, context);
    return { tokenName, resolvedValue: value };
  } else {
    // It's a token name - resolve to hex
    const resolvedValue = resolveColorToken(value, context);
    const token = context.tokens.get(value);
    return {
      tokenName: token ? value : null,
      resolvedValue,
    };
  }
}
