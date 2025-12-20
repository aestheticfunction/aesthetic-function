/**
 * @aesthetic-function/watcher - canonicalResolver/__tests__/resolve.test.ts
 *
 * Unit tests for the Canonical → Design System Resolver (Phase 10F).
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCanonicalSemantics,
  buildCoverageReport,
  formatCoverageReport,
} from '../resolve.js';
import type { CanonicalSemantics } from '../../tokens/canonical/types.js';

describe('resolveCanonicalSemantics', () => {
  describe('color resolution', () => {
    it('resolves canonical color.primary to hex value', () => {
      const canonical: CanonicalSemantics = {
        colors: {
          fill: {
            value: 'color.primary',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.colors['fill']).toBeDefined();
      expect(result.colors['fill'].canonical).toBe('color.primary');
      expect(result.colors['fill'].resolved).toBe('#3B82F6'); // Primary/Blue500
      expect(result.colors['fill'].confidence).toBe('high');
      expect(result.colors['fill'].source).toBe('vuetify');
      expect(result.colors['fill'].note).toBeUndefined();
    });

    it('resolves canonical color.success to hex value', () => {
      const canonical: CanonicalSemantics = {
        colors: {
          fill: {
            value: 'color.success',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'antd',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.colors['fill'].canonical).toBe('color.success');
      expect(result.colors['fill'].resolved).toBe('#10B981'); // Success/Green500
    });

    it('handles unmapped canonical color token', () => {
      const canonical: CanonicalSemantics = {
        colors: {
          fill: {
            value: 'color.unknown',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'low',
            source: 'generic-jsx',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.colors['fill'].canonical).toBe('color.unknown');
      expect(result.colors['fill'].resolved).toBeUndefined();
      expect(result.colors['fill'].note).toContain('not mapped');
    });

    it('passes through raw hex values', () => {
      const canonical: CanonicalSemantics = {
        colors: {
          fill: {
            value: '#FF5733',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'medium',
            source: 'generic-jsx',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.colors['fill'].resolved).toBe('#FF5733');
      expect(result.colors['fill'].note).toContain('Raw hex');
    });
  });

  describe('spacing resolution', () => {
    it('resolves canonical spacing tokens to pixel values', () => {
      const canonical: CanonicalSemantics = {
        spacing: {
          gap: {
            value: 'space.md',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
          padding: {
            value: 'space.lg',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'medium',
            source: 'antd',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.spacing['gap'].canonical).toBe('space.md');
      expect(result.spacing['gap'].resolved).toBe(16);
      expect(result.spacing['padding'].resolved).toBe(24);
    });

    it('handles raw numeric spacing values', () => {
      const canonical: CanonicalSemantics = {
        spacing: {
          gap: {
            value: '12',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'low',
            source: 'generic-jsx',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.spacing['gap'].resolved).toBe(12);
      expect(result.spacing['gap'].note).toContain('Raw numeric');
    });
  });

  describe('radius resolution', () => {
    it('resolves canonical radius tokens', () => {
      const canonical: CanonicalSemantics = {
        radius: {
          borderRadius: {
            value: 'radius.md',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.radius['borderRadius'].canonical).toBe('radius.md');
      expect(result.radius['borderRadius'].resolved).toBe(8);
    });

    it('resolves radius.full to large pixel value', () => {
      const canonical: CanonicalSemantics = {
        radius: {
          borderRadius: {
            value: 'radius.full',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'generic-jsx',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.radius['borderRadius'].resolved).toBe(9999);
    });
  });

  describe('typography resolution', () => {
    it('resolves canonical typography tokens', () => {
      const canonical: CanonicalSemantics = {
        typography: {
          fontSize: {
            value: 'text.size.lg',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
          fontWeight: {
            value: 'text.weight.bold',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.typography['fontSize'].resolved?.fontSize).toBe(18);
      expect(result.typography['fontWeight'].resolved?.fontWeight).toBe(700);
    });

    it('handles raw numeric font values', () => {
      const canonical: CanonicalSemantics = {
        typography: {
          fontWeight: {
            value: '600',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'low',
            source: 'generic-jsx',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.typography['fontWeight'].resolved?.fontWeight).toBe(600);
      expect(result.typography['fontWeight'].note).toContain('Raw numeric');
    });
  });

  describe('meta tracking', () => {
    it('tracks resolved and unresolved counts', () => {
      const canonical: CanonicalSemantics = {
        colors: {
          fill: {
            value: 'color.primary',
            loc: { startLine: 1, endLine: 1 },
            confidence: 'high',
            source: 'vuetify',
          },
        },
        spacing: {
          gap: {
            value: 'space.unknown', // Will not resolve
            loc: { startLine: 1, endLine: 1 },
            confidence: 'medium',
            source: 'vuetify',
          },
        },
      };

      const result = resolveCanonicalSemantics(canonical);

      expect(result.meta.resolvedCount).toBe(1);
      expect(result.meta.unresolvedCount).toBe(1);
    });
  });
});

describe('buildCoverageReport', () => {
  it('produces correct totals', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.primary',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'high',
          source: 'vuetify',
        },
      },
      spacing: {
        gap: {
          value: 'space.md',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'high',
          source: 'vuetify',
        },
        padding: {
          value: 'space.unknown',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'low',
          source: 'generic-jsx',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);

    expect(report.totals.canonicalFields).toBe(3);
    expect(report.totals.resolved).toBe(2);
    expect(report.totals.unresolved).toBe(1);
  });

  it('includes gaps with notes', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.unknown',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'low',
          source: 'generic-jsx',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);

    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0].canonical).toBe('color.unknown');
    expect(report.gaps[0].category).toBe('colors');
    expect(report.gaps[0].note).toContain('not mapped');
  });

  it('reports by-category coverage', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.primary',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'high',
          source: 'vuetify',
        },
      },
      spacing: {
        gap: {
          value: 'space.unknown',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'low',
          source: 'generic-jsx',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);

    expect(report.byCategory.colors.canonicalFields).toBe(1);
    expect(report.byCategory.colors.resolved).toBe(1);
    expect(report.byCategory.colors.unresolved).toBe(0);
    expect(report.byCategory.spacing.canonicalFields).toBe(1);
    expect(report.byCategory.spacing.resolved).toBe(0);
    expect(report.byCategory.spacing.unresolved).toBe(1);
  });
});

describe('formatCoverageReport', () => {
  it('produces formatted output string', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.primary',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'high',
          source: 'vuetify',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);
    const formatted = formatCoverageReport(report);

    expect(formatted).toContain('COVERAGE REPORT');
    expect(formatted).toContain('100%');
    expect(formatted).toContain('colors: 1/1');
  });

  it('includes gaps in formatted output', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.unknown',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'low',
          source: 'generic-jsx',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);
    const formatted = formatCoverageReport(report);

    expect(formatted).toContain('Gaps:');
    expect(formatted).toContain('color.unknown');
  });

  it('shows no gaps message when all resolved', () => {
    const canonical: CanonicalSemantics = {
      colors: {
        fill: {
          value: 'color.primary',
          loc: { startLine: 1, endLine: 1 },
          confidence: 'high',
          source: 'vuetify',
        },
      },
    };

    const resolution = resolveCanonicalSemantics(canonical);
    const report = buildCoverageReport(resolution);
    const formatted = formatCoverageReport(report);

    expect(formatted).toContain('No gaps');
  });
});
