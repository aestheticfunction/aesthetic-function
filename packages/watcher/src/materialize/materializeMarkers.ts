/**
 * @aesthetic-function/watcher - materialize/materializeMarkers.ts
 *
 * Updates @figma marker lines in source files with design override values.
 *
 * WHY: Marker mode creates real file diffs by updating existing @figma
 * comment markers. This is a lightweight approach that doesn't require
 * AST manipulation - just regex-based line editing.
 *
 * RULES:
 * - Only modify lines that already contain // @figma node=<NodeName>
 * - If override contains text, set/replace text="..."
 * - If override contains fill, set/replace fill=...
 * - Preserve formatting as much as possible
 * - If a node has no marker line, it's "unapplied" (logged, not inserted)
 */

import { writeFile, rename, unlink } from 'node:fs/promises';
import type { DesignOverrides, DesignOverride } from '../reconcile/types.js';
import type { MarkerEdit, MarkerEditResult, MaterializeResult } from './types.js';

// =============================================================================
// MARKER REGEX
// =============================================================================

/**
 * Regex to match @figma marker lines.
 * Same as in parseIntentFromReact.ts but captures the full line.
 *
 * Group 1: Leading whitespace and //
 * Group 2: Everything after @figma
 */
const MARKER_LINE_REGEX = /^([ \t]*\/\/\s*)@figma\s+(.+)$/;

/**
 * Extract node name from marker attributes.
 *
 * @param attrString - Attribute string after @figma
 * @returns Node name or null if not found
 */
function extractNodeName(attrString: string): string | null {
  const match = attrString.match(/node=(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Check if a node name is a placeholder (wrapped in angle brackets).
 */
function isPlaceholderNode(nodeName: string): boolean {
  return nodeName.startsWith('<') && nodeName.endsWith('>');
}

// =============================================================================
// MARKER EDITING
// =============================================================================

/**
 * Update or add an attribute in a marker line.
 *
 * @param line - Original marker line
 * @param attrName - Attribute name (text, fill)
 * @param value - New value
 * @returns Updated line
 */
function updateMarkerAttribute(
  line: string,
  attrName: string,
  value: string
): string {
  // Pattern to match the attribute with various quote styles
  const quotedPattern = new RegExp(`${attrName}=(?:"[^"]*"|'[^']*'|\\S+)`);

  // Value needs quotes if it contains spaces
  const needsQuotes = value.includes(' ') || attrName === 'text';
  const formattedValue = needsQuotes ? `"${value}"` : value;
  const replacement = `${attrName}=${formattedValue}`;

  if (quotedPattern.test(line)) {
    // Replace existing attribute
    return line.replace(quotedPattern, replacement);
  } else {
    // Add new attribute at end of line (before any trailing whitespace)
    return line.trimEnd() + ` ${replacement}`;
  }
}

/**
 * Apply an override to a marker line.
 *
 * @param line - Original marker line
 * @param override - Design override to apply
 * @returns Updated line
 */
function applyOverrideToLine(line: string, override: DesignOverride): string {
  let result = line;

  if (override.text !== undefined) {
    result = updateMarkerAttribute(result, 'text', override.text);
  }

  if (override.fill !== undefined) {
    result = updateMarkerAttribute(result, 'fill', override.fill);
  }

  return result;
}

/**
 * Compute marker edits for a file without applying them.
 *
 * @param content - File content
 * @param overrides - Design overrides
 * @returns Marker edits and unapplied nodes
 */
export function computeMarkerEdits(
  content: string,
  overrides: DesignOverrides
): MarkerEditResult {
  const edits: MarkerEdit[] = [];
  const appliedNodes = new Set<string>();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(MARKER_LINE_REGEX);

    if (!match) continue;

    const attrString = match[2];
    const nodeName = extractNodeName(attrString);

    if (!nodeName || isPlaceholderNode(nodeName)) continue;

    // Check if we have an override for this node
    const override = overrides[nodeName];
    if (!override) continue;

    // Compute the new line
    const newLine = applyOverrideToLine(line, override);

    // Only add edit if line actually changed
    if (newLine !== line) {
      edits.push({
        lineNumber: i + 1, // 1-based
        originalLine: line,
        newLine,
        nodeName,
      });
    }

    appliedNodes.add(nodeName);
  }

  // Find unapplied overrides (nodes with overrides but no marker)
  const unapplied: string[] = [];
  for (const nodeName of Object.keys(overrides)) {
    if (!appliedNodes.has(nodeName)) {
      unapplied.push(nodeName);
    }
  }

  return {
    file: '', // Will be set by caller
    edits,
    unapplied,
  };
}

/**
 * Apply marker edits to content.
 *
 * @param content - Original file content
 * @param edits - Edits to apply
 * @returns Updated content
 */
export function applyMarkerEdits(content: string, edits: MarkerEdit[]): string {
  if (edits.length === 0) {
    return content;
  }

  const lines = content.split('\n');

  // Apply edits (edits are 1-based line numbers)
  for (const edit of edits) {
    const index = edit.lineNumber - 1;
    if (index >= 0 && index < lines.length) {
      lines[index] = edit.newLine;
    }
  }

  return lines.join('\n');
}

/**
 * Write file content atomically.
 *
 * @param filePath - Path to write
 * @param content - Content to write
 */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;

  try {
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Materialize design overrides by updating @figma markers in source files.
 *
 * @param options - Materialization options
 * @returns Materialization result
 */
export async function materializeMarkers(options: {
  /** Absolute path to source file */
  absolutePath: string;
  /** Relative path for logging */
  relativePath: string;
  /** File content (already read) */
  content: string;
  /** Design overrides to apply */
  overrides: DesignOverrides;
  /** Whether this is a dry run (no writes) */
  dryRun: boolean;
}): Promise<MaterializeResult> {
  const { absolutePath, relativePath, content, overrides, dryRun } = options;

  // Compute edits
  const editResult = computeMarkerEdits(content, overrides);
  editResult.file = relativePath;

  // If no edits, return early
  if (editResult.edits.length === 0) {
    return {
      mode: 'markers',
      dryRun,
      changes: 0,
      unapplied: editResult.unapplied.length,
      edits: [],
    };
  }

  // Apply edits to content
  const updatedContent = applyMarkerEdits(content, editResult.edits);

  // Write unless dry run
  if (!dryRun) {
    await writeFileAtomic(absolutePath, updatedContent);
  }

  return {
    mode: 'markers',
    dryRun,
    changes: editResult.edits.length,
    unapplied: editResult.unapplied.length,
    edits: editResult.edits,
  };
}
