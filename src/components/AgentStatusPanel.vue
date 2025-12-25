<template>
  <Sidebar
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    position="right"
    :showCloseIcon="true"
    class="agent-status-sidebar"
  >
    <template #header>
      <h3>Статус агентов</h3>
    </template>

    <div class="agent-status-content">
      <div v-if="runningAgents.length === 0" class="empty-state">
        <i class="pi pi-bolt" style="font-size: 3rem; color: var(--text-color-secondary);"></i>
        <p>Нет запущенных агентов</p>
      </div>

      <div v-else class="agents-list">
        <div
          v-for="agent in runningAgents"
          :key="agent.id"
          class="agent-item"
        >
          <div class="agent-header">
            <div class="agent-icon">
              <i class="pi pi-bolt"></i>
            </div>
            <div class="agent-info">
              <h4>{{ agent.name }}</h4>
              <span class="agent-status" :class="getStatusClass(agent.status)">
                {{ agent.status }}
              </span>
            </div>
          </div>
          <div class="agent-details">
            <div class="detail-item">
              <span class="detail-label">Тип:</span>
              <span class="detail-value">{{ agent.type }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Запущен:</span>
              <span class="detail-value">{{ formatTime(agent.startedAt) }}</span>
            </div>
          </div>
          <div class="agent-actions">
            <Button
              label="Остановить"
              icon="pi pi-stop"
              size="small"
              severity="danger"
              outlined
              @click="stopAgent(agent.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useWorkspaceAgentStore } from '@/stores/workspaceAgentStore'
import Sidebar from 'primevue/sidebar'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'update:visible'])

const workspaceAgentStore = useWorkspaceAgentStore()

const runningAgents = computed(() => {
  return workspaceAgentStore.runningAgents || []
})

const getStatusClass = (status) => {
  const statusClasses = {
    running: 'status-running',
    stopped: 'status-stopped',
    error: 'status-error'
  }
  return statusClasses[status] || ''
}

const stopAgent = async (agentId) => {
  try {
    await workspaceAgentStore.stopAgent(agentId)
  } catch (error) {
    console.error('Failed to stop agent:', error)
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  return `${hours} ч назад`
}
</script>

<style scoped>
.agent-status-content {
  padding: 1rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
}

.agents-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.agent-item {
  padding: 1rem;
  border-radius: 8px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}

.agent-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.agent-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--green-100);
  color: var(--green-600);
}

.agent-info {
  flex: 1;
}

.agent-info h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.agent-status {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-weight: 600;
}

.status-running {
  background: var(--green-100);
  color: var(--green-700);
}

.status-stopped {
  background: var(--surface-200);
  color: var(--text-color-secondary);
}

.status-error {
  background: var(--red-100);
  color: var(--red-700);
}

.agent-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.detail-label {
  color: var(--text-color-secondary);
}

.detail-value {
  font-weight: 500;
}

.agent-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
