<template>
  <button :style="{ backgroundColor: colors.primary }">Confirm</button>
</template>

<script setup lang="ts">
// @figma node=ConfirmButton fill=colors.primary

import { colors } from '@/tokens/colors';

defineProps<{ label?: string }>();
</script>
