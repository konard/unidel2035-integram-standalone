<template>
  <div class="integram-report-embed">
    <!-- Loading State -->
    <div v-if="loading && !reportData" class="text-center p-5">
      <ProgressSpinner />
      <p class="mt-3">Загрузка отчета...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-3">
      <Message severity="error" :closable="false">
        {{ error }}
      </Message>
    </div>

    <!-- Report Viewer -->
    <IntegramReportViewer
      v-else-if="reportData"
      :reportId="reportId || reportName"
      :reportData="reportData.rows"
      :columns="reportColumns"
      :totals="reportTotals"
      :loading="loading"
      :showTotals="showTotals"
      :title="reportTitle"
      @refresh="loadReport"
      @apply-filters="onApplyFilters"
      @go-home="$emit('go-home')"
      @export="$emit('export', $event)"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import integramService from '@/services/integramService'
import { logger } from '@/utils/logger'
import IntegramReportViewer from './IntegramReportViewer.vue'

const props = defineProps({
  // Report identifier - can be either reportId (number) or reportName (string)
  reportId: {
    type: [String, Number],
    default: null
  },
  reportName: {
    type: String,
    default: null
  },
  // Report display title (optional, will use report name from data if not provided)
  title: {
    type: String,
    default: null
  },
  // Show totals row
  showTotals: {
    type: Boolean,
    default: true
  },
  // Auto-refresh interval in milliseconds (0 = no auto-refresh)
  autoRefresh: {
    type: Number,
    default: 0
  },
  // Database name (for multi-database support)
  database: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['loaded', 'error', 'refresh', 'go-home', 'export'])

const toast = useToast()

// State
const loading = ref(false)
const error = ref(null)
const reportData = ref(null)
const autoRefreshTimer = ref(null)

// Computed
const reportTitle = computed(() => {
  if (props.title) {
    return props.title
  }
  if (reportData.value?.report_name) {
    return reportData.value.report_name
  }
  return props.reportName || `Отчет #${props.reportId}`
})

const reportColumns = computed(() => {
  if (!reportData.value?.columns) return []

  // Convert column names to column objects
  return reportData.value.columns.map(colName => ({
    field: colName,
    header: colName,
    align: 'left'
  }))
})

const reportTotals = computed(() => {
  // If report data includes totals, return them
  // Otherwise return null (no totals)
  if (reportData.value?.totals) {
    return reportData.value.totals
  }
  return null
})

// Methods
async function loadReport() {
  if (!props.reportId && !props.reportName) {
    error.value = 'Не указан ID или имя отчета'
    emit('error', error.value)
    return
  }

  loading.value = true
  error.value = null

  // Issue #5112: Ensure integramService is authenticated before calling executeReport
  if (!integramService.isAuthenticated()) {
    console.log('🔄 IntegramReportEmbed: Authenticating integramService...')

    // Issue #5112: Use integramService.loadSession() which properly handles v2 format
    // This method already knows how to parse both old and new session formats
    integramService.loadSession()

    if (integramService.isAuthenticated()) {
      console.log('✅ IntegramReportEmbed: Restored integramService session from localStorage')
    } else {
      console.warn('⚠️ IntegramReportEmbed: No valid session in localStorage')
      error.value = 'Требуется авторизация. Пожалуйста, войдите в систему.'
      loading.value = false
      emit('error', error.value)
      return
    }
  } else {
    console.log('✅ IntegramReportEmbed: integramService already authenticated')
  }

  const startTime = performance.now()

  try {
    // Determine which identifier to use
    const identifier = props.reportId || props.reportName

    // Execute report via Integram API
    const response = await integramService.executeReport(identifier, {})

    const endTime = performance.now()
    const executionTimeMs = endTime - startTime

    if (response) {
      logger.info('Report response:', response)

      let columns = []
      let rows = []

      // Check if response is an array (direct JSON data)
      if (Array.isArray(response)) {
        // Response is an array of objects
        if (response.length > 0) {
          columns = Object.keys(response[0])
          rows = response
        }
        logger.info(
          `Direct array response detected. Rows: ${rows.length}, Columns: ${columns.join(', ')}`
        )
      } else if (response.columns && response.data) {
        // Legacy format: { report_name, columns: [...], data: [[...], [...]] }
        columns = response.columns
        const data = response.data

        // Convert data array to rows with column names
        rows = data.map(row => {
          const rowObj = {}
          columns.forEach((col, index) => {
            rowObj[col] = row[index]
          })
          return rowObj
        })
        logger.info(
          `Legacy format detected. Rows: ${rows.length}, Columns: ${columns.join(', ')}`
        )
      } else {
        // Unknown format
        logger.warn('Unexpected report response format:', response)
        throw new Error(
          'Неподдерживаемый формат ответа от сервера'
        )
      }

      reportData.value = {
        report_name: response.report_name || props.title || props.reportName || `Отчет #${props.reportId}`,
        columns: columns,
        rows: rows,
        total_rows: rows.length,
        execution_time_ms: response.execution_time_ms || executionTimeMs,
        totals: response.totals || null
      }

      logger.info(`Report loaded successfully`, reportData.value)

      emit('loaded', reportData.value)
    } else {
      throw new Error('Пустой ответ от сервера')
    }
  } catch (err) {
    logger.error('Failed to load report:', err)
    error.value = err.message || 'Не удалось загрузить отчет'
    emit('error', error.value)

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

function onApplyFilters(filters) {
  logger.info('Apply filters:', filters)
  // Filters are applied client-side in IntegramReportViewer
  // We could emit this event if parent needs to know
  emit('apply-filters', filters)
}

function setupAutoRefresh() {
  // Clear existing timer
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value)
    autoRefreshTimer.value = null
  }

  // Setup new timer if autoRefresh > 0
  if (props.autoRefresh > 0) {
    autoRefreshTimer.value = setInterval(() => {
      logger.info(`Auto-refreshing report (interval: ${props.autoRefresh}ms)`)
      loadReport()
    }, props.autoRefresh)
  }
}

// Lifecycle
onMounted(() => {
  loadReport()
  setupAutoRefresh()
})

// Watch for prop changes
watch(() => [props.reportId, props.reportName], () => {
  loadReport()
})

watch(() => props.autoRefresh, () => {
  setupAutoRefresh()
})

// Cleanup on unmount
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value)
  }
})
</script>

<style scoped>
.integram-report-embed {
  width: 100%;
  min-height: 200px;
}
</style>
