<template>
  <section class="panel">
    <header class="panel__header">Settings</header>
    <div class="panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
// @figma node=SettingsPanel fill=#F3F4F6

defineProps<{ title?: string }>();
</script>

<style scoped>
/* Scoped styles — only apply to this component */
.panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.panel__header {
  background: #f3f4f6;
  padding: 0.75rem 1rem;
  font-weight: 600;
  font-size: 0.875rem;
}

.panel__body {
  padding: 1rem;
}
</style>
