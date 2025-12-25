<template>
  <!-- Image Preview Dialog -->
  <Dialog
    :visible="visible"
    :header="filename"
    :style="{ width: 'auto', maxWidth: '90vw' }"
    :modal="true"
    :dismissableMask="true"
    class="image-preview-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="image-preview-container">
      <img
        :src="imageUrl"
        :alt="filename"
        class="image-preview-img"
        @error="$emit('error')"
      />
    </div>
    <template #footer>
      <Button label="Скачать" icon="pi pi-download" @click="$emit('download')" />
      <Button label="Закрыть" icon="pi pi-times" @click="$emit('update:visible', false)" text />
    </template>
  </Dialog>
</template>

<script setup>
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  imageUrl: {
    type: String,
    default: ''
  },
  filename: {
    type: String,
    default: 'Изображение'
  }
})

defineEmits(['update:visible', 'download', 'error'])
</script>

<style scoped>
.image-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 70vh;
  overflow: auto;
}

.image-preview-img {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

:deep(.image-preview-dialog .p-dialog-content) {
  padding: 1rem;
}
</style>
