/**
 * @aesthetic-function/watcher - figmaDelta/__tests__/artifact.test.ts
 *
 * Unit tests for Phase 12A delta artifact generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateDeltaArtifactName,
  buildDeltaArtifact,
  buildDeltaArtifacts,
  buildCombinedArtifact,
} from '../artifact.js';
import type { DeltaOutput, BatchDeltaOutput, FigmaDelta } from '../types.js';

// =============================================================================
// FIXTURES
// =============================================================================

function createDeltaOutput(overrides: Partial<DeltaOutput> = {}): DeltaOutput {
  return {
    componentKey: 'LoginButton',
    state: 'hover',
    nodeId: '23:28',
    deltas: [
      {
        property: 'fill',
        from: '#2563EB',
        to: '#10B981',
        canonicalFrom: 'color.secondary',
        canonicalTo: 'color.success',
        confidence: 'high',
        reason: 'Explicit change in Figma hover variant',
      },
    ],
    unchangedProperties: ['padding', 'gap'],
    meta: {
      propertiesChecked: 3,
      deltasDetected: 1,
      canonicalResolved: 1,
      normalizationNotes: 0,
    },
    ...overrides,
  };
}

function createBatchOutput(overrides: Partial<BatchDeltaOutput> = {}): BatchDeltaOutput {
  return {
    sourceFile: 'demo-app/src/App.tsx',
    results: [createDeltaOutput()],
    summary: {
      totalVariants: 1,
      variantsWithDeltas: 1,
      totalDeltas: 1,
      deltasByProperty: {
        fill: 1,
        textColor: 0,
        padding: 0,
        gap: 0,
        width: 0,
        height: 0,
        fontSize: 0,
        fontWeight: 0,
      },
      deltasByConfidence: {
        high: 1,
        medium: 0,
        low: 0,
      },
    },
    ...overrides,
  };
}

// =============================================================================
// FILENAME GENERATION
// =============================================================================

describe('generateDeltaArtifactName', () => {
  it('converts path separators to double underscores', () => {
    const result = generateDeltaArtifactName('demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App.figma-delta.json');
  });

  it('removes .tsx extension', () => {
    const result = generateDeltaArtifactName('src/Button.tsx');
    expect(result).toBe('src__Button.figma-delta.json');
  });

  it('removes .ts extension', () => {
    const result = generateDeltaArtifactName('src/Button.ts');
    expect(result).toBe('src__Button.figma-delta.json');
  });

  it('removes .jsx extension', () => {
    const result = generateDeltaArtifactName('src/Button.jsx');
    expect(result).toBe('src__Button.figma-delta.json');
  });

  it('removes leading ./ or /', () => {
    expect(generateDeltaArtifactName('./src/App.tsx')).toBe('src__App.figma-delta.json');
    expect(generateDeltaArtifactName('/src/App.tsx')).toBe('src__App.figma-delta.json');
  });
});

// =============================================================================
// ARTIFACT BUILDING
// =============================================================================

describe('buildDeltaArtifact', () => {
  it('builds artifact with correct structure', () => {
    const output = createDeltaOutput();
    const artifact = buildDeltaArtifact(output);

    expect(artifact.version).toBe('1.0');
    expect(artifact.source).toBe('figma');
    expect(artifact.componentKey).toBe('LoginButton');
    expect(artifact.state).toBe('hover');
    expect(artifact.nodeId).toBe('23:28');
    expect(artifact.deltas).toHaveLength(1);
    expect(artifact.timestamp).toBeDefined();
  });

  it('preserves delta details', () => {
    const output = createDeltaOutput();
    const artifact = buildDeltaArtifact(output);

    const delta = artifact.deltas[0];
    expect(delta.property).toBe('fill');
    expect(delta.from).toBe('#2563EB');
    expect(delta.to).toBe('#10B981');
    expect(delta.canonicalFrom).toBe('color.secondary');
    expect(delta.canonicalTo).toBe('color.success');
    expect(delta.confidence).toBe('high');
  });

  it('includes metadata', () => {
    const output = createDeltaOutput();
    const artifact = buildDeltaArtifact(output);

    expect(artifact.meta.propertiesChecked).toBe(3);
    expect(artifact.meta.deltasDetected).toBe(1);
    expect(artifact.meta.canonicalResolved).toBe(1);
  });
});

describe('buildDeltaArtifacts', () => {
  it('builds artifacts only for variants with deltas', () => {
    const batchOutput: BatchDeltaOutput = {
      sourceFile: 'test.tsx',
      results: [
        createDeltaOutput(), // Has deltas
        createDeltaOutput({ deltas: [], unchangedProperties: ['fill'] }), // No deltas
      ],
      summary: {
        totalVariants: 2,
        variantsWithDeltas: 1,
        totalDeltas: 1,
        deltasByProperty: { fill: 1, textColor: 0, padding: 0, gap: 0, width: 0, height: 0, fontSize: 0, fontWeight: 0 },
        deltasByConfidence: { high: 1, medium: 0, low: 0 },
      },
    };

    const artifacts = buildDeltaArtifacts(batchOutput);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].componentKey).toBe('LoginButton');
  });

  it('returns empty array when no deltas', () => {
    const batchOutput: BatchDeltaOutput = {
      sourceFile: 'test.tsx',
      results: [createDeltaOutput({ deltas: [] })],
      summary: {
        totalVariants: 1,
        variantsWithDeltas: 0,
        totalDeltas: 0,
        deltasByProperty: { fill: 0, textColor: 0, padding: 0, gap: 0, width: 0, height: 0, fontSize: 0, fontWeight: 0 },
        deltasByConfidence: { high: 0, medium: 0, low: 0 },
      },
    };

    const artifacts = buildDeltaArtifacts(batchOutput);

    expect(artifacts).toHaveLength(0);
  });
});

describe('buildCombinedArtifact', () => {
  it('builds combined artifact with all variants', () => {
    const batchOutput = createBatchOutput();
    const artifact = buildCombinedArtifact(batchOutput);

    expect(artifact.version).toBe('1.0');
    expect(artifact.source).toBe('figma');
    expect(artifact.sourceFile).toBe('demo-app/src/App.tsx');
    expect(artifact.variants).toHaveLength(1);
    expect(artifact.summary.totalVariants).toBe(1);
    expect(artifact.summary.variantsWithDeltas).toBe(1);
    expect(artifact.summary.totalDeltas).toBe(1);
  });

  it('excludes variants without deltas from variants array', () => {
    const batchOutput: BatchDeltaOutput = {
      sourceFile: 'test.tsx',
      results: [
        createDeltaOutput(), // Has deltas
        createDeltaOutput({ componentKey: 'Other', deltas: [] }), // No deltas
      ],
      summary: {
        totalVariants: 2,
        variantsWithDeltas: 1,
        totalDeltas: 1,
        deltasByProperty: { fill: 1, textColor: 0, padding: 0, gap: 0, width: 0, height: 0, fontSize: 0, fontWeight: 0 },
        deltasByConfidence: { high: 1, medium: 0, low: 0 },
      },
    };

    const artifact = buildCombinedArtifact(batchOutput);

    expect(artifact.variants).toHaveLength(1);
    expect(artifact.summary.totalVariants).toBe(2); // Preserves total count
  });
});

// =============================================================================
// DELTA PRESERVATION
// =============================================================================

describe('delta preservation', () => {
  it('preserves raw values even without canonical', () => {
    const output = createDeltaOutput({
      deltas: [
        {
          property: 'fill',
          from: '#AABBCC',
          to: '#DDEEFF',
          // No canonicalFrom or canonicalTo
          confidence: 'low',
          reason: 'Unknown mapping',
          normalizationNote: 'Could not map values to canonical tokens',
        },
      ],
    });

    const artifact = buildDeltaArtifact(output);
    const delta = artifact.deltas[0];

    expect(delta.from).toBe('#AABBCC');
    expect(delta.to).toBe('#DDEEFF');
    expect(delta.canonicalFrom).toBeUndefined();
    expect(delta.canonicalTo).toBeUndefined();
    expect(delta.normalizationNote).toBeDefined();
  });

  it('preserves both canonical and raw values', () => {
    const output = createDeltaOutput();
    const artifact = buildDeltaArtifact(output);
    const delta = artifact.deltas[0];

    // Raw values
    expect(delta.from).toBe('#2563EB');
    expect(delta.to).toBe('#10B981');

    // Canonical values
    expect(delta.canonicalFrom).toBe('color.secondary');
    expect(delta.canonicalTo).toBe('color.success');
  });

  it('preserves confidence levels', () => {
    const highConfidenceDelta: FigmaDelta = {
      property: 'fill',
      from: '#2563EB',
      to: '#10B981',
      confidence: 'high',
      reason: 'Explicit change',
    };
    const mediumConfidenceDelta: FigmaDelta = {
      property: 'padding',
      from: 16,
      to: 24,
      confidence: 'medium',
      reason: 'Bound value',
    };
    const lowConfidenceDelta: FigmaDelta = {
      property: 'gap',
      from: 8,
      to: 12,
      confidence: 'low',
      reason: 'Unknown mapping',
    };

    const output = createDeltaOutput({
      deltas: [highConfidenceDelta, mediumConfidenceDelta, lowConfidenceDelta],
    });
    const artifact = buildDeltaArtifact(output);

    expect(artifact.deltas[0].confidence).toBe('high');
    expect(artifact.deltas[1].confidence).toBe('medium');
    expect(artifact.deltas[2].confidence).toBe('low');
  });
});
