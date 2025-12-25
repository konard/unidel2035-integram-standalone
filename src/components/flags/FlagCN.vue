<template>
  <svg :width="width" :height="height" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <path id="star" d="M0,-1 L0.58778,0.80902 L-0.95106,-0.30902 L0.95106,-0.30902 L-0.58778,0.80902 z" fill="#ffde00"/>
    </defs>
    <rect fill="#de2910" width="900" height="600"/>
    <use href="#star" transform="translate(150,150) scale(60)"/>
    <use href="#star" transform="translate(240,60) scale(20) rotate(23.036243)"/>
    <use href="#star" transform="translate(270,120) scale(20) rotate(45.869898)"/>
    <use href="#star" transform="translate(270,180) scale(20) rotate(69.945396)"/>
    <use href="#star" transform="translate(240,240) scale(20) rotate(20.659808)"/>
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
