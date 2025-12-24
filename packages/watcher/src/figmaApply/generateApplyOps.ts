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
 *
 * PHASE 11C.3: Also supports explicit state data from markers/overrides.
 * When --state hover is specified, explicit marker/override data for
 * that state is used to generate ops (no inference from base state).
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
  getVariantNodeId,
  filterOperationsByPolicy,
} from './applyPolicy.js';
import type { CanonicalResolution, TypographyValue } from '../canonicalResolver/types.js';
import type { CanonicalSemantics } from '../tokens/canonical/types.js';
import type { ConfidenceLevel } from '../ast/types.js';
import type { MarkerData } from '../parse/parseIntentFromReact.js';
import type { DesignOverrides } from '../reconcile/types.js';

// =============================================================================
// EXPLICIT STATE DATA
// =============================================================================

/**
 * Explicit state data extracted from markers or design-overrides.
 * Only populated when there's explicit data for a specific state.
 */
export interface ExplicitStateData {
  /** Fill color from marker/override */
  fill?: string;
  /** Text color from marker/override */
  textColor?: string;
  /** Text content from marker/override */
  text?: string;
  /** Padding from override layout */
  padding?: number | string;
  /** Gap from override layout */
  gap?: number | string;
  /** Width from override layout */
  width?: number | string;
  /** Height from override layout */
  height?: number | string;
  /** Data source */
  source: 'overrides' | 'markers';
}

/**
 * Get explicit state data from markers or design-overrides.
 *
 * Checks (in priority order):
 * 1. design-overrides.json key "${componentKey}::${state}"
 * 2. Marker with node="${componentKey}::${state}"
 *
 * @param componentKey - Component key (e.g., "LoginButton")
 * @param state - Target state (e.g., "hover")
 * @param markers - Parsed markers from source file
 * @param overrides - Design overrides from design-overrides.json
 * @returns ExplicitStateData if found, undefined otherwise
 */
export function getExplicitStateData(
  componentKey: string,
  state: string,
  markers?: MarkerData[],
  overrides?: DesignOverrides
): ExplicitStateData | undefined {
  const stateKey = `${componentKey}::${state}`;

  // Priority 1: Check design-overrides.json
  if (overrides?.[stateKey]) {
    const override = overrides[stateKey];
    const data: ExplicitStateData = { source: 'overrides' };
    let hasData = false;

    if (override.fill) {
      data.fill = override.fill;
      hasData = true;
    }
    if (override.text) {
      data.text = override.text;
      hasData = true;
    }
    if (override.layout) {
      if (override.layout.padding !== undefined) {
        data.padding = override.layout.padding;
        hasData = true;
      }
      if (override.layout.gap !== undefined) {
        data.gap = override.layout.gap;
        hasData = true;
      }
      if (override.layout.width !== undefined) {
        data.width = override.layout.width;
        hasData = true;
      }
      if (override.layout.height !== undefined) {
        data.height = override.layout.height;
        hasData = true;
      }
    }

    if (hasData) {
      return data;
    }
  }

  // Priority 2: Check markers (node=ComponentKey::state format)
  if (markers) {
    // Find marker with node=ComponentKey::state
    const stateMarker = markers.find((m) => m.node === stateKey);
    if (stateMarker) {
      const data: ExplicitStateData = { source: 'markers' };
      let hasData = false;

      if (stateMarker.fill) {
        data.fill = stateMarker.fill;
        hasData = true;
      }
      if (stateMarker.text) {
        data.text = stateMarker.text;
        hasData = true;
      }

      if (hasData) {
        return data;
      }
    }
  }

  return undefined;
}

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

/**
 * Generate apply operations from explicit state data (markers/overrides).
 *
 * These ops use literal values directly (not canonical resolution),
 * and are treated as high confidence since they're explicitly defined.
 *
 * @param nodeId - Target node ID
 * @param componentKey - Component key
 * @param data - Explicit state data from markers/overrides
 * @param targetState - Target state for annotation
 */
function generateOpsFromExplicitData(
  nodeId: string,
  componentKey: string,
  data: ExplicitStateData,
  targetState: string
): FigmaApplyOp[] {
  const ops: FigmaApplyOp[] = [];
  const source = `explicit-${data.source}`;

  if (data.fill) {
    const op = createApplyOp(
      nodeId,
      componentKey,
      'fill',
      data.fill,
      `explicit.${componentKey}::${targetState}.fill`,
      'high',
      source,
      `Apply explicit fill from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
  }

  if (data.textColor) {
    const op = createApplyOp(
      nodeId,
      componentKey,
      'textColor',
      data.textColor,
      `explicit.${componentKey}::${targetState}.textColor`,
      'high',
      source,
      `Apply explicit text color from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
  }

  if (data.padding !== undefined) {
    const paddingValue = typeof data.padding === 'string'
      ? parseInt(data.padding, 10)
      : data.padding;
    const op = createApplyOp(
      nodeId,
      componentKey,
      'padding',
      paddingValue,
      `explicit.${componentKey}::${targetState}.padding`,
      'high',
      source,
      `Apply explicit padding from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
  }

  if (data.gap !== undefined) {
    const gapValue = typeof data.gap === 'string'
      ? parseInt(data.gap, 10)
      : data.gap;
    const op = createApplyOp(
      nodeId,
      componentKey,
      'gap',
      gapValue,
      `explicit.${componentKey}::${targetState}.gap`,
      'high',
      source,
      `Apply explicit gap from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
  }

  if (data.width !== undefined) {
    const widthValue = typeof data.width === 'string'
      ? parseInt(data.width, 10)
      : data.width;
    const op = createApplyOp(
      nodeId,
      componentKey,
      'width',
      widthValue,
      `explicit.${componentKey}::${targetState}.width`,
      'high',
      source,
      `Apply explicit width from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
  }

  if (data.height !== undefined) {
    const heightValue = typeof data.height === 'string'
      ? parseInt(data.height, 10)
      : data.height;
    const op = createApplyOp(
      nodeId,
      componentKey,
      'height',
      heightValue,
      `explicit.${componentKey}::${targetState}.height`,
      'high',
      source,
      `Apply explicit height from ${data.source} for ${targetState}`
    );
    op.targetState = targetState;
    op.fromVariant = true;
    ops.push(op);
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
  const { resolution, componentMap, config, componentSemantics, targetComponent, targetState, markers, overrides } = input;

  // Early return if apply is disabled
  if (!config.enabled && config.mode !== 'artifact') {
    return createEmptyOutput();
  }

  const allOps: FigmaApplyOp[] = [];
  const preViolations: ApplyPolicyViolation[] = [];

  // Determine which components to process
  const componentKeys = targetComponent
    ? [targetComponent]
    : Object.keys(componentMap.components);

  // Log targeting info when specific component/state requested
  if (targetComponent || targetState) {
    console.log('');
    console.log('=== APPLY TARGETING ===');
    if (targetComponent) console.log(`  component: ${targetComponent}`);
    if (targetState) console.log(`  requestedState: ${targetState}`);
  }

  // State-scoped data check: when targeting a non-base state, check for explicit state data
  // This prevents applying base semantics to a hover/disabled/etc. variant incorrectly
  // BUT allows explicit state data from markers/overrides
  if (targetState && targetState !== 'base' && targetState !== 'default') {
    // Check if there's state-specific semantic data from componentSemantics
    const hasSemanticData = targetComponent
      ? componentSemantics?.[`${targetComponent}::${targetState}`] !== undefined
      : Object.keys(componentSemantics ?? {}).some((key) => key.endsWith(`::${targetState}`));

    // Phase 11C.3: Also check for explicit state data from markers/overrides
    const explicitData = targetComponent
      ? getExplicitStateData(targetComponent, targetState, markers, overrides)
      : undefined;

    if (explicitData) {
      console.log(`  State data source: ${explicitData.source}`);
      console.log(`  Fields found: ${Object.keys(explicitData).filter((k) => k !== 'source').join(', ')}`);
    }

    if (!hasSemanticData && !explicitData) {
      const message = `No state-specific semantics found for "${targetState}"; refusing to apply base semantics to ${targetState}.`;
      console.log('');
      console.log(`⚠️  ${message}`);
      console.log('');

      // Return early with a violation
      preViolations.push({
        type: 'no-state-specific-data',
        componentKey: targetComponent ?? '*',
        targetState,
        message,
      });

      // Build summary with violations only
      const summary = buildSummary([], preViolations);
      return {
        operations: [],
        violations: preViolations,
        summary,
      };
    }

    // If we have explicit state data, generate ops from it
    if (explicitData && targetComponent) {
      // Get variant nodeId for the target state
      const { nodeId, state: resolvedState, fromVariant } = getVariantNodeId(
        componentMap,
        targetComponent,
        targetState
      );

      console.log(`  resolvedVariantNodeId: ${nodeId ?? 'NONE'}`);
      console.log(`  resolvedState: ${resolvedState}`);
      console.log(`  fromVariant: ${fromVariant}`);

      if (!nodeId) {
        preViolations.push({
          type: 'missing-variant-id',
          componentKey: targetComponent,
          targetState: resolvedState,
          message: `Component "${targetComponent}" has no variant nodeId for state "${resolvedState}". ` +
            `Only the Component Set nodeId exists - refusing to target it directly.`,
        });
      } else {
        // Generate ops from explicit state data
        const stateOps = generateOpsFromExplicitData(
          nodeId,
          targetComponent,
          explicitData,
          resolvedState
        );

        // Log each op
        for (const op of stateOps) {
          console.log(`  op: ${op.property} → nodeId=${op.nodeId}, value=${op.to}, targetState=${op.targetState}`);
        }

        allOps.push(...stateOps);
      }

      // Filter operations by policy
      const { valid, violations: policyViolations } = filterOperationsByPolicy(
        allOps,
        config,
        componentMap
      );

      const allViolations = [...preViolations, ...policyViolations];
      const summary = buildSummary(valid, allViolations);

      return {
        operations: valid,
        violations: allViolations,
        summary,
      };
    }
  }

  // Generate operations for each component
  for (const componentKey of componentKeys) {
    // Check if component exists in component map
    if (!componentMap.components[componentKey]) {
      preViolations.push({
        type: 'missing-node-id',
        componentKey,
        targetState,
        message: `Component "${componentKey}" not found in component-map.json`,
      });
      continue;
    }

    // Check if component has stable node ID
    if (!hasStableNodeId(componentMap, componentKey)) {
      preViolations.push({
        type: 'missing-node-id',
        componentKey,
        targetState,
        message: `Component "${componentKey}" has no stable node ID in component-map.json`,
      });
      continue;
    }

    // Get variant-aware nodeId - pass explicit targetState if provided
    const { nodeId, state: resolvedState, fromVariant } = getVariantNodeId(
      componentMap,
      componentKey,
      targetState
    );

    // Log resolved variant info
    if (targetComponent || targetState) {
      console.log(`  resolvedVariantNodeId: ${nodeId ?? 'NONE'}`);
      console.log(`  resolvedState: ${resolvedState}`);
      console.log(`  fromVariant: ${fromVariant}`);
    }

    if (!nodeId) {
      // No variant nodeId found - would have targeted Component Set
      preViolations.push({
        type: 'missing-variant-id',
        componentKey,
        targetState: resolvedState,
        message: `Component "${componentKey}" has no variant nodeId for state "${resolvedState}". ` +
          `Only the Component Set nodeId exists - refusing to target it directly.`,
      });
      continue;
    }

    // Get component-specific semantics if available
    const semantics = componentSemantics?.[componentKey];

    // Generate operations for this component with variant info
    const componentOps = generateOpsForComponent(
      componentKey,
      nodeId,
      resolution,
      semantics,
      'canonical-resolution'
    );

    // Annotate ops with variant targeting info
    for (const op of componentOps) {
      op.targetState = resolvedState;
      op.fromVariant = fromVariant;
    }

    // Log per-op targeting info
    if (targetComponent || targetState) {
      for (const op of componentOps) {
        console.log(`  op: ${op.property} → nodeId=${op.nodeId}, targetState=${op.targetState}`);
      }
    }

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
