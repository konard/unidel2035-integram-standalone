<template>
  <!-- Button Action Dialog (for BUTTON type columns) - Enhanced with API macro support -->
  <Dialog
    :visible="visible"
    header="Настроить кнопку"
    :style="{ width: '600px' }"
    :modal="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="button-action-content">
      <!-- Button Label Input -->
      <div class="field mb-4">
        <label class="block mb-2 font-semibold text-sm">Текст кнопки</label>
        <InputText
          :modelValue="buttonLabel"
          @update:modelValue="$emit('update:buttonLabel', $event)"
          placeholder="Например: Удалить, Обновить статус..."
          class="w-full"
        />
      </div>

      <!-- Action Selection -->
      <div class="field mb-4">
        <label class="block mb-2 font-semibold text-sm">Действие при клике</label>
      </div>
      <div class="button-action-list mb-4">
        <div
          v-for="action in actions"
          :key="action.id"
          class="button-action-item"
          :class="{
            'selected': selectedAction?.id === action.id,
            'danger': action.danger
          }"
          @click="selectAction(action)"
        >
          <div class="action-icon">
            <i :class="action.icon"></i>
          </div>
          <div class="action-info">
            <div class="action-label">{{ action.label }}</div>
            <div class="action-description">{{ action.description }}</div>
            <div v-if="action.endpoint" class="action-endpoint">
              <code>{{ action.method || 'POST' }} {{ action.endpoint }}</code>
            </div>
          </div>
          <div v-if="selectedAction?.id === action.id" class="action-check">
            <i class="pi pi-check"></i>
          </div>
        </div>
      </div>

      <!-- Advanced Parameters (shown when action is selected) -->
      <div v-if="selectedAction" class="advanced-params">
        <div class="params-header mb-3">
          <i class="pi pi-cog"></i>
          <span>Параметры действия</span>
        </div>

        <!-- Target ID (for API macros) -->
        <div v-if="selectedAction.actionType === 'api-macro'" class="field mb-3">
          <label class="block mb-2 text-sm">
            <strong>ID строки:</strong>
            <span class="text-color-secondary ml-2">([ID] = текущая строка, или укажите конкретный ID)</span>
          </label>
          <InputText
            :modelValue="actionParams.targetId"
            @update:modelValue="updateParam('targetId', $event)"
            placeholder="[ID] или 995882"
            class="w-full font-mono"
          />
        </div>

        <!-- Dynamic Parameters based on action.params -->
        <div
          v-for="paramName in selectedAction.params || []"
          :key="paramName"
          class="field mb-3"
        >
          <label class="block mb-2 text-sm">
            <strong>{{ selectedAction.paramLabels?.[paramName] || paramName }}:</strong>
          </label>
          <InputText
            v-if="paramName !== 'customUrl'"
            :modelValue="actionParams[paramName]"
            @update:modelValue="updateParam(paramName, $event)"
            :placeholder="getParamPlaceholder(paramName)"
            class="w-full font-mono"
          />
          <Textarea
            v-else
            :modelValue="actionParams[paramName]"
            @update:modelValue="updateParam(paramName, $event)"
            :placeholder="getParamPlaceholder(paramName)"
            class="w-full font-mono"
            rows="3"
          />
          <small class="text-color-secondary mt-1 block">
            {{ getParamHint(paramName) }}
          </small>
        </div>

        <!-- Preview URL/Endpoint -->
        <div v-if="selectedAction.endpoint || selectedAction.actionType === 'custom-url'" class="preview-section mt-4 p-3">
          <div class="preview-label mb-2">
            <i class="pi pi-eye"></i>
            <span>Предпросмотр:</span>
          </div>
          <code class="preview-code">{{ previewEndpoint }}</code>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Отмена" icon="pi pi-times" @click="$emit('cancel')" text />
      <Button
        label="Применить"
        icon="pi pi-check"
        @click="$emit('confirm', { action: selectedAction, params: actionParams })"
        :disabled="!selectedAction || !isValid"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  buttonLabel: {
    type: String,
    default: ''
  },
  selectedAction: {
    type: Object,
    default: null
  },
  actions: {
    type: Array,
    default: () => []
  },
  initialParams: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:visible', 'update:buttonLabel', 'update:selectedAction', 'confirm', 'cancel'])

// Action parameters
const actionParams = ref({
  targetId: '[ID]',
  headerId: '',
  value: '',
  parentId: '',
  customUrl: ''
})

// Select action and reset params
function selectAction(action) {
  emit('update:selectedAction', action)
  // Reset params with defaults
  actionParams.value = {
    targetId: '[ID]',
    headerId: '',
    value: '',
    parentId: '',
    customUrl: '',
    ...props.initialParams
  }
}

// Update param value
function updateParam(paramName, value) {
  actionParams.value[paramName] = value
}

// Get param placeholder
function getParamPlaceholder(paramName) {
  const placeholders = {
    headerId: '995832 (ID столбца из URL)',
    value: 'Новое значение или [VAL]',
    parentId: '995870 (ID родительской строки)',
    customUrl: 'api/my-action/[ID]?value=[VAL]'
  }
  return placeholders[paramName] || ''
}

// Get param hint
function getParamHint(paramName) {
  const hints = {
    headerId: 'ID столбца можно найти в URL при клике на заголовок',
    value: 'Можно использовать [VAL] для значения первого столбца',
    parentId: 'ID строки, к которой нужно переместить объект',
    customUrl: 'Используйте [ID] для ID строки и [VAL] для значения'
  }
  return hints[paramName] || ''
}

// Preview endpoint with substituted params
const previewEndpoint = computed(() => {
  if (!props.selectedAction) return ''

  if (props.selectedAction.actionType === 'custom-url') {
    return actionParams.value.customUrl || 'Укажите URL'
  }

  let endpoint = props.selectedAction.endpoint || ''

  // Substitute targetId
  if (actionParams.value.targetId) {
    endpoint = endpoint.replace('[ID]', actionParams.value.targetId)
  }

  // Add params
  const params = []
  if (actionParams.value.headerId) {
    params.push(`headerId=${actionParams.value.headerId}`)
  }
  if (actionParams.value.value) {
    params.push(`value=${actionParams.value.value}`)
  }
  if (actionParams.value.parentId) {
    params.push(`parentId=${actionParams.value.parentId}`)
  }

  if (params.length > 0) {
    endpoint += '?' + params.join('&')
  }

  return `${props.selectedAction.method || 'POST'} ${endpoint}`
})

// Validate params
const isValid = computed(() => {
  if (!props.selectedAction) return false

  // For actions with params, check if required params are filled
  const requiredParams = props.selectedAction.params || []

  for (const paramName of requiredParams) {
    if (!actionParams.value[paramName]) {
      return false
    }
  }

  return true
})

// Watch initialParams to reset actionParams when dialog opens
watch(() => props.initialParams, (newParams) => {
  actionParams.value = {
    targetId: '[ID]',
    headerId: '',
    value: '',
    parentId: '',
    customUrl: '',
    ...newParams
  }
}, { deep: true, immediate: true })
</script>

<style scoped>
.button-action-content {
  display: flex;
  flex-direction: column;
}

.field {
  display: flex;
  flex-direction: column;
}

.button-action-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 350px;
  overflow-y: auto;
}

.button-action-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--p-surface-border, var(--surface-border));
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.button-action-item:hover {
  background-color: var(--p-surface-hover, var(--surface-hover));
}

.button-action-item.selected {
  border-color: var(--p-primary-color, var(--primary-color));
  background-color: var(--p-highlight-background, var(--highlight-bg));
}

.button-action-item.danger {
  border-color: var(--p-red-500, #ef4444);
}

.action-icon {
  font-size: 1.5rem;
  color: var(--p-primary-color, var(--primary-color));
  flex-shrink: 0;
}

.button-action-item.danger .action-icon {
  color: var(--p-red-500, #ef4444);
}

.action-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.action-label {
  font-weight: 600;
  font-size: 0.95rem;
}

.action-description {
  font-size: 0.85rem;
  color: var(--p-text-color-secondary, var(--text-color-secondary));
}

.action-endpoint {
  margin-top: 0.25rem;
}

.action-endpoint code {
  font-size: 0.75rem;
  color: var(--p-blue-600, #3b82f6);
  background: var(--p-blue-50, #eff6ff);
  padding: 2px 6px;
  border-radius: 4px;
}

.action-check {
  font-size: 1.25rem;
  color: var(--p-primary-color, var(--primary-color));
  flex-shrink: 0;
}

.advanced-params {
  border-top: 1px solid var(--p-surface-border, var(--surface-border));
  padding-top: 1rem;
}

.params-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  color: var(--p-primary-color, var(--primary-color));
}

.preview-section {
  background: var(--p-surface-50, #f9fafb);
  border: 1px solid var(--p-surface-border, var(--surface-border));
  border-radius: 6px;
}

.preview-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--p-text-color-secondary, var(--text-color-secondary));
}

.preview-code {
  display: block;
  font-family: 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--p-green-700, #15803d);
  word-break: break-all;
  white-space: pre-wrap;
}

.font-mono {
  font-family: 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9rem;
}
</style>
