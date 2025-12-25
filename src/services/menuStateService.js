/**
 * Menu State Service - Stub
 * TODO: Implement actual service logic
 */

const menuState = {};
const collapsedGroups = new Set();

export function createMenuItem(id, data) {
  console.warn('menuStateService: Using stub implementation');
  menuState[id] = data;
  return data;
}

export function updateMenuItem(id, data) {
  console.warn('menuStateService: Using stub implementation');
  if (menuState[id]) {
    menuState[id] = { ...menuState[id], ...data };
  }
  return menuState[id];
}

export function deleteMenuItem(id) {
  console.warn('menuStateService: Using stub implementation');
  delete menuState[id];
}

export function isGroupCollapsed(groupId) {
  return collapsedGroups.has(groupId);
}

export function toggleGroupCollapsed(groupId) {
  if (collapsedGroups.has(groupId)) {
    collapsedGroups.delete(groupId);
  } else {
    collapsedGroups.add(groupId);
  }
}

export default {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  isGroupCollapsed,
  toggleGroupCollapsed
};
