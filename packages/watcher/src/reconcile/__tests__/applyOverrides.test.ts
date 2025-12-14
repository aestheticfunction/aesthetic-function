/**
 * @aesthetic-function/watcher - reconcile/__tests__/applyOverrides.test.ts
 *
 * Unit tests for applyOverridesToIntentModel.
 */

import { describe, it, expect } from 'vitest';
import { applyOverridesToIntentModel } from '../applyOverrides.js';
import type { IntentModel, ButtonIntent, TextIntent, FrameIntent } from '../../transform/types.js';
import type { DesignOverrides } from '../types.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestModel(intents: IntentModel['intents']): IntentModel {
  return {
    intents,
    source: 'test',
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('applyOverridesToIntentModel', () => {
  describe('basic matching', () => {
    it('should apply text override to TEXT intent', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello World' },
      ]);
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Welcome to Figma!',
        },
      };

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      expect((result.intents[0] as TextIntent).characters).toBe('Welcome to Figma!');
      expect(reconcileResult.matched).toBe(1);
      expect(reconcileResult.ignored).toBe(0);
      expect(reconcileResult.overriddenNodes).toEqual(['WelcomeText']);
    });

    it('should apply text and fill overrides to BUTTON intent', () => {
      const model = createTestModel([
        { type: 'BUTTON', nodeName: 'LoginButton', text: 'Login', fillTokenOrHex: '#3B82F6' },
      ]);
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
          fill: '#FF5500',
        },
      };

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      const button = result.intents[0] as ButtonIntent;
      expect(button.text).toBe('Sign In');
      expect(button.fillTokenOrHex).toBe('#FF5500');
      expect(reconcileResult.matched).toBe(1);
      expect(reconcileResult.overriddenNodes).toEqual(['LoginButton']);
    });

    it('should apply fill override to TEXT intent (colorTokenOrHex)', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'Title', characters: 'Hello' },
      ]);
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '5:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#FF0000',
        },
      };

      const { model: result } = applyOverridesToIntentModel(model, overrides);

      expect((result.intents[0] as TextIntent).colorTokenOrHex).toBe('#FF0000');
    });

    it('should apply fill override to FRAME intent', () => {
      const model = createTestModel([
        { type: 'FRAME', nodeName: 'Card', fillTokenOrHex: '#FFFFFF' },
      ]);
      const overrides: DesignOverrides = {
        Card: {
          nodeId: '6:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#F0F0F0',
        },
      };

      const { model: result } = applyOverridesToIntentModel(model, overrides);

      expect((result.intents[0] as FrameIntent).fillTokenOrHex).toBe('#F0F0F0');
    });
  });

  describe('override key not found in model', () => {
    it('should ignore override when no matching intent exists', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ]);
      const overrides: DesignOverrides = {
        NonExistentNode: {
          nodeId: '99:99',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'This should be ignored',
        },
      };

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      expect((result.intents[0] as TextIntent).characters).toBe('Hello');
      expect(reconcileResult.matched).toBe(0);
      expect(reconcileResult.ignored).toBe(1);
      expect(reconcileResult.ignoredKeys).toEqual(['NonExistentNode']);
    });

    it('should track both matched and ignored overrides', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ]);
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Welcome!',
        },
        MissingNode: {
          nodeId: '99:99',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Ignored',
        },
        AnotherMissing: {
          nodeId: '99:100',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#000000',
        },
      };

      const { result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      expect(reconcileResult.matched).toBe(1);
      expect(reconcileResult.ignored).toBe(2);
      expect(reconcileResult.overriddenNodes).toEqual(['WelcomeText']);
      expect(reconcileResult.ignoredKeys).toContain('MissingNode');
      expect(reconcileResult.ignoredKeys).toContain('AnotherMissing');
    });
  });

  describe('unsupported fields', () => {
    it('should ignore text override on FRAME intent (frames have no text)', () => {
      const model = createTestModel([
        { type: 'FRAME', nodeName: 'Card', fillTokenOrHex: '#FFFFFF' },
      ]);
      const overrides: DesignOverrides = {
        Card: {
          nodeId: '6:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'This should be ignored for frames',
        },
      };

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      // Frame should remain unchanged since text is not applicable
      expect((result.intents[0] as FrameIntent).fillTokenOrHex).toBe('#FFFFFF');
      // But it still counts as matched (we found the node)
      expect(reconcileResult.matched).toBe(1);
    });
  });

  describe('null or empty overrides', () => {
    it('should return unchanged model when overrides is null', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ]);

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, null);

      expect(result).toBe(model); // Same reference
      expect(reconcileResult.matched).toBe(0);
      expect(reconcileResult.ignored).toBe(0);
    });

    it('should return unchanged model when overrides is empty object', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ]);
      const overrides: DesignOverrides = {};

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      expect(result).toBe(model); // Same reference
      expect(reconcileResult.matched).toBe(0);
      expect(reconcileResult.ignored).toBe(0);
    });
  });

  describe('model immutability', () => {
    it('should not mutate the original model', () => {
      const originalIntent: TextIntent = { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' };
      const model = createTestModel([originalIntent]);
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Changed',
        },
      };

      applyOverridesToIntentModel(model, overrides);

      // Original should be unchanged
      expect(originalIntent.characters).toBe('Hello');
      expect((model.intents[0] as TextIntent).characters).toBe('Hello');
    });

    it('should create new model object when overrides are applied', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ]);
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Changed',
        },
      };

      const { model: result } = applyOverridesToIntentModel(model, overrides);

      expect(result).not.toBe(model);
      expect(result.intents).not.toBe(model.intents);
    });
  });

  describe('multiple intents', () => {
    it('should apply overrides to multiple matching intents', () => {
      const model = createTestModel([
        { type: 'TEXT', nodeName: 'Title', characters: 'Original Title' },
        { type: 'BUTTON', nodeName: 'SubmitBtn', text: 'Submit', fillTokenOrHex: '#3B82F6' },
        { type: 'TEXT', nodeName: 'Subtitle', characters: 'Original Subtitle' },
      ]);
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'New Title',
        },
        SubmitBtn: {
          nodeId: '2:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Send',
          fill: '#00FF00',
        },
      };

      const { model: result, result: reconcileResult } = applyOverridesToIntentModel(model, overrides);

      expect((result.intents[0] as TextIntent).characters).toBe('New Title');
      expect((result.intents[1] as ButtonIntent).text).toBe('Send');
      expect((result.intents[1] as ButtonIntent).fillTokenOrHex).toBe('#00FF00');
      expect((result.intents[2] as TextIntent).characters).toBe('Original Subtitle');
      expect(reconcileResult.matched).toBe(2);
      expect(reconcileResult.overriddenNodes).toContain('Title');
      expect(reconcileResult.overriddenNodes).toContain('SubmitBtn');
    });
  });
});
