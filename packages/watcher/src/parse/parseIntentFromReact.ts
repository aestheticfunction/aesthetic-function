/**
 * @aesthetic-function/watcher - parse/parseIntentFromReact.ts
 *
 * Parses @figma markers from React file text to produce an IntentModel.
 *
 * MARKER FORMAT:
 *   // @figma node=<NodeName> text="<Text>" fill=<TokenOrHex>
 *
 * EXAMPLES:
 *   // @figma node=LoginButton text="Sign In" fill=Primary/Blue500
 *   // @figma node=TestBox fill=#FF0000
 *   // @figma node=Heading text="Welcome"
 *
 * WHY MARKER-BASED:
 * - No heavy AST parsing required (no Babel/TS compiler)
 * - Explicit opt-in: only marked components sync
 * - Easy to understand and debug
 * - Works with any React code style
 *
 * PHASE 2B SCOPE:
 * - Simple regex-based parsing
 * - ButtonIntent and TextIntent output
 * - No LLM calls
 */

import type { Intent, ButtonIntent, TextIntent } from '../transform/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ParseResult {
  /** Extracted intents from markers */
  intents: Intent[];
  /** Source file path */
  filePath: string;
  /** Number of markers found */
  markerCount: number;
  /** Any parsing warnings */
  warnings: string[];
}

export interface MarkerData {
  /** Target Figma node name */
  node: string;
  /** Optional text content */
  text?: string;
  /** Optional fill color (token or hex) */
  fill?: string;
  /** Raw marker line for debugging */
  rawLine: string;
  /** Line number in file */
  lineNumber: number;
}

// =============================================================================
// MARKER REGEX
// =============================================================================

/**
 * Regex to match @figma markers in comments.
 *
 * Matches:
 *   // @figma node=NodeName text="Some Text" fill=Primary/Blue500
 *   // @figma node=TestBox fill=#FF0000
 *   /* @figma node=Card text="Title" *​/
 *
 * Groups:
 *   1: Everything after @figma (the attributes)
 */
const FIGMA_MARKER_REGEX = /\/\/\s*@figma\s+(.+)$|\/\*\s*@figma\s+(.+?)\s*\*\//gm;

/**
 * Regex to extract individual attributes from marker.
 *
 * Matches:
 *   node=NodeName
 *   text="Some Text"
 *   text='Some Text'
 *   fill=Primary/Blue500
 *   fill=#FF0000
 */
const ATTR_REGEX = /(\w+)=(?:"([^"]+)"|'([^']+)'|(\S+))/g;

// =============================================================================
// PARSER FUNCTIONS
// =============================================================================

/**
 * Parse attributes from a marker string.
 *
 * @param attrString - The attribute portion of the marker (after @figma)
 * @returns Object with parsed attributes
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;

  // Reset regex state
  ATTR_REGEX.lastIndex = 0;

  while ((match = ATTR_REGEX.exec(attrString)) !== null) {
    const key = match[1];
    // Value can be in quotes (group 2 or 3) or unquoted (group 4)
    const value = match[2] ?? match[3] ?? match[4];
    if (key && value) {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Extract all @figma markers from file content.
 *
 * @param content - File content as string
 * @returns Array of parsed marker data
 */
function extractMarkers(content: string): MarkerData[] {
  const markers: MarkerData[] = [];

  // Reset regex state
  FIGMA_MARKER_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FIGMA_MARKER_REGEX.exec(content)) !== null) {
    // Get the attribute string from either // or /* style comment
    const attrString = match[1] ?? match[2];
    if (!attrString) continue;

    const attrs = parseAttributes(attrString);

    // node is required
    if (!attrs['node']) continue;

    // Find line number
    const matchIndex = match.index;
    let lineNumber = 1;
    for (let i = 0; i < matchIndex && i < content.length; i++) {
      if (content[i] === '\n') lineNumber++;
    }

    markers.push({
      node: attrs['node'],
      text: attrs['text'],
      fill: attrs['fill'],
      rawLine: match[0].trim(),
      lineNumber,
    });
  }

  return markers;
}

/**
 * Convert a marker to an Intent.
 *
 * Decision logic:
 * - If marker has both text and fill → ButtonIntent
 * - If marker has only text → TextIntent
 * - If marker has only fill → ButtonIntent (for frame/box fills)
 *
 * @param marker - Parsed marker data
 * @returns Intent or null if invalid
 */
function markerToIntent(marker: MarkerData): Intent | null {
  const { node, text, fill } = marker;

  // If we have fill, treat as Button (can also update frames)
  if (fill) {
    return {
      type: 'BUTTON',
      nodeName: node,
      text: text ?? node, // Default text to node name if not specified
      fillTokenOrHex: fill,
    } satisfies ButtonIntent;
  }

  // If we only have text, treat as TextIntent
  if (text) {
    return {
      type: 'TEXT',
      nodeName: node,
      characters: text,
    } satisfies TextIntent;
  }

  // Neither text nor fill - invalid marker
  return null;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse @figma markers from React file content and produce an IntentModel.
 *
 * @param content - File content as string
 * @param filePath - Path to the file (for debugging/logging)
 * @returns ParseResult with intents and metadata
 */
export function parseIntentFromReact(content: string, filePath: string): ParseResult {
  const warnings: string[] = [];
  const markers = extractMarkers(content);
  const intents: Intent[] = [];

  for (const marker of markers) {
    const intent = markerToIntent(marker);
    if (intent) {
      intents.push(intent);
    } else {
      warnings.push(
        `Line ${marker.lineNumber}: Marker has no text or fill attribute: ${marker.rawLine}`
      );
    }
  }

  return {
    intents,
    filePath,
    markerCount: markers.length,
    warnings,
  };
}

/**
 * Check if a file has any @figma markers.
 * Quick check without full parsing.
 *
 * @param content - File content
 * @returns true if file contains @figma markers
 */
export function hasFigmaMarkers(content: string): boolean {
  return content.includes('@figma');
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export { extractMarkers, parseAttributes, markerToIntent };
