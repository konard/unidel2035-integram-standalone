<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const props = defineProps({
  database: {
    type: String,
    default: 'my'
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-collapse'])

// Состояние сайдбара
const isCollapsed = ref(props.collapsed)
const isMobile = ref(false)

// Проверка мобильного устройства
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 960
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // Восстановить состояние из localStorage
  const savedState = localStorage.getItem('integram_sidebar_collapsed')
  if (savedState !== null) {
    isCollapsed.value = savedState === 'true'
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// Сохранение состояния
watch(isCollapsed, (newVal) => {
  localStorage.setItem('integram_sidebar_collapsed', String(newVal))
  emit('toggle-collapse', newVal)
})

// Пункты меню Integram
const menuItems = computed(() => [
  { href: 'dict', icon: 'pi pi-database', label: 'Объекты' },
  { href: 'table', icon: 'pi pi-table', label: 'Таблицы' },
  { href: 'edit_types', icon: 'pi pi-sitemap', label: 'Структура' },
  { href: 'sql', icon: 'pi pi-code', label: 'SQL' },
  { href: 'smartq', icon: 'pi pi-search', label: 'Умный запрос' },
  { href: 'report', icon: 'pi pi-chart-bar', label: 'Запросы' },
  { href: 'form', icon: 'pi pi-file', label: 'Формы' },
  { href: 'myform', icon: 'pi pi-sliders-h', label: 'Мои формы' },
  { href: 'upload', icon: 'pi pi-upload', label: 'Загрузка' },
  { href: 'dir_admin', icon: 'pi pi-folder', label: 'Файлы' },
  { href: 'info', icon: 'pi pi-info-circle', label: 'Информация' }
])

// Проверка активного пункта меню
const isActive = (href) => {
  const currentPath = route.path
  const menuPath = `/integram/${props.database}/${href}`
  return currentPath === menuPath || currentPath.startsWith(menuPath + '/')
}

// Навигация
const navigateTo = (href) => {
  router.push(`/integram/${props.database}/${href}`)
  // На мобильных закрываем меню после клика
  if (isMobile.value) {
    isCollapsed.value = true
  }
}

// Переключение сворачивания
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <aside class="integram-sidebar" :class="{ 'sidebar-collapsed': isCollapsed, 'sidebar-mobile': isMobile }">
    <!-- Заголовок сайдбара -->
    <div class="sidebar-header">
      <Button
        :icon="isCollapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'"
        @click="toggleCollapse"
        class="p-button-text p-button-rounded sidebar-toggle-btn"
        v-tooltip.right="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        aria-label="Переключить меню"
      />
    </div>

    <!-- Меню -->
    <nav class="sidebar-menu">
      <ul role="menu">
        <li
          v-for="item in menuItems"
          :key="item.href"
          role="menuitem"
          class="menu-item"
          :class="{ 'active': isActive(item.href) }"
        >
          <a
            @click.prevent="navigateTo(item.href)"
            :title="isCollapsed ? item.label : undefined"
            class="menu-link"
          >
            <i :class="item.icon" class="menu-icon"></i>
            <span v-if="!isCollapsed" class="menu-label">{{ item.label }}</span>
          </a>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.integram-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 16rem;
  background: var(--surface-overlay);
  border-right: 1px solid var(--surface-border);
  z-index: 1001; /* Above menubar */
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.integram-sidebar.sidebar-collapsed {
  width: 4rem;
}

.sidebar-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.sidebar-collapsed .sidebar-header {
  justify-content: center;
}

.sidebar-toggle-btn {
  color: var(--text-color-secondary);
}

.sidebar-toggle-btn:hover {
  background: var(--surface-hover);
}

.sidebar-menu {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.sidebar-menu ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu-item {
  margin: 0.125rem 0.5rem;
}

.menu-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  color: var(--text-color);
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.menu-link:hover {
  background: var(--surface-hover);
  color: var(--primary-color);
}

.menu-item.active .menu-link {
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

.menu-item.active .menu-link:hover {
  background: var(--primary-600, var(--primary-color));
}

.menu-icon {
  font-size: 1.125rem;
  width: 1.25rem;
  text-align: center;
  flex-shrink: 0;
}

.menu-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Свернутое состояние */
.sidebar-collapsed .menu-link {
  justify-content: center;
  padding: 0.75rem;
}

.sidebar-collapsed .menu-icon {
  font-size: 1.25rem;
}

/* Мобильная версия */
@media screen and (max-width: 960px) {
  .integram-sidebar {
    transform: translateX(0);
  }

  .integram-sidebar.sidebar-collapsed {
    transform: translateX(-100%);
    width: 16rem;
  }
}
</style>
