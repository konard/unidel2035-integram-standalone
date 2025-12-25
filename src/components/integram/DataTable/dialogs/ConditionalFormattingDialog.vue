<template>
  <!-- Conditional Formatting Dialog (Phase 2) -->
  <Dialog
    :visible="visible"
    header="🎨 Условное форматирование"
    :style="{ width: '500px' }"
    :modal="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="formatting-dialog-content" v-if="rule">
      <div class="field mb-3">
        <label class="block mb-2 font-semibold">Условие</label>
        <Dropdown
          :modelValue="rule.condition"
          @update:modelValue="updateRule('condition', $event)"
          :options="conditionOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Выберите условие..."
          class="w-full"
        />
      </div>

      <div class="field mb-3" v-if="!['empty', 'notEmpty'].includes(rule.condition)">
        <label class="block mb-2 font-semibold">Значение</label>
        <InputText
          :modelValue="rule.value"
          @update:modelValue="updateRule('value', $event)"
          placeholder="Введите значение..."
          class="w-full"
        />
      </div>

      <div class="field mb-3">
        <label class="block mb-2 font-semibold">Цвет фона</label>
        <div class="flex gap-2 flex-wrap">
          <div
            v-for="color in backgroundColors"
            :key="color"
            class="color-box"
            :style="{ backgroundColor: color }"
            :class="{ 'selected': rule.backgroundColor === color }"
            @click="updateRule('backgroundColor', color)"
          ></div>
        </div>
      </div>

      <div class="field mb-3">
        <label class="block mb-2 font-semibold">Цвет текста</label>
        <div class="flex gap-2 flex-wrap">
          <div
            v-for="color in textColors"
            :key="color"
            class="color-box"
            :style="{ backgroundColor: color }"
            :class="{ 'selected': rule.textColor === color }"
            @click="updateRule('textColor', color)"
          ></div>
        </div>
      </div>

      <div
        class="preview-box p-3 border-round"
        :style="{ backgroundColor: rule.backgroundColor, color: rule.textColor }"
      >
        <strong>Предпросмотр:</strong> Образец текста
      </div>

      <!-- List of existing rules -->
      <div v-if="relatedRules.length > 0" class="mt-4">
        <label class="block mb-2 font-semibold">Существующие правила для этой колонки:</label>
        <div
          v-for="existingRule in relatedRules"
          :key="existingRule.id"
          class="existing-rule p-2 mb-2 border-round flex align-items-center justify-content-between"
          :style="{ backgroundColor: existingRule.backgroundColor, color: existingRule.textColor }"
        >
          <span>{{ existingRule.condition }} {{ existingRule.value }}</span>
          <Button
            icon="pi pi-trash"
            text
            severity="danger"
            size="small"
            @click="$emit('delete-rule', existingRule.id)"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <Button label="Отмена" icon="pi pi-times" @click="$emit('cancel')" text />
      <Button label="Применить" icon="pi pi-check" @click="$emit('save')" />
    </template>
  </Dialog>
</template>

<script setup>
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  rule: {
    type: Object,
    default: null
  },
  existingRules: {
    type: Array,
    default: () => []
  },
  conditionOptions: {
    type: Array,
    default: () => [
      { label: 'Больше чем', value: 'greater' },
      { label: 'Меньше чем', value: 'less' },
      { label: 'Равно', value: 'equal' },
      { label: 'Содержит', value: 'contains' },
      { label: 'Пусто', value: 'empty' },
      { label: 'Не пусто', value: 'notEmpty' }
    ]
  },
  backgroundColors: {
    type: Array,
    default: () => ['#dcfce7', '#fef3c7', '#fee2e2', '#dbeafe', '#e9d5ff']
  },
  textColors: {
    type: Array,
    default: () => ['#166534', '#92400e', '#991b1b', '#1e40af', '#6b21a8']
  }
})

const emit = defineEmits(['update:visible', 'update:rule', 'save', 'delete-rule', 'cancel'])

const relatedRules = computed(() => {
  if (!props.rule || !props.rule.headerId) return []
  return props.existingRules.filter(
    r => r.headerId === props.rule.headerId && r.id !== props.rule.id
  )
})

const updateRule = (field, value) => {
  if (!props.rule) return
  const updatedRule = { ...props.rule, [field]: value }
  emit('update:rule', updatedRule)
}
</script>

<style scoped>
.formatting-dialog-content {
  display: flex;
  flex-direction: column;
}

.field {
  display: flex;
  flex-direction: column;
}

.color-box {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.color-box:hover {
  transform: scale(1.1);
}

.color-box.selected {
  border-color: var(--p-primary-color, var(--primary-color));
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.preview-box {
  border: 1px solid var(--p-surface-border, var(--surface-border));
}

.existing-rule {
  border: 1px solid var(--p-surface-border, var(--surface-border));
}
</style>
