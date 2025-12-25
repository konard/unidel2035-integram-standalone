/**
 * Header Management Composable
 * Handles header operations: rename, delete, change type, context menu
 */

import { ref, nextTick } from 'vue'

export function useHeaderManagement(emit, showConfirmationDialog, headerEditorInput) {
  // Header editing state
  const editingHeaderId = ref(null)
  const editingHeaderName = ref('')
  // headerEditorInput is passed as parameter (template ref from parent)

  // Header context menu state
  const currentHeaderTarget = ref(null)
  const headerContextMenu = ref(null)
  const currentHeader = ref(null)

  // Type menu state
  const typeMenu = ref()
  const showTypeSubmenu = ref(false)

  // Show header context menu
  const onHeaderContextMenu = (event, header) => {
    currentHeader.value = header
    currentHeaderTarget.value = event.currentTarget
    headerContextMenu.value.show(event)
  }

  // Show type selection overlay
  const showTypeOverlay = event => {
    if (event) typeMenu.value.show(event, currentHeaderTarget.value)
    else typeMenu.value.toggle(event, currentHeaderTarget.value)
    headerContextMenu.value.hide()
  }

  // Emit header action or start rename
  const emitHeaderAction = async action => {
    if (action === 'rename') {
      editingHeaderId.value = currentHeader.value.id
      editingHeaderName.value = currentHeader.value.value
      await nextTick()
      // Focus the header editor input
      if (headerEditorInput.value) {
        const inputEl = headerEditorInput.value.$el || headerEditorInput.value
        if (inputEl && inputEl.focus) {
          inputEl.focus()
        }
      }
    } else {
      emit('header-action', {
        action,
        headerId: currentHeader.value?.id,
        termId: currentHeader.value?.termId,
        value: currentHeader.value?.value,
        type: currentHeader.value?.type
      })
    }
  }

  // Save header rename
  const saveHeaderRename = () => {
    if (editingHeaderName.value.trim()) {
      emit('header-action', {
        action: 'rename',
        headerId: currentHeader.value.id,
        termId: currentHeader.value.termId,
        value: editingHeaderName.value.trim(),
        type: currentHeader.value?.type
      })
      editingHeaderId.value = null
      editingHeaderName.value = ''
    }
  }

  // Cancel header rename
  const cancelHeaderRename = () => {
    editingHeaderId.value = null
    editingHeaderName.value = ''
  }

  // Change column type
  const changeColumnType = typeId => {
    showConfirmationDialog(
      'Вы уверены, что хотите изменить тип колонки? Это может привести к потере данных.',
      () => {
        emit('header-action', {
          action: 'change-type',
          headerId: currentHeader.value?.id,
          termId: currentHeader.value?.termId,
          value: currentHeader.value?.value,
          type: typeId
        })
        typeMenu.value.hide()
      }
    )
  }

  // Toggle header menu
  const toggleHeaderMenu = (event, header) => {
    currentHeader.value = header
    typeMenu.value.toggle(event)
    showTypeSubmenu.value = false
  }

  // Delete column
  const deleteColumn = () => {
    showConfirmationDialog(
      'Вы уверены, что хотите удалить эту колонку? Все данные в ней будут потеряны.',
      () => {
        emit('header-action', {
          action: 'delete',
          headerId: currentHeader.value.id,
          termId: currentHeader.value.termId
        })
        typeMenu.value.hide()
      }
    )
  }

  // Cleanup function
  const cleanup = () => {
    // Hide menus
    if (headerContextMenu.value) headerContextMenu.value.hide()
    if (typeMenu.value) typeMenu.value.hide()

    // Reset editing state
    editingHeaderId.value = null
    editingHeaderName.value = ''
    currentHeader.value = null
    currentHeaderTarget.value = null
    showTypeSubmenu.value = false
  }

  return {
    // State
    editingHeaderId,
    editingHeaderName,
    // headerEditorInput is NOT returned (it's a template ref in parent)
    currentHeaderTarget,
    headerContextMenu,
    currentHeader,
    typeMenu,
    showTypeSubmenu,

    // Functions
    onHeaderContextMenu,
    showTypeOverlay,
    emitHeaderAction,
    saveHeaderRename,
    cancelHeaderRename,
    changeColumnType,
    toggleHeaderMenu,
    deleteColumn,
    cleanup
  }
}
