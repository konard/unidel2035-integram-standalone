<template>
  <div class="integram-report-viewer">
    <!-- Header with Navigation and Actions -->
    <div class="report-header mb-3">
      <table class="w-full">
        <tr>
          <td class="text-left" style="width: 15%">
            <div class="flex gap-2 align-items-center">
              <Button
                icon="pi pi-home"
                @click="goHome"
                text
                size="small"
                severity="secondary"
                title="На главную"
              />
              <Button
                icon="pi pi-file-export"
                label=".HTML"
                @click="exportToHTML"
                size="small"
                outlined
                class="export-btn"
                title="Экспорт в HTML"
              />
              <Button
                icon="pi pi-file-excel"
                label=".XLS"
                @click="exportToExcel"
                size="small"
                outlined
                class="export-btn"
                severity="success"
                title="Экспорт в Excel"
              />
            </div>
          </td>
          <td class="text-center" style="width: 70%">
            <h4 class="m-0">{{ reportTitle }}</h4>
          </td>
          <td class="text-right" style="width: 15%">
            <div class="flex gap-2 align-items-center justify-content-end">
              <Button
                icon="pi pi-arrows-v"
                @click="toggleInfiniteScroll"
                :outlined="!infiniteScrollEnabled"
                rounded
                size="small"
                :title="infiniteScrollEnabled ? 'Infinite Scroll (вкл)' : 'Обычная таблица'"
                :class="{ 'button-on': infiniteScrollEnabled }"
              />
              <Button
                icon="pi pi-arrows-h"
                @click="toggleCompact"
                text
                size="small"
                :title="compactMode ? 'Обычное представление' : 'Компактное представление'"
              />
              <Button
                icon="pi pi-filter"
                @click="toggleFilter"
                text
                size="small"
                :title="showFilters ? 'Скрыть фильтр' : 'Показать фильтр'"
              />
              <Button
                v-show="showFilters && hasFilters"
                id="refresh-btn"
                icon="pi pi-refresh"
                @click="applyFilters"
                size="small"
                severity="primary"
                :title="'Перестроить отчет по заданному фильтру'"
              />
              <Button
                icon="pi pi-refresh"
                @click="refreshReport"
                :loading="loading"
                outlined
                rounded
                size="small"
                :title="'Обновить данные'"
              />
              <Button
                icon="pi pi-times-circle"
                @click="clearFiltersAndRefresh"
                text
                size="small"
                severity="danger"
                :title="'Очистить фильтр и перезапустить отчет'"
              />
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Report Table -->
    <div
      ref="scrollContainer"
      :class="['report-table-container', { 'infinite-scroll-container': infiniteScrollEnabled }]"
      @scroll="handleScroll"
    >
      <table
        id="report_table"
        ref="reportTable"
        :class="['report-table', 'table', 'table-bordered', { 'table-condensed': compactMode }]"
      >
        <!-- Header Row -->
        <thead>
          <tr class="header-row" @click="toggleFilter">
            <th
              v-for="(column, index) in columns"
              :key="`header-${index}`"
              class="text-center font-bold"
            >
              {{ column.header || column.field }}
            </th>
          </tr>

          <!-- Filter Row -->
          <tr v-show="showFilters" id="filter_row" class="filter-row">
            <td
              v-for="(column, index) in columns"
              :key="`filter-${index}`"
              class="filter-cell"
            >
              <div v-if="filters[column.field]" class="flex gap-1 align-items-center justify-content-center">
                <input
                  type="text"
                  :id="`FR_${column.field}`"
                  v-model="filters[column.field].from"
                  @input="adjustInputSize($event, column.field, 'from')"
                  placeholder="От"
                  :size="Math.max(2, (filters[column.field].from || '').length + 1)"
                  class="filter-input"
                />
                <span>-</span>
                <input
                  type="text"
                  :id="`TO_${column.field}`"
                  v-model="filters[column.field].to"
                  @input="adjustInputSize($event, column.field, 'to')"
                  placeholder="До"
                  :size="Math.max(2, (filters[column.field].to || '').length + 1)"
                  class="filter-input"
                />
              </div>
            </td>
          </tr>
        </thead>

        <!-- Data Rows -->
        <tbody>
          <tr
            v-for="(row, rowIndex) in displayedData"
            :key="`row-${rowIndex}`"
            class="data-row"
          >
            <td
              v-for="(column, colIndex) in columns"
              :key="`cell-${rowIndex}-${colIndex}`"
              :align="column.align || getColumnAlignment(row[column.field])"
              style="mso-number-format:\@"
            >
              {{ formatCellValue(row[column.field]) }}
            </td>
          </tr>
        </tbody>

        <!-- Totals Row -->
        <tfoot v-if="showTotals && totals">
          <tr class="totals-row">
            <td
              v-for="(column, index) in columns"
              :key="`total-${index}`"
              class="text-right font-bold"
            >
              {{ totals[column.field] !== undefined ? formatCellValue(totals[column.field]) : '' }}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Loading More indicator for Infinite Scroll -->
      <div v-if="infiniteScrollEnabled && loadingMore" class="mt-3 text-center py-3">
        <ProgressSpinner style="width: 30px; height: 30px" />
        <span class="ml-2 text-color-secondary">Загрузка...</span>
      </div>

      <!-- All data loaded message -->
      <div v-if="infiniteScrollEnabled && !hasMoreData && displayedData.length > 0" class="mt-3 text-center py-2 text-sm text-500">
        <i class="pi pi-check-circle mr-1"></i>Все данные загружены ({{ displayedData.length }} строк)
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="loading-overlay">
      <ProgressSpinner />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useTimer } from '@/composables/useTimer';

const props = defineProps({
  reportId: {
    type: [String, Number],
    required: true
  },
  reportData: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    required: true
  },
  totals: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  showTotals: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['refresh', 'apply-filters', 'go-home', 'export']);

const toast = useToast();
const { setTimeout: setTimerTimeout } = useTimer();

// State
const showFilters = ref(false);
const compactMode = ref(false);
const reportTable = ref(null);
const scrollContainer = ref(null);
const filters = ref({});

// Infinite scroll state
const infiniteScrollEnabled = ref(false);
const loadingMore = ref(false);
const hasMoreData = ref(true);
const pageSize = ref(50);
const currentPage = ref(1);

// Initialize filters for all columns
function initializeFilters() {
  const filterObj = {};
  props.columns.forEach(col => {
    filterObj[col.field] = { from: '', to: '' };
  });
  filters.value = filterObj;
}

// Computed
const reportTitle = computed(() => {
  return props.title || `Отчет #${props.reportId}`;
});

const hasFilters = computed(() => {
  return Object.values(filters.value).some(f => f && (f.from || f.to));
});

const filteredData = computed(() => {
  if (!hasFilters.value) {
    return props.reportData;
  }

  return props.reportData.filter(row => {
    return props.columns.every(col => {
      const value = row[col.field];
      const filter = filters.value[col.field];

      // If filter doesn't exist for this column, include the row
      if (!filter || (!filter.from && !filter.to)) {
        return true;
      }

      const valueStr = String(value || '').toLowerCase();
      const fromStr = String(filter.from || '').toLowerCase();
      const toStr = String(filter.to || '').toLowerCase();

      let matchFrom = true;
      let matchTo = true;

      if (filter.from) {
        matchFrom = valueStr >= fromStr;
      }

      if (filter.to) {
        matchTo = valueStr <= toStr;
      }

      return matchFrom && matchTo;
    });
  });
});

// Displayed data with infinite scroll support
const displayedData = computed(() => {
  if (!infiniteScrollEnabled.value) {
    return filteredData.value;
  }

  // In infinite scroll mode, show items up to current page
  const itemsToShow = currentPage.value * pageSize.value;
  const displayed = filteredData.value.slice(0, itemsToShow);

  // Update hasMoreData
  hasMoreData.value = displayed.length < filteredData.value.length;

  return displayed;
});

// Methods
function toggleFilter() {
  showFilters.value = !showFilters.value;
}

function toggleCompact() {
  compactMode.value = !compactMode.value;
  setCookie('compact', compactMode.value ? 'compact' : '');
}

function adjustInputSize(event, field, type) {
  const input = event.target;
  input.size = Math.max(2, input.value.length + 1);
}

function applyFilters() {
  emit('apply-filters', filters.value);
  toast.add({
    severity: 'success',
    summary: 'Фильтр применен',
    detail: 'Отчет обновлен с новыми фильтрами',
    life: 3000
  });
}

function clearFiltersAndRefresh() {
  initializeFilters();
  emit('refresh');
  toast.add({
    severity: 'info',
    summary: 'Фильтр сброшен',
    detail: 'Отчет перезапущен без фильтров',
    life: 3000
  });
}

function refreshReport() {
  emit('refresh');
  toast.add({
    severity: 'info',
    summary: 'Обновление',
    detail: 'Данные обновляются...',
    life: 2000
  });
}

function toggleInfiniteScroll() {
  infiniteScrollEnabled.value = !infiniteScrollEnabled.value;

  if (infiniteScrollEnabled.value) {
    // Reset to page 1 when enabling
    currentPage.value = 1;
    hasMoreData.value = true;

    toast.add({
      severity: 'info',
      summary: 'Infinite Scroll',
      detail: 'Режим автоматической подгрузки включен',
      life: 2000
    });
  } else {
    toast.add({
      severity: 'info',
      summary: 'Обычный режим',
      detail: 'Показываются все данные',
      life: 2000
    });
  }
}

function handleScroll(event) {
  if (!infiniteScrollEnabled.value || loadingMore.value || !hasMoreData.value) {
    return;
  }

  const container = event.target;
  const threshold = 200;
  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;

  // Check if near bottom
  if (scrollHeight - scrollTop - clientHeight < threshold) {
    loadMoreData();
  }
}

function loadMoreData() {
  if (loadingMore.value || !hasMoreData.value) return;

  loadingMore.value = true;

  // Simulate loading delay (since we already have all data in filteredData)
  setTimerTimeout(() => {
    currentPage.value++;
    loadingMore.value = false;

    if (displayedData.value.length >= filteredData.value.length) {
      hasMoreData.value = false;
    }
  }, 300);
}

function goHome() {
  emit('go-home');
}

function formatCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value;
}

function getColumnAlignment(value) {
  if (typeof value === 'number') {
    return 'right';
  }
  return 'left';
}

// Export Functions
function exportToHTML() {
  try {
    // Clone the table
    const table = reportTable.value;
    if (!table) return;

    // Remove filter row for export
    const filterRow = document.getElementById('filter_row');
    const filterDisplay = filterRow ? filterRow.style.display : 'none';
    if (filterRow) {
      filterRow.style.display = 'none';
    }

    // Hide refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshDisplay = refreshBtn ? refreshBtn.style.display : 'none';
    if (refreshBtn) {
      refreshBtn.style.display = 'none';
    }

    const tableHTML = table.outerHTML;

    // Restore filter row
    if (filterRow) {
      filterRow.style.display = filterDisplay;
    }
    if (refreshBtn) {
      refreshBtn.style.display = refreshDisplay;
    }

    const template = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<!--[if gte mso 9]>
<xml>
<x:ExcelWorkbook>
<x:ExcelWorksheets>
<x:ExcelWorksheet>
<x:Name>${reportTitle.value}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet>
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml>
<![endif]-->
<meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
</head>
<body>
${tableHTML}
</body>
</html>`;

    const uri = 'data:application/vnd.ms-excel;base64,';
    const base64 = window.btoa(unescape(encodeURIComponent(template)));
    const downloadLink = document.createElement('a');
    downloadLink.href = uri + base64;
    downloadLink.download = `report_${props.reportId}.html`;
    downloadLink.click();

    toast.add({
      severity: 'success',
      summary: 'Экспорт в HTML',
      detail: 'Отчет экспортирован в HTML',
      life: 3000
    });

    emit('export', { format: 'html', data: template });
  } catch (error) {
    console.error('HTML export error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка экспорта',
      detail: 'Не удалось экспортировать отчет в HTML',
      life: 3000
    });
  }
}

function exportToExcel() {
  try {
    const XLSX = window.XLSX;
    if (!XLSX) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Библиотека XLSX не загружена',
        life: 3000
      });
      return;
    }

    // Convert table directly using XLSX
    const table = reportTable.value;
    if (!table) return;

    // Hide filter row for export
    const filterRow = document.getElementById('filter_row');
    const filterDisplay = filterRow ? filterRow.style.display : 'none';
    if (filterRow) {
      filterRow.style.display = 'none';
    }

    const wb = XLSX.utils.table_to_book(table, { sheet: reportTitle.value });

    // Restore filter row
    if (filterRow) {
      filterRow.style.display = filterDisplay;
    }

    XLSX.writeFile(wb, `report_${props.reportId}.xlsx`);

    toast.add({
      severity: 'success',
      summary: 'Экспорт в Excel',
      detail: 'Отчет экспортирован в Excel',
      life: 3000
    });

    emit('export', { format: 'excel', data: wb });
  } catch (error) {
    console.error('Excel export error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка экспорта',
      detail: 'Не удалось экспортировать отчет в Excel',
      life: 3000
    });
  }
}

// Cookie Management (matching legacy behavior)
function setCookie(name, value) {
  const date = new Date();
  date.setTime(date.getTime() + 31536000000); // 1 year
  document.cookie = `${name}=${escape(value)}; expires=${date.toGMTString()}; path=/`;
}

function getCookie(name) {
  const results = document.cookie.match(`(^|;) ?${name}=([^;]*)(;|$)`);
  if (results) {
    return unescape(results[2]);
  }
  return null;
}

// Initialize
onMounted(() => {
  initializeFilters();

  // Restore compact mode from cookie
  if (getCookie('compact') === 'compact') {
    compactMode.value = true;
  }

  // Load XLSX library if not already loaded
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = '/js/xlsx.full.min.js';
    script.type = 'text/javascript';
    document.body.appendChild(script);
  }
});

// Watch for column changes to reinitialize filters
watch(() => props.columns, () => {
  initializeFilters();
}, { deep: true });
</script>

<style scoped>
.integram-report-viewer {
  position: relative;
  width: 100%;
  font-family: Verdana, Tahoma, sans-serif;
  font-size: 13px;
}

.report-header {
  padding: 2px;
}

.export-btn {
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 12px;
}

.report-table-container {
  overflow-x: auto;
}

.infinite-scroll-container {
  max-height: 600px;
  overflow-y: auto;
  overflow-x: auto;
}

.button-on {
  background-color: var(--surface-200) !important;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  background-color: white;
}

.report-table th,
.report-table td {
  border: 1px solid #ddd;
  padding: 8px;
}

.report-table.table-condensed th,
.report-table.table-condensed td {
  padding: 4px;
}

.header-row {
  background-color: #f9f9f9;
  cursor: pointer;
}

.header-row:hover {
  background-color: #f0f0f0;
}

.filter-row {
  background-color: #ffffff;
}

.filter-cell {
  padding: 2px !important;
  text-align: center;
}

.filter-input {
  border: 1px solid #ccc;
  padding: 2px 4px;
  border-radius: 3px;
  min-width: 30px;
  text-align: center;
  font-size: 12px;
}

.filter-input:focus {
  outline: none;
  border-color: #4CAF50;
}

.data-row:nth-child(even) {
  background-color: #f9f9f9;
}

.data-row:hover {
  background-color: #f0f8ff;
}

.totals-row {
  background-color: #e8f5e9;
  font-weight: bold;
}

.totals-row td {
  padding: 8px;
  border-top: 2px solid #4CAF50;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* Responsive */
@media (max-width: 768px) {
  .report-header table {
    font-size: 11px;
  }

  .report-table {
    font-size: 11px;
  }

  .export-btn {
    font-size: 10px;
    padding: 2px 6px;
  }
}
</style>
