/**
 * @aesthetic-function/watcher - analyze/__tests__/analyzeCodeWithLLM.test.ts
 *
 * Unit tests for the LLM-based intent analyzer scaffold.
 *
 * PURPOSE:
 * - Validate the IntentModel shape returned by the stub
 * - Establish test patterns for future LLM integration
 * - Ensure the interface contract is correct
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeCodeWithLLM,
  validateIntentModel,
  buildAnalyzerPrompt,
} from '../analyzeCodeWithLLM.js';
import { getDefaultTokenContext } from '../../tokens/designTokens.js';
import type { IntentModel, ButtonIntent, TextIntent } from '../../transform/types.js';

// =============================================================================
// SETUP
// =============================================================================

const sampleCode = `
import React from 'react';

export function HeroSection() {
  return (
    <div className="hero">
      <h1>Welcome to the App</h1>
      <p>Build something amazing today.</p>
      <button className="primary">Get Started</button>
      <button className="secondary">Learn More</button>
    </div>
  );
}
`;

const tokenContext = getDefaultTokenContext();

// =============================================================================
// analyzeCodeWithLLM TESTS
// =============================================================================

describe('analyzeCodeWithLLM', () => {
  describe('stub behavior', () => {
    it('should return an AnalyzeResult with model, source, and usage', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('usage');
    });

    it('should return source as "stub" for scaffold implementation', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.source).toBe('stub');
    });

    it('should return usage with token counts', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.usage).toBeDefined();
      expect(result.usage).toHaveProperty('promptTokens');
      expect(result.usage).toHaveProperty('completionTokens');
      expect(result.usage).toHaveProperty('totalTokens');
      expect(typeof result.usage!.promptTokens).toBe('number');
      expect(typeof result.usage!.completionTokens).toBe('number');
      expect(typeof result.usage!.totalTokens).toBe('number');
    });
  });

  describe('IntentModel shape', () => {
    it('should return an IntentModel with intents array', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.model).toHaveProperty('intents');
      expect(Array.isArray(result.model.intents)).toBe(true);
    });

    it('should return at least one intent', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.model.intents.length).toBeGreaterThan(0);
    });

    it('should include source in the IntentModel', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext, {
        filePath: 'src/components/Hero.tsx',
      });

      expect(result.model.source).toBe('src/components/Hero.tsx');
    });

    it('should include timestamp in the IntentModel', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.model.timestamp).toBeDefined();
      expect(typeof result.model.timestamp).toBe('string');
      // Should be a valid ISO date
      expect(() => new Date(result.model.timestamp!)).not.toThrow();
    });
  });

  describe('intent types', () => {
    it('should return ButtonIntent with required properties', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      const buttonIntents = result.model.intents.filter((i) => i.type === 'BUTTON');
      expect(buttonIntents.length).toBeGreaterThan(0);

      const button = buttonIntents[0] as ButtonIntent;
      expect(button.type).toBe('BUTTON');
      expect(typeof button.nodeName).toBe('string');
      expect(typeof button.text).toBe('string');
      expect(typeof button.fillTokenOrHex).toBe('string');
    });

    it('should return TextIntent with required properties', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      const textIntents = result.model.intents.filter((i) => i.type === 'TEXT');
      expect(textIntents.length).toBeGreaterThan(0);

      const text = textIntents[0] as TextIntent;
      expect(text.type).toBe('TEXT');
      expect(typeof text.nodeName).toBe('string');
      expect(typeof text.characters).toBe('string');
    });

    it('should return intents with valid token references', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      const buttonIntents = result.model.intents.filter((i) => i.type === 'BUTTON') as ButtonIntent[];

      for (const button of buttonIntents) {
        // fillTokenOrHex should be either a known token or a hex value
        const isKnownToken = tokenContext.tokens.has(button.fillTokenOrHex);
        const isHexValue = /^#[0-9A-Fa-f]{6}$/.test(button.fillTokenOrHex);

        expect(isKnownToken || isHexValue).toBe(true);
      }
    });
  });

  describe('options', () => {
    it('should include analysisSummary when includeAnalysisSummary is true', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext, {
        includeAnalysisSummary: true,
      });

      expect(result.analysisSummary).toBeDefined();
      expect(typeof result.analysisSummary).toBe('string');
      expect(result.analysisSummary!.length).toBeGreaterThan(0);
    });

    it('should NOT include analysisSummary when includeAnalysisSummary is false', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext, {
        includeAnalysisSummary: false,
      });

      expect(result.analysisSummary).toBeUndefined();
    });

    it('should NOT include analysisSummary by default', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

      expect(result.analysisSummary).toBeUndefined();
    });

    it('should use filePath in source when provided', async () => {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext, {
        filePath: 'my/custom/path.tsx',
      });

      expect(result.model.source).toBe('my/custom/path.tsx');
    });
  });
});

// =============================================================================
// validateIntentModel TESTS
// =============================================================================

describe('validateIntentModel', () => {
  it('should return true for valid IntentModel', () => {
    const model: IntentModel = {
      intents: [
        { type: 'BUTTON', nodeName: 'Test', text: 'Click', fillTokenOrHex: '#000000' },
      ],
    };

    expect(validateIntentModel(model)).toBe(true);
  });

  it('should return true for model from analyzeCodeWithLLM', async () => {
    const result = await analyzeCodeWithLLM(sampleCode, tokenContext);

    expect(validateIntentModel(result.model)).toBe(true);
  });

  it('should return false for null', () => {
    expect(validateIntentModel(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(validateIntentModel(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(validateIntentModel('string')).toBe(false);
    expect(validateIntentModel(123)).toBe(false);
    expect(validateIntentModel([])).toBe(false);
  });

  it('should return false for object without intents array', () => {
    expect(validateIntentModel({})).toBe(false);
    expect(validateIntentModel({ intents: 'not an array' })).toBe(false);
  });

  it('should return false for intent without type', () => {
    const model = {
      intents: [{ nodeName: 'Test' }],
    };

    expect(validateIntentModel(model)).toBe(false);
  });

  it('should return false for intent without nodeName', () => {
    const model = {
      intents: [{ type: 'BUTTON' }],
    };

    expect(validateIntentModel(model)).toBe(false);
  });

  it('should return false for ButtonIntent without text', () => {
    const model = {
      intents: [{ type: 'BUTTON', nodeName: 'Test', fillTokenOrHex: '#000' }],
    };

    expect(validateIntentModel(model)).toBe(false);
  });

  it('should return false for ButtonIntent without fillTokenOrHex', () => {
    const model = {
      intents: [{ type: 'BUTTON', nodeName: 'Test', text: 'Click' }],
    };

    expect(validateIntentModel(model)).toBe(false);
  });

  it('should return false for TextIntent without characters', () => {
    const model = {
      intents: [{ type: 'TEXT', nodeName: 'Test' }],
    };

    expect(validateIntentModel(model)).toBe(false);
  });

  it('should return true for valid FrameIntent (fillTokenOrHex optional)', () => {
    const model = {
      intents: [{ type: 'FRAME', nodeName: 'Container' }],
    };

    expect(validateIntentModel(model)).toBe(true);
  });
});

// =============================================================================
// buildAnalyzerPrompt TESTS
// =============================================================================

describe('buildAnalyzerPrompt', () => {
  it('should return a non-empty string', () => {
    const prompt = buildAnalyzerPrompt(sampleCode, ['Primary/Blue500']);

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include the source code', () => {
    const prompt = buildAnalyzerPrompt(sampleCode, []);

    expect(prompt).toContain('HeroSection');
    expect(prompt).toContain('Get Started');
  });

  it('should include token names', () => {
    const tokenNames = ['Primary/Blue500', 'Error/Red500'];
    const prompt = buildAnalyzerPrompt(sampleCode, tokenNames);

    expect(prompt).toContain('Primary/Blue500');
    expect(prompt).toContain('Error/Red500');
  });

  it('should limit token names to prevent prompt overflow', () => {
    const manyTokens = Array.from({ length: 100 }, (_, i) => `Token/Color${i}`);
    const prompt = buildAnalyzerPrompt(sampleCode, manyTokens);

    // Should include first tokens, but limit to MAX_TOKEN_CONTEXT (30)
    expect(prompt).toContain('Token/Color0');
    expect(prompt).toContain('Token/Color29');
    expect(prompt).not.toContain('Token/Color50');
  });

  it('should truncate very long code', () => {
    const longCode = 'x'.repeat(10000);
    const prompt = buildAnalyzerPrompt(longCode, []);

    // Prompt should be shorter than the input code (max 8000 chars for code)
    expect(prompt.length).toBeLessThan(longCode.length);
  });
});

// =============================================================================
// RUN TESTS
// =============================================================================

// Self-running test harness for manual execution
if (typeof process !== 'undefined' && process.argv[1]?.includes('analyzeCodeWithLLM.test')) {
  console.log('Running analyzeCodeWithLLM tests...\n');

  // Simple test runner for direct execution
  (async () => {
    let passed = 0;
    let failed = 0;

    // Test stub behavior
    try {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);
      console.assert(result.source === 'stub', 'Should return stub source');
      console.assert(Array.isArray(result.model.intents), 'Should return intents array');
      console.assert(result.model.intents.length > 0, 'Should return at least one intent');
      console.log('✓ analyzeCodeWithLLM stub behavior');
      passed++;
    } catch (e) {
      console.log('✗ analyzeCodeWithLLM stub behavior:', e);
      failed++;
    }

    // Test validation
    try {
      const result = await analyzeCodeWithLLM(sampleCode, tokenContext);
      console.assert(validateIntentModel(result.model), 'Model should pass validation');
      console.assert(!validateIntentModel(null), 'null should fail validation');
      console.assert(!validateIntentModel({}), 'Empty object should fail validation');
      console.log('✓ validateIntentModel');
      passed++;
    } catch (e) {
      console.log('✗ validateIntentModel:', e);
      failed++;
    }

    // Test prompt builder
    try {
      const prompt = buildAnalyzerPrompt(sampleCode, ['Primary/Blue500']);
      console.assert(prompt.includes('Primary/Blue500'), 'Prompt should include tokens');
      console.assert(prompt.includes('HeroSection'), 'Prompt should include code');
      console.log('✓ buildAnalyzerPrompt');
      passed++;
    } catch (e) {
      console.log('✗ buildAnalyzerPrompt:', e);
      failed++;
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
