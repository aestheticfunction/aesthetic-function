<template>
  <button class="cta">{{ text }}</button>
</template>

<script setup lang="ts">
// @figma node=CtaButton fill=#10B981 text=Get Started

defineProps<{ text?: string }>();
</script>
