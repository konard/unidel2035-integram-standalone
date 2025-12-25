<template>
  <Sidebar
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    position="right"
    :showCloseIcon="true"
    class="notification-sidebar"
  >
    <template #header>
      <h3>Уведомления</h3>
    </template>

    <div class="notification-content">
      <div v-if="notifications.length === 0" class="empty-state">
        <i class="pi pi-bell" style="font-size: 3rem; color: var(--text-color-secondary);"></i>
        <p>Нет уведомлений</p>
      </div>

      <div v-else class="notifications-list">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="notification-item"
          :class="{ unread: !notification.read }"
        >
          <div class="notification-icon">
            <i :class="getNotificationIcon(notification.type)"></i>
          </div>
          <div class="notification-body">
            <h4>{{ notification.title }}</h4>
            <p>{{ notification.message }}</p>
            <span class="notification-time">{{ formatTime(notification.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script setup>
import { ref } from 'vue'
import Sidebar from 'primevue/sidebar'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'update:visible'])

const notifications = ref([
  // Sample notifications - replace with actual data
])

const getNotificationIcon = (type) => {
  const icons = {
    info: 'pi pi-info-circle',
    success: 'pi pi-check-circle',
    warning: 'pi pi-exclamation-triangle',
    error: 'pi pi-times-circle'
  }
  return icons[type] || 'pi pi-bell'
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  if (hours < 24) return `${hours} ч назад`
  return `${days} дн назад`
}
</script>

<style scoped>
.notification-content {
  padding: 1rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
}

.notifications-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notification-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  transition: all 0.2s;
}

.notification-item.unread {
  background: var(--primary-50);
  border-color: var(--primary-200);
}

.notification-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.notification-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary-100);
  color: var(--primary-color);
}

.notification-body {
  flex: 1;
}

.notification-body h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.notification-body p {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.notification-time {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}
</style>
