/**
 * @aesthetic-function/watcher - orchestrator/stateAwareApply.ts
 *
 * State-aware application of patch changes.
 *
 * WHY: State-specific changes (hover, pressed, disabled) should NOT overwrite
 * base JSX. Instead, they should be applied to:
 * 1. State markers (e.g., @figma node=LoginButton::hover)
 * 2. Design overrides (design-overrides.json with state suffix)
 *
 * Base state changes CAN modify base JSX literals.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { DesignOverrides, DesignOverride, LayoutOverride } from '../reconcile/types.js';
import type {
  PromptPatchChange,
  PromptPatchArtifact,
  ComponentState,
  ApplyDecision,
  StateAwareApplyResult,
} from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Path to design-overrides.json at repo root.
 */
function getDesignOverridesPath(repoRoot: string): string {
  return join(repoRoot, 'design-overrides.json');
}

// =============================================================================
// APPLY TARGET DECISION
// =============================================================================

/**
 * Determine where a change should be applied based on the target state.
 *
 * Rules:
 * - Base state: Apply to JSX (if auto-writable)
 * - Non-base state: Apply to markers or overrides (NOT JSX)
 *
 * @param change - The proposed change
 * @param state - Target component state
 * @param hasStateMarker - Whether a state-specific marker exists
 * @param hasStateJsxBranch - Whether a state-specific JSX branch exists (e.g., hover styles)
 * @returns ApplyDecision with target and reason
 */
export function determineApplyTarget(
  change: PromptPatchChange,
  state: ComponentState,
  hasStateMarker: boolean,
  hasStateJsxBranch: boolean
): ApplyDecision {
  const nodeName = change.nodeName;
  const overrideKey = state === 'base' ? nodeName : `${nodeName}::${state}`;

  // Base state: Apply to JSX
  if (state === 'base') {
    return {
      target: 'jsx',
      reason: `Base state change - applying to JSX literal`,
    };
  }

  // Non-base state: Check if there's a state-specific marker
  if (hasStateMarker) {
    return {
      target: 'marker',
      reason: `State "${state}" has a marker - updating marker line`,
      overrideKey,
    };
  }

  // Non-base state: Check if there's a state-specific JSX branch
  if (hasStateJsxBranch) {
    return {
      target: 'jsx',
      reason: `State "${state}" has explicit JSX representation - updating state-specific code`,
    };
  }

  // Non-base state with no marker or JSX branch: Use override
  return {
    target: 'override',
    reason: `State "${state}" has no marker or JSX branch - saving to design-overrides.json`,
    overrideKey,
  };
}

// =============================================================================
// MARKER HELPERS
// =============================================================================

/**
 * Check if a state-specific marker exists in the content.
 *
 * @param content - File content
 * @param nodeName - Node name (e.g., "LoginButton")
 * @param state - Target state
 * @returns true if a marker like @figma node=LoginButton::hover exists
 */
export function hasStateMarker(
  content: string,
  nodeName: string,
  state: ComponentState
): boolean {
  if (state === 'base') return false;
  
  // Look for @figma node=NodeName::state pattern
  const pattern = new RegExp(
    `@figma\\s+[^\\n]*node\\s*=\\s*${escapeRegex(nodeName)}::${state}`,
    'i'
  );
  return pattern.test(content);
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update a state-specific marker in the content.
 *
 * @param content - File content
 * @param nodeName - Node name (e.g., "LoginButton")
 * @param state - Target state
 * @param change - The change to apply
 * @returns Updated content, or null if marker not found
 */
export function updateStateMarker(
  content: string,
  nodeName: string,
  state: ComponentState,
  change: PromptPatchChange
): string | null {
  if (state === 'base') return null;

  const markerKey = `${nodeName}::${state}`;
  
  // Pattern to match the marker line
  const linePattern = new RegExp(
    `^(\\s*\\/\\/\\s*@figma\\s+[^\\n]*node\\s*=\\s*${escapeRegex(markerKey)})([^\\n]*)$`,
    'gm'
  );

  let updated = false;
  const newContent = content.replace(linePattern, (_match, prefix, rest) => {
    updated = true;
    let newRest = rest;

    if (change.op === 'SET_TEXT') {
      // Replace text="..." or add it
      if (/text\s*=\s*"[^"]*"/.test(newRest)) {
        newRest = newRest.replace(/text\s*=\s*"[^"]*"/, `text="${change.after}"`);
      } else {
        newRest = newRest + ` text="${change.after}"`;
      }
    } else if (change.op === 'SET_FILL') {
      // Replace fill=... or add it
      if (/fill\s*=\s*[#\w]+/.test(newRest)) {
        newRest = newRest.replace(/fill\s*=\s*[#\w]+/, `fill=${change.after}`);
      } else {
        newRest = newRest + ` fill=${change.after}`;
      }
    }

    return prefix + newRest;
  });

  return updated ? newContent : null;
}

// =============================================================================
// OVERRIDE HELPERS
// =============================================================================

/**
 * Read design overrides from disk.
 */
export async function readDesignOverrides(repoRoot: string): Promise<DesignOverrides> {
  const path = getDesignOverridesPath(repoRoot);
  try {
    await access(path);
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as DesignOverrides;
  } catch {
    return {};
  }
}

/**
 * Write design overrides to disk.
 */
export async function writeDesignOverrides(
  repoRoot: string,
  overrides: DesignOverrides
): Promise<void> {
  const path = getDesignOverridesPath(repoRoot);
  const content = JSON.stringify(overrides, null, 2);
  await writeFile(path, content, 'utf-8');
}

/**
 * Apply a change to the design overrides.
 *
 * @param overrides - Current overrides
 * @param change - Change to apply
 * @param overrideKey - Key with state suffix (e.g., "LoginButton::hover")
 * @returns Updated overrides
 */
export function applyChangeToOverrides(
  overrides: DesignOverrides,
  change: PromptPatchChange,
  overrideKey: string
): DesignOverrides {
  const entry: DesignOverride = overrides[overrideKey] ?? {
    nodeId: `prompt-${Date.now()}`,
    lastUpdated: new Date().toISOString(),
  };

  switch (change.op) {
    case 'SET_TEXT':
      entry.text = String(change.after);
      break;
    case 'SET_FILL':
      entry.fill = String(change.after);
      break;
    case 'SET_LAYOUT':
      if (!entry.layout) {
        entry.layout = {};
      }
      if (change.layoutKey) {
        (entry.layout as LayoutOverride)[change.layoutKey] = change.after;
      }
      break;
  }

  entry.lastUpdated = new Date().toISOString();

  return {
    ...overrides,
    [overrideKey]: entry,
  };
}

// =============================================================================
// MAIN STATE-AWARE APPLY
// =============================================================================

/**
 * Apply changes in a state-aware manner.
 *
 * For non-base states, routes changes to markers or overrides instead of JSX.
 *
 * @param artifact - The patch artifact
 * @param content - File content
 * @param repoRoot - Repository root path
 * @param dryRun - Whether this is a dry run
 * @returns StateAwareApplyResult with counts and log
 */
export async function applyStateAware(
  artifact: PromptPatchArtifact,
  content: string,
  repoRoot: string,
  dryRun: boolean
): Promise<{ result: StateAwareApplyResult; updatedContent: string | null; updatedOverrides: DesignOverrides | null }> {
  const state = artifact.state || 'base';
  const log: string[] = [];
  
  let jsxApplied = 0;
  let markerApplied = 0;
  let overrideApplied = 0;
  let skipped = 0;
  
  let updatedContent: string | null = null;
  let updatedOverrides: DesignOverrides | null = null;
  let currentContent = content;

  // Load current overrides
  let overrides = await readDesignOverrides(repoRoot);

  for (const change of artifact.changes) {
    const hasMarker = hasStateMarker(currentContent, change.nodeName, state);
    // For now, assume no state-specific JSX branch (would need AST analysis)
    const hasJsxBranch = false;

    const decision = determineApplyTarget(change, state, hasMarker, hasJsxBranch);
    log.push(`[${change.op}] ${change.nodeName}: ${decision.reason}`);

    switch (decision.target) {
      case 'jsx':
        // JSX changes are handled by the caller via materializeAstWrite
        jsxApplied++;
        log.push(`  → Will update JSX literal`);
        break;

      case 'marker': {
        const result = updateStateMarker(currentContent, change.nodeName, state, change);
        if (result) {
          currentContent = result;
          updatedContent = result;
          markerApplied++;
          log.push(`  → Updated marker: @figma node=${change.nodeName}::${state}`);
        } else {
          skipped++;
          log.push(`  → SKIPPED: Could not find or update marker`);
        }
        break;
      }

      case 'override': {
        const key = decision.overrideKey || `${change.nodeName}::${state}`;
        overrides = applyChangeToOverrides(overrides, change, key);
        updatedOverrides = overrides;
        overrideApplied++;
        log.push(`  → Saved to design-overrides.json with key "${key}"`);
        break;
      }
    }
  }

  // Write overrides if any were changed (and not dry run)
  if (updatedOverrides && !dryRun) {
    await writeDesignOverrides(repoRoot, updatedOverrides);
  }

  return {
    result: {
      jsxApplied,
      markerApplied,
      overrideApplied,
      skipped,
      log,
    },
    updatedContent,
    updatedOverrides,
  };
}

/**
 * Filter changes that should be applied to JSX only.
 *
 * Used to get the subset of changes for materializeAstWrite.
 *
 * @param artifact - The patch artifact
 * @param content - File content
 * @returns Changes that should be applied to JSX
 */
export function filterJsxChanges(
  artifact: PromptPatchArtifact,
  content: string
): PromptPatchChange[] {
  const state = artifact.state || 'base';

  // For base state, all changes can go to JSX
  if (state === 'base') {
    return artifact.changes;
  }

  // For non-base states, only include changes with explicit JSX representation
  // (for now, this means we exclude all non-base changes from direct JSX writes)
  return artifact.changes.filter((change) => {
    const hasMarker = hasStateMarker(content, change.nodeName, state);
    // If there's a state marker, that's where the change goes (not JSX)
    if (hasMarker) {
      return false;
    }
    // For now, assume no state-specific JSX branches
    // This would need AST analysis to detect hover/pressed code paths
    return false;
  });
}
