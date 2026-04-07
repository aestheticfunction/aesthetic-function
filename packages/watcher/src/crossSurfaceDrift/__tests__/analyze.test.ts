/**
 * @aesthetic-function/watcher - crossSurfaceDrift/__tests__/analyze.test.ts
 *
 * Phase 16C: Tests for cross-surface drift analysis engine.
 */

import { describe, it, expect } from 'vitest';
import { analyzeCrossSurfaceDrift } from '../analyze.js';
import type { CodeSurfaceData } from '../analyze.js';
import type { NormalizedDesignComponent } from '../../designAdapter/types.js';
import type { StorybookComponentMeta } from '@aesthetic-function/shared/storybookAdapter';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeFigmaComponent(overrides?: Partial<NormalizedDesignComponent>): NormalizedDesignComponent {
  return {
    name: 'Button',
    nodeId: 'figma:1:100',
    type: 'component',
    properties: {},
    unmappedProperties: [],
    variants: [
      { name: 'Primary', nodeId: '1:101', state: 'primary' },
      { name: 'Secondary', nodeId: '1:102', state: 'secondary' },
    ],
    ...overrides,
  };
}

function makeStorybookComponent(overrides?: Partial<StorybookComponentMeta>): StorybookComponentMeta {
  return {
    name: 'Button',
    id: 'button',
    props: [
      { name: 'variant', type: "'primary' | 'secondary' | 'ghost'", required: false },
      { name: 'size', type: "'small' | 'medium' | 'large'", required: false },
      { name: 'children', type: 'ReactNode', required: true },
    ],
    stories: [
      { id: 'button--primary', name: 'Primary', variantAxes: { variant: 'primary' } },
      { id: 'button--secondary', name: 'Secondary', variantAxes: { variant: 'secondary' } },
      { id: 'button--ghost', name: 'Ghost', variantAxes: { variant: 'ghost' } },
    ],
    ...overrides,
  };
}

function makeCodeData(overrides?: Partial<CodeSurfaceData>): CodeSurfaceData {
  return {
    props: ['variant', 'size', 'children', 'onClick'],
    variants: ['primary', 'secondary', 'ghost'],
    ...overrides,
  };
}

// =============================================================================
// COMPONENT PRESENCE
// =============================================================================

describe('component presence', () => {
  it('no drift when component exists in all surfaces', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent(),
      makeStorybookComponent(),
      makeCodeData(),
    );
    // No component-level findings (presence OK)
    const presenceFindings = report.findings.filter(f => f.field === 'component');
    expect(presenceFindings).toHaveLength(0);
  });

  it('reports missing-in-figma when component only in Storybook', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      null,
      makeStorybookComponent(),
      makeCodeData(),
    );
    const finding = report.findings.find(f => f.type === 'missing-in-figma' && f.field === 'component');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warn');
  });

  it('reports missing-in-storybook when component only in Figma', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent(),
      null,
      makeCodeData(),
    );
    const finding = report.findings.find(f => f.type === 'missing-in-storybook' && f.field === 'component');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });
});

// =============================================================================
// PROP INVENTORY
// =============================================================================

describe('prop inventory', () => {
  it('detects props missing from Figma', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent({ properties: {} }),
      makeStorybookComponent(),
      null,
    );
    const propFindings = report.findings.filter(f => f.field.startsWith('prop:'));
    expect(propFindings.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// VARIANT COVERAGE
// =============================================================================

describe('variant coverage', () => {
  it('detects Figma missing a variant that Storybook has', () => {
    // Figma has Primary and Secondary, Storybook has Primary, Secondary, Ghost
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent(),
      makeStorybookComponent(),
      makeCodeData(),
    );
    const ghostFinding = report.findings.find(
      f => f.field.includes('ghost') && f.type === 'missing-in-figma',
    );
    expect(ghostFinding).toBeDefined();
    expect(ghostFinding!.severity).toBe('warn');
    expect(ghostFinding!.storyRef).toBe('button--ghost');
  });

  it('no variant drift when all surfaces match', () => {
    const figma = makeFigmaComponent({
      variants: [
        { name: 'Primary', nodeId: '1:101', state: 'primary' },
        { name: 'Secondary', nodeId: '1:102', state: 'secondary' },
        { name: 'Ghost', nodeId: '1:103', state: 'ghost' },
      ],
    });
    const report = analyzeCrossSurfaceDrift(
      'Button',
      figma,
      makeStorybookComponent(),
      makeCodeData(),
    );
    const variantDrift = report.findings.filter(
      f => f.field.startsWith('variant:') && f.type === 'missing-in-figma',
    );
    expect(variantDrift).toHaveLength(0);
  });
});

// =============================================================================
// CORROBORATION
// =============================================================================

describe('corroboration rules', () => {
  it('high confidence when variant value exists in constrained union type', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent({ variants: [] }),
      makeStorybookComponent({
        props: [{ name: 'size', type: "'small' | 'medium' | 'large'", required: false }],
        stories: [{ id: 'button--large', name: 'Large', variantAxes: { size: 'large' } }],
      }),
      null,
    );
    const finding = report.findings.find(f => f.field.includes('size') && f.field.includes('large'));
    expect(finding).toBeDefined();
    expect(finding!.confidence).toBe('high');
  });

  it('low confidence when prop type is unconstrained (string)', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent({ variants: [] }),
      makeStorybookComponent({
        props: [{ name: 'label', type: 'string', required: false }],
        stories: [{ id: 'button--hello', name: 'Hello', variantAxes: { label: 'hello' } }],
      }),
      null,
    );
    // Find the variant-specific finding (not the prop inventory finding)
    const finding = report.findings.find(f => f.field.includes('variant:') && f.field.includes('label'));
    expect(finding).toBeDefined();
    expect(finding!.confidence).toBe('low');
  });

  it('uncorroborated variants excluded by default', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent({ variants: [] }),
      makeStorybookComponent({
        props: [],
        stories: [{ id: 'button--loading', name: 'Loading', variantAxes: { state: 'loading' } }],
      }),
      null,
    );
    const loadingFinding = report.findings.find(f => f.field.includes('loading'));
    expect(loadingFinding).toBeUndefined();
  });

  it('uncorroborated variants included with includeUncorroborated option', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent({ variants: [] }),
      makeStorybookComponent({
        props: [],
        stories: [{ id: 'button--loading', name: 'Loading', variantAxes: { state: 'loading' } }],
      }),
      null,
      { includeUncorroborated: true },
    );
    const loadingFinding = report.findings.find(f => f.field.includes('loading'));
    expect(loadingFinding).toBeDefined();
    expect(loadingFinding!.severity).toBe('info');
    expect(loadingFinding!.confidence).toBe('low');
  });
});

// =============================================================================
// SEVERITY AGGREGATION
// =============================================================================

describe('severity aggregation', () => {
  it('severity is "none" when no findings', () => {
    const report = analyzeCrossSurfaceDrift('Button', null, null, null);
    expect(report.severity).toBe('none');
  });

  it('severity is highest finding severity', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent(),
      makeStorybookComponent(),
      makeCodeData(),
    );
    // Should have at least warn-level findings (missing ghost variant in Figma)
    expect(['warn', 'fail']).toContain(report.severity);
  });
});

// =============================================================================
// REPORT METADATA
// =============================================================================

describe('report metadata', () => {
  it('includes component name and timestamp', () => {
    const report = analyzeCrossSurfaceDrift('Button', null, makeStorybookComponent(), null);
    expect(report.componentName).toBe('Button');
    expect(report.analyzedAt).toBeTruthy();
    expect(new Date(report.analyzedAt).getTime()).not.toBeNaN();
  });

  it('includes surface snapshots for available surfaces', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button',
      makeFigmaComponent(),
      makeStorybookComponent(),
      null,
    );
    expect(report.surfaces.figma).toBeDefined();
    expect(report.surfaces.storybook).toBeDefined();
    expect(report.surfaces.code).toBeUndefined();
  });
});
