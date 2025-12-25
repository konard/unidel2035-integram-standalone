<template>
  <div class="date-field">
    <div class="flex gap-2">
      <Calendar
        v-if="mode === 'calendar'"
        :id="id"
        :modelValue="computedModelValue"
        @update:modelValue="handleCalendarInput"
        dateFormat="dd.mm.yy"
        class="flex-1"
      />
      <InputText
        v-else
        :id="id"
        :modelValue="modelValue"
        @update:modelValue="handleTextInput"
        placeholder="дд.мм.гггг или [TODAY], [YESTERDAY], и т.д."
        class="flex-1"
      />
      <Button
        icon="pi pi-pencil"
        @click="emit('toggle-mode')"
        size="small"
        text
        rounded
        v-tooltip.top="'Переключить режим ввода'"
      />
      <Button
        icon="pi pi-calendar-plus"
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
  modelValue: [String, Date],
  mode: {
    type: String,
    default: 'calendar' // or 'text'
  }
})

const emit = defineEmits(['update:modelValue', 'toggle-mode'])

const menu = ref()

// Special value items for the dropdown menu
const specialValueItems = ref([
  {
    label: '[TODAY] - Сегодняшний день',
    command: () => setSpecialValue('[TODAY]')
  },
  {
    label: '[YESTERDAY] - Вчерашний день',
    command: () => setSpecialValue('[YESTERDAY]')
  },
  {
    label: '[TOMORROW] - Завтрашний день',
    command: () => setSpecialValue('[TOMORROW]')
  },
  {
    label: '[MONTH_AGO] - День месяц назад',
    command: () => setSpecialValue('[MONTH_AGO]')
  }
])

// Computed model value that resolves special values for calendar mode
const computedModelValue = computed(() => {
  if (typeof props.modelValue === 'string' && props.modelValue.startsWith('[')) {
    // Special value - resolve to actual date for calendar display
    return resolveSpecialValue(props.modelValue)
  }
  return props.modelValue
})

function toggleSpecialValues(event) {
  menu.value.toggle(event)
}

function setSpecialValue(value) {
  emit('update:modelValue', value)
}

function resolveSpecialValue(value) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (value) {
    case '[TODAY]':
      return today
    case '[YESTERDAY]': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return yesterday
    }
    case '[TOMORROW]': {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow
    }
    case '[MONTH_AGO]': {
      const monthAgo = new Date(today)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      return monthAgo
    }
    default:
      return today
  }
}

function formatDateForText(date) {
  if (!date) return ''
  if (typeof date === 'string') return date
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

function handleCalendarInput(value) {
  emit('update:modelValue', value)
}

function handleTextInput(value) {
  // Allow special values to be typed directly
  if (typeof value === 'string' && value.startsWith('[')) {
    emit('update:modelValue', value)
    return
  }

  // Parse dd.mm.yyyy format
  if (typeof value === 'string') {
    const parts = value.split('.')
    if (parts.length === 3) {
      const day = parseInt(parts[0])
      const month = parseInt(parts[1]) - 1
      const year = parseInt(parts[2])
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const date = new Date(year, month, day)
        emit('update:modelValue', date)
        return
      }
    }
  }

  // If not parseable, just emit as-is
  emit('update:modelValue', value)
}
</script>
