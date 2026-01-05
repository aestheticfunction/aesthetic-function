/**
 * @aesthetic-function/watcher - reconciliationSources/__tests__/aggregate.test.ts
 *
 * Phase 14F: Tests for verdict aggregation logic.
 */

import { describe, it, expect } from 'vitest';

import {
  aggregateVerdicts,
  parseVerdict,
  createSourceResult,
  formatAggregationSummary,
  verdictToExitCode,
} from '../aggregate.js';
import type { SourceResult } from '../types.js';

// =============================================================================
// AGGREGATION TESTS
// =============================================================================

describe('aggregateVerdicts', () => {
  describe('basic reduction', () => {
    it('returns PASS for empty results', () => {
      const result = aggregateVerdicts([]);
      expect(result.overall).toBe('PASS');
      expect(result.totalSources).toBe(0);
    });

    it('returns PASS when all sources pass', () => {
      const results: SourceResult[] = [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'b.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'c.tsx', verdict: 'PASS', exitCode: 0 },
      ];

      const result = aggregateVerdicts(results);
      expect(result.overall).toBe('PASS');
      expect(result.counts.pass).toBe(3);
    });

    it('returns WARN when any source warns (no fails)', () => {
      const results: SourceResult[] = [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'b.tsx', verdict: 'WARN', exitCode: 0 },
        { source: 'c.tsx', verdict: 'PASS', exitCode: 0 },
      ];

      const result = aggregateVerdicts(results);
      expect(result.overall).toBe('WARN');
      expect(result.counts.warn).toBe(1);
    });

    it('returns FAIL when any source fails', () => {
      const results: SourceResult[] = [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'b.tsx', verdict: 'WARN', exitCode: 0 },
        { source: 'c.tsx', verdict: 'FAIL', exitCode: 1 },
      ];

      const result = aggregateVerdicts(results);
      expect(result.overall).toBe('FAIL');
      expect(result.counts.fail).toBe(1);
    });
  });

  describe('counts', () => {
    it('counts all verdict types correctly', () => {
      const results: SourceResult[] = [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'b.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'c.tsx', verdict: 'WARN', exitCode: 0 },
        { source: 'd.tsx', verdict: 'WARN', exitCode: 0 },
        { source: 'e.tsx', verdict: 'WARN', exitCode: 0 },
        { source: 'f.tsx', verdict: 'FAIL', exitCode: 1 },
      ];

      const result = aggregateVerdicts(results);
      expect(result.counts.pass).toBe(2);
      expect(result.counts.warn).toBe(3);
      expect(result.counts.fail).toBe(1);
      expect(result.totalSources).toBe(6);
    });
  });

  describe('metadata', () => {
    it('includes gitSha when provided', () => {
      const result = aggregateVerdicts([], 'abc123');
      expect(result.gitSha).toBe('abc123');
    });

    it('includes all source results', () => {
      const results: SourceResult[] = [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0, bundlePath: '/path/to/a' },
      ];

      const result = aggregateVerdicts(results);
      expect(result.results).toEqual(results);
    });
  });
});

describe('parseVerdict', () => {
  it('parses PASS', () => {
    expect(parseVerdict('PASS')).toBe('PASS');
    expect(parseVerdict('pass')).toBe('PASS');
    expect(parseVerdict('Pass')).toBe('PASS');
  });

  it('parses WARN', () => {
    expect(parseVerdict('WARN')).toBe('WARN');
    expect(parseVerdict('warn')).toBe('WARN');
  });

  it('parses FAIL', () => {
    expect(parseVerdict('FAIL')).toBe('FAIL');
    expect(parseVerdict('fail')).toBe('FAIL');
  });

  it('returns null for invalid values', () => {
    expect(parseVerdict('invalid')).toBeNull();
    expect(parseVerdict('')).toBeNull();
  });
});

describe('createSourceResult', () => {
  it('creates result with all fields', () => {
    const result = createSourceResult('src/App.tsx', 'PASS', 0, '/artifacts/App');

    expect(result).toEqual({
      source: 'src/App.tsx',
      verdict: 'PASS',
      exitCode: 0,
      bundlePath: '/artifacts/App',
    });
  });

  it('creates result with default exit code', () => {
    const result = createSourceResult('src/Bad.tsx', 'FAIL');

    expect(result.exitCode).toBe(1);
  });
});

describe('formatAggregationSummary', () => {
  it('formats summary with all fields', () => {
    const aggregated = aggregateVerdicts(
      [
        { source: 'a.tsx', verdict: 'PASS', exitCode: 0 },
        { source: 'b.tsx', verdict: 'WARN', exitCode: 0 },
      ],
      'abc123'
    );

    const summary = formatAggregationSummary(aggregated);

    expect(summary).toContain('Overall: WARN');
    expect(summary).toContain('Total Sources: 2');
    expect(summary).toContain('PASS: 1');
    expect(summary).toContain('WARN: 1');
    expect(summary).toContain('Git SHA: abc123');
  });
});

describe('verdictToExitCode', () => {
  it('returns 0 for PASS', () => {
    expect(verdictToExitCode('PASS')).toBe(0);
  });

  it('returns 0 for WARN (warnings do not fail CI)', () => {
    expect(verdictToExitCode('WARN')).toBe(0);
  });

  it('returns 1 for FAIL', () => {
    expect(verdictToExitCode('FAIL')).toBe(1);
  });
});
