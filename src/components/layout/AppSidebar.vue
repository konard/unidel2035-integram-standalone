<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useLayout } from './composables/layout'
import AppMenu from './AppMenu.vue'
import SmartSearchResults from '@/components/SmartSearchResults.vue'
import { debouncedSmartSearch } from '@/services/smartSearchService'
import { logger } from '@/utils/logger'

const route = useRoute()
const { layoutState, toggleSidebarCollapse } = useLayout()
const searchQuery = ref('')
const searchInputRef = ref(null)
const searchResults = ref(null)
const searchLoading = ref(false)
const menuModel = ref([])

const handleKeyDown = (e) => {
  // "/" to focus on search (like GitHub, YouTube)
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Don't trigger if already in an input
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      searchInputRef.value?.$el?.focus()
    }
  }

  // Esc to clear search
  if (e.key === 'Escape') {
    if (searchQuery.value) {
      searchQuery.value = ''
    }
  }

  // Arrow down to focus on first extra result (after menu)
  if (e.key === 'ArrowDown' && searchQuery.value && hasExtraResults.value) {
    e.preventDefault()
    const firstExtraResult = document.querySelector('.search-item')
    if (firstExtraResult) {
      firstExtraResult.focus()
    }
  }
}

// Perform smart search when query changes (for extra results only)
// flush: 'post' ensures DOM updates before search runs (prevents input lag)
watch(searchQuery, (newQuery) => {
  if (!newQuery || newQuery.trim() === '') {
    searchResults.value = null
    searchLoading.value = false
    return
  }

  // Delay loading indicator to avoid flicker on fast typing
  searchLoading.value = true

  // Call debounced search with callback (non-blocking)
  debouncedSmartSearch(
    newQuery,
    menuModel.value,
    {
      maxRoutesResults: 10,
      maxAgentsResults: 5,
      maxIntegrамResults: 10
    },
    (results) => {
      // Callback executed after debounce delay
      searchResults.value = results
      searchLoading.value = false
      logger.debug('Smart search results:', results)
    }
  )
}, { flush: 'post' })

// Clear search query when route changes
watch(() => route.path, () => {
  searchQuery.value = ''
})

// Clear search query when sidebar is expanded
watch(() => layoutState.sidebarCollapsed, (newVal, oldVal) => {
  // Clear search when sidebar is expanded (collapsed changes from true to false)
  if (oldVal === true && newVal === false) {
    searchQuery.value = ''
  }
}, { flush: 'post' })

const handleNavigate = () => {
  searchQuery.value = ''
}

// Check if there are extra search results (routes, agents, Integram, AI) to show
const hasExtraResults = computed(() => {
  if (!searchResults.value) return false
  return (
    searchResults.value.routes.length > 0 ||
    searchResults.value.agents.length > 0 ||
    searchResults.value.integrамResults.length > 0 ||
    searchResults.value.aiResults.length > 0
  )
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  // Clear search query on mount to ensure clean state
  searchQuery.value = ''
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
    <div class="layout-sidebar" :class="{ 'sidebar-collapsed': layoutState.sidebarCollapsed }">
        <div class="sidebar-header">
            <Button
                :icon="layoutState.sidebarCollapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'"
                @click="toggleSidebarCollapse"
                class="p-button-text p-button-rounded sidebar-toggle-btn"
                v-tooltip.right="layoutState.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
                aria-label="Переключить меню"
            />
        </div>
        <div class="sidebar-search p-3">
            <IconField iconPosition="left">
                <InputIcon class="pi pi-search" aria-hidden="true" />
                <InputText
                    ref="searchInputRef"
                    v-model="searchQuery"
                    placeholder="Поиск..."
                    class="w-full"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    role="searchbox"
                    aria-label="Поиск по меню и страницам"
                    aria-controls="smart-search-extras"
                />
            </IconField>
        </div>

        <!-- Menu (ALWAYS visible, filtered by search query) -->
        <div>
            <app-menu
                :search-query="searchQuery"
                :collapsed="layoutState.sidebarCollapsed"
                @menu-loaded="menuModel = $event"
            />
        </div>

        <!-- Smart Search Extras (routes, agents, Integram) - shown BELOW menu -->
        <div
            v-if="hasExtraResults && !layoutState.sidebarCollapsed"
            id="smart-search-extras"
            class="smart-search-extras"
        >
            <SmartSearchResults
                :results="searchResults"
                :query="searchQuery"
                :loading="searchLoading"
                @navigate="handleNavigate"
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.sidebar-header {
    display: flex;
    justify-content: flex-end;
    padding: 0.5rem;
}

.sidebar-toggle-btn {
    margin-left: auto;
}

.layout-sidebar {
    transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: width;
}

.layout-sidebar.sidebar-collapsed {
    width: 5rem !important;

    .sidebar-header {
        justify-content: center;
    }
}

.sidebar-search {
    position: relative;
    transition: opacity 0.2s ease;
    opacity: 1;
}

.layout-sidebar.sidebar-collapsed .sidebar-search {
    opacity: 0;
    pointer-events: none;
}

/* Smart search extras - shown BELOW menu */
.smart-search-extras {
    padding: 0.5rem 1rem;
    margin-top: 0.5rem;
    border-top: 1px solid var(--surface-border);
    animation: fadeInUp 0.15s ease-out;
}

/* Fast fade-in animation */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(5px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
