<template>
  <Dialog v-model:visible="isVisible" :modal="true" :closable="true" :draggable="false" class="modern-dialog history-dialog">
    <template #header>
      <div class="dialog-header">
        <i class="pi pi-history mr-2"></i>
        <span>История чатов</span>
      </div>
    </template>

    <div class="history-content">
      <!-- Quick Actions Cards -->
      <div class="history-actions-grid">
        <div class="action-card" @click="handleQuickSave" :class="{ disabled: !canSaveCurrentChat }">
          <div class="action-card-icon success">
            <i class="pi pi-save"></i>
          </div>
          <div class="action-card-content">
            <div class="action-card-title">Сохранить чат</div>
            <div class="action-card-desc">Быстрое сохранение</div>
          </div>
        </div>

        <div class="action-card" @click="handleStartNewChat">
          <div class="action-card-icon primary">
            <i class="pi pi-plus"></i>
          </div>
          <div class="action-card-content">
            <div class="action-card-title">Новый чат</div>
            <div class="action-card-desc">Начать сначала</div>
          </div>
        </div>

        <div class="action-card" @click="handleClearAll" :class="{ disabled: savedChats.length === 0 }">
          <div class="action-card-icon danger">
            <i class="pi pi-trash"></i>
          </div>
          <div class="action-card-content">
            <div class="action-card-title">Очистить всё</div>
            <div class="action-card-desc">Удалить историю</div>
          </div>
        </div>
      </div>

      <!-- Custom Name Save -->
      <div class="save-chat-section">
        <label class="save-label">
          <i class="pi pi-bookmark"></i>
          <span>Сохранить с названием</span>
        </label>
        <div class="save-input-group">
          <InputText v-model="newChatName" placeholder="Введите название чата..." class="save-input" />
          <Button icon="pi pi-save" @click="handleSaveWithName" :disabled="!newChatName"
                  severity="success" class="save-button" label="Сохранить" />
        </div>
      </div>

      <div class="section-divider">
        <span class="divider-text">Сохранённые чаты ({{ savedChats.length }})</span>
      </div>

      <div v-if="savedChats.length === 0" class="empty-history">
        <i class="pi pi-inbox empty-icon"></i>
        <p>Нет сохранённых чатов</p>
        <small>Сохраните текущий разговор, чтобы вернуться к нему позже</small>
      </div>

      <div v-else class="saved-chats-grid">
        <div v-for="(chat, index) in savedChats" :key="index" class="chat-card">
          <div class="chat-card-header">
            <div class="chat-icon">
              <i class="pi pi-comments"></i>
            </div>
            <div class="chat-header-info">
              <div class="chat-title">{{ chat.name }}</div>
              <div class="chat-date">
                <i class="pi pi-clock"></i>
                <span>{{ chat.date }}</span>
              </div>
            </div>
          </div>

          <div class="chat-card-body">
            <div class="chat-preview" v-if="chat.messages && chat.messages.length > 0">
              <span class="preview-label">Последнее сообщение:</span>
              <span class="preview-text">{{ getFirstUserMessage(chat) }}</span>
            </div>
          </div>

          <div class="chat-card-footer">
            <div class="chat-stats">
              <span class="stat-badge">
                <i class="pi pi-comments"></i>
                {{ chat.messages?.length || 0 }}
              </span>
            </div>
            <div class="chat-card-actions">
              <Button icon="pi pi-folder-open" @click="handleLoadChat(chat)"
                      severity="info" text rounded
                      class="action-btn" title="Загрузить чат" />
              <Button icon="pi pi-trash" @click="handleDeleteChat(index)"
                      severity="danger" text rounded
                      class="action-btn" title="Удалить чат" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  savedChats: {
    type: Array,
    default: () => []
  },
  canSaveCurrentChat: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:visible',
  'quickSave',
  'startNewChat',
  'clearAll',
  'saveWithName',
  'loadChat',
  'deleteChat'
])

const newChatName = ref('')

const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

function getFirstUserMessage(chat) {
  if (!chat.messages || chat.messages.length === 0) return 'Нет сообщений'
  const firstUserMsg = chat.messages.find(msg => msg.isUser)
  if (!firstUserMsg) return 'Нет сообщений от пользователя'
  const text = firstUserMsg.text || ''
  return text.length > 80 ? text.substring(0, 80) + '...' : text
}

function handleQuickSave() {
  emit('quickSave')
}

function handleStartNewChat() {
  emit('startNewChat')
}

function handleClearAll() {
  emit('clearAll')
}

function handleSaveWithName() {
  if (newChatName.value) {
    emit('saveWithName', newChatName.value)
    newChatName.value = ''
  }
}

function handleLoadChat(chat) {
  emit('loadChat', chat)
}

function handleDeleteChat(index) {
  emit('deleteChat', index)
}
</script>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 1.1rem;
}

.history-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Action Cards Grid */
.history-actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 0.75rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, var(--primary-color) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.action-card:hover::before {
  opacity: 0.05;
}

.action-card:hover {
  transform: translateY(-4px);
  border-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.action-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.action-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  transition: all 0.3s ease;
}

.action-card-icon.success {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.action-card-icon.primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(var(--primary-500-rgb), 0.3);
}

.action-card-icon.danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.action-card:hover .action-card-icon {
  transform: scale(1.1) rotate(5deg);
}

.action-card-content {
  text-align: center;
}

.action-card-title {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-color);
}

.action-card-desc {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
}

/* Save Chat Section */
.save-chat-section {
  background: linear-gradient(135deg, var(--surface-section) 0%, var(--surface-card) 100%);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.save-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.save-label i {
  color: var(--primary-color);
  font-size: 0.875rem;
}

.save-input-group {
  display: flex;
  gap: 0.5rem;
}

.save-input {
  flex: 1;
}

.save-input :deep(.p-inputtext) {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.save-button {
  min-width: 100px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

/* Section Divider */
.section-divider {
  position: relative;
  text-align: center;
  margin: 1.5rem 0;
}

.section-divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--surface-border) 50%, transparent 100%);
}

.divider-text {
  position: relative;
  display: inline-block;
  padding: 0 1rem;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* History Dialog Width */
:deep(.p-dialog) {
  width: 90vw;
  max-width: 1200px;
}

:deep(.p-dialog-content) {
  max-height: 70vh;
  overflow-y: auto;
}

/* Custom Scrollbar for History Dialog */
:deep(.p-dialog-content)::-webkit-scrollbar {
  width: 8px;
}

:deep(.p-dialog-content)::-webkit-scrollbar-track {
  background: var(--surface-section);
  border-radius: 10px;
}

:deep(.p-dialog-content)::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
  border-radius: 10px;
}

:deep(.p-dialog-content)::-webkit-scrollbar-thumb:hover {
  background: var(--primary-700);
}

/* Empty State */
.empty-history {
  text-align: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, var(--surface-section) 0%, var(--surface-card) 100%);
  border: 2px dashed var(--surface-border);
  border-radius: 16px;
  margin: 1rem 0;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  color: var(--primary-color);
  opacity: 0.3;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-history p {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.empty-history small {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  display: block;
  max-width: 400px;
  margin: 0 auto;
}

/* Saved Chats Grid */
.saved-chats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

/* Chat Card */
.chat-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  animation: fadeInUp 0.4s ease-out backwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-card:nth-child(1) { animation-delay: 0.05s; }
.chat-card:nth-child(2) { animation-delay: 0.1s; }
.chat-card:nth-child(3) { animation-delay: 0.15s; }
.chat-card:nth-child(4) { animation-delay: 0.2s; }
.chat-card:nth-child(5) { animation-delay: 0.25s; }
.chat-card:nth-child(6) { animation-delay: 0.3s; }

.chat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-color) 0%, var(--primary-600) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.chat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  border-color: var(--primary-color);
}

.chat-card:hover::before {
  opacity: 1;
}

/* Chat Card Header */
.chat-card-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  background: linear-gradient(135deg, var(--surface-section) 0%, var(--surface-card) 100%);
  border-bottom: 1px solid var(--surface-border);
}

.chat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(var(--primary-500-rgb), 0.3);
}

.chat-header-info {
  flex: 1;
  min-width: 0;
}

.chat-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-date {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.chat-date i {
  font-size: 0.7rem;
}

/* Chat Card Body */
.chat-card-body {
  padding: 1rem 1.25rem;
  min-height: 60px;
}

.chat-preview {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.preview-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
}

.preview-text {
  font-size: 0.875rem;
  color: var(--text-color);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Chat Card Footer */
.chat-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: var(--surface-section);
  border-top: 1px solid var(--surface-border);
}

.chat-stats {
  display: flex;
  gap: 0.75rem;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.stat-badge i {
  font-size: 0.7rem;
}

.chat-card-actions {
  display: flex;
  gap: 0.25rem;
}

.action-btn {
  transition: all 0.2s ease;
}

.action-btn:hover {
  transform: scale(1.1);
}
</style>
