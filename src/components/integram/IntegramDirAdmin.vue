<template>
  <div class="integram-dir-admin-page integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Header Info -->
    <Message severity="info" :closable="false" class="mb-2">
      <p class="m-0">
        Администрирование файлов и директорий. Управление шаблонами, резервное копирование базы данных,
        загрузка пользовательских файлов (CSS, JS, шрифты).
      </p>
    </Message>

    <!-- Directory Navigation -->
    <Panel header="Навигация по директориям" class="mb-3">
      <div class="flex flex-column gap-3">
        <div class="field">
          <label>Текущая директория</label>
          <div class="flex gap-2 align-items-center">
            <Chip :label="currentFolder" icon="pi pi-folder" />
            <Button
              v-if="currentFolder !== 'templates'"
              icon="pi pi-arrow-left"
              label="Назад"
              @click="navigateUp"
              outlined
              aria-label="Вернуться в предыдущую папку"
            />
          </div>
        </div>

        <div class="grid">
          <div class="col-12 md:col-6">
            <Button
              icon="pi pi-folder"
              label="Шаблоны"
              @click="navigateTo('templates')"
              :severity="currentFolder === 'templates' ? 'primary' : 'secondary'"
              outlined
              class="w-full"
            />
          </div>
          <div class="col-12 md:col-6">
            <Button
              icon="pi pi-download"
              label="Загрузки"
              @click="navigateTo('download')"
              :severity="currentFolder === 'download' ? 'primary' : 'secondary'"
              outlined
              class="w-full"
            />
          </div>
        </div>

        <!-- Path Info -->
        <div class="surface-card p-3 border-round">
          <div class="flex justify-content-between align-items-center">
            <span class="font-semibold">Путь для пользовательских файлов:</span>
            <code class="surface-border border-1 px-2 py-1 border-round">
              download/{session.database}/
            </code>
          </div>
          <small class="text-color-secondary mt-2 block">
            Загружайте CSS, JS, шрифты и другие файлы в директорию download для использования в шаблонах
          </small>
        </div>
      </div>
    </Panel>

    <!-- File Upload Panel -->
    <Panel header="Загрузка файлов" :toggleable="true" :collapsed="!showUpload" class="mb-3">
      <div class="flex flex-column gap-3">
        <FileUpload
          name="files[]"
          :multiple="true"
          :customUpload="true"
          @uploader="handleFileUpload"
          :auto="false"
          chooseLabel="Выбрать файлы"
          uploadLabel="Загрузить"
          cancelLabel="Отмена"
        >
          <template #empty>
            <p>Перетащите файлы сюда или нажмите "Выбрать файлы"</p>
          </template>
        </FileUpload>
      </div>
    </Panel>

    <!-- Create New Folder -->
    <Panel header="Создать папку" :toggleable="true" :collapsed="true" class="mb-3">
      <div class="flex gap-2">
        <InputText
          v-model="newFolderName"
          placeholder="Имя новой папки"
          class="flex-1"
          aria-label="Имя новой папки"
        />
        <Button
          icon="pi pi-plus"
          label="Создать"
          @click="createFolder"
          :disabled="!newFolderName"
          aria-label="Создать папку"
        />
      </div>
    </Panel>

    <!-- Backup Database -->
    <Panel header="Резервное копирование" :toggleable="true" :collapsed="true" class="mb-3">
      <div class="flex flex-column gap-3">
        <p>
          Создайте резервную копию базы данных в компактный архив.
          Архив будет сохранен в папке <code>templates/backups/</code>.
        </p>
        <div class="flex gap-2">
          <Button
            icon="pi pi-download"
            label="Создать резервную копию"
            @click="createBackup"
            :loading="loading.backup"
            severity="success"
            aria-label="Создать резервную копию базы данных"
          />
        </div>

        <!-- Available Backups for Restore -->
        <div v-if="backupFiles.length > 0" class="mt-3">
          <Divider />
          <h4 class="mt-0 mb-2">Восстановление из резервной копии</h4>
          <Message severity="warn" :closable="false" class="mb-2">
            <small>Внимание! Восстановление заменит все текущие данные базы.</small>
          </Message>
          <DataTable :value="backupFiles" stripedRows size="small">
            <Column field="name" header="Файл бэкапа" />
            <Column field="size" header="Размер">
              <template #body="{ data }">
                {{ formatFileSize(data.size) }}
              </template>
            </Column>
            <Column header="Действие" style="width: 150px">
              <template #body="{ data }">
                <Button
                  icon="pi pi-replay"
                  label="Восстановить"
                  size="small"
                  severity="warning"
                  @click="confirmRestore(data)"
                  :loading="loading.restore"
                />
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
    </Panel>

    <!-- File and Folder List -->
    <Panel header="Файлы и папки" class="mb-3">
      <div class="flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <span class="font-semibold">
          {{ fileList.length + folderList.length }} элементов
        </span>
        <div class="integram-actions">
          <Button
            icon="pi pi-check-square"
            label="Выбрать все"
            @click="selectAll"
            text
            aria-label="Выбрать все элементы"
          />
          <!-- Кнопка удаления визуально отделена -->
          <Button
            icon="pi pi-trash"
            label="Удалить выбранные"
            @click="confirmDeleteSelected"
            :disabled="selectedItems.length === 0"
            severity="danger"
            outlined
            aria-label="Удалить выбранные элементы"
          />
        </div>
      </div>

      <DataTable
        :value="combinedList"
        v-model:selection="selectedItems"
        dataKey="name"
        :loading="loading.list"
        stripedRows
        showGridlines
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem"></Column>

        <Column field="type" header="Тип" style="width: 60px">
          <template #body="{ data }">
            <i v-if="data.type === 'folder'" class="pi pi-folder text-primary text-xl"></i>
            <i v-else class="pi pi-file text-secondary text-xl"></i>
          </template>
        </Column>

        <Column field="name" header="Имя">
          <template #body="{ data }">
            <a
              v-if="data.type === 'folder'"
              @click="navigateToFolder(data.name)"
              class="cursor-pointer text-primary font-semibold"
            >
              {{ data.name }}
            </a>
            <span v-else>{{ data.name }}</span>
          </template>
        </Column>

        <Column field="size" header="Размер" style="width: 120px">
          <template #body="{ data }">
            {{ data.type === 'file' ? formatFileSize(data.size) : '—' }}
          </template>
        </Column>

        <Column field="modified" header="Изменен" style="width: 180px">
          <template #body="{ data }">
            {{ data.modified ? new Date(data.modified).toLocaleString('ru-RU') : '—' }}
          </template>
        </Column>

        <Column header="Действия" style="width: 220px">
          <template #body="{ data }">
            <div class="integram-actions">
              <Button
                v-if="data.type === 'file'"
                icon="pi pi-eye"
                v-tooltip.top="'Просмотр'"
                @click="viewFile(data)"
                text
                rounded
                aria-label="Просмотреть файл"
              />
              <Button
                v-if="data.type === 'file' && isEditable(data.name)"
                icon="pi pi-pencil"
                v-tooltip.top="'Редактировать'"
                @click="editFile(data)"
                text
                rounded
                aria-label="Редактировать файл"
              />
              <Button
                v-if="data.type === 'file'"
                icon="pi pi-download"
                v-tooltip.top="'Скачать'"
                @click="downloadFile(data)"
                text
                rounded
                aria-label="Скачать файл"
              />
              <Button
                v-if="data.type === 'file'"
                icon="pi pi-copy"
                v-tooltip.top="'Копировать путь'"
                @click="copyPath(data)"
                text
                rounded
                aria-label="Копировать путь"
              />
              <!-- Кнопка удаления визуально отделена -->
              <Button
                icon="pi pi-trash"
                v-tooltip.top="'Удалить'"
                @click="confirmDelete(data)"
                severity="danger"
                text
                rounded
                class="ml-auto"
                aria-label="Удалить"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </Panel>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      v-model:visible="deleteDialog.visible"
      header="Подтверждение удаления"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-warning"></i>
        <span v-if="deleteDialog.items.length === 1">
          Вы уверены, что хотите удалить <strong>{{ deleteDialog.items[0].name }}</strong>?
        </span>
        <span v-else>
          Вы уверены, что хотите удалить <strong>{{ deleteDialog.items.length }}</strong> элементов?
        </span>
      </div>
      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="deleteDialog.visible = false"
            text
            aria-label="Отменить удаление"
          />
          <Button
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            @click="executeDelete"
            aria-label="Подтвердить удаление"
          />
        </div>
      </template>
    </Dialog>

    <!-- Restore Confirmation Dialog -->
    <Dialog
      v-model:visible="restoreDialog.visible"
      header="Подтверждение восстановления"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="flex align-items-center gap-3">
          <i class="pi pi-exclamation-triangle text-4xl" style="color: var(--orange-500)"></i>
          <div>
            <p class="m-0 font-bold">Внимание! Это действие необратимо.</p>
            <p class="m-0 mt-2">
              Все текущие данные базы будут заменены данными из резервной копии:
            </p>
            <p class="m-0 mt-1">
              <strong>{{ restoreDialog.file?.name }}</strong>
            </p>
          </div>
        </div>
        <Message severity="warn" :closable="false">
          <small>Рекомендуется создать резервную копию текущего состояния перед восстановлением.</small>
        </Message>
      </div>
      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="restoreDialog.visible = false"
            text
            aria-label="Отменить восстановление"
          />
          <Button
            label="Восстановить"
            icon="pi pi-replay"
            severity="warning"
            @click="executeRestore"
            :loading="loading.restore"
            aria-label="Подтвердить восстановление"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import { ref, reactive, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import axios from 'axios';

const props = defineProps({
  session: {
    type: Object,
    required: true
  }
});

const toast = useToast();

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
  {
    label: 'Файлы',
    icon: 'pi pi-folder',
    to: undefined // Current page
  }
])

// API base URL
const API_BASE = import.meta.env.VITE_ORCHESTRATOR_URL || '/api';

// State
const currentFolder = ref('templates');
const currentPath = ref('');
const folderList = ref([]);
const fileList = ref([]);
const selectedItems = ref([]);
const newFolderName = ref('');
const showUpload = ref(false);

const loading = reactive({
  list: false,
  backup: false,
  upload: false,
  delete: false,
  restore: false
});

const restoreDialog = reactive({
  visible: false,
  file: null
});

const deleteDialog = reactive({
  visible: false,
  items: []
});

// Computed
const combinedList = computed(() => {
  return [
    ...folderList.value.map(f => ({ ...f, type: 'folder' })),
    ...fileList.value.map(f => ({ ...f, type: 'file' }))
  ];
});

// Filter backup files (.dmp.zip) for restore functionality
const backupFiles = computed(() => {
  return fileList.value.filter(f => f.name && f.name.endsWith('.dmp.zip'));
});

// Methods
async function loadDirectoryContents() {
  loading.list = true;

  try {
    const response = await axios.get(
      `${API_BASE}/integram-test/dir_admin/${props.session.sessionId}`,
      {
        params: {
          folder: currentFolder.value,
          path: currentPath.value
        }
      }
    );

    if (response.data.success) {
      folderList.value = response.data.data.folders || [];
      fileList.value = response.data.data.files || [];
    }
  } catch (error) {
    console.error('Error loading directory:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message,
      life: 5000
    });
  } finally {
    loading.list = false;
  }
}

function navigateTo(folder) {
  currentFolder.value = folder;
  currentPath.value = '';
  loadDirectoryContents();
}

function navigateToFolder(folderName) {
  currentPath.value = currentPath.value ? `${currentPath.value}/${folderName}` : folderName;
  loadDirectoryContents();
}

function navigateUp() {
  const parts = currentPath.value.split('/');
  parts.pop();
  currentPath.value = parts.join('/');
  loadDirectoryContents();
}

async function handleFileUpload(event) {
  loading.upload = true;

  try {
    const formData = new FormData();
    event.files.forEach(file => {
      formData.append('files[]', file);
    });
    formData.append('folder', currentFolder.value);
    formData.append('path', currentPath.value);

    const response = await axios.post(
      `${API_BASE}/integram-test/dir_admin/${props.session.sessionId}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    if (response.data.success) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Загружено файлов: ${event.files.length}`,
        life: 3000
      });

      // Reload directory
      loadDirectoryContents();
      showUpload.value = false;
    }
  } catch (error) {
    console.error('Upload error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: error.response?.data?.details || error.message,
      life: 5000
    });
  } finally {
    loading.upload = false;
  }
}

async function createFolder() {
  try {
    const response = await axios.post(
      `${API_BASE}/integram-test/dir_admin/${props.session.sessionId}/mkdir`,
      {
        folder: currentFolder.value,
        path: currentPath.value,
        name: newFolderName.value
      }
    );

    if (response.data.success) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Папка "${newFolderName.value}" создана`,
        life: 3000
      });

      newFolderName.value = '';
      loadDirectoryContents();
    }
  } catch (error) {
    console.error('Create folder error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message,
      life: 5000
    });
  }
}

async function createBackup() {
  loading.backup = true;

  try {
    const response = await axios.post(
      `${API_BASE}/integram-test/backup/${props.session.sessionId}`
    );

    if (response.data.success) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Резервная копия создана',
        life: 3000
      });

      // Download the backup file
      if (response.data.data.downloadUrl) {
        window.open(response.data.data.downloadUrl, '_blank');
      }

      // Reload directory to show new backup
      loadDirectoryContents();
    }
  } catch (error) {
    console.error('Backup error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message,
      life: 5000
    });
  } finally {
    loading.backup = false;
  }
}

function confirmRestore(file) {
  restoreDialog.file = file;
  restoreDialog.visible = true;
}

async function executeRestore() {
  if (!restoreDialog.file) return;

  restoreDialog.visible = false;
  loading.restore = true;

  try {
    // Integram API format: GET /{database}/restore/?backup_file={NAME}
    // The proxy rewrites /integram-test → dronedoc.ru
    const response = await axios.get(
      `/integram-test/${props.session.database}/restore/`,
      {
        params: {
          backup_file: restoreDialog.file.name
        },
        withCredentials: true
      }
    );

    // Check for success (Integram returns different formats)
    if (response.data && (response.data.success !== false)) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `База данных восстановлена из ${restoreDialog.file.name}`,
        life: 5000
      });

      // Reload the page to reflect restored data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      throw new Error(response.data?.error || 'Ошибка восстановления');
    }
  } catch (error) {
    console.error('Restore error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка восстановления',
      detail: error.response?.data?.error || error.message,
      life: 5000
    });
  } finally {
    loading.restore = false;
    restoreDialog.file = null;
  }
}

function selectAll() {
  selectedItems.value = combinedList.value;
}

function confirmDelete(item) {
  deleteDialog.items = [item];
  deleteDialog.visible = true;
}

function confirmDeleteSelected() {
  deleteDialog.items = selectedItems.value;
  deleteDialog.visible = true;
}

async function executeDelete() {
  deleteDialog.visible = false;
  loading.delete = true;

  try {
    const response = await axios.post(
      `${API_BASE}/integram-test/dir_admin/${props.session.sessionId}/delete`,
      {
        folder: currentFolder.value,
        path: currentPath.value,
        items: deleteDialog.items.map(item => item.name)
      }
    );

    if (response.data.success) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Удалено элементов: ${deleteDialog.items.length}`,
        life: 3000
      });

      selectedItems.value = [];
      loadDirectoryContents();
    }
  } catch (error) {
    console.error('Delete error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message,
      life: 5000
    });
  } finally {
    loading.delete = false;
  }
}

function viewFile(file) {
  const path = `/${currentFolder.value}/${currentPath.value}/${file.name}`.replace(/\/+/g, '/');
  window.open(path, '_blank');
}

function editFile(file) {
  // Open ACE editor or similar
  const editorUrl = `/ace/editor.html?src=/${currentFolder.value}/${currentPath.value}/${file.name}`;
  window.open(editorUrl, '_blank');
}

function downloadFile(file) {
  const path = `/${currentFolder.value}/${currentPath.value}/${file.name}`.replace(/\/+/g, '/');
  const link = document.createElement('a');
  link.href = path;
  link.download = file.name;
  link.click();
}

function copyPath(file) {
  const path = `download/{_global_.z}/${currentPath.value}/${file.name}`.replace(/\/+/g, '/');
  navigator.clipboard.writeText(path).then(() => {
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'Путь скопирован в буфер обмена',
      life: 2000
    });
  });
}

function isEditable(filename) {
  const editableExtensions = ['.html', '.css', '.js', '.json', '.xml', '.txt', '.md'];
  return editableExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Lifecycle
onMounted(() => {
  if (props.session.sessionId) {
    loadDirectoryContents();
  }
});
</script>

<style scoped>
.integram-dir-admin {
  width: 100%;
}
</style>
