<template>
  <!-- Change Parent Dialog -->
  <Dialog
    :visible="visible"
    header="Изменить подчинённость"
    :style="{ width: '500px' }"
    :modal="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="change-parent-content">
      <p class="mb-3">
        <strong>Запись:</strong> {{ rowDisplayName }}
      </p>
      <div class="field mb-4">
        <label for="newParentSelect" class="block mb-2">Выберите родительскую запись:</label>
        <Dropdown
          id="newParentSelect"
          :modelValue="modelValue"
          @update:modelValue="$emit('update:modelValue', $event)"
          :options="parentOptions"
          optionLabel="name"
          optionValue="id"
          placeholder="Выберите запись..."
          class="w-full"
          filter
          filterPlaceholder="Поиск..."
          showClear
          :emptyMessage="parentOptions.length === 0 ? 'Нет доступных записей' : 'Ничего не найдено'"
        />
      </div>
    </div>
    <template #footer>
      <Button label="Отмена" icon="pi pi-times" @click="$emit('cancel')" text />
      <Button
        label="Сделать независимой"
        icon="pi pi-link"
        @click="$emit('make-independent')"
        severity="secondary"
      />
      <Button
        label="Переподчинить"
        icon="pi pi-check"
        @click="$emit('confirm')"
        :disabled="!modelValue"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  modelValue: {
    type: [String, Number],
    default: null
  },
  row: {
    type: Object,
    default: null
  },
  parentOptions: {
    type: Array,
    default: () => []
  },
  firstHeaderId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'update:modelValue', 'confirm', 'make-independent', 'cancel'])

const rowDisplayName = computed(() => {
  if (!props.row) return ''
  if (props.firstHeaderId && props.row.cells?.[props.firstHeaderId]?.value) {
    return props.row.cells[props.firstHeaderId].value
  }
  return props.row.id
})
</script>

<style scoped>
.change-parent-content {
  display: flex;
  flex-direction: column;
}

.field {
  display: flex;
  flex-direction: column;
}
</style>
