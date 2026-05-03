<template>
  <div class="panel" :style="{ background: panelBg }">
    <button class="action-btn">Submit</button>
  </div>
</template>

<script setup lang="ts">
// @figma node=Panel fill=var(--color-surface)

defineProps<{ panelBg?: string }>();
</script>

<style scoped>
:root {
  --color-surface: #f9fafb;
  --color-primary: #3b82f6;
}

.panel {
  background: var(--color-surface);
  padding: 1.5rem;
  border-radius: 8px;
}

.action-btn {
  background: var(--color-primary);
  color: #fff;
}
</style>
