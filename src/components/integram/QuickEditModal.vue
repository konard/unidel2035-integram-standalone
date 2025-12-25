<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    :style="{ width: '600px' }"
    modal
    @hide="handleCancel"
  >
    <!-- Loading State -->
    <div v-if="loading" class="text-center p-5">
      <ProgressSpinner />
      <p class="mt-3">Загрузка данных...</p>
    </div>

    <!-- Error State -->
    <Message v-if="error" severity="error" class="mb-3">
      {{ error }}
    </Message>

    <!-- Edit Form -->
    <div v-if="!loading && objectData" class="quick-edit-form">
      <!-- Object Value -->
      <div class="field">
        <label for="object-value" class="font-semibold">
          {{ typeInfo?.val || 'Значение' }}
          <span class="text-red-500">*</span>
        </label>
        <InputText
          id="object-value"
          v-model="formData.value"
          class="w-full"
          :disabled="saving"
        />
      </div>

      <!-- Parent (if applicable) -->
      <div v-if="typeInfo && typeInfo.up && typeInfo.up !== '0'" class="field">
        <label for="parent-id" class="font-semibold">
          Родитель
        </label>
        <InputText
          id="parent-id"
          v-model="formData.parentId"
          class="w-full"
          :disabled="saving"
          placeholder="ID родительского объекта"
        />
      </div>

      <!-- Requisites -->
      <div v-if="requisites.length > 0" class="field">
        <Divider align="left">
          <div class="inline-flex align-items-center">
            <i class="pi pi-list mr-2"></i>
            <b>Реквизиты</b>
          </div>
        </Divider>

        <div v-for="req in requisites" :key="req.id" class="field">
          <label :for="`req-${req.id}`" class="font-semibold">
            {{ req.name }}
            <span v-if="req.required" class="text-red-500">*</span>
          </label>

          <!-- Text Field -->
          <InputText
            v-if="isTextField(req)"
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            class="w-full"
            :disabled="saving"
            :required="req.required"
          />

          <!-- Number Field -->
          <InputNumber
            v-else-if="isNumberField(req)"
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            class="w-full"
            :disabled="saving"
            :required="req.required"
          />

          <!-- Date Field -->
          <Calendar
            v-else-if="isDateField(req)"
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            class="w-full"
            :disabled="saving"
            dateFormat="dd.mm.yy"
          />

          <!-- Boolean Field -->
          <Checkbox
            v-else-if="isBooleanField(req)"
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            :binary="true"
            :disabled="saving"
          />

          <!-- Textarea for long text -->
          <Textarea
            v-else-if="isLongTextField(req)"
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            class="w-full"
            :disabled="saving"
            rows="3"
          />

          <!-- Default: Text Input -->
          <InputText
            v-else
            :id="`req-${req.id}`"
            v-model="formData.requisites[req.id]"
            class="w-full"
            :disabled="saving"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-content-between w-full">
        <div>
          <Button
            v-if="objectId"
            label="Удалить"
            icon="pi pi-trash"
            @click="confirmDelete"
            severity="danger"
            text
            :disabled="saving"
          />
        </div>
        <div class="flex gap-2">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="handleCancel"
            text
            :disabled="saving"
          />
          <Button
            label="Сохранить"
            icon="pi pi-check"
            @click="handleSave"
            :loading="saving"
            autofocus
          />
        </div>
      </div>
    </template>
  </Dialog>

  <!-- Delete Confirmation -->
  <Dialog
    v-model:visible="showDeleteConfirm"
    header="Подтверждение удаления"
    :style="{ width: '400px' }"
    modal
  >
    <div class="flex align-items-center gap-3">
      <i class="pi pi-exclamation-triangle text-4xl text-orange-500"></i>
      <span>
        Вы уверены, что хотите удалить объект
        <b>{{ formData.value }}</b>?
      </span>
    </div>

    <template #footer>
      <Button
        label="Отмена"
        @click="showDeleteConfirm = false"
        text
      />
      <Button
        label="Удалить"
        @click="handleDelete"
        severity="danger"
        :loading="deleting"
        autofocus
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import integramApiClient from '@/services/integramApiClient'

// PrimeVue Components

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  database: {
    type: String,
    required: true
  },
  objectId: {
    type: [String, Number],
    default: null
  },
  typeId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['update:visible', 'saved', 'deleted'])

const toast = useToast()

// State
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const error = ref(null)
const objectData = ref(null)
const typeInfo = ref(null)
const requisites = ref([])
const showDeleteConfirm = ref(false)

const formData = ref({
  value: '',
  parentId: null,
  requisites: {}
})

const dialogTitle = computed(() => {
  if (props.objectId) {
    return `Редактировать: ${formData.value.value || 'Объект'}`
  } else {
    return `Создать: ${typeInfo.value?.val || 'Объект'}`
  }
})

// Methods
async function loadData() {
  if (!props.visible) return

  try {
    loading.value = true
    error.value = null

    integramApiClient.setDatabase(props.database)

    if (props.objectId) {
      // Load existing object
      const data = await integramApiClient.getObjectEditData(props.objectId)

      objectData.value = data

      // Parse object data
      if (data.obj) {
        formData.value.value = data.obj.val || ''
        formData.value.parentId = data.obj.up || null
      }

      // Parse requisites
      if (data.reqs) {
        for (const req of data.reqs) {
          formData.value.requisites[req.id] = req.val || ''
        }
      }

      // Load type info
      if (data.obj && data.obj.typ) {
        const metadata = await integramApiClient.getTypeMetadata(data.obj.typ)
        typeInfo.value = metadata

        // Build requisites list
        if (metadata.reqs) {
          requisites.value = metadata.reqs.map(r => ({
            id: r.id,
            name: r.val,
            type: r.type,
            required: r.attrs && r.attrs.includes(':!NULL:')
          }))
        }
      }
    } else if (props.typeId) {
      // Create new object - load type metadata
      const metadata = await integramApiClient.getTypeMetadata(props.typeId)
      typeInfo.value = metadata

      // Build requisites list
      if (metadata.reqs) {
        requisites.value = metadata.reqs.map(r => ({
          id: r.id,
          name: r.val,
          type: r.type,
          required: r.attrs && r.attrs.includes(':!NULL:')
        }))

        // Initialize requisites object
        for (const req of requisites.value) {
          formData.value.requisites[req.id] = ''
        }
      }

      objectData.value = { obj: { typ: props.typeId } }
    }
  } catch (err) {
    error.value = err.message
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: err.message,
      life: 5000
    })
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  try {
    saving.value = true
    error.value = null

    // Validate required fields
    if (!formData.value.value) {
      throw new Error('Введите значение объекта')
    }

    // Check required requisites
    for (const req of requisites.value) {
      if (req.required && !formData.value.requisites[req.id]) {
        throw new Error(`Поле "${req.name}" обязательно для заполнения`)
      }
    }

    if (props.objectId) {
      // Update existing object
      await integramApiClient.saveObject(
        props.objectId,
        formData.value.value,
        formData.value.requisites
      )

      toast.add({
        severity: 'success',
        summary: 'Сохранено',
        detail: 'Объект успешно обновлен',
        life: 3000
      })
    } else {
      // Create new object
      const result = await integramApiClient.createObject(
        props.typeId,
        formData.value.value,
        formData.value.requisites,
        formData.value.parentId
      )

      if (result && result.failed) {
        throw new Error(result.failed)
      }

      toast.add({
        severity: 'success',
        summary: 'Создано',
        detail: 'Объект успешно создан',
        life: 3000
      })
    }

    emit('saved')
    handleCancel()
  } catch (err) {
    error.value = err.message
    toast.add({
      severity: 'error',
      summary: 'Ошибка сохранения',
      detail: err.message,
      life: 5000
    })
  } finally {
    saving.value = false
  }
}

function confirmDelete() {
  showDeleteConfirm.value = true
}

async function handleDelete() {
  try {
    deleting.value = true

    await integramApiClient.deleteObject(props.objectId)

    toast.add({
      severity: 'success',
      summary: 'Удалено',
      detail: 'Объект успешно удален',
      life: 3000
    })

    showDeleteConfirm.value = false
    emit('deleted')
    handleCancel()
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления',
      detail: err.message,
      life: 5000
    })
  } finally {
    deleting.value = false
  }
}

function handleCancel() {
  emit('update:visible', false)

  // Reset form
  formData.value = {
    value: '',
    parentId: null,
    requisites: {}
  }
  objectData.value = null
  typeInfo.value = null
  requisites.value = []
  error.value = null
}

// Field type helpers
function isTextField(req) {
  return req.type === '3' || req.type === '8' // SHORT or CHARS
}

function isNumberField(req) {
  return req.type === '13' || req.type === '14' // INTEGER or DECIMAL
}

function isDateField(req) {
  return req.type === '4' || req.type === '9' // DATE or DATETIME
}

function isBooleanField(req) {
  return req.type === '7' // BOOLEAN
}

function isLongTextField(req) {
  return req.type === '2' // LONG
}

// Watch for visibility changes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadData()
  }
})
</script>

<style scoped>
.quick-edit-form {
  max-height: 70vh;
  overflow-y: auto;
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  margin-bottom: 0.5rem;
}
</style>
