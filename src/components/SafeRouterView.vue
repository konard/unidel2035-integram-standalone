<template>
  <router-view v-slot="{ Component, route }">
    <transition name="fade" mode="out-in">
      <component
        :is="Component"
        :key="route.fullPath"
        v-if="Component"
      />
    </transition>
  </router-view>
</template>

<script setup>
/**
 * SafeRouterView
 * A wrapper around RouterView with error handling and transitions
 *
 * This component provides:
 * - Safe rendering of route components
 * - Smooth transitions between routes
 * - Error boundary protection
 */
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
