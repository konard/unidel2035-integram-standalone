<script setup>
import { logger } from '@/utils/logger'
import { ref, onMounted, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import AppMenuItem from './AppMenuItem.vue'
import apiClient from '@/axios2'
import MenuConfigService from '@/service/MenuConfigService'
import integramApiClient from '@/services/integramApiClient'
import { createMenuItem, updateMenuItem, deleteMenuItem } from '@/services/menuStateService'
import { getUserWorkspaces } from '@/services/workspaceService'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()

const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

// Internal debounced search query to prevent lag on every keystroke
const debouncedSearchQuery = ref('')
let searchDebounceTimer = null

watch(() => props.searchQuery, (newQuery) => {
  clearTimeout(searchDebounceTimer)

  // Small delay even for clearing - allows input to update first
  const delay = (!newQuery || newQuery.trim() === '') ? 50 : 150

  searchDebounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = newQuery || ''
  }, delay)
}, { flush: 'post' })

// Lazy initialize toast to ensure ToastService is ready
let toast = null
const getToast = () => {
  if (!toast) {
    toast = useToast()
  }
  return toast
}

const emit = defineEmits(['menu-loaded'])

const model = ref([])
const isAdmin = ref(false)
const loading = ref(true)
const userWorkspaces = ref([])
const workspacesLoaded = ref(false)

// Fully dynamic menu loaded from app_menu report (database: my)
// Only "Документы" section is pre-defined and populated from app_menu_doc (database: a2025)
// Workspaces section is FIRST - user's workspaces are most important for quick access
const baseMenu = [
  {
    label: 'Workspaces',
    icon: 'pi pi-fw pi-folder-open',
    items: []
  },
  {
    label: 'Документы',
    icon: 'pi pi-fw pi-file',
    items: []
  }
]

// Menu for non-authorized users with public pages
const userMenu = [
  {
    label: 'Главная',
    icon: 'pi pi-fw pi-home',
    items: [
      {
        label: 'Добро пожаловать',
        icon: 'pi pi-fw pi-home',
        to: '/'
      },
      {
        label: 'О платформе',
        icon: 'pi pi-fw pi-info-circle',
        to: '/about'
      }
    ]
  },
  {
    label: 'Начать работу',
    icon: 'pi pi-fw pi-sign-in',
    items: [
      {
        label: 'Вход',
        icon: 'pi pi-fw pi-sign-in',
        to: '/login'
      },
      {
        label: 'Регистрация',
        icon: 'pi pi-fw pi-user-plus',
        to: '/register'
      }
    ]
  }
]

// Функция для проверки условий apiBase
const shouldShowBaseMenu = () => {
  try {
    const apiBase = localStorage.getItem('apiBase')
    return !apiBase || apiBase === '' || apiBase === window.location.hostname || apiBase === 'localhost' || apiBase === 'app.integram.io'
  } catch (error) {
    logger.error('Ошибка при чтении apiBase из localStorage:', error)
    return true // По умолчанию показываем baseMenu при ошибке
  }
}

const checkUserRole = async () => {
  try {
    // Note: ddadmin authentication method is deprecated (Issue #3760)
    // Default to admin access for users with authentication tokens
    const token = localStorage.getItem('token')
    if (!token) {
      logger.warn('No authentication token found')
      isAdmin.value = false
      return false
    }

    // Default to admin access for authenticated users
    isAdmin.value = true
    logger.debug('User role detection (using default admin access):', {
      isAdmin: isAdmin.value
    })

    return isAdmin.value
  } catch (error) {
    logger.error('Ошибка при проверке роли пользователя:', error)
    isAdmin.value = false
    return false
  }
}

// Load user workspaces for menu and search functionality (Issue #4651)
const loadUserWorkspaces = async () => {
  if (workspacesLoaded.value) return // Only load once

  // Skip for non-authorized users
  const token = localStorage.getItem('token') || localStorage.getItem('my_token')
  if (!token) {
    logger.debug('Skipping workspace loading for non-authorized user')
    return
  }

  try {
    // Use same approach as WorkspacesPage.vue for getting user ID
    const userId = authStore.primaryUserId || localStorage.getItem('id') || 'default-user'

    logger.debug('Loading user workspaces...', {
      userId,
      authStorePrimaryUserId: authStore.primaryUserId,
      localStorageId: localStorage.getItem('id'),
      apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8081'
    })

    const workspaces = await getUserWorkspaces(userId)
    userWorkspaces.value = workspaces || []
    workspacesLoaded.value = true

    logger.debug('Loaded workspaces:', {
      count: userWorkspaces.value.length,
      workspaces: userWorkspaces.value.map(w => ({ id: w.id, name: w.name }))
    })

    // Populate Workspaces section in menu
    populateWorkspacesSection()
  } catch (error) {
    logger.error('Failed to load user workspaces:', {
      error: error.message,
      stack: error.stack
    })
    userWorkspaces.value = []
    workspacesLoaded.value = true // Mark as loaded to prevent retry loops
    // Still populate the section with just "Все Workspaces" link
    populateWorkspacesSection()
  }
}

// Populate Workspaces section in the menu with loaded workspaces
const populateWorkspacesSection = () => {
  let workspacesSection = model.value.find(section => section.label === 'Workspaces')

  if (!workspacesSection) {
    // Create Workspaces section if it doesn't exist
    workspacesSection = {
      label: 'Workspaces',
      icon: 'pi pi-fw pi-folder-open',
      items: []
    }
    // Insert at the beginning - Workspaces should be first in menu
    model.value.unshift(workspacesSection)
  }

  // Build workspace menu items
  const workspaceItems = [
    {
      label: 'Все Workspaces',
      icon: 'pi pi-fw pi-list',
      to: '/workspaces'
    }
  ]

  // Add individual workspaces
  if (userWorkspaces.value.length > 0) {
    userWorkspaces.value.forEach(workspace => {
      workspaceItems.push({
        label: workspace.name,
        icon: workspace.agentEnabled ? 'pi pi-fw pi-bolt' : 'pi pi-fw pi-folder',
        to: `/workspace/${workspace.id}`,
        workspaceId: workspace.id
      })
    })
  }

  workspacesSection.items = workspaceItems

  logger.debug('Workspaces section populated:', {
    itemCount: workspaceItems.length
  })
}

const saveMenuConfig = async () => {
  try {
    const configString = JSON.stringify(model.value)
    await MenuConfigService.saveMenuConfig(configString)
  } catch (error) {
    logger.error('Error saving menu config:', error)
  }
}

const findItemInMenu = (menu, targetItem) => {
  for (let i = 0; i < menu.length; i++) {
    if (menu[i] === targetItem) {
      return { parent: menu, index: i, item: menu[i] }
    }
    if (menu[i].items) {
      const found = findItemInMenu(menu[i].items, targetItem)
      if (found) return found
    }
  }
  return null
}

const handleRename = async (data) => {
  const { item, newLabel } = data
  const oldLabel = item.label
  item.label = newLabel

  // If item is from database (app_menu), update in database
  if (item.id || item.dbId) {
    try {
      await updateMenuItem(item.id || item.dbId, { label: newLabel })
      logger.debug('Menu item renamed in database:', { id: item.id || item.dbId, newLabel })
      getToast().add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Пункт меню переименован',
        life: 2000
      })
    } catch (error) {
      logger.error('Failed to rename menu item in database:', error)
      item.label = oldLabel // Revert on error
      getToast().add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось переименовать пункт меню в базе данных',
        life: 3000
      })
      return
    }
  }

  await saveMenuConfig()
}

const handleDuplicate = async (item) => {
  const found = findItemInMenu(model.value, item)
  if (found) {
    const duplicate = JSON.parse(JSON.stringify(item))
    duplicate.label = `${item.label} (копия)`
    delete duplicate.id // Remove original ID so database creates new one
    delete duplicate.dbId

    // Find the parent section to get group info
    const parentSection = model.value.find(section =>
      section.items && section.items.includes(item)
    )

    // If item is from database section (fromAppMenu), also create in database
    if (parentSection && parentSection.fromAppMenu) {
      try {
        const result = await createMenuItem({
          label: duplicate.label,
          path: duplicate.to || '/',
          icon: duplicate.icon || 'pi pi-fw pi-file',
          group: parentSection.label || 'Страницы'
        })
        duplicate.id = result.id
        logger.debug('Menu item duplicated in database:', result)
        getToast().add({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Пункт меню дублирован',
          life: 2000
        })
      } catch (error) {
        logger.error('Failed to duplicate menu item in database:', error)
        getToast().add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось дублировать пункт меню в базе данных',
          life: 3000
        })
        return
      }
    }

    found.parent.splice(found.index + 1, 0, duplicate)
    await saveMenuConfig()
  }
}

const handleToggleVisibility = async (item) => {
  item.visible = item.visible === false ? true : false
  await saveMenuConfig()
}

const handleDelete = async (item) => {
  const found = findItemInMenu(model.value, item)
  if (found) {
    // If item is from database (has ID), delete from database
    if (item.id || item.dbId) {
      try {
        await deleteMenuItem(item.id || item.dbId)
        logger.debug('Menu item deleted from database:', { id: item.id || item.dbId })
        getToast().add({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Пункт меню удалён',
          life: 2000
        })
      } catch (error) {
        logger.error('Failed to delete menu item from database:', error)
        getToast().add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось удалить пункт меню из базы данных',
          life: 3000
        })
        return
      }
    }

    found.parent.splice(found.index, 1)
    await saveMenuConfig()
  }
}

const handleAddChild = async (item) => {
  if (!item.items) {
    item.items = []
  }

  const newItem = {
    label: 'Новый пункт',
    icon: 'pi pi-fw pi-file',
    to: '/new-path'
  }

  // If item is a section from database (fromAppMenu), create in database
  if (item.fromAppMenu) {
    try {
      const result = await createMenuItem({
        label: newItem.label,
        path: newItem.to,
        icon: newItem.icon,
        group: item.label || 'Страницы'
      })
      newItem.id = result.id
      logger.debug('New menu item created in database:', result)
      getToast().add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Новый пункт меню создан',
        life: 2000
      })
    } catch (error) {
      logger.error('Failed to create menu item in database:', error)
      getToast().add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось создать пункт меню в базе данных',
        life: 3000
      })
      return
    }
  }

  item.items.push(newItem)
  await saveMenuConfig()
}

// Загрузка бокового меню из отчёта Integram (report: app_menu, database: my)
// Использует динамический домен из localStorage.apiBase
// Структура отчёта app_menu (универсальная, основана на названиях полей):
// - Название - название пункта меню
// - path - маршрут
// - Иконка - иконка пункта меню
// - Группа меню - группа для объединения пунктов
// Всё динамическое: названия, группы, иконки, порядок из данных отчёта
const loadSidebarMenuFromIntegram = async () => {
  try {
    // Получаем домен из localStorage (выбран при регистрации)
    const apiBase = localStorage.getItem('apiBase') || window.location.hostname
    const serverUrl = `https://${apiBase}`

    // Issue #3801: Use 'my' token for API access (works as master token for all databases)
    // Priority: my_token > integram_session (if db=my) > legacy token
    let token = null
    let xsrf = null

    // 1. Try my_token first (specific token for 'my' database)
    token = localStorage.getItem('my_token')
    xsrf = localStorage.getItem('my_xsrf')

    // 2. Try integram_session if it's for 'my' database
    if (!token) {
      const integramSessionStr = localStorage.getItem('integram_session')
      if (integramSessionStr) {
        try {
          const session = JSON.parse(integramSessionStr)
          // Use token only if it's from 'my' database (master token)
          if (session.database === 'my') {
            token = session.token
            xsrf = session.xsrfToken
          }
        } catch (e) {
          logger.warn('Failed to parse integram_session for app_menu:', e)
        }
      }
    }

    // 3. Fallback to legacy token
    if (!token) {
      token = localStorage.getItem('token')
      xsrf = localStorage.getItem('_xsrf')
    }

    if (!token) {
      logger.warn('No token available for app_menu request')
      return []
    }

    logger.debug('Загрузка бокового меню из отчёта app_menu (база my)', {
      serverUrl,
      apiBase,
      hasToken: !!token
    })

    // Устанавливаем сервер и используем токен 'my' для доступа
    // Issue #3811: Pass 'my' as both database and authDatabase to use 'my' header
    integramApiClient.setServer(serverUrl)
    integramApiClient.setCredentials('my', token, xsrf, 'my')

    // Загружаем данные из отчёта app_menu с параметром JSON_KV для получения данных по названиям полей
    const response = await integramApiClient.get('my/report/app_menu', { JSON_KV: true })

    logger.debug('Ответ от отчёта app_menu:', {
      hasResponse: !!response,
      isArray: Array.isArray(response),
      itemCount: Array.isArray(response) ? response.length : 0,
      firstItemKeys: Array.isArray(response) && response[0] ? Object.keys(response[0]) : []
    })

    if (response && Array.isArray(response) && response.length > 0) {
      // Группируем пункты меню по группам (сохраняем порядок появления)
      const groupsMap = new Map()
      const groupOrder = [] // Порядок групп по первому появлению

      // Преобразуем объекты в пункты меню используя названия полей (универсальный подход)
      for (const row of response) {
        // Извлекаем значения по названиям полей (независимо от ID)
        const название = row['Название'] || row['название'] || ''
        const маршрут = row['path'] || row['Path'] || row['Маршрут'] || row['маршрут'] || '/'
        const иконка = row['Иконка'] || row['иконка'] || row['icon'] || row['Icon'] || 'pi pi-fw pi-file'
        const группа = row['Группа меню'] || row['группа меню'] || row['Группа'] || row['группа'] || row['group'] || row['Group'] || 'Прочее'

        // Очищаем HTML теги если есть
        const cleanНазвание = String(название).replace(/<[^>]*>/g, '').trim()
        const cleanМаршрут = String(маршрут).replace(/<[^>]*>/g, '').trim()
        const cleanИконка = String(иконка).replace(/<[^>]*>/g, '').trim()
        const cleanГруппа = String(группа).replace(/<[^>]*>/g, '').trim()

        if (cleanНазвание && cleanНазвание !== 'null' && cleanНазвание !== '') {
          // Формируем пункт меню
          const menuItem = {
            label: cleanНазвание,
            icon: cleanИконка,
            to: cleanМаршрут.startsWith('/') ? cleanМаршрут : `/${cleanМаршрут}`
          }

          // Добавляем в группу
          if (!groupsMap.has(cleanГруппа)) {
            groupsMap.set(cleanГруппа, [])
            groupOrder.push(cleanГруппа) // Сохраняем порядок появления групп
          }
          groupsMap.get(cleanГруппа).push(menuItem)
        }
      }

      // Преобразуем группы в секции меню (динамически, без hardcoded конфига)
      const menuSections = []

      for (const groupName of groupOrder) {
        const items = groupsMap.get(groupName)
        // Иконка группы = иконка первого элемента в группе
        const groupIcon = items.length > 0 ? items[0].icon : 'pi pi-fw pi-folder'

        menuSections.push({
          label: groupName,
          icon: groupIcon,
          items: items
        })
      }

      logger.debug('Загружено групп меню из отчёта app_menu:', {
        groupCount: menuSections.length,
        serverUrl,
        totalItems: response.length
      })

      return menuSections
    }

    return []
  } catch (error) {
    logger.error('Ошибка загрузки бокового меню из отчёта app_menu:', error)
    return []
  }
}

const fetchMenuItems = async () => {
  loading.value = true

  await checkUserRole()

  // Role-based menu selection takes priority
  // Admin users: full menu if apiBase conditions are met
  // Non-admin users (Участник): only Training section
  logger.debug('User role check:', { isAdmin: isAdmin.value, shouldShowBase: shouldShowBaseMenu() })

  // Try to load custom menu configuration only for admin users
  let customMenuLoaded = false
  if (isAdmin.value) {
    // First try localStorage (faster and doesn't require network)
    const localConfig = MenuConfigService.getLocalMenuConfig()
    if (localConfig) {
      try {
        model.value = JSON.parse(localConfig)
        customMenuLoaded = true
        logger.debug('Loaded custom menu from localStorage for admin')
      } catch (e) {
        logger.error('Error parsing local menu config:', e)
      }
    }

    // Then try to load from server (will update localStorage if different)
    if (!customMenuLoaded) {
      try {
        const menuConfigResponse = await MenuConfigService.getMenuConfig()
        if (menuConfigResponse && menuConfigResponse.response && menuConfigResponse.response.config) {
          model.value = JSON.parse(menuConfigResponse.response.config)
          customMenuLoaded = true
          logger.debug('Loaded custom menu from server for admin')
        }
      } catch {
        // Silently fall through to use default menu
        logger.debug('Using default menu (orchestrator not available)')
      }
    }
  }

  // If no custom menu was loaded, use role-based defaults
  if (!customMenuLoaded) {
    if (isAdmin.value && shouldShowBaseMenu()) {
      model.value = [...baseMenu]
      logger.debug('Using baseMenu for admin user')
    } else {
      model.value = [...userMenu]
      logger.debug('Using userMenu for non-admin user (Участник)')
    }
  }

  // Check if user is authenticated before trying to load database-dependent menu items
  const token = localStorage.getItem('token') || localStorage.getItem('my_token')
  if (!token) {
    // Non-authorized user: skip database-dependent menu loading
    logger.info('Non-authorized user detected, using public menu only')
    loading.value = false
    return
  }

  // Ensure "Документы" section always exists in the menu with at least a fallback link
  let pagesSection = model.value.find(section => section.label === 'Документы')
  if (!pagesSection) {
    model.value.push({
      label: 'Документы',
      icon: 'pi pi-fw pi-file',
      items: [
        {
          label: 'Все страницы',
          icon: 'pi pi-fw pi-list',
          to: '/pages'
        }
      ]
    })
    pagesSection = model.value[model.value.length - 1]
    logger.debug('Created Pages section with default fallback link')
  }

  try {
    // Issue #3801: Use 'my' token for API access (works as master token)
    // Priority: my_token > integram_session (if db=my) > legacy token
    let token = null
    let xsrf = null

    // 1. Try my_token first (specific token for 'my' database)
    token = localStorage.getItem('my_token')
    xsrf = localStorage.getItem('my_xsrf')

    // 2. Try integram_session if it's for 'my' database
    if (!token) {
      const integramSessionStr = localStorage.getItem('integram_session')
      if (integramSessionStr) {
        try {
          const session = JSON.parse(integramSessionStr)
          if (session.database === 'my') {
            token = session.token
            xsrf = session.xsrfToken
          }
        } catch (e) {
          logger.warn('Failed to parse integram_session:', e)
        }
      }
    }

    // 3. Fallback to legacy token (assume it's from 'my' database if present)
    if (!token) {
      token = localStorage.getItem('token')
      xsrf = localStorage.getItem('_xsrf')
    }

    const user = localStorage.getItem('user') || localStorage.getItem('my_user')

    if (!token || !user) {
      logger.warn('Missing authentication credentials, using fallback menu')
      throw new Error('Missing authentication credentials')
    }

    // Issue #3793: Use my database token for a2025 access via API kernel
    // Issue #3811: Pass 'my' as authDatabase parameter to ensure 'my' header is used
    const apiBase = localStorage.getItem('apiBase') || window.location.hostname

    integramApiClient.setServer(`https://${apiBase}`)
    // Target database: a2025, but authenticated to: my
    // This tells the client to use 'my' header for ALL requests
    integramApiClient.setCredentials('a2025', token, xsrf, 'my')

    logger.debug('Using my token for a2025 database access (will use "my" header)')

    // Fetch report app_menu_doc from my database using integramApiClient
    const response = await integramApiClient.get('my/report/app_menu_doc', { JSON_KV: true })

    logger.debug('Report app_menu_doc raw response:', {
      hasResponse: !!response,
      isArray: Array.isArray(response),
      responseType: typeof response,
      responseKeys: response ? Object.keys(response).slice(0, 5) : [],
      firstItemKeys: Array.isArray(response) && response[0] ? Object.keys(response[0]) : [],
      itemCount: Array.isArray(response) ? response.length : 0
    })

    // Process Integram API response
    // Format with JSON_KV parameter: Array of objects [{ "Документ": "...", "Страница": "...", "СтраницаID": "..." }, ...]
    if (response && Array.isArray(response) && response.length > 0) {
      const documentsMap = new Map()

      logger.debug('Processing JSON_KV format report with', response.length, 'rows')

      // Check if required fields exist in the first row
      const firstRow = response[0]
      const hasDocField = 'Документ' in firstRow
      const hasPageField = 'Страница' in firstRow
      const hasPageIdField = 'СтраницаID' in firstRow

      logger.debug('Field availability:', {
        hasDocField,
        hasPageField,
        hasPageIdField,
        availableFields: Object.keys(firstRow)
      })

      if (!hasDocField || !hasPageField || !hasPageIdField) {
        logger.warn('Required fields not found in report app_menu_doc:', {
          hasDocField,
          hasPageField,
          hasPageIdField
        })
        throw new Error('Required fields not found in report app_menu_doc')
      }

      // Process each row
      for (let rowIndex = 0; rowIndex < response.length; rowIndex++) {
        const row = response[rowIndex]

        // Extract values from JSON_KV format
        const docName = row['Документ']
        const pageName = row['Страница']
        const pageId = row['СтраницаID']

        // Clean HTML tags from values if present (Integram sometimes returns HTML)
        const cleanDocName = docName ? String(docName).replace(/<[^>]*>/g, '').trim() : null
        const cleanPageName = pageName ? String(pageName).replace(/<[^>]*>/g, '').trim() : null
        const cleanPageId = pageId ? String(pageId).replace(/<[^>]*>/g, '').trim() : null

        // Skip rows with empty document name
        if (!cleanDocName || cleanDocName === 'null' || cleanDocName === '') {
          logger.debug('Skipping row with empty document name:', { rowIndex })
          continue
        }

        if (!documentsMap.has(cleanDocName)) {
          documentsMap.set(cleanDocName, {
            label: cleanDocName,
            icon: 'pi pi-fw pi-folder',
            items: []
          })
        }

        if (cleanPageName && cleanPageId && cleanPageId !== 'null') {
          const pageItem = {
            label: cleanPageName,
            id: cleanPageId,
            icon: 'pi pi-fw pi-file-edit',
            to: `/editor/${cleanPageId}`
          }
          documentsMap.get(cleanDocName).items.push(pageItem)
        }
      }

      logger.debug('Documents map populated:', {
        documentCount: documentsMap.size,
        documents: Array.from(documentsMap.keys()).slice(0, 10)
      })

      const pagesSection = model.value.find(section => section.label === 'Документы')
      if (pagesSection) {
        const allPagesItem = {
          label: 'Все страницы',
          icon: 'pi pi-fw pi-list',
          to: '/pages'
        }

        // Filter out documents with no pages
        const documentsWithPages = Array.from(documentsMap.values()).filter(doc => doc.items.length > 0)

        if (documentsWithPages.length > 0) {
          pagesSection.items = [
            allPagesItem,
            ...documentsWithPages
          ]

          logger.debug('Pages loaded successfully from a2025 database', {
            documentCount: documentsWithPages.length,
            totalPages: documentsWithPages.reduce((sum, doc) => sum + doc.items.length, 0)
          })
        } else {
          // No pages found, use fallback
          logger.warn('No pages found in report 978747, using fallback')
          pagesSection.items = [allPagesItem]
        }
      }
    } else {
      // Empty report or invalid structure
      logger.warn('Report app_menu_doc is empty or has invalid structure, using fallback')
      throw new Error('Report app_menu_doc is empty or has invalid structure')
    }
  } catch (error) {
    logger.error('Ошибка при получении данных меню из a2025', error)
    logger.error('Failed to load pages from a2025 database', {
      error: error.message,
      stack: error.stack
    })

    // Provide fallback "Все страницы" link when dynamic pages can't be loaded
    const pagesSection = model.value.find(section => section.label === 'Документы')
    if (pagesSection) {
      // Always set fallback, even if items array exists
      pagesSection.items = [
        {
          label: 'Все страницы',
          icon: 'pi pi-fw pi-list',
          to: '/pages'
        }
      ]
      logger.debug('Документы section populated with fallback link due to error loading dynamic pages from a2025')
    } else {
      logger.debug('Документы section not found in catch block - it should already exist from baseMenu')
    }
  }

  // Загрузка бокового меню из отчёта app_menu (база my)
  // Секции из отчёта добавляются напрямую в меню (без обёртки)
  try {
    logger.debug('Загрузка бокового меню из отчёта app_menu...')
    const sidebarMenuSections = await loadSidebarMenuFromIntegram()

    if (sidebarMenuSections && sidebarMenuSections.length > 0) {
      // Помечаем секции из app_menu для идентификации
      const markedSections = sidebarMenuSections.map(section => ({
        ...section,
        fromAppMenu: true
      }))

      // Удаляем старые секции из app_menu (если были)
      model.value = model.value.filter(section => !section.fromAppMenu)

      // Находим секцию "Документы" (она идёт после Workspaces)
      const documentsIndex = model.value.findIndex(section => section.label === 'Документы')

      if (documentsIndex >= 0) {
        // Вставляем секции из app_menu после "Документы"
        // Порядок: Workspaces -> Документы -> секции из app_menu
        model.value.splice(documentsIndex + 1, 0, ...markedSections)
      } else {
        // Если секции "Документы" нет, вставляем после Workspaces
        const workspacesIndex = model.value.findIndex(section => section.label === 'Workspaces')
        if (workspacesIndex >= 0) {
          model.value.splice(workspacesIndex + 1, 0, ...markedSections)
        } else {
          model.value.push(...markedSections)
        }
      }

      logger.debug('Боковое меню из отчёта app_menu успешно загружено:', {
        sectionsCount: sidebarMenuSections.length,
        totalItems: sidebarMenuSections.reduce((sum, s) => sum + (s.items?.length || 0), 0)
      })
    } else {
      logger.debug('Отчёт app_menu пуст или не содержит данных')
    }
  } catch (error) {
    logger.error('Ошибка при загрузке бокового меню из отчёта app_menu:', error)
  } finally {
    loading.value = false
  }
}

// Drag and drop handlers
const handleDragDrop = async (event) => {
  const { draggedIndex, draggedParentKey, targetIndex, targetParentKey } = event

  // Don't allow dropping on itself
  if (draggedIndex === targetIndex && draggedParentKey === targetParentKey) {
    return
  }

  // Create a deep copy of the menu to avoid mutation issues
  const newModel = JSON.parse(JSON.stringify(model.value))

  // Handle root section reordering (when both parent keys are null)
  if (!draggedParentKey && !targetParentKey) {
    // Reorder root sections
    const draggedSection = newModel[draggedIndex]

    // Don't allow moving "Документы" or "Workspaces" sections
    const protectedSections = ['Документы', 'Workspaces']
    if (protectedSections.includes(draggedSection.label) || protectedSections.includes(newModel[targetIndex].label)) {
      getToast().add({
        severity: 'warn',
        summary: 'Недоступно',
        detail: 'Нельзя перемещать этот раздел (он генерируется автоматически)',
        life: 3000
      })
      return
    }

    newModel.splice(draggedIndex, 1)
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    newModel.splice(adjustedTargetIndex, 0, draggedSection)

    model.value = newModel
    await saveMenuOrder()
    return
  }

  // Find the section indices from parent keys
  const draggedSectionIndex = parseInt(draggedParentKey?.split('-')[0] || '0')
  const targetSectionIndex = parseInt(targetParentKey?.split('-')[0] || '0')

  // Get the section labels to check if they're draggable
  const draggedSection = model.value[draggedSectionIndex]
  const targetSection = model.value[targetSectionIndex]

  // Don't allow dragging within the "Документы" or "Workspaces" sections (they're dynamic)
  const protectedSections = ['Документы', 'Workspaces']
  if (protectedSections.includes(draggedSection?.label) || protectedSections.includes(targetSection?.label)) {
    getToast().add({
      severity: 'warn',
      summary: 'Недоступно',
      detail: 'Нельзя перемещать элементы этого раздела (они генерируются автоматически)',
      life: 3000
    })
    return
  }

  // Handle nested item reordering within sections
  // eslint-disable-next-line no-unused-vars
  const getNestedItem = (menu, keys) => {
    let current = menu
    for (const key of keys) {
      const index = parseInt(key)
      if (current[index].items) {
        current = current[index].items
      } else {
        return { parent: current, index }
      }
    }
    return { parent: current, index: null }
  }

  const draggedKeys = draggedParentKey ? draggedParentKey.split('-').map(k => parseInt(k)) : []
  const targetKeys = targetParentKey ? targetParentKey.split('-').map(k => parseInt(k)) : []

  // Navigate to the parent containers
  let draggedParent = newModel
  for (let i = 0; i < draggedKeys.length; i++) {
    draggedParent = draggedParent[draggedKeys[i]].items
  }

  let targetParent = newModel
  for (let i = 0; i < targetKeys.length; i++) {
    targetParent = targetParent[targetKeys[i]].items
  }

  // Remove the dragged item from its original position
  const draggedItem = draggedParent[draggedIndex]
  draggedParent.splice(draggedIndex, 1)

  // Insert the dragged item at the target position
  // Adjust target index if moving within the same parent and the dragged item was before the target
  let adjustedTargetIndex = targetIndex
  if (draggedParentKey === targetParentKey && draggedIndex < targetIndex) {
    adjustedTargetIndex--
  }

  targetParent.splice(adjustedTargetIndex, 0, draggedItem)

  // Update the model
  model.value = newModel

  // Save to backend
  await saveMenuOrder()
}

const saveMenuOrder = async () => {
  try {
    // Remove dynamic sections before saving (Документы and Workspaces)
    const dynamicSections = ['Документы', 'Workspaces']
    const menuToSave = model.value.filter(section => !dynamicSections.includes(section.label))

    const config = JSON.stringify(menuToSave)
    await MenuConfigService.saveMenuConfig(config)

    getToast().add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Порядок меню автоматически сохранён',
      life: 2000
    })
  } catch {
    getToast().add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить порядок меню',
      life: 3000
    })
  }
}

onMounted(async () => {
  await fetchMenuItems()
  // Issue #4651: Load workspaces for search functionality
  await loadUserWorkspaces()
})

// Helper function to recursively filter menu items
const filterMenuItems = (items, query) => {
  if (!items || items.length === 0) return []

  return items.reduce((acc, item) => {
    const itemCopy = { ...item }
    let matches = false

    // Check if current item label matches
    if (itemCopy.label && itemCopy.label.toLowerCase().includes(query)) {
      matches = true
    }

    // Recursively filter child items
    if (itemCopy.items && itemCopy.items.length > 0) {
      const filteredChildren = filterMenuItems(itemCopy.items, query)

      if (filteredChildren.length > 0) {
        itemCopy.items = filteredChildren
        matches = true
      }
    }

    // Include item if it or any of its children match
    if (matches) {
      acc.push(itemCopy)
    }

    return acc
  }, [])
}

// Computed property for filtered menu (uses debounced query to prevent input lag)
const filteredModel = computed(() => {
  let result = model.value

  // Apply search filtering if debounced search query exists
  if (debouncedSearchQuery.value && debouncedSearchQuery.value.trim() !== '') {
    const query = debouncedSearchQuery.value.toLowerCase().trim()
    result = filterMenuItems(result, query)
  }

  return result
})

// Watch for search query changes to auto-expand matching sections
watch(() => props.searchQuery, async (newQuery) => {
  if (newQuery && newQuery.trim() !== '') {
    // When searching, we'll handle expansion in AppMenuItem via a prop
    // Issue #4651: Lazy load workspaces when user starts searching
    if (!workspacesLoaded.value) {
      await loadUserWorkspaces()
    }
  }
})

// Computed count of filtered items
const filteredItemsCount = computed(() => {
  if (!debouncedSearchQuery.value || debouncedSearchQuery.value.trim() === '') return 0

  let count = 0
  const countItems = (items) => {
    items.forEach(item => {
      if (item.label) count++
      if (item.items) countItems(item.items)
    })
  }
  countItems(filteredModel.value)
  return count
})

// Watch model changes and emit to parent
watch(model, (newModel) => {
  emit('menu-loaded', newModel)
}, { deep: true, immediate: true })
</script>

<template>
  <div v-if="loading" class="flex justify-content-center align-items-center h-full">
    <ProgressSpinner />
  </div>

  <div v-else>
    <div v-if="debouncedSearchQuery && debouncedSearchQuery.trim() !== ''" class="search-results-info px-3 py-2 text-sm text-600">
      Найдено: {{ filteredItemsCount }} элементов
    </div>

    <ul class="layout-menu" role="tree" aria-label="Главное меню навигации">
      <template v-for="(item, i) in filteredModel" :key="item.label || i">
        <app-menu-item
          v-if="!item.separator"
          :item="item"
          :index="i"
          :search-query="debouncedSearchQuery"
          :collapsed="collapsed"
          @rename="handleRename"
          @duplicate="handleDuplicate"
          @toggle-visibility="handleToggleVisibility"
          @delete="handleDelete"
          @add-child="handleAddChild"
          @drag-drop="handleDragDrop"
        />
        <li v-if="item.separator" class="menu-separator"></li>
      </template>
    </ul>

    <div v-if="debouncedSearchQuery && debouncedSearchQuery.trim() !== '' && filteredModel.length === 0" class="px-3 py-4 text-center text-500">
      Ничего не найдено
    </div>
  </div>
</template>
