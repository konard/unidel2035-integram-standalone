<script setup>
import { useLogo } from '@/composables/useLogo'
import { computed } from 'vue'

const props = defineProps({
  width: {
    type: String,
    default: '200'
  },
  height: {
    type: String,
    default: '40'
  }
})

const { getCurrentColor, getCurrentPreset, isCustomLogo, isPresetLogo, isDynamicLogo, getLogoSvg } =
  useLogo()

const logoColor = computed(() => getCurrentColor.value || 'var(--primary-color)')
</script>

<template>
  <!-- Custom SVG Logo -->
  <div v-if="isCustomLogo && getLogoSvg" v-html="getLogoSvg" class="custom-logo-container"></div>

  <!-- Preset Logo from file -->
  <img
    v-else-if="isPresetLogo && getCurrentPreset"
    :src="getCurrentPreset.file"
    :alt="getCurrentPreset.label"
    :style="{ height: height + 'px', width: 'auto' }"
    class="preset-logo"
  />

  <!-- Dynamic Integram Logo with color -->
  <svg
    v-else
    :width="width"
    :height="height"
    viewBox="0 0 300 60"
    xmlns="http://www.w3.org/2000/svg"
    style="overflow: visible"
  >
    <text
      x="5"
      y="45"
      :fill="logoColor"
      font-family="Arial, Helvetica, sans-serif"
      font-size="48"
      font-weight="bold"
      letter-spacing="2"
    >
      INTEGRAM
    </text>
  </svg>
</template>

<style scoped>
.custom-logo-container {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  max-height: 100%;
}

.custom-logo-container :deep(svg) {
  max-width: 100%;
  max-height: 100%;
}

.preset-logo {
  display: block;
  object-fit: contain;
}
</style>
