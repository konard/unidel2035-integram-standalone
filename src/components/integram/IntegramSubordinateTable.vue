<template>
  <div class="integram-subordinate-table">
    <div v-if="loading" class="text-center py-4">
      <ProgressSpinner />
    </div>

    <div v-else-if="error" class="mb-3">
      <Message severity="error" :closable="false">{{ error }}</Message>
    </div>

    <div v-else>
      <!-- Toolbar -->
      <div class="flex justify-content-between align-items-center mb-3">
        <h4 class="m-0">{{ typeData?.val || 'Подчинённые объекты' }}</h4>
        <Button
          icon="pi pi-plus"
          label="Добавить"
          size="small"
          @click="showAddDialog = true"
        />
      </div>

      <!-- Objects Table -->
      <DataTable
        v-if="objects.length > 0"
        :value="objects"
        :paginator="objects.length > 10"
        :rows="10"
        sortMode="multiple"
        removableSort
        stripedRows
        class="p-datatable-sm"
      >
        <Column field="id" header="ID" sortable style="width: 80px" />

        <Column field="val" header="Значение" sortable />

        <Column header="Действия" style="width: 100px">
          <template #body="slotProps">
            <div class="flex gap-2">
              <Button
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                @click="editObject(slotProps.data)"
                v-tooltip.bottom="'Редактировать'"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                @click="confirmDelete(slotProps.data)"
                v-tooltip.bottom="'Удалить'"
              />
            </div>
          </template>
        </Column>
      </DataTable>

      <!-- Empty state -->
      <div v-else class="text-center py-5">
        <i class="pi pi-inbox text-4xl text-color-secondary mb-2"></i>
        <p class="text-color-secondary">Нет подчинённых объектов</p>
        <Button
          label="Добавить первый объект"
          icon="pi pi-plus"
          outlined
          @click="showAddDialog = true"
        />
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <Dialog
      v-model:visible="showAddDialog"
      :header="editingObject ? 'Редактировать объект' : 'Добавить объект'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="field">
        <label for="objectValue">Значение *</label>
        <InputText
          id="objectValue"
          v-model="dialogForm.value"
          placeholder="Введите значение"
          class="w-full"
          autofocus
        />
      </div>

      <!-- TODO: Add requisite fields here if needed -->

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          text
          @click="closeAddDialog"
        />
        <Button
          label="Сохранить"
          icon="pi pi-check"
          :loading="saving"
          @click="saveObject"
        />
      </template>
    </Dialog>

    <!-- Delete Confirmation -->
    <Dialog
      v-model:visible="showDeleteDialog"
      header="Подтверждение удаления"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <p>Вы уверены, что хотите удалить "{{ objectToDelete?.val }}"?</p>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          text
          @click="showDeleteDialog = false"
        />
        <Button
          label="Удалить"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleting"
          @click="deleteObject"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import integramService from '@/services/integramService';

// PrimeVue Components

const props = defineProps({
  parentObjectId: {
    type: [String, Number],
    required: true
  },
  typeId: {
    type: [String, Number],
    required: true
  }
});

const emit = defineEmits(['change']);

const toast = useToast();

// State
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const error = ref(null);

// Data
const typeData = ref(null);
const objects = ref([]);

// Dialogs
const showAddDialog = ref(false);
const showDeleteDialog = ref(false);
const editingObject = ref(null);
const objectToDelete = ref(null);

// Form
const dialogForm = ref({
  value: ''
});

// Methods
async function loadObjects() {
  try {
    loading.value = true;
    error.value = null;

    // Load type metadata
    const metadata = await integramService.getMetadata(props.typeId);
    typeData.value = metadata.type;

    // Load objects filtered by parent
    const data = await integramService.getObjects(props.typeId, {
      F_U: props.parentObjectId
    });

    objects.value = data.objs || [];
  } catch (err) {
    error.value = err.message;
    console.error('Failed to load subordinate objects:', err);
  } finally {
    loading.value = false;
  }
}

function editObject(obj) {
  editingObject.value = obj;
  dialogForm.value.value = obj.val;
  showAddDialog.value = true;
}

function confirmDelete(obj) {
  objectToDelete.value = obj;
  showDeleteDialog.value = true;
}

async function saveObject() {
  if (!dialogForm.value.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка валидации',
      detail: 'Значение обязательно',
      life: 3000
    });
    return;
  }

  try {
    saving.value = true;

    if (editingObject.value) {
      // Update existing object
      await integramService.updateObject(editingObject.value.id, {
        [`t${props.typeId}`]: dialogForm.value.value
      });

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Объект обновлён',
        life: 3000
      });
    } else {
      // Create new object
      await integramService.createObject(
        props.typeId,
        dialogForm.value.value,
        props.parentObjectId
      );

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Объект создан',
        life: 3000
      });
    }

    closeAddDialog();
    await loadObjects();
    emit('change');
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить объект: ' + err.message,
      life: 5000
    });
  } finally {
    saving.value = false;
  }
}

async function deleteObject() {
  if (!objectToDelete.value) return;

  try {
    deleting.value = true;

    await integramService.deleteObject(objectToDelete.value.id);

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Объект удалён',
      life: 3000
    });

    showDeleteDialog.value = false;
    objectToDelete.value = null;

    await loadObjects();
    emit('change');
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить объект: ' + err.message,
      life: 5000
    });
  } finally {
    deleting.value = false;
  }
}

function closeAddDialog() {
  showAddDialog.value = false;
  editingObject.value = null;
  dialogForm.value.value = '';
}

// Lifecycle
onMounted(() => {
  loadObjects();
});

// Watch for parent changes
watch(() => props.parentObjectId, () => {
  loadObjects();
});
</script>

<style scoped>
.integram-subordinate-table {
  padding: 1rem;
  background: var(--surface-card);
  border-radius: var(--border-radius);
}

h4 {
  color: var(--text-color);
}
</style>
