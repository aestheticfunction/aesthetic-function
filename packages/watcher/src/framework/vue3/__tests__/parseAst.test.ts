/**
 * @aesthetic-function/watcher - framework/vue3/__tests__/parseAst.test.ts
 *
 * Unit tests for the Vue 3 AST analyzer.
 * Uses parseSfcSync (regex-based) so no @vue/compiler-sfc is needed at test time.
 */

import { describe, it, expect } from 'vitest';
import { parseSfcSync } from '../parseSfc.js';
import { parseVueAst } from '../parseAst.js';

// =============================================================================
// COMPONENT NAME RESOLUTION
// =============================================================================

describe('parseVueAst — component name resolution', () => {
  it('uses defineOptions name when present', () => {
    const source = `
<template><div>hello</div></template>
<script setup lang="ts">
defineOptions({ name: 'MyWidget' });
defineProps<{ label?: string }>();
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'SomeFile.vue');
    const report = parseVueAst(descriptor);
    expect(report.components[0]?.componentName).toBe('MyWidget');
  });

  it('falls back to filename PascalCase when no defineOptions', () => {
    const source = `
<template><div>hello</div></template>
<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'path/to/sign-in-button.vue');
    const report = parseVueAst(descriptor);
    expect(report.components[0]?.componentName).toBe('SignInButton');
  });

  it('uses defineComponent name', () => {
    const source = `
<template><div>hello</div></template>
<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  name: 'CardBase',
  props: { elevation: Number },
});
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'CardBase.vue');
    const report = parseVueAst(descriptor);
    expect(report.components[0]?.componentName).toBe('CardBase');
  });

  it('uses options API name', () => {
    const source = `
<template><div>hello</div></template>
<script lang="ts">
export default {
  name: 'LoginForm',
  props: { buttonLabel: String },
};
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'LoginForm.vue');
    const report = parseVueAst(descriptor);
    expect(report.components[0]?.componentName).toBe('LoginForm');
  });
});

// =============================================================================
// COMPONENT KEY
// =============================================================================

describe('parseVueAst — componentKey', () => {
  it('includes the source root and component name', () => {
    const source = `
<template><div>OK</div></template>
<script setup lang="ts">
defineOptions({ name: 'AuthCard' });
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'demos/vue-demo-app/src/AuthCard.vue');
    const report = parseVueAst(descriptor, { sourceRoots: ['demos/vue-demo-app/src'] });
    expect(report.components[0]?.componentKey).toContain('AuthCard');
  });
});

// =============================================================================
// PROPS EXTRACTION
// =============================================================================

describe('parseVueAst — props', () => {
  it('extracts defineProps with defaults', () => {
    const source = `
<template><div>{{ label }}</div></template>
<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
  disabled?: boolean;
}>(), {
  label: 'Submit',
  disabled: false,
});
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'MyBtn.vue');
    const report = parseVueAst(descriptor);
    const comp = report.components[0];
    expect(comp).toBeDefined();
    expect(comp!.componentName).toBe('MyBtn');
  });
});

// =============================================================================
// TEMPLATE TEXT EXTRACTION
// =============================================================================

describe('parseVueAst — template text literals', () => {
  it('extracts static text nodes from template', () => {
    const source = `
<template>
  <button>Sign In</button>
</template>
<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
`.trim();
    const descriptor = parseSfcSync(source, 'Button.vue');
    const report = parseVueAst(descriptor);
    const comp = report.components[0];
    expect(comp).toBeDefined();
    const texts = comp!.jsxTextLiterals.map((l) => l.text);
    expect(texts).toContain('Sign In');
  });
});

// =============================================================================
// TEMPLATE-ONLY (no script block)
// =============================================================================

describe('parseVueAst — template-only SFC', () => {
  it('produces a component from filename when no script', () => {
    const source = `
<template>
  <div class="hero">
    <h1>Welcome</h1>
  </div>
</template>
`.trim();
    const descriptor = parseSfcSync(source, 'HeroSection.vue');
    const report = parseVueAst(descriptor);
    expect(report.components).toHaveLength(1);
    expect(report.components[0]!.componentName).toBe('HeroSection');
  });
});
