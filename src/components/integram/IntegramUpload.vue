<template>
  <div class="integram-upload-page integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Загрузка файлов</span>
        </div>
      </template>
      <template #content>
        <!-- Type Selection -->
        <div v-if="!selectedType" class="mb-4">
          <div class="field">
            <label for="typeSelect">Выберите таблицу для загрузки</label>
            <Select
              id="typeSelect"
              v-model="selectedType"
              :options="typeOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Выберите таблицу"
              class="w-full"
              @change="onTypeSelected"
            />
          </div>
          <div class="field">
            <label for="settingsSelect">или выберите сохраненную настройку</label>
            <Select
              id="settingsSelect"
              v-model="selectedSetting"
              :options="settingsOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Настройки импорта"
              class="w-full"
            />
          </div>
        </div>

        <!-- File Upload Area -->
        <div v-if="selectedType" class="upload-area">
          <div class="mb-3">
            <Button
              icon="pi pi-arrow-left"
              label="Вернуться к выбору таблицы"
              @click="resetSelection"
              text
              aria-label="Вернуться к выбору таблицы"
            />
            <h4>{{ selectedTypeName }}</h4>
          </div>

          <!-- Input Area -->
          <Panel header="Загрузка данных" class="mb-3">
            <p class="mb-2">
              Вставьте текст из файла в это поле или выберите файл для загрузки:<br>
              <small>JSON или любой текстовый файл: CSV, TXT и т.п. Форматы XLS и XLSX пока не поддерживаются</small>
            </p>
            <Textarea
              v-model="fileContent"
              :rows="5"
              class="w-full mb-2"
              placeholder="Вставьте содержимое файла..."
            />
            <FileUpload
              mode="basic"
              accept=".txt,.csv,.json"
              :maxFileSize="10000000"
              @select="onFileSelect"
              chooseLabel="Выберите файл"
              class="mb-2"
            />
            <div class="integram-actions">
              <Button
                label="Проверить"
                icon="pi pi-check"
                @click="validateFile"
                :disabled="!fileContent"
                aria-label="Проверить файл"
              />
              <Button
                label="Настроить"
                icon="pi pi-cog"
                @click="showSettings = !showSettings"
                outlined
                aria-label="Настройки импорта"
              />
            </div>
          </Panel>

          <!-- Settings Panel -->
          <Panel v-if="showSettings" header="Настройки импорта" class="mb-3">
            <div class="grid">
              <div class="col-12 md:col-6">
                <div class="field-checkbox mb-3">
                  <Checkbox v-model="settings.hasHeader" inputId="hasHeader" :binary="true" />
                  <label for="hasHeader">Первая строка содержит заголовок</label>
                </div>
                <div class="field-checkbox">
                  <Checkbox v-model="settings.trim" inputId="trim" :binary="true" />
                  <label for="trim">Обрезать пробелы справа и слева</label>
                </div>
              </div>
              <div class="col-12 md:col-6">
                <div class="field mb-3">
                  <label for="delimiter">Разделитель полей</label>
                  <InputText
                    id="delimiter"
                    v-model="settings.delimiter"
                    placeholder="auto"
                    class="w-full"
                  />
                  <small>
                    <Button text @click="settings.delimiter = '\t'">TAB</Button>
                  </small>
                </div>
                <div class="field mb-3">
                  <label for="lineDelimiter">Разделитель строк</label>
                  <InputText
                    id="lineDelimiter"
                    v-model="settings.lineDelimiter"
                    placeholder="auto"
                    class="w-full"
                  />
                </div>
                <div class="field mb-3">
                  <label for="batchSize">Строк в батче</label>
                  <InputNumber
                    id="batchSize"
                    v-model="settings.batchSize"
                    :min="1"
                    :max="10000"
                    class="w-full"
                  />
                </div>
                <div class="field">
                  <label for="encoding">Кодировка файла</label>
                  <Select
                    id="encoding"
                    v-model="settings.encoding"
                    :options="encodingOptions"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select encoding"
                    class="w-full"
                  />
                  <small class="text-500">UTF-8 рекомендуется для большинства файлов</small>
                </div>
              </div>
            </div>

            <!-- Save/Load Settings -->
            <div class="mt-3">
              <Divider />
              <div class="flex gap-2 align-items-center">
                <Button
                  label="Сохранить настройки"
                  icon="pi pi-save"
                  size="small"
                  outlined
                  @click="saveImportSettings"
                />
                <InputText
                  v-model="settingName"
                  placeholder="Название настройки"
                  class="flex-1"
                  size="small"
                />
              </div>
            </div>
          </Panel>

          <!-- Field Mapping/Reordering -->
          <Panel v-if="preview.length > 0" header="Порядок и сопоставление полей" class="mb-3">
            <p class="mb-3 text-sm text-500">
              Перетащите поля для изменения порядка. Нажмите на иконку ссылки для связи со справочником.
            </p>
            <div ref="fieldMappingList" class="field-mapping-list">
              <div
                v-for="(col, index) in previewColumns"
                :key="col.field"
                class="field-mapping-item"
                :data-index="index"
                :class="{ 'has-formula': columnFormulas[col.field], 'is-skipped': columnSkipped[col.field] }"
              >
                <div class="flex align-items-center gap-3 p-3 surface-50 border-round">
                  <i class="pi pi-bars drag-handle cursor-move text-500"></i>

                  <!-- Skip Column Checkbox -->
                  <Checkbox
                    v-model="columnSkipped[col.field]"
                    :inputId="`skip_${col.field}`"
                    :binary="true"
                    v-tooltip.top="columnSkipped[col.field] ? 'Колонка пропущена' : 'Пропустить колонку'"
                  />

                  <!-- Link to Reference Toggle -->
                  <Button
                    :icon="getLinkIcon(col.field)"
                    :severity="getLinkSeverity(col.field)"
                    text
                    rounded
                    size="small"
                    @click="toggleLink(col.field)"
                    v-tooltip.top="getLinkTooltip(col.field)"
                    :disabled="columnSkipped[col.field]"
                  />

                  <div class="flex-1" @click="selectFieldForFormula(col)">
                    <strong :class="{ 'text-primary': selectedFormulaField === col.field }">
                      {{ col.header }}
                    </strong>
                    <div class="text-sm text-500">
                      Пример: {{ preview[0]?.[col.field] || 'N/A' }}
                    </div>
                    <div v-if="columnFormulas[col.field]" class="text-xs text-green-500 mt-1">
                      <i class="pi pi-calculator"></i> {{ columnFormulas[col.field] }}
                    </div>
                  </div>
                  <div class="text-sm text-500">Позиция: {{ index + 1 }}</div>
                </div>
              </div>
            </div>
          </Panel>

          <!-- Formula Editor -->
          <Panel v-if="preview.length > 0" header="Формулы для вычисления полей" :toggleable="true" :collapsed="!showFormulaEditor">
            <template #header>
              <div class="flex align-items-center gap-2">
                <i class="pi pi-calculator"></i>
                <span>Формулы для вычисления полей</span>
                <Badge v-if="Object.keys(columnFormulas).length > 0" :value="Object.keys(columnFormulas).length" severity="success" />
              </div>
            </template>
            <div class="formula-editor">
              <div class="flex gap-2 align-items-center mb-3">
                <Select
                  v-model="selectedFormulaField"
                  :options="previewColumns"
                  optionLabel="header"
                  optionValue="field"
                  placeholder="Выберите поле"
                  class="w-auto"
                  style="min-width: 200px"
                />
                <InputText
                  v-model="currentFormula"
                  placeholder="Формула: [Поле1] * [Поле2]"
                  class="flex-1"
                  @keyup.enter="saveFormula"
                />
                <Button
                  label="Сохранить"
                  icon="pi pi-check"
                  size="small"
                  @click="saveFormula"
                  :disabled="!selectedFormulaField"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  size="small"
                  @click="clearFormula"
                  :disabled="!selectedFormulaField || !columnFormulas[selectedFormulaField]"
                  v-tooltip.top="'Удалить формулу'"
                />
              </div>
              <div class="formula-help surface-ground p-3 border-round">
                <p class="m-0 mb-2 font-semibold">Синтаксис формул:</p>
                <ul class="m-0 pl-4 text-sm">
                  <li>Используйте <code>[Название поля]</code> для ссылки на другие поля</li>
                  <li>Пример: <code>[Цена] * [Количество]</code></li>
                  <li>Пример: <code>IF([Статус]='Активен', 1, 0)</code></li>
                  <li>Доступные функции: IF, CONCAT, UPPER, LOWER, TRIM, ROUND</li>
                </ul>
                <div class="mt-2">
                  <span class="text-sm text-500">Быстрая вставка поля:</span>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <Button
                      v-for="col in previewColumns"
                      :key="col.field"
                      :label="col.header"
                      size="small"
                      text
                      @click="insertFieldInFormula(col.header)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <!-- Preview -->
          <Panel v-if="preview.length > 0" header="Предварительный просмотр" class="mb-3">
            <DataTable :value="preview" :rows="5" paginator>
              <Column
                v-for="(col, index) in previewColumns"
                :key="index"
                :field="col.field"
                :header="col.header"
              />
            </DataTable>
          </Panel>

          <!-- Upload Button -->
          <div v-if="preview.length > 0" class="integram-actions">
            <Button
              label="Загрузить"
              icon="pi pi-upload"
              @click="confirmUpload = true"
              severity="warning"
              aria-label="Загрузить данные"
            />
            <Button
              label="Статистика"
              icon="pi pi-chart-bar"
              @click="showStats = !showStats"
              outlined
              aria-label="Показать статистику"
            />
          </div>

          <!-- Stats -->
          <Panel v-if="showStats" header="Статистика импорта" class="mt-3">
            <!-- Summary Stats -->
            <div class="grid mb-4">
              <div class="col-6 md:col-3">
                <div class="text-center p-3 surface-ground border-round">
                  <div class="text-2xl font-bold text-primary">{{ preview.length }}</div>
                  <div class="text-sm text-500">Строк</div>
                </div>
              </div>
              <div class="col-6 md:col-3">
                <div class="text-center p-3 surface-ground border-round">
                  <div class="text-2xl font-bold text-primary">{{ activeColumns.length }}</div>
                  <div class="text-sm text-500">Колонок (активных)</div>
                </div>
              </div>
              <div class="col-6 md:col-3">
                <div class="text-center p-3 surface-ground border-round">
                  <div class="text-2xl font-bold" :class="totalStats.invalid > 0 ? 'text-orange-500' : 'text-green-500'">
                    {{ totalStats.invalid }}
                  </div>
                  <div class="text-sm text-500">Ошибок</div>
                </div>
              </div>
              <div class="col-6 md:col-3">
                <div class="text-center p-3 surface-ground border-round">
                  <div class="text-2xl font-bold text-500">{{ totalStats.empty }}</div>
                  <div class="text-sm text-500">Пустых ячеек</div>
                </div>
              </div>
            </div>

            <!-- Per-Column Stats Table -->
            <DataTable :value="columnStatsArray" size="small" stripedRows showGridlines class="text-sm">
              <Column field="header" header="Колонка" style="min-width: 150px">
                <template #body="{ data }">
                  <span :class="{ 'line-through text-400': data.skipped }">
                    {{ data.header }}
                  </span>
                  <span v-if="data.skipped" class="ml-2 text-xs text-orange-500">(пропущена)</span>
                </template>
              </Column>
              <Column field="empty" header="Пусто" style="width: 80px; text-align: right">
                <template #body="{ data }">
                  <span :class="{ 'text-400': data.empty === 0 }">{{ data.empty || '-' }}</span>
                </template>
              </Column>
              <Column field="invalid" header="Ошибки" style="width: 80px; text-align: right">
                <template #body="{ data }">
                  <span :class="{ 'text-orange-500 font-bold': data.invalid > 0 }">
                    {{ data.invalid || '-' }}
                  </span>
                </template>
              </Column>
              <Column field="min" header="Мин" style="min-width: 100px">
                <template #body="{ data }">
                  <span class="text-sm">{{ data.min || '-' }}</span>
                </template>
              </Column>
              <Column field="max" header="Макс" style="min-width: 100px">
                <template #body="{ data }">
                  <span class="text-sm">{{ data.max || '-' }}</span>
                </template>
              </Column>
              <Column field="sum" header="Сумма" style="width: 100px; text-align: right">
                <template #body="{ data }">
                  <span v-if="data.isNumeric">{{ data.sum }}</span>
                  <span v-else class="text-400">-</span>
                </template>
              </Column>
              <Column field="avg" header="Среднее" style="width: 100px; text-align: right">
                <template #body="{ data }">
                  <span v-if="data.isNumeric">{{ data.avg }}</span>
                  <span v-else class="text-400">-</span>
                </template>
              </Column>
            </DataTable>
          </Panel>
        </div>
      </template>
    </Card>

    <!-- Confirm Dialog -->
    <Dialog
      v-model:visible="confirmUpload"
      header="Подтверждение загрузки"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <p>Вы уверены, что хотите загрузить {{ preview.length }} записей?</p>
      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отменить"
            icon="pi pi-times"
            @click="confirmUpload = false"
            text
            aria-label="Отменить загрузку"
          />
          <Button
            label="Да, загружаем"
            icon="pi pi-upload"
            @click="doUpload"
            severity="warning"
            aria-label="Подтвердить загрузку"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useIntegramSession } from '@/composables/useIntegramSession'
import integramApiClient from '@/services/integramApiClient'
import Sortable from 'sortablejs'
import { useTimer } from '@/composables/useTimer'

// PrimeVue Components

const router = useRouter()
const { isAuthenticated } = useIntegramSession()

const toast = useToast()
const { setTimeout: setTimerTimeout } = useTimer()

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
  {
    label: 'Загрузка',
    icon: 'pi pi-upload',
    to: undefined // Current page
  }
])

const selectedType = ref(null)
const selectedTypeName = ref('')
const selectedSetting = ref(null)
const fileContent = ref('')
const showSettings = ref(false)
const showStats = ref(false)
const showFormulaEditor = ref(false)
const confirmUpload = ref(false)
const preview = ref([])
const previewColumns = ref([])
const fieldMappingList = ref(null)
const settingName = ref('')

// Formula state
const columnFormulas = ref({})
const selectedFormulaField = ref(null)
const currentFormula = ref('')

// Link to Reference state (0=none, 1=link, 2=multiselect)
const columnLinks = ref({})

// Skip Columns state
const columnSkipped = ref({})

const settings = ref({
  hasHeader: true,
  trim: true,
  delimiter: '',
  lineDelimiter: '',
  batchSize: 1000,
  encoding: 'utf-8'
})

const encodingOptions = [
  { label: 'UTF-8 (Recommended)', value: 'utf-8' },
  { label: 'Windows-1251 (Cyrillic)', value: 'windows-1251' },
  { label: 'ISO-8859-1 (Latin-1)', value: 'iso-8859-1' },
  { label: 'Windows-1252 (Western European)', value: 'windows-1252' },
  { label: 'KOI8-R (Russian)', value: 'koi8-r' },
  { label: 'GB2312 (Simplified Chinese)', value: 'gb2312' },
  { label: 'Shift-JIS (Japanese)', value: 'shift-jis' }
]

const typeOptions = ref([
  { label: '*** Создать новую таблицу из файла ***', value: 'new' }
])
const typesLoading = ref(false)

const settingsOptions = ref([])

/**
 * Load available types from API
 */
async function loadTypes() {
  try {
    typesLoading.value = true
    const dictionary = await integramApiClient.getDictionary()

    // Reset options with "create new" first
    typeOptions.value = [
      { label: '*** Создать новую таблицу из файла ***', value: 'new' }
    ]

    // Add all types from dictionary
    if (dictionary && typeof dictionary === 'object') {
      const types = Object.entries(dictionary)
        .map(([id, name]) => ({
          label: name,
          value: id
        }))
        .sort((a, b) => a.label.localeCompare(b.label))

      typeOptions.value.push(...types)
    }
  } catch (error) {
    console.error('Failed to load types:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить список таблиц: ' + (error.message || 'Ошибка API'),
      life: 5000
    })
  } finally {
    typesLoading.value = false
  }
}

// ========== Statistics Computed Properties ==========

// Active (non-skipped) columns
const activeColumns = computed(() => {
  return previewColumns.value.filter(col => !columnSkipped.value[col.field])
})

// Per-column statistics
const columnStatsArray = computed(() => {
  return previewColumns.value.map(col => {
    const stats = calculateColumnStats(col.field)
    return {
      field: col.field,
      header: col.header,
      skipped: columnSkipped.value[col.field] || false,
      ...stats
    }
  })
})

// Total statistics across all columns
const totalStats = computed(() => {
  let totalEmpty = 0
  let totalInvalid = 0

  columnStatsArray.value.forEach(stat => {
    if (!stat.skipped) {
      totalEmpty += stat.empty || 0
      totalInvalid += stat.invalid || 0
    }
  })

  return {
    empty: totalEmpty,
    invalid: totalInvalid
  }
})

/**
 * Calculate statistics for a specific column
 */
function calculateColumnStats(field) {
  if (!preview.value || preview.value.length === 0) {
    return { empty: 0, invalid: 0, min: '', max: '', sum: 0, avg: 0, isNumeric: false }
  }

  let empty = 0
  let invalid = 0
  let min = null
  let max = null
  let sum = 0
  let count = 0
  let isNumeric = true

  // Sample first 10 non-empty values to detect if column is numeric
  const sampleValues = preview.value
    .map(row => row[field])
    .filter(v => v !== undefined && v !== null && v !== '')
    .slice(0, 10)

  if (sampleValues.length > 0) {
    const numericCount = sampleValues.filter(v => {
      const parsed = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''))
      return !isNaN(parsed)
    }).length

    isNumeric = numericCount >= sampleValues.length * 0.8 // 80% numeric
  } else {
    isNumeric = false
  }

  preview.value.forEach(row => {
    const value = row[field]

    // Check empty
    if (value === undefined || value === null || value === '') {
      empty++
      return
    }

    const strValue = String(value).trim()

    if (isNumeric) {
      const numValue = parseFloat(strValue.replace(',', '.').replace(/\s/g, ''))

      if (isNaN(numValue)) {
        invalid++
      } else {
        sum += numValue
        count++

        if (min === null || numValue < min) min = numValue
        if (max === null || numValue > max) max = numValue
      }
    } else {
      // For text columns, track min/max by string comparison
      if (min === null || strValue < min) min = strValue
      if (max === null || strValue > max) max = strValue
      count++
    }
  })

  // Calculate average for numeric columns
  const avg = isNumeric && count > 0 ? Math.round((sum / count) * 100) / 100 : 0

  // Format numeric values
  if (isNumeric) {
    sum = Math.round(sum * 100) / 100
    min = min !== null ? Math.round(min * 100) / 100 : ''
    max = max !== null ? Math.round(max * 100) / 100 : ''
  } else {
    // Truncate long string min/max values
    if (min && min.length > 20) min = min.substring(0, 20) + '...'
    if (max && max.length > 20) max = max.substring(0, 20) + '...'
  }

  return {
    empty,
    invalid,
    min: min || '',
    max: max || '',
    sum,
    avg,
    isNumeric
  }
}

// Load saved settings from localStorage
function loadSavedSettings() {
  const savedSettings = localStorage.getItem('integram_import_settings')
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings)
      settingsOptions.value = Object.keys(parsed).map(key => ({
        label: key,
        value: key
      }))
    } catch (e) {
      console.error('Failed to load saved settings:', e)
    }
  }
}

function onTypeSelected() {
  if (selectedType.value === 'new') {
    selectedTypeName.value = 'Новая таблица / New table'
  } else {
    // Load type details
    loadTypeDetails()
  }
}

function loadTypeDetails() {
  // TODO: Call API to load type details
  selectedTypeName.value = 'Загруженный тип'
}

function onFileSelect(event) {
  const file = event.files[0]
  const reader = new FileReader()

  reader.onload = (e) => {
    fileContent.value = e.target.result
    validateFile()
  }

  reader.readAsText(file, settings.value.encoding)
}

function validateFile() {
  if (!fileContent.value) {
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Файл пуст',
      life: 3000
    })
    return
  }

  try {
    // Parse CSV/TSV
    const lines = fileContent.value.split('\n').filter(l => l.trim())
    const delimiter = settings.value.delimiter || detectDelimiter(lines[0])

    const headers = settings.value.hasHeader
      ? lines[0].split(delimiter).map(h => h.trim())
      : lines[0].split(delimiter).map((_, i) => `Column${i + 1}`)

    const dataLines = settings.value.hasHeader ? lines.slice(1) : lines

    previewColumns.value = headers.map((h, i) => ({
      field: `col${i}`,
      header: h
    }))

    preview.value = dataLines.slice(0, 100).map(line => {
      const values = line.split(delimiter).map(v => settings.value.trim ? v.trim() : v)
      const obj = {}
      values.forEach((v, i) => {
        obj[`col${i}`] = v
      })
      return obj
    })

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: `Обработано ${preview.value.length} строк`,
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: `Ошибка парсинга: ${error.message}`,
      life: 5000
    })
  }
}

function detectDelimiter(line) {
  // Simple delimiter detection
  const delimiters = [',', '\t', ';', '|']
  let maxCount = 0
  let bestDelimiter = ','

  delimiters.forEach(d => {
    const count = (line.match(new RegExp('\\' + d, 'g')) || []).length
    if (count > maxCount) {
      maxCount = count
      bestDelimiter = d
    }
  })

  return bestDelimiter
}

function doUpload() {
  confirmUpload.value = false

  // TODO: Implement actual upload via API
  toast.add({
    severity: 'info',
    summary: 'Загрузка',
    detail: 'Функционал загрузки будет реализован через API',
    life: 5000
  })
}

function resetSelection() {
  selectedType.value = null
  selectedTypeName.value = ''
  fileContent.value = ''
  preview.value = []
  previewColumns.value = []
  showSettings.value = false
  showStats.value = false
  showFormulaEditor.value = false
  columnFormulas.value = {}
  columnLinks.value = {}
  columnSkipped.value = {}
  selectedFormulaField.value = null
  currentFormula.value = ''
}

// ========== Formula Functions ==========

function selectFieldForFormula(col) {
  selectedFormulaField.value = col.field
  currentFormula.value = columnFormulas.value[col.field] || ''
  showFormulaEditor.value = true
}

function saveFormula() {
  if (!selectedFormulaField.value) return

  if (currentFormula.value.trim()) {
    columnFormulas.value[selectedFormulaField.value] = currentFormula.value.trim()
    toast.add({
      severity: 'success',
      summary: 'Формула сохранена',
      detail: `Формула для поля сохранена`,
      life: 2000
    })
  } else {
    delete columnFormulas.value[selectedFormulaField.value]
  }
}

function clearFormula() {
  if (selectedFormulaField.value && columnFormulas.value[selectedFormulaField.value]) {
    delete columnFormulas.value[selectedFormulaField.value]
    currentFormula.value = ''
    toast.add({
      severity: 'info',
      summary: 'Формула удалена',
      detail: 'Формула для поля удалена',
      life: 2000
    })
  }
}

function insertFieldInFormula(fieldName) {
  currentFormula.value += `[${fieldName}]`
}

// ========== Link to Reference Functions ==========

function toggleLink(field) {
  const currentLink = columnLinks.value[field] || 0
  // Cycle: 0 (none) → 1 (link) → 2 (multiselect) → 0 (none)
  columnLinks.value[field] = (currentLink + 1) % 3

  const linkType = columnLinks.value[field]
  const messages = {
    0: 'Поле не связано со справочником',
    1: 'Поле связано со справочником',
    2: 'Поле связано со справочником (множественный выбор)'
  }

  toast.add({
    severity: linkType === 0 ? 'secondary' : 'success',
    summary: messages[linkType],
    life: 2000
  })
}

function getLinkIcon(field) {
  const link = columnLinks.value[field] || 0
  if (link === 2) return 'pi pi-list'
  if (link === 1) return 'pi pi-link'
  return 'pi pi-link'
}

function getLinkSeverity(field) {
  const link = columnLinks.value[field] || 0
  if (link === 2) return 'success'
  if (link === 1) return 'info'
  return 'secondary'
}

function getLinkTooltip(field) {
  const link = columnLinks.value[field] || 0
  if (link === 2) return 'Множественный выбор из справочника (нажмите для отключения)'
  if (link === 1) return 'Связь со справочником (нажмите для множественного выбора)'
  return 'Нажмите для связи со справочником'
}

function saveImportSettings() {
  if (!settingName.value) {
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Укажите название настройки / Please provide a setting name',
      life: 3000
    })
    return
  }

  try {
    const savedSettings = JSON.parse(localStorage.getItem('integram_import_settings') || '{}')

    savedSettings[settingName.value] = {
      ...settings.value,
      fieldOrder: previewColumns.value.map((col, idx) => ({ ...col, order: idx })),
      formulas: { ...columnFormulas.value },
      links: { ...columnLinks.value },
      skipped: { ...columnSkipped.value }
    }

    localStorage.setItem('integram_import_settings', JSON.stringify(savedSettings))

    // Update settings options
    loadSavedSettings()

    toast.add({
      severity: 'success',
      summary: 'Сохранено / Saved',
      detail: `Настройка "${settingName.value}" сохранена`,
      life: 3000
    })

    settingName.value = ''
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: `Не удалось сохранить: ${error.message}`,
      life: 5000
    })
  }
}

function loadImportSettings() {
  if (!selectedSetting.value) return

  try {
    const savedSettings = JSON.parse(localStorage.getItem('integram_import_settings') || '{}')
    const setting = savedSettings[selectedSetting.value]

    if (setting) {
      settings.value = {
        hasHeader: setting.hasHeader,
        trim: setting.trim,
        delimiter: setting.delimiter,
        lineDelimiter: setting.lineDelimiter,
        batchSize: setting.batchSize,
        encoding: setting.encoding || 'utf-8'
      }

      // Load formulas if saved
      if (setting.formulas) {
        columnFormulas.value = { ...setting.formulas }
      }

      // Load links if saved
      if (setting.links) {
        columnLinks.value = { ...setting.links }
      }

      // Load skipped columns if saved
      if (setting.skipped) {
        columnSkipped.value = { ...setting.skipped }
      }

      toast.add({
        severity: 'success',
        summary: 'Загружено / Loaded',
        detail: `Настройка "${selectedSetting.value}" применена`,
        life: 3000
      })
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: `Не удалось загрузить: ${error.message}`,
      life: 5000
    })
  }
}

function initFieldReordering() {
  if (fieldMappingList.value) {
    Sortable.create(fieldMappingList.value, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: (event) => {
        // Reorder previewColumns array
        const oldIndex = event.oldIndex
        const newIndex = event.newIndex

        const item = previewColumns.value.splice(oldIndex, 1)[0]
        previewColumns.value.splice(newIndex, 0, item)

        toast.add({
          severity: 'info',
          summary: 'Поле перемещено',
          detail: `"${item.header}" перемещено на позицию ${newIndex + 1}`,
          life: 2000
        })
      }
    })
  }
}

onMounted(async () => {
  // Check authentication
  if (!isAuthenticated.value) {
    router.push('/integram/login?redirect=' + encodeURIComponent(window.location.pathname))
    return
  }

  // Load available types from API
  await loadTypes()

  // Load saved import settings
  loadSavedSettings()
})

// Watch for preview updates to reinitialize sortable
watch(preview, () => {
  if (preview.value.length > 0) {
    setTimerTimeout(() => {
      initFieldReordering()
    }, 100)
  }
})

// Watch for setting selection change
watch(selectedSetting, () => {
  if (selectedSetting.value) {
    loadImportSettings()
  }
})
</script>

<style scoped>
.upload-area {
  padding: 1rem 0;
}

.field-mapping-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-mapping-item {
  transition: transform 0.2s, box-shadow 0.2s;
}

.field-mapping-item:hover {
  transform: translateX(4px);
}

.drag-handle {
  cursor: grab;
  font-size: 1.2rem;
}

.drag-handle:active {
  cursor: grabbing;
}

.sortable-ghost {
  opacity: 0.4;
  background: var(--surface-100);
  border: 2px dashed var(--primary-color);
}

:deep(.p-fileupload-choose) {
  margin: 0;
}

/* Formula Editor Styles */
.formula-editor {
  padding: 0.5rem 0;
}

.formula-help {
  font-size: 0.9rem;
}

.formula-help code {
  background: var(--surface-200);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
}

/* Fields with formulas */
.has-formula {
  border-left: 4px solid var(--green-500);
}

.has-formula .surface-50 {
  background: var(--green-50) !important;
}

/* Link icon styles */
.field-mapping-item .p-button-secondary .pi-link {
  color: var(--surface-400);
}

.field-mapping-item .p-button-info .pi-link {
  color: var(--blue-500);
}

.field-mapping-item .p-button-success .pi-list {
  color: var(--green-500);
}

/* Skipped columns */
.is-skipped {
  opacity: 0.5;
  border-left: 4px solid var(--orange-500);
}

.is-skipped .surface-50 {
  background: var(--orange-50) !important;
}

.is-skipped strong {
  text-decoration: line-through;
  color: var(--surface-400);
}
</style>
