<script setup>
import { logger } from '@/utils/logger'
import { useLayout } from '@/components/layout/composables/layout'
import Badge from 'primevue/badge'
import Avatar from 'primevue/avatar'
// Lazy load AppConfigurator - only shown when theme settings are opened
import { defineAsyncComponent } from 'vue'
const AppConfigurator = defineAsyncComponent(() => import('./AppConfigurator.vue'))
// Lazy load ProfileMenu - only shown when profile is clicked
const ProfileMenu = defineAsyncComponent(() => import('./Profile.vue'))
// Lazy load NotificationCenter - only shown when notifications are opened
const NotificationCenter = defineAsyncComponent(() => import('@/components/NotificationCenter.vue'))
// Lazy load AgentStatusPanel - only shown when agents button is clicked
const AgentStatusPanel = defineAsyncComponent(() => import('@/components/AgentStatusPanel.vue'))
// Keep LogoDisplay and LanguageSwitcher as sync - they're always visible and small
import LogoDisplay from '@/components/LogoDisplay.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useNotifications } from '@/composables/notifications'
import { useWorkspaceAgentStore } from '@/stores/workspaceAgentStore'
import { useI18n } from 'vue-i18n'
import { onMounted, ref, watch, computed, nextTick } from 'vue'

const { t } = useI18n()
const { toggleMenu, toggleDarkMode, isDarkTheme } = useLayout()
const { unreadCount } = useNotifications()

// Safely access workspaceAgentStore - handle case where Pinia might not be ready yet (Issue #5216)
let workspaceAgentStore
try {
  workspaceAgentStore = useWorkspaceAgentStore()
} catch (error) {
  console.warn('[AppTopbar] Pinia not ready, deferring workspaceAgentStore access:', error.message)
  workspaceAgentStore = null
}

const profileOverlay = ref() // Template ref for ProfileMenu component (Popover)
const notificationVisible = ref(false)
const agentPanelVisible = ref(false)
const configuratorVisible = ref(false)
const userPhoto = ref(localStorage.getItem('currentUserPhoto') || '')

const emit = defineEmits(['chat-toggle'])

// Agent-related computed
const runningAgentsCount = computed(() => workspaceAgentStore?.runningAgentsCount || 0)
const hasActiveAgents = computed(() => workspaceAgentStore?.hasActiveAgents || false)

const toggleNotifications = () => {
  notificationVisible.value = !notificationVisible.value
}

const toggleAgentPanel = () => {
  agentPanelVisible.value = !agentPanelVisible.value
}

const toggleConfigurator = () => {
  configuratorVisible.value = !configuratorVisible.value
}

const isChatOpen = ref(localStorage.getItem('chat') === 'true')

const handleChat = () => {
  const currentState = localStorage.getItem('chat') === 'true'
  const newState = !currentState
  localStorage.setItem('chat', newState.toString())
  isChatOpen.value = newState
  logger.debug(newState)
  emit('chat-toggle', newState)
}

// Listen to storage changes from other tabs/windows
window.addEventListener('storage', (e) => {
  if (e.key === 'chat') {
    isChatOpen.value = e.newValue === 'true'
  }
})

// Profile toggle handler for Popover
const handleToggle = (event) => {
  if (profileOverlay.value && typeof profileOverlay.value.toggle === 'function') {
    profileOverlay.value.toggle(event)
  }
}

const updateFavicon = () => {
  const link = document.querySelector("link[rel*='icon']")
  if (link) {
    link.href = isDarkTheme.value ? '/app/meta/icon2.svg' : '/app/meta/icon1.svg?upd'
  }
}

// Computed properties for i18n
const themeTooltip = computed(() => {
  return isDarkTheme.value ? t('theme.light', 'Включить светлую') : t('theme.dark', 'Включить тёмную')
})

const themeSettingsTooltip = computed(() => {
  return t('theme.settings', 'Настройки темы')
})

const notificationsTooltip = computed(() => {
  return t('notifications.title', 'Уведомления')
})

const chatTooltip = computed(() => {
  return t('nav.chat', 'Чат')
})

const profileTooltip = computed(() => {
  return t('nav.profile', 'Профиль')
})

const agentsTooltip = computed(() => {
  const count = runningAgentsCount.value
  if (count === 0) {
    return t('agents.noRunning', 'Нет запущенных агентов')
  }
  return t('agents.running', 'Запущено агентов') + `: ${count}`
})

watch(isDarkTheme, updateFavicon)

// Listen for userPhoto updates from Profile.vue
const updateUserPhoto = () => {
  userPhoto.value = localStorage.getItem('currentUserPhoto') || ''
}

// Fetch user photo from API if not in localStorage
const fetchUserPhotoOnMount = async () => {
  const token = localStorage.getItem('my_token') || localStorage.getItem('token')
  const userId = localStorage.getItem('id')

  // Skip if no auth or photo already cached
  if (!token || !userId) return
  if (localStorage.getItem('currentUserPhoto')) {
    userPhoto.value = localStorage.getItem('currentUserPhoto')
    return
  }

  try {
    const response = await fetch(`/api/profile/${userId}`, {
      headers: { 'X-Authorization': token }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.photo) {
        userPhoto.value = data.data.photo
        localStorage.setItem(`userPhoto_${userId}`, data.data.photo)
        localStorage.setItem('currentUserPhoto', data.data.photo)
      }
    }
  } catch (error) {
    logger.debug('Failed to fetch user photo on mount:', error)
  }
}

onMounted(() => {
  updateFavicon()
  // NOTE: fetchUserPhotoOnMount() disabled - /api/profile endpoint doesn't exist in Integram
  // User photo is managed through Profile.vue and localStorage
  // fetchUserPhotoOnMount()

  // Listen for storage changes (when Profile.vue updates the photo)
  window.addEventListener('storage', (e) => {
    if (e.key === 'currentUserPhoto') {
      updateUserPhoto()
    }
  })
  // Also check periodically in case storage event doesn't fire (same tab)
  setInterval(updateUserPhoto, 3000)
})

</script>

<template>
  <div class="layout-topbar">
    <div class="layout-topbar-logo-container">
      <button
        class="layout-menu-button layout-topbar-action"
        @click="toggleMenu"
      >
        <i class="pi pi-bars"/>
      </button>
      <router-link to="/" class="layout-topbar-logo">
        <LogoDisplay width="200" height="40" />
      </router-link>
    </div>

    <div class="layout-topbar-actions">
      <div class="layout-config-menu">
        <LanguageSwitcher />

        <!-- Agents Button with Counter -->
        <button
          type="button"
          class="layout-topbar-action relative"
          @click="toggleAgentPanel"
          :title="agentsTooltip"
        >
          <i class="pi pi-bolt" :class="{ 'agent-active': hasActiveAgents }"></i>
          <Badge
            v-if="runningAgentsCount > 0"
            :value="runningAgentsCount > 99 ? '99+' : runningAgentsCount.toString()"
            :severity="hasActiveAgents ? 'success' : 'secondary'"
            class="agent-badge-topbar"
          />
        </button>

        <button
          type="button"
          class="layout-topbar-action"
          @click="toggleDarkMode"
          :title="themeTooltip"
        >
          <i
            :class="['pi', { 'pi-moon': isDarkTheme, 'pi-sun': !isDarkTheme }]"
          ></i>
        </button>

        <button
          type="button"
          class="layout-topbar-action layout-topbar-action-highlight"
          @click="toggleConfigurator"
          :title="themeSettingsTooltip"
        >
          <i class="pi pi-palette"></i>
        </button>
      </div>

      <button
        class="layout-topbar-menu-button layout-topbar-action"
        v-styleclass="{
          selector: '@next',
          enterFromClass: 'hidden',
          enterActiveClass: 'animate-scalein',
          leaveToClass: 'hidden',
          leaveActiveClass: 'animate-fadeout',
          hideOnOutsideClick: true,
        }"
        
      >
        <i class="pi pi-ellipsis-v"/>
      </button>

      <div class="layout-topbar-menu hidden lg:block">
        <div class="layout-topbar-menu-content">
          <button
            @click="toggleNotifications"
            type="button"
            class="layout-topbar-action relative"
            :title="notificationsTooltip"
          >
            <i class="pi pi-bell"/>
            <Badge
              v-if="unreadCount > 0"
              :value="unreadCount > 99 ? '99+' : unreadCount.toString()"
              severity="danger"
              class="notification-badge-topbar"
            />
            <span>{{ $t('notifications.title', 'Уведомления') }}</span>
          </button>
          <button
            @click="handleChat"
            type="button"
            class="layout-topbar-action"
            :class="{ 'active': isChatOpen }"
            :title="chatTooltip"
          >
            <i class="pi pi-comments"/>
            <span>{{ $t('nav.chat', 'Чат') }}</span>
          </button>
          <button
            @click="handleToggle($event)"
            type="button"
            class="layout-topbar-action"
            :title="profileTooltip"
          >
            <Avatar
              v-if="userPhoto"
              :image="userPhoto"
              shape="circle"
              class="topbar-avatar"
            />
            <i v-else class="pi pi-user" />
            <span>{{ $t('nav.profile', 'Профиль') }}</span>
          </button>
        </div>
      </div>
    </div>
    <ProfileMenu ref="profileOverlay" />
    <NotificationCenter
      v-model:visible="notificationVisible"
      @close="notificationVisible = false"
    />
    <AgentStatusPanel
      v-model:visible="agentPanelVisible"
      @close="agentPanelVisible = false"
    />
    <AppConfigurator
      v-model:visible="configuratorVisible"
      @close="configuratorVisible = false"
    />
  </div>
</template>
<style scoped>
.layout-topbar .layout-topbar-logo svg {
  width: 10rem;
  position: relative;
}

.notification-badge-topbar,
.agent-badge-topbar {
  position: absolute !important;
  top: 0 !important;
  right: -0.1rem !important;
  min-width: 0.85rem !important;
  height: 0.85rem !important;
  padding: 0 0.2rem !important;
  font-size: 0.6rem !important;
  font-weight: 700 !important;
  z-index: 10;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
}

.agent-active {
  color: var(--p-green-500);
  animation: agent-pulse 2s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/*
.pulsing-path {
  animation: pulse 1s infinite ease-in-out;
  transform-origin: center;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}*/

.topbar-avatar {
  width: 1.5rem;
  height: 1.5rem;
}

.topbar-avatar :deep(img) {
  object-fit: cover;
  width: 100%;
  height: 100%;
}
</style>
