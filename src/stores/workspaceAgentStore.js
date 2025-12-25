/**
 * Workspace Agent Store - Stub implementation
 * Manages workspace agent state
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useWorkspaceAgentStore = defineStore('workspaceAgent', () => {
  const runningAgents = ref([])

  const runningAgentsCount = computed(() => runningAgents.value.length)
  const hasActiveAgents = computed(() => runningAgents.value.length > 0)

  return {
    runningAgents,
    runningAgentsCount,
    hasActiveAgents
  }
})
