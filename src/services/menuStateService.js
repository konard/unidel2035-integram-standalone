// Stub menu state service
export function createMenuItem(item) {
  return item
}

export function updateMenuItem(id, updates) {
  return { id, ...updates }
}

export function deleteMenuItem(id) {
  return true
}

export function getMenuState() {
  return []
}

export function isGroupCollapsed(groupId) {
  return false
}

export function toggleGroupCollapsed(groupId) {
  return true
}
