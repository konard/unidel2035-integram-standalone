<template>
  <div class="general-chat-tab">
    <div class="chat-container-fullpage">
      <div class="messages-fullpage" ref="messagesContainer">
        <div v-for="(msg, index) in messages" :key="index" class="message"
          :class="{ 'user-message': msg.isUser }">
          <Avatar
            v-if="!msg.isUser"
            :image="msg.authorAvatar"
            :label="!msg.authorAvatar ? (msg.authorName ? msg.authorName.substring(0, 2).toUpperCase() : '?') : undefined"
            icon="pi pi-user"
            shape="circle"
            class="clickable-avatar"
            @click="openUserProfile(msg.authorId)"
          />
          <div class="message-content">
            <div v-if="msg.attachment || (msg.attachments && msg.attachments.length > 0)" class="attachment-info">
              <template v-if="msg.attachment">
                <img v-if="isImage(msg.attachment)" :src="msg.attachment.url" class="image-preview"
                     @click="$emit('show-image', msg.attachment.url)" />
                <i v-else :class="getAttachmentIcon(msg.attachment)" class="attachment-icon" />
                <span class="attachment-name">{{ getAttachmentDisplayName(msg.attachment) }}</span>
                <span v-if="msg.attachment.source === 'file'" class="file-size">({{ formatFileSize(msg.attachment.size) }})</span>
                <Button v-if="msg.attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                  @click="$emit('download-attachment', msg.attachment)" />
              </template>
              <template v-else-if="msg.attachments && msg.attachments.length > 0">
                <div v-for="(attachment, attIndex) in msg.attachments" :key="attIndex" class="attachment-item">
                  <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview"
                       @click="$emit('show-image', attachment.url)" />
                  <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                  <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                  <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                  <Button v-if="attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                    @click="$emit('download-attachment', attachment)" />
                </div>
              </template>
            </div>

            <div class="message-text">{{ msg.text }}</div>
            <div class="message-footer">
              <div class="message-time">{{ msg.time }}</div>
              <Button
                v-if="msg.isUser"
                icon="pi pi-trash"
                class="p-button-text p-button-sm p-button-danger delete-btn"
                @click="$emit('delete-message', msg.id)"
                v-tooltip.top="'Удалить'"
              />
            </div>
          </div>
          <Avatar
            v-if="msg.isUser"
            :image="msg.authorAvatar"
            :label="!msg.authorAvatar ? (msg.authorName ? msg.authorName.substring(0, 2).toUpperCase() : '?') : undefined"
            icon="pi pi-user"
            shape="circle"
            class="clickable-avatar"
            @click="openUserProfile(msg.authorId)"
          />
        </div>
      </div>
      <div class="controls-fullpage">
        <div class="input-container-fullpage">
          <InputText v-model="inputMessage" placeholder="Напишите ваше сообщение..." @keyup.enter="sendMessage"
            class="input-field-fullpage" />
          <Button icon="pi pi-send" @click="sendMessage" severity="info" class="send-btn" title="Отправить сообщение"/>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  messages: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['send-message', 'show-image', 'download-attachment', 'delete-message'])

const router = useRouter()
const inputMessage = ref('')
const messagesContainer = ref(null)

/**
 * Open user profile page
 */
const openUserProfile = (authorId) => {
  if (!authorId) return
  router.push(`/integram/my/user/${authorId}`)
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

const sendMessage = () => {
  if (inputMessage.value.trim()) {
    emit('send-message', inputMessage.value)
    inputMessage.value = ''
  }
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
.general-chat-tab {
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
  flex: 1;
  max-width: 70%;
  background: var(--surface-card);
  padding: 1rem;
  border-radius: 12px;
  box-shadow: var(--shadow-1);
}

.user-message .message-content {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-600));
  color: var(--primary-color-text);
}

.message-text {
  word-wrap: break-word;
  margin-bottom: 0.5rem;
}

.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.message-time {
  font-size: 0.75rem;
  opacity: 0.7;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0.25rem !important;
  min-width: auto !important;
}

.message:hover .delete-btn {
  opacity: 0.6;
}

.delete-btn:hover {
  opacity: 1 !important;
}

.controls-fullpage {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-container-fullpage {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: var(--shadow-2);
  transition: box-shadow 0.3s ease;
}

.input-container-fullpage:focus-within {
  box-shadow: var(--shadow-3);
}

.input-field-fullpage {
  flex: 1;
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

.clickable-avatar {
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
}

.clickable-avatar:hover {
  transform: scale(1.05);
  opacity: 0.8;
}
</style>
