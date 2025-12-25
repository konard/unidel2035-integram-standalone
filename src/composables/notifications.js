import { ref } from 'vue'

// Stub notifications composable
export function useNotifications() {
  const notifications = ref([])
  const unreadCount = ref(0)

  return {
    notifications,
    unreadCount,
    markAsRead: () => {},
    clearAll: () => {}
  }
}
