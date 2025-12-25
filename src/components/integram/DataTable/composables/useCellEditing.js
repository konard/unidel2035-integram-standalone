/**
 * Cell Editing Composable
 * Handles inline cell editing, MEMO/HTML dialogs, file uploads, directory dropdowns/multiselects
 */

import { ref, nextTick, watch } from 'vue'

export function useCellEditing(
  props,
  processedRows,
  localHeaders,
  selectedCells,
  emit,
  // Utility functions from parent
  hideDirInfo,
  loadDirectoryList,
  markCellAsChanged,
  // GRANT options and loader from useGrants composable
  grantOptions,
  loadGrantOptions
) {
  // Inline editing state
  const editingCell = ref(null) // { headerId, rowId }
  const editingValue = ref(null)
  const editingOptions = ref([])
  const editingMultiValue = ref([])
  const currentEditingHeader = ref(null)
  const cellEditorInput = ref(null) // Template ref
  const isCancellingEdit = ref(false)
  const isDropdownOpen = ref(false)

  // MEMO/HTML dialog state
  const memoEditingCell = ref(null)
  const memoEditingValue = ref('')
  const isMemoDialogVisible = ref(false)
  const memoDialogHeader = ref('Редактирование текста')
  const memoTextarea = ref(null) // Template ref

  // Local cell overrides for immediate UI update
  const localCellOverrides = ref(new Map()) // Map<"rowId:headerId", value>

  // Capture phase handler for ESC key in dropdowns
  const handleGlobalEscForDropdown = (event) => {
    if (event.key === 'Escape' && isDropdownOpen.value) {
      // Set flag IMMEDIATELY in capture phase - this runs before PrimeVue's handlers
      isCancellingEdit.value = true
      // Note: We don't preventDefault here because we want the dropdown to close naturally
      // The flag being set is enough to prevent handleDropDownHide from saving
    }
  }

  // Watch isDropdownOpen to add/remove capture phase listener
  watch(isDropdownOpen, (newVal, oldVal) => {
    if (newVal && !oldVal) {
      // Dropdown opened - add capture phase listener
      document.addEventListener('keydown', handleGlobalEscForDropdown, true) // true = capture phase
    } else if (!newVal && oldVal) {
      // Dropdown closed - remove capture phase listener
      document.removeEventListener('keydown', handleGlobalEscForDropdown, true)
    }
  })

  // Auto-focus dropdowns when editingCell changes
  watch(editingCell, newVal => {
    if (newVal && newVal.headerId) {
      const header = localHeaders.value.find(h => h.id === newVal.headerId)
      if (header?.dirTableId) {
        nextTick(() => {
          const dropdown = document.querySelector('.seamless-editor .p-dropdown, .seamless-editor .p-multiselect')
          if (dropdown) {
            const input = dropdown.querySelector('input')
            if (input) input.focus()
          }
        })
      }
    }
  })

  // Check if a cell is currently being edited (inline or MEMO dialog)
  const isEditingCell = (headerId, rowId) => {
    return (editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId) ||
           (memoEditingCell.value?.headerId === headerId && memoEditingCell.value?.rowId === rowId)
  }

  // Check if a cell is being edited inline (NOT MEMO dialog)
  const isInlineEditing = (headerId, rowId) => {
    return editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId
  }

  // Start editing a cell
  const startCellEdit = async (headerId, rowId) => {
    console.log('[DataTable] startCellEdit called', { headerId, rowId, disableEditing: props.disableEditing })
    if (props.disableEditing) return

    // Skip if already editing this exact cell (prevents double-click triggering multiple times)
    if (editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId) {
      console.log('[DataTable] startCellEdit: already editing this cell, skipping')
      return
    }

    // Reset cancelling flag when starting new edit
    isCancellingEdit.value = false

    // Hide directory info popover when starting edit
    hideDirInfo()

    const cell = processedRows.value.find(r => r.id === rowId)?.cells[headerId]
    const header = localHeaders.value.find(h => h.id === headerId)

    // Allow editing for dir and multi columns even if nested flag is set
    const isDirectoryColumn = header?.columnType === 'dir' || header?.columnType === 'multi'
    const isNestedColumn = header?.nested || header?.columnType === 'nested' || cell?.nested
    if (isNestedColumn && !isDirectoryColumn) {
      console.log('[DataTable] startCellEdit: nested cell, calling handleCellDoubleClick')
      handleCellDoubleClick(header, cell)
      return
    }

    // Type 11 (Boolean) - не входим в режим редактирования, чекбокс уже интерактивный
    if (header?.type === 11) {
      console.log('[DataTable] startCellEdit: Boolean type, skipping inline edit (checkbox handles it)')
      return
    }

    // Type 12 (MEMO) - открываем модалку вместо inline редактирования
    if (header?.type === 12) {
      console.log('[DataTable] startCellEdit: MEMO type, opening dialog')
      memoEditingCell.value = { headerId, rowId }
      memoEditingValue.value = cell?.value || ''
      memoDialogHeader.value = header.value || 'Редактирование текста'
      isMemoDialogVisible.value = true
      // Focus textarea after dialog opens
      nextTick(() => {
        memoTextarea.value?.$el?.focus()
      })
      return
    }

    // Type 2 (HTML) - открываем модалку вместо inline редактирования
    if (header?.type === 2) {
      console.log('[DataTable] startCellEdit: HTML type, opening dialog')
      memoEditingCell.value = { headerId, rowId }
      memoEditingValue.value = cell?.value || ''
      memoDialogHeader.value = header.value || 'Редактирование HTML'
      isMemoDialogVisible.value = true
      // Focus textarea after dialog opens
      nextTick(() => {
        memoTextarea.value?.$el?.focus()
      })
      return
    }

    // Type 5 (GRANT) - показываем dropdown с опциями доступа
    if (header?.type === 5) {
      console.log('[DataTable] startCellEdit: GRANT type, loading grant options')
      editingCell.value = { headerId, rowId }
      currentEditingHeader.value = header

      // Set current value
      editingValue.value = cell?.value || null

      // Load GRANT options on-demand (lazy load) if not already loaded
      if (!grantOptions?.value || grantOptions.value.length === 0) {
        console.log('[DataTable] startCellEdit: GRANT options not loaded, loading now...')
        loadGrantOptions()
      }
      editingOptions.value = grantOptions?.value || []

      // Auto-open dropdown after options are loaded
      nextTick(() => {
        autoOpenDropdown()
      })

      return
    }

    currentEditingHeader.value = header
    console.log('[DataTable] startCellEdit: header set', { header, dirTableId: header?.dirTableId, columnType: header?.columnType })

    if (cell) {
      editingCell.value = { headerId, rowId }
      console.log('[DataTable] startCellEdit: editingCell set', editingCell.value)

      if (header.dirTableId) {
        console.log('[DataTable] startCellEdit: dirTableId detected, will load directory list')
        if (header.columnType === 'multi') {
          editingMultiValue.value = cell.dirValues ? cell.dirValues.map(v => v.dirRowId) : []
        } else {
          editingValue.value = cell.dirRowId || null
        }

        // Load directory list and auto-open dropdown/multiselect
        emit('load-directory-list', {
          dirTableId: header.dirTableId,
          callback: list => {
            editingOptions.value = list
            if (header.columnType === 'multi') {
              autoOpenMultiSelect()
            } else {
              autoOpenDropdown()
            }
          }
        })
      } else {
        if ([4, 9].includes(header.type) && typeof cell.value === 'number') {
          editingValue.value = new Date(cell.value * 1000)
        } else {
          editingValue.value = cell.value
        }
        // Focus the cell editor after it's mounted
        // Use double nextTick to ensure DOM is fully rendered
        await nextTick()
        await nextTick()

        if (cellEditorInput.value) {
          // Handle both single ref and array of refs (from v-for)
          const refValue = Array.isArray(cellEditorInput.value)
            ? cellEditorInput.value[0]
            : cellEditorInput.value
          if (!refValue) return
          const inputEl = refValue.$el || refValue
          if (inputEl) {
            const focusTarget = inputEl.querySelector ? inputEl.querySelector('input, textarea') : inputEl
            // Defensive check - ensure focusTarget has focus method
            if (focusTarget && typeof focusTarget.focus === 'function') {
              // Focus and select immediately without delays
              focusTarget.focus()
              // Select all text immediately after focus
              try {
                if (focusTarget.select && typeof focusTarget.select === 'function') {
                  focusTarget.select()
                } else if (focusTarget.setSelectionRange && focusTarget.value !== undefined) {
                  focusTarget.setSelectionRange(0, String(focusTarget.value).length)
                }
              } catch (err) {
                // Silently ignore selection errors
              }
            }
          }
        }
      }
    }
  }

  // Auto-open multiselect dropdown
  const autoOpenMultiSelect = async () => {
    await nextTick()
    await nextTick()
    // Use requestAnimationFrame for reliable timing after DOM paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Try multiple selectors for PrimeVue 4 compatibility
        const multiselect = document.querySelector('.seamless-editor .p-multiselect') ||
                            document.querySelector('.seamless-editor.p-multiselect') ||
                            document.querySelector('.cell-editor .p-multiselect')
        if (multiselect) {
          // Click on the multiselect itself to open
          multiselect.click()
        }
      }, 30)
    })
  }

  // Auto-open dropdown
  const autoOpenDropdown = async () => {
    console.log('[DataTable] autoOpenDropdown called')
    await nextTick()
    // Use requestAnimationFrame for reliable timing after DOM paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        const dropdown = document.querySelector('.seamless-editor.p-dropdown')
        console.log('[DataTable] autoOpenDropdown: looking for dropdown', dropdown)
        if (dropdown) {
          // Focus the dropdown first
          const input = dropdown.querySelector('input')
          if (input) input.focus()
          // Then click to open
          const trigger = dropdown.querySelector('.p-dropdown-trigger')
          console.log('[DataTable] autoOpenDropdown: found trigger', trigger)
          if (trigger) {
            trigger.click()
          }
        } else {
          console.log('[DataTable] autoOpenDropdown: dropdown NOT found')
        }
      }, 20)
    })
  }

  // Save cell edit
  const saveCellEdit = (headerId, rowId) => {
    const header = localHeaders.value.find(h => h.id === headerId)
    let valueToSave, dirRowIdToSave, dirValuesToSave

    if (header?.dirTableId) {
      if (header.columnType === 'multi') {
        const selectedIds = editingMultiValue.value
        const selectedItems = editingOptions.value.filter(item => selectedIds.includes(item.id))
        valueToSave = selectedItems.map(item => item.value).join(', ')
        dirValuesToSave = selectedIds.map(id => ({ dirRowId: id }))

        // Immediate local update for reactive UI
        const overrideKey = `${rowId}:${headerId}`
        localCellOverrides.value.set(overrideKey, valueToSave)

        emit('cell-multi-update', {
          rowId,
          headerId,
          dirTableId: header.dirTableId,
          dirValues: dirValuesToSave
        })

        // Mark cell as changed
        markCellAsChanged(headerId, rowId)
        return
      } else {
        const selectedId = editingValue.value
        const selectedItem = editingOptions.value.find(item => item.id === selectedId)
        valueToSave = selectedItem ? selectedItem.value : ''
        dirRowIdToSave = selectedId
      }

      // Immediate local update for reactive UI
      const overrideKey = `${rowId}:${headerId}`
      localCellOverrides.value.set(overrideKey, valueToSave)

      emit('cell-update', {
        rowId,
        headerId,
        value: valueToSave,
        type: header.type,
        dirRowId: dirRowIdToSave,
        dirValues: dirValuesToSave
      })

      // Mark cell as changed
      markCellAsChanged(headerId, rowId)
    } else {
      valueToSave = editingValue.value

      // Immediate local update for reactive UI
      const overrideKey = `${rowId}:${headerId}`
      localCellOverrides.value.set(overrideKey, valueToSave)

      emit('cell-update', {
        rowId,
        headerId,
        value: valueToSave,
        type: header.type
      })

      // Mark cell as changed
      markCellAsChanged(headerId, rowId)
    }
  }

  // Cancel cell edit without saving
  const cancelCellEdit = () => {
    // Set cancelling flag to prevent hide handlers from saving
    isCancellingEdit.value = true

    const multiselect = document.querySelector('.seamless-editor .p-multiselect')
    if (multiselect) {
      multiselect.removeEventListener('click', handleDropdownClick)
    }
    editingCell.value = null
    editingValue.value = null
    editingMultiValue.value = []
    currentEditingHeader.value = null

    // Reset the flag after a short delay (to allow hide events to process)
    setTimeout(() => {
      isCancellingEdit.value = false
    }, 100)
  }

  // Save and close cell edit
  const saveAndCloseCellEdit = (headerId, rowId) => {
    // Guard: don't save if editing was already canceled (prevents double-save on Enter + blur)
    // Also don't save if ESC was pressed (isCancellingEdit flag)
    if (!editingCell.value || isCancellingEdit.value) {
      return
    }
    saveCellEdit(headerId, rowId)
    cancelCellEdit()
  }

  // Handle document click (click outside cell closes editor)
  const handleDocumentClick = event => {
    if (isDropdownOpen.value) return

    if (editingCell.value) {
      const cellElement = document.querySelector(`td[data-row-id="${editingCell.value.rowId}"][data-header-id="${editingCell.value.headerId}"]`)
      const rowCounterCell = document.querySelector(`td.row-counter-cell[data-row-id="${editingCell.value.rowId}"]`)
      if (!cellElement && !rowCounterCell) return

      let isClickInsideEditor = false
      if (cellElement && cellElement.contains(event.target)) isClickInsideEditor = true
      if (rowCounterCell && rowCounterCell.contains(event.target)) isClickInsideEditor = true

      if (!isClickInsideEditor) {
        saveAndCloseCellEdit(editingCell.value.headerId, editingCell.value.rowId)
      }
    }
  }

  // Handle cell click
  const handleCellClick = (event, headerId, rowId) => {
    // Prevent native text selection on Shift+Click
    if (event.shiftKey) {
      event.preventDefault()
    }

    // Ignore selection for row-counter column
    if (headerId === 'row-counter') {
      return
    }

    // Save editing cell if clicking on different cell
    if (editingCell.value && (editingCell.value.headerId !== headerId || editingCell.value.rowId !== rowId)) {
      saveAndCloseCellEdit(editingCell.value.headerId, editingCell.value.rowId)
    }

    // If clicking on the same cell that's being edited, do nothing
    if (editingCell.value && editingCell.value.headerId === headerId && editingCell.value.rowId === rowId) {
      return
    }

    // Single-click edit mode
    if (props.editMode === 'single-click' && !props.disableEditing) {
      if (event.shiftKey && selectedCells.value.start) {
        // Shift+click for range selection
        selectedCells.value.end = { headerId, rowId }
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl+click: toggle cell in multi-selection
        // For now, just select the cell (multi-cell selection can be complex)
        selectedCells.value = {
          start: { headerId, rowId },
          end: null,
          isSelecting: false
        }
      } else {
        // Regular click: select cell and start editing
        selectedCells.value = {
          start: { headerId, rowId },
          end: null,
          isSelecting: false
        }
        startCellEdit(headerId, rowId)
      }
    } else {
      // In double-click mode: just select the cell on click
      if (event.shiftKey && selectedCells.value.start) {
        selectedCells.value.end = { headerId, rowId }
      } else {
        selectedCells.value = {
          start: { headerId, rowId },
          end: null,
          isSelecting: false
        }
      }
    }
  }

  // Handle cell double-click (for nested tables)
  const handleCellDoubleClick = (header, cell) => {
    console.log('[handleCellDoubleClick] Called with:', {
      header_nested: header?.nested,
      header_columnType: header?.columnType,
      header_nestedTableId: header?.nestedTableId,
      header_id: header?.id,
      header_value: header?.value,
      cell_nestedLink: cell?.nestedLink,
      cell_value: cell?.value
    })
    console.log('[handleCellDoubleClick] FULL CELL OBJECT:', cell)
    console.log('[handleCellDoubleClick] Cell keys:', Object.keys(cell || {}))

    if (header.nested || header.columnType === 'nested') {
      console.log('[handleCellDoubleClick] Condition TRUE - emitting open-nested')
      const emitData = {
        tableId: header.nestedTableId || header.id,
        parentRowId: cell.nestedLink,
        tableName: header.value || cell.value
      }
      console.log('[handleCellDoubleClick] Emit data:', emitData)
      emit('open-nested', emitData)
      console.log('[handleCellDoubleClick] Emit called')
    } else {
      console.log('[handleCellDoubleClick] Condition FALSE - NOT emitting')
    }
  }

  // Dropdown/Multiselect handlers
  const handleDropdownClick = (event) => {
    event.stopPropagation()
  }

  const handleMultiSelectHide = () => {
    isDropdownOpen.value = false
    // Only auto-save if user is not cancelling (ESC key)
    if (!isCancellingEdit.value && editingCell.value && currentEditingHeader.value?.columnType === 'multi') {
      // Save changes immediately without canceling edit state first
      // This prevents the cell from disappearing briefly
      saveCellEdit(editingCell.value.headerId, editingCell.value.rowId)
      // Small delay before clearing edit state to ensure UI updates
      setTimeout(() => {
        cancelCellEdit()
      }, 0)
    }
  }

  const handleMultiSelectKeydown = (event) => {
    if (event.key === 'Escape') {
      // Set flag IMMEDIATELY to prevent hide handlers from saving
      // This MUST happen before PrimeVue processes the ESC and fires @hide
      isCancellingEdit.value = true
      event.stopPropagation()
      event.preventDefault() // Prevent PrimeVue from handling ESC
      cancelCellEdit()
    } else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
      // Select all options with Ctrl+A
      event.preventDefault()
      if (editingOptions.value.length > 0) {
        editingMultiValue.value = editingOptions.value.map(option => option.id)
      }
    } else if (event.key === 'Enter' && !event.shiftKey) {
      // Close dropdown on Enter (will trigger auto-save via handleMultiSelectHide)
      const multiselect = document.querySelector('.seamless-editor .p-multiselect')
      if (multiselect) {
        const overlay = document.querySelector('.p-multiselect-panel')
        if (overlay) {
          const trigger = multiselect.querySelector('.p-multiselect-trigger')
          if (trigger) {
            trigger.click() // Close dropdown
          }
        }
      }
    }
  }

  const handleDropdownKeydown = (event) => {
    if (event.key === 'Escape') {
      // Redundant flag setting (capture phase already set it, but safety first)
      isCancellingEdit.value = true
      // Call cancelCellEdit to properly clean up edit state
      cancelCellEdit()
    } else if (event.key === 'Enter') {
      // Let PrimeVue handle Enter (select option)
      // The hide handler will save the value
    }
  }

  const handleDropDownHide = () => {
    isDropdownOpen.value = false
    // Only auto-save if user is not cancelling (ESC key)
    if (!isCancellingEdit.value && editingCell.value && currentEditingHeader.value?.dirTableId && currentEditingHeader.value?.columnType !== 'multi') {
      // Save changes immediately
      saveCellEdit(editingCell.value.headerId, editingCell.value.rowId)
      // Small delay before clearing edit state to ensure UI updates
      setTimeout(() => {
        cancelCellEdit()
      }, 0)
    }
  }

  // File upload handlers (for FILE and PATH types)
  const getFileName = (value) => {
    if (!value) return ''
    const str = String(value)
    // Handle HTML anchor format from API
    const anchorMatch = str.match(/<a[^>]*>([^<]*)<\/a>/i)
    if (anchorMatch) return anchorMatch[1]
    // Handle path format
    if (str.includes('/')) return str.split('/').pop() || str
    // Handle id:filename format
    if (str.includes(':')) return str.split(':').pop() || str
    return str
  }

  const handleFileUpload = (event, header, rowData) => {
    const file = event.files?.[0]
    if (!file) return

    // Emit event for wrapper to handle upload via API
    // termId is the requisite ID in the database (used for _m_save)
    // header.type is the base type (10=FILE, 17=PATH)
    emit('upload-file', {
      rowId: rowData.id,
      headerId: header.id,
      termId: header.termId, // Requisite ID for API
      baseType: header.type, // 10 for FILE, 17 for PATH
      file: file,
      callback: (result) => {
        // Update local value after successful upload
        if (result?.success) {
          editingValue.value = result.filename || file.name
          // Close edit mode after upload
          cancelCellEdit()
        }
      }
    })
  }

  const handleNativeFileSelect = (event, header, rowData) => {
    const file = event.target?.files?.[0]
    if (!file) return

    // Emit event for wrapper to handle upload via API
    emit('upload-file', {
      rowId: rowData.id,
      headerId: header.id,
      termId: header.termId,
      baseType: header.type,
      file: file,
      callback: (result) => {
        if (result?.success) {
          editingValue.value = result.filename || file.name
          cancelCellEdit()
        }
      }
    })

    // Reset input value so same file can be selected again
    event.target.value = ''
  }

  const clearFileValue = (header, rowData) => {
    // Clear the file value by setting it to empty string
    emit('cell-update', {
      rowId: rowData.id,
      headerId: header.id,
      value: '',
      type: header.type
    })
    editingValue.value = ''
    cancelCellEdit()
  }

  // MEMO/HTML dialog handlers
  const saveMemoEdit = () => {
    if (!memoEditingCell.value) return

    const { headerId, rowId } = memoEditingCell.value
    const header = localHeaders.value.find(h => h.id === headerId)

    // Immediate local update for reactive UI
    const overrideKey = `${rowId}:${headerId}`
    localCellOverrides.value.set(overrideKey, memoEditingValue.value)

    emit('cell-update', {
      rowId,
      headerId,
      value: memoEditingValue.value,
      type: header?.type || 12
    })

    // Mark cell as changed
    markCellAsChanged(headerId, rowId)

    // Close dialog
    isMemoDialogVisible.value = false
    memoEditingCell.value = null
    memoEditingValue.value = ''
  }

  const cancelMemoEdit = () => {
    isMemoDialogVisible.value = false
    memoEditingCell.value = null
    memoEditingValue.value = ''
  }

  // Cleanup function
  const cleanup = () => {
    document.removeEventListener('keydown', handleGlobalEscForDropdown, true)
    cancelCellEdit()
    cancelMemoEdit()
  }

  return {
    // State
    editingCell,
    editingValue,
    editingOptions,
    editingMultiValue,
    currentEditingHeader,
    cellEditorInput,
    isCancellingEdit,
    isDropdownOpen,
    memoEditingCell,
    memoEditingValue,
    isMemoDialogVisible,
    memoDialogHeader,
    memoTextarea,
    localCellOverrides,

    // Functions
    startCellEdit,
    saveCellEdit,
    cancelCellEdit,
    saveAndCloseCellEdit,
    isEditingCell,
    isInlineEditing,
    autoOpenMultiSelect,
    autoOpenDropdown,
    handleDropdownClick,
    handleMultiSelectHide,
    handleMultiSelectKeydown,
    handleDropdownKeydown,
    handleDropDownHide,
    handleDocumentClick,
    handleCellClick,
    handleCellDoubleClick,
    handleFileUpload,
    handleNativeFileSelect,
    clearFileValue,
    getFileName,
    saveMemoEdit,
    cancelMemoEdit,
    handleGlobalEscForDropdown,

    // Cleanup
    cleanup
  }
}
