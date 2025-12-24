/**
 * @aesthetic-function/watcher - figmaApply/__tests__/generateApplyOps.test.ts
 *
 * Unit tests for Phase 11C apply operation generation.
 */

import { describe, it, expect } from 'vitest';
import {
  createApplyOp,
  generateOpsForComponent,
  generateApplyOps,
  deduplicateOps,
  sortOps,
  getExplicitStateData,
} from '../generateApplyOps.js';
import type { ComponentMap } from '../../reconcile/componentMap.js';
import type { CanonicalResolution } from '../../canonicalResolver/types.js';
import type { ApplyInput, FigmaApplyOp } from '../types.js';
import type { MarkerData } from '../../parse/parseIntentFromReact.js';
import type { DesignOverrides } from '../../reconcile/types.js';
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
          componentSetNodeId: 'CS:btn-123',
          variants: {
            base: { nodeId: 'NODE:btn-base' },
            primary: { nodeId: 'NODE:btn-primary' },
          },
        },
      },
      Card: {
        componentKey: 'Card',
        figma: {
          name: 'Card',
          variants: {
            default: { nodeId: 'NODE:card-default' },
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

function createMockResolution(): CanonicalResolution {
  return {
    colors: {
      'color.primary.500': {
        canonical: 'color.primary.500',
        resolved: '#3498db',
        confidence: 'high',
        source: 'design-tokens',
        note: 'Matched from design tokens',
      },
      'color.background.default': {
        canonical: 'color.background.default',
        resolved: '#ffffff',
        confidence: 'medium',
        source: 'design-tokens',
      },
    },
    spacing: {
      'space.400': {
        canonical: 'space.400',
        resolved: 16,
        confidence: 'high',
        source: 'spacing-scale',
      },
      'space.200': {
        canonical: 'space.200',
        resolved: 8,
        confidence: 'low',
        source: 'spacing-scale',
      },
    },
    typography: {
      'typography.heading.lg': {
        canonical: 'typography.heading.lg',
        resolved: {
          fontSize: 24,
          fontWeight: 700,
        },
        confidence: 'high',
        source: 'typography-scale',
      },
    },
    radius: {},
    meta: {
      resolvedCount: 5,
      unresolvedCount: 0,
      notesCount: 1,
    },
  };
}

// =============================================================================
// OPERATION CREATION
// =============================================================================

describe('createApplyOp', () => {
  it('creates operation with deterministic opId', () => {
    const op = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Apply primary color'
    );

    expect(op.opId).toMatch(/^apply-[a-f0-9]{8}$/);
    expect(op.nodeId).toBe('NODE:123');
    expect(op.componentKey).toBe('Button');
    expect(op.property).toBe('fill');
    expect(op.to).toBe('#3498db');
    expect(op.canonicalSource).toBe('color.primary.500');
    expect(op.confidence).toBe('high');
    expect(op.source).toBe('Button.tsx');
    expect(op.reason).toBe('Apply primary color');
  });

  it('generates same opId for same inputs (deterministic)', () => {
    const op1 = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Reason 1'
    );
    const op2 = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Reason 2' // Different reason, same opId
    );

    // opId is based on nodeId, property, to - not reason
    expect(op1.opId).toBe(op2.opId);
  });

  it('generates different opIds for different inputs', () => {
    const op1 = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Reason'
    );
    const op2 = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#e74c3c', // Different color
      'color.primary.500',
      'high',
      'Button.tsx',
      'Reason'
    );

    expect(op1.opId).not.toBe(op2.opId);
  });

  it('includes optional from value', () => {
    const op = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Apply primary color',
      '#old-color'
    );

    expect(op.from).toBe('#old-color');
  });

  it('includes optional policyNote', () => {
    const op = createApplyOp(
      'NODE:123',
      'Button',
      'fill',
      '#3498db',
      'color.primary.500',
      'high',
      'Button.tsx',
      'Apply primary color',
      undefined,
      'Matched from design tokens'
    );

    expect(op.policyNote).toBe('Matched from design tokens');
  });
});

// =============================================================================
// OPERATIONS FROM COMPONENT
// =============================================================================

describe('generateOpsForComponent', () => {
  it('generates fill operations from colors', () => {
    const resolution = createMockResolution();
    const ops = generateOpsForComponent(
      'Button',
      'NODE:btn-123',
      resolution,
      undefined,
      'Button.tsx'
    );

    const fillOps = ops.filter((op) => op.property === 'fill');
    expect(fillOps.length).toBeGreaterThan(0);
    expect(fillOps[0].to).toBe('#3498db');
    expect(fillOps[0].canonicalSource).toBe('color.primary.500');
  });

  it('generates typography operations from typography resolution', () => {
    const resolution = createMockResolution();
    const ops = generateOpsForComponent(
      'Button',
      'NODE:btn-123',
      resolution,
      undefined,
      'Button.tsx'
    );

    const fontSizeOps = ops.filter((op) => op.property === 'fontSize');
    expect(fontSizeOps.length).toBeGreaterThan(0);
    expect(fontSizeOps[0].to).toBe(24);
  });

  it('preserves confidence levels', () => {
    const resolution = createMockResolution();
    const ops = generateOpsForComponent(
      'Button',
      'NODE:btn-123',
      resolution,
      undefined,
      'Button.tsx'
    );

    const highConfidenceOps = ops.filter((op) => op.confidence === 'high');
    const mediumConfidenceOps = ops.filter((op) => op.confidence === 'medium');

    expect(highConfidenceOps.length).toBeGreaterThan(0);
    expect(mediumConfidenceOps.length).toBeGreaterThan(0);
  });

  it('sets componentKey correctly', () => {
    const resolution = createMockResolution();
    const ops = generateOpsForComponent(
      'MyButton',
      'NODE:btn-123',
      resolution,
      undefined,
      'MyButton.tsx'
    );

    expect(ops.every((op) => op.componentKey === 'MyButton')).toBe(true);
  });

  it('sets source correctly', () => {
    const resolution = createMockResolution();
    const ops = generateOpsForComponent(
      'Button',
      'NODE:btn-123',
      resolution,
      undefined,
      'src/components/Button.tsx'
    );

    expect(ops.every((op) => op.source === 'src/components/Button.tsx')).toBe(true);
  });
});

// =============================================================================
// FULL GENERATION
// =============================================================================

describe('generateApplyOps', () => {
  function createApplyInput(
    componentMap: ComponentMap,
    overrides: Partial<ApplyInput> = {}
  ): ApplyInput {
    return {
      componentMap,
      resolution: createMockResolution(),
      sourceFile: 'test.tsx',
      config: {
        ...DEFAULT_APPLY_CONFIG,
        allow: ['fill', 'spacing', 'typography'],
        minConfidence: 'low',
      },
      ...overrides,
    };
  }

  it('generates operations for components in the map', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap);

    const output = generateApplyOps(input);

    // Should have ops for Button and Card (which have nodeIds)
    const buttonOps = output.operations.filter((op) => op.componentKey === 'Button');
    const cardOps = output.operations.filter((op) => op.componentKey === 'Card');

    expect(buttonOps.length).toBeGreaterThan(0);
    expect(cardOps.length).toBeGreaterThan(0);
  });

  it('excludes components without stable nodeIds', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap);

    const output = generateApplyOps(input);

    // NoFigma has no nodeIds, should have violation
    const noFigmaViolations = output.violations.filter(
      (v) => v.componentKey === 'NoFigma' && v.type === 'missing-node-id'
    );
    expect(noFigmaViolations.length).toBeGreaterThan(0);
  });

  it('respects FIGMA_APPLY_ALLOW categories', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap, {
      config: {
        ...DEFAULT_APPLY_CONFIG,
        allow: ['fill'], // Only fill allowed
        minConfidence: 'low',
      },
    });

    const output = generateApplyOps(input);

    // Only fill operations should pass validation
    const validFillOps = output.operations.filter((op) => op.property === 'fill');
    expect(validFillOps.length).toBeGreaterThan(0);

    // Spacing and typography violations should be recorded
    const spacingViolations = output.violations.filter(
      (v) => v.type === 'property-not-allowed'
    );
    expect(spacingViolations.length).toBeGreaterThan(0);
  });

  it('filters by minimum confidence', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap, {
      config: {
        ...DEFAULT_APPLY_CONFIG,
        allow: ['fill', 'spacing', 'typography'],
        minConfidence: 'high', // Only high confidence
      },
    });

    const output = generateApplyOps(input);

    // Should only have high confidence ops
    expect(output.operations.every((op) => op.confidence === 'high')).toBe(true);

    // Low/medium confidence should be violations
    const lowConfViolations = output.violations.filter((v) => v.type === 'low-confidence');
    expect(lowConfViolations.length).toBeGreaterThan(0);
  });

  it('returns summary statistics', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap);

    const output = generateApplyOps(input);

    expect(output.summary).toBeDefined();
    expect(output.summary.totalOperations).toBeGreaterThan(0);
    expect(output.summary.byProperty).toBeDefined();
    expect(output.summary.totalViolations).toBeGreaterThanOrEqual(0);
  });

  it('generates deterministic operations (idempotent)', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap);

    const output1 = generateApplyOps(input);
    const output2 = generateApplyOps(input);

    // Same inputs should produce same operations with same opIds
    expect(output1.operations.length).toBe(output2.operations.length);
    expect(output1.operations.map((op) => op.opId)).toEqual(
      output2.operations.map((op) => op.opId)
    );
  });

  it('operations have unique opIds', () => {
    const componentMap = createMockComponentMap();
    const input = createApplyInput(componentMap);

    const output = generateApplyOps(input);

    // Should have unique opIds
    const opIds = output.operations.map((op) => op.opId);
    const uniqueOpIds = [...new Set(opIds)];
    expect(opIds.length).toBe(uniqueOpIds.length);
  });
});

// =============================================================================
// DEDUPLICATION AND SORTING
// =============================================================================

describe('deduplicateOps', () => {
  it('removes duplicate operations by opId', () => {
    const ops: FigmaApplyOp[] = [
      createApplyOp('NODE:1', 'Button', 'fill', '#111', 'c.1', 'high', 's.tsx', 'r1'),
      createApplyOp('NODE:1', 'Button', 'fill', '#111', 'c.1', 'high', 's.tsx', 'r2'),
    ];
    // Same opId since same nodeId, property, to
    expect(ops[0].opId).toBe(ops[1].opId);

    const deduped = deduplicateOps(ops);
    expect(deduped.length).toBe(1);
  });

  it('keeps unique operations', () => {
    const ops: FigmaApplyOp[] = [
      createApplyOp('NODE:1', 'Button', 'fill', '#111', 'c.1', 'high', 's.tsx', 'r1'),
      createApplyOp('NODE:1', 'Button', 'fill', '#222', 'c.2', 'high', 's.tsx', 'r2'),
    ];
    // Different opId since different to value
    expect(ops[0].opId).not.toBe(ops[1].opId);

    const deduped = deduplicateOps(ops);
    expect(deduped.length).toBe(2);
  });
});

describe('sortOps', () => {
  it('sorts operations by componentKey, then property, then opId', () => {
    const ops: FigmaApplyOp[] = [
      createApplyOp('NODE:1', 'Card', 'fill', '#111', 'c.1', 'high', 's.tsx', 'r1'),
      createApplyOp('NODE:2', 'Button', 'padding', '16', 'c.2', 'high', 's.tsx', 'r2'),
      createApplyOp('NODE:3', 'Button', 'fill', '#222', 'c.3', 'high', 's.tsx', 'r3'),
    ];

    const sorted = sortOps(ops);

    // Button before Card
    expect(sorted[0].componentKey).toBe('Button');
    expect(sorted[1].componentKey).toBe('Button');
    expect(sorted[2].componentKey).toBe('Card');

    // fill before padding (alphabetically)
    expect(sorted[0].property).toBe('fill');
    expect(sorted[1].property).toBe('padding');
  });
});

// =============================================================================
// STATE TARGETING (Phase 11C.2)
// =============================================================================

describe('state targeting', () => {
  // Component map with hover variant
  function createLoginButtonMap(): ComponentMap {
    return {
      version: 2,
      components: {
        LoginButton: {
          componentKey: 'LoginButton',
          figma: {
            name: 'LoginButton',
            componentSetNodeId: '23:27',
            variants: {
              base: { nodeId: '23:26' },
              hover: { nodeId: '23:28' },
            },
          },
        },
      },
    };
  }

  it('targets hover variant nodeId when --state hover is provided', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      componentSemantics: {
        'LoginButton::hover': {} as any, // Indicates state-specific data exists
      },
    };

    const output = generateApplyOps(input);

    // Should target hover variant nodeId, not base or Component Set
    expect(output.operations.length).toBeGreaterThan(0);
    for (const op of output.operations) {
      expect(op.nodeId).toBe('23:28'); // hover variant
      expect(op.targetState).toBe('hover');
      expect(op.fromVariant).toBe(true);
    }
  });

  it('targets base variant nodeId when no --state is provided', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
    };

    const output = generateApplyOps(input);

    // Should target base variant nodeId
    expect(output.operations.length).toBeGreaterThan(0);
    for (const op of output.operations) {
      expect(op.nodeId).toBe('23:26'); // base variant
      expect(op.targetState).toBe('base');
      expect(op.fromVariant).toBe(true);
    }
  });

  it('creates missing-variant-id violation when requested variant does not exist', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'disabled', // Does not exist in component-map
      componentSemantics: {
        'LoginButton::disabled': {} as any, // State-specific data exists
      },
    };

    const output = generateApplyOps(input);

    // Should have 0 ops and a violation
    expect(output.operations.length).toBe(0);
    expect(output.violations.length).toBeGreaterThan(0);

    const missingVariant = output.violations.find((v) => v.type === 'missing-variant-id');
    expect(missingVariant).toBeDefined();
    expect(missingVariant?.componentKey).toBe('LoginButton');
    expect(missingVariant?.targetState).toBe('disabled');
  });

  it('refuses to apply base semantics to hover when no state-specific data', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      // No componentSemantics with 'LoginButton::hover' key
    };

    const output = generateApplyOps(input);

    // Should have 0 ops and a no-state-specific-data violation
    expect(output.operations.length).toBe(0);
    expect(output.violations.length).toBeGreaterThan(0);

    const noStateData = output.violations.find((v) => v.type === 'no-state-specific-data');
    expect(noStateData).toBeDefined();
    expect(noStateData?.componentKey).toBe('LoginButton');
    expect(noStateData?.targetState).toBe('hover');
    expect(noStateData?.message).toContain('refusing to apply base semantics');
  });

  it('does not refuse when targeting base state', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'base',
      // No componentSemantics - but base is allowed without state-specific data
    };

    const output = generateApplyOps(input);

    // Should generate ops for base variant
    expect(output.operations.length).toBeGreaterThan(0);
    const noStateData = output.violations.find((v) => v.type === 'no-state-specific-data');
    expect(noStateData).toBeUndefined();
  });
});

// =============================================================================
// EXPLICIT STATE DATA (Phase 11C.3)
// =============================================================================

describe('explicit state data (Phase 11C.3)', () => {
  // Component map with hover variant
  function createLoginButtonMap(): ComponentMap {
    return {
      version: 2,
      components: {
        LoginButton: {
          componentKey: 'LoginButton',
          figma: {
            name: 'LoginButton',
            componentSetNodeId: '23:27',
            variants: {
              base: { nodeId: '23:26' },
              hover: { nodeId: '23:28' },
            },
          },
        },
      },
    };
  }

  it('generates ops from hover marker when --state hover is provided', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      // Markers with node=LoginButton::hover
      markers: [
        {
          node: 'LoginButton::hover',
          fill: '#2563EB',
          text: 'Hover',
          rawLine: '// @figma node=LoginButton::hover text="Hover" fill=#2563EB',
          lineNumber: 26,
        },
      ],
    };

    const output = generateApplyOps(input);

    // Should generate fill op targeting hover variant nodeId
    expect(output.operations.length).toBe(1);
    expect(output.violations.length).toBe(0);

    const fillOp = output.operations.find((op) => op.property === 'fill');
    expect(fillOp).toBeDefined();
    expect(fillOp?.nodeId).toBe('23:28'); // hover variant
    expect(fillOp?.to).toBe('#2563EB');
    expect(fillOp?.targetState).toBe('hover');
    expect(fillOp?.fromVariant).toBe(true);
    expect(fillOp?.source).toBe('explicit-markers');
  });

  it('generates ops from hover override when --state hover is provided', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      // Design overrides with LoginButton::hover key
      overrides: {
        'LoginButton::hover': {
          nodeId: '23:28',
          lastUpdated: '2025-12-24T17:00:00.000Z',
          fill: '#AD0101',
          text: 'Hover',
        },
      },
    };

    const output = generateApplyOps(input);

    // Should generate fill op from override
    expect(output.operations.length).toBe(1);
    expect(output.violations.length).toBe(0);

    const fillOp = output.operations.find((op) => op.property === 'fill');
    expect(fillOp).toBeDefined();
    expect(fillOp?.nodeId).toBe('23:28'); // hover variant
    expect(fillOp?.to).toBe('#AD0101'); // from override
    expect(fillOp?.targetState).toBe('hover');
    expect(fillOp?.source).toBe('explicit-overrides');
  });

  it('prefers override over marker when both exist', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      // Both markers and overrides
      markers: [
        {
          node: 'LoginButton::hover',
          fill: '#2563EB', // marker fill
          rawLine: '// @figma node=LoginButton::hover fill=#2563EB',
          lineNumber: 26,
        },
      ],
      overrides: {
        'LoginButton::hover': {
          nodeId: '23:28',
          lastUpdated: '2025-12-24T17:00:00.000Z',
          fill: '#AD0101', // override fill (should win)
        },
      },
    };

    const output = generateApplyOps(input);

    // Override takes priority
    const fillOp = output.operations.find((op) => op.property === 'fill');
    expect(fillOp?.to).toBe('#AD0101'); // from override, not marker
    expect(fillOp?.source).toBe('explicit-overrides');
  });

  it('still refuses when no marker/override exists for hover', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      // Empty markers and overrides
      markers: [],
      overrides: {},
    };

    const output = generateApplyOps(input);

    // Should still refuse
    expect(output.operations.length).toBe(0);
    expect(output.violations.length).toBeGreaterThan(0);

    const noStateData = output.violations.find((v) => v.type === 'no-state-specific-data');
    expect(noStateData).toBeDefined();
    expect(noStateData?.targetState).toBe('hover');
  });

  it('generates ops from override layout properties', () => {
    const input: ApplyInput = {
      resolution: createMockResolution(),
      componentMap: createLoginButtonMap(),
      sourceFile: 'demo-app/src/App.tsx',
      config: { ...DEFAULT_APPLY_CONFIG, mode: 'artifact', allow: ['fill', 'spacing', 'typography'] },
      targetComponent: 'LoginButton',
      targetState: 'hover',
      overrides: {
        'LoginButton::hover': {
          nodeId: '23:28',
          lastUpdated: '2025-12-24T17:00:00.000Z',
          layout: {
            padding: 16,
            gap: 8,
          },
        },
      },
    };

    const output = generateApplyOps(input);

    // Should generate padding and gap ops
    expect(output.operations.length).toBe(2);

    const paddingOp = output.operations.find((op) => op.property === 'padding');
    expect(paddingOp).toBeDefined();
    expect(paddingOp?.to).toBe(16);

    const gapOp = output.operations.find((op) => op.property === 'gap');
    expect(gapOp).toBeDefined();
    expect(gapOp?.to).toBe(8);
  });
});

// =============================================================================
// getExplicitStateData UNIT TESTS (Phase 11C.3)
// =============================================================================

describe('getExplicitStateData', () => {
  it('returns undefined when no markers or overrides', () => {
    const result = getExplicitStateData('LoginButton', 'hover', undefined, undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when markers/overrides are empty', () => {
    const result = getExplicitStateData('LoginButton', 'hover', [], {});
    expect(result).toBeUndefined();
  });

  it('extracts fill from override', () => {
    const overrides: DesignOverrides = {
      'LoginButton::hover': {
        nodeId: '23:28',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        fill: '#AD0101',
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', undefined, overrides);

    expect(result).toBeDefined();
    expect(result?.source).toBe('overrides');
    expect(result?.fill).toBe('#AD0101');
  });

  it('extracts text from override', () => {
    const overrides: DesignOverrides = {
      'LoginButton::hover': {
        nodeId: '23:28',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        text: 'Hover Text',
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', undefined, overrides);

    expect(result).toBeDefined();
    expect(result?.source).toBe('overrides');
    expect(result?.text).toBe('Hover Text');
  });

  it('extracts layout properties from override', () => {
    const overrides: DesignOverrides = {
      'LoginButton::hover': {
        nodeId: '23:28',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        layout: {
          padding: 16,
          gap: 8,
          width: 200,
          height: 50,
        },
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', undefined, overrides);

    expect(result).toBeDefined();
    expect(result?.source).toBe('overrides');
    expect(result?.padding).toBe(16);
    expect(result?.gap).toBe(8);
    expect(result?.width).toBe(200);
    expect(result?.height).toBe(50);
  });

  it('extracts fill from marker', () => {
    const markers: MarkerData[] = [
      {
        node: 'LoginButton::hover',
        fill: '#2563EB',
        rawLine: '// @figma node=LoginButton::hover fill=#2563EB',
        lineNumber: 26,
      },
    ];

    const result = getExplicitStateData('LoginButton', 'hover', markers, undefined);

    expect(result).toBeDefined();
    expect(result?.source).toBe('markers');
    expect(result?.fill).toBe('#2563EB');
  });

  it('extracts text from marker', () => {
    const markers: MarkerData[] = [
      {
        node: 'LoginButton::hover',
        text: 'Hover',
        rawLine: '// @figma node=LoginButton::hover text="Hover"',
        lineNumber: 26,
      },
    ];

    const result = getExplicitStateData('LoginButton', 'hover', markers, undefined);

    expect(result).toBeDefined();
    expect(result?.source).toBe('markers');
    expect(result?.text).toBe('Hover');
  });

  it('prefers override over marker', () => {
    const markers: MarkerData[] = [
      {
        node: 'LoginButton::hover',
        fill: '#MARKER',
        rawLine: '// @figma node=LoginButton::hover fill=#MARKER',
        lineNumber: 26,
      },
    ];
    const overrides: DesignOverrides = {
      'LoginButton::hover': {
        nodeId: '23:28',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        fill: '#OVERRIDE',
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', markers, overrides);

    expect(result).toBeDefined();
    expect(result?.source).toBe('overrides');
    expect(result?.fill).toBe('#OVERRIDE');
  });

  it('returns undefined for wrong state key', () => {
    const overrides: DesignOverrides = {
      'LoginButton::disabled': {
        nodeId: '23:29',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        fill: '#DISABLED',
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', undefined, overrides);
    expect(result).toBeUndefined();
  });

  it('returns undefined for base key when looking for hover', () => {
    const overrides: DesignOverrides = {
      'LoginButton': {
        nodeId: '23:26',
        lastUpdated: '2025-12-24T17:00:00.000Z',
        fill: '#BASE',
      },
    };

    const result = getExplicitStateData('LoginButton', 'hover', undefined, overrides);
    expect(result).toBeUndefined();
  });
});
