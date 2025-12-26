/**
 * @aesthetic-function/watcher - figmaDeltaResolution/__tests__/generateResolutionPlan.test.ts
 *
 * Phase 12E: Unit tests for conflict resolution plan generation.
 *
 * Tests verify:
 * 1. Base state auto-writable → APPLY_TO_AST
 * 2. Hover state marker present → APPLY_TO_MARKER
 * 3. Hover state override present → APPLY_TO_OVERRIDE
 * 4. Hover state no explicit data → BLOCK
 * 5. Low confidence → BLOCK
 * 6. Canonical mismatch → IGNORE
 * 7. Mixed conflict set → correct summary counts
 * 8. Deterministic ordering of decisions
 *
 * NO demo-app reads. Fixtures only.
 */

import { describe, it, expect } from 'vitest';
import { generateResolutionPlan } from '../generateResolutionPlan.js';
import {
  getResolutionArtifactPath,
  buildResolutionArtifact,
} from '../artifact.js';
import type { ConflictReport, ConflictItem } from '../../figmaDelta/conflicts/types.js';
import type { ResolutionPlan, ResolutionDecision } from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Build a minimal conflict item for testing.
 */
function buildConflictItem(
  overrides: Partial<ConflictItem>
): ConflictItem {
  return {
    componentKey: 'TestButton',
    targetState: 'base',
    property: 'fill',
    conflictType: 'AST_VS_FIGMA',
    figma: { source: 'figma', value: '#FF0000' },
    existing: { source: 'ast', value: '#0000FF' },
    suggestedTarget: 'ast',
    wouldApply: true,
    reason: 'Base state with auto-writable literal',
    policyRule: 'auto-writable-literal',
    ...overrides,
  };
}

/**
 * Build a minimal conflict report for testing.
 */
function buildConflictReport(
  conflicts: ConflictItem[],
  filePath = 'demo-app/src/App.tsx'
): ConflictReport {
  // Compute summary
  const byTarget: Record<string, number> = { ast: 0, marker: 0, override: 0, none: 0 };
  const byType: Record<string, number> = {};
  let blocked = 0;
  let wouldApply = 0;

  for (const c of conflicts) {
    byTarget[c.suggestedTarget] = (byTarget[c.suggestedTarget] ?? 0) + 1;
    byType[c.conflictType] = (byType[c.conflictType] ?? 0) + 1;
    if (c.wouldApply) wouldApply++;
    else blocked++;
  }

  return {
    filePath,
    generatedAt: '2024-01-01T00:00:00.000Z',
    conflicts,
    summary: {
      total: conflicts.length,
      byTarget: byTarget as ConflictReport['summary']['byTarget'],
      byType: byType as ConflictReport['summary']['byType'],
      blocked,
      wouldApply,
    },
  };
}

// =============================================================================
// RESOLUTION ACTION TESTS
// =============================================================================

describe('generateResolutionPlan', () => {
  describe('resolution action mapping', () => {
    it('maps base state auto-writable literal to APPLY_TO_AST', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        policyRule: 'auto-writable-literal',
        suggestedTarget: 'ast',
        wouldApply: true,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions).toHaveLength(1);
      expect(plan.decisions[0].action).toBe('APPLY_TO_AST');
      expect(plan.decisions[0].reason).toContain('auto-writable');
    });

    it('maps existing marker update to APPLY_TO_MARKER', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        conflictType: 'MARKER_VS_FIGMA',
        policyRule: 'existing-marker-update',
        suggestedTarget: 'marker',
        existing: { source: 'marker', value: '#0000FF' },
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('APPLY_TO_MARKER');
    });

    it('maps hover state with marker to APPLY_TO_MARKER', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'hover',
        property: 'fill',
        policyRule: 'non-base-state-to-marker',
        suggestedTarget: 'marker',
        existing: { source: 'marker', value: '#0000FF' },
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('APPLY_TO_MARKER');
      expect(plan.decisions[0].reason).toContain('Non-base state');
      expect(plan.decisions[0].reason).toContain('hover');
    });

    it('maps hover state with override to APPLY_TO_OVERRIDE', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'hover',
        property: 'fill',
        policyRule: 'non-base-state-to-override',
        suggestedTarget: 'override',
        existing: { source: 'override', value: '#0000FF' },
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('APPLY_TO_OVERRIDE');
    });

    it('maps hover state with no explicit data to BLOCK', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'hover',
        property: 'fill',
        conflictType: 'NON_BASE_STATE_BLOCKED',
        policyRule: 'non-base-state-no-explicit-data',
        suggestedTarget: 'none',
        existing: undefined,
        wouldApply: false,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('BLOCK');
      expect(plan.decisions[0].reason).toContain('no explicit marker or override');
    });

    it('maps low confidence to BLOCK', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        conflictType: 'LOW_CONFIDENCE_BLOCKED',
        policyRule: 'low-confidence-blocked',
        suggestedTarget: 'none',
        wouldApply: false,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('BLOCK');
      expect(plan.decisions[0].reason).toContain('confidence too low');
    });

    it('maps canonical mismatch to IGNORE', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        conflictType: 'CANONICAL_MISMATCH',
        policyRule: 'canonical-mismatch',
        suggestedTarget: 'ast',
        wouldApply: false,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('IGNORE');
      expect(plan.decisions[0].reason).toContain('Canonical token mismatch');
    });

    it('maps override fallback to APPLY_TO_OVERRIDE', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        policyRule: 'override-fallback',
        suggestedTarget: 'override',
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('APPLY_TO_OVERRIDE');
    });

    it('maps non-base-state-refused to BLOCK', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'pressed',
        property: 'fill',
        policyRule: 'non-base-state-refused',
        suggestedTarget: 'ast',
        wouldApply: false,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('BLOCK');
    });

    it('maps blocked-no-target to BLOCK', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'base',
        property: 'fill',
        policyRule: 'blocked-no-target',
        suggestedTarget: 'none',
        wouldApply: false,
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions[0].action).toBe('BLOCK');
    });
  });

  describe('summary statistics', () => {
    it('computes correct counts for mixed conflict set', () => {
      const conflicts = [
        // APPLY_TO_AST
        buildConflictItem({
          componentKey: 'Button1',
          policyRule: 'auto-writable-literal',
        }),
        // APPLY_TO_MARKER
        buildConflictItem({
          componentKey: 'Button2',
          policyRule: 'existing-marker-update',
        }),
        // APPLY_TO_MARKER (hover)
        buildConflictItem({
          componentKey: 'Button3',
          targetState: 'hover',
          policyRule: 'non-base-state-to-marker',
        }),
        // APPLY_TO_OVERRIDE
        buildConflictItem({
          componentKey: 'Button4',
          policyRule: 'override-fallback',
        }),
        // BLOCK
        buildConflictItem({
          componentKey: 'Button5',
          targetState: 'hover',
          conflictType: 'NON_BASE_STATE_BLOCKED',
          policyRule: 'non-base-state-no-explicit-data',
          suggestedTarget: 'none',
          wouldApply: false,
        }),
        // IGNORE
        buildConflictItem({
          componentKey: 'Button6',
          conflictType: 'CANONICAL_MISMATCH',
          policyRule: 'canonical-mismatch',
          wouldApply: false,
        }),
      ];

      const report = buildConflictReport(conflicts);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions).toHaveLength(6);
      expect(plan.summary.applyAst).toBe(1);
      expect(plan.summary.applyMarker).toBe(2);
      expect(plan.summary.applyOverride).toBe(1);
      expect(plan.summary.blocked).toBe(1);
      expect(plan.summary.ignored).toBe(1);
    });

    it('handles empty conflict report', () => {
      const report = buildConflictReport([]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.decisions).toHaveLength(0);
      expect(plan.summary.applyAst).toBe(0);
      expect(plan.summary.applyMarker).toBe(0);
      expect(plan.summary.applyOverride).toBe(0);
      expect(plan.summary.ignored).toBe(0);
      expect(plan.summary.blocked).toBe(0);
    });
  });

  describe('decision structure', () => {
    it('includes all required fields in decision', () => {
      const conflict = buildConflictItem({
        componentKey: 'LoginButton',
        targetState: 'hover',
        property: 'gap',
        policyRule: 'non-base-state-to-marker',
      });

      const report = buildConflictReport([conflict]);
      const plan = generateResolutionPlan({ conflictReport: report });

      const decision = plan.decisions[0];
      expect(decision.componentKey).toBe('LoginButton');
      expect(decision.targetState).toBe('hover');
      expect(decision.property).toBe('gap');
      expect(decision.action).toBe('APPLY_TO_MARKER');
      expect(decision.reason).toBeDefined();
      expect(decision.sourceConflictId).toBe('LoginButton::hover::gap');
    });

    it('generates unique sourceConflictId', () => {
      const conflicts = [
        buildConflictItem({
          componentKey: 'Button',
          targetState: 'base',
          property: 'fill',
        }),
        buildConflictItem({
          componentKey: 'Button',
          targetState: 'hover',
          property: 'fill',
        }),
        buildConflictItem({
          componentKey: 'Button',
          targetState: 'base',
          property: 'gap',
        }),
      ];

      const report = buildConflictReport(conflicts);
      const plan = generateResolutionPlan({ conflictReport: report });

      const ids = plan.decisions.map((d) => d.sourceConflictId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
      expect(ids).toContain('Button::base::fill');
      expect(ids).toContain('Button::hover::fill');
      expect(ids).toContain('Button::base::gap');
    });
  });

  describe('deterministic ordering', () => {
    it('produces deterministically sorted decisions', () => {
      // Create conflicts in random order
      const conflicts = [
        buildConflictItem({ componentKey: 'Z', targetState: 'hover', property: 'gap' }),
        buildConflictItem({ componentKey: 'A', targetState: 'base', property: 'fill' }),
        buildConflictItem({ componentKey: 'M', targetState: 'pressed', property: 'padding' }),
        buildConflictItem({ componentKey: 'A', targetState: 'hover', property: 'fill' }),
      ];

      const report = buildConflictReport(conflicts);
      const plan = generateResolutionPlan({ conflictReport: report });

      // Verify sorted by sourceConflictId
      const ids = plan.decisions.map((d) => d.sourceConflictId);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    it('produces same output for multiple runs', () => {
      const conflicts = [
        buildConflictItem({ componentKey: 'B', property: 'gap' }),
        buildConflictItem({ componentKey: 'A', property: 'fill' }),
      ];

      const report = buildConflictReport(conflicts);
      
      const plan1 = generateResolutionPlan({ conflictReport: report });
      const plan2 = generateResolutionPlan({ conflictReport: report });

      // Strip generatedAt for comparison
      const strip = (p: ResolutionPlan) => ({
        ...p,
        generatedAt: '',
      });

      expect(strip(plan1)).toEqual(strip(plan2));
    });
  });

  describe('plan metadata', () => {
    it('includes version 1.0', () => {
      const report = buildConflictReport([]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.version).toBe('1.0');
    });

    it('includes source file from conflict report', () => {
      const report = buildConflictReport([], 'packages/demo/src/Button.tsx');
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.sourceFile).toBe('packages/demo/src/Button.tsx');
    });

    it('includes generated timestamp', () => {
      const report = buildConflictReport([]);
      const plan = generateResolutionPlan({ conflictReport: report });

      expect(plan.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

// =============================================================================
// ARTIFACT TESTS
// =============================================================================

describe('getResolutionArtifactPath', () => {
  it('converts file path to artifact path', () => {
    const path = getResolutionArtifactPath('demo-app/src/App.tsx');
    expect(path).toBe('design-materializations/demo-app__src__App.figma-resolution-plan.json');
  });

  it('handles nested paths', () => {
    const path = getResolutionArtifactPath('packages/watcher/src/components/Button.tsx');
    expect(path).toBe('design-materializations/packages__watcher__src__components__Button.figma-resolution-plan.json');
  });

  it('strips .tsx extension', () => {
    const path = getResolutionArtifactPath('src/Component.tsx');
    expect(path).toContain('Component.figma-resolution-plan.json');
    expect(path).not.toContain('.tsx');
  });

  it('strips .jsx extension', () => {
    const path = getResolutionArtifactPath('src/Component.jsx');
    expect(path).toContain('Component.figma-resolution-plan.json');
    expect(path).not.toContain('.jsx');
  });
});

describe('buildResolutionArtifact', () => {
  it('builds artifact with all required fields', () => {
    const plan: ResolutionPlan = {
      version: '1.0',
      sourceFile: 'demo-app/src/App.tsx',
      generatedAt: '2024-01-01T00:00:00.000Z',
      decisions: [],
      summary: {
        applyAst: 0,
        applyMarker: 0,
        applyOverride: 0,
        ignored: 0,
        blocked: 0,
      },
    };

    const artifact = buildResolutionArtifact(plan);

    expect(artifact).toHaveProperty('version', '1.0');
    expect(artifact).toHaveProperty('source', 'figma-resolution-plan');
    expect(artifact).toHaveProperty('generatedAt');
    expect(artifact).toHaveProperty('sourceFile');
    expect(artifact).toHaveProperty('summary');
    expect(artifact).toHaveProperty('decisions');
  });

  it('includes all decisions in artifact', () => {
    const decision: ResolutionDecision = {
      componentKey: 'Button',
      targetState: 'base',
      property: 'fill',
      action: 'APPLY_TO_AST',
      reason: 'Test reason',
      sourceConflictId: 'Button::base::fill',
    };

    const plan: ResolutionPlan = {
      version: '1.0',
      sourceFile: 'test.tsx',
      generatedAt: '2024-01-01T00:00:00.000Z',
      decisions: [decision],
      summary: {
        applyAst: 1,
        applyMarker: 0,
        applyOverride: 0,
        ignored: 0,
        blocked: 0,
      },
    };

    const artifact = buildResolutionArtifact(plan) as { decisions: ResolutionDecision[] };

    expect(artifact.decisions).toHaveLength(1);
    expect(artifact.decisions[0]).toEqual(decision);
  });
});
