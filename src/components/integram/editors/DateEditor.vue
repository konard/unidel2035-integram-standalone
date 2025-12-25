<template>
  <DatePicker
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    dateFormat="yy-mm-dd"
    placeholder="Выберите дату"
    showIcon
  />
</template>

<script setup>

defineProps({
  modelValue: [String, Date],
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])
</script>
