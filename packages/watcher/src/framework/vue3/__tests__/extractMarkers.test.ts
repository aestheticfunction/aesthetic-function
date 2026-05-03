/**
 * @aesthetic-function/watcher - framework/vue3/__tests__/extractMarkers.test.ts
 *
 * Unit tests for VueMarkerData extraction from Vue SFC descriptors.
 * Uses parseSfcSync (regex-based) so no @vue/compiler-sfc is needed at test time.
 */

import { describe, it, expect } from 'vitest';
import { parseSfcSync } from '../parseSfc.js';
import { extractVueMarkers, hasVueMarkers } from '../extractMarkers.js';

// =============================================================================
// hasVueMarkers
// =============================================================================

describe('hasVueMarkers', () => {
  it('returns true for script markers', () => {
    expect(hasVueMarkers('// @figma node=Foo fill=#ff0000')).toBe(true);
  });

  it('returns true for template comment markers', () => {
    expect(hasVueMarkers('<!-- @figma node=Bar -->')).toBe(true);
  });

  it('returns false when no markers present', () => {
    expect(hasVueMarkers('<template><div>hello</div></template>')).toBe(false);
  });
});

// =============================================================================
// extractVueMarkers — script source
// =============================================================================

describe('extractVueMarkers — script markers', () => {
  const source = `
<template><div>hello</div></template>
<script setup lang="ts">
// @figma node=SignInButton fill=#3B82F6 text="Sign in"
defineProps<{ label?: string }>();
</script>
`.trim();

  it('extracts node, fill, text from script marker', () => {
    const descriptor = parseSfcSync(source, 'SignInButton.vue');
    const markers = extractVueMarkers(descriptor);

    expect(markers).toHaveLength(1);
    const [m] = markers;
    expect(m.node).toBe('SignInButton');
    expect(m.fill).toBe('#3B82F6');
    expect(m.text).toBe('Sign in');
    expect(m.source).toBe('script');
  });

  it('assigns lineNumber > 0', () => {
    const descriptor = parseSfcSync(source, 'SignInButton.vue');
    const [m] = extractVueMarkers(descriptor);
    expect(m.lineNumber).toBeGreaterThan(0);
  });
});

// =============================================================================
// extractVueMarkers — template source
// =============================================================================

describe('extractVueMarkers — template markers', () => {
  const source = `
<template>
  <!-- @figma node=PrimaryButton fill=#3B82F6 -->
  <button class="btn">Click</button>
  <!-- @figma node=SecondaryButton fill=#6B7280 -->
  <button class="btn sec">Cancel</button>
</template>
<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
`.trim();

  it('extracts two template markers', () => {
    const descriptor = parseSfcSync(source, 'Buttons.vue');
    const markers = extractVueMarkers(descriptor);

    expect(markers).toHaveLength(2);
    expect(markers[0].node).toBe('PrimaryButton');
    expect(markers[0].fill).toBe('#3B82F6');
    expect(markers[0].source).toBe('template');
    expect(markers[1].node).toBe('SecondaryButton');
    expect(markers[1].fill).toBe('#6B7280');
  });

  it('sorts markers by lineNumber ascending', () => {
    const descriptor = parseSfcSync(source, 'Buttons.vue');
    const markers = extractVueMarkers(descriptor);
    expect(markers[0].lineNumber).toBeLessThan(markers[1].lineNumber);
  });
});

// =============================================================================
// Mixed script + template markers
// =============================================================================

describe('extractVueMarkers — mixed markers', () => {
  const source = `
<template>
  <!-- @figma node=CtaCard fill=#FFFFFF -->
  <div class="card">
    <!-- @figma node=CtaButton fill=#10B981 -->
    <button>Submit</button>
  </div>
</template>
<script setup lang="ts">
// @figma node=CtaForm fill=#F9FAFB
defineProps<{ label?: string }>();
</script>
`.trim();

  it('extracts three markers total (2 template + 1 script)', () => {
    const descriptor = parseSfcSync(source, 'Cta.vue');
    const markers = extractVueMarkers(descriptor);
    expect(markers).toHaveLength(3);
  });

  it('all markers have node defined', () => {
    const descriptor = parseSfcSync(source, 'Cta.vue');
    const markers = extractVueMarkers(descriptor);
    markers.forEach((m) => expect(m.node).toBeTruthy());
  });
});
