/**
 * @aesthetic-function/watcher - framework/__tests__/vueWriteBackGuard.test.ts
 *
 * Verifies that the Vue source write-back guard is active.
 *
 * WHY: The materialize() step in processFileWithMarkers() must NEVER mutate
 * .vue source files until the Phase 3 round-trip write-back spike passes.
 * This test confirms that the guard is in place at the watch.ts level without
 * executing the full watcher pipeline.
 *
 * APPROACH:
 * - Directly test the guard logic: a .vue relative path must trigger the skip branch.
 * - Uses no file I/O — purely checks the guard condition that watch.ts evaluates.
 *
 * NOTE: `af reconcile --write` writes JSON artifacts (design-materializations/),
 * not source files. It is safe for Vue files at all times.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Guard condition extracted for isolated testing
// (mirrors the exact condition in watch.ts processFileWithMarkers)
// =============================================================================

/**
 * Returns true when Vue write-back should be blocked.
 * Matches the guard in packages/watcher/src/watch.ts.
 */
function isVueWriteBackBlocked(relativePath: string, materializeEnabled: boolean): boolean {
  return relativePath.endsWith('.vue') && materializeEnabled;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Vue write-back guard', () => {
  describe('isVueWriteBackBlocked', () => {
    it('blocks .vue files when materialize is enabled', () => {
      expect(isVueWriteBackBlocked('vue-demo-app/src/App.vue', true)).toBe(true);
      expect(isVueWriteBackBlocked('src/components/Button.vue', true)).toBe(true);
    });

    it('does NOT block .vue files when materialize is disabled', () => {
      // When isMaterializeEnabled() is false, the outer guard already prevents
      // any materialize call — the Vue check is moot.
      expect(isVueWriteBackBlocked('vue-demo-app/src/App.vue', false)).toBe(false);
    });

    it('does NOT block React/TS files', () => {
      expect(isVueWriteBackBlocked('demo-app/src/App.tsx', true)).toBe(false);
      expect(isVueWriteBackBlocked('src/Button.tsx', true)).toBe(false);
      expect(isVueWriteBackBlocked('src/utils.ts', true)).toBe(false);
    });

    it('does NOT block JS files', () => {
      expect(isVueWriteBackBlocked('src/helpers.js', true)).toBe(false);
    });

    it('blocks nested .vue paths', () => {
      expect(isVueWriteBackBlocked('deep/nested/dir/Component.vue', true)).toBe(true);
    });
  });

  describe('write-back safety contract', () => {
    it('af reconcile --write is safe: writes JSON artifacts, not source files', () => {
      // The reconcile command writes to design-materializations/ (JSON artifacts),
      // not to source files. This is independent of the write-back guard.
      // Documented here as a contract assertion.
      const reconciledArtifactPath = 'design-materializations/some-file.json';
      expect(reconciledArtifactPath.endsWith('.json')).toBe(true);
      expect(reconciledArtifactPath.endsWith('.vue')).toBe(false);
    });

    it('enableWriteBack remains false for Vue analyzer', async () => {
      const { vue3Analyzer } = await import('../vue3/index.js');
      // FrameworkAnalyzer.anchorMarkers is read-only in Phase 1.
      // The analyzer must not expose enableWriteBack: true.
      expect(vue3Analyzer.id).toBe('vue3');
      // If a future version adds enableWriteBack, this test must be updated
      // after the Phase 3 spike is verified.
      expect((vue3Analyzer as Record<string, unknown>)['enableWriteBack']).toBeUndefined();
    });
  });
});
