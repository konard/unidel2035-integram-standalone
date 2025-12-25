<template>
  <InputText
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    :maxlength="255"
    placeholder="Короткая строка (до 255 символов)"
  />
</template>

<script setup>

defineProps({
  modelValue: [String, Number],
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])
</script>
