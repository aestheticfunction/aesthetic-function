/**
 * @aesthetic-function/watcher - figmaApply/generateApplyOps.ts
 *
 * Phase 11C: Generate Apply Operations from Canonical Resolution.
 *
 * WHY: Converts resolved canonical semantics (Phase 10F/10G) into
 * apply operations targeting specific Figma nodes.
 *
 * CONSTRAINTS:
 * - Only targets nodes with stable IDs in component-map.json
 * - Does NOT create new nodes
 * - Does NOT infer variants or states
 * - All operations are deterministic and idempotent
 */

import type {
  FigmaApplyOp,
  ApplyInput,
  ApplyOutput,
  ApplyPropertyType,
  ApplyPolicyViolation,
} from './types.js';
import {
  hasStableNodeId,
  getPrimaryNodeId,
  filterOperationsByPolicy,
} from './applyPolicy.js';
import type { CanonicalResolution, TypographyValue } from '../canonicalResolver/types.js';
import type { CanonicalSemantics } from '../tokens/canonical/types.js';
import type { ConfidenceLevel } from '../ast/types.js';

// =============================================================================
// HASH UTILITY
// =============================================================================

/**
 * Simple hash function for generating deterministic operation IDs.
 * Uses djb2 algorithm for platform-agnostic hashing.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Generate a deterministic operation ID.
 */
function generateApplyOpId(
  nodeId: string,
  property: ApplyPropertyType,
  to: string | number
): string {
  const content = JSON.stringify({ nodeId, property, to });
  return `apply-${simpleHash(content)}`;
}

// =============================================================================
// APPLY OPERATION CREATION
// =============================================================================

/**
 * Create a FigmaApplyOp with deterministic opId.
 */
export function createApplyOp(
  nodeId: string,
  componentKey: string,
  property: ApplyPropertyType,
  to: string | number,
  canonicalSource: string,
  confidence: ConfidenceLevel,
  source: string,
  reason: string,
  from?: string | number,
  policyNote?: string
): FigmaApplyOp {
  return {
    opId: generateApplyOpId(nodeId, property, to),
    nodeId,
    componentKey,
    property,
    to,
    from,
    canonicalSource,
    confidence,
    source,
    reason,
    policyNote,
  };
}

// =============================================================================
// OPERATIONS FROM CANONICAL RESOLUTION
// =============================================================================

/**
 * Generate apply operations from canonical resolution for a single component.
 */
export function generateOpsForComponent(
  componentKey: string,
  nodeId: string,
  resolution: CanonicalResolution,
  _semantics: CanonicalSemantics | undefined,
  source: string
): FigmaApplyOp[] {
  const ops: FigmaApplyOp[] = [];

  // Generate color operations
  for (const [canonical, resolved] of Object.entries(resolution.colors)) {
    if (resolved.resolved) {
      ops.push(
        createApplyOp(
          nodeId,
          componentKey,
          'fill',
          resolved.resolved,
          canonical,
          resolved.confidence,
          source,
          `Apply resolved color ${canonical}`,
          undefined,
          resolved.note
        )
      );
    }
  }

  // Generate spacing operations
  for (const [canonical, resolved] of Object.entries(resolution.spacing)) {
    if (resolved.resolved !== undefined) {
      // Determine the specific property based on canonical token
      const property = getSpacingProperty(canonical);
      if (property) {
        ops.push(
          createApplyOp(
            nodeId,
            componentKey,
            property,
            resolved.resolved,
            canonical,
            resolved.confidence,
            source,
            `Apply resolved spacing ${canonical}`,
            undefined,
            resolved.note
          )
        );
      }
    }
  }

  // Generate typography operations
  for (const [canonical, resolved] of Object.entries(resolution.typography)) {
    if (resolved.resolved) {
      const typoOps = getTypographyOps(
        nodeId,
        componentKey,
        canonical,
        resolved.resolved,
        resolved.confidence,
        source,
        resolved.note
      );
      ops.push(...typoOps);
    }
  }

  return ops;
}

/**
 * Map canonical spacing token to specific property.
 */
function getSpacingProperty(canonical: string): ApplyPropertyType | null {
  // Map canonical spacing tokens to Figma properties
  if (canonical.includes('padding') || canonical.includes('space.')) {
    return 'padding';
  }
  if (canonical.includes('gap')) {
    return 'gap';
  }
  return null;
}

/**
 * Generate typography operations from resolved typography value.
 */
function getTypographyOps(
  nodeId: string,
  componentKey: string,
  canonical: string,
  value: TypographyValue,
  confidence: ConfidenceLevel,
  source: string,
  note?: string
): FigmaApplyOp[] {
  const ops: FigmaApplyOp[] = [];

  if (value.fontSize !== undefined) {
    ops.push(
      createApplyOp(
        nodeId,
        componentKey,
        'fontSize',
        value.fontSize,
        canonical,
        confidence,
        source,
        `Apply font size from ${canonical}`,
        undefined,
        note
      )
    );
  }

  if (value.fontWeight !== undefined) {
    ops.push(
      createApplyOp(
        nodeId,
        componentKey,
        'fontWeight',
        value.fontWeight,
        canonical,
        confidence,
        source,
        `Apply font weight from ${canonical}`,
        undefined,
        note
      )
    );
  }

  return ops;
}

// =============================================================================
// MAIN GENERATION FUNCTION
// =============================================================================

/**
 * Generate apply operations from canonical resolution.
 *
 * This is the main entry point for Phase 11C operation generation.
 *
 * @param input - Apply input with resolution, component map, and config
 * @returns ApplyOutput with operations and violations
 */
export function generateApplyOps(input: ApplyInput): ApplyOutput {
  const { resolution, componentMap, config, componentSemantics } = input;

  // Early return if apply is disabled
  if (!config.enabled && config.mode !== 'artifact') {
    return createEmptyOutput();
  }

  const allOps: FigmaApplyOp[] = [];
  const preViolations: ApplyPolicyViolation[] = [];

  // Generate operations for each component in the map
  for (const componentKey of Object.keys(componentMap.components)) {
    // Check if component has stable node ID
    if (!hasStableNodeId(componentMap, componentKey)) {
      preViolations.push({
        type: 'missing-node-id',
        componentKey,
        message: `Component "${componentKey}" has no stable node ID in component-map.json`,
      });
      continue;
    }

    const nodeId = getPrimaryNodeId(componentMap, componentKey);
    if (!nodeId) {
      preViolations.push({
        type: 'missing-node-id',
        componentKey,
        message: `Could not determine primary node ID for "${componentKey}"`,
      });
      continue;
    }

    // Get component-specific semantics if available
    const semantics = componentSemantics?.[componentKey];

    // Generate operations for this component
    const componentOps = generateOpsForComponent(
      componentKey,
      nodeId,
      resolution,
      semantics,
      'canonical-resolution'
    );

    allOps.push(...componentOps);
  }

  // Filter operations by policy
  const { valid, violations: policyViolations } = filterOperationsByPolicy(
    allOps,
    config,
    componentMap
  );

  const allViolations = [...preViolations, ...policyViolations];

  // Build summary
  const summary = buildSummary(valid, allViolations);

  return {
    operations: valid,
    violations: allViolations,
    summary,
  };
}

/**
 * Create empty output when apply is disabled.
 */
function createEmptyOutput(): ApplyOutput {
  return {
    operations: [],
    violations: [],
    summary: {
      totalOperations: 0,
      byProperty: {},
      totalViolations: 0,
      byViolationType: {},
    },
  };
}

/**
 * Build summary statistics.
 */
function buildSummary(
  operations: FigmaApplyOp[],
  violations: ApplyPolicyViolation[]
): ApplyOutput['summary'] {
  const byProperty: Record<string, number> = {};
  for (const op of operations) {
    byProperty[op.property] = (byProperty[op.property] || 0) + 1;
  }

  const byViolationType: Record<string, number> = {};
  for (const v of violations) {
    byViolationType[v.type] = (byViolationType[v.type] || 0) + 1;
  }

  return {
    totalOperations: operations.length,
    byProperty,
    totalViolations: violations.length,
    byViolationType,
  };
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Deduplicate operations by opId.
 * Later operations with the same opId replace earlier ones.
 */
export function deduplicateOps(operations: FigmaApplyOp[]): FigmaApplyOp[] {
  const seen = new Map<string, FigmaApplyOp>();
  for (const op of operations) {
    seen.set(op.opId, op);
  }
  return Array.from(seen.values());
}

/**
 * Sort operations deterministically for consistent output.
 */
export function sortOps(operations: FigmaApplyOp[]): FigmaApplyOp[] {
  return [...operations].sort((a, b) => {
    // Sort by componentKey first
    const keyCompare = a.componentKey.localeCompare(b.componentKey);
    if (keyCompare !== 0) return keyCompare;

    // Then by property
    const propCompare = a.property.localeCompare(b.property);
    if (propCompare !== 0) return propCompare;

    // Finally by opId for stability
    return a.opId.localeCompare(b.opId);
  });
}
