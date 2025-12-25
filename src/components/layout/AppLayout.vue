<script setup>
import { useLayout } from '@/layout/composables/layout'
import { computed, ref, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import AppFooter from './AppFooter.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
// Lazy load Chat component - it's 2097 lines and significantly impacts page load
const Chat = defineAsyncComponent(() => import('./Chat.vue'))
// Lazy load ReleaseNotesModal - not needed on initial page load
const ReleaseNotesModal = defineAsyncComponent(() => import('@/components/ReleaseNotesModal.vue'))
// Import CookieConsentBanner normally to avoid dynamic import issues
import CookieConsentBanner from '@/components/legal/CookieConsentBanner.vue'
import packageJson from '../../package.json'

import SafeRouterView from '@/components/SafeRouterView.vue'

const route = useRoute()
const { layoutConfig, layoutState, isSidebarActive } = useLayout()

// Safe route key to prevent "Cannot read properties of undefined (reading 'fullPath')"
const safeRouteKey = computed(() => route?.fullPath || '/')

const outsideClickListener = ref(null)
const isChatActive = ref(false)
const chatWidth = ref(parseInt(localStorage.getItem('chatWidth')) || 320)
const showReleaseNotes = ref(false)

// Инициализация состояния чата
const chatWidthInterval = ref(null)
const storageHandler = ref(null)

// Функция для определения мобильного устройства
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 960 // Соответствует медиа-запросу в Chat.vue
}

onMounted(() => {
  const chatState = window.localStorage.getItem('chat')

  // Если состояние чата не сохранено, используем дефолтное значение
  // На мобильных устройствах чат свёрнут по умолчанию, на десктопе - открыт
  if (chatState === null) {
    isChatActive.value = !isMobileDevice()
    window.localStorage.setItem('chat', JSON.stringify(isChatActive.value))
  } else {
    isChatActive.value = JSON.parse(chatState)
  }

  // Store handler reference for proper cleanup
  storageHandler.value = (e) => {
    if (e.key === 'chat') {
      isChatActive.value = e.newValue ? JSON.parse(e.newValue) : false
    }
    if (e.key === 'chatWidth') {
      chatWidth.value = parseInt(e.newValue) || 320
    }
  }
  window.addEventListener('storage', storageHandler.value)

  chatWidthInterval.value = setInterval(() => {
    const storedWidth = parseInt(localStorage.getItem('chatWidth')) || 320
    if (storedWidth !== chatWidth.value) {
      chatWidth.value = storedWidth
    }
  }, 100)

  // Auto-show release notes on first load or version change
  // Check if user has already seen the current version
  setTimeout(() => {
    const currentVersion = packageJson.version
    const lastSeenVersion = localStorage.getItem('lastSeenVersion')

    // Only show if user hasn't seen this version yet
    if (!lastSeenVersion || lastSeenVersion !== currentVersion) {
      showReleaseNotes.value = true
    }
  }, 1000)
})

onUnmounted(() => {
  if (chatWidthInterval.value) {
    clearInterval(chatWidthInterval.value)
  }
  if (storageHandler.value) {
    window.removeEventListener('storage', storageHandler.value)
  }
})

watch(isSidebarActive, newVal => {
  if (newVal) bindOutsideClickListener()
  else unbindOutsideClickListener()
})

const containerClass = computed(() => {
  return {
    'layout-overlay': layoutConfig.menuMode === 'overlay',
    'layout-static': layoutConfig.menuMode === 'static',
    'layout-static-inactive':
      layoutState.staticMenuDesktopInactive &&
      layoutConfig.menuMode === 'static',
    'layout-overlay-active': layoutState.overlayMenuActive,
    'layout-mobile-active': layoutState.staticMenuMobileActive,
    'chat-active': isChatActive.value && layoutConfig.menuMode === 'static',
    'sidebar-collapsed': layoutState.sidebarCollapsed,
  }
})

function bindOutsideClickListener() {
  if (!outsideClickListener.value) {
    outsideClickListener.value = event => {
      if (isOutsideClicked(event)) {
        layoutState.overlayMenuActive = false
        layoutState.staticMenuMobileActive = false
        layoutState.menuHoverActive = false
      }
    }
    document.addEventListener('click', outsideClickListener.value)
  }
}

function unbindOutsideClickListener() {
  if (outsideClickListener.value) {
    document.removeEventListener('click', outsideClickListener.value)
    outsideClickListener.value = null
  }
}

function isOutsideClicked(event) {
  const sidebarEl = document.querySelector('.layout-sidebar')
  const topbarEl = document.querySelector('.layout-menu-button')

  return !(
    sidebarEl.isSameNode(event.target) ||
    sidebarEl.contains(event.target) ||
    topbarEl.isSameNode(event.target) ||
    topbarEl.contains(event.target)
  )
}

// Функция для обновления состояния чата
const updateChatState = (newState) => {
  isChatActive.value = newState
  window.localStorage.setItem('chat', JSON.stringify(newState))
}

const chatMargin = computed(() => {
  const marginInRem = (chatWidth.value + 32 + 32) / 16
  return `${marginInRem}rem`
})
</script>

<template>
  <div class="layout-wrapper" :class="containerClass">
    <app-topbar @chat-toggle="updateChatState" />
    <app-sidebar />
    <!-- Suspense boundary for lazy-loaded Chat component -->
    <Transition name="slide-in-right">
      <Suspense v-if="isChatActive">
        <Chat />
        <template #fallback>
          <div class="chat-loading"></div>
        </template>
      </Suspense>
    </Transition>
    <div class="layout-main-container" :style="isChatActive && layoutConfig.menuMode === 'static' ? { marginRight: chatMargin } : {}">
      <div class="layout-main">
        <SafeRouterView :key="safeRouteKey" />
      </div>
      <app-footer />
    </div>
    <div class="layout-mask animate-fadein"></div>
  </div>

  <Toast />
  <!-- Suspense boundaries for modals - they can load asynchronously -->
  <Suspense>
    <ReleaseNotesModal v-model:visible="showReleaseNotes" />
    <template #fallback><span></span></template>
  </Suspense>
  <!-- CookieConsentBanner is now a synchronous import -->
  <CookieConsentBanner />
</template>

<style>
.slide-in-right-enter-active,
.slide-in-right-leave-active {
  transition: transform 0.3s ease-out;
}

.slide-in-right-enter-from {
  transform: translateX(100%);
}

.slide-in-right-leave-to {
  transform: translateX(100%);
}

/* Loading placeholder for lazy-loaded Chat component */
.chat-loading {
  position: fixed;
  right: 0;
  top: 4rem;
  bottom: 0;
  width: 320px;
  background: var(--surface-ground);
  border-left: 1px solid var(--surface-border);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.chat-loading::after {
  content: '';
  width: 40px;
  height: 40px;
  border: 4px solid var(--primary-color);
  border-radius: 50%;
  border-top-color: transparent;
  animation: chat-spin 1s linear infinite;
}

@keyframes chat-spin {
  to { transform: rotate(360deg); }
}
</style>