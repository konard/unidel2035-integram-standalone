<template>
  <div class="integram-smart-query-container integram-touch-friendly">
    <!-- Toast for notifications -->
    <Toast />

    <!-- Breadcrumb Navigation -->
    <div class="mb-3">
      <IntegramBreadcrumb :items="breadcrumbItems" />
    </div>

    <!-- Report List View -->
    <div v-if="currentView === 'list'" class="report-list-container">
      <Card>
        <template #title>
          <div class="flex align-items-center justify-content-between">
            <span>Умный запрос</span>
            <div class="flex gap-2 align-items-center ml-auto">
              <Button
                label="Создать"
                icon="pi pi-plus"
                @click="createNewReport"
                severity="primary"
                size="small"
              />
              <Button
                icon="pi pi-refresh"
                @click="loadReportList"
                :loading="loadingList"
                outlined
                rounded
                size="small"
                v-tooltip.bottom="'Обновить'"
              />
            </div>
          </div>
        </template>

        <template #content>
          <!-- Loading State -->
          <div v-if="loadingList && reports.length === 0" class="text-center p-5">
            <ProgressSpinner />
            <p class="mt-3">Загрузка списка отчетов...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="!loadingList && reports.length === 0" class="text-center p-5">
            <i class="pi pi-file text-6xl text-400 mb-3"></i>
            <p class="text-xl text-500">Отчеты не найдены</p>
            <p class="text-muted">Отчеты (объект типа 22) пока не созданы</p>
          </div>

          <!-- Reports DataTable -->
          <DataTable
            v-else
            :value="reports"
            :paginator="true"
            :rows="pageSize"
            :totalRecords="totalRecords"
            :lazy="true"
            :loading="loadingList"
            stripedRows
            showGridlines
            responsiveLayout="scroll"
            @row-click="onReportSelect"
            @page="onPageChange"
            :rowsPerPageOptions="[10, 20, 50]"
            class="cursor-pointer"
          >
            <Column field="id" header="ID" sortable style="width: 100px"></Column>
            <Column field="name" header="Название отчета" sortable></Column>
            <Column
              field="created_at"
              header="Создан"
              sortable
              style="width: 200px"
            >
              <template #body="{ data }">
                {{ formatDate(data.created_at) }}
              </template>
            </Column>
            <Column header="Действия" style="width: 150px">
              <template #body="{ data }">
                <Button
                  label="Открыть"
                  icon="pi pi-eye"
                  @click.stop="selectReport(data.id)"
                  outlined
                  aria-label="Открыть отчет"
                />
              </template>
            </Column>

            <template #footer>
              <div class="flex justify-content-between align-items-center">
                <div class="font-bold">
                  Всего отчетов: {{ totalRecords }}
                </div>
              </div>
            </template>
          </DataTable>
        </template>
      </Card>
    </div>

    <!-- Report Detail View (SmartQ Table) -->
    <div v-else-if="currentView === 'viewer'" class="report-detail-container">
      <Card>
        <template #title>
          <div class="flex justify-content-between align-items-center">
            <div class="flex align-items-center gap-3">
              <Button
                icon="pi pi-arrow-left"
                @click="closeReport"
                outlined
                rounded
                aria-label="Вернуться к списку отчетов"
              />
              <h3 class="m-0">
                {{ reportName || `Отчет #${currentReportId}` }}
              </h3>
            </div>
            <div class="integram-actions">
              <Button
                label="Редактировать"
                icon="pi pi-pencil"
                @click="editReport(currentReportId)"
                severity="secondary"
                outlined
                aria-label="Редактировать отчет"
              />
              <Button
                icon="pi pi-refresh"
                @click="refreshReport"
                :loading="loading"
                outlined
                aria-label="Обновить отчет"
              />
            </div>
          </div>
        </template>

        <template #content>
          <!-- Error Message -->
          <Message
            v-if="error"
            severity="error"
            @close="error = null"
            closable
            class="mb-4"
          >
            {{ error }}
          </Message>

          <!-- SmartQ Table Component -->
          <SmartQTable
            v-if="currentReportId"
            :report-id="currentReportId"
            @error="handleError"
          />
        </template>
      </Card>
    </div>

    <!-- Report Editor View (Edit Existing Report) -->
    <div v-else-if="currentView === 'editor'" class="report-editor-container">
      <Card>
        <template #content>
          <SmartQReportEditor
            :report-id="editingReportId"
            @saved="handleReportSaved"
            @cancelled="handleEditorCancelled"
          />
        </template>
      </Card>
    </div>

    <!-- Create Report View (New Report) -->
    <div v-else-if="currentView === 'create'" class="report-create-container">
      <Card>
        <template #content>
          <SmartQReportEditor
            @saved="handleReportSaved"
            @cancelled="handleEditorCancelled"
          />
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'

import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import SmartQTable from '@/components/SmartQTable.vue'
import SmartQReportEditor from '@/components/SmartQReportEditor.vue'
import integramService from '@/services/integramService'
import { logger } from '@/utils/logger'

defineProps({
  session: {
    type: Object,
    required: false
  }
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// State
const currentReportId = ref(null)
const reportName = ref(null)
const loading = ref(false)
const loadingList = ref(false)
const error = ref(null)
const reports = ref([])
const currentView = ref('list') // 'list', 'viewer', 'editor', 'create'
const editingReportId = ref(null)

// Pagination state
const currentPage = ref(1)
const pageSize = ref(20)
const totalRecords = ref(0)

// Breadcrumb navigation
const breadcrumbItems = computed(() => {
  const items = [
    {
      label: 'Умный запрос',
      icon: 'pi pi-search',
      to: (currentView.value !== 'list') ? '/integram/smartq' : undefined
    }
  ]

  if (currentView.value === 'viewer' && reportName.value) {
    items.push({
      label: reportName.value,
      icon: 'pi pi-chart-bar'
    })
  } else if (currentView.value === 'editor') {
    items.push({
      label: t('smartq.editor.editReport'),
      icon: 'pi pi-pencil'
    })
  } else if (currentView.value === 'create') {
    items.push({
      label: t('smartq.editor.createReport'),
      icon: 'pi pi-plus'
    })
  }

  return items
})

// Lifecycle
onMounted(async () => {
  // Check if reportId is in route query
  if (route.query.reportId) {
    currentReportId.value = parseInt(route.query.reportId)
    if (route.query.mode === 'edit') {
      currentView.value = 'editor'
      editingReportId.value = currentReportId.value
    } else {
      currentView.value = 'viewer'
      await loadReportMetadata()
    }
  } else if (route.query.mode === 'create') {
    currentView.value = 'create'
  } else {
    // Show report list
    currentView.value = 'list'
    await loadReportList()
  }
})

// Methods
async function loadReportList(page = 1, size = pageSize.value) {
  loadingList.value = true
  error.value = null

  try {
    // Reports are type 22 objects in Integram
    const response = await integramService.getObjects(22, {
      pg: page,
      LIMIT: size
    })

    if (response && response.object) {
      reports.value = response.object.map(obj => ({
        id: obj.id,
        name: obj.val || `Отчет #${obj.id}`,
        created_at: obj.created_at || null,
        updated_at: obj.updated_at || null
      }))

      // Update pagination info
      currentPage.value = response.current_page || page

      if (response.total_objects !== undefined) {
        totalRecords.value = response.total_objects
      } else if (response.count !== undefined) {
        totalRecords.value = response.count
      } else {
        totalRecords.value = reports.value.length
      }

      logger.info(
        `Loaded ${reports.value.length} reports from type 22 objects`,
        { page, size, totalRecords: totalRecords.value }
      )
    } else {
      logger.warn('No reports found in type 22 objects')
      reports.value = []
      totalRecords.value = 0
    }
  } catch (err) {
    logger.error('Failed to load reports:', err)
    error.value = 'Не удалось загрузить список отчетов: ' + err.message
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.value,
      life: 5000
    })
    reports.value = []
    totalRecords.value = 0
  } finally {
    loadingList.value = false
  }
}

function onPageChange(event) {
  const apiPage = event.page + 1
  pageSize.value = event.rows
  loadReportList(apiPage, event.rows)
}

async function loadReportMetadata() {
  try {
    const response = await integramService.getObject(currentReportId.value)
    if (response && response.val) {
      reportName.value = response.val
    }
  } catch (err) {
    logger.warn('Failed to load report metadata:', err)
  }
}

function onReportSelect(event) {
  selectReport(event.data.id)
}

async function selectReport(reportId) {
  currentReportId.value = reportId
  currentView.value = 'viewer'
  error.value = null

  // Update URL
  router.push({
    path: '/integram/smartq',
    query: { reportId }
  })

  // Load report metadata
  await loadReportMetadata()
}

function closeReport() {
  backToList()
}

function refreshReport() {
  // Refresh will be handled by SmartQTable component
  logger.info('Refreshing report:', currentReportId.value)
}

function handleError(err) {
  error.value = typeof err === 'string' ? err : err.message || t('smartq.errors.unknown')
  toast.add({
    severity: 'error',
    summary: 'Ошибка',
    detail: error.value,
    life: 5000
  })
}

function formatDate(dateString) {
  if (!dateString) return '-'

  try {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateString
  }
}

// Navigation methods for create/edit
function createNewReport() {
  currentView.value = 'create'
  editingReportId.value = null
  error.value = null

  router.push({
    path: '/integram/smartq',
    query: { mode: 'create' }
  })
}

function editReport(reportId) {
  currentView.value = 'editor'
  editingReportId.value = reportId
  error.value = null

  router.push({
    path: '/integram/smartq',
    query: { reportId, mode: 'edit' }
  })
}

function handleReportSaved(report) {
  // Navigate to viewer to show the newly created/updated report
  if (report && report.id) {
    selectReport(report.id)
  } else {
    // If no report ID returned, go back to list
    backToList()
  }
}

function handleEditorCancelled() {
  backToList()
}

function backToList() {
  currentView.value = 'list'
  currentReportId.value = null
  editingReportId.value = null
  reportName.value = null
  error.value = null

  router.push({
    path: '/integram/smartq'
  })

  loadReportList()
}
</script>

<style scoped>
.integram-smart-query-container {
  padding: 1rem;
  width: 100%;
}

.report-list-container,
.report-detail-container {
  width: 100%;
}

.cursor-pointer {
  cursor: pointer;
}

:deep(.p-datatable-tbody > tr) {
  transition: background-color 0.2s;
}

:deep(.p-datatable-tbody > tr:hover) {
  background-color: var(--surface-hover) !important;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
}

.text-6xl {
  font-size: 4rem;
}

.text-muted {
  color: var(--text-color-secondary);
}

.text-400 {
  color: var(--gray-400);
}

.text-500 {
  color: var(--gray-500);
}
</style>
