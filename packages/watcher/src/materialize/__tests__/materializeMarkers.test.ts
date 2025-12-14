import { describe, it, expect } from 'vitest';
import { computeMarkerEdits, applyMarkerEdits } from '../materializeMarkers.js';
import type { DesignOverrides } from '../../reconcile/types.js';

describe('materializeMarkers', () => {
  describe('computeMarkerEdits', () => {
    it('replaces existing text attribute', () => {
      const content = `// @figma node=LoginButton text="Login" fill=#3B82F6
export function LoginButton() {
  return <button>Login</button>;
}`;
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].lineNumber).toBe(1);
      expect(result.edits[0].nodeName).toBe('LoginButton');
      expect(result.edits[0].newLine).toContain('text="Sign In"');
      expect(result.unapplied).toHaveLength(0);
    });

    it('replaces existing fill attribute', () => {
      const content = `// @figma node=Card fill=#FFFFFF`;
      const overrides: DesignOverrides = {
        Card: {
          nodeId: '5:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#F0F0F0',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].newLine).toBe('// @figma node=Card fill=#F0F0F0');
    });

    it('inserts missing text attribute into existing marker', () => {
      const content = `// @figma node=SubmitButton fill=#3B82F6`;
      const overrides: DesignOverrides = {
        SubmitButton: {
          nodeId: '6:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Submit',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].newLine).toContain('text="Submit"');
      expect(result.edits[0].newLine).toContain('fill=#3B82F6');
    });

    it('inserts missing fill attribute into existing marker', () => {
      const content = `// @figma node=Title text="Hello"`;
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '7:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#FF0000',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].newLine).toContain('fill=#FF0000');
      expect(result.edits[0].newLine).toContain('text="Hello"');
    });

    it('does not modify non-marker lines', () => {
      const content = `const buttonText = "Login";
// @figma node=LoginButton text="Login"
export function LoginButton() {
  return <button>Login</button>;
}`;
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].lineNumber).toBe(2); // Only the marker line
    });

    it('does not modify placeholder marker docs', () => {
      const content = `/**
 * Usage:
 * // @figma node=<FigmaNodeName> text="<Text>"
 */
// @figma node=LoginButton text="Login"`;
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      // Should only edit the real marker, not the placeholder
      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].lineNumber).toBe(5);
      expect(result.edits[0].nodeName).toBe('LoginButton');
    });

    it('tracks unapplied overrides when no matching marker', () => {
      const content = `// @figma node=LoginButton text="Login"`;
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
        },
        NonExistentNode: {
          nodeId: '99:99',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'This should be unapplied',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.unapplied).toEqual(['NonExistentNode']);
    });

    it('handles multiple markers in file', () => {
      const content = `// @figma node=Title text="Old Title"
// Some other code
// @figma node=Button text="Click"`;
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'New Title',
        },
        Button: {
          nodeId: '2:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Press',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(2);
      expect(result.edits[0].lineNumber).toBe(1);
      expect(result.edits[0].newLine).toContain('text="New Title"');
      expect(result.edits[1].lineNumber).toBe(3);
      expect(result.edits[1].newLine).toContain('text="Press"');
    });

    it('does not generate edit when override matches existing value', () => {
      const content = `// @figma node=Title text="Same Text"`;
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Same Text',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(0);
    });

    it('preserves indentation', () => {
      const content = `  // @figma node=Button text="Old"`;
      const overrides: DesignOverrides = {
        Button: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'New',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits[0].newLine).toMatch(/^  \/\/ @figma/);
    });

    it('handles quoted node names', () => {
      const content = `// @figma node="My Button" text="Click"`;
      const overrides: DesignOverrides = {
        'My Button': {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Press',
        },
      };

      const result = computeMarkerEdits(content, overrides);

      expect(result.edits).toHaveLength(1);
      expect(result.edits[0].nodeName).toBe('My Button');
    });
  });

  describe('applyMarkerEdits', () => {
    it('applies single edit', () => {
      const content = `line 1
// @figma node=Button text="Old"
line 3`;
      const edits = [
        {
          lineNumber: 2,
          originalLine: '// @figma node=Button text="Old"',
          newLine: '// @figma node=Button text="New"',
          nodeName: 'Button',
        },
      ];

      const result = applyMarkerEdits(content, edits);

      expect(result).toBe(`line 1
// @figma node=Button text="New"
line 3`);
    });

    it('applies multiple edits', () => {
      const content = `// @figma node=Title text="Old Title"
some code
// @figma node=Button text="Old Button"`;
      const edits = [
        {
          lineNumber: 1,
          originalLine: '// @figma node=Title text="Old Title"',
          newLine: '// @figma node=Title text="New Title"',
          nodeName: 'Title',
        },
        {
          lineNumber: 3,
          originalLine: '// @figma node=Button text="Old Button"',
          newLine: '// @figma node=Button text="New Button"',
          nodeName: 'Button',
        },
      ];

      const result = applyMarkerEdits(content, edits);

      expect(result).toContain('text="New Title"');
      expect(result).toContain('text="New Button"');
    });

    it('returns unchanged content for empty edits', () => {
      const content = `line 1
line 2
line 3`;

      const result = applyMarkerEdits(content, []);

      expect(result).toBe(content);
    });
  });
});
