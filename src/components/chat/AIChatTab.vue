<template>
  <div class="ai-chat-tab">
    <div class="chat-container-fullpage">
      <div class="messages-fullpage" ref="messagesContainer">
        <div v-for="(msg, index) in messages" :key="index" class="message"
          :class="{ 'user-message': msg.isUser }">
          <div class="message-content" v-if="!isSystemMessage(msg)">
            <div v-if="msg.attachments && msg.attachments.length > 0" class="attachment-info">
              <div v-for="(attachment, attIndex) in msg.attachments" :key="attIndex" class="attachment-item">
                <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview"
                     @click="$emit('show-image', attachment.url)" />
                <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                <Button v-if="attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                  @click="$emit('download-attachment', attachment)" />
              </div>
            </div>

            <div class="message-text">
              <MarkdownRender :content="msg.text" />
              <span v-if="loading && msg === assistantMessage" class="streaming-cursor"></span>
            </div>
            <div class="message-actions">
              <div class="message-time">{{ msg.time }}</div>
              <div class="action-buttons">
                <Button v-if="!msg.isUser" icon="pi pi-copy" title="Скопировать"
                  class="copy-button p-button-text p-button-sm" @click="copyToClipboard(msg.text)" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading && !assistantMessage" class="loading-indicator">
          <ProgressSpinner style="width: 30px; height: 30px" />
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </div>

      <div class="controls-fullpage">
        <div class="control-cards">
          <div class="control-card modern-control-card">
            <ModelSelector
              v-model="selectedModel"
              application="ChatPage"
              :access-token="accessToken"
              :show-header="false"
              :show-token-info="false"
              @model-change="handleModelChange"
            />
          </div>

          <div v-if="agentMode" class="control-card modern-control-card workspace-card">
            <div class="control-card-header">
              <i class="pi pi-folder-open control-card-icon"></i>
              <span class="control-card-title">Workspace</span>
            </div>
            <div class="workspace-controls">
              <Dropdown v-model="selectedWorkspace" :options="workspaces" optionLabel="name" optionValue="id"
                placeholder="Выберите workspace" class="flex-1 modern-dropdown" :filter="true" :loading="loadingWorkspaces">
                <template #value="slotProps">
                  <div v-if="slotProps.value" class="workspace-option">
                    <i class="pi pi-folder mr-2"></i>
                    <span>{{ getWorkspaceName(slotProps.value) }}</span>
                  </div>
                  <span v-else>{{ slotProps.placeholder }}</span>
                </template>
                <template #option="slotProps">
                  <div class="workspace-option">
                    <i class="pi pi-folder mr-2"></i>
                    <span>{{ slotProps.option.name }}</span>
                  </div>
                </template>
              </Dropdown>
              <div class="workspace-action-buttons">
                <Button icon="pi pi-robot" @click="$router.push('/agents/workspace-ai')"
                        severity="info" outlined size="small" title="Открыть Workspace AI Agent" rounded />
                <Button icon="pi pi-plus" @click="$emit('create-workspace')"
                        severity="success" outlined size="small" title="Создать workspace" rounded />
                <Button icon="pi pi-refresh" @click="$emit('refresh-workspaces')" :loading="loadingWorkspaces"
                        severity="secondary" outlined size="small" title="Обновить список" rounded />
              </div>
            </div>
          </div>
        </div>

        <div class="input-container-fullpage">
          <Button icon="pi pi-microphone" @click="$emit('toggle-voice')"
                :class="['p-button-text', 'voice-btn', { 'recording': isRecording }]"
                title="Голосовой ввод" />
          <InputText v-model="inputMessage" placeholder="Задайте вопрос ИИ..." @keyup.enter="sendMessage"
            class="input-field-fullpage" :disabled="loading" />

          <input type="file" ref="fileInput" style="display: none" @change="handleFileUpload"
               accept=".txt,.pdf,.doc,.docx,.xls,.xlsx,.json,.csv,image/*" multiple />

          <Button icon="pi pi-paperclip" @click="attachmentMenu.toggle($event)" class="p-button-text attachment-btn" title="Прикрепить файл" />
          <Popover ref="attachmentMenu">
            <div class="attachment-menu">
              <Button label="С устройства" icon="pi pi-upload" @click="triggerFileUpload(); attachmentMenu.hide()" class="p-button-text w-full justify-start" />
              <Button label="Таблицы/отчёты" icon="pi pi-database" @click="$emit('show-data-selector'); attachmentMenu.hide()" class="p-button-text w-full justify-start" />
            </div>
          </Popover>
          <Button icon="pi pi-send" @click="sendMessage" severity="help" :disabled="loading" class="send-btn" title="Отправить сообщение"/>
        </div>

        <div v-if="uploadProgress > 0" class="upload-progress">
          <ProgressBar :value="uploadProgress" :showValue="false" />
          <span>Загрузка: {{ uploadProgress }}%</span>
        </div>

        <div v-if="currentAttachments.length > 0" class="current-attachments">
          <div v-for="(attachment, index) in currentAttachments" :key="index" class="current-attachment">
            <div class="attachment-info current">
              <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview-small" />
              <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
              <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
              <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
              <Button icon="pi pi-times" class="p-button-text p-button-sm p-button-danger remove-btn"
                @click="removeAttachment(index)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import MarkdownRender from '@/components/MarkdownRender.vue'
import ModelSelector from '@/components/ai/ModelSelector.vue'

const props = defineProps({
  messages: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  },
  assistantMessage: {
    type: Object,
    default: null
  },
  selectedModel: {
    type: String,
    default: null
  },
  accessToken: {
    type: String,
    default: null
  },
  agentMode: {
    type: Boolean,
    default: false
  },
  workspaces: {
    type: Array,
    default: () => []
  },
  selectedWorkspace: {
    type: String,
    default: null
  },
  loadingWorkspaces: {
    type: Boolean,
    default: false
  },
  isRecording: {
    type: Boolean,
    default: false
  },
  uploadProgress: {
    type: Number,
    default: 0
  },
  currentAttachments: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'send-message',
  'model-change',
  'show-image',
  'download-attachment',
  'create-workspace',
  'refresh-workspaces',
  'toggle-voice',
  'show-data-selector',
  'file-upload',
  'remove-attachment',
  'update:selectedWorkspace'
])

const inputMessage = ref('')
const messagesContainer = ref(null)
const fileInput = ref(null)
const attachmentMenu = ref(null)

// Helper functions
const isSystemMessage = (msg) => {
  return msg.text && msg.text.includes('Ты цифровой помощник') && msg.isUser
}

const isImage = (attachment) => {
  if (!attachment) return false
  const url = attachment.url || attachment.path || ''
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url)
}

const getAttachmentIcon = (attachment) => {
  const ext = attachment.name?.split('.').pop()?.toLowerCase() || ''
  const iconMap = {
    pdf: 'pi pi-file-pdf',
    doc: 'pi pi-file-word',
    docx: 'pi pi-file-word',
    xls: 'pi pi-file-excel',
    xlsx: 'pi pi-file-excel',
    json: 'pi pi-code',
    csv: 'pi pi-table',
    txt: 'pi pi-file'
  }
  return iconMap[ext] || 'pi pi-file'
}

const getAttachmentDisplayName = (attachment) => {
  return attachment.name || attachment.path?.split('/').pop() || 'File'
}

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const getWorkspaceName = (id) => {
  const workspace = props.workspaces.find(w => w.id === id)
  return workspace?.name || id
}

const handleModelChange = ({ modelId, model }) => {
  emit('model-change', { modelId, model })
}

const sendMessage = () => {
  if (inputMessage.value.trim() && !props.loading) {
    emit('send-message', inputMessage.value)
    inputMessage.value = ''
  }
}

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = (event) => {
  emit('file-upload', event.target.files)
}

const removeAttachment = (index) => {
  emit('remove-attachment', index)
}

// Auto-scroll to bottom on new messages
watch(() => props.messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.ai-chat-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-container-fullpage {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.messages-fullpage {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: var(--surface-ground);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user-message {
  flex-direction: row-reverse;
}

.message-content {
  max-width: 70%;
  background: var(--surface-card);
  padding: 1rem;
  border-radius: 12px;
  box-shadow: var(--shadow-1);
}

.user-message .message-content {
  background: var(--primary-color);
  color: var(--primary-color-text);
}

.message-text {
  word-wrap: break-word;
}

.streaming-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: currentColor;
  margin-left: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  opacity: 0.7;
}

.message-time {
  font-size: 0.75rem;
}

.loading-indicator,
.error-message {
  padding: 1rem;
  text-align: center;
  border-radius: 8px;
}

.error-message {
  background: var(--red-100);
  color: var(--red-900);
}

.controls-fullpage {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-cards {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.control-card {
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: var(--shadow-2);
  flex: 1;
  min-width: 250px;
}

.modern-control-card {
  transition: all 0.2s ease;
}

.modern-control-card:hover {
  box-shadow: var(--shadow-3);
  transform: translateY(-2px);
}

.control-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
  color: var(--text-color);
}

.workspace-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.workspace-action-buttons {
  display: flex;
  gap: 0.25rem;
}

.input-container-fullpage {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: var(--shadow-2);
}

.input-field-fullpage {
  flex: 1;
}

.voice-btn.recording {
  color: var(--red-500);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.attachment-info {
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
}

.image-preview {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.image-preview:hover {
  transform: scale(1.05);
}

.image-preview-small {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 6px;
}

.attachment-menu {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
}

.current-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  background: var(--surface-card);
  border-radius: 8px;
}
</style>
