/**
 * @aesthetic-function/watcher - transform/__tests__/intentToFigmaOps.test.ts
 *
 * Unit tests for the Intent → FigmaOps transformer.
 *
 * TEST CASES:
 * 1. Hex passthrough: "#FF0000" → SET_FILL uses #FF0000
 * 2. Token resolution: "Primary/Blue500" → SET_FILL uses #3B82F6
 *
 * Run with: pnpm --filter @aesthetic-function/watcher test:transform
 */

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
// TEST UTILITIES
// =============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// =============================================================================
// TOKEN RESOLUTION TESTS
// =============================================================================

describe('Token Resolution', () => {
  const ctx = getDefaultTokenContext();

  // Test 1: Hex passthrough
  assert(
    resolveColorToken('#FF0000', ctx) === '#FF0000',
    'Hex value passes through unchanged'
  );

  // Test 2: Token resolution
  assert(
    resolveColorToken('Primary/Blue500', ctx) === '#3B82F6',
    'Token "Primary/Blue500" resolves to #3B82F6'
  );

  // Test 3: Unknown token passes through
  assert(
    resolveColorToken('Unknown/Token', ctx) === 'Unknown/Token',
    'Unknown token passes through with warning'
  );

  // Test 4: Reverse lookup
  assert(
    hexToTokenName('#3B82F6', ctx) === 'Primary/Blue500',
    'Hex #3B82F6 maps to token "Primary/Blue500"'
  );

  // Test 5: Case insensitive hex lookup
  assert(
    hexToTokenName('#3b82f6', ctx) === 'Primary/Blue500',
    'Lowercase hex also matches'
  );
});

// =============================================================================
// INTENT TRANSFORMER TESTS
// =============================================================================

describe('Intent → FigmaOps Transformer', () => {
  const ctx = getDefaultTokenContext();

  // Test 1: Button with hex color (passthrough)
  const hexButtonIntent: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'TestBox',
    text: 'Click Me',
    fillTokenOrHex: '#FF0000',
  };

  const hexResult = intentToFigmaOps(createIntentModel([hexButtonIntent]), ctx);

  assert(
    hexResult.operations.length === 2,
    'Button intent produces 2 operations (SET_FILL + SET_TEXT)'
  );

  const hexFillOp = hexResult.operations.find(op => op.op === 'SET_FILL');
  assert(
    hexFillOp !== undefined && 'color' in hexFillOp && hexFillOp.color === '#FF0000',
    'SET_FILL uses #FF0000 (hex passthrough)'
  );

  // Test 2: Button with token color (resolution)
  const tokenButtonIntent: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'Login Button',
    text: 'Log In',
    fillTokenOrHex: 'Primary/Blue500',
  };

  const tokenResult = intentToFigmaOps(createIntentModel([tokenButtonIntent]), ctx);

  const tokenFillOp = tokenResult.operations.find(op => op.op === 'SET_FILL');
  assert(
    tokenFillOp !== undefined && 'color' in tokenFillOp && tokenFillOp.color === '#3B82F6',
    'SET_FILL uses #3B82F6 (resolved from Primary/Blue500)'
  );

  assert(
    tokenResult.resolvedTokens.some(t => t.input === 'Primary/Blue500' && t.resolved === '#3B82F6'),
    'Token resolution is tracked in result'
  );

  // Test 3: Text intent
  const textIntent: TextIntent = {
    type: 'TEXT',
    nodeName: 'TestText',
    characters: 'Hello World',
  };

  const textResult = intentToFigmaOps(createIntentModel([textIntent]), ctx);

  assert(
    textResult.operations.length === 1,
    'Text intent produces 1 operation'
  );

  const textOp = textResult.operations[0];
  assert(
    textOp.op === 'SET_TEXT' && 'text' in textOp && textOp.text === 'Hello World',
    'SET_TEXT has correct text content'
  );

  // Test 4: Text intent with color
  const coloredTextIntent: TextIntent = {
    type: 'TEXT',
    nodeName: 'ColoredText',
    characters: 'Colored!',
    colorTokenOrHex: 'Error/Red500',
  };

  const coloredTextResult = intentToFigmaOps(createIntentModel([coloredTextIntent]), ctx);

  assert(
    coloredTextResult.operations.length === 2,
    'Text intent with color produces 2 operations'
  );

  const textFillOp = coloredTextResult.operations.find(op => op.op === 'SET_FILL');
  assert(
    textFillOp !== undefined && 'color' in textFillOp && textFillOp.color === '#EF4444',
    'Text SET_FILL uses #EF4444 (resolved from Error/Red500)'
  );

  // Test 5: Multiple intents
  const multiResult = intentToFigmaOps(createIntentModel([hexButtonIntent, textIntent]), ctx);

  assert(
    multiResult.operations.length === 3,
    'Multiple intents produce combined operations (2 + 1 = 3)'
  );

  // Test 6: Node query is set correctly
  assert(
    hexFillOp !== undefined && hexFillOp.nodeQuery === 'TestBox',
    'nodeQuery is set from intent nodeName'
  );
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  const ctx = getDefaultTokenContext();

  // Empty model
  const emptyResult = intentToFigmaOps(createIntentModel([]), ctx);
  assert(
    emptyResult.operations.length === 0,
    'Empty intent model produces no operations'
  );

  // Success token
  const successIntent: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'SuccessBtn',
    text: 'OK',
    fillTokenOrHex: 'Success/Green500',
  };

  const successResult = intentToFigmaOps(createIntentModel([successIntent]), ctx);
  const successFillOp = successResult.operations.find(op => op.op === 'SET_FILL');
  assert(
    successFillOp !== undefined && 'color' in successFillOp && successFillOp.color === '#10B981',
    'Success/Green500 resolves to #10B981'
  );
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('\n' + '='.repeat(50));
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
