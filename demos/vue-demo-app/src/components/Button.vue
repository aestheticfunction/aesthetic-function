<template>
  <button
    class="btn"
    :class="{ 'btn--disabled': disabled }"
    :disabled="disabled"
    type="button"
    @click="$emit('click')"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    :style="hovered && !disabled ? { backgroundColor: '#1e1e1e' } : {}"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
/**
 * Button — SDS-faithful, Primary variant.
 *
 * Mirrors demo-app/src/Button.tsx:
 *   Background/Brand/Default  → #2C2C2C (Default)
 *   Background/Brand/Hover    → #1E1E1E (Hover)
 *   Background/Disabled       → #D9D9D9 (disabled)
 *   Text/Brand/On Brand       → #F5F5F5
 *   Border/Brand/Default      → #2C2C2C, 1px
 *   Radius/200                → 8px
 *   Space/300                 → 12px padding
 *   Body/Size Medium          → 16px Inter Regular
 *
 * No @figma markers here — markers live in App.vue only.
 */
import { ref } from 'vue';

withDefaults(defineProps<{
  label?: string;
  disabled?: boolean;
}>(), {
  label: 'Button',
  disabled: false,
});

defineEmits<{ click: [] }>();

const hovered = ref(false);
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background-color: #2c2c2c;
  color: #f5f5f5;
  border: 1px solid #2c2c2c;
  border-radius: 8px;
  font-size: 16px;
  font-family: Inter, system-ui, sans-serif;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  width: 100%;
  transition: background-color 0.15s;
}

.btn--disabled {
  background-color: #d9d9d9;
  color: #b3b3b3;
  border-color: #b3b3b3;
  cursor: not-allowed;
}
</style>
