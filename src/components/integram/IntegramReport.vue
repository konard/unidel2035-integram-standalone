<template>
  <div class="integram-report">
    <!-- Header with Actions (dict style) -->
    <Card class="mb-3">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>{{ reportTitle }}</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-filter"
              @click="showFilters = !showFilters"
              size="small"
              rounded
              :severity="showFilters ? 'info' : 'secondary'"
              :outlined="!showFilters"
              v-tooltip.bottom="showFilters ? 'Скрыть фильтры' : 'Показать фильтры'"
            />
            <Button
              icon="pi pi-arrows-h"
              @click="toggleCompactMode"
              size="small"
              rounded
              outlined
              v-tooltip.bottom="compactMode ? 'Обычный' : 'Компактный'"
            />
            <Button
              icon="pi pi-file"
              @click="exportToHTML"
              size="small"
              rounded
              severity="help"
              outlined
              v-tooltip.bottom="HTML"
            />
            <Button
              icon="pi pi-download"
              @click="exportToExcel"
              size="small"
              rounded
              severity="success"
              outlined
              v-tooltip.bottom="Excel"
            />
            <Button
              icon="pi pi-refresh"
              @click="emit('refresh')"
              size="small"
              rounded
              outlined
              v-tooltip.bottom="'Обновить'"
            />
          </div>
        </div>
      </template>
      <template #content>

    <!-- Report Parameters (if any) -->
    <Panel
      v-if="reportParameters && reportParameters.length > 0"
      header="Параметры отчета"
      toggleable
      :collapsed="!showParameters"
      class="mb-3"
    >
      <div class="grid">
        <div
          v-for="(param, index) in reportParameters"
          :key="index"
          class="col-12 md:col-6 lg:col-4"
        >
          <div class="field">
            <label :for="`param-${param.name}`" class="font-semibold">
              {{ param.label || param.name }}
            </label>
            <InputText
              v-if="param.type === 'text' || !param.type"
              :id="`param-${param.name}`"
              v-model="parameterValues[param.name]"
              :placeholder="param.placeholder || ''"
              class="w-full"
            />
            <InputNumber
              v-else-if="param.type === 'number'"
              :id="`param-${param.name}`"
              v-model="parameterValues[param.name]"
              :placeholder="param.placeholder || ''"
              class="w-full"
            />
            <Calendar
              v-else-if="param.type === 'date'"
              :id="`param-${param.name}`"
              v-model="parameterValues[param.name]"
              dateFormat="yy-mm-dd"
              :placeholder="param.placeholder || ''"
              class="w-full"
            />
          </div>
        </div>
      </div>
      <div class="flex gap-2 mt-3">
        <Button
          icon="pi pi-check"
          label="Применить"
          @click="applyParameters"
          severity="primary"
          size="small"
        />
        <Button
          icon="pi pi-times"
          label="Сбросить"
          @click="resetParameters"
          severity="secondary"
          size="small"
          outlined
        />
      </div>
    </Panel>

    <!-- Report Table -->
    <DataTable
      :value="reportData"
      :size="compactMode ? 'small' : 'normal'"
      showGridlines
      stripedRows
      :loading="loading"
    >
      <!-- Dynamic Columns -->
      <Column
        v-for="(column, index) in columns"
        :key="index"
        :field="column.field"
        :header="column.header"
        :sortable="true"
      >
        <template #header>
          <div
            @click="toggleFilters"
            style="cursor: pointer; user-select: none;"
            :title="showFilters ? 'Скрыть фильтры (клик по заголовку)' : 'Показать фильтры (клик по заголовку)'"
          >
            {{ column.header }}
          </div>
        </template>
        <template v-if="showFilters" #filter="{ filterModel }">
          <div class="flex gap-1 align-items-center">
            <InputText
              v-model="filterModel.from"
              placeholder="От"
              size="small"
              class="p-column-filter"
              style="width: 50px"
            />
            <span>-</span>
            <InputText
              v-model="filterModel.to"
              placeholder="До"
              size="small"
              class="p-column-filter"
              style="width: 50px"
            />
          </div>
        </template>
        <template #body="{ data }">
          {{ data[column.field] }}
        </template>
      </Column>

      <!-- Footer with Totals -->
      <template v-if="totals && totals.length > 0" #footer>
        <div class="font-bold">
          <span v-for="(total, index) in totals" :key="index" class="mr-4">
            {{ total.label }}: {{ total.value }}
          </span>
        </div>
      </template>
    </DataTable>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';

const props = defineProps({
  reportId: {
    type: String,
    required: true
  },
  reportData: {
    type: Array,
    required: true
  },
  columns: {
    type: Array,
    required: true
  },
  totals: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  reportParameters: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['refresh', 'apply-filter', 'apply-parameters']);

const toast = useToast();

// State
const showFilters = ref(false);
const compactMode = ref(false);
const showParameters = ref(true);
const parameterValues = ref({});

// Cookie/localStorage helper functions
function setPreference(name, value) {
  try {
    localStorage.setItem(`integram_report_${name}`, value);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save preference to localStorage:', e);
    }
  }
}

function getPreference(name) {
  try {
    return localStorage.getItem(`integram_report_${name}`);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('Failed to read preference from localStorage:', e);
    }
    return null;
  }
}

function deletePreference(name) {
  try {
    localStorage.removeItem(`integram_report_${name}`);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('Failed to delete preference from localStorage:', e);
    }
  }
}

// Computed
const reportTitle = computed(() => {
  return `Отчет #${props.reportId}`;
});

// Toggle compact mode with persistence
function toggleCompactMode() {
  compactMode.value = !compactMode.value;
  if (compactMode.value) {
    setPreference('compact', 'compact');
  } else {
    deletePreference('compact');
  }
}

// Toggle filters visibility
function toggleFilters() {
  showFilters.value = !showFilters.value;
}

// Initialize preferences from localStorage
function initializePreferences() {
  const savedCompact = getPreference('compact');
  if (savedCompact === 'compact') {
    compactMode.value = true;
  }
}

// Lifecycle hooks
onMounted(() => {
  initializePreferences();
});

// Methods
function exportToExcel() {
  // Convert table data to worksheet
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

  // Prepare data for export
  const exportData = props.reportData.map(row => {
    const obj = {};
    props.columns.forEach(col => {
      obj[col.header] = row[col.field];
    });
    return obj;
  });

  // Add totals row if exists
  if (props.totals && props.totals.length > 0) {
    const totalsRow = {};
    props.totals.forEach(total => {
      totalsRow[total.label] = total.value;
    });
    exportData.push(totalsRow);
  }

  // Create worksheet and workbook
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  // Export
  XLSX.writeFile(wb, `report_${props.reportId}.xlsx`);

  toast.add({
    severity: 'success',
    summary: 'Экспорт',
    detail: 'Отчет экспортирован в Excel',
    life: 3000
  });
}

function exportToHTML() {
  // Generate standalone HTML file from report data
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${reportTitle.value}</title>
  <style>
    body {
      font-family: Verdana, Tahoma, Arial, sans-serif;
      font-size: 13px;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .report-container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    h3 {
      text-align: center;
      color: #333;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }
    thead th {
      background-color: #f9f9f9;
      border: 1px solid #ddd;
      padding: 12px 8px;
      text-align: center;
      font-weight: bold;
      color: #333;
      white-space: normal;
      vertical-align: top;
    }
    tbody td {
      border: 1px solid #ddd;
      padding: 8px;
      color: #333;
    }
    tbody tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    tbody tr:hover {
      background-color: #f0f0f0;
    }
    tfoot td {
      border: 1px solid #ddd;
      padding: 12px 8px;
      font-weight: bold;
      text-align: right;
      background-color: #f9f9f9;
    }
    .export-info {
      text-align: center;
      font-size: 11px;
      color: #888;
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <h3>${reportTitle.value}</h3>
    <table>
      <thead><tr>`;

  // Add column headers
  props.columns.forEach(col => {
    html += `<th>${col.header}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Add data rows
  props.reportData.forEach(row => {
    html += '<tr>';
    props.columns.forEach(col => {
      const value = row[col.field];
      // Escape HTML to prevent XSS
      const escaped = String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<td>${escaped}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  // Add totals footer if exists
  if (props.totals && props.totals.length > 0) {
    html += '<tfoot><tr>';
    props.totals.forEach((total, index) => {
      if (index === 0) {
        html += `<td colspan="${props.columns.length - props.totals.length}">&nbsp;</td>`;
      }
      html += `<td>${total.label}: ${total.value}</td>`;
    });
    html += '</tr></tfoot>';
  }

  html += `</table>
    <div class="export-info">
      Экспортировано ${new Date().toLocaleString('ru-RU')} | Создано в Integram
    </div>
  </div>
</body>
</html>`;

  // Create Blob and trigger download
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${props.reportId}_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.add({
    severity: 'success',
    summary: 'Экспорт',
    detail: 'Отчет экспортирован в HTML',
    life: 3000
  });
}

// Parameter Methods
function initializeParameters() {
  if (props.reportParameters && props.reportParameters.length > 0) {
    const initialValues = {};
    props.reportParameters.forEach(param => {
      initialValues[param.name] = param.defaultValue || null;
    });
    parameterValues.value = initialValues;
  }
}

function applyParameters() {
  emit('apply-parameters', parameterValues.value);
  toast.add({
    severity: 'success',
    summary: 'Параметры применены',
    detail: 'Отчет обновлен с новыми параметрами',
    life: 3000
  });
}

function resetParameters() {
  initializeParameters();
  toast.add({
    severity: 'info',
    summary: 'Параметры сброшены',
    detail: 'Параметры установлены в значения по умолчанию',
    life: 3000
  });
}

// Initialize parameters on mount
watch(
  () => props.reportParameters,
  () => {
    initializeParameters();
  },
  { immediate: true }
);
</script>

<style scoped>
.integram-report {
  width: 100%;
}
</style>
