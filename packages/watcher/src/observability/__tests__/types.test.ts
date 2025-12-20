/**
 * @aesthetic-function/watcher - observability/__tests__/types.test.ts
 *
 * Tests for TraceSummary types and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  createTraceSummary,
  addTraceError,
  hashOperations,
  type SuppressionEntry,
} from '../types.js';

describe('createTraceSummary', () => {
  it('creates a TraceSummary with defaults', () => {
    const trace = createTraceSummary('req-123', 'watcher');

    expect(trace.requestId).toBe('req-123');
    expect(trace.source).toBe('watcher');
    expect(trace.parseMode).toBe('unknown');
    expect(trace.intentsCount).toBe(0);
    expect(trace.opsCount).toBe(0);
    expect(trace.resolution).toBeDefined();
    expect(trace.resolution.appliedOverrides).toBe(0);
    expect(trace.resolution.usedComponentMap).toBe(false);
    expect(trace.emit.enabled).toBe(false);
    expect(trace.emit.sent).toBe(false);
    expect(trace.errors).toBeUndefined();
  });

  it('allows setting additional properties', () => {
    const trace = createTraceSummary('req-456', 'feature-orchestrator');
    trace.filePath = 'src/App.tsx';
    trace.componentKey = 'Card';
    trace.state = 'hover';
    trace.parseMode = 'markers';
    trace.intentsCount = 3;
    trace.opsCount = 5;

    expect(trace.filePath).toBe('src/App.tsx');
    expect(trace.componentKey).toBe('Card');
    expect(trace.state).toBe('hover');
    expect(trace.parseMode).toBe('markers');
    expect(trace.intentsCount).toBe(3);
    expect(trace.opsCount).toBe(5);
  });
});

describe('addTraceError', () => {
  it('adds first error to trace', () => {
    const trace = createTraceSummary('req-123', 'watcher');
    addTraceError(trace, 'parse', 'Invalid marker syntax');

    expect(trace.errors).toHaveLength(1);
    expect(trace.errors![0]).toEqual({
      stage: 'parse',
      message: 'Invalid marker syntax',
    });
  });

  it('adds multiple errors to trace', () => {
    const trace = createTraceSummary('req-123', 'watcher');
    addTraceError(trace, 'parse', 'Error 1');
    addTraceError(trace, 'transform', 'Error 2');
    addTraceError(trace, 'emit', 'Error 3');

    expect(trace.errors).toHaveLength(3);
    expect(trace.errors![0].stage).toBe('parse');
    expect(trace.errors![1].stage).toBe('transform');
    expect(trace.errors![2].stage).toBe('emit');
  });
});

describe('hashOperations', () => {
  it('generates consistent hash for same operations', () => {
    const ops = [
      { nodeQuery: 'Card', op: 'setFill', color: '#FF0000' },
      { nodeQuery: 'Button', op: 'setText', text: 'Click' },
    ];

    const hash1 = hashOperations(ops);
    const hash2 = hashOperations(ops);

    expect(hash1).toBe(hash2);
  });

  it('generates different hash for different operations', () => {
    const ops1 = [{ nodeQuery: 'Card', op: 'setFill', color: '#FF0000' }];
    const ops2 = [{ nodeQuery: 'Card', op: 'setFill', color: '#00FF00' }];

    const hash1 = hashOperations(ops1);
    const hash2 = hashOperations(ops2);

    expect(hash1).not.toBe(hash2);
  });

  it('generates same hash regardless of order', () => {
    const ops1 = [
      { nodeQuery: 'Card', op: 'setFill', color: '#FF0000' },
      { nodeQuery: 'Button', op: 'setText', text: 'Click' },
    ];
    const ops2 = [
      { nodeQuery: 'Button', op: 'setText', text: 'Click' },
      { nodeQuery: 'Card', op: 'setFill', color: '#FF0000' },
    ];

    const hash1 = hashOperations(ops1);
    const hash2 = hashOperations(ops2);

    expect(hash1).toBe(hash2);
  });

  it('handles empty operations array', () => {
    const hash = hashOperations([]);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  it('handles operations with missing fields', () => {
    const ops = [
      { nodeQuery: 'Card' },
      { op: 'setFill' },
      {},
    ];

    const hash = hashOperations(ops);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  it('returns hex string', () => {
    const ops = [{ nodeQuery: 'Card', op: 'setFill', color: '#FF0000' }];
    const hash = hashOperations(ops);

    expect(hash).toMatch(/^-?[0-9a-f]+$/i);
  });
});

describe('TraceSummary type', () => {
  it('allows common source values', () => {
    const sources = ['watcher', 'feature-orchestrator', 'post-apply-emit', 'feature-emit-marker', 'feature-emit-llm'];
    
    for (const source of sources) {
      const trace = createTraceSummary('req-123', source);
      expect(trace.source).toBe(source);
    }
  });

  it('supports all resolution fields', () => {
    const trace = createTraceSummary('req-123', 'watcher');
    trace.resolution.policy = 'if_newer_than_code';
    trace.resolution.countsBySource = { override: 2, marker: 3 };
    trace.resolution.appliedOverrides = 2;
    trace.resolution.staleOverrides = 1;
    trace.resolution.ignoredOverrides = 0;
    trace.resolution.usedComponentMap = true;
    trace.resolution.mappedOps = 4;

    expect(trace.resolution.policy).toBe('if_newer_than_code');
    expect(trace.resolution.countsBySource.override).toBe(2);
    expect(trace.resolution.usedComponentMap).toBe(true);
  });

  it('supports all emit fields', () => {
    const trace = createTraceSummary('req-123', 'watcher');
    trace.emit.enabled = true;
    trace.emit.sent = true;
    trace.emit.transport = 'ws';
    trace.emit.clientsNotified = 2;
    trace.emit.suppressedWatcherEmit = true;

    expect(trace.emit.enabled).toBe(true);
    expect(trace.emit.sent).toBe(true);
    expect(trace.emit.transport).toBe('ws');
    expect(trace.emit.clientsNotified).toBe(2);
    expect(trace.emit.suppressedWatcherEmit).toBe(true);
  });
});

describe('SuppressionEntry type', () => {
  it('has required fields', () => {
    const entry: SuppressionEntry = {
      timestamp: Date.now(),
      opsHash: 'abc123',
      requestIdPrefix: 'feature-emit',
    };

    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.opsHash).toBe('abc123');
    expect(entry.requestIdPrefix).toBe('feature-emit');
  });
});
