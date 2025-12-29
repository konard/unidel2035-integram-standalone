<template>
  <div class="primevue-table-wrapper">
    <Card class="shadow-2 border-round-2xl overflow-hidden">
      <template #title>
        <div class="flex align-items-center">
          <i :class="titleIcon" style="font-size: 1.25rem; margin-right: 0.5rem"></i>
          <span>{{ title }}</span>
          <div class="ml-auto flex gap-2">
            <Button
              v-if="isTokensTable"
              icon="pi pi-plus"
              label="Создать токен"
              class="p-button-sm p-button-success"
              @click="openCreateTokenDialog"
            />
            <Button
              v-if="showRefresh && endpointId"
              icon="pi pi-refresh"
              class="p-button-rounded p-button-text p-button-sm"
              @click="fetchData"
              :loading="loading"
            />
          </div>
        </div>
      </template>

      <template #content>
        <div v-if="loading && !tableData.length" class="flex justify-content-center align-items-center" style="height: 400px">
          <ProgressSpinner />
        </div>

        <div v-else-if="error" class="p-error p-3">
          <i class="pi pi-exclamation-triangle mr-2"></i>
          {{ error }}
        </div>

        <div v-else>
          <DataTable
            :value="tableData"
            :paginator="paginator"
            :rows="rows"
            :rowsPerPageOptions="rowsPerPageOptions"
            responsiveLayout="scroll"
            class="p-datatable-sm p-datatable-striped"
            :scrollable="scrollable"
            :scrollHeight="scrollHeight"
            stripedRows
            :loading="loading && tableData.length > 0"
          >
            <Column
              v-for="col in tableColumns"
              :key="col.field"
              :field="col.field"
              :header="col.header"
              :sortable="col.sortable !== false"
            >
              <template #body="slotProps">
                <div v-if="col.format">
                  <div v-html="col.format(slotProps.data[col.field], slotProps.data)"></div>
                </div>
                <div v-else>
                  {{ slotProps.data[col.field] || '—' }}
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </template>
    </Card>
  </div>

  <!-- Create Token Dialog for tokens table -->
  <AiTokensCreateTokenDialog
    v-model:visible="showCreateTokenDialog"
    @token-created="handleTokenCreated"
  />
</template>

<script>
import { ref, onMounted, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ProgressSpinner from 'primevue/progressspinner'

import AiTokensCreateTokenDialog from '@/components/ai-tokens/CreateTokenDialog.vue'
import ddadminClient from '@/ddadminAxios'
import myClient from '@/myAxios'

// Issue #3945: Table ID mapping from ddadmin to my database
// Old ddadmin IDs → New my database IDs:
// - AI Models: 305 → 195686
// - AI Agents: 837 → 194865
// - AI Tokens: 298 → 198016
// - Payments: 957 (my database)
// - Token Consumption (Transactions): 198038 (Issue #3962)
const MY_DATABASE_TABLE_IDS = ['195686', '194865', '198016', '957', '198038']

// Helper to check if endpoint uses my database
const isMyDatabaseEndpoint = (endpointId) => {
  if (!endpointId) return false
  // Extract table ID from endpoint like "object/195686" or "object/198016/?F_U=123"
  const match = endpointId.match(/object\/(\d+)/)
  if (match) {
    return MY_DATABASE_TABLE_IDS.includes(match[1])
  }
  return false
}

// https://github.com/unidel2035/dronedoc2025/pull/new/tokens-update-v2

export default {
  name: 'PrimeVueTable',
  components: {
    Card,
    Button,
    DataTable,
    Column,
    ProgressSpinner,
    AiTokensCreateTokenDialog
  },
  props: {
    data: {
      type: Array,
      default: () => []
    },
    columns: {
      type: Array,
      default: () => []
    },
    endpointId: {
      type: String,
      default: null
    },
    title: {
      type: String,
      default: 'Таблица'
    },
    titleIcon: {
      type: String,
      default: 'pi pi-table'
    },
    showRefresh: {
      type: Boolean,
      default: true
    },
    paginator: {
      type: Boolean,
      default: true
    },
    rows: {
      type: Number,
      default: 10
    },
    rowsPerPageOptions: {
      type: Array,
      default: () => [5, 10, 25, 50]
    },
    scrollable: {
      type: Boolean,
      default: false
    },
    scrollHeight: {
      type: String,
      default: '400px'
    },
    externalLoading: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const toast = useToast()
    const loading = ref(false)
    const error = ref(null)
    const rawResponse = ref(null)
    const remoteData = ref([])
    const showCreateTokenDialog = ref(false)

    // Глобальная функция для действий с агентами
    const agentAction = (action, agentId, agentName) => {
      console.log(`Agent action: ${action}`, { agentId, agentName })
      
      if (action === 'activate') {
        // Активация агента
        toast.add({
          severity: 'success',
          summary: 'Агент активирован',
          detail: `${agentName} активирован и готов к использованию`,
          life: 3000
        })
        // Здесь можно добавить API вызов для активации агента
      } else if (action === 'deactivate') {
        // Деактивация агента
        toast.add({
          severity: 'warn',
          summary: 'Агент деактивирован',
          detail: `${agentName} деактивирован`,
          life: 3000
        })
        // Здесь можно добавить API вызов для деактивации агента
      }
      
      // Перезагружаем данные таблицы после действия
      setTimeout(() => {
        fetchData()
      }, 1000)
    }

    // Делаем функцию глобально доступной
    if (typeof window !== 'undefined') {
      window.agentAction = agentAction
    }

    // Handle token created event
    const handleTokenCreated = (tokenData) => {
      console.log('Token created:', tokenData)
      toast.add({
        severity: 'success',
        summary: 'Токен создан',
        detail: 'Новый токен успешно создан',
        life: 3000
      })
      
      // Refresh the tokens table after a short delay
      // Issue #3945: Check for both old (298) and new (198016) token table IDs
      setTimeout(() => {
        if (props.endpointId?.includes('object/298') || props.endpointId?.includes('object/198016')) {
          fetchData()
        }
      }, 1500)
    }

    // Issue #3945: Computed property to check if this is a tokens table
    const isTokensTable = computed(() => {
      return props.endpointId?.includes('object/298') || props.endpointId?.includes('object/198016')
    })

    // Open create token dialog
    const openCreateTokenDialog = () => {
      console.log('Opening create token dialog...')
      showCreateTokenDialog.value = true
    }

    // Get current user ID dynamically
    const getCurrentUserId = async () => {
      try {
        // Try multiple sources to get user ID
        
        // 1. Check URL parameters for F_U=xxx
        const urlParams = new URLSearchParams(window.location.search)
        const urlUserId = urlParams.get('F_U')
        if (urlUserId) {
          console.log('✅ Found user ID in URL:', urlUserId)
          return urlUserId
        }
        
        // 2. Try to get from ddadmin session
        try {
          const sessionResponse = await ddadminClient.get('/session')
          if (sessionResponse.data?.user?.id) {
            console.log('✅ Found user ID in session:', sessionResponse.data.user.id)
            return sessionResponse.data.user.id.toString()
          }
        } catch (sessionError) {
          console.warn('Could not get session info:', sessionError.message)
        }
        
        // 3. Try to extract from token or localStorage
        const storedUserId = localStorage.getItem('ddadmin_user_id') || 
                             sessionStorage.getItem('ddadmin_user_id') ||
                             localStorage.getItem('user_id') ||
                             sessionStorage.getItem('user_id')
        
        if (storedUserId) {
          console.log('✅ Found user ID in storage:', storedUserId)
          return storedUserId
        }
        
        // 4. Default to known user ID from context (291)
        console.log('⚠️ Using default user ID: 291')
        return '291'
        
      } catch (error) {
        console.warn('Could not get current user ID:', error)
        return '291' // Fallback to default
      }
    }

    // Используем удаленные данные если есть endpointId, иначе используем переданные данные
    const tableData = computed(() => {
      if (props.endpointId && remoteData.value.length > 0) {
        return remoteData.value
      }
      return props.data || []
    })

    // Специальная конфигурация колонок для разных endpoint'ов
    const getCustomColumns = (endpointId) => {
      // Issue #3945: Support both old ddadmin and new my database table IDs
      // AI Models: 305 (ddadmin) → 195686 (my)
      if (endpointId === 'object/305' || endpointId === 'object/195686') {
        // Поддерживаемые AI модели
        return [
          {
            field: 'Модель',
            header: 'Модель',
            sortable: true,
            format: (value, row) => {
              const provider = row['Провайдер'] || ''
              return `
                <div class="model-cell">
                  <div class="model-name">${value || '—'}</div>
                  <div class="model-provider">
                    <i class="pi pi-building mr-1"></i>
                    ${provider}
                  </div>
                </div>
              `
            }
          },
          {
            field: 'Цена Запроса',
            header: 'Цена вход (₽)',
            sortable: true,
            format: (value) => {
              const num = parseFloat(value)
              if (!isNaN(num) && num > 0) {
                return `
                  <div class="price-cell">
                    <span class="price-value">${num.toFixed(2)} ₽</span>
                  </div>
                `
              }
              return '<span class="text-muted">—</span>'
            }
          },
          {
            field: 'Цена Ответа',
            header: 'Цена выход (₽)',
            sortable: true,
            format: (value) => {
              const num = parseFloat(value)
              if (!isNaN(num) && num > 0) {
                return `
                  <div class="price-cell">
                    <span class="price-value">${num.toFixed(2)} ₽</span>
                  </div>
                `
              }
              return '<span class="text-muted">—</span>'
            }
          },
          {
            field: 'Интеллект',
            header: 'Интеллект',
            sortable: true,
            format: (value) => {
              return `
                <div class="intelligence-cell">
                  <div class="intelligence-rating">
                    ${'★'.repeat(Math.floor(parseFloat(value) || 0))}${'☆'.repeat(5 - Math.floor(parseFloat(value) || 0))}
                  </div>
                  <span class="intelligence-value">${value || '—'}</span>
                </div>
              `
            }
          }
        ]
      // Issue #3945: AI Agents: 837 (ddadmin) → 194865 (my)
      } else if (endpointId === 'object/837' || endpointId === 'object/194865') {
        // AI Агенты
        return [
          {
            field: 'Агент',
            header: 'Агент',
            sortable: true,
            format: (value, row) => {
              const description = row['Описание'] || ''
              return `
                <div class="agent-cell">
                  <div class="agent-name">${value || '—'}</div>
                  <div class="agent-description">${description || '—'}</div>
                </div>
              `
            }
          },
          {
            field: 'Категория агента',
            header: 'Категория',
            sortable: true,
            format: (value) => {
              return `
                <div class="category-cell">
                  <i class="pi pi-tag mr-1"></i>
                  <span>${value || '—'}</span>
                </div>
              `
            }
          },
          {
            field: 'Статус',
            header: 'Статус',
            sortable: true,
            format: (value) => {
              const isActive = value && (value.toLowerCase().includes('актив') || value === 'active')
              return `
                <div class="status-cell">
                  <span class="status-badge ${isActive ? 'active' : 'inactive'}">
                    <i class="pi ${isActive ? 'pi-check-circle' : 'pi-pause-circle'} mr-1"></i>
                    ${isActive ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
              `
            }
          },
          {
            field: 'Действия',
            header: 'Действия',
            sortable: false,
            format: (value, row) => {
              const isActive = row['Статус'] && (row['Статус'].toLowerCase().includes('актив') || row['Статус'] === 'active')
              const agentId = row.id || row['ID'] || ''
              const agentName = row['Агент'] || 'Агент'

              return `
                <div class="actions-cell">
                  <button
                    class="action-button ${isActive ? 'deactivate' : 'activate'}"
                    onclick="window.agentAction('${isActive ? 'deactivate' : 'activate'}', '${agentId}', '${agentName.replace(/'/g, "\\'")}')"
                  >
                    <i class="pi ${isActive ? 'pi-pause' : 'pi-play'} mr-1"></i>
                    ${isActive ? 'Деактивировать' : 'Использовать'}
                  </button>
                </div>
              `
            }
          }
        ]
      // Issue #3973: Removed custom columns for tables 198016 and 957
      // Tables now use auto-generated columns from API data
      }
      return null
    }
      
    // Используем автогенерированные колонки если нет явно указанных
    const tableColumns = computed(() => {
      if (props.columns && props.columns.length > 0) {
        return props.columns
      }
      
      // Проверяем специальную конфигурацию для endpoint'а
      console.log('Current endpointId:', props.endpointId)
      console.log('Available data keys:', tableData.value.length > 0 ? Object.keys(tableData.value[0]) : 'No data')
      const customColumns = getCustomColumns(props.endpointId)
      if (customColumns) {
        console.log('Using custom columns:', customColumns.map(c => c.field))
        console.log('Sample data:', tableData.value[0])
        return customColumns
      }
      
      // Автогенерация колонок на основе данных
      if (tableData.value.length > 0) {
        const firstRow = tableData.value[0]
        console.log('Auto-generated columns from data:', Object.keys(firstRow))
        console.log('Sample row data:', firstRow)
        return Object.keys(firstRow).map(key => ({
          field: key,
          header: key,
          sortable: true
        }))
      }
      
      return []
    })

    const fetchData = async () => {
      if (!props.endpointId) return

      try {
        loading.value = true
        error.value = null

        let response

        // Issue #3945: Determine which client to use based on table ID
        const useMyClient = isMyDatabaseEndpoint(props.endpointId)
        const apiClient = useMyClient ? myClient : ddadminClient
        const dbName = useMyClient ? 'my' : 'ddadmin'

        console.log(`📋 Loading object data via ${dbName}Client...`, props.endpointId)
        response = await apiClient.get(`/${props.endpointId}`)
        rawResponse.value = response.data
        transformData(response.data)

        toast.add({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Данные загружены',
          life: 3000,
        })
      } catch (err) {
        console.error('Ошибка при загрузке данных:', err)
        error.value = 'Не удалось загрузить данные: ' + (err.message || 'Неизвестная ошибка')
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: error.value,
          life: 5000,
        })
      } finally {
        loading.value = false
      }
    }

    const transformData = (rawData) => {
      console.log('🔍 Transforming object data:', rawData)

      // Issue #3945: Support multiple data formats:
      // 1. ddadmin/my with remapper: { response: { rows, headers } }
      // 2. my database raw format: { object, reqs, req_type }

      // Try to extract response data (handle both wrapped and unwrapped)
      let responseData = rawData?.response || rawData

      // Check for remapped format (has rows and headers WITH actual data)
      if (responseData?.rows?.length > 0 && responseData?.headers?.length > 0) {
        console.log('📋 Detected remapped format (rows/headers)')
        const headersMap = {}
        const headersTypeMap = {}

        responseData.headers.forEach(header => {
          headersMap[header.id] = header.value
          headersTypeMap[header.id] = header.type
        })

        remoteData.value = responseData.rows.map(row => {
          const item = { id: row.id }
          row.values.forEach(value => {
            const headerName = headersMap[value.headerId]
            if (headerName) {
              item[headerName] = formatCellValue(value.value, headersTypeMap[value.headerId])
              item[`__type_${headerName}`] = headersTypeMap[value.headerId]
            }
          })
          return item
        })

        console.log('✅ Remapped data transformed:', remoteData.value.length, 'rows')
        return
      }

      // Check for my database raw format (object/reqs/req_type) - subordinate queries
      if (responseData?.object && Array.isArray(responseData.object)) {
        console.log('📋 Detected my database raw format (subordinate query)')
        const reqTypes = responseData.req_type || {}
        const reqs = responseData.reqs || {}
        const reqBaseId = responseData.req_base_id || {}

        remoteData.value = responseData.object.map(obj => {
          const item = { id: obj.id, val: obj.val }
          const objReqs = reqs[obj.id] || {}

          for (const [reqId, reqName] of Object.entries(reqTypes)) {
            const value = objReqs[reqId]
            if (value !== undefined) {
              item[reqName] = formatCellValue(value, parseInt(reqBaseId[reqId]) || 3)
            }
          }

          return item
        })

        console.log('✅ My database data transformed:', remoteData.value.length, 'rows')
        return
      }

      console.warn('⚠️ No recognizable data format found')
      remoteData.value = []
    }

    

    const formatCellValue = (value, type) => {
      if (value === null || value === undefined || value === '') {
        return '—'
      }

      // Type 11 = boolean
      if (type === 11) {
        return value ? '✓' : '✗'
      }

      // Type 9 = date, Type 4 = datetime
      if (type === 9 || type === 4) {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            if (type === 9) {
              return date.toLocaleDateString('ru-RU')
            } else {
              return date.toLocaleString('ru-RU')
            }
          }
        } catch (e) {
          // Fall through to return raw value
        }
      }

      // Type 13, 14 = numbers
      if (type === 13 || type === 14) {
        const num = parseFloat(value)
        if (!isNaN(num)) {
          return num.toLocaleString('ru-RU')
        }
      }

      return String(value)
    }

    onMounted(() => {
      if (props.endpointId) {
        fetchData()
      }
    })

    return {
      loading: computed(() => loading.value || props.externalLoading),
      error,
      tableData,
      tableColumns,
      showCreateTokenDialog,
      isTokensTable,
      fetchData,
      openCreateTokenDialog,
      handleTokenCreated
    }
  }
}
</script>

<style scoped>
.primevue-table-wrapper {
  width: 100%;
}

.p-card {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
  transition: transform 0.3s, box-shadow 0.3s;
}

:deep(.p-card-title) {
  font-size: 1.25rem;
  font-weight: 600;
  display: flex;
  align-items: center;
}

:deep(.p-datatable) {
  border-radius: 10px;
  overflow: hidden;
}

:deep(.p-datatable-thead > tr > th) {
  background-color: var(--surface-ground);
  font-weight: 600;
  color: var(--text-color);
  border-bottom: 2px solid var(--surface-border);
}

:deep(.p-datatable-tbody > tr:hover) {
  background-color: var(--surface-hover);
}

:deep(.p-paginator) {
  border-radius: 0 0 10px 10px;
  background: var(--surface-ground);
}

/* Стили для ячеек моделей */
:deep(.model-cell) {
  padding: 0.75rem 0;
}

.model-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.25rem;
}

.model-provider {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
}

.model-provider i {
  color: var(--primary-color);
}

/* Стили для ячеек цен */
:deep(.price-cell) {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.price-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--green-600);
}

/* Стили для ячеек агентов */
:deep(.agent-cell) {
  padding: 0.75rem 0;
}

.agent-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.25rem;
}

.agent-description {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.4;
}

/* Стили для ячеек категорий */
:deep(.category-cell) {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
}

.category-cell i {
  color: var(--purple-500);
}

/* Стили для ячеек статуса */
:deep(.status-cell) {
  display: flex;
  align-items: center;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-badge.active {
  background-color: var(--green-100);
  color: var(--green-800);
  border: 1px solid var(--green-200);
}

.status-badge.inactive {
  background-color: var(--orange-100);
  color: var(--orange-800);
  border: 1px solid var(--orange-200);
}

.status-badge i {
  font-size: 0.75rem;
}

/* Стили для ячеек интеллекта */
:deep(.intelligence-cell) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.intelligence-rating {
  color: #FFD700;
  font-size: 1rem;
  text-shadow: 0 0 3px rgba(255, 215, 0, 0.5);
}

.intelligence-value {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

/* Стили для ячеек действий */
:deep(.actions-cell) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
}

.action-button {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  outline: none;
}

.action-button.activate {
  background: var(--green-500);
  color: white;
}

.action-button.activate:hover {
  background: var(--green-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(34, 197, 94, 0.3);
}

.action-button.deactivate {
  background: var(--orange-500);
  color: white;
}

.action-button.deactivate:hover {
  background: var(--orange-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(249, 115, 22, 0.3);
}

.action-button i {
  font-size: 0.875rem;
}

/* Общие стили */
.text-muted {
  color: var(--text-color-secondary);
  font-style: italic;
}

/* Debug info styles */
.debug-info {
  margin-bottom: 1rem;
}

.debug-info pre {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.8rem;
  max-height: 300px;
  overflow-y: auto;
}

.debug-info h4 {
  margin: 0 0 1rem 0;
  color: var(--text-color);
}

.debug-info p {
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

/* Issue #3955: Styles for Tokens table */
:deep(.token-cell) {
  padding: 0.75rem 0;
}

.token-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.25rem;
}

.token-description {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.4;
}

:deep(.balance-cell) {
  display: flex;
  align-items: center;
}

.balance-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--blue-600);
}

:deep(.rating-cell) {
  display: flex;
  align-items: center;
}

.rating-stars {
  font-size: 1.1rem;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
}

.limit-value {
  font-size: 0.875rem;
  color: var(--text-color);
}

/* Issue #3955: Styles for Payments table */
:deep(.payment-cell) {
  padding: 0.75rem 0;
}

.payment-description {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.25rem;
}

.payment-id {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

:deep(.amount-cell) {
  display: flex;
  align-items: center;
}

.amount-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--green-600);
}

:deep(.tokens-cell) {
  display: flex;
  align-items: center;
}

.tokens-value {
  font-size: 0.875rem;
  color: var(--blue-600);
}

:deep(.payment-status-cell) {
  display: flex;
  align-items: center;
}

.payment-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.payment-status-badge.success {
  background-color: var(--green-100);
  color: var(--green-800);
  border: 1px solid var(--green-200);
}

.payment-status-badge.failed {
  background-color: var(--red-100);
  color: var(--red-800);
  border: 1px solid var(--red-200);
}

.payment-status-badge.pending {
  background-color: var(--orange-100);
  color: var(--orange-800);
  border: 1px solid var(--orange-200);
}

.payment-status-badge i {
  font-size: 0.75rem;
}
</style>