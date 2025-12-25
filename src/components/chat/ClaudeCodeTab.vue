<template>
  <div class="claude-code-tab">
    <!-- Session and Git Controls -->
    <div class="controls-bar">
      <Dropdown
        v-model="currentSessionId"
        :options="sessionOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="Select session"
        class="session-selector"
        @change="onSessionChange"
      />
      <Button
        icon="pi pi-plus"
        label="New"
        @click="showNewSessionDialog = true"
        class="p-button-sm"
        title="Create new session"
      />
      <Button
        icon="pi pi-folder-open"
        label="Git"
        @click="showGitPanel = !showGitPanel"
        :class="{ 'p-button-success': gitStatus?.hasChanges }"
        class="p-button-sm"
        title="Git status"
      />
    </div>

    <!-- Git Panel (collapsible) -->
    <div v-if="showGitPanel && currentSessionId" class="git-panel">
      <div class="git-header">
        <h4>
          <i class="pi pi-github" />
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
                size="small"
              />
              <Button
                label="Push"
                icon="pi pi-upload"
                @click="handlePush"
                :loading="pushing"
                size="small"
              />
            </div>
          </div>
        </div>
        <div v-else class="no-changes">
          <i class="pi pi-check-circle" />
          <span>No changes</span>
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
      </div>

      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          @click="showNewSessionDialog = false"
          text
        />
        <Button
          label="Create"
          icon="pi pi-check"
          @click="createSession"
          :loading="creatingSession"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { claudeCodeService } from '@/services/claudeCodeService'

import MarkdownRender from '@/components/MarkdownRender.vue'

const messagesContainer = ref(null)
const userMessage = ref('')
const messages = ref([])
const loading = ref(false)
const streaming = ref(false)
const error = ref('')
const currentSessionId = ref(null)
const sessions = ref([])
const showNewSessionDialog = ref(false)
const showGitPanel = ref(false)
const creatingSession = ref(false)
const loadingGit = ref(false)
const committing = ref(false)
const pushing = ref(false)
const commitMessage = ref('')
const gitStatus = ref(null)

const newSession = reactive({
  repositoryUrl: ''
})

const lastAssistantMessage = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (!messages.value[i].isUser) {
      return messages.value[i]
    }
  }
  return null
})

const sessionOptions = computed(() => {
  return sessions.value.map(s => ({
    label: s.repositoryUrl || `Session ${s.id.substring(0, 8)}`,
    value: s.id
  }))
})

// Initialize: Load user sessions
onMounted(async () => {
  await loadSessions()
})

// Watch for session changes
watch(currentSessionId, async (newId) => {
  if (newId) {
    await refreshGitStatus()
  }
})

async function loadSessions() {
  try {
    // For now, use a default user ID (should be replaced with actual auth)
    const userId = 'default-user'
    const result = await claudeCodeService.getUserSessions(userId)
    sessions.value = result.sessions || []

    // If we have sessions, select the first one
    if (sessions.value.length > 0 && !currentSessionId.value) {
      currentSessionId.value = sessions.value[0].id
    }
  } catch (err) {
    console.error('Failed to load sessions:', err)
    error.value = 'Failed to load sessions: ' + err.message
  }
}

async function createSession() {
  creatingSession.value = true
  error.value = ''

  try {
    const userId = 'default-user'
    const result = await claudeCodeService.createSession(userId, {
      repositoryUrl: newSession.repositoryUrl || null
    })

    sessions.value.push(result.session)
    currentSessionId.value = result.session.id
    showNewSessionDialog.value = false
    newSession.repositoryUrl = ''

    messages.value.push({
      text: `Session created${result.session.repositoryUrl ? ' with repository: ' + result.session.repositoryUrl : ''}`,
      time: new Date().toLocaleTimeString(),
      isUser: false
    })
  } catch (err) {
    console.error('Failed to create session:', err)
    error.value = 'Failed to create session: ' + err.message
  } finally {
    creatingSession.value = false
  }
}

async function sendMessage() {
  if (!userMessage.value.trim() || loading.value || !currentSessionId.value) {
    return
  }

  const message = userMessage.value.trim()
  userMessage.value = ''
  error.value = ''

  // Add user message
  messages.value.push({
    text: message,
    time: new Date().toLocaleTimeString(),
    isUser: true
  })

  scrollToBottom()

  // Create placeholder for assistant response
  const assistantMsg = {
    text: '',
    time: new Date().toLocaleTimeString(),
    isUser: false,
    toolsUsed: [],
    filesModified: []
  }
  messages.value.push(assistantMsg)

  loading.value = true
  streaming.value = true

  try {
    // Stream response from Claude Code
    await claudeCodeService.chat(
      currentSessionId.value,
      message,
      (chunk) => {
        assistantMsg.text += chunk
        scrollToBottom()
      }
    )

    // Refresh git status after chat (files might have been modified)
    if (showGitPanel.value) {
      await refreshGitStatus()
    }
  } catch (err) {
    console.error('Chat error:', err)
    error.value = 'Chat error: ' + err.message
    // Remove the failed assistant message
    messages.value.pop()
  } finally {
    loading.value = false
    streaming.value = false
  }
}

async function refreshGitStatus() {
  if (!currentSessionId.value) return

  loadingGit.value = true
  try {
    const result = await claudeCodeService.getGitStatus(currentSessionId.value)
    gitStatus.value = result.git
  } catch (err) {
    console.error('Failed to get git status:', err)
    // Don't show error in main error area for git status
  } finally {
    loadingGit.value = false
  }
}

async function handleCommit() {
  if (!commitMessage.value.trim()) return

  committing.value = true
  error.value = ''

  try {
    await claudeCodeService.commitChanges(currentSessionId.value, commitMessage.value)
    commitMessage.value = ''
    await refreshGitStatus()

    messages.value.push({
      text: '✅ Changes committed successfully',
      time: new Date().toLocaleTimeString(),
      isUser: false
    })
  } catch (err) {
    console.error('Commit error:', err)
    error.value = 'Commit failed: ' + err.message
  } finally {
    committing.value = false
  }
}

async function handlePush() {
  pushing.value = true
  error.value = ''

  try {
    await claudeCodeService.pushChanges(currentSessionId.value)
    await refreshGitStatus()

    messages.value.push({
      text: '✅ Changes pushed successfully',
      time: new Date().toLocaleTimeString(),
      isUser: false
    })
  } catch (err) {
    console.error('Push error:', err)
    error.value = 'Push failed: ' + err.message
  } finally {
    pushing.value = false
  }
}

function onSessionChange() {
  messages.value = []
  error.value = ''
}

function getGitStatusSeverity(status) {
  const statusMap = {
    'M': 'warning',
    'A': 'success',
    'D': 'danger',
    '??': 'info'
  }
  return statusMap[status] || 'secondary'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>

<style scoped>
.claude-code-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.5rem;
}

.controls-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.session-selector {
  flex: 1;
  min-width: 0;
}

.git-panel {
  background: var(--surface-ground);
  border-radius: 8px;
  padding: 0.75rem;
}

.git-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.git-header h4 {
  margin: 0;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.git-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.git-remote {
  opacity: 0.7;
  font-size: 0.75rem;
}

.git-changes h5 {
  margin: 0.5rem 0;
  font-size: 0.85rem;
}

.git-file {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.85rem;
}

.filepath {
  font-family: monospace;
}

.git-actions {
  margin-top: 0.75rem;
}

.no-changes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  opacity: 0.7;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  min-height: 0;
}

.message {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}

.message.user-message {
  flex-direction: row-reverse;
}

.message-content {
  background: var(--surface-ground);
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  max-width: 80%;
}

.user-message .message-content {
  background: var(--primary-color);
  color: white;
}

.message-text {
  margin-bottom: 0.25rem;
}

.message-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  opacity: 0.7;
  flex-wrap: wrap;
}

.tools-used,
.files-modified {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.streaming-cursor::after {
  content: '|';
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.input-container {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.input-field {
  flex: 1;
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.error-message {
  color: var(--red-500);
  padding: 0.5rem;
  background: var(--red-50);
  border-radius: 4px;
  margin: 0.5rem;
  font-size: 0.85rem;
}

.new-session-form .field {
  margin-bottom: 1rem;
}

.new-session-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.new-session-form small {
  display: block;
  margin-top: 0.25rem;
  opacity: 0.7;
}
</style>
