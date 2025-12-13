/**
 * @aesthetic-function/watcher - test-sender.ts
 *
 * CLI script to send test updates to the server.
 * This validates the end-to-end plumbing:
 *   Intent → Transform → FigmaOps → Server → Plugin → Scene Graph
 *
 * PHASE 2A: Now uses IntentModel → FigmaOperation[] transformer
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher test:send
 *   # or with custom server URL:
 *   SERVER_URL=https://your-tunnel.trycloudflare.com pnpm --filter @aesthetic-function/watcher test:send
 */

import {
  intentToFigmaOps,
  createIntentModel,
  type FigmaOperation,
} from './transform/intentToFigmaOps.js';
import type { Intent, ButtonIntent, TextIntent } from './transform/types.js';
import { getDefaultTokenContext } from './tokens/designTokens.js';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001';

interface TestPayload {
  operations: FigmaOperation[];
  requestId: string;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Send Figma operations to the server
 */
async function sendOperations(operations: FigmaOperation[], requestId: string): Promise<void> {
  const payload: TestPayload = { operations, requestId };

  console.log(`[Test Sender] Sending to ${SERVER_URL}/test`);
  console.log(`[Test Sender] Request ID: ${requestId}`);
  console.log(`[Test Sender] Operations:`, JSON.stringify(operations, null, 2));

  try {
    const response = await fetch(`${SERVER_URL}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[Test Sender] Response:`, result);
    console.log('');
    console.log('✓ Test message sent successfully!');
    console.log('  Check Figma plugin to see if the operation was applied.');
  } catch (error) {
    console.error('[Test Sender] Error:', error);
    console.log('');
    console.log('✗ Failed to send test message.');
    console.log('  Make sure the server is running: pnpm dev:server');
    process.exit(1);
  }
}

/**
 * Transform intents to operations and send them
 */
async function runIntentScenario(intents: Intent[], scenarioName: string): Promise<void> {
  const requestId = generateRequestId();
  const tokenContext = getDefaultTokenContext();

  console.log(`[Test Sender] Building IntentModel for scenario: ${scenarioName}`);
  console.log(`[Test Sender] Intents:`, JSON.stringify(intents, null, 2));
  console.log('');

  // Transform Intent → FigmaOps
  const model = createIntentModel(intents, `test-sender:${scenarioName}`);
  const result = intentToFigmaOps(model, tokenContext);

  console.log(`[Test Sender] Transformed to ${result.operations.length} operation(s)`);
  
  if (result.resolvedTokens.length > 0) {
    console.log('[Test Sender] Token resolutions:');
    for (const token of result.resolvedTokens) {
      console.log(`  - "${token.input}" → "${token.resolved}"${token.tokenName ? ` (token: ${token.tokenName})` : ''}`);
    }
  }
  
  if (result.warnings.length > 0) {
    console.log('[Test Sender] Warnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }
  console.log('');

  await sendOperations(result.operations, requestId);
}

// =============================================================================
// TEST SCENARIOS (using Intent Model)
// =============================================================================

const intentScenarios: Record<string, Intent[]> = {
  /**
   * RED BOX TEST (hex passthrough)
   * Intent: Button with raw hex color
   * Expected: SET_FILL uses #FF0000 directly
   */
  redBox: [
    {
      type: 'BUTTON',
      nodeName: 'TestBox',
      text: 'Red Button',
      fillTokenOrHex: '#FF0000', // Raw hex - should pass through
    } satisfies ButtonIntent,
  ],

  /**
   * BLUE TOKEN TEST (token resolution)
   * Intent: Button with token name
   * Expected: SET_FILL uses resolved value #3B82F6
   */
  blueToken: [
    {
      type: 'BUTTON',
      nodeName: 'Login Button',
      text: 'Log In',
      fillTokenOrHex: 'Primary/Blue500', // Token name - should resolve to #3B82F6
    } satisfies ButtonIntent,
  ],

  /**
   * GREEN SUCCESS TEST
   * Intent: Button with success token
   */
  greenSuccess: [
    {
      type: 'BUTTON',
      nodeName: 'TestBox',
      text: 'Success!',
      fillTokenOrHex: 'Success/Green500', // Should resolve to #10B981
    } satisfies ButtonIntent,
  ],

  /**
   * TEXT UPDATE TEST
   * Intent: Text node update
   */
  textUpdate: [
    {
      type: 'TEXT',
      nodeName: 'TestText',
      characters: `Updated at ${new Date().toLocaleTimeString()}`,
    } satisfies TextIntent,
  ],

  /**
   * COMBINED TEST
   * Multiple intents in one model
   */
  combined: [
    {
      type: 'BUTTON',
      nodeName: 'TestBox',
      text: 'Primary Action',
      fillTokenOrHex: 'Primary/Blue500',
    } satisfies ButtonIntent,
    {
      type: 'TEXT',
      nodeName: 'TestText',
      characters: 'Synced from code via Intent!',
    } satisfies TextIntent,
  ],
};

// =============================================================================
// MAIN
// =============================================================================

const scenario = process.argv[2] ?? 'redBox';

if (!(scenario in intentScenarios)) {
  console.log('Available Intent scenarios:');
  Object.keys(intentScenarios).forEach((name) => {
    console.log(`  - ${name}`);
  });
  console.log('');
  console.log('Usage: pnpm --filter @aesthetic-function/watcher test:send [scenario]');
  console.log('');
  console.log('Key scenarios:');
  console.log('  redBox     - Hex passthrough (#FF0000)');
  console.log('  blueToken  - Token resolution (Primary/Blue500 → #3B82F6)');
  process.exit(1);
}

console.log(`[Test Sender] Running scenario: ${scenario}`);
console.log('');

runIntentScenario(intentScenarios[scenario], scenario);
