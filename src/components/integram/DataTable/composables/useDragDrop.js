/**
 * Drag and Drop Composable
 * Handles column drag-and-drop reordering
 */

import { ref } from 'vue'

export function useDragDrop(localHeaders, isResizing, table, emit) {
  // Drag-and-drop state
  const draggedColumnId = ref(null)
  const dropTargetColumnId = ref(null)
  const dropPosition = ref(null)

  // Handle drag start event
  const handleDragStart = (event, columnId) => {
    draggedColumnId.value = columnId
    event.dataTransfer.effectAllowed = 'move'
    event.currentTarget.classList.add('dragging')
    event.dataTransfer.setDragImage(new Image(), 0, 0)
  }

  // Handle drag over event
  const handleDragOver = (event, columnId) => {
    if (draggedColumnId.value === columnId || isResizing.value) return
    const targetRect = event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - targetRect.left
    const isLeftHalf = offsetX < targetRect.width / 2
    dropTargetColumnId.value = columnId
    dropPosition.value = isLeftHalf ? 'left' : 'right'
  }

  // Handle drop event
  const handleDrop = (event, columnId) => {
    if (isResizing.value) return
    event.preventDefault()
    if (draggedColumnId.value && draggedColumnId.value !== columnId) {
      const headers = [...localHeaders.value]
      const fromIndex = headers.findIndex(h => h.id === draggedColumnId.value)
      const toIndex = headers.findIndex(h => h.id === columnId)
      const insertIndex = dropPosition.value === 'left' ? toIndex : toIndex + 1
      if (fromIndex !== -1 && toIndex !== -1) {
        const [removed] = headers.splice(fromIndex, 1)
        headers.splice(insertIndex, 0, removed)
        localHeaders.value = headers
        emit('update:table-config', { headers: headers, tableWidth: table.value.offsetWidth })
      }
    }
    resetDragState()
  }

  // Handle drag end event
  const handleDragEnd = (event) => {
    event.currentTarget.classList.remove('dragging')
    resetDragState()
  }

  // Reset drag state
  const resetDragState = () => {
    draggedColumnId.value = null
    dropTargetColumnId.value = null
    dropPosition.value = null
  }

  return {
    // State
    draggedColumnId,
    dropTargetColumnId,
    dropPosition,

    // Functions
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    resetDragState
  }
}
