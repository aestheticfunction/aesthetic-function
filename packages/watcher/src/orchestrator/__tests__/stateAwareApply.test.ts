/**
 * @aesthetic-function/watcher - orchestrator/__tests__/stateAwareApply.test.ts
 *
 * Tests for state-aware apply logic.
 *
 * WHY: Verifies that state-specific changes (hover, pressed, disabled) are
 * routed to markers/overrides instead of base JSX.
 */

import { describe, it, expect } from 'vitest';
import {
  determineApplyTarget,
  hasStateMarker,
  updateStateMarker,
  applyChangeToOverrides,
  filterJsxChanges,
} from '../stateAwareApply.js';
import type { PromptPatchChange, PromptPatchArtifact } from '../types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const SAMPLE_CONTENT = `
// @figma node=LoginButton text="Login" fill=#3B82F6
// @figma node=LoginButton::hover text="Hover" fill=#2563EB
export function LoginButton() {
  return (
    <button style={{ backgroundColor: '#3B82F6' }}>
      Sign In
    </button>
  );
}
`;

const CONTENT_WITHOUT_STATE_MARKER = `
// @figma node=LoginButton text="Login" fill=#3B82F6
export function LoginButton() {
  return (
    <button style={{ backgroundColor: '#3B82F6' }}>
      Sign In
    </button>
  );
}
`;

function createChange(overrides?: Partial<PromptPatchChange>): PromptPatchChange {
  return {
    op: 'SET_TEXT',
    nodeName: 'LoginButton',
    path: 'text.content',
    before: 'Hover',
    after: 'Continue',
    reason: 'Test change',
    ...overrides,
  };
}

// =============================================================================
// TESTS: determineApplyTarget
// =============================================================================

describe('determineApplyTarget', () => {
  it('should route base state changes to JSX', () => {
    const change = createChange();
    const decision = determineApplyTarget(change, 'base', false, false);

    expect(decision.target).toBe('jsx');
    expect(decision.reason).toContain('Base state');
  });

  it('should route hover state changes to marker when marker exists', () => {
    const change = createChange();
    const decision = determineApplyTarget(change, 'hover', true, false);

    expect(decision.target).toBe('marker');
    expect(decision.reason).toContain('has a marker');
    expect(decision.overrideKey).toBe('LoginButton::hover');
  });

  it('should route hover state changes to override when no marker exists', () => {
    const change = createChange();
    const decision = determineApplyTarget(change, 'hover', false, false);

    expect(decision.target).toBe('override');
    expect(decision.reason).toContain('design-overrides.json');
    expect(decision.overrideKey).toBe('LoginButton::hover');
  });

  it('should route hover state changes to JSX when explicit JSX branch exists', () => {
    const change = createChange();
    const decision = determineApplyTarget(change, 'hover', false, true);

    expect(decision.target).toBe('jsx');
    expect(decision.reason).toContain('explicit JSX representation');
  });

  it('should prefer marker over override when both could apply', () => {
    const change = createChange();
    const decision = determineApplyTarget(change, 'pressed', true, false);

    expect(decision.target).toBe('marker');
  });
});

// =============================================================================
// TESTS: hasStateMarker
// =============================================================================

describe('hasStateMarker', () => {
  it('should return true when state marker exists', () => {
    expect(hasStateMarker(SAMPLE_CONTENT, 'LoginButton', 'hover')).toBe(true);
  });

  it('should return false when state marker does not exist', () => {
    expect(hasStateMarker(SAMPLE_CONTENT, 'LoginButton', 'pressed')).toBe(false);
  });

  it('should return false for base state', () => {
    expect(hasStateMarker(SAMPLE_CONTENT, 'LoginButton', 'base')).toBe(false);
  });

  it('should return false when node name does not match', () => {
    expect(hasStateMarker(SAMPLE_CONTENT, 'TestBox', 'hover')).toBe(false);
  });

  it('should be case-insensitive for marker matching', () => {
    const content = `// @figma node=LoginButton::HOVER text="Hover"`;
    expect(hasStateMarker(content, 'LoginButton', 'hover')).toBe(true);
  });
});

// =============================================================================
// TESTS: updateStateMarker
// =============================================================================

describe('updateStateMarker', () => {
  it('should update text in existing marker', () => {
    const change = createChange({ op: 'SET_TEXT', after: 'Continue' });
    const result = updateStateMarker(SAMPLE_CONTENT, 'LoginButton', 'hover', change);

    expect(result).not.toBeNull();
    expect(result).toContain('text="Continue"');
    expect(result).toContain('node=LoginButton::hover');
  });

  it('should update fill in existing marker', () => {
    const change = createChange({ op: 'SET_FILL', after: '#10B981' });
    const result = updateStateMarker(SAMPLE_CONTENT, 'LoginButton', 'hover', change);

    expect(result).not.toBeNull();
    expect(result).toContain('fill=#10B981');
  });

  it('should return null when marker does not exist', () => {
    const change = createChange();
    const result = updateStateMarker(SAMPLE_CONTENT, 'LoginButton', 'pressed', change);

    expect(result).toBeNull();
  });

  it('should return null for base state', () => {
    const change = createChange();
    const result = updateStateMarker(SAMPLE_CONTENT, 'LoginButton', 'base', change);

    expect(result).toBeNull();
  });

  it('should add text if not present in marker', () => {
    const content = `// @figma node=LoginButton::hover fill=#2563EB`;
    const change = createChange({ op: 'SET_TEXT', after: 'Continue' });
    const result = updateStateMarker(content, 'LoginButton', 'hover', change);

    expect(result).not.toBeNull();
    expect(result).toContain('text="Continue"');
  });

  it('should add fill if not present in marker', () => {
    const content = `// @figma node=LoginButton::hover text="Hover"`;
    const change = createChange({ op: 'SET_FILL', after: '#10B981' });
    const result = updateStateMarker(content, 'LoginButton', 'hover', change);

    expect(result).not.toBeNull();
    expect(result).toContain('fill=#10B981');
  });
});

// =============================================================================
// TESTS: applyChangeToOverrides
// =============================================================================

describe('applyChangeToOverrides', () => {
  it('should create new override entry for text change', () => {
    const change = createChange({ op: 'SET_TEXT', after: 'Continue' });
    const result = applyChangeToOverrides({}, change, 'LoginButton::hover');

    expect(result['LoginButton::hover']).toBeDefined();
    expect(result['LoginButton::hover'].text).toBe('Continue');
    expect(result['LoginButton::hover'].nodeId).toBeDefined();
    expect(result['LoginButton::hover'].lastUpdated).toBeDefined();
  });

  it('should create new override entry for fill change', () => {
    const change = createChange({ op: 'SET_FILL', after: '#10B981' });
    const result = applyChangeToOverrides({}, change, 'LoginButton::hover');

    expect(result['LoginButton::hover'].fill).toBe('#10B981');
  });

  it('should create new override entry for layout change', () => {
    const change = createChange({
      op: 'SET_LAYOUT',
      after: 16,
      layoutKey: 'padding',
    });
    const result = applyChangeToOverrides({}, change, 'LoginButton::hover');

    expect(result['LoginButton::hover'].layout).toBeDefined();
    expect(result['LoginButton::hover'].layout?.padding).toBe(16);
  });

  it('should update existing override entry', () => {
    const existing = {
      'LoginButton::hover': {
        nodeId: 'existing-id',
        lastUpdated: '2024-01-01T00:00:00Z',
        text: 'Old Text',
      },
    };
    const change = createChange({ op: 'SET_TEXT', after: 'New Text' });
    const result = applyChangeToOverrides(existing, change, 'LoginButton::hover');

    expect(result['LoginButton::hover'].text).toBe('New Text');
    expect(result['LoginButton::hover'].nodeId).toBe('existing-id');
  });

  it('should preserve other overrides', () => {
    const existing = {
      'OtherNode': {
        nodeId: 'other-id',
        lastUpdated: '2024-01-01T00:00:00Z',
        text: 'Other',
      },
    };
    const change = createChange({ op: 'SET_TEXT', after: 'Continue' });
    const result = applyChangeToOverrides(existing, change, 'LoginButton::hover');

    expect(result['OtherNode']).toBeDefined();
    expect(result['OtherNode'].text).toBe('Other');
    expect(result['LoginButton::hover']).toBeDefined();
  });
});

// =============================================================================
// TESTS: filterJsxChanges
// =============================================================================

describe('filterJsxChanges', () => {
  it('should return all changes for base state', () => {
    const artifact: PromptPatchArtifact = {
      file: 'test.tsx',
      generatedAt: new Date().toISOString(),
      prompt: 'test',
      componentKey: 'LoginButton',
      state: 'base',
      changes: [createChange()],
      skipped: [],
    };

    const result = filterJsxChanges(artifact, SAMPLE_CONTENT);
    expect(result).toHaveLength(1);
  });

  it('should filter out hover changes when marker exists', () => {
    const artifact: PromptPatchArtifact = {
      file: 'test.tsx',
      generatedAt: new Date().toISOString(),
      prompt: 'test',
      componentKey: 'LoginButton',
      state: 'hover',
      changes: [createChange()],
      skipped: [],
    };

    const result = filterJsxChanges(artifact, SAMPLE_CONTENT);
    expect(result).toHaveLength(0); // Hover changes go to marker, not JSX
  });

  it('should filter out hover changes even without marker (goes to override)', () => {
    const artifact: PromptPatchArtifact = {
      file: 'test.tsx',
      generatedAt: new Date().toISOString(),
      prompt: 'test',
      componentKey: 'LoginButton',
      state: 'hover',
      changes: [createChange()],
      skipped: [],
    };

    const result = filterJsxChanges(artifact, CONTENT_WITHOUT_STATE_MARKER);
    expect(result).toHaveLength(0); // Hover changes go to override, not JSX
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('State-aware apply integration', () => {
  it('should correctly identify state routing for hover request', () => {
    // Simulate what happens when user runs:
    // --state hover --prompt "Change label to Continue"
    const change = createChange();

    // Check marker exists
    const markerExists = hasStateMarker(SAMPLE_CONTENT, 'LoginButton', 'hover');
    expect(markerExists).toBe(true);

    // Determine target
    const decision = determineApplyTarget(change, 'hover', markerExists, false);
    expect(decision.target).toBe('marker');
    expect(decision.overrideKey).toBe('LoginButton::hover');
  });

  it('should route to override when no marker for state', () => {
    const change = createChange();

    // Check marker does not exist
    const markerExists = hasStateMarker(CONTENT_WITHOUT_STATE_MARKER, 'LoginButton', 'hover');
    expect(markerExists).toBe(false);

    // Determine target
    const decision = determineApplyTarget(change, 'hover', markerExists, false);
    expect(decision.target).toBe('override');
  });

  it('should allow JSX changes for base state', () => {
    const change = createChange();

    // Determine target for base state
    const decision = determineApplyTarget(change, 'base', false, false);
    expect(decision.target).toBe('jsx');
  });
});
