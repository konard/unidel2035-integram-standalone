<template>
  <div class="smartq-page">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Main Card -->
    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Умный запрос</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-plus"
              label="Создать"
              @click="navigateTo('create')"
              size="small"
            />
          </div>
        </div>
      </template>
      <template #content>
        <!-- Tab Navigation -->
        <TabMenu :model="navItems" v-model:activeIndex="activeTab" class="mb-3" />

        <!-- Reports List View -->
        <div v-if="currentView === 'list'">
          <SmartQReportList
            @view-report="handleViewReport"
            @edit-report="handleDesignReport"
            @create-report="handleCreateReport"
          />
        </div>

        <!-- Report Editor View (Interactive Table - Legacy "editor") -->
        <div v-else-if="currentView === 'editor'">
          <!-- Quick Report ID Input -->
          <div class="surface-ground border-round p-3 mb-3">
            <label for="reportId" class="block mb-2 font-medium">{{ $t('smartq.selectReport') }}</label>
            <div class="flex gap-2">
              <InputNumber
                id="reportId"
                v-model="reportIdInput"
                :placeholder="$t('smartq.reportIdPlaceholder')"
                class="flex-1"
              />
              <Button
                :label="$t('smartq.loadReport')"
                icon="pi pi-search"
                @click="loadReport"
                :disabled="!reportIdInput"
              />
              <Button
                icon="pi pi-cog"
                @click="handleDesignReport(currentReportId)"
                v-tooltip.top="$t('smartq.reports.design')"
                :disabled="!currentReportId"
                severity="secondary"
                outlined
              />
            </div>
          </div>

          <!-- Error Message -->
          <Message
            v-if="error"
            severity="error"
            @close="error = null"
            closable
            class="mb-3"
          >
            {{ error }}
          </Message>

          <!-- SmartQ Table Component (with inline editing) -->
          <SmartQTable
            v-if="currentReportId"
            :report-id="currentReportId"
            @error="handleError"
          />

          <!-- No Report Loaded -->
          <div v-else class="text-center py-6 surface-ground border-round">
            <i class="pi pi-table text-5xl text-color-secondary mb-3 block"></i>
            <h4 class="m-0 mb-2">{{ $t('smartq.noReportLoaded') }}</h4>
            <p class="text-color-secondary m-0 mb-3">{{ $t('smartq.enterReportIdToStart') }}</p>
            <Button
              :label="$t('smartq.nav.browseReports')"
              icon="pi pi-list"
              @click="navigateTo('list')"
              outlined
            />
          </div>
        </div>

        <!-- Report Designer View (Query Builder - Legacy "sql editor") -->
        <div v-else-if="currentView === 'designer'">
          <SmartQReportEditor
            :report-id="editingReportId"
            @saved="handleReportSaved"
            @cancelled="handleEditorCancelled"
          />
        </div>

        <!-- Create Report View -->
        <div v-else-if="currentView === 'create'">
          <SmartQReportEditor
            @saved="handleReportSaved"
            @cancelled="handleEditorCancelled"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue'
import SmartQTable from '@/components/SmartQTable.vue'
import SmartQReportList from '@/components/SmartQReportList.vue'
import SmartQReportEditor from '@/components/SmartQReportEditor.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Breadcrumb items
const breadcrumbItems = computed(() => [
  { label: 'Умный запрос', icon: 'pi pi-search' }
])

// State
const currentView = ref('list') // 'list', 'editor', 'designer', 'create'
const reportIdInput = ref(null)
const currentReportId = ref(null)
const editingReportId = ref(null)
const error = ref(null)
const activeTab = ref(0)

// Navigation items for TabMenu
const navItems = computed(() => [
  { label: t('smartq.nav.reports'), icon: 'pi pi-list', value: 'list' },
  { label: t('smartq.nav.editor'), icon: 'pi pi-pencil', value: 'editor' },
  { label: t('smartq.nav.designer'), icon: 'pi pi-cog', value: 'designer' }
])

// Initialize view from route
function initializeFromRoute() {
  if (route.query.reportId) {
    const reportId = parseInt(route.query.reportId)
    reportIdInput.value = reportId
    currentReportId.value = reportId
    currentView.value = 'editor'
    activeTab.value = 1
  } else if (route.query.view) {
    const viewMap = {
      'viewer': 'editor',
      'editor': 'designer',
      'list': 'list',
      'designer': 'designer',
      'create': 'create'
    }
    currentView.value = viewMap[route.query.view] || route.query.view
    updateActiveTab()
  } else {
    currentView.value = 'list'
    activeTab.value = 0
  }
}

function updateActiveTab() {
  const viewToTabIndex = {
    'list': 0,
    'editor': 1,
    'designer': 2,
    'create': 2
  }
  activeTab.value = viewToTabIndex[currentView.value] || 0
}

function navigateTo(view) {
  currentView.value = view
  updateActiveTab()
  updateRoute()
}

function updateRoute() {
  const query = {}
  if (currentView.value === 'editor' && currentReportId.value) {
    query.reportId = currentReportId.value
  } else {
    query.view = currentView.value
  }
  router.replace({ query })
}

function loadReport() {
  if (!reportIdInput.value) {
    error.value = t('smartq.errors.noReportId')
    return
  }

  error.value = null
  currentReportId.value = reportIdInput.value
  currentView.value = 'editor'
  updateActiveTab()
  updateRoute()
}

function handleViewReport(reportId) {
  reportIdInput.value = reportId
  currentReportId.value = reportId
  currentView.value = 'editor'
  updateActiveTab()
  updateRoute()
}

function handleDesignReport(reportId) {
  editingReportId.value = reportId
  currentView.value = 'designer'
  updateActiveTab()
  updateRoute()
}

function handleCreateReport() {
  editingReportId.value = null
  currentView.value = 'create'
  updateActiveTab()
  updateRoute()
}

function handleReportSaved(report) {
  if (report && report.id) {
    handleViewReport(report.id)
  } else {
    navigateTo('list')
  }
}

function handleEditorCancelled() {
  navigateTo('list')
}

function handleError(err) {
  error.value = typeof err === 'string' ? err : err.message || t('smartq.errors.unknown')
}

// Initialize on mount
initializeFromRoute()

// Watch route changes
watch(() => route.query, () => {
  initializeFromRoute()
}, { deep: true })

// Watch activeTab changes from TabMenu
watch(activeTab, (newIndex) => {
  const viewMap = ['list', 'editor', 'designer']
  const newView = viewMap[newIndex] || 'list'
  if (currentView.value !== newView) {
    navigateTo(newView)
  }
})
</script>

<style scoped>
.smartq-page {
  /* No extra padding - IntegramMain .content provides 1rem */
}
</style>
