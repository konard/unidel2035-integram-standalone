<template>
  <div class="ai-cell-editor">
    <div class="ai-cell-content">
      <Textarea
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', $event)"
        :disabled="disabled || isGenerating"
        rows="5"
        autoResize
        placeholder="AI-сгенерированный контент..."
        class="ai-cell-textarea"
      />
    </div>
    <div class="ai-cell-actions" v-if="!disabled">
      <Button
        icon="pi pi-play"
        label="Запустить агент"
        :loading="isGenerating"
        @click="runAgent"
        size="small"
        severity="secondary"
        class="run-agent-btn"
      />
      <small class="ai-cell-hint" v-if="requisite?.attrs">
        <i class="pi pi-info-circle"></i>
        {{ getAgentInfo() }}
      </small>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'

const props = defineProps({
  modelValue: String,
  requisite: Object,
  disabled: Boolean,
  rowData: Object // Данные всей строки для подстановки {field_name}
})

const emit = defineEmits(['update:modelValue'])

const isGenerating = ref(false)

// Получить информацию об агенте из attrs
const getAgentInfo = () => {
  if (!props.requisite?.attrs) return 'Настройте инструкции агента в настройках поля'

  try {
    const attrs = JSON.parse(props.requisite.attrs)
    if (attrs.aiInstructions) {
      const preview = attrs.aiInstructions.substring(0, 50)
      return preview.length < attrs.aiInstructions.length ? `${preview}...` : preview
    }
  } catch (e) {
    // Attrs не JSON или нет инструкций
  }

  return 'Настройте инструкции агента в настройках поля'
}

// Запустить AI агента
const runAgent = async () => {
  if (!props.requisite?.attrs) {
    console.warn('No AI instructions configured for this field')
    return
  }

  isGenerating.value = true

  try {
    const attrs = JSON.parse(props.requisite.attrs)
    const instructions = attrs.aiInstructions || ''

    // Заменить {field_name} на значения из rowData
    const processedInstructions = replaceFieldReferences(instructions, props.rowData)

    // TODO: Вызвать AI API
    // Пока что просто симулируем генерацию
    await new Promise(resolve => setTimeout(resolve, 2000))

    const generatedText = `[AI Generated] Инструкции: ${processedInstructions}\n\nЭто демонстрация AI ячейки. Интеграция с реальным AI API требует настройки backend.`

    emit('update:modelValue', generatedText)

  } catch (error) {
    console.error('Error running AI agent:', error)
    emit('update:modelValue', `[Error] ${error.message}`)
  } finally {
    isGenerating.value = false
  }
}

// Заменить {field_name} на фактические значения
const replaceFieldReferences = (text, rowData) => {
  if (!text || !rowData) return text

  return text.replace(/\{([^}]+)\}/g, (match, fieldName) => {
    const fieldValue = rowData[fieldName.trim()]
    return fieldValue !== undefined ? String(fieldValue) : match
  })
}
</script>

<style scoped>
.ai-cell-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.ai-cell-content {
  flex: 1;
}

.ai-cell-textarea {
  font-family: 'Inter var', system-ui, -apple-system, sans-serif;
}

.ai-cell-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.run-agent-btn {
  flex-shrink: 0;
}

.ai-cell-hint {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-cell-hint i {
  flex-shrink: 0;
}
</style>
