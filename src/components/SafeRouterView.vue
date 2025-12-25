<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" v-if="Component" />
  </router-view>
</template>

<script setup>
/**
 * SafeRouterView
 *
 * A wrapper around router-view that safely handles component rendering
 * Prevents errors when components are not properly loaded
 */
</script>
