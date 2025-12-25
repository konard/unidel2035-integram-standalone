<template>
  <DatePicker
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    showTime
    hourFormat="24"
    dateFormat="yy-mm-dd"
    placeholder="Выберите дату и время"
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
