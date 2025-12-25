<template>
    <div class="component-loader-wrapper">
      <div v-if="isLoading" class="component-loader-overlay">
        <ProgressSpinner
          style="width: 50px; height: 50px"
          strokeWidth="4"
          animationDuration=".5s"
          :style="{ color: 'var(--primary-color)' }"
        />
      </div>
      <slot />
    </div>
  </template>

  <script>
  import { ref } from 'vue'
  import { registerLoaderCallbacks } from '@/axios2'

  export default {
    name: 'ComponentLoader',
    setup() {
      const isLoading = ref(false)
      const loaderId = Symbol()

      const show = () => isLoading.value = true
      const hide = () => isLoading.value = false

      registerLoaderCallbacks(show, hide, loaderId)

      return { isLoading }
    }
  }
  </script>

  <style scoped>
  .component-loader-wrapper {
    position: relative;
    min-height: 100px;
  }

  .component-loader-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    border-radius: 4px;
  }

  :deep(.p-progress-spinner-circle) {
    stroke: var(--primary-color) !important;
  }
  </style>
