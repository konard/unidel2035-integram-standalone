<template>
  <Popover
    ref="op"
    :dismissable="true"
    class="profile-overlay"
    :style="{ width: '350px' }"
    @show="onMenuShow"
    @hide="onMenuHide"
  >
    <ComponentLoader>
      <div class="profile-content">
        <!-- Шапка профиля -->
        <div class="profile-header p-4 flex align-items-center gap-3">
          <Avatar
            v-if="userPhoto"
            :image="userPhoto"
            size="xlarge"
            shape="circle"
            class="avatar-large"
          />
          <Avatar
            v-else
            icon="pi pi-user"
            size="xlarge"
            shape="circle"
            class="avatar-large"
          />
          <div>
            <h3 class="m-0">{{ user.name }}</h3>
            <span class="text-color-secondary">{{ user.role }}</span>
          </div>
        </div>

        <div class="profile-details p-4">
          <!-- Данные пользователя из userInfo -->
          <div
            v-for="(value, name) in userInfo"
            :key="name"
            class="mb-3 flex align-items-center"
          >
            <span class="field-name">
              <i :class="getIconForField(name)" class="field-key mr-3"></i>
              <span class="field-key">{{ name }}:</span>
              <span class="field-value">{{
                formatFieldValue(name, value)
              }}</span>
            </span>
          </div>
          <Divider />

          <!-- Отдельный блок для apiBase -->
          <div class="mb-3 flex align-items-center api-base-field">
            <span class="field-name">
              <i class="pi pi-server field-key mr-3"></i>
              <span class="field-key">API:</span>
              <span class="field-value">{{ apiBase }}</span>
            </span>
          </div>
          <div class="mb-3 flex align-items-center api-base-field">
            <span class="field-name">
              <i class="pi pi-database field-key mr-3"></i>
              <span class="field-key">База данных:</span>
              <span class="field-value">{{ dataBase }}</span>
            </span>
          </div>
        </div>

        <!-- Действия -->
        <div class="profile-actions p-4 flex flex-column gap-3">
          <Button
            label="Редактировать профиль"
            icon="pi pi-pencil"
            class="w-full"
            severity="secondary"
            outlined
            @click="editProfile"
          />
          <Button
            label="Выход"
            icon="pi pi-sign-out"
            class="w-full"
            severity="danger"
            outlined
            @click="logout"
          />
        </div>
      </div>
    </ComponentLoader>
  </Popover>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
// Issue #3790: Removed apiClient import - no longer making API calls for user data
import ComponentLoader from '@/components/ComponentLoader.vue'

const router = useRouter()
const op = ref()
const isMenuOpen = ref(false)
const user = ref({
  name: '',
  role: '',
  userId: null,
})
const userInfo = ref({})
const userPhoto = ref('')

// API Base и База данных из localStorage
const apiBase = computed(() => localStorage.getItem('apiBase') || 'не указан')
const dataBase = computed(() => localStorage.getItem('db') || 'не указана')

const fieldIcons = {
  Пользователь: 'pi pi-user',
  Имя: 'pi pi-user',
  Email: 'pi pi-envelope',
  Телефон: 'pi pi-phone',
  Роль: 'pi pi-briefcase',
  Дата: 'pi pi-calendar',
  Примечание: 'pi pi-file',
  Фото: 'pi pi-image',
  Activity: 'pi pi-clock',
  Secret: 'pi pi-eye-slash',
  Password: 'pi pi-lock',
  Token: 'pi pi-key',
  xsrf: 'pi pi-shield',
  Организация: 'pi pi-building',
  Токен: 'pi pi-wallet',
  Репутация: 'pi pi-star',
  Telegram: 'pi pi-send',
  'Шаблон задач': 'pi pi-list',
  'Задача игрока': 'pi pi-check-circle',
  'Субъект РФ': 'pi pi-map',
  Должность: 'pi pi-id-card',
  'API Base': 'pi pi-server', // Добавлена иконка для apiBase
}

const getIconForField = fieldName => {
  return fieldIcons[fieldName] || 'pi pi-info-circle'
}

const formatFieldValue = (fieldName, value) => {
  if (!value) return ''

  // Преобразование дат из формата YYYYMMDD или Unix timestamp
  if (fieldName === 'Дата' || fieldName === 'Activity') {
    return formatDate(value)
  }

  return value
}

const formatDate = dateValue => {
  try {
    // Проверяем, является ли значение Unix timestamp (секунды)
    if (dateValue.toString().length === 10) {
      return new Date(dateValue * 1000).toLocaleDateString('ru-RU')
    }

    // Проверяем, является ли значение Unix timestamp (миллисекунды)
    if (dateValue.toString().length === 13) {
      return new Date(dateValue).toLocaleDateString('ru-RU')
    }

    // Пробуем преобразовать из формата YYYYMMDD
    if (dateValue.toString().length === 8) {
      const dateStr = dateValue.toString()
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(4, 6)
      const day = dateStr.substring(6, 8)
      return new Date(`${year}-${month}-${day}`).toLocaleDateString('ru-RU')
    }

    // Если формат не распознан, возвращаем как есть
    return dateValue
  } catch (error) {
    console.error('Ошибка форматирования даты:', error)
    return dateValue
  }
}

// Issue #3848: Fetch user data from /{db}/xsrf endpoint
// This provides correct user ID and name for the current database
// User can have different ID/name depending on database (my vs a2025, etc.)
const fetchUserData = async () => {
  try {
    const authDb = localStorage.getItem('db') || 'a2025'
    const apiBase = localStorage.getItem('apiBase') || 'dronedoc.ru'
    const token = localStorage.getItem('token')

    if (!token) {
      user.value.name = 'Не авторизован'
      return
    }

    // Build URL: https://{server}/{db}/xsrf?JSON_KV
    const baseHost = apiBase === 'localhost' ? 'localhost' : apiBase
    const protocol = apiBase === 'localhost' ? 'http' : 'https'
    const url = `${protocol}://${baseHost}/${authDb}/xsrf?JSON_KV=true`

    // Issue #3848: Simplified header selection
    // Since we're requesting data from the SAME database we logged into (authDb),
    // we always use X-Authorization header (not 'my' header)
    // The 'my' header is only for kernel routing to OTHER databases
    const headers = {
      'X-Authorization': token
    }

    const response = await fetch(url, { headers })

    if (response.ok) {
      const data = await response.json()

      // Response format: { "_xsrf": "...", "token": "...", "user": "d", "role": "admin", "id": "195006", "msg": "" }
      user.value = {
        name: data.user || 'Не указан',
        role: data.role || '',
        userId: data.id || null,
      }

      // Store user info in localStorage for quick access
      localStorage.setItem('user', data.user || '')
      localStorage.setItem('id', data.id || '')

      // Populate userInfo with additional fields (Issue #4007: Don't show XSRF)
      userInfo.value = {
        'ID': data.id,
        'Роль': data.role,
      }

      // Fetch user photo from profile API
      if (data.id) {
        fetchUserPhoto(data.id)
      }
    } else {
      console.warn('Failed to fetch user data from xsrf endpoint:', response.status)
      // Fallback to localStorage
      user.value.name = localStorage.getItem('user') || 'Не авторизован'
      user.value.userId = localStorage.getItem('id')
    }
  } catch (error) {
    console.error('Error fetching user data:', error)
    // Fallback to localStorage
    user.value.name = localStorage.getItem('user') || 'Не авторизован'
    user.value.userId = localStorage.getItem('id')
  }
}

// Fetch user profile photo from backend API
const fetchUserPhoto = async (userId) => {
  try {
    const token = localStorage.getItem('my_token') || localStorage.getItem('token')
    if (!token || !userId) return

    const response = await fetch(`/api/profile/${userId}`, {
      headers: { 'X-Authorization': token }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.photo) {
        userPhoto.value = data.data.photo
        // Cache photo URL in localStorage with userId for multi-account support
        localStorage.setItem(`userPhoto_${userId}`, data.data.photo)
        localStorage.setItem('currentUserPhoto', data.data.photo)
      } else {
        // No photo - clear cache for this user
        userPhoto.value = ''
        localStorage.removeItem(`userPhoto_${userId}`)
        localStorage.removeItem('currentUserPhoto')
      }
    }
  } catch (error) {
    console.error('Error fetching user photo:', error)
  }
}

const onMenuShow = () => {
  isMenuOpen.value = true
  fetchUserData()
}

const onMenuHide = () => {
  isMenuOpen.value = false
}

const editProfile = () => {
  op.value.hide()
  router.push('/profile/edit')
}

const logout = () => {
  // Clear primary database credentials
  ;['_xsrf', 'token', 'user', 'id', 'db', 'apiBase'].forEach(key =>
    localStorage.removeItem(key),
  )

  // Clear 'my' database credentials (Issue #3730)
  ;['my_token', 'my_user', 'my_id', 'my_xsrf'].forEach(key =>
    localStorage.removeItem(key),
  )

  // Clear ddadmin credentials
  ;['ddadmin_token', 'ddadmin_user', 'ddadmin_id', 'ddadmin_xsrf'].forEach(key =>
    localStorage.removeItem(key),
  )

  // Clear session-related data
  localStorage.removeItem('integram_session')
  localStorage.removeItem('unified_auth_session_id')

  // Clear user photo cache (Issue #5139)
  const userId = localStorage.getItem('id')
  if (userId) {
    localStorage.removeItem(`userPhoto_${userId}`)
  }
  localStorage.removeItem('currentUserPhoto')

  op.value.hide()

  // Issue #3730: Redirect to main page instead of login page
  router.push('/')
}

defineExpose({
  toggle: event => op.value.toggle(event),
  hide: () => op.value.hide(),
})
</script>
<style scoped>
.profile-overlay {
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.profile-content {
  display: flex;
  flex-direction: column;
}

.profile-header {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.profile-header .text-color-secondary {
  color: var(--p-primary-contrast-color);
  opacity: 0.8;
}

.avatar-large {
  background-color: var(--p-primary-contrast-color) !important;
  color: var(--p-primary-color) !important;
}

.avatar-large :deep(img) {
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.detail-item i {
  color: var(--p-primary-color);
  font-size: 1.2rem;
}

.profile-actions button {
  justify-content: flex-start;
  padding-left: 1rem;
}

.field-name {
  display: flex;
  align-items: center;
  width: 100%;
}

/* Стили для разделения цвета ключа и значения */
.field-key {
  color: var(--text-color-secondary); /* Цвет для ключа (названия поля) */
  margin-right: 0.5rem;
  font-weight: 500;
}

.field-value {
  color: var(--text-color); /* Основной цвет текста для значения */
  word-break: break-all; /* Перенос длинных значений (как apiBase) */
}

/* Можно добавить отдельный стиль для apiBase, если нужно */
</style>
