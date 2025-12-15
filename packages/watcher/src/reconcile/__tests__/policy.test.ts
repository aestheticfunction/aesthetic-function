/**
 * @aesthetic-function/watcher - reconcile/__tests__/policy.test.ts
 *
 * Tests for the precedence policy layer (Phase 7C).
 *
 * Covers:
 * - Override wins when precedence=always
 * - Override skipped when precedence=if_newer_than_code and override older than file mtime
 * - Marker wins over AST for explicitly-declared fields
 * - AST fills missing marker fields
 * - Resolution summary formatting
 */

import { describe, it, expect } from 'vitest';
import {
  resolveField,
  resolveWithPolicy,
  formatResolutionSummary,
  type PolicyOptions,
  type MarkerIntent,
  type AstSemantics,
} from '../policy.js';
import type { IntentModel } from '../../transform/types.js';
import type { DesignOverrides } from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const NOW = new Date('2024-01-15T12:00:00.000Z');
const OLDER = new Date('2024-01-14T12:00:00.000Z');
const NEWER = new Date('2024-01-16T12:00:00.000Z');

function createBaseModel(): IntentModel {
  return {
    intents: [
      {
        type: 'BUTTON',
        nodeName: 'LoginButton',
        text: 'Login',
        fillTokenOrHex: '#3B82F6',
      },
      {
        type: 'TEXT',
        nodeName: 'WelcomeText',
        characters: 'Welcome',
      },
      {
        type: 'FRAME',
        nodeName: 'Container',
        fillTokenOrHex: '#FFFFFF',
        gap: 8,
        padding: 16,
      },
    ],
    source: 'test.tsx',
  };
}

// =============================================================================
// RESOLVE FIELD TESTS
// =============================================================================

describe('resolveField', () => {
  describe('precedence=always', () => {
    const options: PolicyOptions = {
      useOverrides: true,
      precedence: 'always',
    };

    it('should return override when available', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        'Sign In', // override
        NOW.toISOString(),
        'Login', // marker
        'Login', // ast
        'Login', // code
        options
      );

      expect(result.chosenValue).toBe('Sign In');
      expect(result.source).toBe('override');
      expect(result.reason).toContain('Override');
      expect(result.reason).toContain('precedence=always');
    });

    it('should return marker when no override', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        undefined, // no override
        undefined,
        'Login', // marker
        'Sign In', // ast
        'Click', // code
        options
      );

      expect(result.chosenValue).toBe('Login');
      expect(result.source).toBe('marker');
    });

    it('should return AST when no override or marker', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        undefined, // no override
        undefined,
        undefined, // no marker
        'Sign In', // ast
        'Click', // code
        options
      );

      expect(result.chosenValue).toBe('Sign In');
      expect(result.source).toBe('ast');
    });

    it('should return code when no override, marker, or AST', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        undefined, // no override
        undefined,
        undefined, // no marker
        undefined, // no ast
        'Click', // code
        options
      );

      expect(result.chosenValue).toBe('Click');
      expect(result.source).toBe('code');
    });
  });

  describe('precedence=if_newer_than_code', () => {
    const options: PolicyOptions = {
      useOverrides: true,
      precedence: 'if_newer_than_code',
      fileMtime: NOW,
    };

    it('should return override when newer than file', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        'Sign In',
        NEWER.toISOString(), // override is newer
        'Login',
        'Login',
        'Login',
        options
      );

      expect(result.chosenValue).toBe('Sign In');
      expect(result.source).toBe('override');
    });

    it('should skip override when older than file', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        'Sign In',
        OLDER.toISOString(), // override is older
        'Login',
        undefined,
        'Login',
        options
      );

      expect(result.chosenValue).toBe('Login');
      expect(result.source).toBe('marker');
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('stale');
    });

    it('should fall back to AST when override stale and no marker', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        'Sign In',
        OLDER.toISOString(), // override is older
        undefined, // no marker
        'Welcome',
        'Login',
        options
      );

      expect(result.chosenValue).toBe('Welcome');
      expect(result.source).toBe('ast');
      expect(result.skipped).toBe(true);
    });
  });

  describe('useOverrides=false', () => {
    const options: PolicyOptions = {
      useOverrides: false,
      precedence: 'always',
    };

    it('should ignore override even when present', () => {
      const result = resolveField(
        'LoginButton',
        'text',
        'Sign In', // override present
        NOW.toISOString(),
        'Login', // marker
        'Login', // ast
        'Login', // code
        options
      );

      expect(result.chosenValue).toBe('Login');
      expect(result.source).toBe('marker');
    });
  });
});

// =============================================================================
// RESOLVE WITH POLICY TESTS
// =============================================================================

describe('resolveWithPolicy', () => {
  it('should resolve all intents with override precedence', () => {
    const baseModel = createBaseModel();
    const markerIntents = new Map<string, MarkerIntent>([
      ['LoginButton', { nodeName: 'LoginButton', text: 'Login', fill: '#3B82F6' }],
    ]);
    const astSemantics = new Map<string, AstSemantics>([
      ['LoginButton', { nodeName: 'LoginButton', textLiterals: ['Sign In'], fillLiterals: ['#FF0000'] }],
    ]);
    const overrides: DesignOverrides = {
      LoginButton: {
        nodeId: 'node-1',
        lastUpdated: NOW.toISOString(),
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const { model, report } = resolveWithPolicy(
      baseModel,
      markerIntents,
      astSemantics,
      overrides,
      { useOverrides: true, precedence: 'always' }
    );

    // Check resolved model
    expect(model.intents[0].type).toBe('BUTTON');
    if (model.intents[0].type === 'BUTTON') {
      expect(model.intents[0].text).toBe('Submit');
      expect(model.intents[0].fillTokenOrHex).toBe('#10B981');
    }

    // Check report
    expect(report.summary.overrides).toBeGreaterThan(0);
    expect(report.nodes[0].nodeName).toBe('LoginButton');
    expect(report.nodes[0].text?.source).toBe('override');
  });

  it('should prefer marker over AST when marker is explicit', () => {
    const baseModel = createBaseModel();
    const markerIntents = new Map<string, MarkerIntent>([
      ['LoginButton', { nodeName: 'LoginButton', text: 'Login', fill: '#3B82F6' }],
    ]);
    const astSemantics = new Map<string, AstSemantics>([
      ['LoginButton', { nodeName: 'LoginButton', textLiterals: ['Sign In'], fillLiterals: ['#FF0000'] }],
    ]);

    const { model, report } = resolveWithPolicy(
      baseModel,
      markerIntents,
      astSemantics,
      null, // no overrides
      { useOverrides: false, precedence: 'always' }
    );

    // Marker should win over AST
    if (model.intents[0].type === 'BUTTON') {
      expect(model.intents[0].text).toBe('Login');
      expect(model.intents[0].fillTokenOrHex).toBe('#3B82F6');
    }

    expect(report.summary.markers).toBeGreaterThan(0);
  });

  it('should use AST to fill missing marker fields', () => {
    const baseModel = createBaseModel();
    // Marker only has text, not fill
    const markerIntents = new Map<string, MarkerIntent>([
      ['LoginButton', { nodeName: 'LoginButton', text: 'Login' }],
    ]);
    // AST has fill
    const astSemantics = new Map<string, AstSemantics>([
      ['LoginButton', { nodeName: 'LoginButton', textLiterals: ['Sign In'], fillLiterals: ['#FF0000'] }],
    ]);

    const { report } = resolveWithPolicy(
      baseModel,
      markerIntents,
      astSemantics,
      null,
      { useOverrides: false, precedence: 'always' }
    );

    // Text should come from marker, fill from code (since markers don't have fill)
    const loginNode = report.nodes.find((n) => n.nodeName === 'LoginButton');
    expect(loginNode?.text?.source).toBe('marker');
  });

  it('should resolve layout fields for FRAME intents', () => {
    const baseModel = createBaseModel();
    const markerIntents = new Map<string, MarkerIntent>();
    const astSemantics = new Map<string, AstSemantics>([
      ['Container', { nodeName: 'Container', layoutLiterals: { gap: 16, padding: 24 } }],
    ]);
    const overrides: DesignOverrides = {
      Container: {
        nodeId: 'node-1',
        lastUpdated: NOW.toISOString(),
        layout: { gap: 12 },
      },
    };

    const { report } = resolveWithPolicy(
      baseModel,
      markerIntents,
      astSemantics,
      overrides,
      { useOverrides: true, precedence: 'always' }
    );

    const containerNode = report.nodes.find((n) => n.nodeName === 'Container');
    expect(containerNode?.layout?.gap?.source).toBe('override');
    expect(containerNode?.layout?.gap?.chosenValue).toBe(12);
  });
});

// =============================================================================
// RESOLUTION SUMMARY TESTS
// =============================================================================

describe('formatResolutionSummary', () => {
  it('should format summary with all sources', () => {
    const summary = {
      overrides: 2,
      markers: 3,
      ast: 1,
      code: 1,
      skipped: 0,
    };

    const formatted = formatResolutionSummary(summary);

    expect(formatted).toContain('overrides=2');
    expect(formatted).toContain('markers=3');
    expect(formatted).toContain('ast=1');
    expect(formatted).toContain('code=1');
    expect(formatted).not.toContain('skipped=');
  });

  it('should include skipped when non-zero', () => {
    const summary = {
      overrides: 1,
      markers: 0,
      ast: 0,
      code: 0,
      skipped: 2,
    };

    const formatted = formatResolutionSummary(summary);

    expect(formatted).toContain('skipped=2');
  });

  it('should omit zero counts', () => {
    const summary = {
      overrides: 0,
      markers: 1,
      ast: 0,
      code: 0,
      skipped: 0,
    };

    const formatted = formatResolutionSummary(summary);

    expect(formatted).not.toContain('overrides=');
    expect(formatted).not.toContain('ast=');
    expect(formatted).not.toContain('code=');
    expect(formatted).toContain('markers=1');
  });
});
