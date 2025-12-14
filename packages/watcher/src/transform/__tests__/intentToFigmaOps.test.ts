/**
 * @aesthetic-function/watcher - transform/__tests__/intentToFigmaOps.test.ts
 *
 * Unit tests for the Intent → FigmaOps transformer.
 *
 * TEST CASES:
 * 1. Hex passthrough: "#FF0000" → SET_FILL uses #FF0000
 * 2. Token resolution: "Primary/Blue500" → SET_FILL uses #3B82F6
 *
 * Run with: pnpm --filter @aesthetic-function/watcher test
 */

import { describe, it, expect } from 'vitest';
import {
  intentToFigmaOps,
  createIntentModel,
} from '../intentToFigmaOps.js';
import type { ButtonIntent, TextIntent } from '../types.js';
import {
  getDefaultTokenContext,
  resolveColorToken,
  hexToTokenName,
} from '../../tokens/designTokens.js';

// =============================================================================
// TOKEN RESOLUTION TESTS
// =============================================================================

describe('Token Resolution', () => {
  const ctx = getDefaultTokenContext();

  it('Hex value passes through unchanged', () => {
    expect(resolveColorToken('#FF0000', ctx)).toBe('#FF0000');
  });

  it('Token "Primary/Blue500" resolves to #3B82F6', () => {
    expect(resolveColorToken('Primary/Blue500', ctx)).toBe('#3B82F6');
  });

  it('Unknown token passes through with warning', () => {
    expect(resolveColorToken('Unknown/Token', ctx)).toBe('Unknown/Token');
  });

  it('Hex #3B82F6 maps to token "Primary/Blue500"', () => {
    expect(hexToTokenName('#3B82F6', ctx)).toBe('Primary/Blue500');
  });

  it('Lowercase hex also matches', () => {
    expect(hexToTokenName('#3b82f6', ctx)).toBe('Primary/Blue500');
  });
});

// =============================================================================
// INTENT TRANSFORMER TESTS
// =============================================================================

describe('Intent → FigmaOps Transformer', () => {
  const ctx = getDefaultTokenContext();

  const hexButtonIntent: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'TestBox',
    text: 'Click Me',
    fillTokenOrHex: '#FF0000',
  };

  const tokenButtonIntent: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'Login Button',
    text: 'Log In',
    fillTokenOrHex: 'Primary/Blue500',
  };

  const textIntent: TextIntent = {
    type: 'TEXT',
    nodeName: 'TestText',
    characters: 'Hello World',
  };

  const coloredTextIntent: TextIntent = {
    type: 'TEXT',
    nodeName: 'ColoredText',
    characters: 'Colored!',
    colorTokenOrHex: 'Error/Red500',
  };

  it('Button intent produces 2 operations (SET_FILL + SET_TEXT)', () => {
    const result = intentToFigmaOps(createIntentModel([hexButtonIntent]), ctx);
    expect(result.operations.length).toBe(2);
  });

  it('SET_FILL uses #FF0000 (hex passthrough)', () => {
    const result = intentToFigmaOps(createIntentModel([hexButtonIntent]), ctx);
    const fillOp = result.operations.find(op => op.op === 'SET_FILL');
    expect(fillOp).toBeDefined();
    expect(fillOp && 'color' in fillOp && fillOp.color).toBe('#FF0000');
  });

  it('SET_FILL uses #3B82F6 (resolved from Primary/Blue500)', () => {
    const result = intentToFigmaOps(createIntentModel([tokenButtonIntent]), ctx);
    const fillOp = result.operations.find(op => op.op === 'SET_FILL');
    expect(fillOp).toBeDefined();
    expect(fillOp && 'color' in fillOp && fillOp.color).toBe('#3B82F6');
  });

  it('Token resolution is tracked in result', () => {
    const result = intentToFigmaOps(createIntentModel([tokenButtonIntent]), ctx);
    expect(result.resolvedTokens.some(t => t.input === 'Primary/Blue500' && t.resolved === '#3B82F6')).toBe(true);
  });

  it('Text intent produces 1 operation', () => {
    const result = intentToFigmaOps(createIntentModel([textIntent]), ctx);
    expect(result.operations.length).toBe(1);
  });

  it('SET_TEXT has correct text content', () => {
    const result = intentToFigmaOps(createIntentModel([textIntent]), ctx);
    const textOp = result.operations[0];
    expect(textOp.op).toBe('SET_TEXT');
    expect(textOp && 'text' in textOp && textOp.text).toBe('Hello World');
  });

  it('Text intent with color produces 2 operations', () => {
    const result = intentToFigmaOps(createIntentModel([coloredTextIntent]), ctx);
    expect(result.operations.length).toBe(2);
  });

  it('Text SET_FILL uses #EF4444 (resolved from Error/Red500)', () => {
    const result = intentToFigmaOps(createIntentModel([coloredTextIntent]), ctx);
    const fillOp = result.operations.find(op => op.op === 'SET_FILL');
    expect(fillOp).toBeDefined();
    expect(fillOp && 'color' in fillOp && fillOp.color).toBe('#EF4444');
  });

  it('Multiple intents produce combined operations (2 + 1 = 3)', () => {
    const result = intentToFigmaOps(createIntentModel([hexButtonIntent, textIntent]), ctx);
    expect(result.operations.length).toBe(3);
  });

  it('nodeQuery is set from intent nodeName', () => {
    const result = intentToFigmaOps(createIntentModel([hexButtonIntent]), ctx);
    const fillOp = result.operations.find(op => op.op === 'SET_FILL');
    expect(fillOp).toBeDefined();
    expect(fillOp && 'nodeQuery' in fillOp && fillOp.nodeQuery).toBe('TestBox');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  const ctx = getDefaultTokenContext();

  it('Empty intent model produces no operations', () => {
    const result = intentToFigmaOps(createIntentModel([]), ctx);
    expect(result.operations.length).toBe(0);
  });

  it('Success/Green500 resolves to #10B981', () => {
    const successIntent: ButtonIntent = {
      type: 'BUTTON',
      nodeName: 'SuccessBtn',
      text: 'OK',
      fillTokenOrHex: 'Success/Green500',
    };
    const result = intentToFigmaOps(createIntentModel([successIntent]), ctx);
    const fillOp = result.operations.find(op => op.op === 'SET_FILL');
    expect(fillOp).toBeDefined();
    expect(fillOp && 'color' in fillOp && fillOp.color).toBe('#10B981');
  });
});
