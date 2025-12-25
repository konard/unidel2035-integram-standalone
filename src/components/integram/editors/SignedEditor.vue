<template>
  <InputNumber
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    :use-grouping="false"
    placeholder="Целое число"
  />
</template>

<script setup>

defineProps({
  modelValue: Number,
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])
</script>
