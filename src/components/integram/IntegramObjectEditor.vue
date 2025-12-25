<template>
  <div class="integram-object-editor integram-touch-friendly">
    <Message severity="info" :closable="false">
      <strong>Редактор объектов (edit_obj)</strong> - Детальное редактирование объектов с поддержкой всех типов реквизитов включая FILE, HTML, DATE, DATETIME и subordinate tables
    </Message>

    <!-- Object Loader -->
    <Card class="mb-3">
      <template #title>Загрузить объект для редактирования</template>
      <template #content>
        <div class="grid gap-3">
          <div class="col-12 md:col-8">
            <div class="integram-field">
              <label for="objectId">ID объекта *</label>
              <InputText
                id="objectId"
                v-model="objectId"
                placeholder="Введите ID объекта"
                class="w-full"
                @keyup.enter="loadObject"
              />
            </div>
          </div>
          <div class="col-12 md:col-4 flex align-items-end">
            <Button
              label="Загрузить"
              icon="pi pi-download"
              @click="loadObject"
              :loading="loading.object"
              :disabled="!objectId"
              class="w-full"
            />
          </div>
        </div>
      </template>
    </Card>

    <!-- Object Editor -->
    <Card v-if="currentObject" class="mb-3">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <span>{{ currentObject.val }}</span>
            <Badge :value="currentObject.typ_name" severity="secondary" class="text-xs" />
            <span class="text-500 text-sm">#{{ currentObject.id }}</span>
          </div>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-save"
              label="Сохранить"
              @click="saveObject"
              :loading="loading.save"
              size="small"
            />
            <Button
              icon="pi pi-copy"
              @click="copyObject"
              :disabled="loading.save"
              outlined
              rounded
              size="small"
              v-tooltip.bottom="'Копировать'"
            />
            <Button
              icon="pi pi-times"
              @click="closeEditor"
              outlined
              rounded
              size="small"
              v-tooltip.bottom="'Закрыть'"
            />
          </div>
        </div>
      </template>
      <template #content>
        <!-- Breadcrumb -->
        <div v-if="currentObject.up" class="mb-3">
          <Breadcrumb :model="breadcrumbItems" />
        </div>

        <!-- Requisites Editor -->
        <div class="flex flex-column gap-3">
          <div
            v-for="req in editableRequisites"
            :key="req.id"
            class="integram-field"
          >
            <label :for="`req_${req.id}`">
              {{ req.name }}
              <span v-if="!req.nullable" class="text-red-500">*</span>
              <span v-if="req.multi" class="text-muted text-sm">(множественный)</span>
            </label>

            <!-- Different editors based on requisite type -->
            <component
              :is="getEditorComponent(req.baseType)"
              :id="`req_${req.id}`"
              v-model="editedValues[req.id]"
              :requisite="req"
              :disabled="req.disabled"
              class="w-full"
            />

            <small v-if="req.hint" class="text-muted">{{ req.hint }}</small>
          </div>
        </div>

        <!-- Subordinate Tables -->
        <div v-if="subordinateTables.length > 0" class="mt-4">
          <Divider />
          <h4>Подчиненные таблицы</h4>
          <Accordion :value="['0']" multiple>
            <AccordionPanel
              v-for="(table, index) in subordinateTables"
              :key="table.typeId"
              :value="String(index)"
            >
              <AccordionHeader>
                <Badge :value="table.count || 0" class="mr-2" />
                {{ table.typeName }}
              </AccordionHeader>
              <AccordionContent>
                <IntegramObjectTable
                  :session="session"
                  :type-id="table.typeId"
                  :filter="`F_U=${currentObject.id}`"
                  :auto-load="true"
                  compact
                />
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import axios from 'axios'
import IntegramObjectTable from './IntegramObjectTable.vue'

// Import specialized editors
import ShortEditor from './editors/ShortEditor.vue'
import CharsEditor from './editors/CharsEditor.vue'
import DateEditor from './editors/DateEditor.vue'
import DateTimeEditor from './editors/DateTimeEditor.vue'
import NumberEditor from './editors/NumberEditor.vue'
import SignedEditor from './editors/SignedEditor.vue'
import BooleanEditor from './editors/BooleanEditor.vue'
import MemoEditor from './editors/MemoEditor.vue'
import FileEditor from './editors/FileEditor.vue'
import HtmlEditor from './editors/HtmlEditor.vue'
import ButtonEditor from './editors/ButtonEditor.vue'
import PwdEditor from './editors/PwdEditor.vue'
import PathEditor from './editors/PathEditor.vue'
import ReportColumnEditor from './editors/ReportColumnEditor.vue'

// PrimeVue Components

const props = defineProps({
  session: {
    type: Object,
    required: true
  },
  initialObjectId: {
    type: [String, Number],
    default: null
  }
})

const toast = useToast()
const confirm = useConfirm()

// State
const objectId = ref(props.initialObjectId || '')
const currentObject = ref(null)
const editedValues = reactive({})
const loading = reactive({
  object: false,
  save: false
})

// Computed
const API_BASE = computed(() => {
  const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8081'
  return `${orchestratorUrl}/api/integram/${props.session.database}`
})

const getHeaders = () => ({
  'X-Authorization': props.session.sessionId
})

const breadcrumbItems = computed(() => {
  if (!currentObject.value || !currentObject.value.up) return []

  return [
    {
      label: 'Главная',
      icon: 'pi pi-home',
      command: () => {
        // Navigate to home
      }
    },
    {
      label: 'Таблицы',
      icon: 'pi pi-table',
      command: () => {
        // Navigate to tables
      }
    },
    {
      label: currentObject.value.typ_name,
      icon: 'pi pi-bars',
      command: () => {
        // Navigate to parent table
      }
    },
    {
      label: currentObject.value.val,
      icon: 'pi pi-file'
    }
  ]
})

const editableRequisites = computed(() => {
  if (!currentObject.value || !currentObject.value.requisites) return []

  return currentObject.value.requisites.map(req => ({
    id: req.id,
    name: req.name || req.alias || `Реквизит ${req.id}`,
    baseType: req.baseType || req.type,
    value: editedValues[req.id] !== undefined ? editedValues[req.id] : req.value,
    nullable: req.nullable !== false,
    multi: req.multi || false,
    disabled: req.disabled || false,
    hint: req.hint || getHintForType(req.baseType)
  }))
})

const subordinateTables = computed(() => {
  if (!currentObject.value || !currentObject.value.subordinates) return []
  return currentObject.value.subordinates
})

// Helper: Get hint for requisite type
function getHintForType(baseType) {
  const hints = {
    SHORT: 'Короткая строка (до 255 символов)',
    CHARS: 'Текстовая строка',
    DATE: 'Дата в формате YYYY-MM-DD',
    DATETIME: 'Дата и время',
    NUMBER: 'Числовое значение',
    SIGNED: 'Целое число со знаком',
    BOOLEAN: 'Логическое значение (да/нет)',
    MEMO: 'Длинный текст',
    FILE: 'Файл для загрузки',
    HTML: 'HTML контент',
    BUTTON: 'Кнопка действия',
    PWD: 'Пароль',
    PATH: 'Путь к файлу',
    REPORT_COLUMN: 'Колонка отчета'
  }
  return hints[baseType] || ''
}

// Helper: Get appropriate editor component for requisite type
function getEditorComponent(baseType) {
  const components = {
    SHORT: ShortEditor,
    CHARS: CharsEditor,
    DATE: DateEditor,
    DATETIME: DateTimeEditor,
    NUMBER: NumberEditor,
    SIGNED: SignedEditor,
    BOOLEAN: BooleanEditor,
    MEMO: MemoEditor,
    FILE: FileEditor,
    HTML: HtmlEditor,
    BUTTON: ButtonEditor,
    PWD: PwdEditor,
    PATH: PathEditor,
    REPORT_COLUMN: ReportColumnEditor
  }

  return components[baseType] || CharsEditor // Default to CharsEditor
}

// Load object
async function loadObject() {
  if (!objectId.value) return

  loading.object = true
  try {
    const response = await axios.get(`${API_BASE.value}/object/${objectId.value}`, {
      headers: getHeaders()
    })

    if (response.data && response.data.obj) {
      currentObject.value = response.data.obj

      // Initialize edited values
      if (currentObject.value.requisites) {
        currentObject.value.requisites.forEach(req => {
          editedValues[req.id] = req.value
        })
      }

      // Load subordinate tables info
      if (response.data['&object_reqs']) {
        // Parse subordinate tables from object_reqs
        // This is simplified - actual implementation would parse the structure
        currentObject.value.subordinates = []
      }

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Объект загружен',
        life: 3000
      })
    }
  } catch (error) {
    console.error('Error loading object:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить объект',
      life: 3000
    })
  } finally {
    loading.object = false
  }
}

// Save object
async function saveObject() {
  if (!currentObject.value) return

  loading.save = true
  try {
    // Build form data from edited values
    const formData = new URLSearchParams()

    Object.keys(editedValues).forEach(reqId => {
      const value = editedValues[reqId]
      if (value !== null && value !== undefined) {
        formData.append(`t${reqId}`, value)
      }
    })

    const response = await axios.post(
      `${API_BASE.value}/_m_save/${currentObject.value.id}`,
      formData.toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Объект успешно сохранен',
      life: 3000
    })

    // Reload object to get updated data
    await loadObject()
  } catch (error) {
    console.error('Error saving object:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить объект',
      life: 3000
    })
  } finally {
    loading.save = false
  }
}

// Copy object (create duplicate)
async function copyObject() {
  if (!currentObject.value) return

  // Confirm the copy action
  confirm.require({
    message: `Создать копию объекта "${currentObject.value.val}"?`,
    header: 'Подтверждение копирования',
    icon: 'pi pi-question-circle',
    acceptLabel: 'Да, создать копию',
    rejectLabel: 'Отмена',
    accept: async () => {
      loading.save = true
      try {
        // Create a new object with the same type and current edited values
        const typeId = currentObject.value.typ

        // Build form data with current edited values
        const formData = new URLSearchParams()

        // Add object name with " (копия)" suffix
        const newName = `${currentObject.value.val} (копия)`
        formData.append('val', newName)

        // Add parent reference if exists
        if (currentObject.value.up) {
          formData.append('up', currentObject.value.up)
        }

        // Add all edited requisite values
        Object.keys(editedValues).forEach(reqId => {
          const value = editedValues[reqId]
          if (value !== null && value !== undefined) {
            formData.append(`t${reqId}`, value)
          }
        })

        // Create new object
        const response = await axios.post(
          `${API_BASE.value}/object/${typeId}`,
          formData.toString(),
          {
            headers: {
              ...getHeaders(),
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        )

        const newObjectId = response.data?.id || response.data?.object?.id

        if (newObjectId) {
          toast.add({
            severity: 'success',
            summary: 'Копия создана',
            detail: `Новый объект #${newObjectId} успешно создан`,
            life: 3000
          })

          // Load the newly created object
          objectId.value = String(newObjectId)
          await loadObject()
        } else {
          throw new Error('Не удалось получить ID нового объекта')
        }
      } catch (error) {
        console.error('Error copying object:', error)
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось создать копию объекта',
          life: 3000
        })
      } finally {
        loading.save = false
      }
    }
  })
}

// Close editor
function closeEditor() {
  currentObject.value = null
  objectId.value = ''
  Object.keys(editedValues).forEach(key => delete editedValues[key])
}

// Watch for initial object ID changes
watch(() => props.initialObjectId, (newId) => {
  if (newId) {
    objectId.value = newId
    loadObject()
  }
})
</script>

<style scoped>
.integram-object-editor {
  /* Component styles */
}
</style>
