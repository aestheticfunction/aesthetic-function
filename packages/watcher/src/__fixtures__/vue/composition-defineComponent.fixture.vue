<template>
  <div class="card">
    <slot />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

// @figma node=CardBase fill=#FFFFFF

export default defineComponent({
  name: 'CardBase',
  props: {
    elevation: {
      type: Number,
      default: 1,
    },
  },
});
</script>

<style scoped>
.card {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
</style>
