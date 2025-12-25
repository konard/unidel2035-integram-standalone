<template>
  <svg :width="width" :height="height" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
    <rect fill="#fff" width="900" height="600"/>
    <rect fill="#0039a6" y="200" width="900" height="200"/>
    <rect fill="#d52b1e" y="400" width="900" height="200"/>
  </svg>
</template>

<script setup>
defineProps({
  width: {
    type: [String, Number],
    default: 24
  },
  height: {
    type: [String, Number],
    default: 16
  }
})
</script>
