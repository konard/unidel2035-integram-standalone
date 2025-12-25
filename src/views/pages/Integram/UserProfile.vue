<template>
  <div class="user-profile-container">
    <!-- Breadcrumb -->
    <div class="mb-3">
      <Breadcrumb :home="{ icon: 'pi pi-home', to: `/integram/${database}` }" :model="breadcrumbItems" />
    </div>

    <!-- Loading state -->
    <Card v-if="loading">
      <template #content>
        <div class="text-center py-5">
          <ProgressSpinner />
          <p class="mt-3">Загрузка профиля пользователя...</p>
        </div>
      </template>
    </Card>

    <!-- Error state -->
    <Card v-else-if="errorMessage">
      <template #content>
        <div class="text-center py-5">
          <Message severity="error" :closable="false">{{ errorMessage }}</Message>
        </div>
      </template>
    </Card>

    <!-- User Profile Card -->
    <div v-else-if="userData" class="grid">
      <!-- Left column: Photo and basic info -->
      <div class="col-12 md:col-4">
        <Card>
          <template #title>
            <div class="text-center">
              {{ userData.val || 'Пользователь' }}
            </div>
          </template>
          <template #content>
            <!-- User Photo -->
            <div class="text-center mb-4">
              <div v-if="photoUrl" class="user-photo-wrapper">
                <Image
                  :src="photoUrl"
                  :alt="userData.val || 'User'"
                  width="200"
                  preview
                  class="border-circle"
                  style="object-fit: cover; width: 200px; height: 200px;"
                />
              </div>
              <div v-else class="user-photo-placeholder">
                <Avatar
                  :label="getInitials(userData.val)"
                  size="xlarge"
                  shape="circle"
                  style="width: 200px; height: 200px; font-size: 4rem;"
                />
              </div>
            </div>

            <!-- User ID -->
            <div class="text-center mb-2">
              <Tag severity="info">ID: {{ userId }}</Tag>
            </div>
          </template>
        </Card>
      </div>

      <!-- Right column: User details -->
      <div class="col-12 md:col-8">
        <Card>
          <template #title>
            <div class="flex align-items-center justify-content-between">
              <span>Информация о пользователе</span>
              <Button
                icon="pi pi-refresh"
                @click="loadUserData"
                :loading="loading"
                size="small"
                outlined
                v-tooltip.bottom="'Обновить'"
              />
            </div>
          </template>
          <template #content>
            <!-- User Details Table -->
            <div class="user-details">
              <div v-for="field in displayFields" :key="field.id" class="field-row mb-3 p-3 surface-50 border-round">
                <div class="grid">
                  <div class="col-12 md:col-4">
                    <strong class="text-primary">{{ field.label }}</strong>
                  </div>
                  <div class="col-12 md:col-8">
                    <span v-if="field.value">{{ formatValue(field) }}</span>
                    <span v-else class="text-500 italic">Не указано</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import integramApiClient from '@/services/integramApiClient'
import { useIntegramSession } from '@/composables/useIntegramSession'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Image from 'primevue/image'
import Avatar from 'primevue/avatar'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Breadcrumb from 'primevue/breadcrumb'

const route = useRoute()
const { isAuthenticated } = useIntegramSession()
const userId = computed(() => route.params.id)
const database = computed(() => route.params.database || integramApiClient.getDatabase() || 'my')

const loading = ref(true)
const errorMessage = ref('')
const userData = ref(null)
const userRequisites = ref([]) // Initialize as empty array
const typeMetadata = ref(null)

// Breadcrumb items
const breadcrumbItems = computed(() => [
  { label: 'Главная', to: `/integram/${database.value}` },
  { label: 'Пользователи', to: `/integram/${database.value}/object/18` },
  { label: `Пользователь #${userId.value}` }
])

// Photo URL
const photoUrl = computed(() => {
  const photoField = userRequisites.value.find(r => r.id === '38' || r.val === 'Photo')
  if (photoField && photoField.value) {
    // Integram photo URL format
    const baseUrl = `${import.meta.env.VITE_INTEGRAM_URL}/${database.value}/api`
    return `${baseUrl}/file/${photoField.value}`
  }
  return null
})

// Display fields (exclude system fields)
const displayFields = computed(() => {
  if (!userRequisites.value || !typeMetadata.value) return []

  // Ensure userRequisites.value is an array
  if (!Array.isArray(userRequisites.value)) {
    console.warn('[UserProfile] userRequisites is not an array:', userRequisites.value)
    return []
  }

  const excludeIds = ['20', '125', '40'] // Password, Token, xsrf

  return userRequisites.value
    .filter(req => !excludeIds.includes(req.id))
    .map(req => {
      const metadata = typeMetadata.value.reqs.find(r => r.id === req.id)
      return {
        id: req.id,
        label: metadata?.val || req.val || `Field ${req.id}`,
        value: req.value,
        type: metadata?.type,
        ...req
      }
    })
})

// Get initials from name
function getInitials(name) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return parts[0][0] + parts[1][0]
  }
  return name[0]
}

// Format value based on field type
function formatValue(field) {
  if (!field.value) return ''

  // Date fields (type 4, 5, 9)
  if (['4', '5', '9'].includes(field.type)) {
    try {
      const date = new Date(field.value)
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('ru-RU')
      }
    } catch (e) {
      // Return original value if parsing fails
    }
  }

  // Reference fields (type 3 with ref)
  if (field.ref) {
    return field.value_text || field.value
  }

  // Boolean fields (type 7)
  if (field.type === '7') {
    return field.value === '1' || field.value === 'true' ? 'Да' : 'Нет'
  }

  return field.value
}

// Load user data
async function loadUserData() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Get type metadata for field names
    typeMetadata.value = await integramApiClient.getTypeMetadata(18)

    // Get user data
    const editData = await integramApiClient.getObjectEditData(userId.value)

    if (editData) {
      console.log('[UserProfile] Received edit data:', editData)
      userData.value = editData
      // Parse requisites
      if (editData.reqs) {
        console.log('[UserProfile] Requisites type:', typeof editData.reqs, Array.isArray(editData.reqs))
        // Ensure reqs is an array
        if (Array.isArray(editData.reqs)) {
          userRequisites.value = editData.reqs
        } else {
          console.error('[UserProfile] editData.reqs is not an array:', editData.reqs)
          userRequisites.value = []
        }
      } else {
        userRequisites.value = []
      }
    } else {
      errorMessage.value = 'Пользователь не найден'
    }
  } catch (error) {
    console.error('Error loading user data:', error)
    errorMessage.value = `Ошибка загрузки данных: ${error.message}`
  } finally {
    loading.value = false
  }
}

// Watch for authentication and route changes
watchEffect(() => {
  if (userId.value && integramApiClient.token) {
    loadUserData()
  }
})
</script>

<style scoped>
.user-profile-container {
  padding: 1rem;
}

.user-photo-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 1rem;
}

.user-photo-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 1rem;
}

.field-row {
  transition: background-color 0.3s;
}

.field-row:hover {
  background-color: var(--surface-100) !important;
}

.user-details {
  max-height: 600px;
  overflow-y: auto;
}
</style>
