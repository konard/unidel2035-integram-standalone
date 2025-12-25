/**
 * Row Editing Composable
 * Handles row-level operations: add, edit, delete, validation, context menu
 */

import { ref } from 'vue'

export function useRowEditing(
  props,
  localHeaders,
  directoryCache,
  loadDirectoryList,
  emit
) {
  // Dialog state
  const isRowEditDialogVisible = ref(false)
  const isConfirmDialogVisible = ref(false)
  const confirmMessage = ref('')
  const pendingAction = ref(null)
  const pendingActionData = ref(null)

  // Row editing state
  const editingRow = ref(null)
  const fieldErrors = ref({})

  // Row context menu state
  const contextMenuRow = ref(null)
  const changeParentRow = ref(null)
  const copiedCellValue = ref(null)

  // Show confirmation dialog
  const showConfirmationDialog = (message, action, data = null) => {
    confirmMessage.value = message
    pendingAction.value = action
    pendingActionData.value = data
    isConfirmDialogVisible.value = true
  }

  // Execute confirmed action
  const confirmAction = () => {
    if (pendingAction.value) pendingAction.value(pendingActionData.value)
    isConfirmDialogVisible.value = false
  }

  // Open row context menu
  const onRowContextMenu = (event, row) => {
    contextMenuRow.value = row
  }

  // Copy cell value from context menu
  const copyCellValue = (selectedCells) => {
    if (!contextMenuRow.value || !selectedCells.value.start) return
    const headerId = selectedCells.value.start.headerId
    if (headerId === 'row-counter') return
    const cell = contextMenuRow.value.cells[headerId]
    if (cell) copiedCellValue.value = cell.value
  }

  // Paste cell value from context menu
  const pasteCellValue = (selectedCells) => {
    if (!contextMenuRow.value || !selectedCells.value.start || !copiedCellValue.value) return
    const headerId = selectedCells.value.start.headerId
    if (headerId === 'row-counter') return
    emit('cell-update', {
      rowId: contextMenuRow.value.id,
      headerId: headerId,
      value: copiedCellValue.value
    })
  }

  // Start editing row
  const editRow = () => {
    if (!contextMenuRow.value) return
    startRowEdit(contextMenuRow.value)
  }

  // Delete row with confirmation
  const deleteRow = () => {
    if (!contextMenuRow.value) return
    showConfirmationDialog(
      'Вы уверены, что хотите удалить эту строку? Данные будут потеряны.',
      () => emit('row-delete', contextMenuRow.value.id)
    )
  }

  // Start row edit dialog
  const startRowEdit = async (row) => {
    if (props.disableEditing) return

    // Preload all directory lists
    localHeaders.value.forEach(header => {
      if (header.dirTableId) loadDirectoryList(header.dirTableId)
    })

    // Prepare editing row data
    editingRow.value = {
      id: row.id,
      headers: localHeaders.value.map(header => {
        const cell = row.cells[header.id] || { value: null, dirRowId: null, dirValues: [] }
        const isNested = header.nested || header.columnType === 'nested' || cell?.nested
        let cellValue = cell.value

        // Convert timestamp to Date for date/datetime types
        if ([4, 9].includes(header.type) && typeof cellValue === 'number') {
          cellValue = new Date(cellValue * 1000)
        }

        return {
          headerId: header.id,
          value: cellValue,
          dirRowId: cell.dirRowId,
          dirValues: cell.dirValues ? cell.dirValues.map(v => v.dirRowId) : [],
          columnType: header.columnType,
          type: header.type,
          dirTableId: header.dirTableId,
          isNested,
          nestedTableId: header.nestedTableId || header.id,
          nestedLink: cell.nestedLink
        }
      })
    }

    isRowEditDialogVisible.value = true
  }

  // Save row edit
  const saveRowEdit = () => {
    if (!validateRow()) return

    const updatedRow = {
      id: editingRow.value.id,
      headers: editingRow.value.headers
        .filter(header => !header.isNested) // Skip nested columns
        .map(header => {
          let value = header.value
          let dirRowId = null
          let dirValues = []
          const headerType = header.type

          // Handle directory/reference columns
          if (header.dirTableId) {
            if (header.columnType === 'multi') {
              const dirRowIds = header.dirValues
              const dirItems = directoryCache.value[header.dirTableId]?.filter(item => dirRowIds.includes(item.id))
              value = dirItems.map(item => item.value).join(', ')
              dirValues = dirRowIds.map(id => ({ dirRowId: id }))
            } else {
              dirRowId = header.dirRowId
              const dirItem = directoryCache.value[header.dirTableId]?.find(item => item.id === dirRowId)
              value = dirItem?.value || ''
            }
          }
          // Handle date/datetime types - convert Date to timestamp
          else if ([4, 9].includes(headerType)) {
            if (value instanceof Date) {
              value = Math.floor(value.getTime() / 1000)
            } else if (value === null || value === '') {
              value = null
            }
          }

          return {
            headerId: header.headerId,
            value: value,
            dirRowId: dirRowId,
            dirValues: dirValues,
            type: headerType
          }
        })
    }

    emit('row-update', updatedRow)
    isRowEditDialogVisible.value = false
  }

  // Validate row fields
  const validateRow = () => {
    fieldErrors.value = {}
    let isValid = true

    editingRow.value.headers.forEach(header => {
      // Skip nested columns
      if (header.isNested) return

      if (header.required && !header.value) {
        fieldErrors.value[header.headerId] = 'Это поле обязательно'
        isValid = false
      }
    })

    return isValid
  }

  // Cancel row edit
  const cancelRowEdit = () => {
    isRowEditDialogVisible.value = false
    editingRow.value = null
    fieldErrors.value = {}
  }

  // Cleanup
  const cleanup = () => {
    cancelRowEdit()
    isConfirmDialogVisible.value = false
    contextMenuRow.value = null
    changeParentRow.value = null
    copiedCellValue.value = null
  }

  return {
    // Dialog state
    isRowEditDialogVisible,
    isConfirmDialogVisible,
    confirmMessage,
    pendingAction,
    pendingActionData,

    // Editing state
    editingRow,
    fieldErrors,

    // Context menu state
    contextMenuRow,
    changeParentRow,
    copiedCellValue,

    // Functions
    showConfirmationDialog,
    confirmAction,
    onRowContextMenu,
    copyCellValue,
    pasteCellValue,
    editRow,
    deleteRow,
    startRowEdit,
    saveRowEdit,
    validateRow,
    cancelRowEdit,
    cleanup
  }
}
