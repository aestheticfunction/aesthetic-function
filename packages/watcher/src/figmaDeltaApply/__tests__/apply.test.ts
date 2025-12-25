/**
 * @aesthetic-function/watcher - figmaDeltaApply/__tests__/apply.test.ts
 *
 * Unit tests for Phase 12C delta apply operations.
 *
 * Tests:
 * 1. Hover delta + hover marker present → generates override/marker ops, no AST
 * 2. Hover delta + no marker + override allowed → creates componentKey::hover override
 * 3. Base delta + JSX literal writable → generates AST patch op
 * 4. Base delta but non-writable (variable) → falls back to override/marker, not AST
 * 5. Deterministic output snapshot for artifact
 * 6. Dry-run mode produces artifacts but does not write overrides/markers/files
 */

import { describe, it, expect } from 'vitest';
import {
  generateDeltaApplyOps,
  buildApplySummary,
} from '../apply.js';
import {
  loadDeltaApplyConfig,
  isTargetAllowed,
  meetsConfidenceThreshold,
  getPreconditionStatus,
} from '../config.js';
import {
  buildDeltaApplyArtifact,
  getDeltaApplyArtifactPath,
} from '../artifact.js';
import type { DeltaApplyInput, DeltaApplyConfig, DeltaApplyOp, OpApplyResult } from '../types.js';
import type { FigmaDeltaSuggestion } from '../../figmaDeltaSuggest/types.js';

// =============================================================================
// FIXTURES
// =============================================================================

function createConfig(overrides: Partial<DeltaApplyConfig> = {}): DeltaApplyConfig {
  return {
    enabled: false,
    mode: 'artifact',
    dryRun: true,
    allow: ['override', 'marker', 'ast'],
    minConfidence: 'high',
    serverUrl: 'http://localhost:3001',
    ...overrides,
  };
}

function createHoverMarkerSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'hover',
    property: 'fill',
    fromRaw: '#2563EB',
    toRaw: '#10B981',
    fromCanonical: 'color.secondary',
    toCanonical: 'color.success',
    suggestedTarget: 'marker',
    kind: 'UPDATE_MARKER',
    confidence: 'high',
    reason: 'Hover state with existing marker',
    evidence: {
      variantNodeId: '23:28',
      markerLine: 25,
    },
  };
}

function createHoverOverrideSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'hover',
    property: 'fill',
    fromRaw: '#2563EB',
    toRaw: '#10B981',
    suggestedTarget: 'override',
    kind: 'UPDATE_OVERRIDE',
    confidence: 'high',
    reason: 'Hover state with existing override',
    evidence: {
      variantNodeId: '23:28',
      overrideKey: 'LoginButton::hover',
    },
  };
}

function createHoverNoMarkerSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'hover',
    property: 'fill',
    fromRaw: '#2563EB',
    toRaw: '#10B981',
    suggestedTarget: 'override',
    kind: 'UPDATE_OVERRIDE',
    confidence: 'high',
    reason: 'No marker, suggesting new override',
    evidence: {
      variantNodeId: '23:28',
    },
  };
}

function createBaseAstSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'base',
    property: 'fill',
    fromRaw: '#3B82F6',
    toRaw: '#10B981',
    suggestedTarget: 'ast',
    kind: 'AST_WRITE_PATCH',
    confidence: 'high',
    reason: 'Base state with auto-writable AST location',
    evidence: {
      variantNodeId: '23:26',
      astLoc: { startLine: 15, endLine: 15, startColumn: 20, endColumn: 30 },
    },
  };
}

function createBaseNonWritableSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'base',
    property: 'fill',
    fromRaw: '#3B82F6',
    toRaw: '#10B981',
    suggestedTarget: 'override',
    kind: 'UPDATE_OVERRIDE',
    confidence: 'high',
    reason: 'Base state not auto-writable, using override',
    evidence: {
      variantNodeId: '23:26',
      overrideKey: 'LoginButton',
    },
  };
}

function createBlockedSuggestion(): FigmaDeltaSuggestion {
  return {
    componentKey: 'LoginButton',
    targetState: 'hover',
    property: 'fill',
    fromRaw: '#2563EB',
    toRaw: '#10B981',
    suggestedTarget: 'none',
    kind: 'BLOCKED',
    confidence: 'high',
    reason: 'Cannot apply automatically',
    blockingReason: 'No marker or override exists and creation not allowed',
    evidence: {
      variantNodeId: '23:28',
    },
  };
}

// =============================================================================
// CONFIG TESTS
// =============================================================================

describe('config functions', () => {
  describe('loadDeltaApplyConfig', () => {
    it('returns default config when no env vars set', () => {
      const config = loadDeltaApplyConfig();
      expect(config.enabled).toBe(false);
      expect(config.mode).toBe('artifact');
      expect(config.dryRun).toBe(true);
    });
  });

  describe('isTargetAllowed', () => {
    it('returns true for allowed targets', () => {
      const config = createConfig({ allow: ['override', 'marker'] });
      expect(isTargetAllowed('override', config)).toBe(true);
      expect(isTargetAllowed('marker', config)).toBe(true);
    });

    it('returns false for disallowed targets', () => {
      const config = createConfig({ allow: ['override'] });
      expect(isTargetAllowed('ast', config)).toBe(false);
      expect(isTargetAllowed('marker', config)).toBe(false);
    });
  });

  describe('meetsConfidenceThreshold', () => {
    it('accepts high when threshold is high', () => {
      expect(meetsConfidenceThreshold('high', 'high')).toBe(true);
    });

    it('rejects medium when threshold is high', () => {
      expect(meetsConfidenceThreshold('medium', 'high')).toBe(false);
    });

    it('accepts medium when threshold is medium', () => {
      expect(meetsConfidenceThreshold('medium', 'medium')).toBe(true);
    });

    it('accepts high when threshold is low', () => {
      expect(meetsConfidenceThreshold('high', 'low')).toBe(true);
    });
  });

  describe('getPreconditionStatus', () => {
    it('returns canApply false when disabled', () => {
      const config = createConfig({ enabled: false });
      const status = getPreconditionStatus(config);
      expect(status.canApply).toBe(false);
      expect(status.reasons).toContain('FIGMA_DELTA_APPLY_ON is not set to true');
    });

    it('returns canApply true when all conditions met', () => {
      const config = createConfig({
        enabled: true,
        mode: 'apply',
        dryRun: false,
      });
      const status = getPreconditionStatus(config);
      expect(status.canApply).toBe(true);
      expect(status.reasons).toHaveLength(0);
    });
  });
});

// =============================================================================
// OPERATION GENERATION TESTS
// =============================================================================

describe('generateDeltaApplyOps', () => {
  it('generates marker op for hover delta with existing marker', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createHoverMarkerSuggestion()],
      config: createConfig(),
    };

    const { ops, skipped } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe('marker');
    expect(ops[0].evidence.markerLine).toBe(25);
    expect(skipped).toHaveLength(0);
  });

  it('generates override op for hover delta with existing override', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createHoverOverrideSuggestion()],
      config: createConfig(),
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe('override');
    expect(ops[0].evidence.overrideKey).toBe('LoginButton::hover');
  });

  it('generates override creation for hover delta with no marker', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createHoverNoMarkerSuggestion()],
      config: createConfig(),
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe('override');
    expect(ops[0].componentKey).toBe('LoginButton');
    expect(ops[0].targetState).toBe('hover');
  });

  it('generates AST op for base delta with auto-writable location', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createBaseAstSuggestion()],
      config: createConfig(),
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe('ast');
    expect(ops[0].evidence.astLoc).toBeDefined();
    expect(ops[0].evidence.astLoc?.startLine).toBe(15);
  });

  it('generates override op for base delta that is not auto-writable', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createBaseNonWritableSuggestion()],
      config: createConfig(),
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe('override');
    expect(ops[0].targetState).toBe('base');
  });

  it('skips blocked suggestions', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createBlockedSuggestion()],
      config: createConfig(),
    };

    const { ops, skipped } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    // Uses the blockingReason from the suggestion
    expect(skipped[0].reason).toContain('not allowed');
  });

  it('skips suggestions below confidence threshold', () => {
    const lowConfidenceSuggestion = {
      ...createHoverOverrideSuggestion(),
      confidence: 'low' as const,
    };

    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [lowConfidenceSuggestion],
      config: createConfig({ minConfidence: 'high' }),
    };

    const { ops, skipped } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain('below threshold');
  });

  it('skips suggestions with disallowed targets', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createBaseAstSuggestion()],
      config: createConfig({ allow: ['override', 'marker'] }), // AST not allowed
    };

    const { ops, skipped } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain('not in allow list');
  });

  it('applies component filter', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createHoverOverrideSuggestion()],
      config: createConfig(),
      componentFilter: 'OtherComponent',
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(0);
  });

  it('applies state filter', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [createHoverOverrideSuggestion()],
      config: createConfig(),
      stateFilter: 'base',
    };

    const { ops } = generateDeltaApplyOps(input);

    expect(ops).toHaveLength(0);
  });

  it('produces deterministic sorted output', () => {
    const input: DeltaApplyInput = {
      filePath: 'demo-app/src/App.tsx',
      suggestions: [
        { ...createHoverOverrideSuggestion(), componentKey: 'CardB' },
        { ...createBaseNonWritableSuggestion(), componentKey: 'CardA' },
        createHoverOverrideSuggestion(), // LoginButton
      ],
      config: createConfig(),
    };

    const { ops: ops1 } = generateDeltaApplyOps(input);
    const { ops: ops2 } = generateDeltaApplyOps(input);

    // Should be sorted alphabetically by componentKey
    expect(ops1.map((o) => o.componentKey)).toEqual(['CardA', 'CardB', 'LoginButton']);

    // Should be deterministic
    expect(JSON.stringify(ops1)).toBe(JSON.stringify(ops2));
  });
});

// =============================================================================
// SUMMARY TESTS
// =============================================================================

describe('buildApplySummary', () => {
  it('builds correct summary for mixed results', () => {
    const ops: DeltaApplyOp[] = [
      {
        opId: 'op1',
        componentKey: 'A',
        targetState: 'base',
        property: 'fill',
        to: '#FFF',
        target: 'override',
        confidence: 'high',
        reason: 'test',
        evidence: { variantNodeId: 'n1' },
      },
      {
        opId: 'op2',
        componentKey: 'B',
        targetState: 'hover',
        property: 'fill',
        to: '#000',
        target: 'marker',
        confidence: 'high',
        reason: 'test',
        evidence: { variantNodeId: 'n2' },
      },
      {
        opId: 'op3',
        componentKey: 'C',
        targetState: 'base',
        property: 'fill',
        to: '#CCC',
        target: 'blocked',
        confidence: 'high',
        reason: 'test',
        evidence: { variantNodeId: 'n3' },
      },
    ];

    const results: OpApplyResult[] = [
      { opId: 'op1', applied: true, skipped: false, appliedTarget: 'override' },
      { opId: 'op2', applied: false, skipped: true, skipReason: 'Dry-run mode' },
      { opId: 'op3', applied: false, skipped: true, skipReason: 'Blocked by policy' },
    ];

    const summary = buildApplySummary(ops, results);

    expect(summary.total).toBe(3);
    expect(summary.applied.total).toBe(1);
    expect(summary.applied.override).toBe(1);
    expect(summary.skipped.total).toBe(2);
    expect(summary.skipped.dryRun).toBe(1);
    expect(summary.skipped.blocked).toBe(1);
  });
});

// =============================================================================
// ARTIFACT TESTS
// =============================================================================

describe('artifact functions', () => {
  describe('getDeltaApplyArtifactPath', () => {
    it('generates correct path', () => {
      const path = getDeltaApplyArtifactPath('demo-app/src/App.tsx');
      expect(path).toBe('design-materializations/demo-app__src__App.figma-delta-apply.json');
    });
  });

  describe('buildDeltaApplyArtifact', () => {
    it('builds deterministic artifact', () => {
      const ops: DeltaApplyOp[] = [
        {
          opId: 'op1',
          componentKey: 'A',
          targetState: 'base',
          property: 'fill',
          to: '#FFF',
          target: 'override',
          confidence: 'high',
          reason: 'test',
          evidence: { variantNodeId: 'n1' },
        },
      ];

      const results: OpApplyResult[] = [
        { opId: 'op1', applied: true, skipped: false, appliedTarget: 'override' },
      ];

      const summary = buildApplySummary(ops, results);

      const artifact = buildDeltaApplyArtifact(
        'demo-app/src/App.tsx',
        'artifact',
        true,
        ops,
        results,
        [],
        summary
      );

      expect(artifact.version).toBe('1.0');
      expect(artifact.source).toBe('figma-delta-apply');
      expect(artifact.sourceFile).toBe('demo-app/src/App.tsx');
      expect(artifact.mode).toBe('artifact');
      expect(artifact.dryRun).toBe(true);
      expect(artifact.ops).toHaveLength(1);
      expect(artifact.results).toHaveLength(1);
      expect(artifact.summary.applied.total).toBe(1);
    });
  });
});
