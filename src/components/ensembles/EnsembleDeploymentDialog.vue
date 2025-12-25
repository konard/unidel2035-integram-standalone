<template>
  <Dialog
    v-model:visible="isVisible"
    :header="dialogTitle"
    :modal="true"
    :closable="!isDeploying"
    :dismissableMask="false"
    :draggable="false"
    :style="{ width: '50vw' }"
    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
  >
    <!-- Ensemble Preview -->
    <div v-if="!isDeploying && !deploymentResult" class="ensemble-preview">
      <div class="flex align-items-center gap-3 mb-4">
        <div class="text-6xl">{{ ensemble.icon }}</div>
        <div class="flex-1">
          <h3 class="mt-0 mb-2">{{ ensemble.name }}</h3>
          <p class="text-600 my-0">{{ ensemble.description }}</p>
        </div>
      </div>

      <Divider />

      <div class="mb-4">
        <h4 class="mt-0 mb-3">Included Agents ({{ ensemble.agents?.length || 0 }})</h4>
        <div class="grid">
          <div
            v-for="agent in ensemble.agents"
            :key="agent.agentId"
            class="col-12 md:col-6"
          >
            <Card class="mb-2">
              <template #content>
                <div class="flex align-items-center gap-2">
                  <i class="pi pi-check-circle text-green-500"></i>
                  <span class="font-semibold">{{ agent.instanceName || agent.agentId }}</span>
                </div>
              </template>
            </Card>
          </div>
        </div>
      </div>

      <div v-if="ensemble.features && ensemble.features.length > 0" class="mb-4">
        <h4 class="mt-0 mb-3">Features</h4>
        <ul class="pl-4">
          <li v-for="(feature, index) in ensemble.features" :key="index" class="mb-2">
            {{ feature }}
          </li>
        </ul>
      </div>

      <Message v-if="ensemble.estimatedSetupTime" severity="info" :closable="false">
        <template #icon>
          <i class="pi pi-clock mr-2"></i>
        </template>
        Estimated setup time: {{ ensemble.estimatedSetupTime }}
      </Message>
    </div>

    <!-- Deployment Progress -->
    <div v-if="isDeploying" class="deployment-progress">
      <div class="text-center mb-4">
        <ProgressSpinner />
        <h4 class="mt-3 mb-2">Deploying {{ ensemble.name }}...</h4>
        <p class="text-600">Please wait while we set up your agents.</p>
      </div>

      <div v-if="deploymentProgress.currentAgent" class="mb-3">
        <div class="flex align-items-center justify-content-between mb-2">
          <span class="font-semibold">{{ deploymentProgress.currentAgent }}</span>
          <span class="text-sm text-600">
            {{ deploymentProgress.completed }}/{{ deploymentProgress.total }}
          </span>
        </div>
        <ProgressBar
          :value="(deploymentProgress.completed / deploymentProgress.total) * 100"
          :showValue="false"
        />
      </div>
    </div>

    <!-- Deployment Result -->
    <div v-if="deploymentResult && !isDeploying" class="deployment-result">
      <div v-if="deploymentResult.success" class="text-center">
        <div class="text-6xl text-green-500 mb-3">
          <i class="pi pi-check-circle"></i>
        </div>
        <h3 class="mt-0 mb-2">Deployment Successful!</h3>
        <p class="text-600">
          Successfully deployed {{ deploymentResult.deployed }}/{{ deploymentResult.total }} agents
          in {{ deploymentResult.duration }}.
        </p>

        <Divider />

        <div v-if="deploymentResult.onboardingSteps && deploymentResult.onboardingSteps.length > 0">
          <h4 class="mt-0 mb-3">Next Steps</h4>
          <div class="text-left">
            <div
              v-for="step in deploymentResult.onboardingSteps"
              :key="step.step"
              class="mb-3"
            >
              <div class="flex align-items-start gap-2">
                <Badge :value="step.step" class="mt-1" />
                <div>
                  <div class="font-semibold">{{ step.title }}</div>
                  <div class="text-sm text-600">{{ step.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center">
        <div class="text-6xl text-orange-500 mb-3">
          <i class="pi pi-exclamation-triangle"></i>
        </div>
        <h3 class="mt-0 mb-2">Deployment Completed with Issues</h3>
        <p class="text-600">
          Deployed {{ deploymentResult.deployed }}/{{ deploymentResult.total }} agents.
          {{ deploymentResult.failed }} agent(s) failed to deploy.
        </p>

        <div v-if="deploymentResult.errors && deploymentResult.errors.length > 0" class="mt-4">
          <h4 class="mb-3">Errors:</h4>
          <Message
            v-for="(error, index) in deploymentResult.errors"
            :key="index"
            severity="error"
            :closable="false"
            class="mb-2"
          >
            <strong>{{ error.agentId }}:</strong> {{ error.error }}
          </Message>
        </div>
      </div>
    </div>

    <!-- Dialog Footer -->
    <template #footer>
      <div class="flex justify-content-end gap-2">
        <Button
          v-if="!isDeploying && !deploymentResult"
          label="Cancel"
          severity="secondary"
          @click="closeDialog"
        />
        <Button
          v-if="!isDeploying && !deploymentResult"
          label="Deploy Ensemble"
          icon="pi pi-play"
          @click="startDeployment"
        />
        <Button
          v-if="deploymentResult"
          :label="deploymentResult.success ? 'Go to Organization' : 'Close'"
          @click="handleFinish"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import { deployEnsemble, formatDeploymentResult } from '@/services/ensembleService'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  ensemble: {
    type: Object,
    required: true
  },
  organizationId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:visible', 'deployment-complete'])

const router = useRouter()

const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const isDeploying = ref(false)
const deploymentResult = ref(null)
const deploymentProgress = ref({
  completed: 0,
  total: 0,
  currentAgent: null
})

const dialogTitle = computed(() => {
  if (isDeploying.value) return 'Deploying Ensemble...'
  if (deploymentResult.value) return 'Deployment Complete'
  return 'Deploy Ensemble'
})

// Reset state when dialog is opened
watch(() => props.visible, (newValue) => {
  if (newValue) {
    deploymentResult.value = null
    deploymentProgress.value = {
      completed: 0,
      total: props.ensemble.agents?.length || 0,
      currentAgent: null
    }
  }
})

async function startDeployment() {
  isDeploying.value = true

  try {
    // Simulate progress updates (in real scenario, use WebSocket or polling)
    const totalAgents = props.ensemble.agents?.length || 0
    let completed = 0

    const progressInterval = setInterval(() => {
      if (completed < totalAgents) {
        completed++
        deploymentProgress.value.completed = completed
        deploymentProgress.value.currentAgent = props.ensemble.agents[completed - 1]?.instanceName || 'Agent'
      } else {
        clearInterval(progressInterval)
      }
    }, 1500)

    // Deploy ensemble
    const result = await deployEnsemble(props.organizationId, props.ensemble.id, {
      stopOnError: false,
      rollbackOnError: false
    })

    clearInterval(progressInterval)

    deploymentResult.value = formatDeploymentResult(result)

    // Emit completion event
    emit('deployment-complete', deploymentResult.value)

  } catch (error) {
    console.error('Deployment failed:', error)
    deploymentResult.value = {
      success: false,
      ensembleName: props.ensemble.name,
      deployed: 0,
      total: props.ensemble.agents?.length || 0,
      failed: props.ensemble.agents?.length || 0,
      errors: [{ agentId: 'Deployment', error: error.message }]
    }
  } finally {
    isDeploying.value = false
  }
}

function closeDialog() {
  isVisible.value = false
}

function handleFinish() {
  if (deploymentResult.value?.success) {
    // Navigate to organization page
    router.push('/organization')
  }
  closeDialog()
}
</script>

<style scoped>
.ensemble-preview ul {
  list-style: none;
  padding-left: 0;
}

.ensemble-preview ul li:before {
  content: "✓ ";
  color: var(--green-500);
  font-weight: bold;
  margin-right: 0.5rem;
}

:deep(.p-dialog-header) {
  background: var(--surface-0);
  border-bottom: 1px solid var(--surface-border);
}

:deep(.p-dialog-footer) {
  background: var(--surface-0);
  border-top: 1px solid var(--surface-border);
}
</style>
