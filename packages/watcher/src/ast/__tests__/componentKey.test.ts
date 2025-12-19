/**
 * @aesthetic-function/watcher - ast/__tests__/componentKey.test.ts
 *
 * Tests for componentKey derivation (Phase 8D).
 */

import { describe, it, expect } from 'vitest';
import {
  computeComponentKey,
  DEFAULT_COMPONENT_KEY_ROOT,
} from '../types.js';
import { parseIntentFromReactAst, anchorMarkersToAst } from '../parseIntentFromReactAst.js';

describe('computeComponentKey', () => {
  describe('path normalization', () => {
    it('computes key for component at root of src', () => {
      const key = computeComponentKey('demo-app/src/Card.tsx', 'Card');
      expect(key).toBe('Card');
    });

    it('computes key for component in subdirectory', () => {
      const key = computeComponentKey('demo-app/src/auth/LoginButton.tsx', 'LoginButton');
      expect(key).toBe('auth/LoginButton');
    });

    it('computes key for component in nested subdirectory', () => {
      const key = computeComponentKey(
        'demo-app/src/components/forms/InputField.tsx',
        'InputField'
      );
      expect(key).toBe('components/forms/InputField');
    });

    it('handles absolute paths', () => {
      const key = computeComponentKey(
        '/Users/dev/project/demo-app/src/auth/LoginButton.tsx',
        'LoginButton'
      );
      expect(key).toBe('auth/LoginButton');
    });

    it('handles Windows-style paths', () => {
      const key = computeComponentKey(
        'C:\\project\\demo-app\\src\\auth\\LoginButton.tsx',
        'LoginButton'
      );
      expect(key).toBe('auth/LoginButton');
    });
  });

  describe('extension handling', () => {
    it('handles .tsx extension', () => {
      const key = computeComponentKey('demo-app/src/Button.tsx', 'Button');
      expect(key).toBe('Button');
    });

    it('handles .ts extension', () => {
      const key = computeComponentKey('demo-app/src/utils/helper.ts', 'helper');
      expect(key).toBe('utils/helper');
    });

    it('handles .jsx extension', () => {
      const key = computeComponentKey('demo-app/src/Button.jsx', 'Button');
      expect(key).toBe('Button');
    });

    it('handles .js extension', () => {
      const key = computeComponentKey('demo-app/src/Button.js', 'Button');
      expect(key).toBe('Button');
    });
  });

  describe('edge cases', () => {
    it('uses exportName when root not found in path', () => {
      const key = computeComponentKey('other-project/src/Button.tsx', 'Button');
      expect(key).toBe('Button');
    });

    it('handles custom root', () => {
      const key = computeComponentKey(
        'other-project/src/auth/LoginButton.tsx',
        'LoginButton',
        'other-project/src'
      );
      expect(key).toBe('auth/LoginButton');
    });

    it('handles component with different name than file', () => {
      // File: Button.tsx, Export: PrimaryButton
      const key = computeComponentKey('demo-app/src/Button.tsx', 'PrimaryButton');
      expect(key).toBe('PrimaryButton');
    });

    it('handles index files', () => {
      const key = computeComponentKey(
        'demo-app/src/components/index.tsx',
        'ComponentLibrary'
      );
      expect(key).toBe('components/ComponentLibrary');
    });
  });

  describe('default root', () => {
    it('uses demo-app/src as default root', () => {
      expect(DEFAULT_COMPONENT_KEY_ROOT).toBe('demo-app/src');
    });
  });
});

describe('componentKey in AST pipeline', () => {
  describe('parseIntentFromReactAst', () => {
    it('populates componentKey for exported components', () => {
      const code = `
        // @figma node=Card
        export function Card() {
          return <div>Card</div>;
        }
      `;

      const report = parseIntentFromReactAst(code, 'demo-app/src/Card.tsx');

      expect(report.components).toHaveLength(1);
      expect(report.components[0].componentName).toBe('Card');
      expect(report.components[0].componentKey).toBe('Card');
      expect(report.components[0].isExported).toBe(true);
    });

    it('does not populate componentKey for non-exported components', () => {
      const code = `
        function InternalHelper() {
          return <div>Helper</div>;
        }
      `;

      const report = parseIntentFromReactAst(code, 'demo-app/src/Helper.tsx');

      expect(report.components).toHaveLength(1);
      expect(report.components[0].componentName).toBe('InternalHelper');
      expect(report.components[0].componentKey).toBeUndefined();
      expect(report.components[0].isExported).toBe(false);
    });

    it('computes componentKey with subdirectory path', () => {
      const code = `
        export function LoginButton() {
          return <button>Login</button>;
        }
      `;

      const report = parseIntentFromReactAst(
        code,
        '/project/demo-app/src/auth/LoginButton.tsx'
      );

      expect(report.components[0].componentKey).toBe('auth/LoginButton');
    });
  });

  describe('anchorMarkersToAst', () => {
    it('propagates componentKey to anchors', () => {
      const code = `
        // @figma node=LoginButton
        export function LoginButton() {
          return <button>Login</button>;
        }
      `;

      const anchored = anchorMarkersToAst(
        code,
        '/project/demo-app/src/auth/LoginButton.tsx'
      );

      expect(anchored.anchors).toHaveLength(1);
      expect(anchored.anchors[0].nodeName).toBe('LoginButton');
      expect(anchored.anchors[0].componentName).toBe('LoginButton');
      expect(anchored.anchors[0].componentKey).toBe('auth/LoginButton');
    });

    it('does not set componentKey when no component matched', () => {
      const code = `
        // @figma node=OrphanMarker
        // No component after this marker
      `;

      const anchored = anchorMarkersToAst(code, 'demo-app/src/Orphan.tsx');

      expect(anchored.anchors).toHaveLength(1);
      expect(anchored.anchors[0].nodeName).toBe('OrphanMarker');
      expect(anchored.anchors[0].componentKey).toBeUndefined();
    });
  });
});
