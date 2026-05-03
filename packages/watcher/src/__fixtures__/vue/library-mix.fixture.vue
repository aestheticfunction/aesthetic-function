<template>
  <!-- @figma node=LibButton fill=#6366F1 -->
  <v-btn color="primary" variant="elevated">Submit</v-btn>
</template>

<script setup lang="ts">
// Vue component using Vuetify (library-hint: vuetify)
// No @figma marker here — marker is on the template element above.
defineProps<{ label?: string }>();
</script>
