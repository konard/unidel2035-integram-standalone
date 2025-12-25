<template>
  <div class="user-profile-page">
    <!-- Breadcrumb -->
    <div class="mb-3">
      <Breadcrumb :home="{ icon: 'pi pi-home', to: `/integram/${database}` }" :model="breadcrumbItems" />
    </div>

    <!-- Loading state -->
    <Card v-if="loading" class="loading-card">
      <template #content>
        <div class="text-center py-5">
          <ProgressSpinner />
          <p class="mt-3">Загрузка профиля пользователя...</p>
        </div>
      </template>
    </Card>

    <!-- Error state -->
    <Card v-else-if="errorMessage" class="error-card">
      <template #content>
        <div class="text-center py-5">
          <Message severity="error" :closable="false">{{ errorMessage }}</Message>
        </div>
      </template>
    </Card>

    <!-- User Profile -->
    <div v-else-if="userData" class="profile-layout">
      <!-- Left Sidebar - Profile Card -->
      <Card class="profile-sidebar">
        <template #content>
          <div class="profile-header">
            <!-- User Photo -->
            <div class="profile-photo-container">
              <Image
                v-if="photoUrl"
                :src="photoUrl"
                :alt="userData.val || 'User'"
                preview
                class="profile-photo"
              />
              <Avatar
                v-else
                :label="getInitials(userData.val)"
                size="xlarge"
                shape="circle"
                class="profile-avatar"
              />
            </div>

            <!-- User Name -->
            <h1 class="profile-name">{{ userData.val || 'Пользователь' }}</h1>

            <!-- User Role -->
            <div class="profile-role" v-if="userRole">
              <Tag :value="userRole" severity="info" />
            </div>

            <!-- User ID -->
            <div class="profile-id">
              <i class="pi pi-id-card"></i>
              <span>ID: {{ userId }}</span>
            </div>

            <!-- Quick Stats -->
            <div class="profile-stats" v-if="quickStats.length > 0">
              <div v-for="stat in quickStats" :key="stat.label" class="stat-item">
                <div class="stat-value">{{ stat.value }}</div>
                <div class="stat-label">{{ stat.label }}</div>
              </div>
            </div>

            <!-- Actions -->
            <div class="profile-actions">
              <Button
                icon="pi pi-refresh"
                label="Обновить"
                @click="loadUserData"
                :loading="loading"
                outlined
                class="w-full"
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- Right Content - Details -->
      <div class="profile-content">
        <Card>
          <template #content>
            <TabView v-model:activeIndex="activeTab">
              <!-- Personal Info Tab -->
              <TabPanel header="Личные данные">
                <div class="info-section">
                  <div v-for="field in personalFields" :key="field.id" class="info-row">
                    <div class="info-label">
                      <i :class="field.icon || 'pi pi-circle-fill'" class="field-icon"></i>
                      {{ field.label }}
                    </div>
                    <div class="info-value">
                      <span v-if="field.value">{{ formatValue(field) }}</span>
                      <span v-else class="text-500">—</span>
                    </div>
                  </div>
                  <div v-if="personalFields.length === 0" class="no-data">
                    <i class="pi pi-info-circle"></i>
                    <p>Нет данных</p>
                  </div>
                </div>
              </TabPanel>

              <!-- Contact Info Tab -->
              <TabPanel header="Контакты">
                <div class="info-section">
                  <div v-for="field in contactFields" :key="field.id" class="info-row">
                    <div class="info-label">
                      <i :class="field.icon || 'pi pi-circle-fill'" class="field-icon"></i>
                      {{ field.label }}
                    </div>
                    <div class="info-value">
                      <span v-if="field.value">{{ formatValue(field) }}</span>
                      <span v-else class="text-500">—</span>
                    </div>
                  </div>
                  <div v-if="contactFields.length === 0" class="no-data">
                    <i class="pi pi-info-circle"></i>
                    <p>Нет контактных данных</p>
                  </div>
                </div>
              </TabPanel>

              <!-- Professional Tab -->
              <TabPanel header="Профессиональное">
                <div class="info-section">
                  <div v-for="field in professionalFields" :key="field.id" class="info-row">
                    <div class="info-label">
                      <i :class="field.icon || 'pi pi-circle-fill'" class="field-icon"></i>
                      {{ field.label }}
                    </div>
                    <div class="info-value">
                      <span v-if="field.value">{{ formatValue(field) }}</span>
                      <span v-else class="text-500">—</span>
                    </div>
                  </div>
                  <div v-if="professionalFields.length === 0" class="no-data">
                    <i class="pi pi-info-circle"></i>
                    <p>Нет профессиональных данных</p>
                  </div>
                </div>
              </TabPanel>

              <!-- All Fields Tab -->
              <TabPanel header="Все поля">
                <div class="info-section">
                  <div v-for="field in otherFields" :key="field.id" class="info-row">
                    <div class="info-label">
                      <i class="pi pi-circle-fill field-icon"></i>
                      {{ field.label }}
                    </div>
                    <div class="info-value">
                      <span v-if="field.value">{{ formatValue(field) }}</span>
                      <span v-else class="text-500">—</span>
                    </div>
                  </div>
                </div>
              </TabPanel>
            </TabView>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watchEffect } from 'vue'
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
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'

const route = useRoute()
const { isAuthenticated } = useIntegramSession()
const userId = computed(() => route.params.id)
const database = computed(() => route.params.database || integramApiClient.getDatabase() || 'my')

const loading = ref(true)
const errorMessage = ref('')
const userData = ref(null)
const userRequisites = ref([])
const typeMetadata = ref(null)
const activeTab = ref(0)

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
    let photoPath = photoField.value

    if (typeof photoPath === 'string' && photoPath.includes('<a')) {
      const match = photoPath.match(/href="([^"]+)"/)
      if (match) {
        photoPath = match[1]
      }
    }

    if (photoPath.startsWith('/download')) {
      return `https://dronedoc.ru${photoPath}`
    } else if (photoPath.startsWith('http')) {
      return photoPath
    } else {
      const baseUrl = `https://dronedoc.ru/${database.value}/api`
      return `${baseUrl}/file/${photoPath}`
    }
  }
  return null
})

// User role from ROLE field
const userRole = computed(() => {
  const roleField = userRequisites.value.find(r =>
    r.val?.toLowerCase() === 'role' || r.label?.toLowerCase() === 'role'
  )
  return roleField?.value || null
})

// Field categorization with icons
const fieldCategories = {
  personal: {
    keywords: ['name', 'date', 'имя', 'дата', 'фио', 'переписка', 'баланс', 'plan', 'referrals'],
    icon: 'pi pi-user'
  },
  contact: {
    keywords: ['email', 'phone', 'social', 'телефон', 'почта', 'telegram', 'vk', 'google', 'yandex', 'github'],
    icon: 'pi pi-phone'
  },
  professional: {
    keywords: ['role', 'организация', 'recruit', 'bonus', 'платеж', 'aff', 'answer', 'info', 'notes'],
    icon: 'pi pi-briefcase'
  }
}

// Categorize fields
function categorizeField(field) {
  const fieldName = (field.label || field.val || '').toLowerCase()

  for (const [category, config] of Object.entries(fieldCategories)) {
    if (config.keywords.some(keyword => fieldName.includes(keyword))) {
      return { category, icon: config.icon }
    }
  }

  return { category: 'other', icon: 'pi pi-circle-fill' }
}

// Get all fields with categorization
const allFields = computed(() => {
  if (!userRequisites.value || !typeMetadata.value) return []

  if (!Array.isArray(userRequisites.value)) {
    console.warn('[UserProfile] userRequisites is not an array:', userRequisites.value)
    return []
  }

  const excludeIds = ['20', '125', '40', '38'] // Password, Token, xsrf, Photo

  return userRequisites.value
    .filter(req => !excludeIds.includes(req.id) && req.value) // Only show fields with values
    .map(req => {
      const metadata = typeMetadata.value.reqs.find(r => r.id === req.id)
      const { category, icon } = categorizeField(req)
      return {
        id: req.id,
        label: metadata?.val || req.val || `Field ${req.id}`,
        value: req.value,
        type: metadata?.type,
        category,
        icon,
        ...req
      }
    })
})

// Personal fields
const personalFields = computed(() =>
  allFields.value.filter(f => f.category === 'personal')
)

// Contact fields
const contactFields = computed(() =>
  allFields.value.filter(f => f.category === 'contact')
)

// Professional fields
const professionalFields = computed(() =>
  allFields.value.filter(f => f.category === 'professional')
)

// Other fields (for "All Fields" tab - show ALL fields including empty ones)
const otherFields = computed(() => {
  if (!userRequisites.value || !typeMetadata.value) return []

  if (!Array.isArray(userRequisites.value)) {
    return []
  }

  const excludeIds = ['20', '125', '40', '38'] // Password, Token, xsrf, Photo

  return userRequisites.value
    .filter(req => !excludeIds.includes(req.id)) // Show all fields, even empty
    .map(req => {
      const metadata = typeMetadata.value.reqs.find(r => r.id === req.id)
      const { category, icon } = categorizeField(req)
      return {
        id: req.id,
        label: metadata?.val || req.val || `Field ${req.id}`,
        value: req.value,
        type: metadata?.type,
        category,
        icon,
        ...req
      }
    })
})

// Quick stats for sidebar
const quickStats = computed(() => {
  const stats = []

  const activityField = userRequisites.value.find(r => r.val?.toLowerCase() === 'activity')
  if (activityField?.value) {
    stats.push({
      label: 'Последняя активность',
      value: formatValue(activityField)
    })
  }

  return stats
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
        return date.toLocaleString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
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

// Load user data from table 18 using pagination
async function loadUserData() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Ensure correct database is selected
    if (integramApiClient.database !== database.value) {
      console.log(`[UserProfile] Switching database from ${integramApiClient.database} to ${database.value}`)
      await integramApiClient.switchDatabase(database.value)
    }

    // Get type metadata for field names
    typeMetadata.value = await integramApiClient.getTypeMetadata(18)
    console.log('[UserProfile] Type metadata:', typeMetadata.value)

    // Search for user in table 18 with pagination
    let page = 1
    let found = false
    let userObject = null
    let responseWithUser = null
    const maxPages = 100

    console.log(`[UserProfile] Searching for user ID: ${userId.value}`)

    while (!found && page <= maxPages) {
      console.log(`[UserProfile] Loading page ${page}...`)

      const response = await integramApiClient.getObjectList(18, {
        pg: page,
        LIMIT: 50,
        F_U: 1
      })

      console.log(`[UserProfile] Page ${page} response:`, response)

      if (response && response.object && Array.isArray(response.object)) {
        userObject = response.object.find(obj => String(obj.id) === String(userId.value))

        if (userObject) {
          found = true
          responseWithUser = response
          console.log('[UserProfile] User found:', userObject)
          console.log('[UserProfile] Response reqs:', response.reqs)
          break
        }

        if (response.object.length === 0) {
          break
        }
      } else {
        console.warn('[UserProfile] Invalid response format on page', page, response)
        break
      }

      page++
    }

    if (userObject && responseWithUser) {
      userData.value = userObject

      const objectReqs = responseWithUser.reqs?.[userObject.id] || {}
      console.log('[UserProfile] Object requisites:', objectReqs)

      const reqs = []

      for (const metadata of typeMetadata.value.reqs) {
        const reqId = metadata.id
        const value = objectReqs[reqId] || userObject[reqId]

        reqs.push({
          id: reqId,
          val: metadata.val,
          value: value,
          type: metadata.type,
          ref: metadata.ref
        })
      }

      console.log('[UserProfile] Parsed requisites:', reqs)
      userRequisites.value = reqs
    } else {
      errorMessage.value = `Пользователь с ID ${userId.value} не найден в таблице (проверено ${page - 1} страниц)`
    }
  } catch (error) {
    console.error('[UserProfile] Error loading user data:', error)
    errorMessage.value = `Ошибка загрузки данных: ${error.message}`
  } finally {
    loading.value = false
  }
}

// Watch for authentication and route changes
watchEffect(() => {
  if (!userId.value) return

  if (!integramApiClient.token) {
    console.log('[UserProfile] Token not found, attempting to load session from localStorage')
    integramApiClient.loadSession()
  }

  if (integramApiClient.token) {
    loadUserData()
  } else {
    errorMessage.value = 'Требуется авторизация. Пожалуйста, войдите в систему.'
    loading.value = false
  }
})
</script>

<style scoped>
.user-profile-page {
  padding: 1rem;
}

/* Two-column layout */
.profile-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  margin-top: 1rem;
}

/* Profile Sidebar */
.profile-sidebar {
  position: sticky;
  top: 1rem;
  height: fit-content;
}

.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.profile-photo-container {
  margin-bottom: 1.5rem;
}

.profile-photo {
  max-width: 180px;
  max-height: 180px;
  border-radius: 12px;
  object-fit: contain;
  border: 4px solid var(--surface-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.profile-avatar {
  width: 180px !important;
  height: 180px !important;
  font-size: 4rem !important;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-400));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.profile-name {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.75rem 0;
  color: var(--text-color);
}

.profile-role {
  margin-bottom: 1rem;
}

.profile-id {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--surface-50);
  border-radius: 20px;
}

.profile-stats {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1.5rem 0;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary-color);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
}

.profile-actions {
  width: 100%;
}

/* Profile Content */
.profile-content {
  min-height: 400px;
}

.info-section {
  padding: 0.5rem 0;
}

.info-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 2rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--surface-border);
  align-items: start;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.field-icon {
  color: var(--primary-color);
  font-size: 0.75rem;
}

.info-value {
  font-size: 1rem;
  color: var(--text-color);
  word-break: break-word;
  line-height: 1.6;
}

.no-data {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
}

.no-data i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.no-data p {
  margin: 0;
  font-size: 1rem;
}

/* Responsive - tablet */
@media (max-width: 1024px) {
  .profile-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .profile-sidebar {
    position: relative;
    top: 0;
  }

  .info-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .info-label {
    font-weight: 700;
  }
}

/* Responsive - mobile */
@media (max-width: 768px) {
  .user-profile-page {
    padding: 1rem;
  }

  .profile-photo,
  .profile-avatar {
    width: 120px !important;
    height: 120px !important;
  }

  .profile-avatar {
    font-size: 2.5rem !important;
  }

  .profile-name {
    font-size: 1.5rem;
  }
}
</style>
