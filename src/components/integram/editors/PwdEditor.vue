<template>
  <Password
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    :feedback="false"
    toggleMask
    placeholder="Пароль"
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
