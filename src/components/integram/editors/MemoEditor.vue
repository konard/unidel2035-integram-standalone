<template>
  <Textarea
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    rows="5"
    autoResize
    placeholder="Длинный текст"
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
