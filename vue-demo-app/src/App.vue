<template>
  <!--
    vue-demo-app/src/App.vue — AF Vue Demo: Sign-in panel

    Mirrors the React demo-app/src/App.tsx composition exactly.
    Uses @figma markers in BOTH forms:
      - Script markers  (// @figma ...)          → anchor to this SFC component
      - Template markers (<!-- @figma ... -->)   → anchor to the next element

    Cross-surface map:
      node=AuthCard        → Card.vue      → Components/Card       → SDS Card
      node=AuthCardTitle   → Card <h2>     → Components/Card       → SDS Card > Text
      node=EmailInput      → Input.vue     → Components/Input      → SDS Input Field
      node=PasswordInput   → Input.vue     → Components/Input      → SDS Input Field
      node=SignInButton    → Button.vue    → Components/Button     → SDS Button Primary/Default

    AF instructions:
    1. Run the server:  pnpm dev:server           (from repo root)
    2. Run the watcher: WATCH_PATH=vue-demo-app/src pnpm dev:watcher
    3. Edit marker values (fill, text) and save — Figma updates automatically.
  -->

  <div class="page-wrapper">
    <!-- @figma node=AuthCard -->
    <Card title="Sign in" description="Enter your credentials to continue.">
      <!-- @figma node=AuthCardTitle text="Sign in" -->
      <template #default>
        <!-- @figma node=EmailInput fill=#FFFFFF -->
        <Input label="Email" type="email" placeholder="you@example.com" v-model="email" />

        <!-- @figma node=PasswordInput fill=#FFFFFF -->
        <Input label="Password" type="password" placeholder="Enter your password" v-model="password" />

        <!-- @figma node=SignInButton fill=#2C2C2C text="Sign in" -->
        <Button label="Sign in" @click="signIn" />
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue — Vue 3 sign-in panel (AF demo)
 *
 * @figma markers below are script-level: they anchor to this SFC component.
 * Template-level markers (above, in <!-- @figma --> form) anchor to the
 * next sibling element in the template.
 *
 * To add a hover-state variant:
 *   // @figma node=SignInButton::hover fill=#1E1E1E
 */

// @figma node=AuthCard fill=#FFFFFF
// @figma node=AuthCardTitle text="Sign in"
// @figma node=EmailInput fill=#FFFFFF
// @figma node=PasswordInput fill=#FFFFFF
// @figma node=SignInButton fill=#2C2C2C text="Sign in"
// @figma node=SignInButton::hover fill=#1E1E1E

import { ref } from 'vue';
import Card from './components/Card.vue';
import Button from './components/Button.vue';
import Input from './components/Input.vue';

const email = ref('');
const password = ref('');

function signIn() {
  // Replace with real auth logic
  console.log('[AF Demo] Sign in', { email: email.value });
}
</script>

<style scoped>
.page-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f3f4f6;
  font-family: Inter, system-ui, sans-serif;
  padding: 1.5rem;
  box-sizing: border-box;
}
</style>
