<template>
  <div class="integram-landing-container">
    <!-- Hero Card -->
    <Card class="mb-4">
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-database text-primary" style="font-size: 1.5rem"></i>
          <span>{{ t('welcome') }} Integram</span>
        </div>
      </template>
      <template #subtitle>
        {{ t('subtitle') }}
      </template>
      <template #content>
        <div class="flex gap-2 flex-wrap">
          <Tag v-if="database" :value="database" icon="pi pi-database" severity="info" />
          <Tag v-if="userName" :value="userName" icon="pi pi-user" severity="success" />
        </div>
      </template>
    </Card>

    <!-- Quick Access Section -->
    <Card class="mb-4">
      <template #title>
        <div class="flex align-items-center gap-2">
          <span>{{ t('quickAccess') }}</span>
        </div>
      </template>
      <template #subtitle>{{ t('quickAccessDesc') }}</template>
      <template #content>
        <div class="grid">
          <div
            v-for="(item, index) in quickAccessItems"
            :key="index"
            class="col-12 md:col-6 lg:col-4 xl:col-3"
          >
            <div
              class="surface-card border-1 surface-border border-round p-3 h-full cursor-pointer hover:surface-hover transition-colors transition-duration-200"
              @click="navigate(item.path)"
            >
              <div class="flex align-items-center gap-3 mb-2">
                <div class="icon-box">
                  <i :class="item.icon"></i>
                </div>
                <span class="font-semibold text-900">{{ item.name }}</span>
              </div>
              <p class="text-600 text-sm m-0 line-height-3">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Features Section -->
    <Card class="mb-4">
      <template #title>
        <div class="flex align-items-center gap-2">
          <span>{{ t('features') }}</span>
        </div>
      </template>
      <template #subtitle>{{ t('featuresDesc') }}</template>
      <template #content>
        <div class="grid">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="col-12 md:col-6"
          >
            <div class="flex gap-3 align-items-start p-2">
              <div class="icon-box flex-shrink-0">
                <i :class="feature.icon"></i>
              </div>
              <div>
                <div class="font-semibold text-900 mb-1">{{ feature.title }}</div>
                <p class="text-600 text-sm m-0 line-height-3">{{ feature.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Statistics Section -->
    <Card v-if="stats">
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-chart-bar"></i>
          <span>{{ t('overview') }}</span>
        </div>
      </template>
      <template #content>
        <div class="grid">
          <div v-for="(stat, key) in stats" :key="key" class="col-6 md:col-3 text-center">
            <div class="text-3xl font-bold text-primary mb-1">{{ stat.value }}</div>
            <div class="text-600 text-sm">{{ stat.label }}</div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import integramApiClient from '@/services/integramApiClient'

const router = useRouter()
const route = useRoute()

// State
const locale = ref('ru')
const stats = ref(null)

// Computed
const database = computed(() => route.params.database || integramApiClient.getDatabase() || '')
const userName = computed(() => integramApiClient.getAuthInfo().userName || '')

// Translations
function t(key) {
  const translations = {
    ru: {
      welcome: 'Добро пожаловать в',
      subtitle: 'Универсальная система управления данными с мощными инструментами для работы с базами данных',
      quickAccess: 'Быстрый доступ',
      quickAccessDesc: 'Основные модули системы',
      features: 'Возможности системы',
      featuresDesc: 'Полный набор инструментов для работы с данными',
      overview: 'Обзор',
      open: 'Открыть',
      tables: 'Таблицы',
      tablesDesc: 'Управление таблицами и просмотр данных',
      newTables: 'Новые таблицы',
      newTablesDesc: 'Современный интерфейс DataTable с редактированием',
      types: 'Структура',
      typesDesc: 'Настройка структуры данных (DDL)',
      sql: 'SQL',
      sqlDesc: 'Выполнение SQL запросов к базе данных',
      smartQuery: 'Умный запрос',
      smartQueryDesc: 'Умные интерактивные таблицы с фильтрацией',
      reports: 'Запросы',
      reportsDesc: 'Создание и просмотр запросов',
      forms: 'Формы',
      formsDesc: 'Работа с пользовательскими формами',
      myforms: 'Мои формы',
      myformsDesc: 'Конструктор пользовательских форм',
      flexibleStructure: 'Гибкая структура',
      flexibleStructureDesc: 'Создавайте собственные типы данных и связи между ними',
      powerfulSQL: 'Мощный SQL',
      powerfulSQLDesc: 'Полный доступ к базе данных через SQL интерфейс',
      reportsAndForms: 'Запросы и формы',
      reportsAndFormsDesc: 'Настраиваемые формы ввода и шаблоны запросов',
      fileManagement: 'Управление файлами',
      fileManagementDesc: 'Загрузка и работа с файлами (Excel, CSV)',
      visualQueries: 'Визуальные запросы',
      visualQueriesDesc: 'Умные интерактивные таблицы с inline-редактированием',
      security: 'Безопасность',
      securityDesc: 'Система прав доступа и ролей пользователей'
    },
    en: {
      welcome: 'Welcome to',
      subtitle: 'Universal Data Management System with powerful database tools',
      quickAccess: 'Quick Access',
      quickAccessDesc: 'Main system modules',
      features: 'System Features',
      featuresDesc: 'Complete toolkit for data management',
      overview: 'Overview',
      open: 'Open',
      tables: 'Tables',
      tablesDesc: 'Manage dictionaries and view data',
      newTables: 'New Tables',
      newTablesDesc: 'Modern DataTable interface with inline editing',
      types: 'Type Editor',
      typesDesc: 'Configure data structure (DDL)',
      sql: 'SQL Editor',
      sqlDesc: 'Execute database queries',
      smartQuery: 'SmartQ',
      smartQueryDesc: 'Smart interactive tables with filtering',
      reports: 'Reports',
      reportsDesc: 'Create and view reports',
      forms: 'Forms',
      formsDesc: 'Work with custom forms',
      myforms: 'My Forms',
      myformsDesc: 'Custom form builder',
      flexibleStructure: 'Flexible Structure',
      flexibleStructureDesc: 'Create your own data types and relationships',
      powerfulSQL: 'Powerful SQL',
      powerfulSQLDesc: 'Full database access through SQL interface',
      reportsAndForms: 'Reports & Forms',
      reportsAndFormsDesc: 'Customizable input forms and report templates',
      fileManagement: 'File Management',
      fileManagementDesc: 'Upload and work with files (Excel, CSV)',
      visualQueries: 'Visual Queries',
      visualQueriesDesc: 'SmartQ - interactive tables with inline editing',
      security: 'Security',
      securityDesc: 'Access rights and user roles system'
    }
  }

  return translations[locale.value]?.[key] || key
}

// Quick Access Items - Issue #5112: Include database in all paths
const quickAccessItems = computed(() => [
  {
    name: t('newTables'),
    description: t('newTablesDesc'),
    icon: 'pi pi-table',
    path: `/integram/${database.value}/table`
  },
  {
    name: t('tables'),
    description: t('tablesDesc'),
    icon: 'pi pi-list',
    path: `/integram/${database.value}/dict`
  },
  {
    name: t('types'),
    description: t('typesDesc'),
    icon: 'pi pi-cog',
    path: `/integram/${database.value}/edit_types`
  },
  {
    name: t('sql'),
    description: t('sqlDesc'),
    icon: 'pi pi-code',
    path: `/integram/${database.value}/sql`
  },
  {
    name: t('smartQuery'),
    description: t('smartQueryDesc'),
    icon: 'pi pi-th-large',
    path: `/integram/${database.value}/smartq`
  },
  {
    name: t('reports'),
    description: t('reportsDesc'),
    icon: 'pi pi-chart-bar',
    path: `/integram/${database.value}/report`
  },
  {
    name: t('forms'),
    description: t('formsDesc'),
    icon: 'pi pi-file',
    path: `/integram/${database.value}/form`
  },
  {
    name: t('myforms'),
    description: t('myformsDesc'),
    icon: 'pi pi-sliders-h',
    path: `/integram/${database.value}/myform`
  }
])

// Features
const features = computed(() => [
  {
    title: t('flexibleStructure'),
    description: t('flexibleStructureDesc'),
    icon: 'pi pi-sitemap'
  },
  {
    title: t('powerfulSQL'),
    description: t('powerfulSQLDesc'),
    icon: 'pi pi-database'
  },
  {
    title: t('reportsAndForms'),
    description: t('reportsAndFormsDesc'),
    icon: 'pi pi-file'
  },
  {
    title: t('fileManagement'),
    description: t('fileManagementDesc'),
    icon: 'pi pi-upload'
  },
  {
    title: t('visualQueries'),
    description: t('visualQueriesDesc'),
    icon: 'pi pi-eye'
  },
  {
    title: t('security'),
    description: t('securityDesc'),
    icon: 'pi pi-shield'
  }
])

// Methods
function navigate(path) {
  router.push(path)
}

// Lifecycle
onMounted(() => {
  const savedLocale = localStorage.getItem('integram_locale')
  if (savedLocale) {
    locale.value = savedLocale
  }
})
</script>

<style scoped>
.integram-landing-container {
  /* Match other Integram components - no extra padding, .content provides 1rem */
}

/* Icon box with proper centering */
.icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  min-width: 2.5rem;
  min-height: 2.5rem;
  background: var(--p-primary-color);
  border-radius: var(--p-border-radius);
}

.icon-box i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--p-primary-contrast-color);
  font-size: 1.25rem;
  line-height: 1;
}
</style>
