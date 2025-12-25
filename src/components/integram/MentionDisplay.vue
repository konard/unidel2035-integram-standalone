<template>
  <span class="mention-display">
    <Popover ref="userPreviewPopover" class="user-preview-popover">
      <div v-if="hoveredUser" class="user-preview-card">
        <div class="user-preview-header">
          <img
            v-if="hoveredUser.photo"
            :src="hoveredUser.photo"
            :alt="hoveredUser.name"
            class="user-preview-avatar"
          />
          <div v-else class="user-preview-avatar-default">
            <i class="pi pi-user"></i>
          </div>
          <div class="user-preview-info">
            <div class="user-preview-name">{{ hoveredUser.name }}</div>
            <div class="user-preview-id">ID: {{ hoveredUser.id }}</div>
          </div>
        </div>
      </div>
    </Popover>

    <template v-for="(segment, index) in segments" :key="index">
      <!-- Text segment with phone/email parsing -->
      <span v-if="segment.type === 'text'" v-html="parseContactInfo(segment.content)"></span>

      <!-- Mention segment with user photo -->
      <span
        v-else-if="segment.type === 'mention' && segment.user"
        class="mention-tag"
        @mouseenter="showUserPreview($event, segment.user)"
        @mouseleave="hideUserPreview"
      >
        <img
          v-if="segment.user.photo"
          :src="segment.user.photo"
          :alt="segment.user.name"
          class="mention-tag-avatar"
          @error="console.log('[MentionDisplay] Photo load error for', segment.user.name, segment.user.photo)"
        />
        <span v-else class="mention-tag-avatar-default">
          <i class="pi pi-user"></i>
        </span>
        <span class="mention-tag-name">{{ segment.user.name }}</span>
      </span>

      <!-- Fallback: show raw mention text if user data is not available -->
      <span v-else class="mention-text-raw">
        {{ segment.content }}
        <span style="font-size: 0.7em; opacity: 0.5;">(user data not loaded, type={{ segment.type }}, user={{ segment.user ? 'exists' : 'null' }})</span>
      </span>
    </template>
  </span>
</template>

<script setup>
import { computed, watch, onMounted, ref } from 'vue'
import Popover from 'primevue/popover'
import { useUserMentions } from './DataTable/composables/useUserMentions'

const props = defineProps({
  text: {
    type: String,
    default: ''
  },
  database: {
    type: String,
    required: true
  }
})

// Refs for user preview popover
const userPreviewPopover = ref(null)
const hoveredUser = ref(null)

// Use user mentions composable
const { users, loadUsers, renderMentions } = useUserMentions(props.database)

// Show user preview on hover
const showUserPreview = (event, user) => {
  hoveredUser.value = user
  if (userPreviewPopover.value) {
    userPreviewPopover.value.show(event)
  }
}

// Hide user preview on mouse leave
const hideUserPreview = () => {
  if (userPreviewPopover.value) {
    userPreviewPopover.value.hide()
  }
  hoveredUser.value = null
}

// Parse phone numbers and emails into HTML
const parseContactInfo = (text) => {
  if (!text) return text

  const phoneRegex = /(\+\d{1,3}[-.\s]?\(?\d{1,4}\)?(?:[-.\s]?\d{1,4}){2,4})/g
  const emailRegex = /([\w.-]+@[\w.-]+\.\w{2,})/gi

  let result = text

  // Replace phone numbers with clickable chips
  result = result.replace(phoneRegex, (match) => {
    const cleanPhone = match.replace(/[-.\s()]/g, '')
    return `<a href="tel:${cleanPhone}" class="cell-chip cell-phone" title="Позвонить: ${match}" onclick="event.stopPropagation()"><i class="pi pi-phone"></i><span>${match}</span></a>`
  })

  // Replace emails with clickable chips
  result = result.replace(emailRegex, (match) => {
    return `<a href="mailto:${match}" class="cell-chip cell-email" title="Написать: ${match}" onclick="event.stopPropagation()"><i class="pi pi-envelope"></i><span>${match}</span></a>`
  })

  return result
}

// Parse text into segments (text and mentions)
const segments = computed(() => {
  return renderMentions(props.text)
})

// Auto-load users when component mounts if text contains mentions
onMounted(async () => {
  console.log('[MentionDisplay] Mounted. Text:', props.text, 'Users loaded:', users.value.length)
  if (props.text && props.text.includes('@')) {
    console.log('[MentionDisplay] Mentions detected, loading users...')
    await loadUsers()
    console.log('[MentionDisplay] After loadUsers, users count:', users.value.length)
    console.log('[MentionDisplay] Segments:', segments.value)
  }
})

// Also watch for text changes - if mentions are added, load users
watch(() => props.text, async (newText) => {
  console.log('[MentionDisplay] Text changed to:', newText, 'Users loaded:', users.value.length)
  if (newText && newText.includes('@') && users.value.length === 0) {
    console.log('[MentionDisplay] New mentions detected, loading users...')
    await loadUsers()
    console.log('[MentionDisplay] After loadUsers, users count:', users.value.length)
    console.log('[MentionDisplay] Segments after update:', segments.value)
  }
})
</script>

<style scoped>
.mention-display {
  display: inline;
}

/* Стиль совпадает с cell-phone/cell-email чипы */
.mention-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--p-violet-50, #f5f3ff);
  border: 1px solid var(--p-violet-200, #ddd6fe);
  border-radius: 12px;
  color: var(--p-violet-700, #6d28d9);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: default;
  vertical-align: middle;
  text-decoration: none;
  transition: all 0.15s ease;
  white-space: nowrap;
  max-width: 100%;
  overflow: visible;
}

.mention-tag:hover {
  background: var(--p-violet-100, #ede9fe);
  border-color: var(--p-violet-300, #c4b5fd);
}

.mention-tag-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--p-violet-300, #c4b5fd);
  flex-shrink: 0;
}

.mention-tag-avatar-default {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--p-violet-100, #ede9fe);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--p-violet-500, #a78bfa);
  font-size: 0.625rem;
  border: 1px solid var(--p-violet-300, #c4b5fd);
  flex-shrink: 0;
}

.mention-tag-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Fallback style for raw mention text when user data is not loaded */
.mention-text-raw {
  color: var(--p-text-color, #1e293b);
  font-style: italic;
  opacity: 0.7;
}

/* Phone and Email chip styles (matching DataTable) */
:deep(.cell-chip) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s ease;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;
  overflow: visible;
}

:deep(.cell-chip) i {
  font-size: 0.8rem;
}

:deep(.cell-phone) {
  background: var(--p-emerald-50, #ecfdf5);
  border: 1px solid var(--p-emerald-200, #a7f3d0);
  color: var(--p-emerald-700, #047857);
}

:deep(.cell-phone:hover) {
  background: var(--p-emerald-100, #d1fae5);
  border-color: var(--p-emerald-300, #6ee7b7);
}

:deep(.cell-email) {
  background: var(--p-sky-50, #f0f9ff);
  border: 1px solid var(--p-sky-200, #bae6fd);
  color: var(--p-sky-700, #0369a1);
}

:deep(.cell-email:hover) {
  background: var(--p-sky-100, #e0f2fe);
  border-color: var(--p-sky-300, #7dd3fc);
}

/* User preview popover */
:deep(.user-preview-popover) {
  .p-popover-content {
    padding: 0;
  }
}

.user-preview-card {
  padding: 0;
  background: var(--p-surface-card, white);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
}

.user-preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--p-surface-border, #e2e8f0);
}

.user-preview-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--p-violet-200, #ddd6fe);
  flex-shrink: 0;
}

.user-preview-avatar-default {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--p-violet-50, #f5f3ff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-violet-500, #a78bfa);
  font-size: 1.5rem;
  border: 2px solid var(--p-violet-200, #ddd6fe);
  flex-shrink: 0;
}

.user-preview-info {
  flex: 1;
  min-width: 0;
}

.user-preview-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--p-text-color, #1e293b);
  word-break: break-word;
}

.user-preview-id {
  font-size: 0.8rem;
  color: var(--p-text-color-secondary, #64748b);
  margin-top: 2px;
}
</style>
