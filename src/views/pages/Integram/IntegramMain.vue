<template>
  <div class="integram-main">
    <!-- Modern PrimeVue Navigation Bar -->
    <Menubar :model="menuItems" class="integram-menubar">
      <template #start>
        <router-link :to="`/integram/${database}`" class="integram-brand flex align-items-center gap-2 mr-3 no-underline">
          <svg width="32" height="27" viewBox="0 0 40 34" fill="none" xmlns="http://www.w3.org/2000/svg" class="integram-logo">
            <g clip-path="url(#clip0_integram)">
              <path d="M21.0983 12.4256L19.5194 14.1254L22.2153 17.0289L13.4346 26.3889L2.28812 22.7817V11.2779L13.4346 7.67068L15.452 9.87038L17.0454 8.19038L14.1005 5L0 9.56361V24.4959L14.1005 29.0595L25.3877 17.0289L21.0983 12.4256Z" fill="currentColor"/>
              <path d="M15.4718 21.634L17.0489 19.9341L14.3548 17.0307L23.1356 7.67068L34.2802 11.2779V22.7817L23.1356 26.3889L21.1127 24.1838L19.5193 25.8656L22.4679 29.0595L36.5683 24.4977V9.56361L22.4679 5L11.1807 17.0307L15.4718 21.634Z" fill="currentColor"/>
            </g>
            <defs>
              <clipPath id="clip0_integram">
                <rect width="36.6316" height="24" fill="white" transform="translate(0 5)"/>
              </clipPath>
            </defs>
          </svg>
        </router-link>
      </template>
      <template #end>
        <div class="flex align-items-center gap-2">
          <!-- Issue #5112: Database Selector -->
          <Dropdown
            v-model="selectedDatabase"
            :options="availableDatabases"
            optionLabel="label"
            optionValue="value"
            placeholder="БД"
            @change="handleDatabaseChange"
            class="database-selector"
          >
            <template #value="slotProps">
              <div v-if="slotProps.value" class="flex align-items-center gap-2">
                <i class="pi pi-database"></i>
                <span>{{ slotProps.value }}</span>
              </div>
              <span v-else>БД</span>
            </template>
            <template #option="slotProps">
              <div class="flex align-items-center gap-2">
                <i :class="slotProps.option.icon"></i>
                <span>{{ slotProps.option.label }}</span>
                <Tag v-if="slotProps.option.isPrimary" severity="success" value="Primary" size="small" />
                <Tag v-else-if="slotProps.option.isOwned" severity="info" value="Owned" size="small" />
              </div>
            </template>
          </Dropdown>

          <Button
            icon="pi pi-question-circle"
            text
            rounded
            @click="openHelp"
            severity="secondary"
            v-tooltip.bottom="t('help')"
            aria-label="Помощь"
          />
          <Button
            icon="pi pi-user"
            text
            rounded
            @click="toggleUserMenu"
            severity="secondary"
            v-tooltip.bottom="userName"
          />
          <Menu ref="userMenu" :model="userMenuItems" popup />
        </div>
      </template>
    </Menubar>

    <!-- Main Content -->
    <!-- Issue #5112: Add key to force component reload when database changes -->
    <div class="content" :class="{ 'content-loading': shouldShowSwitchingOverlay }">
      <!-- Loading overlay when switching database (not shown on home page) -->
      <div v-if="shouldShowSwitchingOverlay" class="database-switch-overlay">
        <div class="switch-spinner-container">
          <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
          <p class="mt-3 text-lg font-semibold">Переключение БД...</p>
        </div>
      </div>
      <SafeRouterView :key="database" />
    </div>

    <!-- Password Change Modal -->
    <Dialog
      v-model:visible="passwordChangeVisible"
      :header="t('passwordChange')"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="p-fluid">
        <Message v-if="passwordMessage" :severity="passwordMessageSeverity">
          {{ passwordMessage }}
        </Message>

        <div class="field">
          <label for="old-pwd">{{ t('currentPassword') }}</label>
          <Password
            id="old-pwd"
            v-model="oldPassword"
            :feedback="false"
            toggleMask
            @keyup.enter="changePassword"
          />
        </div>

        <div class="field">
          <label for="new-pwd">{{ t('newPassword') }}</label>
          <Password
            id="new-pwd"
            v-model="newPassword"
            toggleMask
            @keyup.enter="changePassword"
          />
        </div>

        <div class="field">
          <label for="new-again">{{ t('repeatPassword') }}</label>
          <Password
            id="new-again"
            v-model="newPasswordRepeat"
            :feedback="false"
            toggleMask
            @keyup.enter="changePassword"
          />
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('cancel')"
          icon="pi pi-times"
          @click="passwordChangeVisible = false"
          text
        />
        <Button
          :label="t('change')"
          icon="pi pi-check"
          @click="changePassword"
          :loading="passwordChanging"
        />
      </template>
    </Dialog>

    <!-- Footer -->
    <div class="footer text-center py-3">
      <small class="text-muted">Integram v{{ version }}</small>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import integramApiClient from '@/services/integramApiClient'
import SafeRouterView from '@/components/SafeRouterView.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Refs
const userMenu = ref()
const selectedDatabase = ref(null)
const switchingDatabase = ref(false)
const passwordChangeVisible = ref(false)
const passwordChanging = ref(false)
const passwordMessage = ref('')
const passwordMessageSeverity = ref('info')
const oldPassword = ref('')
const newPassword = ref('')
const newPasswordRepeat = ref('')
const locale = ref('ru')
const version = ref('1.0.0')

// Computed
const database = computed(() => {
  const db = route.params.database || integramApiClient.currentDatabase || integramApiClient.getDatabase() || 'my'
  console.log('[IntegramMain] database computed:', db, 'route.params:', route.params)
  return db
})
const userName = computed(() => integramApiClient.getAuthInfo().userName || 'User')

// Check if we should show switching overlay (NOT on database home page)
const shouldShowSwitchingOverlay = computed(() => {
  // Don't show on /integram/{db}/ (home page)
  const isHomePage = route.path === `/integram/${database.value}/` || route.path === `/integram/${database.value}`
  return switchingDatabase.value && !isHomePage
})

// Issue #5112: Available databases for selector
const availableDatabases = computed(() => {
  const databases = []

  // Add authenticated databases
  for (const [dbName, dbSession] of Object.entries(integramApiClient.databases)) {
    databases.push({
      value: dbName,
      label: dbName,
      icon: 'pi pi-database',
      isPrimary: dbName === 'my',
      isOwned: false
    })
  }

  // Add owned databases (from 'my' auth) that are not yet authenticated
  const mySession = integramApiClient.databases['my']
  if (mySession?.ownedDatabases) {
    for (const dbName of mySession.ownedDatabases) {
      if (!integramApiClient.databases[dbName]) {
        databases.push({
          value: dbName,
          label: dbName, // Removed "(owned)" - Tag shows this
          icon: 'pi pi-th-large',
          isPrimary: false,
          isOwned: true
        })
      }
    }
  }

  // Sort: 'my' first, then alphabetical
  return databases.sort((a, b) => {
    if (a.value === 'my') return -1
    if (b.value === 'my') return 1
    return a.value.localeCompare(b.value)
  })
})

// Base menu items configuration (legacy naming from main.html)
const baseMenuItems = [
  { href: 'dict', icon: 'pi pi-database', ruName: 'Объекты', enName: 'Objects' },
  { href: 'table', icon: 'pi pi-table', ruName: 'Таблицы', enName: 'Tables' },
  { href: 'edit_types', icon: 'pi pi-sitemap', ruName: 'Структура', enName: 'Structure' },
  { href: 'sql', icon: 'pi pi-code', ruName: 'SQL', enName: 'SQL' },
  { href: 'smartq', icon: 'pi pi-search', ruName: 'Умный запрос', enName: 'Smart Query' },
  { href: 'report', icon: 'pi pi-chart-bar', ruName: 'Запросы', enName: 'Queries' },
  { href: 'form', icon: 'pi pi-file', ruName: 'Формы', enName: 'Forms' },
  { href: 'myform', icon: 'pi pi-sliders-h', ruName: 'Мои формы', enName: 'My Forms' },
  { href: 'upload', icon: 'pi pi-upload', ruName: 'Загрузка', enName: 'Upload' },
  { href: 'dir_admin', icon: 'pi pi-folder', ruName: 'Файлы', enName: 'Files' },
  { href: 'info', icon: 'pi pi-info-circle', ruName: 'Информация', enName: 'Info' }
]

// Menu items for PrimeVue Menubar
// Issue #5112: Use database from route params
const menuItems = computed(() => {
  const currentDB = database.value
  console.log('[IntegramMain] menuItems computed, currentDB:', currentDB)
  return baseMenuItems.map(item => ({
    label: locale.value === 'ru' ? item.ruName : item.enName,
    icon: item.icon,
    command: () => {
      const url = `/integram/${currentDB}/${item.href}`
      console.log('[IntegramMain] Menu item clicked:', item.ruName, 'URL:', url, 'currentDB:', currentDB)
      router.push(url)
    }
  }))
})

// User menu items
const userMenuItems = computed(() => [
  {
    label: t('help'),
    icon: 'pi pi-question-circle',
    command: openHelp
  },
  {
    label: t('myAccount'),
    icon: 'pi pi-user',
    command: () => window.open(`/my?login=${database.value}`, '_blank')
  },
  {
    separator: true
  },
  {
    label: 'EN/RU',
    icon: 'pi pi-globe',
    command: toggleLocale
  },
  {
    label: t('changePassword'),
    icon: 'pi pi-key',
    command: showPasswordChange
  },
  {
    separator: true
  },
  {
    label: t('exit'),
    icon: 'pi pi-sign-out',
    command: logout,
    class: 'text-red-500'
  }
])

// Translations (matching main.html t9n tags)
function t(key) {
  const translations = {
    ru: {
      help: 'Помощь',
      myAccount: 'ЛК / Счет',
      changePassword: 'Сменить пароль',
      exit: 'Выход',
      passwordChange: 'Смена пароля',
      currentPassword: 'Действующий пароль',
      newPassword: 'Новый пароль',
      repeatPassword: 'Повторите пароль',
      change: 'Сменить',
      cancel: 'Отменить',
      fillAllFields: 'Заполните все поля',
      passwordsDoNotMatch: 'Пароли не совпадают',
      passwordChanged: 'Пароль успешно изменён',
      wrongPassword: 'Неверный пароль',
      more: 'Еще'
    },
    en: {
      help: 'Help',
      myAccount: 'My account',
      changePassword: 'Change Password',
      exit: 'Exit',
      passwordChange: 'Password Change',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      repeatPassword: 'Repeat Password',
      change: 'Change',
      cancel: 'Cancel',
      fillAllFields: 'Please fill in all fields',
      passwordsDoNotMatch: 'Passwords do not match',
      passwordChanged: 'Password changed successfully',
      wrongPassword: 'Wrong password',
      more: 'More'
    }
  }

  return translations[locale.value]?.[key] || key
}

// Methods
function toggleUserMenu(event) {
  userMenu.value.toggle(event)
}

function openHelp() {
  router.push('/integram/api-docs')
}

function showPasswordChange() {
  passwordChangeVisible.value = true
  oldPassword.value = ''
  newPassword.value = ''
  newPasswordRepeat.value = ''
  passwordMessage.value = ''
}

async function changePassword() {
  // Validate
  if (!oldPassword.value || !newPassword.value || !newPasswordRepeat.value) {
    passwordMessage.value = t('fillAllFields')
    passwordMessageSeverity.value = 'error'
    return
  }

  if (newPassword.value !== newPasswordRepeat.value) {
    passwordMessage.value = t('passwordsDoNotMatch')
    passwordMessageSeverity.value = 'error'
    return
  }

  passwordChanging.value = true
  passwordMessage.value = ''

  try {
    // Call Integram API to change password
    const response = await integramApiClient.post('auth?JSON', {
      change: 1,
      login: integramApiClient.getAuthInfo().userName,
      pwd: oldPassword.value,
      npw1: newPassword.value,
      npw2: newPasswordRepeat.value
    })

    if (response.msg && !response.msg.includes('[err')) {
      passwordMessage.value = t('passwordChanged')
      passwordMessageSeverity.value = 'success'

      // Update tokens if provided
      if (response.token) {
        integramApiClient.token = response.token
      }
      if (response.xsrf) {
        integramApiClient.xsrfToken = response.xsrf
      }

      // Save updated session
      integramApiClient.saveSession()

      // Close modal after success
      setTimeout(() => {
        passwordChangeVisible.value = false
        oldPassword.value = ''
        newPassword.value = ''
        newPasswordRepeat.value = ''
      }, 2000)
    } else {
      const errorMsg = response.msg ? response.msg.replace(/ ?\[.+\]/, '') : t('wrongPassword')
      passwordMessage.value = errorMsg
      passwordMessageSeverity.value = 'error'
    }
  } catch (error) {
    passwordMessage.value = error.message || t('wrongPassword')
    passwordMessageSeverity.value = 'error'
  } finally {
    passwordChanging.value = false
  }
}

function toggleLocale() {
  locale.value = locale.value === 'ru' ? 'en' : 'ru'
  // Save to localStorage
  localStorage.setItem('integram_locale', locale.value)
  // Update cookie for backend
  document.cookie = `${database.value}_locale=${locale.value};Path=/`
}

// Issue #5112: Handle database change from dropdown
async function handleDatabaseChange(event) {
  const newDatabase = event.value
  const oldDatabase = route.params.database // Use route.params, not database.value!

  switchingDatabase.value = true

  // Show loading toast
  toast.add({
    severity: 'info',
    summary: 'Переключение БД',
    detail: `Переход на "${newDatabase}"...`,
    life: 2000
  })

  try {
    await integramApiClient.switchDatabase(newDatabase)

    // Issue #5112: Always redirect to database home page when switching databases
    // This ensures components reload with correct data for the new database
    // and avoids issues with resources (tables, objects) that may not exist in the new DB
    const newPath = `/integram/${newDatabase}/`

    console.log('[handleDatabaseChange] Switching from', oldDatabase, 'to', newDatabase, 'redirecting to:', newPath)

    // Navigate and wait for completion
    await router.push(newPath)

    // Reset loading state after navigation completes
    switchingDatabase.value = false
  } catch (error) {
    console.error('Failed to switch database:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
    // Revert selection
    selectedDatabase.value = oldDatabase
    switchingDatabase.value = false
  }
}

function logout() {
  integramApiClient.logout()
  document.cookie = `${database.value}=;Path=/`
  router.push('/integram/login')
}

// Issue #5112: Watch route params to sync dropdown selection
watch(() => route.params.database, async (newDb) => {
  if (newDb && newDb !== selectedDatabase.value) {
    selectedDatabase.value = newDb
    try {
      await integramApiClient.switchDatabase(newDb)
    } catch (error) {
      console.warn('Failed to switch database from route change:', error)
    }
  }
}, { immediate: true })

// Lifecycle
onMounted(async () => {
  // Issue #5100: Try to restore session before checking auth
  integramApiClient.tryRestoreSession()

  // Issue #4168: Check Integram authentication (independent from main site auth)
  const authInfo = integramApiClient.getAuthInfo()
  if (!authInfo.token || !authInfo.xsrf) {
    // Not authenticated with Integram - redirect to Integram login
    // Save the current path to redirect back after login
    const currentPath = route.fullPath
    if (currentPath !== '/integram' && currentPath !== '/integram/') {
      router.push(`/integram/login?redirect=${encodeURIComponent(currentPath)}`)
    } else {
      router.push('/integram/login')
    }
    return
  }

  // Issue #5100: Validate session to refresh tokens and prevent quick expiration
  try {
    await integramApiClient.validateSession()
  } catch (e) {
    console.warn('Session validation skipped:', e.message)
  }

  // Load locale from localStorage - default to ru if not set
  const savedLocale = localStorage.getItem('integram_locale')
  if (savedLocale) {
    // Normalize to lowercase for consistency
    locale.value = savedLocale.toLowerCase()
  } else {
    // Issue #5100: Default to ru if no saved locale
    locale.value = 'ru'
    localStorage.setItem('integram_locale', 'ru')
  }
})
</script>

<style scoped>
.integram-main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.integram-menubar {
  position: sticky;
  top: 0;
  z-index: 1000;
}

.integram-brand {
  text-decoration: none !important;
  transition: opacity 0.2s;
  align-items: center;
}

.integram-brand:hover {
  opacity: 0.8;
}

.integram-logo {
  color: var(--p-primary-color, var(--primary-color));
  flex-shrink: 0;
}

.content {
  flex: 1;
  padding: 1rem;
  min-height: calc(100vh - 150px);
  position: relative;
}

.content-loading {
  pointer-events: none;
  opacity: 0.6;
}

/* Database switch overlay */
.database-switch-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.switch-spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.footer {
  background-color: var(--surface-100);
  border-top: 1px solid var(--surface-border);
  margin-top: auto;
  padding: 1rem;
}

.text-muted {
  color: var(--text-color-secondary);
}
</style>
