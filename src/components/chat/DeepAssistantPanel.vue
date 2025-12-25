<template>
  <div class="deep-assistant-panel">
    <Card class="deep-assistant-card">
      <template #title>
        <div class="card-header">
          <div class="card-title-section">
            <i class="pi pi-box text-primary mr-2"></i>
            <span>Deep Assistant Agent</span>
            <Tag v-if="agentStatus === 'running'" severity="success" value="Running" class="ml-2" />
            <Tag v-else-if="agentStatus === 'error'" severity="danger" value="Error" class="ml-2" />
            <Tag v-else severity="secondary" value="Idle" class="ml-2" />
          </div>
          <div class="card-actions">
            <Button
              icon="pi pi-info-circle"
              title="About Deep Assistant"
              @click="showInfo = true"
              text
              rounded
              size="small"
            />
            <Button
              v-if="agentStatus === 'running'"
              icon="pi pi-stop"
              label="Stop"
              @click="stopExecution"
              severity="danger"
              outlined
              size="small"
            />
          </div>
        </div>
      </template>

      <template #content>
        <!-- Model Selection -->
        <div class="config-section">
          <label class="config-label">
            <i class="pi pi-microchip mr-2"></i>
            Model
          </label>
          <Dropdown
            v-model="selectedModel"
            :options="availableModels"
            optionLabel="name"
            optionValue="id"
            placeholder="Select model"
            :disabled="agentStatus === 'running'"
            class="w-full"
          >
            <template #value="slotProps">
              <div v-if="slotProps.value" class="model-option">
                <span class="model-name">{{ getModelName(slotProps.value) }}</span>
              </div>
              <span v-else>{{ slotProps.placeholder }}</span>
            </template>
            <template #option="slotProps">
              <div class="model-option">
                <div class="model-name">{{ slotProps.option.name }}</div>
                <div class="model-description">{{ slotProps.option.description }}</div>
              </div>
            </template>
          </Dropdown>
        </div>

        <!-- Working Directory -->
        <div class="config-section">
          <label class="config-label">
            <i class="pi pi-folder mr-2"></i>
            Working Directory
          </label>
          <InputText
            v-model="workingDirectory"
            placeholder="Default: current workspace directory"
            :disabled="agentStatus === 'running'"
            class="w-full"
          />
        </div>

        <!-- System Message (optional) -->
        <div class="config-section">
          <div class="flex justify-content-between align-items-center mb-2">
            <label class="config-label mb-0">
              <i class="pi pi-file-edit mr-2"></i>
              System Message (optional)
            </label>
            <Button
              :label="showSystemMessage ? 'Hide' : 'Show'"
              @click="showSystemMessage = !showSystemMessage"
              text
              size="small"
            />
          </div>
          <Textarea
            v-if="showSystemMessage"
            v-model="systemMessage"
            rows="3"
            placeholder="Override default system message"
            :disabled="agentStatus === 'running'"
            class="w-full"
          />
        </div>

        <!-- Execution Output -->
        <div v-if="executionEvents.length > 0" class="execution-output">
          <div class="output-header">
            <i class="pi pi-list mr-2"></i>
            <span>Execution Events ({{ executionEvents.length }})</span>
            <Button
              icon="pi pi-times"
              @click="clearOutput"
              text
              rounded
              size="small"
              class="ml-auto"
              title="Clear output"
            />
          </div>

          <div class="events-container">
            <div
              v-for="(event, index) in executionEvents"
              :key="index"
              class="event-item"
              :class="'event-' + event.type"
            >
              <div class="event-header">
                <i :class="getEventIcon(event.type)" class="event-icon"></i>
                <span class="event-type">{{ event.type }}</span>
                <span class="event-time">{{ event.timestamp }}</span>
              </div>

              <div v-if="event.type === 'text'" class="event-content">
                <pre class="text-content">{{ event.content }}</pre>
              </div>

              <div v-else-if="event.type === 'tool_use'" class="event-content">
                <div class="tool-info">
                  <span class="tool-name">{{ event.toolName }}</span>
                  <Tag :value="event.toolId" severity="secondary" class="tool-id" />
                </div>
                <div v-if="event.toolInput" class="tool-input">
                  <pre>{{ JSON.stringify(event.toolInput, null, 2) }}</pre>
                </div>
              </div>

              <div v-else-if="event.type === 'error'" class="event-content">
                <Message severity="error" :closable="false">
                  {{ event.error }}
                </Message>
              </div>

              <div v-else class="event-content">
                <pre>{{ JSON.stringify(event.data, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <i class="pi pi-inbox empty-icon"></i>
          <p class="empty-text">No execution events yet</p>
          <p class="empty-hint">Send a message to start the agent</p>
        </div>
      </template>
    </Card>

    <!-- Info Dialog -->
    <Dialog
      v-model:visible="showInfo"
      header="About Deep Assistant Agent"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="info-content">
        <h4>What is Deep Assistant?</h4>
        <p>
          Deep Assistant is a Bun-based CLI agent compatible with OpenCode's JSON interface.
          It provides unrestricted execution with 13 powerful tools.
        </p>

        <h4>Available Tools</h4>
        <ul class="tools-list">
          <li><strong>File Operations:</strong> read, write, edit, list</li>
          <li><strong>Search:</strong> glob patterns, grep with regex, websearch, codesearch</li>
          <li><strong>Execution:</strong> bash commands, batch operations, task launching</li>
          <li><strong>Utilities:</strong> todo tracking, URL fetching</li>
        </ul>

        <h4>Features</h4>
        <ul class="features-list">
          <li>Full autonomy with complete file system access</li>
          <li>No sandbox or safety guardrails</li>
          <li>JSON event streaming for real-time results</li>
          <li>Session management with unique IDs</li>
        </ul>

        <Message severity="warn" :closable="false" class="mt-3">
          <strong>Warning:</strong> This agent has unrestricted access. Only use in isolated environments.
        </Message>

        <div class="mt-3">
          <a href="https://github.com/deep-assistant/agent" target="_blank" class="text-primary">
            <i class="pi pi-github mr-2"></i>
            View on GitHub
          </a>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  executeAgentStreaming,
  stopAgent as stopAgentAPI,
  AVAILABLE_MODELS
} from '@/services/deepAssistantService';
import { logger } from '@/utils/logger';

// Props
const props = defineProps({
  workspaceId: {
    type: String,
    default: null
  },
  initialModel: {
    type: String,
    // Fix for Issue #4894: Changed from opencode/grok-code to polza/claude-sonnet-4.5
    default: 'polza/claude-sonnet-4.5'
  }
});

// Emits
const emit = defineEmits(['executionStart', 'executionComplete', 'executionError', 'textChunk']);

// State
const showInfo = ref(false);
const showSystemMessage = ref(false);
const selectedModel = ref(props.initialModel);
const workingDirectory = ref('');
const systemMessage = ref('');
const agentStatus = ref('idle'); // idle, running, error
const currentSessionId = ref(null);
const executionEvents = ref([]);
const availableModels = ref(AVAILABLE_MODELS);

// Computed
const getModelName = (modelId) => {
  const model = availableModels.value.find(m => m.id === modelId);
  return model ? model.name : modelId;
};

const getEventIcon = (eventType) => {
  const icons = {
    'session_start': 'pi pi-play-circle',
    'step_start': 'pi pi-chevron-right',
    'text': 'pi pi-comment',
    'tool_use': 'pi pi-wrench',
    'step_finish': 'pi pi-check-circle',
    'error': 'pi pi-exclamation-circle',
    'session_complete': 'pi pi-check'
  };
  return icons[eventType] || 'pi pi-circle';
};

// Methods
const executeMessage = async (message) => {
  if (!message || agentStatus.value === 'running') {
    return;
  }

  try {
    agentStatus.value = 'running';
    executionEvents.value = [];

    emit('executionStart');

    const { sessionId } = await executeAgentStreaming({
      message,
      workspaceId: props.workspaceId,
      workingDirectory: workingDirectory.value || undefined,
      model: selectedModel.value,
      systemMessage: systemMessage.value || undefined,

      onEvent: (event) => {
        executionEvents.value.push({
          type: event.type,
          timestamp: new Date().toLocaleTimeString(),
          data: event,
          ...event
        });
      },

      onText: (text) => {
        emit('textChunk', text);
        executionEvents.value.push({
          type: 'text',
          timestamp: new Date().toLocaleTimeString(),
          content: text
        });
      },

      onToolUse: (toolInfo) => {
        executionEvents.value.push({
          type: 'tool_use',
          timestamp: new Date().toLocaleTimeString(),
          ...toolInfo
        });
      },

      onError: (error) => {
        agentStatus.value = 'error';
        executionEvents.value.push({
          type: 'error',
          timestamp: new Date().toLocaleTimeString(),
          error: error.message
        });
        emit('executionError', error);
      },

      onComplete: () => {
        agentStatus.value = 'idle';
        emit('executionComplete', {
          sessionId: currentSessionId.value,
          events: executionEvents.value
        });
      }
    });

    currentSessionId.value = sessionId;
    logger.info('Agent execution started', { sessionId });

  } catch (error) {
    agentStatus.value = 'error';
    executionEvents.value.push({
      type: 'error',
      timestamp: new Date().toLocaleTimeString(),
      error: error.message
    });
    emit('executionError', error);
    logger.error('Failed to execute agent', { error: error.message });
  }
};

const stopExecution = async () => {
  if (!currentSessionId.value) {
    return;
  }

  try {
    await stopAgentAPI(currentSessionId.value);
    agentStatus.value = 'idle';
    logger.info('Agent execution stopped', { sessionId: currentSessionId.value });
  } catch (error) {
    logger.error('Failed to stop agent', { error: error.message });
  }
};

const clearOutput = () => {
  executionEvents.value = [];
};

// Watch workspace changes
watch(() => props.workspaceId, () => {
  // Reset state when workspace changes
  if (agentStatus.value === 'running') {
    stopExecution();
  }
  clearOutput();
});

// Expose methods for parent component
defineExpose({
  executeMessage,
  stopExecution,
  clearOutput
});
</script>

<style scoped>
.deep-assistant-panel {
  height: 100%;
}

.deep-assistant-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.card-title-section {
  display: flex;
  align-items: center;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.config-section {
  margin-bottom: 1rem;
}

.config-label {
  display: flex;
  align-items: center;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.model-option {
  display: flex;
  flex-direction: column;
}

.model-name {
  font-weight: 500;
}

.model-description {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.execution-output {
  margin-top: 1.5rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  overflow: hidden;
}

.output-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--surface-100);
  border-bottom: 1px solid var(--surface-border);
  font-weight: 500;
}

.events-container {
  max-height: 500px;
  overflow-y: auto;
  padding: 0.5rem;
}

.event-item {
  margin-bottom: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background: var(--surface-50);
  border: 1px solid var(--surface-border);
}

.event-item.event-error {
  border-color: var(--red-500);
  background: var(--red-50);
}

.event-item.event-tool_use {
  border-color: var(--blue-500);
  background: var(--blue-50);
}

.event-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.event-icon {
  font-size: 0.875rem;
}

.event-type {
  font-weight: 500;
  text-transform: capitalize;
}

.event-time {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.event-content {
  margin-top: 0.5rem;
}

.text-content,
.tool-input pre {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tool-name {
  font-weight: 500;
  color: var(--blue-600);
}

.tool-id {
  font-size: 0.75rem;
}

.tool-input {
  background: var(--surface-0);
  padding: 0.5rem;
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-border);
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
}

.empty-icon {
  font-size: 3rem;
  color: var(--surface-400);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.empty-hint {
  font-size: 0.875rem;
}

.info-content h4 {
  color: var(--text-color);
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.info-content p {
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
}

.tools-list,
.features-list {
  margin-left: 1.5rem;
  color: var(--text-color-secondary);
}

.tools-list li,
.features-list li {
  margin-bottom: 0.5rem;
}

.tools-list strong,
.features-list strong {
  color: var(--text-color);
}
</style>
