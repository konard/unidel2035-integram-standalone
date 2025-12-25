<template>
  <div class="integram-object-table">
    <!-- Table Header with Actions -->
    <div class="flex justify-content-between align-items-center mb-3">
      <h4 class="m-0">{{ tableTitle }}</h4>
      <div class="flex gap-2">
        <Button
          icon="pi pi-plus"
          label="Добавить строку"
          @click="addNewRow"
          size="small"
          :disabled="!canEdit"
        />
        <Button
          icon="pi pi-table"
          label="Добавить колонку"
          @click="showAddColumnDialog"
          size="small"
          severity="secondary"
          :disabled="!canEdit"
        />
        <Button
          icon="pi pi-pencil"
          :label="inlineEditMode ? 'Отключить редактирование' : 'Редактировать в таблице'"
          @click="toggleInlineEdit"
          size="small"
          :severity="inlineEditMode ? 'success' : 'secondary'"
          outlined
        />
        <Button
          icon="pi pi-download"
          label="Экспорт"
          @click="exportTable"
          size="small"
          severity="help"
          outlined
        />
      </div>
    </div>

    <!-- Table with Inline Editing -->
    <DataTable
      :value="tableData"
      :paginator="true"
      :rows="rowsPerPage"
      :rowsPerPageOptions="[10, 20, 50, 100]"
      v-model:filters="filters"
      filterDisplay="row"
      :globalFilterFields="['id', 'val']"
      editMode="cell"
      @cell-edit-complete="onCellEditComplete"
      :loading="loading"
      showGridlines
      stripedRows
      resizableColumns
      columnResizeMode="expand"
      class="editable-table"
    >
      <!-- ID Column -->
      <Column field="id" header="ID" :sortable="true" style="min-width: 100px">
        <template #body="{ data }">
          <code>{{ data.id }}</code>
        </template>
        <template #filter="{ filterModel, filterCallback }">
          <InputText
            v-model="filterModel.value"
            @input="filterCallback()"
            type="text"
            placeholder="Поиск по ID"
            class="p-column-filter"
          />
        </template>
      </Column>

      <!-- Val Column (always editable) -->
      <Column field="val" header="Значение" :sortable="true" style="min-width: 200px">
        <template #body="{ data }">
          <div class="editable-cell" :class="{ 'edit-mode': inlineEditMode }">
            {{ data.val }}
          </div>
        </template>
        <template #editor="{ data, field }">
          <InputText v-model="data[field]" autofocus />
        </template>
        <template #filter="{ filterModel, filterCallback }">
          <InputText
            v-model="filterModel.value"
            @input="filterCallback()"
            type="text"
            placeholder="Поиск по значению"
            class="p-column-filter"
          />
        </template>
      </Column>

      <!-- Parent (up) Column -->
      <Column field="up" header="Родитель" :sortable="true" style="min-width: 120px">
        <template #body="{ data }">
          <code v-if="data.up">{{ data.up }}</code>
          <span v-else class="text-muted">—</span>
        </template>
        <template #editor="{ data, field }">
          <InputText v-model="data[field]" />
        </template>
      </Column>

      <!-- Dynamic Requisite Columns -->
      <Column
        v-for="reqId in requisiteColumns"
        :key="reqId"
        :field="`req_${reqId}`"
        :header="getRequisiteName(reqId)"
        :sortable="true"
        style="min-width: 150px"
      >
        <template #body="{ data }">
          <div class="editable-cell" :class="{ 'edit-mode': inlineEditMode }">
            {{ data[`req_${reqId}`] || '—' }}
          </div>
        </template>
        <template #editor="{ data, field }">
          <component
            :is="getEditorComponent(reqId)"
            v-model="data[field]"
            :options="getRequisiteOptions(reqId)"
          />
        </template>
        <template #header>
          <div class="flex align-items-center justify-content-between">
            <span>{{ getRequisiteName(reqId) }}</span>
            <Button
              icon="pi pi-trash"
              @click="confirmDeleteColumn(reqId)"
              size="small"
              text
              rounded
              severity="danger"
              class="ml-2"
              v-tooltip="'Удалить колонку'"
            />
          </div>
        </template>
      </Column>

      <!-- Actions Column -->
      <Column header="Действия" :frozen="true" alignFrozen="right" style="min-width: 120px">
        <template #body="{ data }">
          <div class="flex gap-2">
            <Button
              icon="pi pi-eye"
              @click="viewObject(data.id)"
              size="small"
              text
              rounded
              v-tooltip="'Просмотр'"
            />
            <Button
              icon="pi pi-pencil"
              @click="editObject(data.id)"
              size="small"
              text
              rounded
              severity="info"
              v-tooltip="'Редактировать'"
            />
            <Button
              icon="pi pi-trash"
              @click="confirmDeleteRow(data.id)"
              size="small"
              text
              rounded
              severity="danger"
              v-tooltip="'Удалить'"
            />
          </div>
        </template>
      </Column>

      <template #footer>
        <div class="flex justify-content-between align-items-center">
          <span>Всего записей: {{ tableData.length }}</span>
          <span v-if="lastSaved" class="text-sm text-color-secondary">
            Последнее сохранение: {{ lastSaved }}
          </span>
        </div>
      </template>
    </DataTable>

    <!-- Add Column Dialog -->
    <Dialog
      v-model:visible="addColumnDialog.visible"
      header="Добавить колонку (реквизит)"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="newReqType">Тип реквизита</label>
          <Select
            v-if="availableTypes"
            id="newReqType"
            v-model="addColumnDialog.typeId"
            :options="availableTypes"
            optionLabel="name"
            optionValue="id"
            placeholder="Выберите тип"
            class="w-full"
            filter
          />
          <InputText
            v-else
            id="newReqType"
            v-model="addColumnDialog.typeId"
            placeholder="ID типа"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="addColumnDialog.visible = false" text />
        <Button
          label="Добавить"
          icon="pi pi-check"
          @click="addColumn"
          :loading="addColumnDialog.loading"
          :disabled="!addColumnDialog.typeId"
        />
      </template>
    </Dialog>

    <!-- Delete Row Confirmation -->
    <Dialog
      v-model:visible="deleteRowDialog.visible"
      header="Подтверждение удаления"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-warning"></i>
        <span>Вы уверены, что хотите удалить строку с ID <strong>{{ deleteRowDialog.objectId }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="deleteRowDialog.visible = false" text />
        <Button
          label="Удалить"
          icon="pi pi-check"
          severity="danger"
          @click="deleteRow"
          :loading="deleteRowDialog.loading"
        />
      </template>
    </Dialog>

    <!-- Delete Column Confirmation -->
    <Dialog
      v-model:visible="deleteColumnDialog.visible"
      header="Подтверждение удаления колонки"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-warning"></i>
        <span>
          Вы уверены, что хотите удалить колонку <strong>{{ getRequisiteName(deleteColumnDialog.reqId) }}</strong>?
          Это действие удалит реквизит из типа.
        </span>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="deleteColumnDialog.visible = false" text />
        <Button
          label="Удалить"
          icon="pi pi-check"
          severity="danger"
          @click="deleteColumn"
          :loading="deleteColumnDialog.loading"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { FilterMatchMode } from '@primevue/core/api';
import { useToast } from 'primevue/usetoast';

const props = defineProps({
  tableData: {
    type: Array,
    required: true
  },
  metadata: {
    type: Object,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  canEdit: {
    type: Boolean,
    default: true
  },
  availableTypes: {
    type: Array,
    default: null
  }
});

const emit = defineEmits([
  'refresh',
  'cell-updated',
  'row-added',
  'row-deleted',
  'column-added',
  'column-deleted',
  'view-object',
  'edit-object'
]);

const toast = useToast();

// State
const loading = ref(false);
const inlineEditMode = ref(false);
const rowsPerPage = ref(20);
const lastSaved = ref(null);

// Filters
const filters = ref({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS }
});

// Dialogs
const addColumnDialog = ref({
  visible: false,
  typeId: '',
  loading: false
});

const deleteRowDialog = ref({
  visible: false,
  objectId: null,
  loading: false
});

const deleteColumnDialog = ref({
  visible: false,
  reqId: null,
  loading: false
});

// Computed
const tableTitle = computed(() => {
  return props.metadata?.type?.val || 'Таблица объектов';
});

const requisiteColumns = computed(() => {
  return props.metadata?.req_order || [];
});

// Methods
function getRequisiteName(reqId) {
  return props.metadata?.req_type?.[reqId] || `Реквизит ${reqId}`;
}

function getRequisiteType(reqId) {
  return props.metadata?.req_base?.[reqId] || 'STRING';
}

function getEditorComponent(reqId) {
  const baseType = getRequisiteType(reqId);

  // Map base types to editor components
  switch (baseType) {
    case 'INT':
    case 'SIGNED':
    case 'FLOAT':
      return InputText; // TODO: Use InputNumber when available
    case 'BOOL':
      return 'Checkbox';
    case 'DATE':
      return 'Calendar';
    case 'TEXT':
      return 'Textarea';
    default:
      return InputText;
  }
}

function getRequisiteOptions() {
  // For reference fields, return options from dictionary
  // This is a simplified version - actual implementation would fetch from ref
  return [];
}

function toggleInlineEdit() {
  inlineEditMode.value = !inlineEditMode.value;

  toast.add({
    severity: 'info',
    summary: inlineEditMode.value ? 'Режим редактирования включен' : 'Режим редактирования выключен',
    detail: inlineEditMode.value ? 'Кликните на ячейку для редактирования' : 'Редактирование отключено',
    life: 3000
  });
}

async function onCellEditComplete(event) {
  const { data, newValue, field } = event;

  if (newValue === data[field]) {
    return; // No changes
  }

  data[field] = newValue;

  // Save to API
  try {
    await saveCellValue(data.id, field, newValue);

    lastSaved.value = new Date().toLocaleTimeString('ru-RU');

    emit('cell-updated', {
      objectId: data.id,
      field,
      value: newValue
    });

    toast.add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Изменения успешно сохранены',
      life: 2000
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    });
  }
}

async function saveCellValue(objectId, field, value) {
  // Determine if it's a val field or requisite
  if (field === 'val') {
    // Save object value using _m_save
    const response = await fetch(
      `/api/integram-test/_m_save/${props.sessionId}/${objectId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value,
          typeId: props.metadata.type.id
        })
      }
    );

    if (!response.ok) {
      throw new Error('Ошибка сохранения значения');
    }
  } else if (field.startsWith('req_')) {
    // Save requisite using _m_set
    const reqId = field.replace('req_', '');
    const response = await fetch(
      `/api/integram-test/_m_set/${props.sessionId}/${objectId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reqs: {
            [reqId]: value
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error('Ошибка сохранения реквизита');
    }
  }
}

function addNewRow() {
  // Emit event to parent to handle row addition
  emit('row-added');
}

function showAddColumnDialog() {
  addColumnDialog.value.visible = true;
  addColumnDialog.value.typeId = '';
}

async function addColumn() {
  addColumnDialog.value.loading = true;

  try {
    // Add requisite to type using _d_req API
    const response = await fetch(
      `/api/integram-test/_d_req/${props.sessionId}/${props.metadata.type.id}?t=${addColumnDialog.value.typeId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error('Ошибка добавления реквизита');
    }

    const result = await response.json();

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Колонка добавлена',
      life: 3000
    });

    addColumnDialog.value.visible = false;

    emit('column-added', result.data);
    emit('refresh');
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    });
  } finally {
    addColumnDialog.value.loading = false;
  }
}

function confirmDeleteRow(objectId) {
  deleteRowDialog.value.objectId = objectId;
  deleteRowDialog.value.visible = true;
}

async function deleteRow() {
  deleteRowDialog.value.loading = true;

  try {
    const response = await fetch(
      `/api/integram-test/_m_del/${props.sessionId}/${deleteRowDialog.value.objectId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error('Ошибка удаления объекта');
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Строка удалена',
      life: 3000
    });

    deleteRowDialog.value.visible = false;

    emit('row-deleted', deleteRowDialog.value.objectId);
    emit('refresh');
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    });
  } finally {
    deleteRowDialog.value.loading = false;
  }
}

function confirmDeleteColumn(reqId) {
  deleteColumnDialog.value.reqId = reqId;
  deleteColumnDialog.value.visible = true;
}

async function deleteColumn() {
  deleteColumnDialog.value.loading = true;

  try {
    // Delete requisite using _d_del_req API
    const response = await fetch(
      `/api/integram-test/_d_del_req/${props.sessionId}/${deleteColumnDialog.value.reqId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error('Ошибка удаления реквизита');
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Колонка удалена',
      life: 3000
    });

    deleteColumnDialog.value.visible = false;

    emit('column-deleted', deleteColumnDialog.value.reqId);
    emit('refresh');
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    });
  } finally {
    deleteColumnDialog.value.loading = false;
  }
}

function viewObject(objectId) {
  emit('view-object', objectId);
}

function editObject(objectId) {
  emit('edit-object', objectId);
}

function exportTable() {
  // Export table data to CSV
  const csv = convertToCSV(props.tableData);
  downloadCSV(csv, `${tableTitle.value}.csv`);

  toast.add({
    severity: 'success',
    summary: 'Экспорт',
    detail: 'Таблица экспортирована в CSV',
    life: 3000
  });
}

function convertToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = ['ID', 'Значение', 'Родитель', ...requisiteColumns.value.map(id => getRequisiteName(id))];
  const rows = data.map(row => [
    row.id,
    row.val,
    row.up || '',
    ...requisiteColumns.value.map(id => row[`req_${id}`] || '')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
</script>

<style scoped>
.integram-object-table {
  width: 100%;
}

.editable-table :deep(.p-datatable-tbody > tr > td) {
  cursor: pointer;
}

.editable-table :deep(.p-datatable-tbody > tr > td.p-cell-editing) {
  background-color: var(--highlight-bg);
}

.editable-cell {
  min-height: 1.5rem;
  padding: 0.25rem;
}

.editable-cell.edit-mode {
  background-color: var(--surface-hover);
  border-radius: 4px;
}

.editable-cell.edit-mode:hover {
  background-color: var(--highlight-bg);
}
</style>
