/**
 * @aesthetic-function/watcher - rollbackPreview/__tests__/rollbackPreview.test.ts
 *
 * Phase 12I: Unit tests for rollback preview generation.
 *
 * Tests verify:
 * 1. Single mismatch → single rollback action
 * 2. Multiple mismatches → multiple actions
 * 3. Mixed targets (ast, marker, override)
 * 4. Deterministic ordering (componentKey → state → property)
 * 5. No artifact written when no failures
 * 6. Artifact correctness (values, provenance, summary)
 *
 * NO demo-app reads. Fixtures only.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRollbackActionId,
  generateRollbackPreview,
  buildRollbackSummary,
  hasRollbackActions,
  getDefaultApplyArtifactPath,
  getDefaultVerificationArtifactPath,
} from '../generate.js';
import {
  getRollbackPreviewArtifactPath,
  formatRollbackPreview,
} from '../artifact.js';
import type {
  RollbackAction,
  RollbackPreview,
  LoadedRollbackInputs,
} from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Create a mock LoadedRollbackInputs for testing.
 */
function createMockInputs(overrides: Partial<LoadedRollbackInputs> = {}): LoadedRollbackInputs {
  return {
    success: true,
    applyArtifactPath: 'design-materializations/src__App.figma-resolve-apply.json',
    verificationArtifactPath: 'design-materializations/src__App.figma-verification.json',
    applyResults: [],
    verificationFailures: [],
    ...overrides,
  };
}

/**
 * Create a mock verification failure.
 */
function createMockFailure(overrides: Partial<NonNullable<LoadedRollbackInputs['verificationFailures']>[0]> = {}) {
  return {
    decisionId: 'abc123',
    componentKey: 'LoginButton',
    targetState: 'base',
    property: 'fill' as const,
    target: 'ast',
    status: 'mismatch' as const,
    reason: 'Values do not match',
    expectedValue: '#FF0000',
    observedValue: '#00FF00',
    previousValue: '#0000FF',
    ...overrides,
  };
}

/**
 * Create a mock apply result.
 */
function createMockApplyResult(overrides: Partial<NonNullable<LoadedRollbackInputs['applyResults']>[0]> = {}) {
  return {
    decisionId: 'abc123',
    componentKey: 'LoginButton',
    targetState: 'base',
    property: 'fill' as const,
    target: 'ast',
    appliedValue: '#FF0000',
    previousValue: '#0000FF',
    ...overrides,
  };
}

// =============================================================================
// ACTION ID TESTS
// =============================================================================

describe('computeRollbackActionId', () => {
  it('generates deterministic IDs', () => {
    const id1 = computeRollbackActionId('LoginButton', 'base', 'fill', 'ast');
    const id2 = computeRollbackActionId('LoginButton', 'base', 'fill', 'ast');
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different inputs', () => {
    const id1 = computeRollbackActionId('LoginButton', 'base', 'fill', 'ast');
    const id2 = computeRollbackActionId('LoginButton', 'hover', 'fill', 'ast');
    expect(id1).not.toBe(id2);
  });

  it('generates 16-character hex IDs', () => {
    const id = computeRollbackActionId('LoginButton', 'base', 'fill', 'ast');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });
});

// =============================================================================
// PATH GENERATION TESTS
// =============================================================================

describe('artifact path generation', () => {
  it('generates correct default apply artifact path', () => {
    const path = getDefaultApplyArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-resolve-apply.json');
  });

  it('generates correct default verification artifact path', () => {
    const path = getDefaultVerificationArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-verification.json');
  });

  it('generates correct rollback preview artifact path', () => {
    const path = getRollbackPreviewArtifactPath('src/App.tsx');
    expect(path).toBe('design-materializations/src__App.figma-rollback-preview.json');
  });

  it('handles nested paths correctly', () => {
    const path = getRollbackPreviewArtifactPath('src/components/Button.tsx');
    expect(path).toBe('design-materializations/src__components__Button.figma-rollback-preview.json');
  });
});

// =============================================================================
// SINGLE MISMATCH TESTS
// =============================================================================

describe('single mismatch', () => {
  it('generates single rollback action for single mismatch', () => {
    const inputs = createMockInputs({
      applyResults: [createMockApplyResult()],
      verificationFailures: [createMockFailure()],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions).toHaveLength(1);
    expect(preview.actions[0].componentKey).toBe('LoginButton');
    expect(preview.actions[0].property).toBe('fill');
    expect(preview.actions[0].verificationStatus).toBe('mismatch');
  });

  it('captures applied and previous values', () => {
    const inputs = createMockInputs({
      applyResults: [createMockApplyResult({
        appliedValue: '#FF0000',
        previousValue: '#0000FF',
      })],
      verificationFailures: [createMockFailure()],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].appliedValue).toBe('#FF0000');
    expect(preview.actions[0].previousValue).toBe('#0000FF');
  });

  it('links to source apply operation', () => {
    const inputs = createMockInputs({
      applyResults: [createMockApplyResult({ decisionId: 'decision-xyz' })],
      verificationFailures: [createMockFailure({ decisionId: 'decision-xyz' })],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].sourceApplyOpId).toBe('decision-xyz');
  });
});

// =============================================================================
// MULTIPLE MISMATCH TESTS
// =============================================================================

describe('multiple mismatches', () => {
  it('generates multiple rollback actions for multiple failures', () => {
    const inputs = createMockInputs({
      applyResults: [
        createMockApplyResult({ decisionId: 'a1', property: 'fill' }),
        createMockApplyResult({ decisionId: 'a2', property: 'padding' }),
        createMockApplyResult({ decisionId: 'a3', property: 'fontSize' }),
      ],
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', property: 'fill' }),
        createMockFailure({ decisionId: 'a2', property: 'padding' }),
        createMockFailure({ decisionId: 'a3', property: 'fontSize' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions).toHaveLength(3);
    expect(preview.summary.total).toBe(3);
  });

  it('handles missing status as well as mismatch', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', status: 'mismatch' }),
        createMockFailure({ decisionId: 'a2', status: 'missing', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions).toHaveLength(2);
    expect(preview.actions.some(a => a.verificationStatus === 'mismatch')).toBe(true);
    expect(preview.actions.some(a => a.verificationStatus === 'missing')).toBe(true);
  });
});

// =============================================================================
// MIXED TARGETS TESTS
// =============================================================================

describe('mixed targets', () => {
  it('handles ast, marker, and override targets', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', target: 'ast', property: 'fill' }),
        createMockFailure({ decisionId: 'a2', target: 'marker', property: 'padding' }),
        createMockFailure({ decisionId: 'a3', target: 'override', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions).toHaveLength(3);
    expect(preview.summary.byTarget).toEqual({
      ast: 1,
      marker: 1,
      override: 1,
    });
  });

  it('counts targets correctly in summary', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', target: 'ast' }),
        createMockFailure({ decisionId: 'a2', target: 'ast', property: 'padding' }),
        createMockFailure({ decisionId: 'a3', target: 'marker', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.summary.byTarget.ast).toBe(2);
    expect(preview.summary.byTarget.marker).toBe(1);
  });
});

// =============================================================================
// DETERMINISTIC ORDERING TESTS
// =============================================================================

describe('deterministic ordering', () => {
  it('sorts by componentKey first', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', componentKey: 'ZButton' }),
        createMockFailure({ decisionId: 'a2', componentKey: 'AButton', property: 'padding' }),
        createMockFailure({ decisionId: 'a3', componentKey: 'MButton', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].componentKey).toBe('AButton');
    expect(preview.actions[1].componentKey).toBe('MButton');
    expect(preview.actions[2].componentKey).toBe('ZButton');
  });

  it('sorts by targetState within same componentKey', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', componentKey: 'Button', targetState: 'hover' }),
        createMockFailure({ decisionId: 'a2', componentKey: 'Button', targetState: 'base', property: 'padding' }),
        createMockFailure({ decisionId: 'a3', componentKey: 'Button', targetState: 'disabled', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].targetState).toBe('base');
    expect(preview.actions[1].targetState).toBe('disabled');
    expect(preview.actions[2].targetState).toBe('hover');
  });

  it('sorts by property within same componentKey and state', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', property: 'padding' }),
        createMockFailure({ decisionId: 'a2', property: 'fill' }),
        createMockFailure({ decisionId: 'a3', property: 'gap' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].property).toBe('fill');
    expect(preview.actions[1].property).toBe('gap');
    expect(preview.actions[2].property).toBe('padding');
  });
});

// =============================================================================
// NO FAILURES TESTS
// =============================================================================

describe('no failures', () => {
  it('generates empty actions when no verification failures', () => {
    const inputs = createMockInputs({
      applyResults: [createMockApplyResult()],
      verificationFailures: [],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions).toHaveLength(0);
    expect(preview.summary.total).toBe(0);
  });

  it('hasRollbackActions returns false for empty preview', () => {
    const preview: RollbackPreview = {
      version: '1.0',
      source: 'figma-rollback-preview',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      applyArtifactPath: '',
      verificationArtifactPath: '',
      actions: [],
      summary: { total: 0, byTarget: {}, byProperty: {} },
    };

    expect(hasRollbackActions(preview)).toBe(false);
  });

  it('hasRollbackActions returns true when actions exist', () => {
    const preview: RollbackPreview = {
      version: '1.0',
      source: 'figma-rollback-preview',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      applyArtifactPath: '',
      verificationArtifactPath: '',
      actions: [{
        actionId: 'abc',
        target: 'ast',
        componentKey: 'Button',
        targetState: 'base',
        property: 'fill',
        appliedValue: '#FF0000',
        previousValue: '#0000FF',
        sourceApplyOpId: 'xyz',
        verificationStatus: 'mismatch',
        reason: 'test',
      }],
      summary: { total: 1, byTarget: { ast: 1 }, byProperty: { fill: 1 } },
    };

    expect(hasRollbackActions(preview)).toBe(true);
  });
});

// =============================================================================
// ARTIFACT CORRECTNESS TESTS
// =============================================================================

describe('artifact correctness', () => {
  it('includes version and source', () => {
    const inputs = createMockInputs({
      verificationFailures: [createMockFailure()],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.version).toBe('1.0');
    expect(preview.source).toBe('figma-rollback-preview');
  });

  it('includes sourceFile', () => {
    const inputs = createMockInputs({
      verificationFailures: [createMockFailure()],
    });

    const preview = generateRollbackPreview(inputs, 'src/components/Button.tsx');

    expect(preview.sourceFile).toBe('src/components/Button.tsx');
  });

  it('includes artifact paths', () => {
    const inputs = createMockInputs({
      applyArtifactPath: 'path/to/apply.json',
      verificationArtifactPath: 'path/to/verify.json',
      verificationFailures: [createMockFailure()],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.applyArtifactPath).toBe('path/to/apply.json');
    expect(preview.verificationArtifactPath).toBe('path/to/verify.json');
  });

  it('includes timestamp', () => {
    const inputs = createMockInputs({
      verificationFailures: [createMockFailure()],
    });

    const before = new Date().toISOString();
    const preview = generateRollbackPreview(inputs, 'src/App.tsx');
    const after = new Date().toISOString();

    expect(preview.timestamp >= before).toBe(true);
    expect(preview.timestamp <= after).toBe(true);
  });

  it('summary byProperty counts correctly', () => {
    const inputs = createMockInputs({
      verificationFailures: [
        createMockFailure({ decisionId: 'a1', property: 'fill' }),
        createMockFailure({ decisionId: 'a2', property: 'fill', targetState: 'hover' }),
        createMockFailure({ decisionId: 'a3', property: 'padding' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.summary.byProperty).toEqual({
      fill: 2,
      padding: 1,
    });
  });
});

// =============================================================================
// SUMMARY HELPER TESTS
// =============================================================================

describe('buildRollbackSummary', () => {
  it('builds correct summary for empty actions', () => {
    const summary = buildRollbackSummary([]);

    expect(summary.total).toBe(0);
    expect(summary.byTarget).toEqual({});
    expect(summary.byProperty).toEqual({});
  });

  it('builds correct summary for multiple actions', () => {
    const actions: RollbackAction[] = [
      {
        actionId: 'a1',
        target: 'ast',
        componentKey: 'Button',
        targetState: 'base',
        property: 'fill',
        appliedValue: '#FF0000',
        previousValue: '#0000FF',
        sourceApplyOpId: 'x1',
        verificationStatus: 'mismatch',
        reason: 'test',
      },
      {
        actionId: 'a2',
        target: 'marker',
        componentKey: 'Button',
        targetState: 'hover',
        property: 'fill',
        appliedValue: '#FF0000',
        previousValue: '#0000FF',
        sourceApplyOpId: 'x2',
        verificationStatus: 'missing',
        reason: 'test',
      },
    ];

    const summary = buildRollbackSummary(actions);

    expect(summary.total).toBe(2);
    expect(summary.byTarget).toEqual({ ast: 1, marker: 1 });
    expect(summary.byProperty).toEqual({ fill: 2 });
  });
});

// =============================================================================
// FORMAT OUTPUT TESTS
// =============================================================================

describe('formatRollbackPreview', () => {
  it('formats empty preview correctly', () => {
    const preview: RollbackPreview = {
      version: '1.0',
      source: 'figma-rollback-preview',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      applyArtifactPath: '',
      verificationArtifactPath: '',
      actions: [],
      summary: { total: 0, byTarget: {}, byProperty: {} },
    };

    const formatted = formatRollbackPreview(preview);

    expect(formatted).toContain('ROLLBACK PREVIEW (Phase 12I)');
    expect(formatted).toContain('No rollback actions needed');
  });

  it('formats preview with actions correctly', () => {
    const preview: RollbackPreview = {
      version: '1.0',
      source: 'figma-rollback-preview',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      applyArtifactPath: '',
      verificationArtifactPath: '',
      actions: [{
        actionId: 'abc',
        target: 'override',
        componentKey: 'LoginButton',
        targetState: 'hover',
        property: 'fill',
        appliedValue: '#00FF00',
        previousValue: '#2563EB',
        sourceApplyOpId: 'xyz',
        verificationStatus: 'mismatch',
        reason: 'Values differ',
      }],
      summary: { total: 1, byTarget: { override: 1 }, byProperty: { fill: 1 } },
    };

    const formatted = formatRollbackPreview(preview);

    expect(formatted).toContain('LoginButton::hover');
    expect(formatted).toContain('fill:');
    expect(formatted).toContain('#00FF00');
    expect(formatted).toContain('#2563EB');
    expect(formatted).toContain('override');
    expect(formatted).toContain('Total rollback actions: 1');
  });

  it('includes target summary in output', () => {
    const preview: RollbackPreview = {
      version: '1.0',
      source: 'figma-rollback-preview',
      sourceFile: 'src/App.tsx',
      timestamp: new Date().toISOString(),
      applyArtifactPath: '',
      verificationArtifactPath: '',
      actions: [{
        actionId: 'abc',
        target: 'override',
        componentKey: 'Button',
        targetState: 'base',
        property: 'fill',
        appliedValue: '#FF0000',
        previousValue: '#0000FF',
        sourceApplyOpId: 'xyz',
        verificationStatus: 'mismatch',
        reason: 'test',
      }],
      summary: { total: 1, byTarget: { override: 1 }, byProperty: { fill: 1 } },
    };

    const formatted = formatRollbackPreview(preview);

    expect(formatted).toContain('Targets: override (1)');
  });
});

// =============================================================================
// PROVENANCE TESTS
// =============================================================================

describe('provenance tracking', () => {
  it('preserves decision ID linkage', () => {
    const inputs = createMockInputs({
      applyResults: [
        createMockApplyResult({ decisionId: 'unique-decision-id-123' }),
      ],
      verificationFailures: [
        createMockFailure({ decisionId: 'unique-decision-id-123' }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    expect(preview.actions[0].sourceApplyOpId).toBe('unique-decision-id-123');
  });

  it('handles missing apply result gracefully', () => {
    const inputs = createMockInputs({
      applyResults: [], // No matching apply result
      verificationFailures: [
        createMockFailure({ 
          decisionId: 'orphan-decision',
          expectedValue: '#expected',
          previousValue: '#previous',
        }),
      ],
    });

    const preview = generateRollbackPreview(inputs, 'src/App.tsx');

    // Should still generate action, using verification failure values
    expect(preview.actions).toHaveLength(1);
    expect(preview.actions[0].appliedValue).toBe('#expected');
    expect(preview.actions[0].previousValue).toBe('#previous');
  });
});
