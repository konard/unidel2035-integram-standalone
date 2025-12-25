<template>
  <div class="integram-dictionary-container integram-touch-friendly">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Dictionary Section -->
    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <span>Объекты</span>
            <Button
              v-if="canCreateTypes"
              icon="pi pi-plus"
              rounded
              outlined
              size="small"
              @click="showCreateTypeDialog = true"
              v-tooltip.bottom="'Добавить таблицу'"
              class="create-table-btn"
            />
          </div>
          <div class="flex align-items-center gap-2 ml-auto">
            <IconField iconPosition="left">
              <InputIcon class="pi pi-search" />
              <InputText
                ref="searchInputRef"
                v-model="searchQuery"
                placeholder="Быстрый поиск..."
              />
            </IconField>
            <SelectButton
              v-model="viewMode"
              :options="viewOptions"
              optionLabel="icon"
              optionValue="value"
              :allowEmpty="false"
              class="view-toggle"
            >
              <template #option="{ option }">
                <i :class="option.icon" v-tooltip.top="option.label"></i>
              </template>
            </SelectButton>
          </div>
        </div>
      </template>
      <template #content>
        <div v-if="loading" class="text-center py-5">
          <ProgressSpinner />
        </div>

        <div v-else-if="error" class="text-center py-5">
          <Message severity="error" :closable="false">{{ error }}</Message>
        </div>

        <div v-else>
          <!-- Categories with Tables -->
          <div v-for="category in filteredCategories" :key="category.name" class="mb-4">
            <div class="category-header flex align-items-center justify-content-between mb-2 cursor-pointer" @click="toggleCategory(category.name)">
              <div class="flex align-items-center gap-1">
                <h3 class="m-0 category-title">{{ category.name }}</h3>
                <Badge :value="category.tables.length" class="category-badge" />
              </div>
              <i :class="category.open ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="category-chevron"></i>
            </div>

            <!-- Grid View -->
            <div v-show="category.open && viewMode === 'grid'" class="tables-grid integram-dictionary-grid">
              <router-link
                v-for="table in category.tables"
                :key="table.id"
                :to="`/integram/${database}/object/${table.id}`"
                class="table-card-link"
              >
                <Card class="table-card cursor-pointer">
                  <template #content>
                    <div class="flex align-items-center justify-content-center text-center">
                      <span
                        class="table-name truncate-with-tooltip"
                        v-tooltip.top="table.name"
                      >{{ table.name }}</span>
                    </div>
                  </template>
                </Card>
              </router-link>
            </div>

            <!-- List View -->
            <div v-show="category.open && viewMode === 'list'" class="tables-list">
              <router-link
                v-for="table in category.tables"
                :key="table.id"
                :to="`/integram/${database}/object/${table.id}`"
                class="table-list-item"
              >
                <i class="pi pi-table table-list-icon"></i>
                <span class="table-list-name">{{ table.name }}</span>
                <i class="pi pi-chevron-right table-list-arrow"></i>
              </router-link>
            </div>
          </div>

          <!-- No results -->
          <div v-if="filteredCategories.length === 0 && !loading" class="text-center py-5">
            <i class="pi pi-inbox text-5xl text-color-secondary mb-3"></i>
            <p class="text-color-secondary">Таблицы не найдены</p>
          </div>
        </div>
      </template>
    </Card>

    <!-- Create Type Dialog -->
    <Dialog
      v-model:visible="showCreateTypeDialog"
      modal
      header="Добавить таблицу"
      :style="{ width: '50rem' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="typeName">Название таблицы</label>
          <InputText
            id="typeName"
            v-model="createTypeForm.name"
            placeholder="Введите название"
            class="w-full"
          />
        </div>

        <div class="field">
          <label for="baseType">Базовый тип (первая колонка)</label>
          <Select
            id="baseType"
            v-model="createTypeForm.baseTypeId"
            :options="baseTypes"
            optionLabel="label"
            optionValue="value"
            placeholder="Выберите базовый тип"
            class="w-full"
          />
        </div>

        <div class="field-checkbox">
          <Checkbox
            id="uniqueCheck"
            v-model="createTypeForm.unique"
            :binary="true"
          />
          <label for="uniqueCheck">Сделать первую колонку уникальной</label>
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" text @click="showCreateTypeDialog = false" />
        <Button
          label="Добавить"
          :loading="creatingType"
          @click="handleCreateType"
          :disabled="!createTypeForm.name || !createTypeForm.baseTypeId"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useIntegramSession } from '@/composables/useIntegramSession';
import integramApiClient from '@/services/integramApiClient';
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue';

// PrimeVue Components

const router = useRouter();
const route = useRoute();
const toast = useToast();
const { authenticate, logout, isAuthenticated, sessionId } = useIntegramSession();

// State
const loading = ref(false);
const error = ref(null);
const searchQuery = ref('');
const showCreateTypeDialog = ref(false);
const creatingType = ref(false);
const searchInputRef = ref(null);
const viewMode = ref('grid');

// View options
const viewOptions = [
  { value: 'grid', icon: 'pi pi-th-large', label: 'Сетка' },
  { value: 'list', icon: 'pi pi-list', label: 'Список' }
];

// Dictionary data
const dictionary = ref(null);
const settingsId = ref(null); // Settings object ID for server persistence

// Default categories configuration
const DEFAULT_CATEGORIES = [
  { name: 'Избранное', open: true, tables: [], tableIds: ['18', '42'] },
  { name: 'Основные', open: true, tables: [], tableIds: [] },
  { name: 'Служебные', open: false, tables: [], tableIds: ['22', '269'] },
  { name: 'Скрытые', open: false, tables: [], tableIds: ['47', '65', '137', '29', '63'] }
];

const categories = ref(JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)));

// Create type form
const createTypeForm = ref({
  name: '',
  baseTypeId: '',
  unique: false
});

const baseTypes = [
  { label: 'Короткий текст (до 127 символов)', value: '3' },
  { label: 'Текст неограниченной длины', value: '8' },
  { label: 'Дата', value: '9' },
  { label: 'Целое число', value: '13' },
  { label: 'Десятичное число', value: '14' },
  { label: 'Логический (Да/Нет)', value: '11' },
  { label: 'Многострочный текст', value: '12' },
  { label: 'Дата и время', value: '4' }
];

// Computed
const database = computed(() => integramApiClient.getDatabase() || '');

const canCreateTypes = computed(() => {
  // Only admins can create types (in real app, check role)
  return true; // For now, allow all authenticated users
});

const filteredCategories = computed(() => {
  if (!searchQuery.value) {
    return categories.value;
  }

  const query = searchQuery.value.toLowerCase();
  return categories.value
    .map(category => ({
      ...category,
      tables: category.tables.filter(table =>
        table.name.toLowerCase().includes(query) ||
        table.id.toString().includes(query)
      )
    }))
    .filter(category => category.tables.length > 0);
});

// Breadcrumb items
const breadcrumbItems = computed(() => [
  { label: 'Таблицы', icon: 'pi pi-table' }
]);

// Methods
async function handleLogout() {
  try {
    await logout();
    dictionary.value = null;
    categories.value.forEach(cat => { cat.tables = []; });
    toast.add({
      severity: 'info',
      summary: 'Выход',
      detail: 'Сессия завершена',
      life: 3000
    });
  } catch (err) {
    console.error('Logout error:', err);
  }
}

async function loadCategoryConfiguration() {
  try {
    // Try to load settings from server (type 269)
    // In legacy code, this is stored in localStorage.getItem('settingsID')
    const localSettingsId = localStorage.getItem('dictionarySettingsId');

    if (localSettingsId) {
      try {
        const settings = await integramApiClient.getObjectEditData(localSettingsId);
        if (settings && settings.obj) {
          settingsId.value = localSettingsId;
          // Parse configuration from settings object
          const configData = settings.reqs?.['t269']?.value;
          if (configData) {
            const categoryConfig = JSON.parse(configData);

            // Restore categories from saved configuration
            categories.value = Object.entries(categoryConfig).map(([name, config]) => ({
              name,
              open: config.open ?? true,
              tables: [],
              tableIds: config.tabs || []
            }));
            return;
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Failed to load settings from server, using defaults:', err);
        }
      }
    }

    // Fallback to default categories
    categories.value = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  } catch (err) {
    console.error('Error loading category configuration:', err);
    categories.value = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
}

async function saveCategoryConfiguration() {
  try {
    // Build configuration object
    const config = {};
    categories.value.forEach(category => {
      config[category.name] = {
        open: category.open,
        tabs: category.tableIds
      };
    });

    const configJson = JSON.stringify(config);

    if (settingsId.value) {
      // Update existing settings object
      await integramApiClient.setObjectRequisites(settingsId.value, {
        't269': configJson
      });
    } else {
      // Create new settings object (type 269)
      const result = await integramApiClient.createObject(
        '269', // Settings type
        '{_global_.user}', // Object value (username)
        {
          't269': configJson
        },
        '1' // parent ID
      );

      if (result.obj) {
        settingsId.value = result.obj;
        localStorage.setItem('dictionarySettingsId', result.obj);
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Конфигурация категорий сохранена',
      life: 2000
    });
  } catch (err) {
    console.error('Failed to save category configuration:', err);
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Не удалось сохранить конфигурацию на сервер',
      life: 3000
    });
  }
}

async function loadDictionary() {
  try {
    loading.value = true;
    error.value = null;

    // Load category configuration from server first
    await loadCategoryConfiguration();

    const dict = await integramApiClient.getDictionary();
    dictionary.value = dict;

    // Organize tables into categories
    const allTableIds = Object.keys(dict);

    categories.value.forEach(category => {
      if (category.tableIds.length > 0) {
        // Category has predefined table IDs
        category.tables = category.tableIds
          .filter(id => dict[id])
          .map(id => ({ id, name: dict[id] }));
      }
    });

    // Add remaining tables to "Основные" category
    const mainCategory = categories.value.find(cat => cat.name.includes('Основные') || cat.name.includes('Main'));
    if (mainCategory) {
      const assignedIds = new Set(
        categories.value.flatMap(cat => cat.tableIds)
      );

      mainCategory.tables = allTableIds
        .filter(id => !assignedIds.has(id))
        .map(id => ({ id, name: dict[id] }));
    }
  } catch (err) {
    error.value = err.message;
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить справочник: ' + err.message,
      life: 5000
    });
  } finally {
    loading.value = false;
  }
}

async function toggleCategory(categoryName) {
  const category = categories.value.find(cat => cat.name === categoryName);
  if (category) {
    category.open = !category.open;
    // Auto-save configuration to server
    await saveCategoryConfiguration();
  }
}

async function handleCreateType() {
  try {
    creatingType.value = true;

    const result = await integramApiClient.createType(
      createTypeForm.value.name,
      createTypeForm.value.baseTypeId,
      createTypeForm.value.unique
    );

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Таблица создана!',
      life: 3000
    });

    showCreateTypeDialog.value = false;
    createTypeForm.value = { name: '', baseTypeId: '', unique: false };

    // Reload dictionary
    await loadDictionary();

    // Navigate to new table
    if (result.obj) {
      router.push(`/integram/${database.value}/object/${result.obj}`);
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось создать таблицу: ' + err.message,
      life: 5000
    });
  } finally {
    creatingType.value = false;
  }
}

// Keyboard navigation
function handleKeyDown(event) {
  // Home key (keyCode 36) focuses search input
  if (event.key === 'Home' && searchInputRef.value) {
    event.preventDefault();
    const inputElement = searchInputRef.value.$el.querySelector('input');
    if (inputElement) {
      inputElement.focus();
    }
  }
}

// Lifecycle
onMounted(async () => {
  // Issue #5100: Redirect to login if not authenticated (removed embedded auth form)
  if (!isAuthenticated.value) {
    router.push('/integram/login?redirect=' + encodeURIComponent(route.fullPath));
    return;
  }

  await loadDictionary();

  // Add keyboard navigation listener
  window.addEventListener('keydown', handleKeyDown);
});

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
.integram-dictionary-container {
  /* No extra padding - IntegramMain .content provides 1rem */
}

.category-title {
  font-size: 1.25rem;
  color: var(--primary-color);
  font-weight: 400;
}

.category-header {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--surface-border);
}

.category-badge {
  font-size: 0.7rem;
  min-width: 1.25rem;
  height: 1.25rem;
  line-height: 1.25rem;
  margin-top: -2px;
  margin-right: 0.5rem;
}

.category-chevron {
  color: var(--text-color-secondary);
  margin-right: 0.5rem;
  font-size: 0.875rem;
  margin-top: 4px;
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  padding: 1rem 0;
}

.table-card-link {
  text-decoration: none;
  color: inherit;
}

.table-card {
  transition: all 0.3s ease;
  border: 1px solid var(--surface-border);
}

.table-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.table-card :deep(.p-card-body) {
  padding: 1rem;
}

.table-card :deep(.p-card-content) {
  padding: 0;
}

.table-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

/* Center search icon vertically */
:deep(.p-iconfield .p-inputicon) {
  top: 50% !important;
}

/* Smaller create table button */
.create-table-btn {
  width: 1.75rem !important;
  height: 1.75rem !important;
  min-width: 1.75rem !important;
  min-height: 1.75rem !important;
  padding: 0 !important;
  margin-left: 0.5rem;
}

.create-table-btn .pi {
  font-size: 0.75rem;
}

/* View Toggle Button */
.view-toggle {
  :deep(.p-button) {
    padding: 0.5rem;
    min-width: 2rem;
  }
  :deep(.p-button .pi) {
    font-size: 0.875rem;
  }
}

/* List View Styles */
.tables-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem 0;
}

.table-list-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  text-decoration: none;
  color: var(--text-color);
  background: var(--surface-card);
  border-radius: 6px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.table-list-item:hover {
  background: var(--surface-hover);
  border-color: var(--surface-border);
}

.table-list-icon {
  color: var(--primary-color);
  font-size: 1rem;
  flex-shrink: 0;
}

.table-list-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-list-arrow {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.table-list-item:hover .table-list-arrow {
  opacity: 1;
}
</style>
