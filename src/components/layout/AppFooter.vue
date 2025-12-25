<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import packageJson from '../../package.json'
import { getDeploymentInfo } from '@/services/deploymentInfoService'

const version = ref(packageJson.version)
const showVersionTooltip = ref(false)
const deploymentInfo = ref(null)
const loading = ref(true)
let updateInterval = null

// Fetch deployment info
const fetchDeploymentInfo = async () => {
  try {
    deploymentInfo.value = await getDeploymentInfo()
  } catch (error) {
    console.error('Failed to load deployment info:', error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Initial fetch
  await fetchDeploymentInfo()

  // Auto-update every 5 minutes (300000 ms)
  updateInterval = setInterval(fetchDeploymentInfo, 300000)
})

onUnmounted(() => {
  // Clear interval on component unmount
  if (updateInterval) {
    clearInterval(updateInterval)
  }
})

// Format date to readable format
const formatDate = (dateString) => {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateString
  }
}

// Get status color class
const getStatusClass = (status) => {
  switch (status) {
    case 'synchronized':
      return 'text-green-500'
    case 'branch-mismatch':
      return 'text-orange-500'
    case 'unknown':
    case 'error':
      return 'text-red-500'
    default:
      return 'text-muted-color'
  }
}

// Get status icon
const getStatusIcon = (status) => {
  switch (status) {
    case 'synchronized':
      return '✓'
    case 'branch-mismatch':
      return '⚠'
    case 'unknown':
    case 'error':
      return '✗'
    default:
      return '?'
  }
}

// Get status text in Russian
const getStatusText = (status) => {
  switch (status) {
    case 'synchronized':
      return 'Синхронизирован с dev'
    case 'branch-mismatch':
      return 'Ветка не соответствует dev'
    case 'unknown':
      return 'Статус неизвестен'
    case 'error':
      return 'Ошибка получения статуса'
    default:
      return status
  }
}
</script>

<template>
    <div class="layout-footer">
        <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <p class="text-sm">© 2025 DronDoc            <a
                    href="https://github.com/unidel2035/dronedoc2025/blob/master/CHANGELOG.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm text-muted-color hover:text-primary transition-colors"
                    @mouseenter="showVersionTooltip = true"
                    @mouseleave="showVersionTooltip = false"
                    :title="`View changelog for version ${version}`"
                >
                    v{{ version }}
                </a></p>
            </div>

            <!-- Deployment Info (Issue #5069) -->
            <div v-if="!loading && deploymentInfo" class="deployment-info text-xs text-muted-color flex flex-wrap gap-3 justify-center items-center">
                <span v-if="deploymentInfo.lastCommitDate" class="flex items-center gap-1">
                    <i class="pi pi-clock"></i>
                    <span>Обновлено: {{ formatDate(deploymentInfo.lastCommitDate) }}</span>
                </span>
                <span v-if="deploymentInfo.branch" class="flex items-center gap-1">
                    <i class="pi pi-code-branch"></i>
                    <span>Ветка: {{ deploymentInfo.branch }}</span>
                </span>
                <span v-if="deploymentInfo.commitHash" class="flex items-center gap-1">
                    <i class="pi pi-hashtag"></i>
                    <span>{{ deploymentInfo.commitHash }}</span>
                </span>
                <span
                    v-if="deploymentInfo.deploymentStatus"
                    class="flex items-center gap-1 font-semibold"
                    :class="getStatusClass(deploymentInfo.deploymentStatus)"
                    :title="deploymentInfo.lastCommitMessage"
                >
                    <span>{{ getStatusIcon(deploymentInfo.deploymentStatus) }}</span>
                    <span>{{ getStatusText(deploymentInfo.deploymentStatus) }}</span>
                </span>
            </div>
            <div v-else-if="loading" class="deployment-info text-xs text-muted-color text-center">
                <i class="pi pi-spin pi-spinner"></i> Загрузка информации о развертывании...
            </div>

            <div class="flex flex-wrap gap-4 text-sm justify-center">
                <router-link to="/legal/terms-of-service" class="text-muted-color hover:text-primary transition-colors">
                    Условия использования
                </router-link>
                <router-link to="/legal/privacy-policy" class="text-muted-color hover:text-primary transition-colors">
                    Политика конфиденциальности
                </router-link>
                <router-link to="/legal/cookie-policy" class="text-muted-color hover:text-primary transition-colors">
                    Cookies
                </router-link>
                <router-link to="/legal/refund-policy" class="text-muted-color hover:text-primary transition-colors">
                    Возврат средств
                </router-link>
                <router-link to="/legal/acceptable-use-policy" class="text-muted-color hover:text-primary transition-colors">
                    Правила использования
                </router-link>
                <router-link to="/legal/dmca-policy" class="text-muted-color hover:text-primary transition-colors">
                    DMCA
                </router-link>
            </div>
        </div>
    </div>
</template>

<style scoped>
.deployment-info {
  padding: 0.5rem 0;
  border-top: 1px solid var(--surface-border);
}
</style>
