<template>
  <div class="card">
    <div class="card-header">
      <h2 class="card-title">{{ title }}</h2>
      <p v-if="description" class="card-description">{{ description }}</p>
    </div>
    <div class="card-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Card — SDS-faithful layout, simplified anatomy.
 *
 * Mirrors demo-app/src/Card.tsx:
 *   No background fill         (SDS card frame has no fill)
 *   Space/400 → 16px           gap between header and body
 *   Space/200 → 8px            gap between title and description
 *   Max-width 440px            (SDS card fixed width)
 *   Body/Size Medium → 16px Inter Regular
 *
 * No @figma markers here — markers live in App.vue only.
 */
defineProps<{
  /** Card heading — maps to @figma node=AuthCardTitle in App.vue */
  title: string;
  /** Optional subtitle below the title */
  description?: string;
}>();
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 440px;
  width: 100%;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  margin: 0;
  font-size: 24px;
  font-family: Inter, system-ui, sans-serif;
  font-weight: 600;
  color: #1e1e1e;
  line-height: 1.2;
}

.card-description {
  margin: 0;
  font-size: 16px;
  font-family: Inter, system-ui, sans-serif;
  font-weight: 400;
  color: #6b7280;
  line-height: 1.5;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
