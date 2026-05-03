/**
 * @aesthetic-function/watcher - framework/__tests__/parity.test.ts
 *
 * Parity tests: React and Vue 3 analyzers produce structurally compatible
 * outputs for equivalent marker patterns.
 *
 * These tests document the contract between the two analyzers and ensure
 * that downstream consumers (reconciliation, transform) can treat outputs
 * identically regardless of source framework.
 */

import { describe, it, expect } from 'vitest';
import { parseSfcSync } from '../vue3/parseSfc.js';
import { parseVueAst } from '../vue3/parseAst.js';
import { extractVueMarkers } from '../vue3/extractMarkers.js';
import { parseIntentFromReact } from '../../parse/parseIntentFromReact.js';

// =============================================================================
// PARITY: Marker extraction shape
// =============================================================================

describe('Marker extraction parity', () => {
  const reactSource = `
// @figma node=SignInButton fill=#3B82F6 text="Sign in"
export function SignInButton() {
  return <button>Sign in</button>;
}
`.trim();

  const vueSource = `
<template>
  <button>Sign in</button>
</template>
<script setup lang="ts">
// @figma node=SignInButton fill=#3B82F6 text="Sign in"
defineProps<{ label?: string }>();
</script>
`.trim();

  it('React parseIntentFromReact extracts intents', () => {
    const result = parseIntentFromReact(reactSource, 'SignInButton.tsx');
    expect(result.intents.length).toBeGreaterThan(0);
    expect(result.intents[0]?.nodeName).toBe('SignInButton');
  });

  it('Vue extractVueMarkers extracts equivalent marker', () => {
    const descriptor = parseSfcSync(vueSource, 'SignInButton.vue');
    const markers = extractVueMarkers(descriptor);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.node).toBe('SignInButton');
    expect(markers[0]?.fill).toBe('#3B82F6');
    expect(markers[0]?.text).toBe('Sign in');
  });
});

// =============================================================================
// PARITY: AstIntentReport shape
// =============================================================================

describe('AstIntentReport parity', () => {
  it('Vue AstIntentReport has filePath and components array', () => {
    const source = `
<template><button>OK</button></template>
<script setup lang="ts">
defineOptions({ name: 'OkButton' });
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'path/OkButton.vue');
    const report = parseVueAst(descriptor);

    expect(typeof report.filePath).toBe('string');
    expect(Array.isArray(report.components)).toBe(true);
    expect(report.components[0]).toBeDefined();
    expect(typeof report.components[0]!.componentName).toBe('string');
    expect(typeof report.components[0]!.componentKey).toBe('string');
  });
});
