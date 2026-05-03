<template>
  <div class="input-group">
    <label :for="inputId" class="input-label">{{ label }}</label>
    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      class="input-field"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Input — SDS-faithful.
 *
 * Mirrors demo-app/src/Input.tsx:
 *   Text/Default/Default      → #1E1E1E (label)
 *   Background/Default        → #FFFFFF (input bg)
 *   Border/Default/Default    → #D9D9D9, 1px (input border)
 *   Text/Default/Tertiary     → #B3B3B3 (placeholder)
 *   Radius/200                → 8px
 *   Space/400                 → 16px horizontal padding
 *   Space/300                 → 12px vertical padding
 *   Space/200                 → 8px gap label→input
 *   Body/Size Medium          → 16px Inter Regular
 *
 * No @figma markers here — markers live in App.vue only.
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  label?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password';
  modelValue?: string;
}>(), {
  label: 'Label',
  placeholder: 'Value',
  type: 'text',
  modelValue: '',
});

defineEmits<{ 'update:modelValue': [value: string] }>();

const model = computed({
  get: () => props.modelValue,
  set: (v) => { /* emitted via v-model binding */ },
});

// Stable ID for label↔input association
const inputId = computed(() =>
  `input-${props.label?.toLowerCase().replace(/\s+/g, '-') ?? 'field'}`
);
</script>

<style scoped>
.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
  width: 100%;
}

.input-label {
  color: #1e1e1e;
  font-size: 16px;
  font-family: Inter, system-ui, sans-serif;
  font-weight: 400;
  line-height: 1.4;
}

.input-field {
  background-color: #ffffff;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  font-family: Inter, system-ui, sans-serif;
  font-weight: 400;
  color: #1e1e1e;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
}

.input-field::placeholder {
  color: #b3b3b3;
}

.input-field:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
</style>
