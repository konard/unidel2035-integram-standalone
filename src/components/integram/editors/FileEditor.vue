<template>
  <div class="flex flex-column gap-2">
    <FileUpload
      mode="basic"
      :auto="false"
      :disabled="disabled"
      @select="onFileSelect"
      chooseLabel="Выбрать файл"
      class="w-full"
    />
    <div v-if="modelValue" class="text-sm text-muted">
      Текущий файл: {{ modelValue }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// PrimeVue Components

const props = defineProps({
  modelValue: String,
  requisite: Object,
  disabled: Boolean
})

const emit = defineEmits(['update:modelValue'])

function onFileSelect(event) {
  const file = event.files[0]
  if (file) {
    // In a real implementation, would upload the file to server
    // and emit the file path/URL
    emit('update:modelValue', file.name)
  }
}
</script>
