import { describe, it, expect } from 'vitest';
import { computePatchChanges, getPatchArtifactPath } from '../materializePatch.js';
import type { Intent } from '../../transform/types.js';
import type { DesignOverrides } from '../../reconcile/types.js';

describe('materializePatch', () => {
  describe('computePatchChanges', () => {
    it('generates patch change for text override on TEXT intent', () => {
      const intents: Intent[] = [
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello World' },
      ];
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Welcome to Figma!',
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toEqual({
        node: 'WelcomeText',
        before: { text: 'Hello World' },
        after: { text: 'Welcome to Figma!' },
        source: 'design-overrides.json',
        nodeId: '4:18',
      });
      expect(result.unapplied).toHaveLength(0);
    });

    it('generates patch change for text and fill override on BUTTON intent', () => {
      const intents: Intent[] = [
        { type: 'BUTTON', nodeName: 'LoginButton', text: 'Login', fillTokenOrHex: '#3B82F6' },
      ];
      const overrides: DesignOverrides = {
        LoginButton: {
          nodeId: '4:7',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Sign In',
          fill: '#FF5500',
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toEqual({
        node: 'LoginButton',
        before: { text: 'Login', fill: '#3B82F6' },
        after: { text: 'Sign In', fill: '#FF5500' },
        source: 'design-overrides.json',
        nodeId: '4:7',
      });
    });

    it('does not generate change when override matches code value', () => {
      const intents: Intent[] = [
        { type: 'TEXT', nodeName: 'Title', characters: 'Same Text' },
      ];
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '5:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Same Text', // Same as intent
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(0);
      expect(result.unapplied).toHaveLength(0);
    });

    it('tracks unapplied overrides when no matching intent', () => {
      const intents: Intent[] = [
        { type: 'TEXT', nodeName: 'WelcomeText', characters: 'Hello' },
      ];
      const overrides: DesignOverrides = {
        WelcomeText: {
          nodeId: '4:18',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Welcome!',
        },
        NonExistentNode: {
          nodeId: '99:99',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'This should be unapplied',
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(1);
      expect(result.unapplied).toEqual(['NonExistentNode']);
    });

    it('handles multiple intents and overrides', () => {
      const intents: Intent[] = [
        { type: 'TEXT', nodeName: 'Title', characters: 'Old Title' },
        { type: 'BUTTON', nodeName: 'SubmitBtn', text: 'Submit', fillTokenOrHex: '#000' },
        { type: 'TEXT', nodeName: 'Subtitle', characters: 'Original' },
      ];
      const overrides: DesignOverrides = {
        Title: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'New Title',
        },
        SubmitBtn: {
          nodeId: '2:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#FF0000',
        },
        MissingNode: {
          nodeId: '99:99',
          lastUpdated: '2025-01-01T00:00:00Z',
          text: 'Unapplied',
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].node).toBe('Title');
      expect(result.changes[1].node).toBe('SubmitBtn');
      expect(result.unapplied).toEqual(['MissingNode']);
    });

    it('handles fill-only override', () => {
      const intents: Intent[] = [
        { type: 'BUTTON', nodeName: 'MyButton', fillTokenOrHex: '#000000' },
      ];
      const overrides: DesignOverrides = {
        MyButton: {
          nodeId: '1:1',
          lastUpdated: '2025-01-01T00:00:00Z',
          fill: '#FFFFFF',
        },
      };

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].before).toEqual({ fill: '#000000' });
      expect(result.changes[0].after).toEqual({ fill: '#FFFFFF' });
    });

    it('returns empty changes for empty overrides', () => {
      const intents: Intent[] = [
        { type: 'TEXT', nodeName: 'Title', characters: 'Hello' },
      ];
      const overrides: DesignOverrides = {};

      const result = computePatchChanges(intents, overrides);

      expect(result.changes).toHaveLength(0);
      expect(result.unapplied).toHaveLength(0);
    });
  });

  describe('getPatchArtifactPath', () => {
    it('generates correct path for simple file', () => {
      const result = getPatchArtifactPath('App.tsx', '/repo');
      expect(result).toBe('/repo/design-materializations/App.tsx.patch.json');
    });

    it('replaces path separators with double underscores', () => {
      const result = getPatchArtifactPath('demo-app/src/App.tsx', '/repo');
      expect(result).toBe('/repo/design-materializations/demo-app__src__App.tsx.patch.json');
    });

    it('handles nested paths', () => {
      const result = getPatchArtifactPath('packages/watcher/src/watch.ts', '/home/user/project');
      expect(result).toBe('/home/user/project/design-materializations/packages__watcher__src__watch.ts.patch.json');
    });
  });
});
