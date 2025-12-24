/**
 * @aesthetic-function/watcher - figmaApply/applyPolicy.ts
 *
 * Phase 11C: Apply Policy Enforcement.
 *
 * WHY: Enforces explicit targeting and allow-list rules for property
 * application. Only nodes with stable IDs from component-map.json
 * (or Phase 11B compose operations) are eligible targets.
 *
 * CONSTRAINTS:
 * - Does NOT create new nodes
 * - Does NOT infer variants or states
 * - Does NOT modify arbitrary nodes
 * - Only applies to explicitly mapped nodeIds
 */

import type {
  FigmaApplyOp,
  ApplyPolicyViolation,
  ApplyConfig,
  ApplyPropertyType,
  ApplyAllowCategory,
} from './types.js';
import { isCategoryAllowed } from './config.js';
import type { ComponentMap } from '../reconcile/componentMap.js';
import type { ConfidenceLevel } from '../ast/types.js';

// =============================================================================
// ELIGIBILITY CHECKING
// =============================================================================

/**
 * Check if a component has a stable nodeId for targeting.
 *
 * A component is eligible if:
 * - It exists in the component map
 * - It has at least one variant with a nodeId
 */
export function hasStableNodeId(
  componentMap: ComponentMap,
  componentKey: string
): boolean {
  const entry = componentMap.components[componentKey];
  if (!entry) return false;

  // Check for Component Set node ID
  if (entry.figma.componentSetNodeId) return true;

  // Check for any variant node ID
  const variants = entry.figma.variants;
  if (!variants) return false;

  return Object.values(variants).some((v) => v.nodeId);
}

/**
 * Get the primary nodeId for a component.
 *
 * IMPORTANT: For apply operations, we should target VARIANT nodeIds,
 * not the Component Set nodeId. Component Sets are containers for
 * variants and should not receive visual/layout/text properties.
 *
 * Preference order (for apply):
 * 1. 'base' or 'default' variant node ID
 * 2. First available variant node ID
 * 3. Returns undefined if only Component Set ID exists (to prevent
 *    accidental application to the set)
 *
 * @deprecated Use getVariantNodeId for explicit variant targeting
 */
export function getPrimaryNodeId(
  componentMap: ComponentMap,
  componentKey: string
): string | undefined {
  const entry = componentMap.components[componentKey];
  if (!entry) return undefined;

  // Check for 'base' or 'default' variant first
  if (entry.figma.variants?.base?.nodeId) {
    return entry.figma.variants.base.nodeId;
  }
  if (entry.figma.variants?.default?.nodeId) {
    return entry.figma.variants.default.nodeId;
  }

  // Fall back to first available variant
  const variants = entry.figma.variants;
  if (variants) {
    for (const variant of Object.values(variants)) {
      if (variant.nodeId) return variant.nodeId;
    }
  }

  // DO NOT fall back to Component Set nodeId for apply operations
  // This would cause properties to be applied to the wrong node
  return undefined;
}

/**
 * Get the nodeId for a specific variant state.
 *
 * @param componentMap - The component map
 * @param componentKey - The component key (may include ::state suffix)
 * @param state - Optional explicit state override
 * @returns Object with nodeId, state, and whether it came from a variant
 */
export function getVariantNodeId(
  componentMap: ComponentMap,
  componentKey: string,
  state?: string
): { nodeId: string | undefined; state: string; fromVariant: boolean } {
  // Parse componentKey for embedded state (e.g., "LoginButton::hover")
  const [baseKey, embeddedState] = componentKey.includes('::')
    ? componentKey.split('::')
    : [componentKey, undefined];

  const targetState = state ?? embeddedState ?? 'base';
  const entry = componentMap.components[baseKey] ?? componentMap.components[componentKey];

  if (!entry) {
    return { nodeId: undefined, state: targetState, fromVariant: false };
  }

  // Try to get the specific variant nodeId
  const variants = entry.figma.variants;
  if (variants) {
    // Try exact state match
    if (variants[targetState]?.nodeId) {
      return { nodeId: variants[targetState].nodeId, state: targetState, fromVariant: true };
    }

    // Try 'default' as fallback for 'base'
    if (targetState === 'base' && variants['default']?.nodeId) {
      return { nodeId: variants['default'].nodeId, state: 'default', fromVariant: true };
    }

    // Try 'base' as fallback for 'default'
    if (targetState === 'default' && variants['base']?.nodeId) {
      return { nodeId: variants['base'].nodeId, state: 'base', fromVariant: true };
    }
  }

  // If no variant found, DO NOT fall back to Component Set
  // Return undefined to trigger a violation
  return { nodeId: undefined, state: targetState, fromVariant: false };
}

/**
 * Check if a component has a variant nodeId for a given state.
 */
export function hasVariantNodeId(
  componentMap: ComponentMap,
  componentKey: string,
  state?: string
): boolean {
  const result = getVariantNodeId(componentMap, componentKey, state);
  return result.nodeId !== undefined && result.fromVariant;
}

/**
 * Get all nodeIds for a component (including variants).
 */
export function getAllNodeIds(
  componentMap: ComponentMap,
  componentKey: string
): string[] {
  const entry = componentMap.components[componentKey];
  if (!entry) return [];

  const nodeIds: string[] = [];

  if (entry.figma.componentSetNodeId) {
    nodeIds.push(entry.figma.componentSetNodeId);
  }

  const variants = entry.figma.variants;
  if (variants) {
    for (const variant of Object.values(variants)) {
      if (variant.nodeId && !nodeIds.includes(variant.nodeId)) {
        nodeIds.push(variant.nodeId);
      }
    }
  }

  return nodeIds;
}

// =============================================================================
// POLICY VALIDATION
// =============================================================================

/**
 * Validate a single apply operation against policy.
 *
 * Returns violations if the operation should not proceed.
 */
export function validateApplyOp(
  op: FigmaApplyOp,
  config: ApplyConfig,
  componentMap: ComponentMap
): ApplyPolicyViolation[] {
  const violations: ApplyPolicyViolation[] = [];

  // Check 1: Node ID must be in component map
  if (!isNodeIdInMap(componentMap, op.nodeId)) {
    violations.push({
      type: 'missing-node-id',
      componentKey: op.componentKey,
      property: op.property,
      message: `Node ID "${op.nodeId}" not found in component-map.json`,
    });
  }

  // Check 2: Property category must be allowed
  const category = getPropertyCategory(op.property);
  if (!isCategoryAllowed(config, category)) {
    violations.push({
      type: 'property-not-allowed',
      componentKey: op.componentKey,
      property: op.property,
      message: `Property category "${category}" not in FIGMA_APPLY_ALLOW`,
    });
  }

  // Check 3: Must have canonical source
  if (!op.canonicalSource) {
    violations.push({
      type: 'no-canonical-source',
      componentKey: op.componentKey,
      property: op.property,
      message: 'No canonical token source for this operation',
    });
  }

  // Check 4: Confidence must meet minimum
  if (!meetsConfidenceThreshold(op.confidence, config.minConfidence)) {
    violations.push({
      type: 'low-confidence',
      componentKey: op.componentKey,
      property: op.property,
      canonicalSource: op.canonicalSource,
      message: `Confidence "${op.confidence}" below minimum "${config.minConfidence}"`,
    });
  }

  return violations;
}

/**
 * Check if a nodeId exists in the component map.
 */
export function isNodeIdInMap(componentMap: ComponentMap, nodeId: string): boolean {
  for (const entry of Object.values(componentMap.components)) {
    // Check Component Set node ID
    if (entry.figma.componentSetNodeId === nodeId) {
      return true;
    }

    // Check variant node IDs
    const variants = entry.figma.variants;
    if (variants) {
      for (const variant of Object.values(variants)) {
        if (variant.nodeId === nodeId) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Get the allow category for a property type.
 */
export function getPropertyCategory(property: ApplyPropertyType): ApplyAllowCategory {
  const categoryMap: Record<ApplyPropertyType, ApplyAllowCategory> = {
    fill: 'fill',
    textColor: 'fill',
    padding: 'spacing',
    gap: 'spacing',
    width: 'spacing',
    height: 'spacing',
    fontSize: 'typography',
    fontWeight: 'typography',
  };
  return categoryMap[property];
}

/**
 * Check if confidence meets the minimum threshold.
 */
export function meetsConfidenceThreshold(
  confidence: ConfidenceLevel,
  minimum: ConfidenceLevel
): boolean {
  const levels: Record<ConfidenceLevel, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  return levels[confidence] >= levels[minimum];
}

// =============================================================================
// OPERATION FILTERING
// =============================================================================

/**
 * Filter operations by policy, returning valid ops and violations.
 */
export function filterOperationsByPolicy(
  operations: FigmaApplyOp[],
  config: ApplyConfig,
  componentMap: ComponentMap
): {
  valid: FigmaApplyOp[];
  violations: ApplyPolicyViolation[];
} {
  const valid: FigmaApplyOp[] = [];
  const violations: ApplyPolicyViolation[] = [];

  for (const op of operations) {
    const opViolations = validateApplyOp(op, config, componentMap);
    if (opViolations.length === 0) {
      valid.push(op);
    } else {
      violations.push(...opViolations);
    }
  }

  return { valid, violations };
}

// =============================================================================
// IDEMPOTENCY CHECK
// =============================================================================

/**
 * Check if an operation would result in no change (value already matches).
 *
 * This is used for idempotency - repeated runs should produce zero net changes.
 */
export function isValueUnchanged(
  op: FigmaApplyOp,
  currentValue: string | number | undefined
): boolean {
  if (currentValue === undefined) return false;
  return op.to === currentValue;
}

/**
 * Create an unchanged violation for idempotency.
 */
export function createUnchangedViolation(op: FigmaApplyOp): ApplyPolicyViolation {
  return {
    type: 'value-unchanged',
    componentKey: op.componentKey,
    property: op.property,
    canonicalSource: op.canonicalSource,
    message: `Value already matches: ${op.to}`,
  };
}
