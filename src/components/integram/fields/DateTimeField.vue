<template>
  <div class="datetime-field">
    <div class="flex gap-2">
      <Calendar
        :id="id"
        :modelValue="computedModelValue"
        @update:modelValue="handleCalendarInput"
        showTime
        hourFormat="24"
        :showSeconds="true"
        dateFormat="dd.mm.yy"
        class="flex-1"
      />
      <Button
        icon="pi pi-clock"
        @click="toggleSpecialValues"
        size="small"
        text
        rounded
        v-tooltip.top="'Специальные значения'"
      />
    </div>

    <!-- Special Values Menu -->
    <Menu ref="menu" :model="specialValueItems" :popup="true" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  id: String,
  modelValue: [String, Date]
})

const emit = defineEmits(['update:modelValue'])

const menu = ref()

// Special value items for the dropdown menu (datetime specific)
const specialValueItems = ref([
  {
    label: '[NOW] - Текущие дата и время',
    command: () => setSpecialValue('[NOW]')
  }
])

// Computed model value that resolves special values for calendar mode
const computedModelValue = computed(() => {
  if (typeof props.modelValue === 'string' && props.modelValue === '[NOW]') {
    // Special value - resolve to actual datetime for calendar display
    return new Date()
  }
  return props.modelValue
})

function toggleSpecialValues(event) {
  menu.value.toggle(event)
}

function setSpecialValue(value) {
  emit('update:modelValue', value)
}

function handleCalendarInput(value) {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.datetime-field {
  width: 100%;
}
</style>
