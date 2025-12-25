<template>
  <div class="integram-table-list">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Metadata Loading Indicator (above Card) -->
    <div v-if="metadataLoading && loadMetadataEnabled" class="metadata-loading-notification mb-3">
      <div class="flex align-items-center justify-content-between">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-spin pi-spinner text-primary"></i>
          <span class="font-medium">Загрузка метаданных...</span>
          <Badge :value="`${loadedMetadataCount} / ${tables.length}`" severity="secondary" />
        </div>
        <Button
          icon="pi pi-times"
          size="small"
          text
          rounded
          severity="secondary"
          @click="cancelMetadataLoading"
          v-tooltip.top="'Остановить загрузку'"
        />
      </div>
    </div>

    <!-- Main Card -->
    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <span>Таблицы</span>
            <Badge v-if="tables.length" :value="tables.length" severity="secondary" />
          </div>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-plus"
              label="Создать"
              size="small"
              @click="showCreateTableDialog = true"
              v-tooltip.bottom="'Создать новую таблицу'"
            />

            <Button
              icon="pi pi-cog"
              size="small"
              outlined
              @click="showSettingsDialog = true"
              v-tooltip.bottom="'Настройки отображения'"
            />

            <Button
              icon="pi pi-refresh"
              size="small"
              outlined
              @click="loadTables"
              v-tooltip.bottom="'Обновить'"
              :loading="loading"
            />
          </div>
        </div>
      </template>

      <template #subtitle>
        <!-- Settings moved to header as toggle buttons -->
      </template>

      <template #content>
        <!-- Toolbar: Search, Filters, View Mode, Sort -->
        <div class="toolbar-section mb-3">
          <div class="flex align-items-center justify-content-between flex-wrap gap-3">
            <!-- Search -->
            <IconField iconPosition="left" class="flex-grow-1" style="max-width: 400px">
              <InputIcon class="pi pi-search" />
              <InputText
                ref="searchInput"
                v-model="searchQuery"
                placeholder="Поиск по названию, ID, колонкам..."
                class="w-full"
                @keydown="handleSearchKeydown"
              />
            </IconField>

            <!-- Filters + View Mode + Sort -->
            <div class="flex align-items-center gap-2 flex-wrap">
              <!-- Filter Chips -->
              <div class="flex align-items-center gap-2">
                <Chip
                  :class="{ 'chip-active': activeFilter === 'all' }"
                  label="Все"
                  @click="activeFilter = 'all'"
                  class="cursor-pointer"
                />
                <Chip
                  :class="{ 'chip-active': activeFilter === 'favorites' }"
                  @click="activeFilter = 'favorites'"
                  class="cursor-pointer"
                >
                  <i class="pi pi-star-fill mr-1"></i>
                  Избранные
                </Chip>
                <Chip
                  v-if="loadMetadataEnabled"
                  :class="{ 'chip-active': activeFilter === 'empty' }"
                  @click="activeFilter = 'empty'"
                  class="cursor-pointer"
                >
                  <i class="pi pi-inbox mr-1"></i>
                  Пустые
                </Chip>
                <Chip
                  v-if="loadMetadataEnabled"
                  :class="{ 'chip-active': activeFilter === 'filled' }"
                  @click="activeFilter = 'filled'"
                  class="cursor-pointer"
                >
                  <i class="pi pi-check-circle mr-1"></i>
                  С данными
                </Chip>
              </div>

              <!-- Sort Dropdown -->
              <Dropdown
                v-model="sortBy"
                :options="sortOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Сортировка"
                class="w-10rem"
              />

              <!-- View Mode Toggle -->
              <SelectButton
                v-model="viewMode"
                :options="viewOptions"
                optionLabel="icon"
                optionValue="value"
                :allowEmpty="false"
              >
                <template #option="{ option }">
                  <i :class="option.icon" v-tooltip.top="option.label"></i>
                </template>
              </SelectButton>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex justify-content-center py-5">
          <ProgressSpinner />
        </div>

        <!-- Error -->
        <div v-else-if="error" class="text-center py-5">
          <Message severity="error" :closable="false">{{ error }}</Message>
        </div>

        <!-- Content (tables + pagination) -->
        <div v-else>
          <!-- View Mode Transition Loading -->
          <div v-if="viewModeTransitioning" class="flex justify-content-center align-items-center py-5">
            <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
            <span class="ml-3 text-500">Переключение режима...</span>
          </div>

          <div v-else>
            <!-- Pagination Info -->
            <div v-if="paginationEnabled" class="flex align-items-center justify-content-between mb-3">
              <div class="text-sm text-500">
                Показано {{ paginatedTables.length }} из {{ filteredTables.length }} таблиц
              </div>
              <Paginator
                v-if="totalPages > 1"
                v-model:first="first"
                :rows="pageSize"
                :totalRecords="filteredTables.length"
                :rowsPerPageOptions="[20, 50, 100]"
                @page="onPageChange"
              />
            </div>

            <!-- Grid View (Enhanced) -->
            <div v-if="viewMode === 'grid'" class="grid">
          <div
            v-for="(table, index) in paginatedTables"
            :key="table.id"
            class="col-12 sm:col-6 md:col-4 lg:col-3"
            v-memo="[table.id, table.recordCount, table.columnCount, activeTableIndex === index, isFavorite(table.id)]"
          >
            <Card
              class="table-card h-full cursor-pointer"
              :class="{ 'table-card-active': debouncedSearchQuery && activeTableIndex === index }"
              @click="navigateToTable(table.id)"
            >
              <template #header>
                <div class="card-header-actions">
                  <Button
                    :icon="isFavorite(table.id) ? 'pi pi-star-fill' : 'pi pi-star'"
                    :class="{ 'favorite-active': isFavorite(table.id) }"
                    text
                    rounded
                    size="small"
                    @click.stop="toggleFavorite(table.id)"
                    v-tooltip.top="isFavorite(table.id) ? 'Убрать из избранного' : 'Добавить в избранное'"
                  />
                  <Button
                    icon="pi pi-ellipsis-v"
                    text
                    rounded
                    size="small"
                    @click.stop="showTableMenu($event, table)"
                  />
                </div>
              </template>

              <template #title>
                <span class="table-name">{{ getTableDisplayName(table) }}</span>
              </template>

              <template #subtitle>
                <div class="text-500 text-sm">
                  <span v-if="table.alias">{{ cleanTableName(table.name) }} · </span>ID: {{ table.id }}
                </div>
              </template>

              <template #content>
                <!-- Stats - simplified for performance -->
                <div v-if="loadMetadataEnabled" class="table-stats">
                  <div v-if="table.recordCount !== undefined" class="stat-item">
                    <i class="pi pi-database text-400"></i>
                    <span>{{ table.recordCount }} зап.</span>
                  </div>

                  <div v-if="table.columnCount !== undefined" class="stat-item">
                    <i class="pi pi-bars text-400"></i>
                    <span>{{ table.columnCount }} кол.</span>
                  </div>

                  <Badge
                    v-if="table.recordCount !== undefined"
                    :severity="table.recordCount > 0 ? 'success' : 'secondary'"
                    :value="table.recordCount > 0 ? 'Заполнена' : 'Пустая'"
                    class="mt-2"
                  />
                </div>
                <div v-else class="text-400 text-sm">
                  Включите метаданные для просмотра статистики
                </div>

                <!-- Progress bar for large tables -->
                <div v-if="table.recordCount > 1000" class="mt-2">
                  <ProgressBar
                    :value="Math.min((table.recordCount / 10000) * 100, 100)"
                    :showValue="false"
                    style="height: 4px"
                  />
                  <div class="text-xs text-500 mt-1">
                    {{ table.recordCount > 10000 ? 'Большая таблица' : 'Средняя таблица' }}
                  </div>
                </div>
              </template>

              <template #footer>
                <div class="flex gap-2">
                  <Button
                    icon="pi pi-eye"
                    label="Просмотр"
                    size="small"
                    outlined
                    @click.stop="router.push(`/integram/${database}/table/${table.id}`)"
                    class="flex-1"
                  />
                  <Button
                    icon="pi pi-pencil"
                    label="Структура"
                    size="small"
                    outlined
                    @click.stop="router.push(`/integram/${database}/edit_types?typeId=${table.id}`)"
                    class="flex-1"
                  />
                </div>
              </template>
            </Card>
          </div>
        </div>

        <!-- List View (Optimized) -->
        <DataTable
          v-else
          :value="paginatedTables"
          stripedRows
          class="p-datatable-sm"
          @row-click="handleRowClick"
        >
          <Column style="width: 3rem">
            <template #body="{ data }">
              <Button
                :icon="isFavorite(data.id) ? 'pi pi-star-fill' : 'pi pi-star'"
                :class="{ 'favorite-active': isFavorite(data.id) }"
                text
                rounded
                size="small"
                @click.stop="toggleFavorite(data.id)"
              />
            </template>
          </Column>

          <Column field="name" header="Название" sortable>
            <template #body="{ data }">
              <div class="flex align-items-center gap-2">
                <i class="pi pi-table text-primary"></i>
                <span class="font-semibold">{{ getTableDisplayName(data) }}</span>
              </div>
            </template>
          </Column>

          <Column field="id" header="ID" sortable style="width: 8rem">
            <template #body="{ data }">
              <code class="text-sm">{{ data.id }}</code>
            </template>
          </Column>

          <Column v-if="loadMetadataEnabled" field="recordCount" header="Записи" sortable style="width: 10rem">
            <template #body="{ data }">
              <span v-if="data.recordCount !== undefined">
                {{ data.recordCount }}
              </span>
              <i v-else class="pi pi-spin pi-spinner text-sm"></i>
            </template>
          </Column>

          <Column v-if="loadMetadataEnabled" field="columnCount" header="Колонки" sortable style="width: 8rem">
            <template #body="{ data }">
              <span v-if="data.columnCount !== undefined">{{ data.columnCount }}</span>
            </template>
          </Column>

          <Column v-if="loadMetadataEnabled" header="Статус" style="width: 10rem">
            <template #body="{ data }">
              <Badge
                v-if="data.recordCount !== undefined"
                :severity="data.recordCount > 0 ? 'success' : 'secondary'"
                :value="data.recordCount > 0 ? 'Заполнена' : 'Пустая'"
              />
            </template>
          </Column>

          <Column style="width: 10rem">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button
                  icon="pi pi-eye"
                  size="small"
                  text
                  rounded
                  v-tooltip.top="'Просмотр'"
                  @click.stop="router.push(`/integram/${database}/table/${data.id}`)"
                />
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  text
                  rounded
                  v-tooltip.top="'Структура'"
                  @click.stop="router.push(`/integram/${database}/edit_types?typeId=${data.id}`)"
                />
                <Button
                  icon="pi pi-ellipsis-v"
                  size="small"
                  text
                  rounded
                  @click.stop="showTableMenu($event, data)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

          <!-- Empty State -->
          <div v-if="sortedFilteredTables.length === 0" class="text-center py-5">
            <i class="pi pi-inbox text-5xl text-color-secondary mb-3"></i>
            <p class="text-color-secondary text-lg mb-2">
              {{ getEmptyStateMessage() }}
            </p>
            <div class="flex justify-content-center gap-2 mt-3">
              <Button
                v-if="searchQuery || activeFilter !== 'all'"
                label="Сбросить фильтры"
                icon="pi pi-times"
                severity="secondary"
                text
                @click="resetFilters"
              />
              <Button
                label="Обновить"
                icon="pi pi-refresh"
                severity="secondary"
                outlined
                :loading="loading"
                @click="loadTables"
              />
              <Button
                label="Создать таблицу"
                icon="pi pi-plus"
                severity="success"
                @click="showCreateTableDialog = true"
              />
            </div>
          </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Table Context Menu -->
    <Menu ref="tableMenu" :model="tableMenuItems" popup />

    <!-- Create Table Dialog -->
    <Dialog
      v-model:visible="showCreateTableDialog"
      header="Создать новую таблицу"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="p-fluid">
        <div class="field">
          <label for="table-name">Название таблицы *</label>
          <InputText
            id="table-name"
            v-model="newTableName"
            placeholder="Например: Клиенты, Заказы, Продукты..."
            @keyup.enter="createTable"
          />
        </div>

        <div class="field-checkbox">
          <Checkbox
            id="table-unique"
            v-model="newTableUnique"
            :binary="true"
          />
          <label for="table-unique">Первая колонка уникальная</label>
        </div>

        <Message v-if="createTableError" severity="error" :closable="false">
          {{ createTableError }}
        </Message>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showCreateTableDialog = false"
          text
        />
        <Button
          label="Создать"
          icon="pi pi-check"
          @click="createTable"
          :loading="creatingTable"
          :disabled="!newTableName.trim()"
        />
      </template>
    </Dialog>

    <!-- Clone Table Dialog -->
    <Dialog
      v-model:visible="showCloneDialog"
      header="Клонировать таблицу"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="p-fluid">
        <div class="field">
          <label>Исходная таблица</label>
          <InputText :value="selectedTable?.name" disabled />
        </div>

        <div class="field">
          <label for="clone-name">Название новой таблицы *</label>
          <InputText
            id="clone-name"
            v-model="cloneTableName"
            placeholder="Название..."
            @keyup.enter="cloneTable"
          />
        </div>

        <Message v-if="cloneTableError" severity="error" :closable="false">
          {{ cloneTableError }}
        </Message>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showCloneDialog = false"
          text
        />
        <Button
          label="Клонировать"
          icon="pi pi-copy"
          @click="cloneTable"
          :loading="cloningTable"
          :disabled="!cloneTableName.trim()"
        />
      </template>
    </Dialog>

    <!-- Delete Confirmation -->
    <Dialog
      v-model:visible="showDeleteDialog"
      header="Удалить таблицу?"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-5xl text-orange-500"></i>
        <div>
          <p class="mb-2">
            Вы действительно хотите удалить таблицу <strong>{{ selectedTable?.name }}</strong>?
          </p>
          <p class="text-sm text-500">
            Все данные в таблице будут безвозвратно удалены.
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showDeleteDialog = false"
          text
        />
        <Button
          label="Удалить"
          icon="pi pi-trash"
          severity="danger"
          @click="deleteTable"
          :loading="deletingTable"
        />
      </template>
    </Dialog>

    <!-- Settings Dialog -->
    <Dialog
      v-model:visible="showSettingsDialog"
      header="Настройки отображения"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="p-fluid">
        <div class="field">
          <label class="font-semibold mb-2 block">Загрузка данных</label>
          <div class="flex align-items-center p-3 border-round surface-50">
            <div class="flex align-items-center gap-2 flex-1">
              <i class="pi pi-info-circle text-primary"></i>
              <div>
                <div class="font-medium">Метаданные таблиц</div>
                <div class="text-sm text-500">
                  Загружать количество записей и колонок
                </div>
              </div>
            </div>
            <div class="flex justify-content-end" style="min-width: 6rem">
              <ToggleButton
                v-model="loadMetadataEnabled"
                onLabel="Вкл"
                offLabel="Выкл"
                onIcon="pi pi-check"
                offIcon="pi pi-times"
                class="w-6rem"
              />
            </div>
          </div>
        </div>

        <div class="field">
          <label class="font-semibold mb-2 block">Навигация</label>
          <div class="flex align-items-center p-3 border-round surface-50">
            <div class="flex align-items-center gap-2 flex-1">
              <i class="pi pi-list text-primary"></i>
              <div>
                <div class="font-medium">Пагинация</div>
                <div class="text-sm text-500">
                  Постраничная навигация по таблицам
                </div>
              </div>
            </div>
            <div class="flex justify-content-end" style="min-width: 6rem">
              <ToggleButton
                v-model="paginationEnabled"
                onLabel="Вкл"
                offLabel="Выкл"
                onIcon="pi pi-check"
                offIcon="pi pi-times"
                class="w-6rem"
              />
            </div>
          </div>
        </div>

        <div class="field">
          <label class="font-semibold mb-2 block">Поиск</label>
          <div class="flex align-items-center p-3 border-round surface-50">
            <div class="flex align-items-center gap-2 flex-1">
              <i class="pi pi-sort-amount-down text-primary"></i>
              <div>
                <div class="font-medium">Умный поиск</div>
                <div class="text-sm text-500">
                  Ранжирование по релевантности
                </div>
              </div>
            </div>
            <div class="flex justify-content-end" style="min-width: 6rem">
              <ToggleButton
                v-model="smartSearchEnabled"
                onLabel="Вкл"
                offLabel="Выкл"
                onIcon="pi pi-check"
                offIcon="pi pi-times"
                class="w-6rem"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Закрыть"
          icon="pi pi-times"
          @click="showSettingsDialog = false"
          autofocus
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useIntegramSession } from '@/composables/useIntegramSession'
import integramApiClient from '@/services/integramApiClient'
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue'
import { useDebounceFn } from '@vueuse/core'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isAuthenticated } = useIntegramSession()

// Constants
const VIEW_MODE_STORAGE_KEY = 'integram-table-list-view-mode'
const FAVORITES_STORAGE_KEY = 'integram-table-favorites'
const METADATA_CACHE_KEY = 'integram-table-metadata-cache'
const METADATA_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const METADATA_ENABLED_KEY = 'integram-table-metadata-enabled'
const PAGINATION_ENABLED_KEY = 'integram-table-pagination-enabled'
const SMART_SEARCH_KEY = 'integram-table-smart-search'

// State
const loading = ref(false)
const error = ref(null)
const tables = ref([])
const searchQuery = ref('')
const debouncedSearchQuery = ref('') // Debounced version for filtering
const viewMode = ref(localStorage.getItem(VIEW_MODE_STORAGE_KEY) || 'grid')
const viewModeTransitioning = ref(false) // Track view mode transition
const activeFilter = ref('all')
const sortBy = ref('name-asc')
const favoriteTableIds = ref([])
const activeTableIndex = ref(0)
const searchInput = ref(null)

// Settings state
const loadMetadataEnabled = ref(
  localStorage.getItem(METADATA_ENABLED_KEY) === 'true' // Default to false
)
const paginationEnabled = ref(
  localStorage.getItem(PAGINATION_ENABLED_KEY) !== 'false' // Default to true
)
const smartSearchEnabled = ref(
  localStorage.getItem(SMART_SEARCH_KEY) !== 'false' // Default to true
)

// Pagination state
const first = ref(0)
const pageSize = ref(20) // Show 20 tables per page for better performance (reduced from 50)

// Metadata loading state
const metadataLoading = ref(false)
const loadedMetadataCount = ref(0)
const metadataAbortController = ref(null)

// Table actions state
const selectedTable = ref(null)
const tableMenu = ref()
const showCreateTableDialog = ref(false)
const showCloneDialog = ref(false)
const showDeleteDialog = ref(false)
const showSettingsDialog = ref(false)

// Create table state
const newTableName = ref('')
const newTableUnique = ref(false)
const creatingTable = ref(false)
const createTableError = ref(null)

// Clone table state
const cloneTableName = ref('')
const cloningTable = ref(false)
const cloneTableError = ref(null)

// Delete table state
const deletingTable = ref(false)

// Persist viewMode to localStorage with deferred rendering
watch(viewMode, async (newMode) => {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode)

  // Show transition state
  viewModeTransitioning.value = true

  // Defer rendering to next tick to prevent blocking
  await new Promise(resolve => setTimeout(resolve, 0))

  // Allow render to complete
  viewModeTransitioning.value = false
})

// Persist loadMetadataEnabled to localStorage
watch(loadMetadataEnabled, (enabled) => {
  localStorage.setItem(METADATA_ENABLED_KEY, String(enabled))
  // Reload tables when setting changes
  if (enabled && tables.value.length > 0) {
    loadTableMetadataInBackground()
  } else if (!enabled) {
    cancelMetadataLoading()
  }
})

// Persist paginationEnabled to localStorage
watch(paginationEnabled, (enabled) => {
  localStorage.setItem(PAGINATION_ENABLED_KEY, String(enabled))
  // Reset to first page when toggling pagination
  first.value = 0
})

// Persist smartSearchEnabled to localStorage
watch(smartSearchEnabled, (enabled) => {
  localStorage.setItem(SMART_SEARCH_KEY, String(enabled))
})

// Reset sort to name-asc when metadata is disabled and current sort is metadata-dependent
watch(loadMetadataEnabled, (enabled) => {
  if (!enabled) {
    // If current sort is metadata-dependent, reset to name-asc
    const metadataDependentSorts = ['records-desc', 'records-asc', 'columns-desc', 'columns-asc']
    if (metadataDependentSorts.includes(sortBy.value)) {
      sortBy.value = 'name-asc'
    }
  }
})

// Load favorites from localStorage
onMounted(() => {
  const saved = localStorage.getItem(FAVORITES_STORAGE_KEY)
  if (saved) {
    try {
      favoriteTableIds.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse favorites:', e)
    }
  }
})

// Save favorites to localStorage
watch(favoriteTableIds, (newFavorites) => {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites))
}, { deep: true })

// Debounce search query for performance (150ms delay - faster response)
const updateDebouncedSearch = useDebounceFn((value) => {
  debouncedSearchQuery.value = value
}, 150)

// Watch search query and update debounced version
watch(searchQuery, (newValue) => {
  updateDebouncedSearch(newValue)
  // Don't reset activeTableIndex here - do it in debouncedSearchQuery watcher
})

// Reset active index only when debounced search changes (not on every keystroke)
watch(debouncedSearchQuery, () => {
  activeTableIndex.value = 0
  // Clear relevance cache when search changes to prevent memory leaks
  if (relevanceCache.size > 1000) {
    relevanceCache.clear()
  }
})

// Reset active table index when filter or sort changes
watch([activeFilter, sortBy], () => {
  activeTableIndex.value = 0
})

const viewOptions = [
  { value: 'grid', icon: 'pi pi-th-large', label: 'Сетка' },
  { value: 'list', icon: 'pi pi-list', label: 'Список' }
]

// Sort options - filter metadata-dependent options when metadata is disabled
const sortOptions = computed(() => {
  const baseOptions = [
    { value: 'name-asc', label: 'Название (А-Я)' },
    { value: 'name-desc', label: 'Название (Я-А)' }
  ]

  // Only show metadata-dependent sort options when metadata is enabled
  if (loadMetadataEnabled.value) {
    return [
      ...baseOptions,
      { value: 'records-desc', label: 'Больше записей' },
      { value: 'records-asc', label: 'Меньше записей' },
      { value: 'columns-desc', label: 'Больше колонок' },
      { value: 'columns-asc', label: 'Меньше колонок' }
    ]
  }

  return baseOptions
})

const tableMenuItems = computed(() => {
  if (!selectedTable.value) return []

  return [
    {
      label: 'Просмотр',
      icon: 'pi pi-eye',
      command: () => router.push(`/integram/${database.value}/table/${selectedTable.value.id}`)
    },
    {
      label: 'Редактировать структуру',
      icon: 'pi pi-pencil',
      command: () => router.push(`/integram/${database.value}/edit_types?typeId=${selectedTable.value.id}`)
    },
    {
      separator: true
    },
    {
      label: isFavorite(selectedTable.value.id) ? 'Убрать из избранного' : 'Добавить в избранное',
      icon: isFavorite(selectedTable.value.id) ? 'pi pi-star-fill' : 'pi pi-star',
      command: () => toggleFavorite(selectedTable.value.id)
    },
    {
      separator: true
    },
    {
      label: 'Клонировать структуру',
      icon: 'pi pi-copy',
      command: () => {
        cloneTableName.value = `${selectedTable.value.name} (копия)`
        showCloneDialog.value = true
      }
    },
    {
      label: 'Переименовать',
      icon: 'pi pi-pencil',
      command: () => renameTable(selectedTable.value)
    },
    {
      separator: true
    },
    {
      label: 'Удалить',
      icon: 'pi pi-trash',
      class: 'text-red-500',
      command: () => {
        showDeleteDialog.value = true
      }
    }
  ]
})

// Methods

// Cache for relevance calculations to avoid recomputing
const relevanceCache = new Map()

/**
 * Calculate search relevance score for a table (with caching)
 * Higher score = more relevant
 */
function calculateRelevance(tableName, query) {
  if (!query) return 0

  const cacheKey = `${tableName}:${query}`
  if (relevanceCache.has(cacheKey)) {
    return relevanceCache.get(cacheKey)
  }

  const name = tableName.toLowerCase()
  const search = query.toLowerCase()

  let score = 0

  // Exact match - highest priority
  if (name === search) {
    score = 1000
  }
  // Starts with query - very high priority
  else if (name.startsWith(search)) {
    score = 900
  }
  // Word boundary match at start (e.g., "test" matches "test_document")
  else if (name.startsWith(search + '_') || name.startsWith(search + ' ')) {
    score = 850
  }
  // Contains query at word boundary (e.g., "test" matches "my_test_doc")
  else if (new RegExp(`[_\\s]${search}`, 'i').test(name)) {
    score = 700
  }
  // Contains query anywhere
  else if (name.includes(search)) {
    score = 500
  }
  // Partial match (query characters appear in order)
  else {
    let nameIndex = 0
    let matched = true
    for (let char of search) {
      nameIndex = name.indexOf(char, nameIndex)
      if (nameIndex === -1) {
        matched = false
        break
      }
      nameIndex++
    }
    score = matched ? 300 : 0
  }

  relevanceCache.set(cacheKey, score)
  return score
}

// Computed
const database = computed(() => integramApiClient.getDatabase() || '')

const filteredTables = computed(() => {
  let result = tables.value

  // Apply filter
  if (activeFilter.value === 'favorites') {
    result = result.filter(t => isFavorite(t.id))
  } else if (activeFilter.value === 'empty') {
    result = result.filter(t => t.recordCount === 0)
  } else if (activeFilter.value === 'filled') {
    result = result.filter(t => t.recordCount > 0)
  }

  // Apply search (USING DEBOUNCED QUERY for performance)
  if (debouncedSearchQuery.value) {
    const query = debouncedSearchQuery.value.toLowerCase()

    if (smartSearchEnabled.value) {
      // Smart search: filter and sort by relevance
      result = result
        .map(table => ({
          ...table,
          _relevance: calculateRelevance(table.name, debouncedSearchQuery.value)
        }))
        .filter(table => table._relevance > 0)
        .sort((a, b) => b._relevance - a._relevance)
    } else {
      // Simple search: just filter by contains
      result = result.filter(table =>
        table.name.toLowerCase().includes(query) ||
        String(table.id).includes(query)
      )
    }
  }

  return result
})

const sortedFilteredTables = computed(() => {
  const result = [...filteredTables.value]

  // Skip additional sorting if smart search is active and there's a search query
  // (already sorted by relevance in filteredTables)
  if (smartSearchEnabled.value && searchQuery.value) {
    return result
  }

  const [field, direction] = sortBy.value.split('-')

  result.sort((a, b) => {
    let aVal, bVal

    if (field === 'name') {
      aVal = a.name.toLowerCase()
      bVal = b.name.toLowerCase()
      return direction === 'asc'
        ? aVal.localeCompare(bVal, 'ru')
        : bVal.localeCompare(aVal, 'ru')
    } else if (field === 'records') {
      aVal = a.recordCount ?? 0
      bVal = b.recordCount ?? 0
    } else if (field === 'columns') {
      aVal = a.columnCount ?? 0
      bVal = b.columnCount ?? 0
    }

    if (field !== 'name') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    }

    return 0
  })

  return result
})

// Paginated tables - only show current page for performance (or all if pagination disabled)
const paginatedTables = computed(() => {
  if (!paginationEnabled.value) {
    // Infinite scroll mode - show all tables
    return sortedFilteredTables.value
  }

  // Pagination mode - show only current page
  const start = first.value
  const end = start + pageSize.value
  return sortedFilteredTables.value.slice(start, end)
})

// Total pages for pagination
const totalPages = computed(() => {
  return Math.ceil(filteredTables.value.length / pageSize.value)
})

const breadcrumbItems = computed(() => [
  { label: 'Таблицы', icon: 'pi pi-table' }
])

// Methods

/**
 * Clean table name - remove &nbsp; and trim whitespace
 */
function cleanTableName(name) {
  if (!name) return ''
  // Replace all &nbsp; (non-breaking spaces) and trim
  return name.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Get display name for table - use alias if available, otherwise name
 */
function getTableDisplayName(table) {
  if (!table) return ''
  const displayName = table.alias || table.name
  return cleanTableName(displayName)
}

/**
 * Load metadata from cache
 */
function loadMetadataFromCache() {
  try {
    const cached = localStorage.getItem(METADATA_CACHE_KEY)
    if (!cached) return null

    const { timestamp, data } = JSON.parse(cached)

    // Check if cache is expired
    if (Date.now() - timestamp > METADATA_CACHE_TTL) {
      localStorage.removeItem(METADATA_CACHE_KEY)
      return null
    }

    return data
  } catch (e) {
    console.error('Failed to load metadata cache:', e)
    return null
  }
}

/**
 * Save metadata to cache
 */
function saveMetadataToCache() {
  try {
    const metadata = {}
    tables.value.forEach(table => {
      if (table.recordCount !== undefined || table.columnCount !== undefined || table.alias !== undefined) {
        metadata[table.id] = {
          recordCount: table.recordCount,
          columnCount: table.columnCount,
          alias: table.alias
        }
      }
    })

    const cacheData = {
      timestamp: Date.now(),
      data: metadata
    }

    localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(cacheData))
  } catch (e) {
    console.error('Failed to save metadata cache:', e)
  }
}

/**
 * Apply cached metadata to tables
 */
function applyCachedMetadata(cachedData) {
  if (!cachedData) return false

  let appliedCount = 0
  tables.value.forEach(table => {
    if (cachedData[table.id]) {
      table.recordCount = cachedData[table.id].recordCount
      table.columnCount = cachedData[table.id].columnCount
      table.alias = cachedData[table.id].alias
      appliedCount++
    }
  })

  console.log(`Applied cached metadata for ${appliedCount} tables`)
  return appliedCount > 0
}

function isFavorite(tableId) {
  return favoriteTableIds.value.includes(String(tableId))
}

function onPageChange(event) {
  first.value = event.first
  pageSize.value = event.rows
  // Scroll to top on page change
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleFavorite(tableId) {
  const id = String(tableId)
  const index = favoriteTableIds.value.indexOf(id)

  if (index > -1) {
    favoriteTableIds.value.splice(index, 1)
    toast.add({
      severity: 'info',
      summary: 'Убрано из избранного',
      life: 2000
    })
  } else {
    favoriteTableIds.value.push(id)
    toast.add({
      severity: 'success',
      summary: 'Добавлено в избранное',
      life: 2000
    })
  }
}

function getEmptyStateMessage() {
  if (activeFilter.value === 'favorites') {
    return 'Нет избранных таблиц'
  } else if (activeFilter.value === 'empty') {
    return 'Нет пустых таблиц'
  } else if (activeFilter.value === 'filled') {
    return 'Нет таблиц с данными'
  } else if (searchQuery.value) {
    return `Таблицы не найдены по запросу "${searchQuery.value}"`
  }
  return 'Нет таблиц'
}

function resetFilters() {
  searchQuery.value = ''
  activeFilter.value = 'all'
}

function showTableMenu(event, table) {
  selectedTable.value = table
  tableMenu.value.toggle(event)
}

function handleRowClick(event) {
  router.push(`/integram/${database.value}/table/${event.data.id}`)
}

/**
 * Navigate to table by ID
 */
function navigateToTable(tableId) {
  router.push(`/integram/${database.value}/table/${tableId}`)
}

/**
 * Handle keyboard navigation in search input
 */
function handleSearchKeydown(event) {
  const maxIndex = paginatedTables.value.length - 1

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeTableIndex.value = Math.min(activeTableIndex.value + 1, maxIndex)
    scrollToActiveTable()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeTableIndex.value = Math.max(activeTableIndex.value - 1, 0)
    scrollToActiveTable()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const activeTable = paginatedTables.value[activeTableIndex.value]
    if (activeTable) {
      navigateToTable(activeTable.id)
    }
  }
}

/**
 * Scroll to active table card
 */
function scrollToActiveTable() {
  // Wait for next tick to ensure DOM is updated
  setTimeout(() => {
    const activeCard = document.querySelector('.table-card-active')
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, 0)
}

async function loadTables() {
  loading.value = true
  error.value = null

  try {
    // Fast: Only load table names (single API call)
    const dict = await integramApiClient.getDictionary()

    // Convert dictionary object to array
    const tableArray = Object.entries(dict).map(([id, name]) => ({
      id,
      name,
      alias: undefined,       // Will be loaded from metadata or cache
      recordCount: undefined, // Will be loaded in background or from cache
      columnCount: undefined  // Will be loaded in background or from cache
    })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    tables.value = tableArray

    // IMPORTANT: Set loading to false IMMEDIATELY after dictionary loads
    loading.value = false

    // Try to load metadata from cache first
    const cachedMetadata = loadMetadataFromCache()
    const hasCachedData = applyCachedMetadata(cachedMetadata)

    if (hasCachedData) {
      console.log('Using cached metadata, updating in background...')
    }

    // Start background metadata loading (non-blocking)
    // This runs asynchronously without blocking the UI
    // Even if we have cache, we still update in background to keep data fresh
    loadTableMetadataInBackground()
  } catch (err) {
    console.error('Error loading tables:', err)
    error.value = err.message || 'Не удалось загрузить список таблиц'
    loading.value = false
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.value,
      life: 5000
    })
  }
}

/**
 * Load table metadata in background WITHOUT blocking UI
 * Uses small batches with delays to prevent API overload and freezing
 */
async function loadTableMetadataInBackground() {
  // Skip if metadata loading is disabled
  if (!loadMetadataEnabled.value) {
    console.log('Metadata loading disabled in settings')
    return
  }

  // Cancel previous loading if any
  if (metadataAbortController.value) {
    metadataAbortController.value.abort()
  }

  metadataAbortController.value = new AbortController()
  const signal = metadataAbortController.value.signal

  metadataLoading.value = true
  loadedMetadataCount.value = 0

  const batchSize = 10 // Increased batch size for faster loading
  const delayBetweenBatches = 200 // Reduced delay for faster loading

  try {
    for (let i = 0; i < tables.value.length; i += batchSize) {
      // Check if loading was cancelled
      if (signal.aborted) {
        console.log('Metadata loading cancelled')
        return
      }

      const batch = tables.value.slice(i, i + batchSize)

      // Load batch in parallel (but only 5 tables at once)
      await Promise.allSettled(
        batch.map(async (table) => {
          if (signal.aborted) return

          try {
            // OPTIMIZATION: Only load metadata, not full type data
            // This is faster than getTypeMetadata
            const metadata = await integramApiClient.getTypeMetadata(table.id)

            if (!signal.aborted) {
              table.columnCount = metadata.requisites?.length || 0
              table.alias = metadata.alias || undefined // Save alias if present
            }

            // Get object count - use fast endpoint
            if (!signal.aborted) {
              try {
                const countData = await integramApiClient.getObjectCount(table.id)
                table.recordCount = countData.count || 0
              } catch (e) {
                // Fallback: assume 0 records if API fails
                table.recordCount = 0
              }
            }

            loadedMetadataCount.value++
          } catch (e) {
            // Silently fail for individual tables
            console.warn(`Failed to load metadata for table ${table.id}:`, e.message)
            table.recordCount = 0
            table.columnCount = 0
            loadedMetadataCount.value++
          }
        })
      )

      // Pause between batches to prevent API overload and UI freezing
      if (i + batchSize < tables.value.length && !signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
      }
    }

    // Save metadata to cache after loading completes
    if (!signal.aborted) {
      saveMetadataToCache()
      console.log('Metadata cache updated')
    }
  } finally {
    metadataLoading.value = false
    metadataAbortController.value = null
  }
}

/**
 * Cancel background metadata loading
 */
function cancelMetadataLoading() {
  if (metadataAbortController.value) {
    metadataAbortController.value.abort()
    metadataAbortController.value = null
    metadataLoading.value = false
  }
}

async function createTable() {
  if (!newTableName.value.trim()) return

  creatingTable.value = true
  createTableError.value = null

  try {
    const result = await integramApiClient.createType({
      name: newTableName.value.trim(),
      baseTypeId: 1, // Independent type
      unique: newTableUnique.value
    })

    toast.add({
      severity: 'success',
      summary: 'Таблица создана',
      detail: `Таблица "${newTableName.value}" успешно создана`,
      life: 3000
    })

    // Reload tables
    await loadTables()

    // Close dialog and reset
    showCreateTableDialog.value = false
    newTableName.value = ''
    newTableUnique.value = false

    // Navigate to structure editor
    router.push(`/integram/${database.value}/edit_types?typeId=${result.id}`)
  } catch (err) {
    console.error('Error creating table:', err)
    createTableError.value = err.message || 'Не удалось создать таблицу'
  } finally {
    creatingTable.value = false
  }
}

async function cloneTable() {
  if (!cloneTableName.value.trim() || !selectedTable.value) return

  cloningTable.value = true
  cloneTableError.value = null

  try {
    const result = await integramApiClient.cloneTableStructure(
      selectedTable.value.id,
      cloneTableName.value.trim()
    )

    toast.add({
      severity: 'success',
      summary: 'Таблица клонирована',
      detail: `Структура скопирована в таблицу "${cloneTableName.value}"`,
      life: 3000
    })

    // Reload tables
    await loadTables()

    // Close dialog and reset
    showCloneDialog.value = false
    cloneTableName.value = ''
    selectedTable.value = null

    // Navigate to new table
    router.push(`/integram/${database.value}/table/${result.id}`)
  } catch (err) {
    console.error('Error cloning table:', err)
    cloneTableError.value = err.message || 'Не удалось клонировать таблицу'
  } finally {
    cloningTable.value = false
  }
}

async function deleteTable() {
  if (!selectedTable.value) return

  deletingTable.value = true

  try {
    await integramApiClient.deleteTableCascade(selectedTable.value.id)

    toast.add({
      severity: 'success',
      summary: 'Таблица удалена',
      detail: `Таблица "${selectedTable.value.name}" удалена`,
      life: 3000
    })

    // Remove from favorites if present
    const id = String(selectedTable.value.id)
    const index = favoriteTableIds.value.indexOf(id)
    if (index > -1) {
      favoriteTableIds.value.splice(index, 1)
    }

    // Reload tables
    await loadTables()

    // Close dialog and reset
    showDeleteDialog.value = false
    selectedTable.value = null
  } catch (err) {
    console.error('Error deleting table:', err)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: err.message || 'Не удалось удалить таблицу',
      life: 5000
    })
  } finally {
    deletingTable.value = false
  }
}

async function renameTable(table) {
  // Use PrimeVue's $prompt-like approach with InputText in dialog
  const newName = prompt(`Введите новое название для таблицы "${table.name}":`, table.name)

  if (!newName || newName === table.name) return

  try {
    await integramApiClient.renameTable(table.id, newName)

    toast.add({
      severity: 'success',
      summary: 'Таблица переименована',
      detail: `"${table.name}" → "${newName}"`,
      life: 3000
    })

    // Reload tables
    await loadTables()
  } catch (err) {
    console.error('Error renaming table:', err)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: err.message || 'Не удалось переименовать таблицу',
      life: 5000
    })
  }
}

// Lifecycle
onMounted(async () => {
  if (!isAuthenticated.value) {
    router.push('/integram/login?redirect=' + encodeURIComponent(route.fullPath))
    return
  }
  await loadTables()
})

// Cleanup: Cancel background loading when component unmounts
onBeforeUnmount(() => {
  cancelMetadataLoading()
})
</script>

<style scoped>
.integram-table-list {
  /* No extra padding - IntegramMain .content provides 1rem */
}

.toolbar-section {
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

/* Enhanced Table Cards */
.table-card {
  transition: all 0.3s ease;
  border: 1px solid var(--surface-border);
  position: relative;
  overflow: hidden;
}

.table-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.table-card-active {
  border: 2px solid var(--primary-color) !important;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2),
              0 4px 12px rgba(0, 0, 0, 0.15) !important;
  transform: translateY(-2px);
  background: var(--surface-50);
}

.card-header-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.25rem;
  z-index: 10;
}

.favorite-active {
  color: var(--yellow-500) !important;
}

.table-card :deep(.p-card-body) {
  padding: 1rem;
}

.table-card :deep(.p-card-content) {
  padding: 0;
}

.table-card :deep(.p-card-title) {
  margin-bottom: 0.5rem;
}

.table-card :deep(.p-card-subtitle) {
  margin-bottom: 0.75rem;
}

.table-name {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  max-height: 2.8em;
  color: var(--text-color);
  font-weight: 600;
}

.table-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.stat-item i:not(.pi-spin) {
  font-size: 0.875rem;
}

/* Filter Chips */
.chip-active {
  background: var(--primary-color) !important;
  color: white !important;
}

:deep(.chip-active .p-chip-text) {
  color: white !important;
}

/* Metadata Loading Notification - Simple non-sticky bar */
.metadata-loading-notification {
  background: var(--surface-50);
  border: 1px solid var(--primary-200);
  border-left: 4px solid var(--primary-color);
  border-radius: 6px;
  padding: 0.75rem 1rem;
}

/* List View Enhancements */
:deep(.p-datatable .p-datatable-tbody > tr) {
  cursor: pointer;
  transition: background-color 0.2s;
}

:deep(.p-datatable .p-datatable-tbody > tr:hover) {
  background: var(--surface-hover) !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .toolbar-section {
    padding: 0.75rem;
  }

  .table-header-toolbar {
    flex-direction: column;
    width: 100%;
  }

  .search-with-navigation {
    width: 100%;
  }
}
</style>
