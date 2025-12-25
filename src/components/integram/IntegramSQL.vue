<template>
  <div class="integram-sql-container integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <div class="mb-3">
      <IntegramBreadcrumb :items="breadcrumbItems" />
    </div>

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>SQL запросы</span>
        </div>
      </template>
      <template #content>
        <!-- Query Editor -->
        <Panel header="Редактор SQL запросов" class="mb-3">
          <Textarea
            v-model="sqlQuery"
            :rows="10"
            class="w-full mb-3"
            placeholder="SELECT * FROM ..."
            :style="{ fontFamily: 'monospace' }"
          />
          <div class="integram-actions mb-2">
            <Button
              label="Выполнить"
              icon="pi pi-play"
              @click="executeQuery"
              :loading="loading"
              :disabled="!sqlQuery.trim()"
              aria-label="Выполнить SQL запрос"
            />
            <Button
              label="Очистить"
              icon="pi pi-times"
              @click="clearQuery"
              outlined
              aria-label="Очистить запрос"
            />
            <Button
              label="Примеры"
              icon="pi pi-book"
              @click="showExamples = !showExamples"
              outlined
              aria-label="Показать примеры запросов"
            />
          </div>
          <div class="flex align-items-center gap-2">
            <Checkbox v-model="settings.explainQuery" inputId="explain" :binary="true" />
            <label for="explain">EXPLAIN (показать план выполнения)</label>
          </div>
        </Panel>

        <!-- Examples Panel -->
        <Panel v-if="showExamples" header="Примеры запросов" class="mb-3">
          <div class="grid">
            <div
              v-for="(example, index) in sqlExamples"
              :key="index"
              class="col-12 md:col-6"
            >
              <Card class="h-full">
                <template #title>
                  <small>{{ example.title }}</small>
                </template>
                <template #content>
                  <pre class="text-sm overflow-x-auto">{{ example.query }}</pre>
                  <Button
                    label="Использовать"
                    @click="useExample(example.query)"
                    text
                    aria-label="Использовать пример запроса"
                  />
                </template>
              </Card>
            </div>
          </div>
        </Panel>

        <!-- Results -->
        <Panel v-if="results.length > 0" header="Результаты запроса" class="mb-3">
          <div class="mb-2">
            <Badge :value="results.length" severity="info" />
            <span class="ml-2">записей найдено</span>
            <span v-if="queryTime" class="ml-3 text-500">
              <i class="pi pi-clock"></i> {{ queryTime }}ms
            </span>
          </div>
          <DataTable
            :value="results"
            :rows="20"
            paginator
            :scrollable="true"
            scrollHeight="400px"
            class="text-sm"
          >
            <Column
              v-for="col in resultColumns"
              :key="col.field"
              :field="col.field"
              :header="col.header"
              :style="{ minWidth: '150px' }"
            />
          </DataTable>
          <div class="integram-actions mt-3">
            <Button
              label="Экспорт CSV"
              icon="pi pi-download"
              @click="exportCSV"
              outlined
              aria-label="Экспортировать в CSV"
            />
            <Button
              label="Экспорт JSON"
              icon="pi pi-file"
              @click="exportJSON"
              outlined
              aria-label="Экспортировать в JSON"
            />
          </div>
        </Panel>

        <!-- Error Panel -->
        <Panel v-if="error" header="Ошибка" class="mb-3">
          <Message severity="error" :closable="false">
            <pre class="text-sm">{{ error }}</pre>
          </Message>
        </Panel>

        <!-- Query History -->
        <Panel header="История запросов" :toggleable="true" :collapsed="true">
          <div v-if="queryHistory.length === 0" class="text-center text-500 py-3">
            Нет выполненных запросов
          </div>
          <div v-else class="flex flex-column gap-2">
            <div
              v-for="(item, index) in queryHistory"
              :key="index"
              class="p-3 border-1 surface-border border-round hover:surface-hover cursor-pointer"
              @click="useHistoryQuery(item)"
            >
              <div class="flex justify-content-between align-items-start">
                <pre class="text-sm flex-1 m-0">{{ item.query }}</pre>
                <Badge
                  :value="item.rows"
                  :severity="item.error ? 'danger' : 'success'"
                  class="ml-2"
                />
              </div>
              <small class="text-500">{{ item.timestamp }}</small>
            </div>
          </div>
        </Panel>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import integramService from '@/services/integramService'
import { logger } from '@/utils/logger'

// PrimeVue Components

defineProps({
  session: {
    type: Object,
    required: false
  }
})

const route = useRoute()
const toast = useToast()

const reportId = ref(null)
const reportName = ref('')
const sqlQuery = ref('')
const loading = ref(false)
const results = ref([])
const resultColumns = ref([])
const error = ref(null)
const queryTime = ref(null)
const showExamples = ref(false)
const queryHistory = ref([])

// Breadcrumb navigation
const breadcrumbItems = computed(() => {
  const items = [
    {
      label: 'SQL',
      icon: 'pi pi-code',
      to: '/integram/sql'
    }
  ]

  if (reportId.value && reportName.value) {
    items.push({
      label: reportName.value,
      icon: 'pi pi-chart-bar',
      to: undefined
    })
  }

  return items
})

// Load report data if reportId is in route
onMounted(async () => {
  if (route.params.reportId) {
    reportId.value = parseInt(route.params.reportId)
    await loadReportSQL()
  }
})

async function loadReportSQL() {
  if (!reportId.value) return

  try {
    loading.value = true

    // Load report object to get the SQL query
    const reportObj = await integramService.getObject(reportId.value)
    reportName.value = reportObj.val || `Report #${reportId.value}`

    // Get report edit data to access requisites including SQL query
    const editData = await integramService.getEditObject(reportId.value)

    // Find the SQL query requisite (usually stored in a requisite)
    // Look for requisites that might contain SQL
    if (editData.reqs) {
      for (const [reqId, reqData] of Object.entries(editData.reqs)) {
        // SQL queries are often in TEXT/MEMO fields
        if (reqData.value && typeof reqData.value === 'string' &&
            (reqData.value.trim().toUpperCase().startsWith('SELECT') ||
             reqData.value.trim().toUpperCase().includes('FROM'))) {
          sqlQuery.value = reqData.value
          logger.info(`Loaded SQL query from requisite ${reqId}:`, sqlQuery.value)
          break
        }
      }
    }

    if (!sqlQuery.value) {
      logger.warn('No SQL query found in report requisites')
      toast.add({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'SQL запрос не найден в отчете',
        life: 5000
      })
    }
  } catch (err) {
    logger.error('Failed to load report SQL:', err)
    error.value = `Не удалось загрузить SQL запрос: ${err.message}`
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.value,
      life: 5000
    })
  } finally {
    loading.value = false
  }
}

const settings = ref({
  explainQuery: false
})

const sqlExamples = [
  {
    title: 'Выбрать все записи',
    query: 'SELECT * FROM your_table LIMIT 100'
  },
  {
    title: 'Подсчёт записей',
    query: 'SELECT COUNT(*) as total FROM your_table'
  },
  {
    title: 'Группировка',
    query: `SELECT type, COUNT(*) as count
FROM your_table
GROUP BY type
ORDER BY count DESC`
  },
  {
    title: 'Объединение таблиц',
    query: `SELECT a.*, b.name
FROM table_a a
LEFT JOIN table_b b ON a.parent_id = b.id
LIMIT 100`
  },
  {
    title: 'Фильтрация по дате',
    query: `SELECT *
FROM your_table
WHERE created_at >= '2025-01-01'
ORDER BY created_at DESC
LIMIT 100`
  },
  {
    title: 'Агрегация',
    query: `SELECT
  type,
  COUNT(*) as count,
  AVG(value) as avg_value,
  SUM(value) as total
FROM your_table
GROUP BY type`
  }
]

async function executeQuery() {
  if (!sqlQuery.value.trim()) {
    return
  }

  loading.value = true
  error.value = null
  results.value = []
  resultColumns.value = []

  try {
    // TODO: Call actual API endpoint
    // For now, simulate with a delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Simulated response
    throw new Error('SQL query execution not yet connected to backend API. Please implement the API call.')

    /* Example of real implementation:
    const response = await fetch(`/api/integram/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': props.session.sessionId,
        'X-Database': props.session.database
      },
      body: JSON.stringify({
        query: sqlQuery.value,
        explain: settings.value.explainQuery
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error)
    }

    results.value = data.rows || []
    if (results.value.length > 0) {
      resultColumns.value = Object.keys(results.value[0]).map(key => ({
        field: key,
        header: key
      }))
    }

    queryTime.value = Math.round(performance.now() - startTime)

    // Add to history
    queryHistory.value.unshift({
      query: sqlQuery.value,
      timestamp: new Date().toLocaleString(),
      rows: results.value.length,
      error: false
    })

    if (queryHistory.value.length > 20) {
      queryHistory.value = queryHistory.value.slice(0, 20)
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: `Найдено ${results.value.length} записей`,
      life: 3000
    })
    */

  } catch (err) {
    error.value = err.message

    // Add to history
    queryHistory.value.unshift({
      query: sqlQuery.value,
      timestamp: new Date().toLocaleString(),
      rows: 0,
      error: true
    })

    toast.add({
      severity: 'error',
      summary: 'Ошибка выполнения запроса',
      detail: err.message,
      life: 5000
    })
  } finally {
    loading.value = false
  }
}

function clearQuery() {
  sqlQuery.value = ''
  results.value = []
  resultColumns.value = []
  error.value = null
  queryTime.value = null
}

function useExample(query) {
  sqlQuery.value = query
  showExamples.value = false
}

function useHistoryQuery(item) {
  sqlQuery.value = item.query
}

function exportCSV() {
  if (results.value.length === 0) return

  const headers = resultColumns.value.map(c => c.header).join(',')
  const rows = results.value.map(row =>
    resultColumns.value.map(c => JSON.stringify(row[c.field] || '')).join(',')
  )

  const csv = [headers, ...rows].join('\n')
  downloadFile(csv, 'query-results.csv', 'text/csv')

  toast.add({
    severity: 'success',
    summary: 'Экспорт выполнен',
    detail: 'CSV файл загружен',
    life: 3000
  })
}

function exportJSON() {
  if (results.value.length === 0) return

  const json = JSON.stringify(results.value, null, 2)
  downloadFile(json, 'query-results.json', 'application/json')

  toast.add({
    severity: 'success',
    summary: 'Экспорт выполнен',
    detail: 'JSON файл загружен',
    life: 3000
  })
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
pre {
  background: var(--surface-100);
  padding: 0.5rem;
  border-radius: 4px;
  overflow-x: auto;
}
</style>
