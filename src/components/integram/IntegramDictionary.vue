<template>
  <div class="integram-dictionary integram-touch-friendly">
    <!-- Header with Actions (like original) -->
    <div class="dict-header">
      <div class="dict-title">Таблицы</div>
      <Button
        icon="pi pi-cog"
        @click="showFilters = !showFilters"
        size="small"
        text
        rounded
        v-tooltip="'Настройки'"
      />
      <IconField class="dict-search">
        <InputIcon>
          <i class="pi pi-search" />
        </InputIcon>
        <InputText
          v-model="searchQuery"
          placeholder="Быстрый поиск..."
          class="w-full"
          @input="onSearchInput"
        />
      </IconField>
    </div>

    <!-- Settings Panel (hidden by default) -->
    <div v-if="showFilters" class="mb-3 settings-panel">
      <div class="flex justify-content-between align-items-center mb-2">
        <span class="text-sm font-semibold">Режим отображения:</span>
        <div class="flex gap-2">
          <Button
            :icon="viewMode === 'accordion' ? 'pi pi-check' : ''"
            label="Аккордеон"
            @click="viewMode = 'accordion'"
            size="small"
            :severity="viewMode === 'accordion' ? 'primary' : 'secondary'"
            :outlined="viewMode !== 'accordion'"
          />
          <Button
            :icon="viewMode === 'list' ? 'pi pi-check' : ''"
            label="Таблица"
            @click="viewMode = 'list'"
            size="small"
            :severity="viewMode === 'list' ? 'primary' : 'secondary'"
            :outlined="viewMode !== 'list'"
          />
        </div>
      </div>
      <div class="flex align-items-center gap-2">
        <Checkbox v-model="showFavoritesOnly" :binary="true" inputId="favOnly" />
        <label for="favOnly" class="text-sm">Только избранное</label>
      </div>
    </div>

    <!-- Accordion View (like original Integram) -->
    <div v-if="viewMode === 'accordion'" class="dict-categories">
      <ul class="category-list">
        <!-- Custom Categories -->
        <li
          v-for="category in sortedCategories"
          :key="category.id || category.name"
          class="category-item"
        >
          <div
            class="category-header"
            @click="toggleCategoryExpand(category.name)"
          >
            <span class="category-name">{{ category.name }}</span>
            <div class="category-actions">
              <span class="category-count">({{ getTypesCountInCategory(category.name) }})</span>
              <Button
                v-if="category.isCustom"
                icon="pi pi-pencil"
                @click.stop="editCategory(category)"
                size="small"
                text
                rounded
                severity="secondary"
                class="category-edit-btn"
              />
            </div>
          </div>
          <div
            v-if="expandedCategories.includes(category.name)"
            class="category-types"
          >
            <a
              v-for="type in getTypesInCategory(category.name)"
              :key="type.id"
              class="type-link"
              :class="{ 'highlighted': isTypeHighlighted(type) }"
              @click="emit('view-table', type.id)"
              :title="`ID: ${type.id}`"
            >
              <span class="type-name">{{ type.name }}</span>
              <Button
                :icon="isFavorite(type.id) ? 'pi pi-star-fill' : 'pi pi-star'"
                @click.stop="toggleFavorite(type.id)"
                size="small"
                text
                rounded
                :severity="isFavorite(type.id) ? 'warning' : 'secondary'"
                class="type-fav-btn"
              />
            </a>
          </div>
        </li>
      </ul>

      <!-- New Category Button -->
      <div class="new-category-btn" @click="showNewCategoryDialog = true">
        <i class="pi pi-plus mr-2"></i>Новая категория
      </div>
    </div>

    <!-- List/Table View -->
    <div v-else-if="viewMode === 'list' && filteredTypes.length > 0">
      <DataTable
        :value="filteredTypes"
        :paginator="true"
        :rows="20"
        :rowsPerPageOptions="[10, 20, 50, 100]"
        :sortField="sortField"
        :sortOrder="sortOrder"
        @sort="onSort"
        stripedRows
        showGridlines
        size="small"
      >
        <Column style="width: 3rem">
          <template #body="{ data }">
            <Button
              :icon="isFavorite(data.id) ? 'pi pi-star-fill' : 'pi pi-star'"
              @click="toggleFavorite(data.id)"
              size="small"
              text
              rounded
              :severity="isFavorite(data.id) ? 'warning' : 'secondary'"
            />
          </template>
        </Column>
        <Column field="id" header="ID" :sortable="true" style="width: 100px">
          <template #body="{ data }">
            <code>{{ data.id }}</code>
          </template>
        </Column>
        <Column field="name" header="Название" :sortable="true"></Column>
        <Column field="category" header="Категория" :sortable="true">
          <template #body="{ data }">
            <Tag :value="data.category" :severity="getCategorySeverity(data.category)" size="small" />
          </template>
        </Column>
        <Column header="Действия" style="width: 150px">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button
                icon="pi pi-table"
                @click="emit('view-table', data.id)"
                size="small"
                text
                v-tooltip="'Таблица объектов'"
              />
              <Button
                icon="pi pi-info-circle"
                @click="emit('view-metadata', data.id)"
                size="small"
                text
                severity="info"
                v-tooltip="'Метаданные'"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredTypes.length === 0" class="text-center p-5">
      <i class="pi pi-inbox text-4xl text-color-secondary mb-3"></i>
      <p class="text-color-secondary">Типы не найдены</p>
    </div>

    <!-- Create Table Dialog -->
    <Dialog
      v-model:visible="showCreateTableDialog"
      header="Создать новую таблицу"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div>
          <label for="table-name" class="block mb-2">Название таблицы</label>
          <InputText
            id="table-name"
            v-model="newTableName"
            placeholder="Введите имя таблицы"
            class="w-full"
            maxlength="127"
          />
        </div>
        <div>
          <label for="base-type" class="block mb-2">Базовый тип</label>
          <Select
            id="base-type"
            v-model="newTableBaseType"
            :options="baseTypeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Выберите базовый тип"
            class="w-full"
          />
        </div>
        <div>
          <label for="table-category" class="block mb-2">Категория</label>
          <Select
            id="table-category"
            v-model="newTableCategory"
            :options="allCategoryNames"
            placeholder="Выберите категорию"
            class="w-full"
          />
        </div>
        <div class="flex align-items-center">
          <Checkbox
            id="unique-first-column"
            v-model="newTableUniqueFirstColumn"
            :binary="true"
          />
          <label for="unique-first-column" class="ml-2">
            Сделать первую колонку уникальной
          </label>
        </div>
      </div>
      <template #footer>
        <Button
          label="Отменить"
          severity="secondary"
          @click="showCreateTableDialog = false"
          outlined
        />
        <Button
          label="Создать"
          severity="success"
          @click="createNewTable"
          :disabled="!newTableName"
        />
      </template>
    </Dialog>

    <!-- New Category Dialog -->
    <Dialog
      v-model:visible="showNewCategoryDialog"
      header="Новая категория"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="flex flex-column gap-3">
        <div>
          <label for="category-name" class="block mb-2">Название категории</label>
          <InputText
            id="category-name"
            v-model="newCategoryName"
            placeholder="Введите название"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Отменить"
          severity="secondary"
          @click="showNewCategoryDialog = false"
          outlined
        />
        <Button
          label="Создать"
          severity="success"
          @click="createNewCategory"
          :disabled="!newCategoryName"
        />
      </template>
    </Dialog>

    <!-- Edit Category Dialog -->
    <Dialog
      v-model:visible="showEditCategoryDialog"
      header="Редактировать категорию"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="flex flex-column gap-3">
        <div>
          <label for="edit-category-name" class="block mb-2">Название категории</label>
          <InputText
            id="edit-category-name"
            v-model="editingCategoryName"
            placeholder="Введите название"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Отменить"
          severity="secondary"
          @click="showEditCategoryDialog = false"
          outlined
        />
        <Button
          label="Сохранить"
          severity="success"
          @click="saveEditedCategory"
          :disabled="!editingCategoryName"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

import Sortable from 'sortablejs'

const props = defineProps({
  dictionary: {
    type: Object,
    required: true
  },
  database: {
    type: String,
    required: true
  }
})

const emit = defineEmits([
  'view-table',
  'view-metadata',
  'edit-type',
  'create-table'
])

const toast = useToast()
const confirm = useConfirm()

// State
const viewMode = ref('accordion') // 'accordion' or 'list'
const searchQuery = ref('')
const showFavoritesOnly = ref(false)
const showFilters = ref(false)
const selectedCategories = ref([])
const expandedCategories = ref([]) // For accordion view - which categories are expanded
const favorites = ref(new Set(JSON.parse(localStorage.getItem('integram_favorites') || '[]')))
const sortField = ref('name')
const sortOrder = ref(1) // 1 for ascending, -1 for descending

// Type-to-category assignment storage (user can drag types to categories)
const typeAssignments = ref(
  JSON.parse(localStorage.getItem(`integram_type_assignments_${props.database}`) || '{}')
)

// Dialog states
const showCreateTableDialog = ref(false)
const showNewCategoryDialog = ref(false)
const showEditCategoryDialog = ref(false)

// New table form
const newTableName = ref('')
const newTableBaseType = ref(null)
const newTableCategory = ref(null)
const newTableUniqueFirstColumn = ref(false)

// Category management
const newCategoryName = ref('')
const editingCategory = ref(null)
const editingCategoryName = ref('')
const categoriesContainer = ref(null)
let sortableInstance = null

// Custom categories (user-created, can be reordered/edited/deleted)
const customCategories = ref(
  JSON.parse(localStorage.getItem(`integram_custom_categories_${props.database}`) || '[]')
)

// Default categories (system-defined, cannot be edited)
const defaultCategories = ['Пользователи', 'Отчеты', 'Формы', 'Функции', 'Файлы', 'Метки', 'Другое']

// All category names (for dropdowns)
const allCategoryNames = computed(() => {
  return [...customCategories.value.map(c => c.name), ...defaultCategories]
})

// Sorted categories for display (custom first, then system, sorted by usage)
const sortedCategories = computed(() => {
  const result = []

  // Add custom categories with isCustom flag
  for (const cat of customCategories.value) {
    result.push({
      ...cat,
      isCustom: true
    })
  }

  // Add system categories
  const systemCats = ['Основные', 'Избранное', 'Справочники', 'Служебные', 'Скрытые']
  for (const name of systemCats) {
    // Only add if there are types in this category
    const count = getTypesCountInCategory(name)
    if (count > 0 || name === 'Основные' || name === 'Избранное') {
      result.push({
        id: `system_${name}`,
        name,
        isCustom: false
      })
    }
  }

  return result
})

// Base type options for table creation
const baseTypeOptions = [
  { label: 'Простая таблица', value: null },
  { label: 'На основе существующего типа', value: 'existing' }
]

// Convert dictionary to array with categories
const typesArray = computed(() => {
  return Object.entries(props.dictionary).map(([id, name]) => ({
    id,
    name,
    category: getCategoryForType(name, id)
  }))
})

// Categories (all categories including custom ones)
const categories = computed(() => {
  const cats = new Set()
  Object.values(props.dictionary).forEach(name => {
    cats.add(getCategoryForType(name))
  })
  // Add custom categories that have types
  customCategories.value.forEach(cat => {
    if (getTypesCountInCategory(cat.name) > 0) {
      cats.add(cat.name)
    }
  })
  return Array.from(cats).sort()
})

/**
 * Transliterate between Russian and English keyboard layouts
 * Handles cases where user types in wrong layout
 */
function layoutSwitcher(text) {
  const layoutMap = {
    'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш',
    'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ', 'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а',
    'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д', ';': 'ж', "'": 'э', 'z': 'я',
    'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю',
    '/': '.', 'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u',
    'ш': 'i', 'щ': 'o', 'з': 'p', 'х': '[', 'ъ': ']', 'ф': 'a', 'ы': 's', 'в': 'd',
    'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l', 'ж': ';', 'э': "'",
    'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm', 'б': ',',
    'ю': '.'
  }

  return text.split('').map(char => layoutMap[char] || char).join('')
}

/**
 * Check if search substring matches (with layout switching support)
 */
function isSubstring(str, substr) {
  const lowerStr = str.toLowerCase()
  const lowerSubStr = substr.toLowerCase()

  // Try direct match
  let k = lowerStr.indexOf(lowerSubStr)
  if (k !== -1) return k

  // Try alternative layout
  const alternativeSubstr = layoutSwitcher(lowerSubStr)
  k = lowerStr.indexOf(alternativeSubstr)
  if (k !== -1) return k

  return -1
}

// Filtered types with layout switching support
const filteredTypes = computed(() => {
  let types = typesArray.value

  // Filter by search query with layout switching
  if (searchQuery.value) {
    types = types.filter(type =>
      isSubstring(type.name, searchQuery.value) !== -1 ||
      isSubstring(type.id, searchQuery.value) !== -1
    )
  }

  // Filter by favorites
  if (showFavoritesOnly.value) {
    types = types.filter(type => favorites.value.has(type.id))
  }

  // Filter by categories
  if (selectedCategories.value.length > 0) {
    types = types.filter(type => selectedCategories.value.includes(type.category))
  }

  return types
})

// Methods
function getCategoryForType(typeName, typeId = null) {
  // First check user assignments
  if (typeId && typeAssignments.value[typeId]) {
    return typeAssignments.value[typeId]
  }

  const name = typeName.toLowerCase()

  // Check custom categories by pattern matching
  for (const cat of customCategories.value) {
    const catName = cat.name.toLowerCase()
    if (name.includes(catName)) {
      return cat.name
    }
  }

  // System category rules
  // Скрытые - system types
  if (['доступ', 'итог', 'форма', 'формат', 'функция'].includes(name.trim())) {
    return 'Скрытые'
  }

  // Служебные - service types like Запрос
  if (name === 'запрос' || name.includes('query')) {
    return 'Служебные'
  }

  // Default to "Основные" for most types
  return 'Основные'
}

// Get types in a specific category (for accordion view)
function getTypesInCategory(categoryName) {
  let types = typesArray.value.filter(type => {
    const typeCategory = getCategoryForType(type.name, type.id)
    return typeCategory === categoryName
  })

  // For "Избранное" category, show only favorites
  if (categoryName === 'Избранное') {
    types = typesArray.value.filter(type => favorites.value.has(type.id))
  }

  // Apply search filter
  if (searchQuery.value) {
    types = types.filter(type =>
      isSubstring(type.name, searchQuery.value) !== -1 ||
      isSubstring(type.id, searchQuery.value) !== -1
    )
  }

  // Apply favorites-only filter
  if (showFavoritesOnly.value) {
    types = types.filter(type => favorites.value.has(type.id))
  }

  return types.sort((a, b) => a.name.localeCompare(b.name))
}

// Toggle category expand/collapse in accordion
function toggleCategoryExpand(categoryName) {
  const index = expandedCategories.value.indexOf(categoryName)
  if (index > -1) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryName)
  }
}

// Check if type should be highlighted (matches search)
function isTypeHighlighted(type) {
  if (!searchQuery.value) return false
  return isSubstring(type.name, searchQuery.value) !== -1
}

// Assign type to category
function assignTypeToCategory(typeId, categoryName) {
  typeAssignments.value[typeId] = categoryName
  localStorage.setItem(
    `integram_type_assignments_${props.database}`,
    JSON.stringify(typeAssignments.value)
  )
  toast.add({
    severity: 'success',
    summary: 'Перемещено',
    detail: `Тип перемещен в "${categoryName}"`,
    life: 2000
  })
}

function getTypeIcon(type) {
  const category = type.category

  const iconMap = {
    'Пользователи': 'pi pi-users',
    'Отчеты': 'pi pi-chart-bar',
    'Формы': 'pi pi-list',
    'Функции': 'pi pi-code',
    'Файлы': 'pi pi-folder',
    'Метки': 'pi pi-tags',
    'Другое': 'pi pi-box'
  }

  return iconMap[category] || 'pi pi-box'
}

function getCategorySeverity(category) {
  const severityMap = {
    'Пользователи': 'info',
    'Отчеты': 'success',
    'Формы': 'primary',
    'Функции': 'warning',
    'Файлы': 'secondary',
    'Метки': 'help',
    'Другое': 'contrast'
  }

  return severityMap[category] || 'secondary'
}

function getTypesCountInCategory(categoryName) {
  // Special handling for "Избранное" - count favorites
  if (categoryName === 'Избранное') {
    return favorites.value.size
  }
  // For other categories, count types where getCategoryForType matches
  return typesArray.value.filter(type => getCategoryForType(type.name, type.id) === categoryName).length
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid'
}

function isFavorite(typeId) {
  return favorites.value.has(typeId)
}

function toggleFavorite(typeId) {
  if (favorites.value.has(typeId)) {
    favorites.value.delete(typeId)
    toast.add({
      severity: 'info',
      summary: 'Избранное',
      detail: 'Удалено из избранного',
      life: 2000
    })
  } else {
    favorites.value.add(typeId)
    toast.add({
      severity: 'success',
      summary: 'Избранное',
      detail: 'Добавлено в избранное',
      life: 2000
    })
  }

  // Save to localStorage
  localStorage.setItem('integram_favorites', JSON.stringify(Array.from(favorites.value)))
}

function toggleCategory(category) {
  const index = selectedCategories.value.indexOf(category)
  if (index > -1) {
    selectedCategories.value.splice(index, 1)
  } else {
    selectedCategories.value.push(category)
  }
}

function onSearchInput() {
  // Search now supports RU/EN keyboard layout switching via isSubstring
  // This is automatically handled in the filteredTypes computed property
}

function onSort(event) {
  sortField.value = event.sortField
  sortOrder.value = event.sortOrder
}

// Category Management Functions
function createNewCategory() {
  if (!newCategoryName.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Введите название категории',
      life: 3000
    })
    return
  }

  // Check if category already exists
  const exists = allCategoryNames.value.some(
    name => name.toLowerCase() === newCategoryName.value.trim().toLowerCase()
  )

  if (exists) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Категория с таким именем уже существует',
      life: 3000
    })
    return
  }

  const newCategory = {
    id: Date.now().toString(),
    name: newCategoryName.value.trim(),
    order: customCategories.value.length
  }

  customCategories.value.push(newCategory)
  saveCustomCategories()

  toast.add({
    severity: 'success',
    summary: 'Успешно',
    detail: `Категория "${newCategory.name}" создана`,
    life: 3000
  })

  showNewCategoryDialog.value = false
  newCategoryName.value = ''
}

function editCategory(category) {
  editingCategory.value = category
  editingCategoryName.value = category.name
  showEditCategoryDialog.value = true
}

function saveEditedCategory() {
  if (!editingCategoryName.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Введите название категории',
      life: 3000
    })
    return
  }

  const index = customCategories.value.findIndex(c => c.id === editingCategory.value.id)
  if (index !== -1) {
    const oldName = customCategories.value[index].name
    customCategories.value[index].name = editingCategoryName.value.trim()
    saveCustomCategories()

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: `Категория "${oldName}" переименована в "${editingCategoryName.value.trim()}"`,
      life: 3000
    })
  }

  showEditCategoryDialog.value = false
  editingCategory.value = null
  editingCategoryName.value = ''
}

function deleteCategory(category) {
  confirm.require({
    message: `Удалить категорию "${category.name}"? Типы из этой категории будут перемещены в "Другое".`,
    header: 'Подтверждение',
    icon: 'pi pi-exclamation-triangle',
    accept: () => {
      const index = customCategories.value.findIndex(c => c.id === category.id)
      if (index !== -1) {
        customCategories.value.splice(index, 1)
        saveCustomCategories()

        toast.add({
          severity: 'success',
          summary: 'Успешно',
          detail: `Категория "${category.name}" удалена`,
          life: 3000
        })
      }
    }
  })
}

function saveCustomCategories() {
  localStorage.setItem(
    `integram_custom_categories_${props.database}`,
    JSON.stringify(customCategories.value)
  )
}

// Table Creation
function createNewTable() {
  if (!newTableName.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Введите название таблицы',
      life: 3000
    })
    return
  }

  emit('create-table', {
    name: newTableName.value.trim(),
    baseType: newTableBaseType.value,
    category: newTableCategory.value || 'Другое',
    uniqueFirstColumn: newTableUniqueFirstColumn.value
  })

  toast.add({
    severity: 'success',
    summary: 'Таблица создана',
    detail: `Создана таблица "${newTableName.value}"`,
    life: 3000
  })

  // Reset form
  newTableName.value = ''
  newTableBaseType.value = null
  newTableCategory.value = null
  newTableUniqueFirstColumn.value = false
  showCreateTableDialog.value = false
}

// Initialize Sortable.js for drag & drop
function initSortable() {
  if (categoriesContainer.value && !sortableInstance) {
    nextTick(() => {
      sortableInstance = new Sortable(categoriesContainer.value, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: (event) => {
          const oldIndex = event.oldIndex
          const newIndex = event.newIndex

          if (oldIndex !== newIndex) {
            const movedCategory = customCategories.value.splice(oldIndex, 1)[0]
            customCategories.value.splice(newIndex, 0, movedCategory)

            // Update order
            customCategories.value.forEach((cat, idx) => {
              cat.order = idx
            })

            saveCustomCategories()

            toast.add({
              severity: 'success',
              summary: 'Порядок изменен',
              detail: 'Категории переупорядочены',
              life: 2000
            })
          }
        }
      })
    })
  }
}

// Watch for dictionary changes
watch(() => props.dictionary, () => {
  // Dictionary updated, could trigger refresh
}, { deep: true })

// Watch for filters panel opening to initialize sortable
watch(showFilters, (newVal) => {
  if (newVal) {
    nextTick(() => {
      initSortable()
    })
  }
})

onMounted(() => {
  if (showFilters.value) {
    initSortable()
  }
})
</script>

<style scoped>
.integram-dictionary {
  width: 100%;
}

/* Header like original Integram */
.dict-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--surface-border);
  margin-bottom: 0.5rem;
}

.dict-title {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-color);
}

.dict-search {
  margin-left: auto;
  max-width: 200px;
}

.dict-search :deep(.p-inputtext) {
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
}

/* Settings panel */
.settings-panel {
  padding: 1rem;
  background: var(--surface-50);
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-border);
}

/* Category list like original */
.dict-categories {
  width: 100%;
}

.category-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-item {
  border-bottom: 1px solid var(--surface-border);
}

.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.5rem;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}

.category-header:hover {
  background-color: var(--surface-hover);
}

.category-name {
  font-size: 0.95rem;
  color: var(--text-color);
}

.category-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.category-count {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.category-edit-btn {
  opacity: 0.4;
  transition: opacity 0.15s;
}

.category-header:hover .category-edit-btn {
  opacity: 1;
}

.category-edit-btn:focus {
  opacity: 1;
}

/* Types inside category */
.category-types {
  padding: 0.25rem 0 0.5rem 1.5rem;
  background: var(--surface-ground);
}

.type-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.5rem;
  color: var(--primary-color);
  text-decoration: none;
  cursor: pointer;
  border-radius: var(--border-radius);
  transition: background-color 0.15s;
}

.type-link:hover {
  background-color: var(--surface-hover);
}

.type-link.highlighted {
  background-color: var(--yellow-100);
}

.type-name {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-fav-btn {
  opacity: 0.3;
  transition: opacity 0.15s;
}

.type-link:hover .type-fav-btn {
  opacity: 1;
}

.type-link .type-fav-btn.p-button-warning {
  opacity: 1;
}

.type-fav-btn:focus {
  opacity: 1;
}

/* New category button */
.new-category-btn {
  padding: 0.75rem 0.5rem;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.95rem;
  transition: background-color 0.15s;
}

.new-category-btn:hover {
  background-color: var(--surface-hover);
}

/* Legacy styles for list view */
.type-card {
  height: 100%;
  transition: all 0.3s ease;
}

.type-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.type-card.favorite {
  border: 2px solid var(--yellow-500);
}

.categories-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.drag-handle {
  color: var(--text-color-secondary);
  font-size: 1.2rem;
}

.drag-handle:hover {
  color: var(--primary-color);
}

.sortable-ghost {
  opacity: 0.4;
  background: var(--primary-100);
}
</style>
