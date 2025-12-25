<template>
  <div class="integram-table-view-container">
    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between flex-wrap gap-3">
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb p-0 m-0">
              <li class="breadcrumb-item">
                <router-link :to="`/integram/${databaseName}`"><i class="pi pi-database mr-1"></i>{{ databaseName }}</router-link>
              </li>
              <li class="breadcrumb-item">
                <router-link :to="`/integram/${databaseName}/dict`"><i class="pi pi-table mr-1"></i>Таблицы</router-link>
              </li>
              <li class="breadcrumb-item active" aria-current="page">
                <i class="pi pi-bars mr-1"></i>{{ typeData?.val || 'Loading...' }}
              </li>
            </ol>
          </nav>

          <div class="flex gap-2 align-items-center flex-wrap">
            <!-- Main controls -->
            <Button
              icon="pi pi-plus"
              label="Создать"
              size="small"
              @click="addRecord"
              v-tooltip.bottom="'Добавить запись'"
              :disabled="loading"
            />

            <Button
              icon="pi pi-filter"
              size="small"
              outlined
              @click="showFilters = !showFilters"
              v-tooltip.bottom="'Показать/скрыть фильтры'"
            />

            <Button
              icon="pi pi-filter-slash"
              size="small"
              outlined
              @click="clearFilters"
              v-tooltip.bottom="'Сбросить фильтры'"
              v-if="hasActiveFilters"
            />

            <Button
              icon="pi pi-refresh"
              size="small"
              outlined
              @click="loadObjects"
              v-tooltip.bottom="'Обновить'"
              :loading="loading"
            />

            <Button
              icon="pi pi-pencil"
              size="small"
              outlined
              @click="toggleInlineEdit"
              :class="{ 'button-on': inlineEditEnabled }"
              v-tooltip.bottom="'Редактировать ячейки'"
            />

            <Dropdown
              v-model="compactMode"
              :options="compactModes"
              optionLabel="label"
              optionValue="value"
              placeholder="Режим просмотра"
              size="small"
              @change="applyCompactMode"
            />
          </div>
        </div>
      </template>

      <template #content>
        <div v-if="loading && !objectsData" class="text-center py-5">
          <ProgressSpinner />
        </div>

        <div v-else-if="error" class="text-center py-5">
          <Message severity="error" :closable="false">{{ error }}</Message>
        </div>

        <div v-else-if="objectsData" class="table-wrapper">
          <!-- Filter row -->
          <div v-if="showFilters && requisites.length > 0" class="filter-panel mb-3 p-3 border-round surface-50">
            <div class="grid">
              <div class="col-12 md:col-3">
                <label class="text-sm mb-2 block">Значение</label>
                <InputText
                  v-model="filters.val"
                  placeholder="Фильтр по значению"
                  class="w-full"
                  size="small"
                />
              </div>
              <div v-for="req in requisites" :key="req.id" class="col-12 md:col-3">
                <label class="text-sm mb-2 block">{{ req.val }}</label>
                <InputText
                  v-model="filters[`req_${req.id}`]"
                  :placeholder="`Фильтр: ${req.val}`"
                  class="w-full"
                  size="small"
                />
              </div>
            </div>
          </div>

          <!-- Objects Table -->
          <DataTable
            :value="filteredObjects"
            v-model:selection="selectedRows"
            :paginator="false"
            sortMode="multiple"
            removableSort
            stripedRows
            scrollable
            scrollHeight="600px"
            :class="['integram-table', `mode-${compactMode}`]"
            tableStyle="min-width: 50rem"
            @row-click="onRowClick"
            @row-select="onRowSelectionChange"
            @row-unselect="onRowSelectionChange"
            dataKey="id"
          >
            <!-- Selection Column -->
            <Column selectionMode="multiple" style="width: 50px" headerStyle="width: 50px" />

            <!-- Column N (Order number) -->
            <Column
              field="ord"
              header="N"
              style="width: 60px; text-align: center"
              headerStyle="text-align: center"
              sortable
            >
              <template #body="slotProps">
                <span class="text-color-secondary text-sm">{{ slotProps.index + 1 }}</span>
              </template>
            </Column>

            <!-- Main Value Column (with type name as header) -->
            <Column
              field="val"
              :header="typeData?.val || 'Value'"
              sortable
              style="min-width: 200px"
            >
              <template #body="slotProps">
                <div
                  :class="{
                    'editable-cell': inlineEditEnabled,
                    'editing': editingCell?.rowId === slotProps.data.id && editingCell?.field === 'val'
                  }"
                  @click="handleCellClick(slotProps.data, 'val', slotProps.data.val, 'TEXT')"
                >
                  <template v-if="editingCell?.rowId === slotProps.data.id && editingCell?.field === 'val'">
                    <MentionAutocomplete
                      v-model="editingValue"
                      :database="databaseName"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data)"
                      @keydown.enter="saveEdit(slotProps.data)"
                      @keydown.esc="cancelEdit"
                    />
                  </template>
                  <template v-else>
                    <MentionDisplay
                      :text="slotProps.data.val"
                      :database="databaseName"
                      class="value-text font-semibold"
                    />
                  </template>
                </div>
              </template>
            </Column>

            <!-- Requisite columns -->
            <Column
              v-for="req in requisites"
              :key="req.id"
              :field="`req_${req.id}`"
              :header="req.val"
              sortable
            >
              <template #body="slotProps">
                <div
                  :class="{
                    'editable-cell': inlineEditEnabled,
                    'editing': editingCell?.rowId === slotProps.data.id && editingCell?.field === `req_${req.id}`
                  }"
                  @click="handleCellClick(slotProps.data, `req_${req.id}`, getRequisiteValue(slotProps.data.id, req.id), req.base || 'TEXT')"
                >
                  <template v-if="editingCell?.rowId === slotProps.data.id && editingCell?.field === `req_${req.id}`">
                    <!-- Different input types based on requisite base type -->
                    <InputNumber
                      v-if="req.base === 'NUMBER' || req.base === 'SIGNED'"
                      v-model="editingValue"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Checkbox
                      v-else-if="req.base === 'BOOLEAN'"
                      v-model="editingValue"
                      binary
                      @change="saveEdit(slotProps.data, req.id)"
                    />
                    <Calendar
                      v-else-if="req.base === 'DATE'"
                      v-model="editingValue"
                      dateFormat="yy-mm-dd"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Calendar
                      v-else-if="req.base === 'DATETIME'"
                      v-model="editingValue"
                      showTime
                      dateFormat="yy-mm-dd"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Textarea
                      v-else-if="req.base === 'MEMO'"
                      v-model="editingValue"
                      class="inline-edit w-full"
                      rows="3"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <MentionAutocomplete
                      v-else
                      v-model="editingValue"
                      :database="databaseName"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                    />
                  </template>
                  <template v-else>
                    <span v-if="req.base === 'BOOLEAN'">
                      {{ getRequisiteValue(slotProps.data.id, req.id) === 'X' ? '✓' : '' }}
                    </span>
                    <MentionDisplay
                      v-else
                      :text="getRequisiteValue(slotProps.data.id, req.id)"
                      :database="databaseName"
                    />
                  </template>
                </div>
              </template>
            </Column>

            <!-- Actions Column -->
            <Column header="" style="width: 120px">
              <template #body="slotProps">
                <div class="flex gap-1 justify-content-end action-buttons">
                  <Button
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    @click.stop="editObject(slotProps.data.id)"
                    v-tooltip.bottom="'Редактировать'"
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    rounded
                    size="small"
                    severity="danger"
                    @click.stop="confirmDelete(slotProps.data)"
                    v-tooltip.bottom="'Удалить'"
                  />
                </div>
              </template>
            </Column>

            <template #empty>
              <div class="text-center py-4">
                <i class="pi pi-inbox text-4xl text-color-secondary mb-2"></i>
                <p class="text-color-secondary">Объекты не найдены</p>
              </div>
            </template>
          </DataTable>

          <!-- Sub-totals Panel -->
          <Panel
            v-if="selectedRows.length > 0"
            header="Итого"
            class="mt-3"
            :toggleable="true"
            v-model:collapsed="!showSubtotals"
          >
            <div class="mb-2">
              <strong>Выбрано строк: {{ selectedRows.length }}</strong>
              <Button
                icon="pi pi-times"
                size="small"
                text
                rounded
                @click="selectedRows = []"
                v-tooltip.bottom="'Снять выделение'"
                class="ml-2"
              />
            </div>

            <div v-if="numericRequisites.length > 0" class="grid">
              <div
                v-for="req in numericRequisites"
                :key="req.id"
                class="col-12 md:col-6 lg:col-4"
              >
                <div v-if="subtotals[req.id]" class="p-3 border-round surface-50">
                  <div class="font-semibold mb-2">{{ req.val }}</div>
                  <div class="grid text-sm">
                    <div class="col-6">
                      <div class="text-500">Кол-во:</div>
                      <div class="font-bold">{{ subtotals[req.id].count }}</div>
                    </div>
                    <div class="col-6">
                      <div class="text-500">Сумма:</div>
                      <div class="font-bold">{{ subtotals[req.id].sum }}</div>
                    </div>
                    <div class="col-6">
                      <div class="text-500">Среднее:</div>
                      <div class="font-bold">{{ subtotals[req.id].avg }}</div>
                    </div>
                    <div class="col-6">
                      <div class="text-500">Мин:</div>
                      <div class="font-bold">{{ subtotals[req.id].min }}</div>
                    </div>
                    <div class="col-6">
                      <div class="text-500">Макс:</div>
                      <div class="font-bold">{{ subtotals[req.id].max }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-500">
              Нет числовых колонок для расчёта итогов
            </div>
          </Panel>

          <!-- Custom Pagination -->
          <div v-if="totalPages > 1 || objectsList.length >= rowsPerPage" class="mt-3 flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="text-color-secondary text-sm">
              Страница {{ currentPage }} из {{ totalPages }}
              <span v-if="totalObjects">
                (всего объектов: {{ totalObjects }})
              </span>
            </div>
            <div class="flex gap-2 align-items-center">
              <Button
                icon="pi pi-angle-left"
                size="small"
                outlined
                :disabled="currentPage === 1"
                @click="goToPage(currentPage - 1)"
                v-tooltip.bottom="'Предыдущая страница'"
              />
              <span class="text-sm">Стр. {{ currentPage }}</span>
              <Button
                icon="pi pi-angle-right"
                size="small"
                outlined
                :disabled="currentPage >= totalPages || objectsList.length < rowsPerPage"
                @click="goToPage(currentPage + 1)"
                v-tooltip.bottom="'Следующая страница'"
              />
              <Dropdown
                v-model="rowsPerPage"
                :options="[10, 20, 25, 50, 100]"
                @change="handleRowsPerPageChange"
                size="small"
                class="w-auto"
              />
            </div>
          </div>

          <!-- Summary -->
          <div class="mt-3 text-color-secondary text-sm">
            Показано объектов: {{ filteredObjects.length }}
            <span v-if="hasActiveFilters">
              (фильтры применены)
            </span>
          </div>
        </div>
      </template>
    </Card>

    <!-- Create Object Dialog -->
    <Dialog
      v-model:visible="showCreateDialog"
      modal
      :header="'Создать: ' + (typeData?.val || 'Объект')"
      :style="{ width: '50rem' }"
      :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="objectValue">Значение *</label>
          <InputText
            id="objectValue"
            v-model="createForm.value"
            placeholder="Введите значение"
            class="w-full"
          />
        </div>

        <!-- Parent info (auto-detected from F_U URL param) -->
        <div v-if="typeData?.up !== '0'" class="field">
          <label>Родитель</label>
          <div class="p-inputgroup">
            <span class="p-inputgroup-addon">
              <i class="pi pi-link"></i>
            </span>
            <InputText
              :value="route.query.F_U || 'Не указан'"
              disabled
              class="w-full"
            />
          </div>
          <small v-if="route.query.F_U" class="text-green-500">
            <i class="pi pi-check"></i> Родитель определён автоматически из контекста
          </small>
          <small v-else class="text-orange-500">
            <i class="pi pi-exclamation-triangle"></i> Откройте таблицу из родительской записи для создания подчинённых объектов
          </small>
        </div>

        <!-- Requisites -->
        <Divider v-if="requisites.length > 0" />
        <div v-for="req in requisites" :key="req.id" class="field">
          <label :for="'req_' + req.id">{{ req.val }}</label>

          <InputNumber
            v-if="req.base === 'NUMBER' || req.base === 'SIGNED'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
          />
          <Checkbox
            v-else-if="req.base === 'BOOLEAN'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            binary
          />
          <Calendar
            v-else-if="req.base === 'DATE'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            dateFormat="yy-mm-dd"
            class="w-full"
          />
          <Calendar
            v-else-if="req.base === 'DATETIME'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            showTime
            dateFormat="yy-mm-dd"
            class="w-full"
          />
          <Textarea
            v-else-if="req.base === 'MEMO'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
            rows="3"
          />
          <InputText
            v-else
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" text @click="showCreateDialog = false" />
        <Button
          label="Создать"
          :loading="creating"
          @click="handleCreate"
          :disabled="!createForm.value || (typeData?.up !== '0' && !route.query.F_U)"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useIntegramSession } from '@/composables/useIntegramSession';
import integramApiClient from '@/services/integramApiClient';
import MentionAutocomplete from '@/components/integram/MentionAutocomplete.vue';
import MentionDisplay from '@/components/integram/MentionDisplay.vue';

// PrimeVue Components

const props = defineProps({
  typeId: {
    type: [String, Number],
    required: true
  }
});

const router = useRouter();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const { isAuthenticated } = useIntegramSession();

// State
const loading = ref(false);
const error = ref(null);
const creating = ref(false);
const saving = ref(false);
const showCreateDialog = ref(false);
const showFilters = ref(false);
const inlineEditEnabled = ref(false);
const selectedRows = ref([]);
const showSubtotals = ref(false);

// Editing state
const editingCell = ref(null);
const editingValue = ref(null);

// Data
const objectsData = ref(null);
const typeData = ref(null);
const requisites = ref([]);
const objectsList = ref([]);
const requisitesData = ref({});

// Database name for breadcrumb
const databaseName = computed(() => integramApiClient.getDatabase() || 'База');

// View modes
const compactMode = ref('normal');
const compactModes = [
  { label: 'Обычный', value: 'normal' },
  { label: 'Компактный', value: 'compact' },
  { label: 'Фикс. высота', value: 'fixed' },
  { label: 'Фикс. ширина', value: 'ultra' }
];

const rowsPerPage = ref(25);
const currentPage = ref(1);
const totalPages = ref(1);
const totalObjects = ref(0);

// Filters
const filters = ref({
  val: ''
});

// Create form
const createForm = ref({
  value: '',
  requisites: {}
});

// Computed
const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v && v.length > 0);
});

const filteredObjects = computed(() => {
  if (!hasActiveFilters.value) {
    return objectsList.value;
  }

  return objectsList.value.filter(obj => {
    // Filter by val
    if (filters.value.val && !obj.val.toLowerCase().includes(filters.value.val.toLowerCase())) {
      return false;
    }

    // Filter by requisites
    for (const key in filters.value) {
      if (key.startsWith('req_') && filters.value[key]) {
        const reqId = key.replace('req_', '');
        const value = getRequisiteValue(obj.id, reqId);
        if (!value || !value.toLowerCase().includes(filters.value[key].toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  });
});

const numericRequisites = computed(() => {
  return requisites.value.filter(req =>
    req.base === 'NUMBER' || req.base === 'SIGNED'
  );
});

const subtotals = computed(() => {
  if (selectedRows.value.length === 0) return {};

  const result = {};

  numericRequisites.value.forEach(req => {
    const values = selectedRows.value
      .map(row => parseFloat(getRequisiteValue(row.id, req.id)))
      .filter(v => !isNaN(v));

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      result[req.id] = {
        count: values.length,
        sum: sum.toFixed(2),
        avg: avg.toFixed(2),
        min: min.toFixed(2),
        max: max.toFixed(2)
      };
    }
  });

  return result;
});

// Methods
async function loadObjects(page = 1) {
  if (!isAuthenticated.value) {
    router.replace('/integram/login');
    return;
  }

  try {
    loading.value = true;
    error.value = null;

    // Build filters including pagination
    const queryFilters = {
      pg: page,
      LIMIT: rowsPerPage.value
    };

    const data = await integramApiClient.getObjectList(props.typeId, queryFilters);
    objectsData.value = data;
    typeData.value = data.type;
    objectsList.value = data.object || [];
    requisitesData.value = data.reqs || {};

    // Update current page from response if available
    if (data.current_page !== undefined) {
      currentPage.value = data.current_page;
    }

    // Parse pagination metadata if available
    if (data.total_objects !== undefined) {
      totalObjects.value = data.total_objects;
    } else {
      // Fallback: estimate based on current data
      if ((data.object || []).length >= rowsPerPage.value) {
        totalObjects.value = (data.object || []).length * 2;
      } else {
        totalObjects.value = (data.object || []).length;
      }
    }

    // Calculate total pages
    if (data.total_pages !== undefined) {
      totalPages.value = data.total_pages;
    } else if (rowsPerPage.value > 0 && totalObjects.value > 0) {
      totalPages.value = Math.ceil(totalObjects.value / rowsPerPage.value);
    } else if ((data.object || []).length >= rowsPerPage.value) {
      totalPages.value = page + 1;
    } else {
      totalPages.value = page;
    }

    // Extract requisites from response
    if (data.req_type && data.req_order) {
      requisites.value = data.req_order.map(reqId => ({
        id: reqId,
        val: data.req_type[reqId] || `Req ${reqId}`,
        base: data.req_base?.[reqId] || 'TEXT',
        baseId: data.req_base_id?.[reqId]
      }));
    }
  } catch (err) {
    error.value = err.message;
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить объекты: ' + err.message,
      life: 5000
    });
  } finally {
    loading.value = false;
  }
}

function getRequisiteValue(objectId, requisiteId) {
  return requisitesData.value[objectId]?.[requisiteId] || '';
}

function clearFilters() {
  filters.value = { val: '' };
}

function toggleInlineEdit() {
  inlineEditEnabled.value = !inlineEditEnabled.value;
  if (!inlineEditEnabled.value) {
    cancelEdit();
  }
}

function applyCompactMode() {
  // Applied via CSS classes
}

function addRecord() {
  showCreateDialog.value = true;
}

function onRowClick(event) {
  // Row click handling if needed
}

function onRowSelectionChange() {
  // Auto-show sub-totals panel when rows are selected
  if (selectedRows.value.length > 0) {
    showSubtotals.value = true;
  }
}

function goToPage(page) {
  if (page < 1 || page === currentPage.value) return;

  currentPage.value = page;
  loadObjects(page);
}

function handleRowsPerPageChange() {
  currentPage.value = 1;
  loadObjects(1);
}

function handleCellClick(rowData, field, value, baseType) {
  if (!inlineEditEnabled.value) return;

  // Don't allow editing ID or certain system fields
  if (field === 'id') return;

  editingCell.value = {
    rowId: rowData.id,
    field: field,
    baseType: baseType
  };

  // Set editing value based on type
  if (baseType === 'BOOLEAN') {
    editingValue.value = value === 'X';
  } else if (baseType === 'DATE' || baseType === 'DATETIME') {
    editingValue.value = value ? new Date(value) : null;
  } else if (baseType === 'NUMBER' || baseType === 'SIGNED') {
    editingValue.value = value ? parseFloat(value) : null;
  } else {
    editingValue.value = value || '';
  }
}

function cancelEdit() {
  editingCell.value = null;
  editingValue.value = null;
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && inlineEditEnabled.value) {
    cancelEdit();
    inlineEditEnabled.value = false; // Exit inline edit mode completely
    toast.add({
      severity: 'info',
      summary: 'Редактирование',
      detail: 'Режим редактирования ячеек отключен',
      life: 2000
    });
  }
}

async function saveEdit(rowData, reqId = null) {
  if (!editingCell.value) return;

  try {
    saving.value = true;

    let valueToSave = editingValue.value;

    // Format value based on type
    if (editingCell.value.baseType === 'BOOLEAN') {
      valueToSave = editingValue.value ? 'X' : '';
    } else if (editingCell.value.baseType === 'DATE') {
      if (editingValue.value) {
        const date = new Date(editingValue.value);
        valueToSave = date.toISOString().split('T')[0];
      } else {
        valueToSave = '';
      }
    } else if (editingCell.value.baseType === 'DATETIME') {
      if (editingValue.value) {
        valueToSave = new Date(editingValue.value).toISOString();
      } else {
        valueToSave = '';
      }
    }

    // Determine what we're updating
    if (editingCell.value.field === 'val') {
      // Update main value - need to get current requisites
      const currentReqs = requisitesData.value[rowData.id] || {};
      await integramApiClient.saveObject(rowData.id, props.typeId, valueToSave, currentReqs);

      // Update local data
      const objIndex = objectsList.value.findIndex(o => o.id === rowData.id);
      if (objIndex !== -1) {
        objectsList.value[objIndex].val = valueToSave;
      }
    } else if (reqId) {
      // Update requisite
      const requisites = {};
      requisites[reqId] = valueToSave;

      await integramApiClient.setObjectRequisites(rowData.id, requisites);

      // Update local data
      if (!requisitesData.value[rowData.id]) {
        requisitesData.value[rowData.id] = {};
      }
      requisitesData.value[rowData.id][reqId] = valueToSave;
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Ячейка обновлена',
      life: 2000
    });

    cancelEdit();
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось обновить: ' + err.message,
      life: 5000
    });
  } finally {
    saving.value = false;
  }
}

function editObject(objectId) {
  // Navigate to single object editor
  router.push(`/integram/edit_obj/${objectId}`);
}

async function handleCreate() {
  try {
    creating.value = true;

    // Get parent ID from URL parameter F_U (auto-detected)
    const parentId = route.query.F_U || null;

    // Validate parent for subordinate types
    if (typeData.value?.up !== '0' && !parentId) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Для создания записи в подчинённой таблице откройте её из родительской записи',
        life: 5000
      });
      return;
    }

    // Build requisites object (key = reqId, value = formatted value)
    const requisitesData = {};

    if (Object.keys(createForm.value.requisites).length > 0) {
      Object.keys(createForm.value.requisites).forEach(reqId => {
        const value = createForm.value.requisites[reqId];
        if (value !== null && value !== undefined && value !== '') {
          // Format value based on type
          const req = requisites.value.find(r => r.id === reqId);
          if (req) {
            if (req.base === 'BOOLEAN') {
              requisitesData[reqId] = value ? 'X' : '';
            } else if (req.base === 'DATE' || req.base === 'DATETIME') {
              if (value instanceof Date) {
                requisitesData[reqId] = req.base === 'DATE'
                  ? value.toISOString().split('T')[0]
                  : value.toISOString();
              } else {
                requisitesData[reqId] = value;
              }
            } else {
              requisitesData[reqId] = value;
            }
          }
        }
      });
    }

    // createObject(typeId, value, requisites, parentId)
    const result = await integramApiClient.createObject(
      props.typeId,
      createForm.value.value,
      requisitesData,
      parentId  // from F_U URL param
    );

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Объект создан!',
      life: 3000
    });

    showCreateDialog.value = false;
    createForm.value = { value: '', requisites: {} };

    // Reload objects
    await loadObjects();

    // Navigate to edit if ID returned
    if (result.id) {
      router.push(`/integram/edit_obj/${result.id}`);
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось создать объект: ' + err.message,
      life: 5000
    });
  } finally {
    creating.value = false;
  }
}

function confirmDelete(object) {
  confirm.require({
    message: `Вы уверены, что хотите удалить "${object.val}" (ID: ${object.id})?`,
    header: 'Подтверждение удаления',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => {
      handleDelete(object.id);
    }
  });
}

async function handleDelete(objectId) {
  try {
    await integramApiClient.deleteObject(objectId);

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Объект удалён!',
      life: 3000
    });

    // Reload objects
    await loadObjects();
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить объект: ' + err.message,
      life: 5000
    });
  }
}

// Lifecycle
onMounted(async () => {
  if (!isAuthenticated.value) {
    router.replace('/integram/login');
    return;
  }

  await loadObjects(1);

  // Add global escape listener for inline edit
  document.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  // Remove global escape listener
  document.removeEventListener('keydown', handleGlobalKeydown);
});

// Watch for typeId changes
watch(() => props.typeId, async (newTypeId) => {
  if (newTypeId) {
    await loadObjects();
  }
});
</script>

<style scoped>
.integram-table-view-container {
  padding: 1rem;
  max-width: 100%;
  margin: 0 auto;
}

.breadcrumb {
  list-style: none;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0;
  margin: 0;
}

.breadcrumb-item {
  font-size: 0.9rem;
}

.breadcrumb-item + .breadcrumb-item::before {
  content: '/';
  padding-right: 0.5rem;
  color: var(--surface-500);
}

.breadcrumb-item.active {
  color: var(--text-color);
  font-weight: 500;
}

.breadcrumb-item a {
  color: var(--primary-color);
  text-decoration: none;
}

.breadcrumb-item a:hover {
  text-decoration: underline;
}

.button-on {
  background-color: var(--surface-200) !important;
}

.table-wrapper {
  overflow-x: auto;
}

.integram-table.mode-compact :deep(.p-datatable-tbody > tr > td) {
  padding: 0.25rem 0.5rem;
  font-size: 0.9rem;
}

.integram-table.mode-fixed :deep(.p-datatable-tbody > tr > td) {
  max-height: 3rem;
  overflow: hidden;
}

.integram-table.mode-ultra :deep(.p-datatable-tbody > tr > td) {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editable-cell {
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;
  min-height: 2rem;
  display: flex;
  align-items: center;
}

.editable-cell:hover {
  background-color: var(--surface-50);
}

.editable-cell.editing {
  padding: 0;
  background-color: var(--highlight-bg);
}

.inline-edit {
  border: 1px solid var(--surface-300) !important;
  padding: 0.5rem !important;
  font-size: inherit;
}

.inline-edit:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.value-text {
  color: var(--text-color);
}

.action-buttons {
  opacity: 0;
  transition: opacity 0.2s;
}

:deep(.p-datatable-tbody > tr:hover) .action-buttons {
  opacity: 1;
}

.filter-panel {
  border: 1px solid var(--surface-300);
}

:deep(.p-datatable) a {
  color: var(--primary-color);
  text-decoration: none;
}

:deep(.p-datatable) a:hover {
  text-decoration: underline;
}
</style>
