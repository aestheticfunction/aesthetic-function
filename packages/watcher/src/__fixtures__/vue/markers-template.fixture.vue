<template>
  <!-- @figma node=PrimaryButton fill=#3B82F6 -->
  <button class="btn primary">Sign In</button>

  <!-- @figma node=SecondaryButton fill=#6B7280 -->
  <button class="btn secondary">Cancel</button>
</template>

<script setup lang="ts">
defineProps<{ label?: string }>();
</script>
