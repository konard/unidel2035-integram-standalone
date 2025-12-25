<template>
  <div class="claude-code-chat">
    <!-- Session Selector -->
    <div class="session-header">
      <Dropdown
        v-model="currentSessionId"
        :options="sessions"
        optionLabel="label"
        optionValue="id"
        placeholder="Select or create session"
        class="w-full"
      >
        <template #value="slotProps">
          <div v-if="slotProps.value" class="flex align-items-center gap-2">
            <i class="pi pi-folder" />
            <span>{{ getSessionLabel(slotProps.value) }}</span>
          </div>
          <span v-else>Select or create session</span>
        </template>
      </Dropdown>
      <Button
        icon="pi pi-plus"
        label="New Session"
        @click="showNewSessionDialog = true"
        class="p-button-sm"
      />
      <Button
        icon="pi pi-folder-open"
        label="Git"
        @click="showGitPanel = !showGitPanel"
        :class="{ 'p-button-success': gitStatus?.hasChanges }"
        class="p-button-sm"
      />
    </div>

    <!-- Git Panel (collapsible) -->
    <div v-if="showGitPanel && currentSessionId" class="git-panel">
      <div class="git-header">
        <h4>
          <i class="pi pi-git" />
          Git Status
        </h4>
        <Button
          icon="pi pi-refresh"
          @click="refreshGitStatus"
          class="p-button-text p-button-sm"
          :loading="loadingGit"
        />
      </div>

      <div v-if="gitStatus" class="git-status">
        <div class="git-info">
          <span><strong>Branch:</strong> {{ gitStatus.branch }}</span>
          <span v-if="gitStatus.remoteUrl" class="git-remote">{{ gitStatus.remoteUrl }}</span>
        </div>

        <div v-if="gitStatus.hasChanges" class="git-changes">
          <h5>Changes ({{ gitStatus.files.length }})</h5>
          <div v-for="file in gitStatus.files" :key="file.filepath" class="git-file">
            <Badge :value="file.status" :severity="getGitStatusSeverity(file.status)" />
            <span class="filepath">{{ file.filepath }}</span>
          </div>

          <div class="git-actions">
            <InputText
              v-model="commitMessage"
              placeholder="Commit message..."
              class="w-full mb-2"
            />
            <div class="flex gap-2">
              <Button
                label="Commit"
                icon="pi pi-check"
                @click="handleCommit"
                :disabled="!commitMessage.trim()"
                :loading="committing"
                severity="success"
              />
              <Button
                label="Push"
                icon="pi pi-upload"
                @click="handlePush"
                :loading="pushing"
              />
            </div>
          </div>
        </div>
        <div v-else class="no-changes">
          <i class="pi pi-check-circle" />
          <span>No changes to commit</span>
        </div>
      </div>
    </div>

    <!-- Chat Messages -->
    <div class="messages" ref="messagesContainer">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="message"
        :class="{ 'user-message': msg.isUser }"
      >
        <Avatar
          :icon="msg.isUser ? 'pi pi-user' : 'pi pi-code'"
          shape="circle"
          :class="msg.isUser ? 'user-avatar' : 'assistant-avatar'"
        />
        <div class="message-content">
          <div class="message-text">
            <MarkdownRender :content="msg.text" />
            <span v-if="streaming && msg === lastAssistantMessage" class="streaming-cursor" />
          </div>
          <div class="message-meta">
            <span class="message-time">{{ msg.time }}</span>
            <div v-if="msg.toolsUsed && msg.toolsUsed.length > 0" class="tools-used">
              <i class="pi pi-wrench" />
              <span>Tools: {{ msg.toolsUsed.join(', ') }}</span>
            </div>
            <div v-if="msg.filesModified && msg.filesModified.length > 0" class="files-modified">
              <i class="pi pi-file-edit" />
              <span>Modified: {{ msg.filesModified.length }} file(s)</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading && !lastAssistantMessage" class="loading-indicator">
        <ProgressSpinner style="width: 30px; height: 30px" />
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>

    <!-- Input -->
    <div class="input-container">
      <InputText
        v-model="userMessage"
        placeholder="Ask Claude Code to work on your code..."
        @keyup.enter="sendMessage"
        class="input-field"
        :disabled="loading || !currentSessionId"
      />
      <Button
        icon="pi pi-send"
        @click="sendMessage"
        :disabled="loading || !userMessage.trim() || !currentSessionId"
        severity="help"
        class="send-btn"
      />
    </div>

    <!-- New Session Dialog -->
    <Dialog
      v-model:visible="showNewSessionDialog"
      modal
      header="Create New Claude Code Session"
      :style="{ width: '500px' }"
    >
      <div class="new-session-form">
        <div class="field">
          <label>Repository URL (optional)</label>
          <InputText
            v-model="newSession.repositoryUrl"
            placeholder="https://github.com/username/repo.git"
            class="w-full"
          />
          <small>Leave empty to start with an empty workspace</small>
        </div>

        <div class="field">
          <label>Allowed Tools</label>
          <MultiSelect
            v-model="newSession.allowedTools"
            :options="availableTools"
            placeholder="Select tools"
            class="w-full"
          />
        </div>

        <div class="field">
          <label>Permission Mode</label>
          <Dropdown
            v-model="newSession.permissionMode"
            :options="[
              { label: 'Auto-accept edits', value: 'acceptEdits' },
              { label: 'Ask before editing', value: 'ask' }
            ]"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          @click="showNewSessionDialog = false"
          class="p-button-text"
        />
        <Button
          label="Create"
          icon="pi pi-check"
          @click="createNewSession"
          :loading="creatingSession"
          severity="success"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue';
import MarkdownRender from '@/components/MarkdownRender.vue';
import claudeCodeService from '@/services/claudeCodeService';

// Props
const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
});

// State
const currentSessionId = ref(null);
const sessions = ref([]);
const messages = ref([]);
const userMessage = ref('');
const loading = ref(false);
const streaming = ref(false);
const error = ref(null);
const lastAssistantMessage = ref(null);
const messagesContainer = ref(null);

// Git state
const showGitPanel = ref(false);
const gitStatus = ref(null);
const loadingGit = ref(false);
const commitMessage = ref('');
const committing = ref(false);
const pushing = ref(false);

// New session state
const showNewSessionDialog = ref(false);
const creatingSession = ref(false);
const newSession = reactive({
  repositoryUrl: '',
  allowedTools: ['Read', 'Write', 'Bash', 'WebFetch', 'Glob', 'Grep'],
  permissionMode: 'acceptEdits',
});

const availableTools = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'WebFetch',
  'WebSearch',
  'Glob',
  'Grep',
  'Task',
];

// Computed
const getSessionLabel = (sessionId) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (!session) return sessionId;
  return session.label || `Session ${sessionId.substring(0, 8)}`;
};

const getGitStatusSeverity = (status) => {
  if (status === 'M') return 'warning';
  if (status === 'A') return 'success';
  if (status === 'D') return 'danger';
  return 'info';
};

// Methods
const loadSessions = async () => {
  try {
    const userSessions = await claudeCodeService.getUserSessions(props.userId);
    sessions.value = userSessions.map(s => ({
      id: s.id,
      label: s.repositoryUrl
        ? `${s.repositoryUrl.split('/').pop().replace('.git', '')} (${s.messageCount} msgs)`
        : `Session ${s.id.substring(0, 8)} (${s.messageCount} msgs)`,
      ...s,
    }));

    // Load last used session from localStorage
    const lastSessionId = localStorage.getItem(`claudeCode_lastSession_${props.userId}`);
    if (lastSessionId && sessions.value.some(s => s.id === lastSessionId)) {
      currentSessionId.value = lastSessionId;
    }
  } catch (err) {
    console.error('Failed to load sessions:', err);
    error.value = 'Failed to load sessions: ' + err.message;
  }
};

const createNewSession = async () => {
  creatingSession.value = true;
  error.value = null;

  try {
    const session = await claudeCodeService.createSession(props.userId, {
      repositoryUrl: newSession.repositoryUrl || undefined,
      allowedTools: newSession.allowedTools,
      permissionMode: newSession.permissionMode,
    });

    sessions.value.push({
      id: session.id,
      label: session.repositoryUrl
        ? session.repositoryUrl.split('/').pop().replace('.git', '')
        : `Session ${session.id.substring(0, 8)}`,
      ...session,
    });

    currentSessionId.value = session.id;
    showNewSessionDialog.value = false;

    // Reset form
    newSession.repositoryUrl = '';
    newSession.allowedTools = ['Read', 'Write', 'Bash', 'WebFetch', 'Glob', 'Grep'];
    newSession.permissionMode = 'acceptEdits';
  } catch (err) {
    console.error('Failed to create session:', err);
    error.value = 'Failed to create session: ' + err.message;
  } finally {
    creatingSession.value = false;
  }
};

const sendMessage = async () => {
  if (!userMessage.value.trim() || !currentSessionId.value || loading.value) return;

  const message = userMessage.value.trim();
  userMessage.value = '';
  error.value = null;
  loading.value = true;
  streaming.value = true;

  // Add user message
  messages.value.push({
    text: message,
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    isUser: true,
  });

  scrollToBottom();

  // Add assistant placeholder
  const assistantMsg = {
    text: '',
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    isUser: false,
    toolsUsed: [],
    filesModified: [],
  };
  messages.value.push(assistantMsg);
  lastAssistantMessage.value = assistantMsg;

  try {
    await claudeCodeService.chat(currentSessionId.value, message, (chunk) => {
      assistantMsg.text += chunk;
      scrollToBottom();
    });

    // Refresh Git status after message (might have changed files)
    if (showGitPanel.value) {
      await refreshGitStatus();
    }
  } catch (err) {
    console.error('Chat error:', err);
    error.value = 'Chat error: ' + err.message;
    messages.value = messages.value.filter(m => m !== assistantMsg);
  } finally {
    loading.value = false;
    streaming.value = false;
    lastAssistantMessage.value = null;
    scrollToBottom();
  }
};

const refreshGitStatus = async () => {
  if (!currentSessionId.value) return;

  loadingGit.value = true;
  try {
    gitStatus.value = await claudeCodeService.getGitStatus(currentSessionId.value);
  } catch (err) {
    console.error('Failed to get Git status:', err);
    error.value = 'Failed to get Git status: ' + err.message;
  } finally {
    loadingGit.value = false;
  }
};

const handleCommit = async () => {
  if (!commitMessage.value.trim() || !currentSessionId.value) return;

  committing.value = true;
  try {
    await claudeCodeService.commitChanges(currentSessionId.value, commitMessage.value);
    commitMessage.value = '';
    await refreshGitStatus();
  } catch (err) {
    console.error('Failed to commit:', err);
    error.value = 'Failed to commit: ' + err.message;
  } finally {
    committing.value = false;
  }
};

const handlePush = async () => {
  if (!currentSessionId.value) return;

  pushing.value = true;
  try {
    await claudeCodeService.pushChanges(currentSessionId.value);
    await refreshGitStatus();
  } catch (err) {
    console.error('Failed to push:', err);
    error.value = 'Failed to push: ' + err.message;
  } finally {
    pushing.value = false;
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// Watch for session changes
watch(currentSessionId, (newSessionId) => {
  if (newSessionId) {
    localStorage.setItem(`claudeCode_lastSession_${props.userId}`, newSessionId);
    messages.value = []; // Clear messages when switching sessions
    if (showGitPanel.value) {
      refreshGitStatus();
    }
  }
});

watch(showGitPanel, (isVisible) => {
  if (isVisible && currentSessionId.value) {
    refreshGitStatus();
  }
});

// Lifecycle
onMounted(() => {
  loadSessions();
});
</script>

<style scoped>
.claude-code-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.session-header {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.git-panel {
  padding: 1rem;
  background-color: var(--surface-50);
  border-radius: 6px;
  margin: 0 1rem;
}

.git-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.git-header h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.git-status {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.git-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

.git-remote {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.git-changes h5 {
  margin: 0 0 0.5rem 0;
}

.git-file {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.git-file .filepath {
  font-family: monospace;
  font-size: 0.9rem;
}

.git-actions {
  margin-top: 1rem;
}

.no-changes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--green-500);
  padding: 1rem;
  text-align: center;
  justify-content: center;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.message.user-message {
  flex-direction: row-reverse;
}

.user-avatar {
  background-color: var(--primary-color);
}

.assistant-avatar {
  background-color: var(--purple-500);
}

.message-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.message-text {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background-color: var(--surface-100);
}

.user-message .message-text {
  background-color: var(--primary-100);
}

.message-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  align-items: center;
}

.tools-used,
.files-modified {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.streaming-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background-color: var(--primary-color);
  animation: blink 1s infinite;
  margin-left: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.error-message {
  padding: 1rem;
  background-color: var(--red-50);
  color: var(--red-900);
  border-radius: 6px;
  border-left: 4px solid var(--red-500);
}

.input-container {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--surface-border);
}

.input-field {
  flex: 1;
}

.new-session-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 600;
}
</style>
