<template>
  <div class="html-editor">
    <Textarea
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      :disabled="disabled"
      rows="10"
      autoResize
      placeholder="HTML контент"
      class="font-monospace"
    />
    <div v-if="modelValue && !disabled" class="mt-2">
      <Button
        label="Предпросмотр"
        icon="pi pi-eye"
        size="small"
        text
        @click="showPreview = !showPreview"
      />
    </div>
    <div v-if="showPreview && modelValue" class="mt-2 p-3 surface-ground border-round">
      <h6>Предпросмотр:</h6>
      <div v-html="modelValue"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// PrimeVue Components

defineProps({
  modelValue: String,
  requisite: Object,
  disabled: Boolean
})

defineEmits(['update:modelValue'])

const showPreview = ref(false)
</script>

<style scoped>
.font-monospace {
  font-family: 'Courier New', monospace;
}
</style>
