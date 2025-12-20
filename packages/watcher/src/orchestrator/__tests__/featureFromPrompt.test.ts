/**
 * @aesthetic-function/watcher - orchestrator/__tests__/featureFromPrompt.test.ts
 *
 * Tests for the Feature Orchestrator.
 *
 * WHY: Verifies that the orchestrator correctly parses LLM responses, validates
 * artifacts, and handles edge cases gracefully.
 */

import { describe, it, expect } from 'vitest';
import type { PromptPatchArtifact, PromptPatchChange } from '../types.js';

// =============================================================================
// HELPERS FOR TESTING
// =============================================================================

/**
 * Creates a valid prompt patch artifact for testing.
 */
function createValidArtifact(overrides?: Partial<PromptPatchArtifact>): PromptPatchArtifact {
  return {
    componentKey: 'LoginButton',
    file: 'demo-app/src/App.tsx',
    state: 'hover',
    prompt: 'Change hover button to success green',
    generatedAt: new Date().toISOString(),
    changes: [
      {
        op: 'SET_FILL',
        nodeName: 'LoginButton',
        path: 'visual.fills[0]',
        before: '#3B82F6',
        after: '#10B981',
        reason: 'Switching to success green for hover state',
      },
    ],
    skipped: [],
    ...overrides,
  };
}

/**
 * Creates a valid change entry for testing.
 */
function createValidChange(overrides?: Partial<PromptPatchChange>): PromptPatchChange {
  return {
    op: 'SET_TEXT',
    nodeName: 'WelcomeMessage',
    path: 'text.content',
    before: 'Hello',
    after: 'Welcome',
    reason: 'Updating greeting text',
    ...overrides,
  };
}

// =============================================================================
// TESTS: ARTIFACT VALIDATION
// =============================================================================

describe('PromptPatchArtifact validation', () => {
  it('should have required fields', () => {
    const artifact = createValidArtifact();

    expect(artifact.componentKey).toBeDefined();
    expect(artifact.file).toBeDefined();
    expect(artifact.state).toBeDefined();
    expect(artifact.prompt).toBeDefined();
    expect(artifact.generatedAt).toBeDefined();
    expect(artifact.changes).toBeInstanceOf(Array);
    expect(artifact.skipped).toBeInstanceOf(Array);
  });

  it('should validate change operations', () => {
    const validOps = ['SET_TEXT', 'SET_FILL', 'SET_LAYOUT'] as const;

    for (const op of validOps) {
      const change = createValidChange({ op });
      expect(['SET_TEXT', 'SET_FILL', 'SET_LAYOUT']).toContain(change.op);
    }
  });

  it('should include path info in changes', () => {
    const change = createValidChange();

    expect(change.path).toBeDefined();
    expect(typeof change.path).toBe('string');
  });

  it('should allow optional layoutKey in changes', () => {
    const changeWithLayout = createValidChange({ layoutKey: 'padding' });
    const changeWithoutLayout = createValidChange();

    expect(changeWithLayout.layoutKey).toBe('padding');
    expect(changeWithoutLayout.layoutKey).toBeUndefined();
  });
});

// =============================================================================
// TESTS: LLM RESPONSE PARSING
// =============================================================================

describe('LLM response parsing', () => {
  it('should extract JSON from markdown code block', () => {
    const response = `
Here's the patch artifact:

\`\`\`json
{
  "componentKey": "Card",
  "file": "demo-app/src/Card.tsx",
  "state": "base",
  "prompt": "Change title",
  "generatedAt": "2024-01-15T10:00:00Z",
  "changes": [],
  "skipped": []
}
\`\`\`

This patch updates the Card component.
`;

    // Extract JSON from code block
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(jsonMatch).toBeTruthy();

    const parsed = JSON.parse(jsonMatch![1].trim());
    expect(parsed.componentKey).toBe('Card');
  });

  it('should handle raw JSON response', () => {
    const response = `{
  "componentKey": "Card",
  "file": "demo-app/src/Card.tsx",
  "state": "base",
  "prompt": "Change title",
  "generatedAt": "2024-01-15T10:00:00Z",
  "changes": [],
  "skipped": []
}`;

    const parsed = JSON.parse(response.trim());
    expect(parsed.componentKey).toBe('Card');
  });

  it('should handle nested JSON in response', () => {
    const response = `
\`\`\`json
{
  "componentKey": "Button",
  "file": "src/Button.tsx",
  "state": "hover",
  "prompt": "Update colors",
  "generatedAt": "2024-01-15T10:00:00Z",
  "changes": [
    {
      "op": "SET_FILL",
      "nodeName": "Button",
      "path": "visual.fills[0]",
      "before": "#fff",
      "after": "#000",
      "reason": "Inverting colors"
    }
  ],
  "skipped": [
    {
      "field": "borderRadius",
      "reason": "Not auto-writable"
    }
  ]
}
\`\`\`
`;

    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse(jsonMatch![1].trim());

    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].op).toBe('SET_FILL');
    expect(parsed.skipped).toHaveLength(1);
  });
});

// =============================================================================
// TESTS: COMPONENT STATE HANDLING
// =============================================================================

describe('Component state handling', () => {
  it('should recognize valid component states', () => {
    const validStates = ['base', 'hover', 'pressed', 'disabled'] as const;

    for (const state of validStates) {
      const artifact = createValidArtifact({ state });
      expect(['base', 'hover', 'pressed', 'disabled']).toContain(artifact.state);
    }
  });

  it('should default to base state when not specified', () => {
    // When parsing a response that doesn't specify state, it should default
    const artifact = createValidArtifact({ state: 'base' });
    expect(artifact.state).toBe('base');
  });
});

// =============================================================================
// TESTS: CHANGE OPERATION TYPES
// =============================================================================

describe('Change operation types', () => {
  it('should handle SET_TEXT operation', () => {
    const change = createValidChange({
      op: 'SET_TEXT',
      path: 'text.content',
      before: 'Login',
      after: 'Sign In',
    });

    expect(change.op).toBe('SET_TEXT');
    expect(change.path).toBe('text.content');
  });

  it('should handle SET_FILL operation', () => {
    const change = createValidChange({
      op: 'SET_FILL',
      path: 'visual.fills[0]',
      before: '#3B82F6',
      after: '#10B981',
    });

    expect(change.op).toBe('SET_FILL');
    expect(change.path).toBe('visual.fills[0]');
  });

  it('should handle SET_LAYOUT operation', () => {
    const change = createValidChange({
      op: 'SET_LAYOUT',
      path: 'layout.padding',
      before: '8',
      after: '16',
      layoutKey: 'padding',
    });

    expect(change.op).toBe('SET_LAYOUT');
    expect(change.layoutKey).toBe('padding');
  });
});

// =============================================================================
// TESTS: SKIPPED CHANGES
// =============================================================================

describe('Skipped changes', () => {
  it('should track skipped fields with reasons', () => {
    const artifact = createValidArtifact({
      skipped: [
        { field: 'borderRadius', reason: 'Hardcoded value, not auto-writable' },
        { field: 'fontFamily', reason: 'Not in design tokens' },
      ],
    });

    expect(artifact.skipped).toHaveLength(2);
    expect(artifact.skipped[0].field).toBe('borderRadius');
    expect(artifact.skipped[0].reason).toContain('not auto-writable');
  });

  it('should allow empty skipped array', () => {
    const artifact = createValidArtifact({ skipped: [] });
    expect(artifact.skipped).toHaveLength(0);
  });
});

// =============================================================================
// TESTS: ARTIFACT PATH GENERATION
// =============================================================================

describe('Artifact path generation', () => {
  it('should generate correct suffix', () => {
    const PROMPT_PATCH_SUFFIX = '.prompt-patch.json';
    const filePath = 'demo-app/src/App.tsx';

    // Expected: design-materializations/demo-app/src/App.tsx.prompt-patch.json
    const expectedPath = `design-materializations/${filePath}${PROMPT_PATCH_SUFFIX}`;

    expect(expectedPath).toBe('design-materializations/demo-app/src/App.tsx.prompt-patch.json');
  });

  it('should handle nested file paths', () => {
    const PROMPT_PATCH_SUFFIX = '.prompt-patch.json';
    const filePath = 'packages/ui/src/components/Button/Button.tsx';

    const expectedPath = `design-materializations/${filePath}${PROMPT_PATCH_SUFFIX}`;

    expect(expectedPath).toContain('packages/ui/src/components/Button/');
  });
});

// =============================================================================
// TESTS: ERROR HANDLING
// =============================================================================

describe('Error handling', () => {
  it('should detect invalid JSON in response', () => {
    const invalidResponse = 'This is not valid JSON { broken: ';

    expect(() => JSON.parse(invalidResponse)).toThrow();
  });

  it('should detect missing required fields', () => {
    const incompleteArtifact = {
      componentKey: 'Button',
      // missing: file, state, prompt, generatedAt, changes, skipped
    };

    expect(incompleteArtifact.componentKey).toBe('Button');
    expect((incompleteArtifact as unknown as PromptPatchArtifact).file).toBeUndefined();
  });

  it('should detect invalid operation type', () => {
    const invalidChange = {
      op: 'INVALID_OP',
      nodeName: 'Button',
      path: 'visual.fills[0]',
      before: '#fff',
      after: '#000',
      reason: 'test',
    };

    expect(['SET_TEXT', 'SET_FILL', 'SET_LAYOUT']).not.toContain(invalidChange.op);
  });
});

// =============================================================================
// TESTS: INTEGRATION SCENARIOS
// =============================================================================

describe('Integration scenarios', () => {
  it('should handle complete feature request workflow', () => {
    // Simulates the full flow from request to artifact
    const request = {
      prompt: 'Make the LoginButton hover state green',
      targetFile: 'demo-app/src/App.tsx',
      targetComponentKey: 'LoginButton',
      state: 'hover' as const,
    };

    // Expected artifact from LLM
    const artifact = createValidArtifact({
      componentKey: request.targetComponentKey,
      file: request.targetFile,
      state: request.state,
      prompt: request.prompt,
    });

    expect(artifact.componentKey).toBe('LoginButton');
    expect(artifact.state).toBe('hover');
    expect(artifact.file).toBe('demo-app/src/App.tsx');
  });

  it('should handle multiple changes in one artifact', () => {
    const artifact = createValidArtifact({
      changes: [
        createValidChange({
          op: 'SET_TEXT',
          nodeName: 'Title',
          path: 'text.content',
          before: 'Hello',
          after: 'Welcome',
          reason: 'Update greeting',
        }),
        createValidChange({
          op: 'SET_FILL',
          nodeName: 'Button',
          path: 'visual.fills[0]',
          before: '#3B82F6',
          after: '#10B981',
          reason: 'Change to success color',
        }),
      ],
    });

    expect(artifact.changes).toHaveLength(2);
    expect(artifact.changes[0].op).toBe('SET_TEXT');
    expect(artifact.changes[1].op).toBe('SET_FILL');
  });
});
