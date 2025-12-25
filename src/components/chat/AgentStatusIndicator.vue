<template>
  <div v-if="runningAgents.length > 0" class="agent-status-panel">
    <div class="panel-header">
      <i class="pi pi-cog" style="font-size: 0.875rem"></i>
      <span>Активные агенты</span>
    </div>
    <div class="agents-list">
      <div
        v-for="(agent, index) in runningAgents"
        :key="`${agent.name}-${index}`"
        class="agent-item"
        :class="`status-${agent.status}`"
      >
        <i :class="getAgentIcon(agent.status)" class="agent-icon"></i>
        <div class="agent-info">
          <span class="agent-name">{{ agent.name }}</span>
          <span class="agent-status">
            <template v-if="agent.status === 'running'">
              ⚙️ Работает<span class="dots">...</span>
            </template>
            <template v-else-if="agent.status === 'completed'">
              ✅ Завершено ({{ formatDuration(agent) }})
            </template>
            <template v-else-if="agent.status === 'failed'">
              ❌ Ошибка: {{ agent.error || 'Неизвестная ошибка' }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  runningAgents: {
    type: Array,
    required: true
  }
})

const getAgentIcon = (status) => {
  switch (status) {
    case 'running':
      return 'pi pi-spin pi-spinner'
    case 'completed':
      return 'pi pi-check-circle'
    case 'failed':
      return 'pi pi-times-circle'
    default:
      return 'pi pi-info-circle'
  }
}

const formatDuration = (agent) => {
  if (!agent.endTime || !agent.startTime) return ''
  const duration = agent.endTime - agent.startTime
  const seconds = Math.floor(duration / 1000)
  if (seconds < 1) return '< 1с'
  if (seconds < 60) return `${seconds}с`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}м ${remainingSeconds}с`
}
</script>

<style scoped>
.agent-status-panel {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.agents-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.agent-item {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.agent-item.status-running {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
}

.agent-item.status-completed {
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid #22c55e;
}

.agent-item.status-failed {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
}

.agent-icon {
  font-size: 1rem;
  margin-top: 0.125rem;
}

.status-running .agent-icon {
  color: #3b82f6;
}

.status-completed .agent-icon {
  color: #22c55e;
}

.status-failed .agent-icon {
  color: #ef4444;
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.agent-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

.agent-status {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.dots {
  animation: blink 1.4s infinite;
}

@keyframes blink {
  0%, 20% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}
</style>
