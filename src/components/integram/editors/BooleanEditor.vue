<template>
  <Checkbox
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    binary
  />
</template>

<script setup>

defineProps({
  modelValue: Boolean,
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])
</script>
