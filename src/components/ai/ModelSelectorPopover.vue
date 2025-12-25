<template>
  <div v-if="false">
    <!-- Stub component - not visible -->
  </div>
</template>

<script setup>
// Stub ModelSelectorPopover component
defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  models: {
    type: Array,
    default: () => []
  },
  currentModel: {
    type: String,
    default: ''
  }
})

defineEmits(['update:visible', 'select'])
</script>
