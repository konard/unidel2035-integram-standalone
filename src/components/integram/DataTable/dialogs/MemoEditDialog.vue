<template>
  <!-- MEMO (type 12) and HTML (type 2) Edit Dialog -->
  <Dialog
    :visible="visible"
    :header="header"
    :style="{ width: '600px' }"
    :modal="true"
    @update:visible="$emit('update:visible', $event)"
    @hide="$emit('cancel')"
  >
    <div class="memo-edit-content">
      <Textarea
        ref="textareaRef"
        :modelValue="modelValue"
        @update:modelValue="$emit('update:modelValue', $event)"
        :autoResize="true"
        rows="10"
        class="w-full"
        placeholder="Введите текст..."
        @keydown.enter.stop
        @keydown.ctrl.enter="$emit('save')"
        @keydown.meta.enter="$emit('save')"
      />
      <div class="memo-hint mt-2 text-sm text-color-secondary">
        <i class="pi pi-info-circle mr-1"></i>
        Ctrl+Enter для сохранения
      </div>
    </div>
    <template #footer>
      <Button label="Отмена" icon="pi pi-times" @click="$emit('cancel')" text />
      <Button label="Сохранить" icon="pi pi-check" @click="$emit('save')" />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  modelValue: {
    type: String,
    default: ''
  },
  header: {
    type: String,
    default: 'Редактирование текста'
  }
})

const emit = defineEmits(['update:visible', 'update:modelValue', 'save', 'cancel'])

const textareaRef = ref(null)

// Focus textarea when dialog opens
watch(() => props.visible, (newValue) => {
  if (newValue) {
    nextTick(() => {
      textareaRef.value?.$el?.focus()
    })
  }
})
</script>

<style scoped>
.memo-edit-content {
  display: flex;
  flex-direction: column;
}

.memo-hint {
  color: var(--p-text-color-secondary, var(--text-color-secondary));
}
</style>
