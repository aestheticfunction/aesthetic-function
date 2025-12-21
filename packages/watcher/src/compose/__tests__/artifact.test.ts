/**
 * @aesthetic-function/watcher - compose/__tests__/artifact.test.ts
 *
 * Unit tests for Phase 11B artifact generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateBaseName,
  buildComposeArtifact,
  updateArtifactWithResults,
} from '../artifact.js';
import type { ComposeResult } from '../types.js';

describe('generateBaseName', () => {
  it('handles simple file path', () => {
    const result = generateBaseName('App.tsx');
    expect(result).toBe('App');
  });

  it('handles nested path with slashes', () => {
    const result = generateBaseName('demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App');
  });

  it('handles path with backslashes', () => {
    const result = generateBaseName('demo-app\\src\\App.tsx');
    expect(result).toBe('demo-app__src__App');
  });

  it('removes leading slashes', () => {
    const result = generateBaseName('/demo-app/src/App.tsx');
    expect(result).toBe('demo-app__src__App');
  });

  it('handles .jsx extension', () => {
    const result = generateBaseName('components/Button.jsx');
    expect(result).toBe('components__Button');
  });

  it('handles .ts extension', () => {
    const result = generateBaseName('utils/helpers.ts');
    expect(result).toBe('utils__helpers');
  });

  it('handles .js extension', () => {
    const result = generateBaseName('lib/utils.js');
    expect(result).toBe('lib__utils');
  });
});

describe('buildComposeArtifact', () => {
  const mockResult: ComposeResult = {
    operations: [
      {
        opId: 'abc123',
        type: 'ENSURE_COMPONENT_SET',
        componentKey: 'Button',
        figmaName: 'Button',
        payload: { componentKey: 'Button', figmaName: 'Button' },
        reason: 'Create component set',
        source: 'figma-suggestions',
      },
    ],
    filtered: [],
    countByType: { ENSURE_COMPONENT_SET: 1 },
    totalGenerated: 1,
    totalAllowed: 1,
    mode: 'dry-run',
  };

  it('builds artifact with correct structure', () => {
    const artifact = buildComposeArtifact(mockResult, 'dry-run');

    expect(artifact.version).toBe('1.0');
    expect(artifact.source).toBe('figma-suggestions');
    expect(artifact.mode).toBe('dry-run');
    expect(artifact.operations).toHaveLength(1);
    expect(artifact.timestamp).toBeDefined();
    expect(artifact.results).toBeUndefined();
  });

  it('sets mode to apply when apply mode passed', () => {
    const artifact = buildComposeArtifact(mockResult, 'apply');
    expect(artifact.mode).toBe('apply');
  });

  it('defaults to dry-run for off mode', () => {
    const artifact = buildComposeArtifact({ ...mockResult, mode: 'off' }, 'off');
    expect(artifact.mode).toBe('dry-run');
  });

  it('includes all operations', () => {
    const multiOpResult: ComposeResult = {
      ...mockResult,
      operations: [
        mockResult.operations[0],
        {
          opId: 'def456',
          type: 'ENSURE_VARIANT',
          componentKey: 'Button',
          figmaName: 'Button',
          payload: {
            componentKey: 'Button',
            componentSetName: 'Button',
            variantProps: { state: 'hover' },
          },
          reason: 'Add hover variant',
          source: 'figma-suggestions',
        },
      ],
    };

    const artifact = buildComposeArtifact(multiOpResult, 'dry-run');
    expect(artifact.operations).toHaveLength(2);
  });
});

describe('updateArtifactWithResults', () => {
  it('adds results to artifact', () => {
    const artifact = {
      version: '1.0' as const,
      timestamp: '2024-01-01T00:00:00Z',
      source: 'figma-suggestions' as const,
      mode: 'apply' as const,
      operations: [
        {
          opId: 'abc123',
          type: 'ENSURE_COMPONENT_SET' as const,
          componentKey: 'Button',
          figmaName: 'Button',
          payload: { componentKey: 'Button', figmaName: 'Button' },
          reason: 'Create',
          source: 'figma-suggestions',
        },
      ],
    };

    const results = [
      {
        opId: 'abc123',
        success: true,
        nodeId: 'figma-node-123',
        existed: false,
      },
    ];

    const updated = updateArtifactWithResults(artifact, results);
    expect(updated.results).toEqual(results);
    expect(updated.operations).toEqual(artifact.operations);
    expect(updated.mode).toBe('apply');
  });

  it('preserves original artifact immutably', () => {
    const artifact = {
      version: '1.0' as const,
      timestamp: '2024-01-01T00:00:00Z',
      source: 'figma-suggestions' as const,
      mode: 'apply' as const,
      operations: [],
    };

    const updated = updateArtifactWithResults(artifact, []);
    expect(updated).not.toBe(artifact);
    expect(updated.results).toEqual([]);
  });
});
