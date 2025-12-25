<template>
  <div class="integram-object-list integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <nav class="breadcrumb mb-3">
      <ol class="flex list-none p-2 m-0">
        <li class="mr-2">
          <router-link :to="`/integram/${database}`"><i class="pi pi-database mr-1"></i>{{ database }}</router-link>
        </li>
        <li class="mr-2">
          <span class="text-500">/</span>
        </li>
        <li class="mr-2">
          <router-link :to="`/integram/${database}/dict`"><i class="pi pi-table mr-1"></i>{{ $t('tables') }}</router-link>
        </li>
        <li v-if="parentType" class="mr-2">
          <span class="text-500">/</span>
        </li>
        <li v-if="parentType" class="mr-2">
          <router-link :to="`/integram/${database}/object/${parentType.id}`">
            <i class="pi pi-folder mr-1"></i>{{ parentType.val }}
          </router-link>
        </li>
        <li class="mr-2">
          <span class="text-500">/</span>
        </li>
        <li class="font-bold">
          <i class="pi pi-bars mr-1"></i>{{ typeInfo?.val || 'Loading...' }}
        </li>
      </ol>
    </nav>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-5">
      <ProgressSpinner />
    </div>

    <!-- Main Content -->
    <Card v-else>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <span>{{ typeInfo?.val }}</span>
            <span v-if="typeInfo" class="text-500 text-sm">#{{ typeInfo.id }}</span>
          </div>
          <div class="flex gap-2 align-items-center ml-auto">
            <!-- Display Mode Buttons -->
            <div class="flex gap-1 mr-2">
              <Button
                v-for="opt in displayModeOptions"
                :key="opt.mode"
                :icon="opt.icon"
                @click="setDisplayMode(opt.mode)"
                :severity="displayMode === opt.mode ? 'primary' : 'secondary'"
                :outlined="displayMode !== opt.mode"
                size="small"
                rounded
                v-tooltip.bottom="opt.tooltip"
              />
              <Divider layout="vertical" class="mx-1" />
              <Button
                icon="pi pi-align-left"
                @click="toggleFullText"
                :severity="fullTextMode ? 'primary' : 'secondary'"
                :outlined="!fullTextMode"
                size="small"
                rounded
                v-tooltip.bottom="fullTextMode ? 'Не сокращать' : 'Сократить'"
              />
            </div>
            <Button
              icon="pi pi-plus"
              label="Добавить"
              @click="showAddDialog = true"
              size="small"
              v-tooltip.bottom="'Добавить запись в таблицу'"
            />
            <Button
              icon="pi pi-refresh"
              @click="loadData"
              :loading="loading"
              outlined
              rounded
              size="small"
              v-tooltip.bottom="'Обновить'"
            />
          </div>
        </div>
      </template>

      <template #content>
        <!-- Filters -->
        <Panel header="Фильтры" :toggleable="true" :collapsed="!filtersExpanded" class="mb-3">
          <div class="grid">
            <!-- Search -->
            <div class="col-12 md:col-4">
              <div class="field">
                <label for="search">{{ $t('search') }}</label>
                <InputText
                  id="search"
                  v-model="filters.search"
                  placeholder="Поиск..."
                  class="w-full"
                  @keyup.enter="applyFilters"
                />
              </div>
            </div>

            <!-- Parent Filter (F_U) -->
            <div v-if="allowParentFilter" class="col-12 md:col-4">
              <div class="field">
                <label for="parentFilter">{{ $t('parent') }}</label>
                <InputText
                  id="parentFilter"
                  v-model="filters.parentId"
                  placeholder="ID родителя"
                  class="w-full"
                  @keyup.enter="applyFilters"
                />
              </div>
            </div>

            <!-- Dynamic Field Filters -->
            <div
              v-for="field in filterableFields"
              :key="field.id"
              class="col-12 md:col-4"
            >
              <div class="field">
                <label :for="`filter_${field.id}`">{{ field.name }}</label>

                <!-- Date Range Filter -->
                <div v-if="isDateField(field)" class="flex gap-2">
                  <Calendar
                    v-model="filters.dateFrom[field.id]"
                    :placeholder="`От`"
                    dateFormat="dd.mm.yy"
                    class="flex-1"
                  />
                  <Calendar
                    v-model="filters.dateTo[field.id]"
                    :placeholder="`До`"
                    dateFormat="dd.mm.yy"
                    class="flex-1"
                  />
                </div>

                <!-- Text Filter -->
                <InputText
                  v-else
                  :id="`filter_${field.id}`"
                  v-model="filters.fields[field.id]"
                  :placeholder="`${field.name}...`"
                  class="w-full"
                  @keyup.enter="applyFilters"
                />
              </div>
            </div>

            <!-- Filter Actions -->
            <div class="col-12">
              <Button
                label="Применить"
                icon="pi pi-filter"
                @click="applyFilters"
                class="mr-2"
              />
              <Button
                label="Очистить"
                icon="pi pi-times"
                @click="resetFilters"
                outlined
                v-tooltip.bottom="'Очистить фильтр и сортировку'"
              />
            </div>
          </div>
        </Panel>

        <!-- Data Table -->
        <DataTable
          :value="objects"
          :loading="tableLoading"
          :paginator="true"
          :rows="rowsPerPage"
          :rowsPerPageOptions="[10, 25, 50, 100]"
          v-model:selection="selectedObjects"
          dataKey="id"
          :sortField="sortField"
          :sortOrder="sortOrder"
          @sort="onSort"
          @row-contextmenu="onRowContextMenu"
          stripedRows
          showGridlines
          responsiveLayout="scroll"
          :class="tableClass"
          contextMenu
          v-model:contextMenuSelection="contextMenuObject"
        >
          <!-- Selection Column -->
          <Column selectionMode="multiple" headerStyle="width: 3rem" />

          <!-- ID Column -->
          <Column field="id" header="ID" :sortable="true" style="width: 80px">
            <template #body="{ data }">
              <router-link
                :to="`/integram/${database}/edit/${data.id}`"
                class="text-primary font-semibold"
              >
                #{{ data.id }}
              </router-link>
            </template>
          </Column>

          <!-- Value Column -->
          <Column field="val" :header="typeInfo?.val" :sortable="true">
            <template #body="{ data }">
              <div
                v-if="editingCell && editingCell.objectId === data.id && editingCell.field === 'val'"
                class="inline-edit-cell"
                :class="{ 'saving-cell': savingCell }"
              >
                <InputText
                  v-model="editingValue"
                  @keydown.enter="saveInlineEdit"
                  @keydown.escape="cancelInlineEdit"
                  @blur="saveInlineEdit"
                  autofocus
                  class="w-full"
                  size="small"
                />
              </div>
              <div
                v-else
                @dblclick="startInlineEdit(data, 'val', data.val)"
                class="inline-edit-trigger"
                :title="$t('doubleClickToEdit')"
              >
                <router-link
                  :to="`/integram/${database}/edit/${data.id}`"
                  class="text-primary"
                >
                  {{ data.val }}
                </router-link>
              </div>
            </template>
          </Column>

          <!-- Dynamic Requisite Columns -->
          <Column
            v-for="col in requisiteColumns"
            :key="col.field"
            :field="col.field"
            :sortable="true"
          >
            <template #header>
              <div class="col-header-wrapper flex align-items-center gap-1">
                <span>{{ col.header }}</span>
                <Button
                  icon="pi pi-ellipsis-v"
                  size="small"
                  text
                  rounded
                  @click.stop="showColumnMenu($event, col)"
                  class="col-menu-btn"
                  v-tooltip.top="'Меню колонки'"
                />
              </div>
            </template>
            <template #body="{ data }">
              <!-- Inline Edit Mode -->
              <div
                v-if="editingCell && editingCell.objectId === data.id && editingCell.field === col.field"
                class="inline-edit-cell"
                :class="{ 'saving-cell': savingCell }"
              >
                <InputText
                  v-if="!col.isBoolean && !col.isReference"
                  v-model="editingValue"
                  @keydown.enter="saveInlineEdit"
                  @keydown.escape="cancelInlineEdit"
                  @blur="saveInlineEdit"
                  autofocus
                  class="w-full"
                  size="small"
                />
                <Checkbox
                  v-else-if="col.isBoolean"
                  v-model="editingValue"
                  :binary="true"
                  @change="saveInlineEdit"
                  autofocus
                />
                <span v-else>
                  {{ editingValue }}
                </span>
              </div>

              <!-- Display Mode -->
              <div
                v-else
                @dblclick="startInlineEdit(data, col.field, data[col.field], col)"
                class="inline-edit-trigger"
                :title="$t('doubleClickToEdit')"
              >
                <span v-if="col.isReference">
                  <Tag v-if="data[col.field]" severity="info">
                    {{ data[col.field] }}
                  </Tag>
                </span>
                <span v-else-if="col.isBoolean">
                  <i
                    :class="data[col.field] ? 'pi pi-check text-green-500' : 'pi pi-times text-red-500'"
                  />
                </span>
                <span v-else>
                  {{ data[col.field] }}
                </span>
              </div>
            </template>
          </Column>

          <!-- Array/Subordinate Column -->
          <Column
            v-for="arrCol in arrayColumns"
            :key="`arr_${arrCol.id}`"
            :header="arrCol.name"
          >
            <template #body="{ data }">
              <router-link
                :to="`/integram/${database}/object/${arrCol.id}?F_U=${data.id}`"
                class="text-primary"
              >
                <Badge :value="arrCol.count[data.id] || 0" />
              </router-link>
            </template>
          </Column>

          <!-- Actions Column -->
          <Column header="Действия" style="width: 220px">
            <template #body="{ data }">
              <div class="integram-actions flex gap-2 align-items-center">
                <!-- Primary actions group -->
                <div class="flex gap-1">
                  <Button
                    icon="pi pi-arrow-up"
                    @click="moveObjectUp(data)"
                    text
                    rounded
                    severity="secondary"
                    v-tooltip.top="'Переместить выше'"
                    class="p-button-sm"
                  />
                  <Button
                    icon="pi pi-pencil"
                    @click="editObject(data)"
                    text
                    rounded
                    v-tooltip.top="'Редактировать'"
                    class="p-button-sm"
                  />
                  <Button
                    icon="pi pi-external-link"
                    @click="quickEditObject(data)"
                    text
                    rounded
                    severity="info"
                    v-tooltip.top="'Режим правки'"
                    class="p-button-sm"
                  />
                  <Button
                    icon="pi pi-copy"
                    @click="duplicateObject(data)"
                    text
                    rounded
                    severity="secondary"
                    v-tooltip.top="'Дублировать'"
                    class="p-button-sm"
                  />
                </div>
                <!-- Destructive action (separated) -->
                <Button
                  icon="pi pi-trash"
                  @click="confirmDelete(data)"
                  text
                  rounded
                  severity="danger"
                  v-tooltip.top="'Удалить'"
                  class="p-button-sm ml-auto"
                />
              </div>
            </template>
          </Column>

          <!-- Empty State -->
          <template #empty>
            <div class="text-center py-4">
              <i class="pi pi-inbox text-4xl text-400 mb-3"></i>
              <p class="text-500">Ничего не найдено.</p>
            </div>
          </template>
        </DataTable>

        <!-- Bulk Actions Toolbar (sticky on scroll) -->
        <div v-if="selectedObjects.length > 0" class="bulk-actions-bar mt-3 p-3 surface-100 border-round">
          <div class="flex justify-content-between align-items-center flex-wrap gap-3">
            <div class="flex align-items-center gap-2">
              <Badge :value="selectedObjects.length" severity="info" />
              <span class="font-semibold">
                записей выбрано
              </span>
            </div>
            <div class="integram-actions flex gap-2 flex-wrap">
              <!-- Primary bulk actions -->
              <Button
                label="Изменить"
                icon="pi pi-pencil"
                @click="showBulkEditDialog = true"
                severity="info"
                size="small"
                :disabled="selectedObjects.length === 0"
                v-tooltip.top="'Изменить поле у всех выбранных (Ctrl+E)'"
              />
              <Button
                label="Экспорт"
                icon="pi pi-download"
                @click="exportSelected"
                size="small"
                outlined
                v-tooltip.top="'Скачать выбранные записи'"
              />
              <Button
                icon="pi pi-times"
                @click="selectedObjects = []"
                size="small"
                text
                rounded
                v-tooltip.top="'Снять выделение (Escape)'"
              />
              <!-- Destructive action (separated) -->
              <Button
                label="Удалить"
                icon="pi pi-trash"
                @click="confirmMassDelete"
                severity="danger"
                size="small"
                outlined
                v-tooltip.top="'Удалить выбранные (Shift+Del)'"
                class="ml-3"
              />
            </div>
          </div>
        </div>

        <!-- Export Actions -->
        <div class="mt-3 flex gap-2 flex-wrap">
          <Button
            label="Скачать CSV"
            icon="pi pi-file"
            @click="exportCSV"
            outlined
            v-tooltip.bottom="'Скачать данные в формате CSV'"
          />
          <Button
            label="Экспорт BKI"
            icon="pi pi-file-excel"
            @click="exportExcel"
            outlined
            v-tooltip.bottom="'Экспорт данных в формате Excel'"
          />
          <div class="ml-auto">
            <Button
              label="Удалить по фильтру"
              icon="pi pi-filter-slash"
              @click="showDeleteByFilterDialog = true"
              severity="danger"
              outlined
              :disabled="objects.length === 0"
              v-tooltip.top="'Удалить записи, удовлетворяющие заданному фильтру'"
            />
          </div>
        </div>

        <!-- Keyboard Shortcuts Help -->
        <Panel header="⌨️ Горячие клавиши" :toggleable="true" :collapsed="true" class="mt-3">
          <div class="grid">
            <div class="col-12 md:col-6">
              <div class="shortcut-item mb-2">
                <kbd>Ctrl+N</kbd> / <kbd>⌘N</kbd> - Создать новый объект
              </div>
              <div class="shortcut-item mb-2">
                <kbd>Ctrl+R</kbd> / <kbd>⌘R</kbd> - Обновить данные
              </div>
              <div class="shortcut-item mb-2">
                <kbd>Escape</kbd> - Снять выделение
              </div>
            </div>
            <div class="col-12 md:col-6">
              <div class="shortcut-item mb-2">
                <kbd>Ctrl+E</kbd> / <kbd>⌘E</kbd> - Массовое изменение (когда есть выделенные)
              </div>
              <div class="shortcut-item mb-2">
                <kbd>Shift+Delete</kbd> - Удалить выделенные
              </div>
              <div class="shortcut-item mb-2">
                <kbd>Double Click</kbd> - Редактировать ячейку
              </div>
            </div>
          </div>
        </Panel>
      </template>
    </Card>

    <!-- Add Object Dialog -->
    <Dialog
      v-model:visible="showAddDialog"
      :header="`Добавить: ${typeInfo?.val}`"
      :style="{ width: '450px' }"
      modal
    >
      <div class="field">
        <label for="newObjectValue">{{ typeInfo?.val }}</label>
        <InputText
          id="newObjectValue"
          v-model="newObject.value"
          class="w-full"
          autofocus
        />
      </div>

      <div v-if="requiredFields.length > 0" class="mt-3">
        <h5>Обязательные поля</h5>
        <div v-for="field in requiredFields" :key="field.id" class="field">
          <label :for="`req_${field.id}`">{{ field.name }}</label>
          <InputText
            :id="`req_${field.id}`"
            v-model="newObject.requisites[`t${field.id}`]"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" @click="showAddDialog = false" text />
        <Button
          label="Добавить"
          @click="createObject"
          :loading="creating"
          autofocus
        />
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      v-model:visible="showDeleteDialog"
      header="Подтвердите удаление"
      :style="{ width: '450px' }"
      modal
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-orange-500"></i>
        <span>
          Удалить запись <b>{{ objectToDelete?.val }}</b>?
        </span>
      </div>

      <template #footer>
        <Button label="Отмена" @click="showDeleteDialog = false" text />
        <Button
          label="Удалить"
          @click="deleteObject"
          severity="danger"
          :loading="deleting"
          autofocus
        />
      </template>
    </Dialog>

    <!-- Mass Delete Confirmation Dialog -->
    <Dialog
      v-model:visible="showMassDeleteDialog"
      header="Подтвердите удаление"
      :style="{ width: '450px' }"
      modal
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-orange-500"></i>
        <span>
          Удалить выбранные записи (<b>{{ selectedObjects.length }}</b> шт.)?
          Это действие нельзя отменить.
        </span>
      </div>

      <template #footer>
        <Button label="Отмена" @click="showMassDeleteDialog = false" text />
        <Button
          label="Удалить все"
          @click="massDelete"
          severity="danger"
          :loading="deleting"
          autofocus
        />
      </template>
    </Dialog>

    <!-- Delete by Filter Confirmation Dialog -->
    <Dialog
      v-model:visible="showDeleteByFilterDialog"
      header="Удаление по фильтру"
      :style="{ width: '500px' }"
      modal
    >
      <div class="flex flex-column gap-3">
        <div class="flex align-items-center gap-3">
          <i class="pi pi-exclamation-triangle text-4xl text-red-500"></i>
          <div>
            <p class="m-0 font-bold text-red-600">Внимание! Опасное действие!</p>
            <p class="m-0 mt-2">
              Будут удалены <b>все {{ objects.length }} объектов</b>, соответствующих текущему фильтру.
            </p>
          </div>
        </div>
        <Message severity="warn" :closable="false">
          Это действие нельзя отменить. Рекомендуется сначала экспортировать данные.
        </Message>
        <div class="p-3 surface-ground border-round">
          <p class="m-0 mb-2 font-semibold">Текущий фильтр:</p>
          <ul class="m-0 pl-4">
            <li v-if="filters.search">Поиск: "{{ filters.search }}"</li>
            <li v-if="filters.parentId">Родитель ID: {{ filters.parentId }}</li>
            <li v-for="(value, key) in filters.fields" :key="key">
              Поле {{ key }}: "{{ value }}"
            </li>
            <li v-if="!filters.search && !filters.parentId && Object.keys(filters.fields || {}).length === 0">
              Фильтр не задан (будут удалены ВСЕ объекты таблицы!)
            </li>
          </ul>
        </div>
        <div class="field">
          <label for="confirmDelete" class="font-semibold">
            Для подтверждения введите "УДАЛИТЬ":
          </label>
          <InputText
            id="confirmDelete"
            v-model="deleteByFilterConfirmText"
            placeholder="УДАЛИТЬ"
            class="w-full mt-2"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" @click="cancelDeleteByFilter" text />
        <Button
          label="Удалить все по фильтру"
          @click="executeDeleteByFilter"
          severity="danger"
          :loading="deletingByFilter"
          :disabled="deleteByFilterConfirmText !== 'УДАЛИТЬ'"
        />
      </template>
    </Dialog>

    <!-- Bulk Edit Dialog -->
    <Dialog
      v-model:visible="showBulkEditDialog"
      header="Изменить поле"
      :style="{ width: '500px' }"
      modal
    >
      <div class="mb-3">
        <Message severity="info" :closable="false">
          Выбрано записей: <b>{{ selectedObjects.length }}</b>.
          Выберите поле и новое значение для применения ко всем выбранным записям.
        </Message>
      </div>

      <div class="field mb-3">
        <label for="bulkEditField">Поле для изменения</label>
        <Dropdown
          id="bulkEditField"
          v-model="bulkEdit.field"
          :options="bulkEditableFields"
          optionLabel="header"
          optionValue="field"
          placeholder="Выберите поле"
          class="w-full"
        />
      </div>

      <div v-if="bulkEdit.field" class="field">
        <label for="bulkEditValue">Новое значение</label>
        <InputText
          id="bulkEditValue"
          v-model="bulkEdit.value"
          placeholder="Введите новое значение"
          class="w-full"
        />
        <small class="text-500">
          Это значение будет установлено для всех {{ selectedObjects.length }} выбранных объектов
        </small>
      </div>

      <template #footer>
        <Button label="Отмена" @click="closeBulkEditDialog" text />
        <Button
          label="Применить"
          @click="applyBulkEdit"
          severity="success"
          :loading="bulkEditing"
          :disabled="!bulkEdit.field || !bulkEdit.value"
          autofocus
        />
      </template>
    </Dialog>

    <!-- Quick Edit Modal -->
    <QuickEditModal
      v-model:visible="showQuickEditModal"
      :database="database"
      :object-id="quickEditObjectId"
      :type-id="typeId"
      @saved="handleQuickEditSaved"
      @deleted="handleQuickEditDeleted"
    />

    <!-- Row Context Menu -->
    <ContextMenu ref="contextMenuRef" :model="contextMenuItems" />

    <!-- Column Header Context Menu -->
    <ContextMenu ref="columnMenuRef" :model="columnMenuItems" />

    <!-- Rename Column Dialog -->
    <Dialog
      v-model:visible="showRenameColumnDialog"
      header="Переименовать колонку"
      :style="{ width: '400px' }"
      modal
    >
      <div class="field">
        <label for="newColumnAlias">Новое имя</label>
        <InputText
          id="newColumnAlias"
          v-model="newColumnAlias"
          class="w-full"
          autofocus
        />
      </div>
      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showRenameColumnDialog = false"
          severity="secondary"
        />
        <Button
          label="Сохранить"
          icon="pi pi-check"
          @click="saveColumnAlias"
          :loading="savingColumn"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'

import integramApiClient from '@/services/integramApiClient'
import QuickEditModal from './QuickEditModal.vue'

// PrimeVue Components

const props = defineProps({
  database: {
    type: String,
    required: true
  },
  typeId: {
    type: [String, Number],
    required: true
  }
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// State
const loading = ref(true)
const tableLoading = ref(false)
const creating = ref(false)
const deleting = ref(false)

const typeInfo = ref(null)
const parentType = ref(null)
const objects = ref([])
const requisiteColumns = ref([])
const arrayColumns = ref([])
const filterableFields = ref([])

const selectedObjects = ref([])
const sortField = ref('id')
const sortOrder = ref(-1)
const rowsPerPage = ref(25)

// Inline Editing State
const editingCell = ref(null) // { objectId, field, columnInfo }
const editingValue = ref('')
const savingCell = ref(false)

// Filters
const filtersExpanded = ref(false)
const filters = ref({
  search: '',
  parentId: route.query.F_U || '',
  fields: {},
  dateFrom: {},
  dateTo: {}
})

const allowParentFilter = computed(() => {
  return typeInfo.value && typeInfo.value.up !== '0'
})

// Dialogs
const showAddDialog = ref(false)
const showDeleteDialog = ref(false)
const showMassDeleteDialog = ref(false)
const showDeleteByFilterDialog = ref(false)
const deleteByFilterConfirmText = ref('')
const deletingByFilter = ref(false)
const showBulkEditDialog = ref(false)
const showQuickEditModal = ref(false)

const objectToDelete = ref(null)
const quickEditObjectId = ref(null)
const newObject = ref({
  value: '',
  requisites: {}
})

const requiredFields = ref([])

// Bulk Edit State
const bulkEditing = ref(false)
const bulkEdit = ref({
  field: null,
  value: ''
})

const bulkEditableFields = computed(() => {
  // Return requisite columns that can be bulk edited (exclude references and arrays)
  return requisiteColumns.value.filter(col => !col.isReference && !col.isArray)
})

// Display Mode (1=Broad, 2=Compact, 3=Fixed Height, 4=Fixed Width)
const displayMode = ref(localStorage.getItem('integram-display-mode') || '2')
const fullTextMode = ref(localStorage.getItem('integram-full-text') === '1')

const displayModeOptions = [
  { mode: '1', icon: 'pi pi-window-maximize', label: 'Просторный', tooltip: 'Просторный режим ячеек' },
  { mode: '2', icon: 'pi pi-window-minimize', label: 'Компактный', tooltip: 'Компактный режим ячеек' },
  { mode: '3', icon: 'pi pi-arrows-v', label: 'Фикс. высота', tooltip: 'Фиксированная высота ячеек' },
  { mode: '4', icon: 'pi pi-arrows-h', label: 'Фикс. ширина', tooltip: 'Ограниченная ширина ячеек' }
]

function setDisplayMode(mode) {
  displayMode.value = mode
  localStorage.setItem('integram-display-mode', mode)
}

function toggleFullText() {
  fullTextMode.value = !fullTextMode.value
  localStorage.setItem('integram-full-text', fullTextMode.value ? '1' : '')
}

const tableClass = computed(() => {
  const classes = ['p-datatable-sm']
  if (displayMode.value !== '1') {
    classes.push('table-compact')
  }
  if (displayMode.value === '3') {
    classes.push('table-fixed-height')
  }
  if (displayMode.value === '4') {
    classes.push('table-fixed-width')
  }
  if (fullTextMode.value) {
    classes.push('table-full-text')
  }
  return classes.join(' ')
})

// Context Menu
const contextMenuRef = ref(null)
const contextMenuObject = ref(null)

const contextMenuItems = computed(() => {
  if (!contextMenuObject.value) return []

  return [
    {
      label: 'Редактировать',
      icon: 'pi pi-pencil',
      command: () => editObject(contextMenuObject.value)
    },
    {
      label: 'Режим правки',
      icon: 'pi pi-external-link',
      command: () => quickEditObject(contextMenuObject.value)
    },
    {
      separator: true
    },
    {
      label: 'Дублировать',
      icon: 'pi pi-copy',
      command: () => duplicateObject(contextMenuObject.value)
    },
    {
      separator: true
    },
    {
      label: 'Удалить',
      icon: 'pi pi-trash',
      command: () => confirmDelete(contextMenuObject.value),
      class: 'text-red-500'
    }
  ]
})

// Column Context Menu
const columnMenuRef = ref(null)
const selectedColumn = ref(null)
const showRenameColumnDialog = ref(false)
const newColumnAlias = ref('')
const savingColumn = ref(false)

const columnMenuItems = computed(() => {
  if (!selectedColumn.value) return []

  const col = selectedColumn.value
  const items = []

  // Move left (decrease order)
  items.push({
    label: 'Переместить влево',
    icon: 'pi pi-arrow-left',
    command: () => moveColumnLeft(col)
  })

  // Rename column
  items.push({
    label: 'Переименовать',
    icon: 'pi pi-pencil',
    command: () => {
      newColumnAlias.value = col.header
      showRenameColumnDialog.value = true
    }
  })

  items.push({ separator: true })

  // Toggle mandatory (NOT NULL)
  items.push({
    label: col.mandatory ? 'Сделать необязательным' : 'Сделать обязательным',
    icon: col.mandatory ? 'pi pi-times-circle' : 'pi pi-check-circle',
    command: () => toggleColumnMandatory(col)
  })

  // For reference columns
  if (col.isReference) {
    items.push({ separator: true })

    // Toggle multiselect
    items.push({
      label: col.isMulti ? 'Отключить мультивыбор' : 'Включить мультивыбор',
      icon: col.isMulti ? 'pi pi-list' : 'pi pi-tags',
      command: () => toggleColumnMulti(col)
    })

    // Navigate to reference table
    if (col.refTypeId) {
      items.push({
        label: 'Перейти к справочнику',
        icon: 'pi pi-external-link',
        command: () => goToReferenceTable(col)
      })
    }
  }

  items.push({ separator: true })

  // Delete column
  items.push({
    label: 'Удалить колонку',
    icon: 'pi pi-trash',
    command: () => confirmDeleteColumn(col),
    class: 'text-red-500'
  })

  return items
})

function showColumnMenu(event, col) {
  selectedColumn.value = col
  if (columnMenuRef.value) {
    columnMenuRef.value.show(event)
  }
}

async function moveColumnLeft(col) {
  try {
    savingColumn.value = true
    await integramApiClient.moveRequisiteUp(col.requisiteId)
    toast.add({
      severity: 'success',
      summary: 'Колонка перемещена',
      life: 2000
    })
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  } finally {
    savingColumn.value = false
  }
}

async function saveColumnAlias() {
  try {
    savingColumn.value = true
    await integramApiClient.saveRequisiteAlias(selectedColumn.value.requisiteId, newColumnAlias.value)
    toast.add({
      severity: 'success',
      summary: 'Колонка переименована',
      life: 2000
    })
    showRenameColumnDialog.value = false
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  } finally {
    savingColumn.value = false
  }
}

async function toggleColumnMandatory(col) {
  try {
    savingColumn.value = true
    await integramApiClient.toggleRequisiteNull(col.requisiteId)
    toast.add({
      severity: 'success',
      summary: col.mandatory ? 'Колонка теперь необязательна' : 'Колонка теперь обязательна',
      life: 2000
    })
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  } finally {
    savingColumn.value = false
  }
}

async function toggleColumnMulti(col) {
  try {
    savingColumn.value = true
    await integramApiClient.toggleRequisiteMulti(col.requisiteId)
    toast.add({
      severity: 'success',
      summary: col.isMulti ? 'Мультивыбор отключен' : 'Мультивыбор включен',
      life: 2000
    })
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  } finally {
    savingColumn.value = false
  }
}

function goToReferenceTable(col) {
  router.push(`/integram/${props.database}/object/${col.refTypeId}`)
}

async function confirmDeleteColumn(col) {
  if (confirm(`Удалить колонку "${col.header}"? Это действие нельзя отменить.`)) {
    try {
      savingColumn.value = true
      await integramApiClient.deleteRequisite(col.requisiteId)
      toast.add({
        severity: 'success',
        summary: 'Колонка удалена',
        life: 2000
      })
      await loadData()
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка удаления',
        detail: error.message,
        life: 5000
      })
    } finally {
      savingColumn.value = false
    }
  }
}

// Methods
async function loadData() {
  try {
    loading.value = true
    integramApiClient.setDatabase(props.database)

    // Build filter params manually (integramApiClient doesn't have buildFilters helper)
    const filterParams = {}

    if (filters.value.search) {
      filterParams.search = filters.value.search
    }

    if (filters.value.parentId || route.query.F_U) {
      filterParams.F_U = filters.value.parentId || route.query.F_U
    }

    // Add field filters
    for (const [fieldId, value] of Object.entries(filters.value.fields || {})) {
      if (value) {
        filterParams[`F_${fieldId}`] = value
      }
    }

    // Add date range filters
    for (const [fieldId, value] of Object.entries(filters.value.dateFrom || {})) {
      if (value) {
        filterParams[`FR_${fieldId}`] = value
      }
    }

    for (const [fieldId, value] of Object.entries(filters.value.dateTo || {})) {
      if (value) {
        filterParams[`TO_${fieldId}`] = value
      }
    }

    // Load object list
    const response = await integramApiClient.getObjectList(props.typeId, filterParams)

    // Parse response manually (integramApiClient returns raw response)
    typeInfo.value = response.type

    // Build objects array from API response
    const objectsList = response.object || []
    const reqs = response.reqs || {}
    const reqOrder = response.req_order || []
    const reqType = response.req_type || {}

    objects.value = objectsList.map(obj => {
      const row = {
        id: obj.id,
        val: obj.val,
        up: obj.up,
        base: obj.base
      }

      // Add requisite values
      if (reqs[obj.id]) {
        for (const [reqId, reqVal] of Object.entries(reqs[obj.id])) {
          row[`req_${reqId}`] = reqVal
        }
      }

      return row
    })

    // Build requisite columns
    const columns = []
    if (reqOrder) {
      for (const reqId of reqOrder) {
        columns.push({
          field: `req_${reqId}`,
          header: reqType[reqId] || `Field ${reqId}`,
          sortable: true
        })
      }
    }
    requisiteColumns.value = columns

    // Load metadata to get array fields
    await loadMetadata()

    // Load parent type if applicable
    if (typeInfo.value.up && typeInfo.value.up !== '0') {
      try {
        const parentMeta = await integramApiClient.getTypeMetadata(typeInfo.value.up)
        parentType.value = parentMeta
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Could not load parent type:', err)
        }
      }
    }

  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: error.message,
      life: 5000
    })
  } finally {
    loading.value = false
  }
}

async function loadMetadata() {
  try {
    const metadata = await integramApiClient.getTypeMetadata(props.typeId)

    if (metadata && metadata.reqs) {
      // Find array/subordinate fields
      const arrays = metadata.reqs.filter(req => req.type === '4') // Array type
      arrayColumns.value = arrays.map(req => ({
        id: req.id,
        name: req.val,
        count: {} // Will be populated from API
      }))

      // Find filterable fields
      filterableFields.value = metadata.reqs
        .filter(req => ['3', '9', '13', '14'].includes(req.type)) // TEXT, DATE, INTEGER, DECIMAL
        .map(req => ({
          id: req.id,
          name: req.val,
          type: req.type
        }))

      // Find required fields for quick add
      requiredFields.value = metadata.reqs
        .filter(req => req.attrs && req.attrs.includes(':!NULL:'))
        .map(req => ({
          id: req.id,
          name: req.val,
          type: req.type
        }))

      // Enhance requisiteColumns with metadata
      const reqMap = new Map()
      for (const req of metadata.reqs) {
        reqMap.set(String(req.id), req)
      }

      requisiteColumns.value = requisiteColumns.value.map(col => {
        const reqId = col.field.replace('req_', '')
        const reqMeta = reqMap.get(reqId)

        if (reqMeta) {
          // Parse attributes
          const attrs = reqMeta.attrs || ''
          const isNotNull = attrs.includes(':!NULL:')
          const isMulti = attrs.includes(':MULTI:')
          const aliasMatch = attrs.match(/:ALIAS=([^:]+):/)
          const alias = aliasMatch ? aliasMatch[1] : null

          // Check if reference column (type is numeric and > 100, indicating table ID)
          const typeNum = parseInt(reqMeta.type)
          const isReference = reqMeta.reft && reqMeta.reft !== '0' && typeNum > 100

          return {
            ...col,
            requisiteId: reqId,
            header: alias || reqMeta.val || col.header,
            mandatory: isNotNull,
            isMulti: isMulti,
            isReference: isReference,
            refTypeId: isReference ? reqMeta.reft || reqMeta.type : null,
            isBoolean: reqMeta.type === '7',
            isArray: reqMeta.type === '4',
            baseType: reqMeta.type
          }
        }
        return { ...col, requisiteId: reqId }
      })
    }
  } catch (error) {
    console.error('Failed to load metadata:', error)
  }
}

function isDateField(field) {
  return field.type === '9' || field.type === '4' // DATE or DATETIME
}

async function applyFilters() {
  filtersExpanded.value = false
  await loadData()
}

function resetFilters() {
  filters.value = {
    search: '',
    parentId: route.query.F_U || '',
    fields: {},
    dateFrom: {},
    dateTo: {}
  }
  applyFilters()
}

function onSort(event) {
  sortField.value = event.sortField
  sortOrder.value = event.sortOrder
  // In real implementation, this should trigger server-side sorting
}

function onRowContextMenu(event) {
  contextMenuObject.value = event.data
  if (contextMenuRef.value) {
    contextMenuRef.value.show(event.originalEvent)
  }
}

function editObject(obj) {
  router.push(`/integram/${props.database}/edit/${obj.id}`)
}

function quickEditObject(obj) {
  quickEditObjectId.value = obj.id
  showQuickEditModal.value = true
}

async function handleQuickEditSaved() {
  showQuickEditModal.value = false
  quickEditObjectId.value = null
  await loadData()
}

async function handleQuickEditDeleted() {
  showQuickEditModal.value = false
  quickEditObjectId.value = null
  await loadData()
}

async function moveObjectUp(obj) {
  try {
    await integramApiClient.moveObjectUp(obj.id)

    toast.add({
      severity: 'success',
      summary: 'Объект перемещен',
      detail: 'Объект перемещен вверх',
      life: 2000
    })

    // Reload to show new order
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка перемещения',
      detail: error.message,
      life: 5000
    })
  }
}

async function duplicateObject(obj) {
  try {
    creating.value = true

    // Load full object data
    const fullObject = await integramApiClient.getObjectEditData(obj.id)

    // Parse object data manually
    const formData = {
      id: fullObject.obj.id,
      typeId: fullObject.obj.typ,
      value: fullObject.obj.val,
      parentId: fullObject.obj.up,
      requisites: {}
    }

    // Extract requisites
    if (fullObject.reqs) {
      for (const req of fullObject.reqs) {
        formData.requisites[req.id] = req.val || ''
      }
    }

    // Create duplicate (note: parameter order differs in integramApiClient)
    const result = await integramApiClient.createObject(
      formData.typeId,
      `${formData.value} (copy)`,
      formData.requisites,
      formData.parentId
    )

    if (result && !result.failed) {
      toast.add({
        severity: 'success',
        summary: 'Объект скопирован',
        life: 3000
      })

      await loadData()
    } else {
      throw new Error(result.failed || 'Failed to create object')
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка копирования',
      detail: error.message,
      life: 5000
    })
  } finally {
    creating.value = false
  }
}

function confirmDelete(obj) {
  objectToDelete.value = obj
  showDeleteDialog.value = true
}

async function deleteObject() {
  try {
    deleting.value = true

    const result = await integramApiClient.deleteObject(objectToDelete.value.id)

    if (result && result.failed) {
      throw new Error(result.failed)
    }

    toast.add({
      severity: 'success',
      summary: 'Объект удален',
      life: 3000
    })

    showDeleteDialog.value = false
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления',
      detail: error.message,
      life: 5000
    })
  } finally {
    deleting.value = false
  }
}

function confirmMassDelete() {
  showMassDeleteDialog.value = true
}

async function massDelete() {
  try {
    deleting.value = true

    // Delete each selected object
    for (const obj of selectedObjects.value) {
      const result = await integramApiClient.deleteObject(obj.id)
      if (result && result.failed) {
        throw new Error(result.failed)
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Объекты удалены',
      detail: `Удалено: ${selectedObjects.value.length}`,
      life: 3000
    })

    selectedObjects.value = []
    showMassDeleteDialog.value = false
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка массового удаления',
      detail: error.message,
      life: 5000
    })
  } finally {
    deleting.value = false
  }
}

function cancelDeleteByFilter() {
  showDeleteByFilterDialog.value = false
  deleteByFilterConfirmText.value = ''
}

async function executeDeleteByFilter() {
  if (deleteByFilterConfirmText.value !== 'УДАЛИТЬ') {
    toast.add({
      severity: 'warn',
      summary: 'Подтверждение не получено',
      detail: 'Введите "УДАЛИТЬ" для подтверждения',
      life: 3000
    })
    return
  }

  try {
    deletingByFilter.value = true

    const totalToDelete = objects.value.length
    let deleted = 0
    let errors = 0

    // Delete each object matching the current filter
    for (const obj of objects.value) {
      try {
        const result = await integramApiClient.deleteObject(obj.id)
        if (result && result.failed) {
          errors++
        } else {
          deleted++
        }
      } catch (e) {
        errors++
      }
    }

    toast.add({
      severity: errors > 0 ? 'warn' : 'success',
      summary: 'Удаление завершено',
      detail: `Удалено: ${deleted} из ${totalToDelete}${errors > 0 ? `. Ошибок: ${errors}` : ''}`,
      life: 5000
    })

    cancelDeleteByFilter()
    selectedObjects.value = []
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления по фильтру',
      detail: error.message,
      life: 5000
    })
  } finally {
    deletingByFilter.value = false
  }
}

function closeBulkEditDialog() {
  showBulkEditDialog.value = false
  bulkEdit.value = {
    field: null,
    value: ''
  }
}

async function applyBulkEdit() {
  if (!bulkEdit.value.field || !bulkEdit.value.value) {
    toast.add({
      severity: 'warn',
      summary: 'Недостаточно данных',
      detail: 'Выберите поле и введите значение',
      life: 3000
    })
    return
  }

  try {
    bulkEditing.value = true

    // Find the requisite ID for the selected field
    const selectedColumn = requisiteColumns.value.find(col => col.field === bulkEdit.value.field)
    if (!selectedColumn) {
      throw new Error('Не удалось найти выбранное поле')
    }

    const requisiteId = selectedColumn.field.replace('req_', '')
    let successCount = 0
    let failCount = 0

    // Update each selected object
    for (const obj of selectedObjects.value) {
      try {
        const result = await integramApiClient.setObjectRequisites(
          obj.id,
          { [requisiteId]: bulkEdit.value.value }
        )
        if (result && !result.failed) {
          successCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error(`Failed to update object ${obj.id}:`, err)
        failCount++
      }
    }

    if (successCount > 0) {
      toast.add({
        severity: 'success',
        summary: 'Массовое изменение выполнено',
        detail: `Обновлено: ${successCount} объектов${failCount > 0 ? `, ошибок: ${failCount}` : ''}`,
        life: 3000
      })
    }

    if (failCount > 0 && successCount === 0) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка массового изменения',
        detail: `Не удалось обновить ни один объект`,
        life: 5000
      })
    }

    closeBulkEditDialog()
    selectedObjects.value = []
    await loadData()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка массового изменения',
      detail: error.message,
      life: 5000
    })
  } finally {
    bulkEditing.value = false
  }
}

function exportSelected() {
  if (selectedObjects.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Нет выбранных объектов',
      detail: 'Выберите хотя бы один объект для экспорта',
      life: 3000
    })
    return
  }

  // Export only selected objects as CSV
  const headers = ['ID', typeInfo.value?.val || 'Value', ...requisiteColumns.value.map(col => col.header)]
  const csvRows = [headers.join(',')]

  for (const obj of selectedObjects.value) {
    const row = [
      obj.id,
      `"${(obj.val || '').toString().replace(/"/g, '""')}"`,
      ...requisiteColumns.value.map(col => {
        const value = obj[col.field] || ''
        return `"${value.toString().replace(/"/g, '""')}"`
      })
    ]
    csvRows.push(row.join(','))
  }

  const csvContent = '\uFEFF' + csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')

  link.setAttribute('href', url)
  link.setAttribute('download', `${typeInfo.value?.val || 'objects'}_selected_${timestamp}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  toast.add({
    severity: 'success',
    summary: 'Экспорт завершен',
    detail: `Экспортировано ${selectedObjects.value.length} объектов`,
    life: 3000
  })
}

async function createObject() {
  try {
    creating.value = true

    if (!newObject.value.value) {
      toast.add({
        severity: 'warn',
        summary: 'Заполните поле',
        detail: 'Введите значение объекта',
        life: 3000
      })
      return
    }

    // Note: integramApiClient.createObject has different parameter order:
    // createObject(typeId, value, requisites, parentId)
    const result = await integramApiClient.createObject(
      props.typeId,
      newObject.value.value,
      newObject.value.requisites,
      filters.value.parentId || null
    )

    if (result && !result.failed) {
      toast.add({
        severity: 'success',
        summary: 'Объект создан',
        life: 3000
      })

      showAddDialog.value = false
      newObject.value = { value: '', requisites: {} }
      await loadData()
    } else {
      throw new Error(result.failed || 'Failed to create object')
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка создания',
      detail: error.message,
      life: 5000
    })
  } finally {
    creating.value = false
  }
}

// Inline Editing Methods
function startInlineEdit(rowData, field, currentValue, columnInfo = null) {
  editingCell.value = {
    objectId: rowData.id,
    field,
    columnInfo
  }
  editingValue.value = currentValue || ''
}

function cancelInlineEdit() {
  editingCell.value = null
  editingValue.value = ''
  savingCell.value = false
}

async function saveInlineEdit() {
  if (!editingCell.value || savingCell.value) return

  try {
    savingCell.value = true

    const { objectId, field } = editingCell.value

    // Prepare update data
    const updateData = {}

    if (field === 'val') {
      // Updating object value
      updateData.value = editingValue.value
    } else {
      // Updating requisite field
      // Extract requisite ID from field name (format: req_123)
      const reqId = field.replace('req_', '')
      updateData.requisites = {
        [reqId]: editingValue.value
      }
    }

    // Save via API
    await integramApiClient.saveObject(objectId, updateData.value, updateData.requisites || {})

    // Update local data
    const objIndex = objects.value.findIndex(o => o.id === objectId)
    if (objIndex !== -1) {
      if (field === 'val') {
        objects.value[objIndex].val = editingValue.value
      } else {
        objects.value[objIndex][field] = editingValue.value
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Изменения применены',
      life: 2000
    })

    cancelInlineEdit()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка сохранения',
      detail: error.message,
      life: 5000
    })
    savingCell.value = false
  }
}

function exportCSV() {
  try {
    // Prepare data for export
    const exportData = objects.value.map(obj => {
      const row = {
        ID: obj.id,
        [typeInfo.value?.val || 'Значение']: obj.val
      }

      // Add requisite columns
      for (const col of requisiteColumns.value) {
        row[col.header] = obj[col.field] || ''
      }

      return row
    })

    // Convert to CSV
    const headers = Object.keys(exportData[0])
    const csvContent = [
      headers.join(','),
      ...exportData.map(row =>
        headers.map(header => {
          const value = row[header] || ''
          // Escape commas and quotes
          if (value.toString().includes(',') || value.toString().includes('"')) {
            return `"${value.toString().replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      )
    ].join('\n')

    // Download file
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${typeInfo.value?.val || 'export'}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()

    toast.add({
      severity: 'success',
      summary: 'Экспорт CSV',
      detail: `Экспортировано записей: ${exportData.length}`,
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка экспорта',
      detail: error.message,
      life: 5000
    })
  }
}

function exportExcel() {
  try {
    // Dynamically import xlsx
    import('xlsx').then(XLSX => {
      // Prepare data for export
      const exportData = objects.value.map(obj => {
        const row = {
          ID: obj.id,
          [typeInfo.value?.val || 'Значение']: obj.val
        }

        // Add requisite columns
        for (const col of requisiteColumns.value) {
          row[col.header] = obj[col.field] || ''
        }

        return row
      })

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)

      // Auto-size columns
      const colWidths = []
      const headers = Object.keys(exportData[0] || {})
      headers.forEach((header, idx) => {
        const maxLength = Math.max(
          header.length,
          ...exportData.map(row => (row[header] || '').toString().length)
        )
        colWidths[idx] = { wch: Math.min(maxLength + 2, 50) }
      })
      ws['!cols'] = colWidths

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, typeInfo.value?.val || 'Data')

      // Download file
      XLSX.writeFile(wb, `${typeInfo.value?.val || 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`)

      toast.add({
        severity: 'success',
        summary: 'Экспорт Excel',
        detail: `Экспортировано записей: ${exportData.length}`,
        life: 3000
      })
    }).catch(error => {
      throw new Error('Не удалось загрузить библиотеку экспорта: ' + error.message)
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка экспорта',
      detail: error.message,
      life: 5000
    })
  }
}

// Watch for route changes
watch(() => props.typeId, () => {
  loadData()
})

watch(() => route.query.F_U, (newVal) => {
  if (newVal) {
    filters.value.parentId = newVal
  }
  loadData()
})

// Lifecycle
// Keyboard shortcuts handler
function handleKeyboardShortcuts(event) {
  // Ignore if typing in input/textarea
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
    return
  }

  // Escape - Clear selection
  if (event.key === 'Escape' && selectedObjects.value.length > 0) {
    selectedObjects.value = []
    event.preventDefault()
  }

  // Shift+Delete - Bulk delete
  if (event.shiftKey && event.key === 'Delete' && selectedObjects.value.length > 0) {
    confirmMassDelete()
    event.preventDefault()
  }

  // Ctrl/Cmd+E - Bulk edit
  if ((event.ctrlKey || event.metaKey) && event.key === 'e' && selectedObjects.value.length > 0) {
    showBulkEditDialog.value = true
    event.preventDefault()
  }

  // Ctrl/Cmd+N - Add new object
  if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
    showAddDialog.value = true
    event.preventDefault()
  }

  // Ctrl/Cmd+R - Refresh data
  if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
    loadData()
    event.preventDefault()
  }
}

onMounted(() => {
  loadData()
  // Add keyboard shortcuts
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

onUnmounted(() => {
  // Remove keyboard shortcuts
  window.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>

<style scoped>
.integram-object-list {
  padding: 1rem;
}

.breadcrumb {
  background: var(--surface-ground);
  border-radius: var(--border-radius);
}

.breadcrumb a {
  color: var(--primary-color);
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

/* Inline Editing Styles */
.inline-edit-trigger {
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.inline-edit-trigger:hover {
  background-color: var(--surface-100);
}

.inline-edit-cell {
  padding: 0 !important;
  background-color: var(--surface-50);
  border: 1px solid var(--primary-color);
  border-radius: 4px;
}

.saving-cell {
  background-color: #fff5f5;
  opacity: 0.7;
}

.inline-edit-cell :deep(.p-inputtext) {
  border: none;
  box-shadow: none;
  padding: 0.25rem;
}

.inline-edit-cell :deep(.p-inputtext:focus) {
  outline: none;
  box-shadow: none;
}

/* Keyboard Shortcuts */
.shortcut-item kbd {
  display: inline-block;
  padding: 2px 6px;
  font: 11px 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  line-height: 16px;
  color: #444d56;
  background-color: #fafbfc;
  border: solid 1px #c6cbd1;
  border-bottom-color: #959da5;
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 #959da5;
  white-space: nowrap;
}

.shortcut-item {
  font-size: 0.9rem;
  color: var(--text-color);
}

/* Bulk Actions Bar - sticky when scrolling */
.bulk-actions-bar {
  position: sticky;
  bottom: 1rem;
  z-index: 10;
  box-shadow: 0 -4px 6px -1px rgb(0 0 0 / 0.1);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(1rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile: Stack bulk actions */
@media (max-width: 768px) {
  .bulk-actions-bar .integram-actions {
    flex-direction: column;
    width: 100%;
  }

  .bulk-actions-bar .p-button {
    width: 100%;
    justify-content: center;
  }

  .bulk-actions-bar .ml-3 {
    margin-left: 0 !important;
    margin-top: 0.5rem;
  }
}

/* Display Mode Styles */
/* Mode 1: Broad/Просторный - default, no extra classes */

/* Mode 2: Compact/Компактный */
:deep(.table-compact .p-datatable-tbody > tr > td) {
  padding: 0.35rem 0.5rem;
  font-size: 0.875rem;
}

:deep(.table-compact .p-datatable-thead > tr > th) {
  padding: 0.5rem;
  font-size: 0.875rem;
}

/* Mode 3: Fixed Height/Фиксированная высота */
:deep(.table-fixed-height .p-datatable-tbody > tr > td) {
  max-height: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.table-fixed-height .p-datatable-thead > tr > th) {
  max-height: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Mode 4: Fixed Width/Ограниченная ширина */
:deep(.table-fixed-width .p-datatable-tbody > tr > td) {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Full Text Mode - show all text */
:deep(.table-full-text .p-datatable-tbody > tr > td) {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
  max-height: none;
}

/* Without full text - truncate */
:deep(.p-datatable:not(.table-full-text) .p-datatable-tbody > tr > td) {
  max-height: 6rem;
  overflow: hidden;
}

/* Display mode button group */
.display-mode-buttons {
  display: flex;
  gap: 0.25rem;
}

/* Column Header Context Menu */
.col-header-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.col-menu-btn {
  opacity: 0;
  transition: opacity 0.2s;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0.25rem !important;
}

:deep(.p-datatable-thead > tr > th:hover) .col-menu-btn {
  opacity: 0.6;
}

.col-menu-btn:hover {
  opacity: 1 !important;
}
</style>
