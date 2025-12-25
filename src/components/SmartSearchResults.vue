<template>
  <div v-if="false">
    <!-- Stub component - not visible -->
  </div>
</template>

<script setup>
// Stub SmartSearchResults component
defineProps({
  results: {
    type: Object,
    default: () => ({})
  },
  query: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['navigate'])
</script>
