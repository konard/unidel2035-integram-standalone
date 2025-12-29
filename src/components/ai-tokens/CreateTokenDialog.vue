<template>
  <Dialog
    v-model:visible="isVisible"
    :header="editMode ? 'Редактирование токена' : 'Создание нового токена'"
    :modal="true"
    :closable="!isCreating"
    :style="{ width: '600px' }"
    @hide="onHide"
  >
    <div class="create-token-content">
      <!-- Info Message -->
      <Message severity="info" :closable="false" v-if="!generatedToken">
        <p v-if="!editMode">
          Создайте токен доступа для использования AI моделей через API.
          Токен можно использовать во всех ваших приложениях и сервисах.
        </p>
        <p v-else>
          Измените параметры токена. Сам токен изменить нельзя по соображениям безопасности.
        </p>
      </Message>

      <!-- Generated Token Display -->
      <div v-if="generatedToken" class="generated-token-section">
        <Message severity="success" :closable="false">
          <p><strong>Токен успешно создан!</strong></p>
          <p>Скопируйте токен сейчас - он больше не будет показан:</p>
        </Message>

        <div class="token-display-box">
          <code class="token-value">{{ generatedToken }}</code>
          <Button
            icon="pi pi-copy"
            @click="copyToken"
            v-tooltip.top="'Копировать токен'"
            text
            rounded
            severity="success"
          />
        </div>

        <Message severity="warn" :closable="false" class="warning-msg">
          <p><strong>Важно!</strong> Сохраните токен в безопасном месте. После закрытия этого окна вы не сможете его просмотреть снова.</p>
        </Message>
      </div>

      <!-- Token Form -->
      <div v-else class="token-form">
        <!-- Token Name -->
        <div class="field">
          <label for="token-name" class="required">Название токена</label>
          <InputText
            id="token-name"
            v-model="formData.name"
            placeholder="Мой AI токен"
            :invalid="errors.name"
            class="w-full"
          />
          <small v-if="errors.name" class="p-error">{{ errors.name }}</small>
          <small v-else class="field-hint">Понятное имя для идентификации токена</small>
        </div>

        <!-- Token Description -->
        <div class="field">
          <label for="token-description">Описание</label>
          <Textarea
            id="token-description"
            v-model="formData.description"
            placeholder="Для чего будет использоваться этот токен?"
            :rows="3"
            class="w-full"
          />
          <small class="field-hint">Опциональное описание назначения токена</small>
        </div>

        <!-- Limits Section -->
        <div class="limits-section">
          <h4>Ограничения</h4>
          <p class="section-description">Установите лимиты для контроля расхода токенов</p>

          <div class="limits-grid">
            <!-- Daily Limit -->
            <div class="field">
              <label for="daily-limit">Дневной лимит (токенов)</label>
              <InputNumber
                id="daily-limit"
                v-model="formData.dailyLimit"
                :min="0"
                :step="1000"
                :invalid="errors.dailyLimit"
                showButtons
                class="w-full"
              />
              <small v-if="errors.dailyLimit" class="p-error">{{ errors.dailyLimit }}</small>
              <small v-else class="field-hint">0 = без ограничений</small>
            </div>

            <!-- Monthly Limit -->
            <div class="field">
              <label for="monthly-limit">Месячный лимит (токенов)</label>
              <InputNumber
                id="monthly-limit"
                v-model="formData.monthlyLimit"
                :min="0"
                :step="10000"
                :invalid="errors.monthlyLimit"
                showButtons
                class="w-full"
              />
              <small v-if="errors.monthlyLimit" class="p-error">{{ errors.monthlyLimit }}</small>
              <small v-else class="field-hint">0 = без ограничений</small>
            </div>
          </div>
        </div>

        <!-- Scopes Section (Optional for future) -->
        <div class="scopes-section" v-if="showAdvancedOptions">
          <h4>Права доступа</h4>
          <p class="section-description">Выберите, какие операции разрешены для этого токена</p>

          <div class="scopes-grid">
            <div v-for="scope in availableScopes" :key="scope.value" class="scope-item">
              <Checkbox
                :inputId="scope.value"
                v-model="formData.scopes"
                :value="scope.value"
              />
              <label :for="scope.value" class="scope-label">
                <span class="scope-name">{{ scope.label }}</span>
                <span class="scope-description">{{ scope.description }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Advanced Options Toggle -->
        <div class="advanced-toggle">
          <Button
            :label="showAdvancedOptions ? 'Скрыть расширенные настройки' : 'Показать расширенные настройки'"
            :icon="showAdvancedOptions ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            @click="showAdvancedOptions = !showAdvancedOptions"
            text
            size="small"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <Button
          v-if="!generatedToken"
          label="Отмена"
          @click="onCancel"
          text
          severity="secondary"
          :disabled="isCreating"
        />
        <Button
          v-if="!generatedToken"
          :label="editMode ? 'Сохранить изменения' : 'Создать токен'"
          :icon="editMode ? 'pi pi-check' : 'pi pi-key'"
          @click="onSubmit"
          :loading="isCreating"
          :disabled="!isFormValid"
        />
        <Button
          v-if="generatedToken"
          label="Готово"
          icon="pi pi-check"
          @click="onClose"
          severity="success"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'

import ddadminClient from '@/ddadminAxios'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  token: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'token-created', 'token-updated'])

const toast = useToast()

// Local visibility state
const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// Edit mode detection
const editMode = computed(() => !!props.token)

// Form state
const formData = ref({
  name: '',
  description: '',
  dailyLimit: 100000,
  monthlyLimit: 1000000,
  scopes: ['chat', 'completion']
})

const errors = ref({})
const isCreating = ref(false)
const generatedToken = ref(null)
const showAdvancedOptions = ref(false)

// Available scopes
const availableScopes = [
  {
    value: 'chat',
    label: 'Chat',
    description: 'Доступ к chat API для диалогов'
  },
  {
    value: 'completion',
    label: 'Completion',
    description: 'Текстовые дополнения и генерация'
  },
  {
    value: 'embedding',
    label: 'Embeddings',
    description: 'Создание векторных представлений'
  },
  {
    value: 'image',
    label: 'Image Generation',
    description: 'Генерация изображений'
  },
  {
    value: 'transcription',
    label: 'Transcription',
    description: 'Распознавание речи'
  }
]

// Form validation
const isFormValid = computed(() => {
  return formData.value.name.trim().length > 0 &&
         !Object.keys(errors.value).some(key => errors.value[key])
})

// Watch for token changes (edit mode)
watch(() => props.token, (newToken) => {
  if (newToken) {
    formData.value = {
      name: newToken.name || '',
      description: newToken.description || '',
      dailyLimit: newToken.daily_limit || 100000,
      monthlyLimit: newToken.monthly_limit || 1000000,
      scopes: newToken.scopes || ['chat', 'completion']
    }
  }
}, { immediate: true })

// Reset form when dialog opens
watch(isVisible, (visible) => {
  if (visible && !editMode.value) {
    resetForm()
  }
})

// Validate form
function validateForm() {
  errors.value = {}

  if (!formData.value.name.trim()) {
    errors.value.name = 'Введите название токена'
  }

  if (formData.value.dailyLimit < 0) {
    errors.value.dailyLimit = 'Лимит не может быть отрицательным'
  }

  if (formData.value.monthlyLimit < 0) {
    errors.value.monthlyLimit = 'Лимит не может быть отрицательным'
  }

  if (formData.value.dailyLimit > formData.value.monthlyLimit && formData.value.monthlyLimit > 0) {
    errors.value.dailyLimit = 'Дневной лимит не может превышать месячный'
  }

  return Object.keys(errors.value).length === 0
}

// Submit form
async function onSubmit() {
  if (!validateForm()) {
    return
  }

  isCreating.value = true

  try {
    if (editMode.value) {
      // Update existing token
      await updateToken()
    } else {
      // Create new token
      await createToken()
    }
  } catch (error) {
    console.error('Error submitting token form:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message || 'Не удалось выполнить операцию',
      life: 5000
    })
  } finally {
    isCreating.value = false
  }
}

// Create token
async function createToken() {
  try {
    console.log('🎯 Creating token in my database (table 198016)...')
    console.log('📋 Token form data:', formData.value)

    // Get current user ID
    const currentUserId = await getCurrentUserId()
    console.log('👤 Current user ID:', currentUserId)

    // Validate user ID
    if (!currentUserId) {
      throw new Error('Не удалось определить ID пользователя. Пожалуйста, войдите в систему.')
    }

    // Generate token value
    const tokenValue = `dd_tok_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
    console.log('🔑 Generated token:', tokenValue)

    // Prepare form data for my database
    // Table 198016 (ai_token) structure:
    // - 198018: Дата (DATE)
    // - 198020: Название (SHORT)
    // - 198023: Срок (reference to 198021: 198024=7дней, 198025=1месяц, 198026=1год)
    // - 198039: Транзакция (array)
    const formDataToSend = new URLSearchParams()
    formDataToSend.append('typ', '198016') // AI token table ID in 'my' database

    // Add required fields
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

    // Map form data to correct field IDs for table 198016
    formDataToSend.append('val', tokenValue) // Main object value (token string)
    formDataToSend.append('t198018', today) // Дата (Date field)
    formDataToSend.append('t198020', formData.value.name || `Token_${Date.now()}`) // Название (Name field)
    formDataToSend.append('t198023', '198026') // Срок = 1 год (default expiry)

    console.log('📋 Prepared form data:', Object.fromEntries(formDataToSend))

    // Try to get XSRF token first
    let xsrfToken = null
    try {
      const xsrfResponse = await ddadminClient.get('/xsrf?JSON_KV=true')
      xsrfToken = xsrfResponse.data.xsrf || xsrfResponse.data._xsrf || xsrfResponse.data.XSRF
      if (xsrfToken) {
        formDataToSend.append('_xsrf', xsrfToken)
        console.log('✅ XSRF token obtained:', xsrfToken.substring(0, 20) + '...')
      }
    } catch (xsrfError) {
      console.warn('⚠️ Could not get XSRF token, continuing without it:', xsrfError.message)
    }

    // Use the correct endpoint for table 198016 with up=USER_ID (user's subordinate object)
    const endpoint = `/_m_new/198016?JSON&up=${currentUserId}`

    console.log(`🔄 Using endpoint: ${endpoint}`)

    const response = await ddadminClient.post(endpoint, formDataToSend, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    console.log('📊 Response data:', response.data)

    const result = response.data

    // Check for success
    if (result && !result.error) {
      console.log('✅ Token created successfully in database!')

      generatedToken.value = tokenValue

      toast.add({
        severity: 'success',
        summary: 'Токен создан',
        detail: 'Токен успешно создан и сохранен в базе данных. Скопируйте его сейчас!',
        life: 5000
      })

      emit('token-created', {
        ...formData.value,
        token: tokenValue,
        databaseId: result.id || result.obj || result.object_id
      })

      return
    } else if (result && result.error) {
      throw new Error(result.error)
    } else {
      throw new Error('Неизвестный формат ответа от сервера')
    }

  } catch (error) {
    console.error('❌ Error creating token:', error)
    throw new Error(error.message || 'Не удалось создать токен в базе данных')
  }
}

// Get table fields dynamically
async function getTableFields() {
  try {
    console.log('🔍 Getting table structure...')
    
    const response = await ddadminClient.get('/object/298')
    
    if (response.data && response.data.response && response.data.response.headers) {
      console.log('✅ Table structure obtained:', response.data.response.headers.length, 'fields')
      return response.data.response.headers
    } else {
      console.warn('⚠️ Unexpected table structure response')
      return []
    }
  } catch (error) {
    console.error('❌ Error getting table structure:', error)
    return []
  }
}

// Find field ID by field type
function findFieldId(fields, fieldType) {
  if (!fields || !Array.isArray(fields)) return null
  
  const typeMappings = {
    token: ['t298', 'token', 'токен', 'значение токена', 'ключ токена'],
    name: ['название', 'наменование', 'имя', 'наименование', 'название токена'],
    date: ['дата', 'дата создания', 'created', 'создан'],
    expiry: ['срок', 'истечен', 'expiry', 'действует до'],
    description: ['описание', 'description', 'комментарий'],
    transaction: ['транзакция', 'transaction', 'id транзакции', 'номер']
  }
  
  const searchTerms = typeMappings[fieldType] || [fieldType]
  
  for (const field of fields) {
    const fieldName = (field.value || '').toLowerCase()
    for (const term of searchTerms) {
      if (fieldName.includes(term.toLowerCase())) {
        console.log(`✅ Found ${fieldType} field: ${field.value} (ID: ${field.id})`)
        return field.id
      }
    }
  }
  
  // Special case for t298 - try direct ID match
  if (fieldType === 'token') {
    const t298Field = fields.find(f => f.id === '298' || f.value === 't298' || f.value.toLowerCase() === 't298')
    if (t298Field) {
      console.log(`✅ Found t298 field directly: ${t298Field.value} (ID: ${t298Field.id})`)
      return t298Field.id
    }
  }
  
  console.warn(`⚠️ Field for ${fieldType} not found`)
  return null
}

// Get current user ID
async function getCurrentUserId() {
  try {
    const authDb = localStorage.getItem('db')

    // 1. For my database, userId is stored in 'id' key when db === 'my'
    if (authDb === 'my') {
      const myUserId = localStorage.getItem('id')
      if (myUserId) {
        console.log('✅ Found my database user ID:', myUserId)
        return myUserId
      }
    }

    // 2. Try to extract from URL parameters (F_U=xxx)
    const urlParams = new URLSearchParams(window.location.search)
    const urlUserId = urlParams.get('F_U')
    if (urlUserId) {
      console.log('✅ Found user ID in URL:', urlUserId)
      return urlUserId
    }

    // 3. Try to get from my database session info
    try {
      const sessionResponse = await ddadminClient.get('/session')
      if (sessionResponse.data?.user?.id) {
        console.log('✅ Found user ID in session:', sessionResponse.data.user.id)
        return sessionResponse.data.user.id.toString()
      }
    } catch (sessionError) {
      console.warn('Could not get session info:', sessionError.message)
    }

    // 4. No userId found
    console.warn('⚠️ No user ID found for my database')
    return null

  } catch (error) {
    console.warn('Could not get current user ID:', error)
    return null
  }
}

// Update token
async function updateToken() {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 1000))

  toast.add({
    severity: 'success',
    summary: 'Токен обновлен',
    detail: 'Настройки токена успешно обновлены',
    life: 3000
  })

  emit('token-updated', {
    id: props.token.id,
    ...formData.value
  })

  isVisible.value = false
}

// Copy token to clipboard
async function copyToken() {
  try {
    await navigator.clipboard.writeText(generatedToken.value)
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'Токен скопирован в буфер обмена',
      life: 2000
    })
  } catch (error) {
    console.error('Failed to copy token:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось скопировать токен',
      life: 3000
    })
  }
}

// Reset form
function resetForm() {
  formData.value = {
    name: '',
    description: '',
    dailyLimit: 100000,
    monthlyLimit: 1000000,
    scopes: ['chat', 'completion']
  }
  errors.value = {}
  generatedToken.value = null
  showAdvancedOptions.value = false
}

// Cancel
function onCancel() {
  isVisible.value = false
}

// Close dialog
function onClose() {
  isVisible.value = false
}

// On hide
function onHide() {
  if (!editMode.value) {
    resetForm()
  }
}
</script>

<style scoped>
.create-token-content {
  padding: 1rem 0;
}

.field {
  margin-bottom: 1.5rem;
}

.field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.field label.required::after {
  content: ' *';
  color: var(--red-500);
}

.field-hint {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.limits-section,
.scopes-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--surface-border);
}

.limits-section h4,
.scopes-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  color: var(--text-color);
}

.section-description {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.limits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.scopes-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.scope-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.scope-label {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.scope-name {
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.875rem;
}

.scope-description {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
}

.advanced-toggle {
  margin-top: 1rem;
  text-align: center;
}

.generated-token-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.token-display-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--surface-100);
  border-radius: 8px;
  border: 2px solid var(--green-500);
}

.token-value {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  color: var(--text-color);
  word-break: break-all;
}

.warning-msg {
  margin-top: 1rem;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  .limits-grid {
    grid-template-columns: 1fr;
  }

  .dialog-footer {
    flex-direction: column;
  }

  .dialog-footer button {
    width: 100%;
  }
}
</style>
