<template>
  <div class="mention-autocomplete" ref="containerRef">
    <InputText
      ref="inputRef"
      :modelValue="modelValue"
      @update:modelValue="handleInput"
      @keydown="handleKeydown"
      @blur="handleBlur"
      v-bind="$attrs"
      class="w-full"
    />

    <!-- Mention dropdown - teleported to body to avoid overflow clipping -->
    <Teleport to="body">
    <div
      v-if="showDropdown"
      class="mention-dropdown"
      :style="dropdownStyle"
    >
      <div
        v-if="filteredUsers.length === 0"
        class="mention-item-empty"
      >
        <i class="pi pi-user text-400 mr-2"></i>
        <span class="text-500">Пользователи не найдены</span>
      </div>

      <div
        v-else
        v-for="(user, index) in filteredUsers"
        :key="user.id"
        class="mention-item"
        :class="{ 'mention-item-active': index === selectedIndex }"
        @mousedown.prevent="selectUser(user)"
        @mouseenter="selectedIndex = index"
      >
        <img
          v-if="user.photo"
          :src="user.photo"
          :alt="user.name"
          class="mention-avatar"
        />
        <div v-else class="mention-avatar-default">
          <i class="pi pi-user"></i>
        </div>
        <span class="mention-name">{{ user.name }}</span>
        <span class="mention-id text-400 text-xs ml-auto">ID: {{ user.id }}</span>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import InputText from 'primevue/inputtext'
import { useUserMentions } from './DataTable/composables/useUserMentions'
import { useTimer } from '@/composables/useTimer'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  database: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue'])

const { setTimeout: setTimerTimeout } = useTimer()

const containerRef = ref(null)
const inputRef = ref(null)
const showDropdown = ref(false)
const selectedIndex = ref(0)
const mentionQuery = ref('')
const cursorPosition = ref(0)

// Use user mentions composable
const { users, loading, loadUsers, filterUsers, insertMention } = useUserMentions(props.database)

// Filtered users based on mention query
const filteredUsers = computed(() => {
  return filterUsers(mentionQuery.value) // Show all matching users
})

// Dropdown positioning - calculate relative to input element
const dropdownStyle = computed(() => {
  const input = inputRef.value?.$el || inputRef.value
  if (!input) {
    return {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: 10000,
      display: 'none'
    }
  }

  const rect = input.getBoundingClientRect()
  return {
    position: 'fixed',
    top: rect.bottom + 4 + 'px',
    left: rect.left + 'px',
    width: Math.max(rect.width, 280) + 'px',
    zIndex: 10000
  }
})

/**
 * Handle input change
 */
function handleInput(value) {
  emit('update:modelValue', value)

  // Get cursor position
  const input = inputRef.value?.$el || inputRef.value
  cursorPosition.value = input.selectionStart

  // Check if @ was typed
  const textBeforeCursor = value.substring(0, cursorPosition.value)
  const atMatch = textBeforeCursor.match(/@(\w*)$/)

  console.log('[MentionAutocomplete] handleInput:', {
    value,
    cursorPosition: cursorPosition.value,
    textBeforeCursor,
    atMatch: atMatch ? atMatch[0] : null,
    database: props.database,
    filteredUsersCount: filteredUsers.value.length,
    usersCount: users.value.length
  })

  if (atMatch) {
    mentionQuery.value = atMatch[1] || ''
    showDropdown.value = true
    selectedIndex.value = 0

    // Lazy load users only when @ is typed (not on mount)
    console.log('[MentionAutocomplete] @ detected, loading users for database:', props.database)
    loadUsers()
  } else {
    showDropdown.value = false
  }
}

/**
 * Handle keyboard navigation
 */
function handleKeydown(event) {
  if (!showDropdown.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, filteredUsers.value.length - 1)
      break

    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      break

    case 'Enter':
    case 'Tab':
      if (filteredUsers.value.length > 0) {
        event.preventDefault()
        selectUser(filteredUsers.value[selectedIndex.value])
      }
      break

    case 'Escape':
      event.preventDefault()
      showDropdown.value = false
      break
  }
}

/**
 * Select a user from dropdown
 */
function selectUser(user) {
  const result = insertMention(props.modelValue, cursorPosition.value, user)
  emit('update:modelValue', result.text)

  showDropdown.value = false

  // Restore focus and cursor position
  const input = inputRef.value?.$el || inputRef.value
  setTimerTimeout(() => {
    input.focus()
    input.setSelectionRange(result.cursorPosition, result.cursorPosition)
  }, 0)
}

/**
 * Handle blur event
 */
function handleBlur() {
  // Delay to allow click on dropdown
  setTimerTimeout(() => {
    showDropdown.value = false
  }, 200)
}

/**
 * Close dropdown on outside click
 */
function handleClickOutside(event) {
  if (containerRef.value && !containerRef.value.contains(event.target)) {
    showDropdown.value = false
  }
}

// Setup on mount (no auto-load - lazy loading when @ is typed)
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Expose input ref for parent components
defineExpose({
  focus: () => {
    const input = inputRef.value?.$el || inputRef.value
    input?.focus()
  }
})
</script>

<style scoped>
.mention-autocomplete {
  position: relative;
  width: 100%;
}

.mention-dropdown {
  background: var(--surface-overlay);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  min-width: 280px;
  margin-top: 0;
}

.mention-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 0.75rem;
}

.mention-item:hover,
.mention-item-active {
  background: var(--surface-hover);
}

.mention-item-empty {
  display: flex;
  align-items: center;
  padding: 1rem;
  color: var(--text-color-secondary);
}

.mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--surface-border);
}

.mention-avatar-default {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-100);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  border: 1px solid var(--surface-border);
}

.mention-name {
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

.mention-id {
  font-size: 0.75rem;
}
</style>
