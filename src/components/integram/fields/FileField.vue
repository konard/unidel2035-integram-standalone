<template>
  <div class="file-field">
    <div v-if="currentFile" class="mb-2">
      <div class="flex align-items-center gap-2">
        <a :href="currentFile" target="_blank" class="text-primary">
          {{ currentFile.split('/').pop() }}
        </a>
        <Button
          icon="pi pi-trash"
          @click="confirmDeleteFile = true"
          size="small"
          text
          rounded
          severity="danger"
        />
      </div>
    </div>

    <FileUpload
      :id="id"
      mode="basic"
      :choose-label="currentFile ? 'Заменить файл' : 'Выбрать файл'"
      @select="onFileSelect"
      :auto="false"
      :custom-upload="true"
      class="p-button-outlined"
    />

    <Dialog
      v-model:visible="confirmDeleteFile"
      header="Подтверждение"
      :style="{ width: '350px' }"
      modal
    >
      <p>Удалить файл?</p>
      <template #footer>
        <Button label="Отмена" @click="confirmDeleteFile = false" text />
        <Button label="Удалить" @click="deleteFile" severity="danger" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// PrimeVue Components

const props = defineProps({
  id: String,
  modelValue: [String, File],
  currentFile: String
})

const emit = defineEmits(['update:modelValue', 'delete'])

const confirmDeleteFile = ref(false)

function onFileSelect(event) {
  const file = event.files[0]
  emit('update:modelValue', file)
}

function deleteFile() {
  emit('delete')
  confirmDeleteFile.value = false
}
</script>
