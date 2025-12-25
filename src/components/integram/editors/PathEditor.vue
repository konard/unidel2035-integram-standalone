<template>
  <InputText
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    placeholder="/path/to/file"
  />
</template>

<script setup>

defineProps({
  modelValue: String,
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])
</script>
