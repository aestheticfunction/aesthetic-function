<template>
  <div class="wrapper">
    <h1>{{ title }}</h1>
    <button :class="['btn', variant]" :disabled="disabled">{{ label }}</button>
  </div>
</template>

<script setup lang="ts">
// @figma node=SignInButton fill=#3B82F6

withDefaults(defineProps<{
  title?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}>(), {
  title: 'Sign In',
  label: 'Continue',
  variant: 'primary',
  disabled: false,
});
</script>

<style scoped>
.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
}
.btn.primary {
  background-color: #3B82F6;
  color: #fff;
}
.btn.secondary {
  background-color: transparent;
  border: 1px solid #3B82F6;
}
</style>
