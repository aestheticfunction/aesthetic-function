/**
 * @aesthetic-function/watcher - figmaApply/__tests__/applyPolicy.test.ts
 *
 * Unit tests for Phase 11C apply policy enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  hasStableNodeId,
  getPrimaryNodeId,
  getVariantNodeId,
  hasVariantNodeId,
  getAllNodeIds,
  validateApplyOp,
  isNodeIdInMap,
  getPropertyCategory,
  meetsConfidenceThreshold,
  filterOperationsByPolicy,
  isValueUnchanged,
} from '../applyPolicy.js';
import type { ComponentMap } from '../../reconcile/componentMap.js';
import type { FigmaApplyOp, ApplyConfig } from '../types.js';
import { DEFAULT_APPLY_CONFIG } from '../config.js';

// =============================================================================
// FIXTURES
// =============================================================================

function createMockComponentMap(): ComponentMap {
  return {
    version: 1,
    components: {
      Button: {
        componentKey: 'Button',
        figma: {
          name: 'Button',
          componentSetNodeId: 'CS:123',
          variants: {
            base: { nodeId: 'NODE:base-123' },
            primary: { nodeId: 'NODE:primary-456' },
          },
        },
      },
      Card: {
        componentKey: 'Card',
        figma: {
          name: 'Card',
          variants: {
            default: { nodeId: 'NODE:card-789' },
          },
        },
      },
      NoFigma: {
        componentKey: 'NoFigma',
        figma: {
          name: 'NoFigma',
          variants: {},
        },
      },
    },
  };
}

function createMockApplyOp(overrides: Partial<FigmaApplyOp> = {}): FigmaApplyOp {
  return {
    opId: 'apply-test123',
    nodeId: 'CS:123',
    componentKey: 'Button',
    property: 'fill',
    to: '#3498db',
    canonicalSource: 'color.primary.500',
    confidence: 'high',
    source: 'test-source.tsx',
    reason: 'Test reason',
    ...overrides,
  };
}

// =============================================================================
// ELIGIBILITY CHECKING
// =============================================================================

describe('hasStableNodeId', () => {
  const componentMap = createMockComponentMap();

  it('returns true for component with componentSetNodeId', () => {
    expect(hasStableNodeId(componentMap, 'Button')).toBe(true);
  });

  it('returns true for component with only variant nodeId', () => {
    expect(hasStableNodeId(componentMap, 'Card')).toBe(true);
  });

  it('returns false for component with no nodeIds', () => {
    expect(hasStableNodeId(componentMap, 'NoFigma')).toBe(false);
  });

  it('returns false for non-existent component', () => {
    expect(hasStableNodeId(componentMap, 'NonExistent')).toBe(false);
  });
});

describe('getPrimaryNodeId', () => {
  const componentMap = createMockComponentMap();

  it('returns base variant nodeId when available (prefers variant over Component Set)', () => {
    // Phase 11C.1: getPrimaryNodeId now prefers variant nodeIds over Component Set
    // This prevents accidentally applying properties to the Component Set container
    expect(getPrimaryNodeId(componentMap, 'Button')).toBe('NODE:base-123');
  });

  it('returns first variant nodeId when no componentSetNodeId', () => {
    expect(getPrimaryNodeId(componentMap, 'Card')).toBe('NODE:card-789');
  });

  it('returns undefined for component with no nodeIds', () => {
    expect(getPrimaryNodeId(componentMap, 'NoFigma')).toBeUndefined();
  });

  it('returns undefined for non-existent component', () => {
    expect(getPrimaryNodeId(componentMap, 'NonExistent')).toBeUndefined();
  });
});

describe('getVariantNodeId', () => {
  const componentMap = createMockComponentMap();

  it('returns base variant nodeId for base state', () => {
    const result = getVariantNodeId(componentMap, 'Button', 'base');
    expect(result.nodeId).toBe('NODE:base-123');
    expect(result.state).toBe('base');
    expect(result.fromVariant).toBe(true);
  });

  it('returns specific variant nodeId for named state', () => {
    const result = getVariantNodeId(componentMap, 'Button', 'primary');
    expect(result.nodeId).toBe('NODE:primary-456');
    expect(result.state).toBe('primary');
    expect(result.fromVariant).toBe(true);
  });

  it('parses state from componentKey with :: suffix', () => {
    const result = getVariantNodeId(componentMap, 'Button::primary');
    expect(result.nodeId).toBe('NODE:primary-456');
    expect(result.state).toBe('primary');
    expect(result.fromVariant).toBe(true);
  });

  it('returns undefined nodeId when variant state not found', () => {
    const result = getVariantNodeId(componentMap, 'Button', 'hover');
    expect(result.nodeId).toBeUndefined();
    expect(result.state).toBe('hover');
    expect(result.fromVariant).toBe(false);
  });

  it('returns default variant for components using "default" as base', () => {
    const result = getVariantNodeId(componentMap, 'Card', 'default');
    expect(result.nodeId).toBe('NODE:card-789');
    expect(result.fromVariant).toBe(true);
  });

  it('falls back from base to default', () => {
    // Card has 'default' but not 'base'
    const result = getVariantNodeId(componentMap, 'Card', 'base');
    expect(result.nodeId).toBe('NODE:card-789');
    expect(result.state).toBe('default');
    expect(result.fromVariant).toBe(true);
  });

  it('does NOT fall back to Component Set nodeId', () => {
    // Button has a Component Set but we should NOT return it
    const result = getVariantNodeId(componentMap, 'Button', 'nonexistent');
    expect(result.nodeId).toBeUndefined();
    expect(result.fromVariant).toBe(false);
  });
});

describe('hasVariantNodeId', () => {
  const componentMap = createMockComponentMap();

  it('returns true for existing variant state', () => {
    expect(hasVariantNodeId(componentMap, 'Button', 'base')).toBe(true);
    expect(hasVariantNodeId(componentMap, 'Button', 'primary')).toBe(true);
  });

  it('returns false for missing variant state', () => {
    expect(hasVariantNodeId(componentMap, 'Button', 'hover')).toBe(false);
  });

  it('returns false for component with no variants', () => {
    expect(hasVariantNodeId(componentMap, 'NoFigma', 'base')).toBe(false);
  });
});

describe('getAllNodeIds', () => {
  const componentMap = createMockComponentMap();

  it('returns all nodeIds for component with multiple variants', () => {
    const nodeIds = getAllNodeIds(componentMap, 'Button');
    expect(nodeIds).toContain('CS:123');
    expect(nodeIds).toContain('NODE:base-123');
    expect(nodeIds).toContain('NODE:primary-456');
    expect(nodeIds).toHaveLength(3);
  });

  it('returns single nodeId for component with one variant', () => {
    const nodeIds = getAllNodeIds(componentMap, 'Card');
    expect(nodeIds).toEqual(['NODE:card-789']);
  });

  it('returns empty array for component with no nodeIds', () => {
    expect(getAllNodeIds(componentMap, 'NoFigma')).toEqual([]);
  });

  it('returns empty array for non-existent component', () => {
    expect(getAllNodeIds(componentMap, 'NonExistent')).toEqual([]);
  });
});

// =============================================================================
// NODE ID LOOKUP
// =============================================================================

describe('isNodeIdInMap', () => {
  const componentMap = createMockComponentMap();

  it('returns true for componentSetNodeId', () => {
    expect(isNodeIdInMap(componentMap, 'CS:123')).toBe(true);
  });

  it('returns true for variant nodeId', () => {
    expect(isNodeIdInMap(componentMap, 'NODE:base-123')).toBe(true);
    expect(isNodeIdInMap(componentMap, 'NODE:primary-456')).toBe(true);
    expect(isNodeIdInMap(componentMap, 'NODE:card-789')).toBe(true);
  });

  it('returns false for unknown nodeId', () => {
    expect(isNodeIdInMap(componentMap, 'UNKNOWN:999')).toBe(false);
  });
});

// =============================================================================
// PROPERTY CATEGORY MAPPING
// =============================================================================

describe('getPropertyCategory', () => {
  it('maps fill to fill category', () => {
    expect(getPropertyCategory('fill')).toBe('fill');
  });

  it('maps textColor to fill category', () => {
    expect(getPropertyCategory('textColor')).toBe('fill');
  });

  it('maps padding to spacing category', () => {
    expect(getPropertyCategory('padding')).toBe('spacing');
  });

  it('maps gap to spacing category', () => {
    expect(getPropertyCategory('gap')).toBe('spacing');
  });

  it('maps width to spacing category', () => {
    expect(getPropertyCategory('width')).toBe('spacing');
  });

  it('maps height to spacing category', () => {
    expect(getPropertyCategory('height')).toBe('spacing');
  });

  it('maps fontSize to typography category', () => {
    expect(getPropertyCategory('fontSize')).toBe('typography');
  });

  it('maps fontWeight to typography category', () => {
    expect(getPropertyCategory('fontWeight')).toBe('typography');
  });
});

// =============================================================================
// CONFIDENCE THRESHOLD
// =============================================================================

describe('meetsConfidenceThreshold', () => {
  it('high meets high threshold', () => {
    expect(meetsConfidenceThreshold('high', 'high')).toBe(true);
  });

  it('high meets medium threshold', () => {
    expect(meetsConfidenceThreshold('high', 'medium')).toBe(true);
  });

  it('high meets low threshold', () => {
    expect(meetsConfidenceThreshold('high', 'low')).toBe(true);
  });

  it('medium meets medium threshold', () => {
    expect(meetsConfidenceThreshold('medium', 'medium')).toBe(true);
  });

  it('medium meets low threshold', () => {
    expect(meetsConfidenceThreshold('medium', 'low')).toBe(true);
  });

  it('medium does not meet high threshold', () => {
    expect(meetsConfidenceThreshold('medium', 'high')).toBe(false);
  });

  it('low meets low threshold', () => {
    expect(meetsConfidenceThreshold('low', 'low')).toBe(true);
  });

  it('low does not meet medium threshold', () => {
    expect(meetsConfidenceThreshold('low', 'medium')).toBe(false);
  });

  it('low does not meet high threshold', () => {
    expect(meetsConfidenceThreshold('low', 'high')).toBe(false);
  });
});

// =============================================================================
// VALIDATION
// =============================================================================

describe('validateApplyOp', () => {
  const componentMap = createMockComponentMap();

  it('returns no violations for valid operation', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
      minConfidence: 'high',
    };
    const op = createMockApplyOp();
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations).toHaveLength(0);
  });

  it('returns missing-node-id violation for unknown nodeId', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
    };
    const op = createMockApplyOp({ nodeId: 'UNKNOWN:999' });
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations).toContainEqual(
      expect.objectContaining({ type: 'missing-node-id' })
    );
  });

  it('returns property-not-allowed violation when category not allowed', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['spacing'], // fill not allowed
    };
    const op = createMockApplyOp({ property: 'fill' });
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations).toContainEqual(
      expect.objectContaining({ type: 'property-not-allowed' })
    );
  });

  it('returns no-canonical-source violation when canonicalSource missing', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
    };
    const op = createMockApplyOp({ canonicalSource: '' });
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations).toContainEqual(
      expect.objectContaining({ type: 'no-canonical-source' })
    );
  });

  it('returns low-confidence violation when below threshold', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
      minConfidence: 'high',
    };
    const op = createMockApplyOp({ confidence: 'medium' });
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations).toContainEqual(
      expect.objectContaining({ type: 'low-confidence' })
    );
  });

  it('accumulates multiple violations', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: [], // nothing allowed
      minConfidence: 'high',
    };
    const op = createMockApplyOp({
      nodeId: 'UNKNOWN:999',
      confidence: 'low',
    });
    const violations = validateApplyOp(op, config, componentMap);
    expect(violations.length).toBeGreaterThan(1);
  });
});

// =============================================================================
// FILTERING
// =============================================================================

describe('filterOperationsByPolicy', () => {
  const componentMap = createMockComponentMap();

  it('passes valid operations', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill', 'spacing'],
      minConfidence: 'low',
    };
    const ops = [
      createMockApplyOp({ opId: 'op1', property: 'fill' }),
      createMockApplyOp({ opId: 'op2', property: 'padding' }),
    ];
    const result = filterOperationsByPolicy(ops, config, componentMap);
    expect(result.valid).toHaveLength(2);
    expect(result.violations).toHaveLength(0);
  });

  it('filters out invalid operations', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: ['fill'],
      minConfidence: 'high',
    };
    const ops = [
      createMockApplyOp({ opId: 'op1', property: 'fill' }),
      createMockApplyOp({
        opId: 'op2',
        property: 'padding',
      }), // spacing not allowed
    ];
    const result = filterOperationsByPolicy(ops, config, componentMap);
    expect(result.valid).toHaveLength(1);
    expect(result.violations).toHaveLength(1);
  });

  it('returns all violations when all ops are invalid', () => {
    const config: ApplyConfig = {
      ...DEFAULT_APPLY_CONFIG,
      allow: [], // nothing allowed
    };
    const ops = [
      createMockApplyOp({ opId: 'op1' }),
      createMockApplyOp({ opId: 'op2' }),
    ];
    const result = filterOperationsByPolicy(ops, config, componentMap);
    expect(result.valid).toHaveLength(0);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// IDEMPOTENCY
// =============================================================================

describe('isValueUnchanged', () => {
  it('returns true when value matches', () => {
    const op = createMockApplyOp({ to: '#3498db' });
    expect(isValueUnchanged(op, '#3498db')).toBe(true);
  });

  it('returns false when value differs', () => {
    const op = createMockApplyOp({ to: '#3498db' });
    expect(isValueUnchanged(op, '#e74c3c')).toBe(false);
  });

  it('returns false when current value is undefined', () => {
    const op = createMockApplyOp({ to: '#3498db' });
    expect(isValueUnchanged(op, undefined)).toBe(false);
  });

  it('handles numeric values', () => {
    const op = createMockApplyOp({ property: 'padding', to: 16 });
    expect(isValueUnchanged(op, 16)).toBe(true);
    expect(isValueUnchanged(op, 24)).toBe(false);
  });
});
