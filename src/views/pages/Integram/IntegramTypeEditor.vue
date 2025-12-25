<template>
  <div class="integram-type-editor-page">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Loading State -->
    <Card v-if="!sessionReady">
      <template #content>
        <div class="text-center py-5">
          <ProgressSpinner />
          <p class="mt-3">Инициализация сессии...</p>
        </div>
      </template>
    </Card>

    <!-- Error State -->
    <Card v-else-if="errorMessage">
      <template #content>
        <div class="text-center py-5">
          <Message severity="error" :closable="false">{{ errorMessage }}</Message>
          <Button
            label="Вернуться к списку таблиц"
            icon="pi pi-arrow-left"
            class="mt-3"
            @click="router.push(`/integram/${database}/dict`)"
          />
        </div>
      </template>
    </Card>

    <!-- Type Editor Component -->
    <IntegramTypeEditorComponent
      v-else
      :session="sessionData"
      @view-table="viewTable"
      @refresh="refresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useIntegramSession } from '@/composables/useIntegramSession'
import integramApiClient from '@/services/integramApiClient'
import IntegramTypeEditorComponent from '@/components/integram/IntegramTypeEditor.vue'
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isAuthenticated, database: sessionDatabase } = useIntegramSession()

// State
const sessionReady = ref(false)
const errorMessage = ref('')
const sessionData = ref(null)

// Get database from session or route
const database = computed(() => sessionDatabase.value || 'integram')

// Get typeId from query if provided
const initialTypeId = computed(() => route.query.typeId)

// Breadcrumb items
const breadcrumbItems = computed(() => [
  { label: 'Структура', icon: 'pi pi-sitemap' }
])

// Methods
function viewTable(typeId) {
  // Navigate to object list for this type
  router.push(`/integram/${database.value}/object/${typeId}`)
}

async function refresh() {
  // Trigger router re-navigation to reload component data
  const currentPath = router.currentRoute.value.fullPath
  await router.replace('/integram-reload-placeholder')
  await router.replace(currentPath)
}

// Initialize session
onMounted(async () => {
  try {
    // Check authentication
    if (!isAuthenticated.value) {
      errorMessage.value = 'Не авторизован. Требуется вход в систему.'
      setTimeout(() => {
        router.replace('/integram/login')
      }, 2000)
      return
    }

    // Get authentication info
    const authInfo = integramApiClient.getAuthInfo()

    if (!authInfo || !authInfo.token) {
      errorMessage.value = 'Сессия истекла. Требуется повторный вход.'
      setTimeout(() => {
        router.replace('/integram/login')
      }, 2000)
      return
    }

    // Setup session data for component
    sessionData.value = {
      sessionId: authInfo.token,
      database: authInfo.database || database.value,
      user: authInfo.user
    }

    sessionReady.value = true

    // If typeId provided in query, show notification
    if (initialTypeId.value) {
      toast.add({
        severity: 'info',
        summary: 'Редактирование типа',
        detail: `Тип ID: ${initialTypeId.value}. Найдите его в списке ниже.`,
        life: 5000
      })
    }
  } catch (error) {
    console.error('Session initialization error:', error)
    errorMessage.value = error.message || 'Ошибка инициализации сессии'
  }
})
</script>

<style scoped>
.integram-type-editor-page {
  width: 100%;
  height: 100%;
}
</style>
