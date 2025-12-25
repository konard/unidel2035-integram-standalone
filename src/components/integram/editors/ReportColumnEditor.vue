<template>
  <Select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="disabled"
    :options="columnOptions"
    optionLabel="label"
    optionValue="value"
    placeholder="Выберите колонку отчета"
    filter
  />
</template>

<script setup>
import { ref, onMounted } from 'vue'

// PrimeVue Components

const props = defineProps({
  modelValue: [String, Number],
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])

const columnOptions = ref([])

onMounted(() => {
  // In a real implementation, would load report columns from API
  // For now, just using empty array
  columnOptions.value = []
})
</script>
