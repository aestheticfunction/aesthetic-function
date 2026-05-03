<template>
  <form class="login-form" @submit.prevent="submit">
    <input v-model="email" type="email" placeholder="Email" />
    <input v-model="password" type="password" placeholder="Password" />
    <button type="submit">{{ buttonLabel }}</button>
  </form>
</template>

<script lang="ts">
// @figma node=LoginForm fill=#F8FAFC

export default {
  name: 'LoginForm',
  props: {
    buttonLabel: {
      type: String,
      default: 'Log In',
    },
  },
  data() {
    return {
      email: '',
      password: '',
    };
  },
  methods: {
    submit() {
      this.$emit('submit', { email: this.email, password: this.password });
    },
  },
};
</script>
