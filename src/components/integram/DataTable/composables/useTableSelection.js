/**
 * useTableSelection - Composable for cell and row selection
 */

import { ref, computed } from 'vue'

export function useTableSelection(props, localHeaders, processedRows) {
  // Cell selection state
  const selectedCells = ref({
    start: null, // { headerId, rowId }
    end: null,   // { headerId, rowId }
    isSelecting: false
  })

  // Row selection state (bulk operations)
  const selectionModeEnabled = ref(false)
  const selectedRowIds = ref(new Set())
  const lastSelectedRowIndex = ref(null)

  // Computed: Selection range bounds
  const selectionRange = computed(() => {
    if (!selectedCells.value.start) return null
    if (!selectedCells.value.end) {
      // Single cell selected
      const rowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.start.rowId)
      const colIndex = localHeaders.value.findIndex(h => h.id === selectedCells.value.start.headerId)
      return {
        minRow: rowIndex,
        maxRow: rowIndex,
        minCol: colIndex,
        maxCol: colIndex
      }
    }

    const startRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.start.rowId)
    const endRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.end.rowId)
    const startColIndex = localHeaders.value.findIndex(h => h.id === selectedCells.value.start.headerId)
    const endColIndex = localHeaders.value.findIndex(h => h.id === selectedCells.value.end.headerId)

    return {
      minRow: Math.min(startRowIndex, endRowIndex),
      maxRow: Math.max(startRowIndex, endRowIndex),
      minCol: Math.min(startColIndex, endColIndex),
      maxCol: Math.max(startColIndex, endColIndex)
    }
  })

  // Computed: Range statistics (sum, avg, count, etc.)
  const rangeStatistics = computed(() => {
    if (!selectionRange.value) return null

    const { minRow, maxRow, minCol, maxCol } = selectionRange.value
    const selectedHeaders = localHeaders.value.slice(minCol, maxCol + 1)
    const selectedRows = processedRows.value.slice(minRow, maxRow + 1)

    let cellCount = 0
    let numericCount = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    const values = []

    for (const row of selectedRows) {
      for (const header of selectedHeaders) {
        cellCount++
        const cell = row.cells[header.id]
        const rawValue = cell?.value
        const numValue = parseFloat(rawValue)

        if (!isNaN(numValue)) {
          numericCount++
          sum += numValue
          values.push(numValue)
          if (numValue < min) min = numValue
          if (numValue > max) max = numValue
        }
      }
    }

    return {
      cellCount,
      numericCount,
      sum: numericCount > 0 ? sum : null,
      avg: numericCount > 0 ? sum / numericCount : null,
      min: numericCount > 0 && min !== Infinity ? min : null,
      max: numericCount > 0 && max !== -Infinity ? max : null
    }
  })

  // Check if cell is selected
  const isCellSelected = (headerId, rowId) => {
    return selectedCells.value.start?.headerId === headerId &&
           selectedCells.value.start?.rowId === rowId
  }

  // Check if cell is in selection range
  const isInSelectionRange = (headerId, rowId) => {
    if (!selectionRange.value) return false
    const rowIndex = processedRows.value.findIndex(r => r.id === rowId)
    const colIndex = headerId === 'row-counter' ? -1 : localHeaders.value.findIndex(h => h.id === headerId)
    return (
      rowIndex >= selectionRange.value.minRow &&
      rowIndex <= selectionRange.value.maxRow &&
      colIndex >= selectionRange.value.minCol &&
      colIndex <= selectionRange.value.maxCol
    )
  }

  // Get cell from mouse event
  const getCellFromEvent = (event) => {
    const td = event.target.closest('td')
    if (!td) return null
    return {
      headerId: td.dataset.headerId || 'row-counter',
      rowId: td.closest('tr')?.dataset?.rowId
    }
  }

  // Start cell selection
  const startSelection = (event) => {
    const cell = getCellFromEvent(event)
    if (cell) {
      selectedCells.value = {
        start: { headerId: cell.headerId, rowId: cell.rowId },
        end: null,
        isSelecting: true
      }
    }
  }

  // Handle drag selection
  const handleDragSelection = (event) => {
    if (!selectedCells.value.isSelecting) return
    const cell = getCellFromEvent(event)
    if (cell) {
      selectedCells.value.end = { headerId: cell.headerId, rowId: cell.rowId }
    }
  }

  // End selection
  const endSelection = () => {
    selectedCells.value.isSelecting = false
  }

  // Select single cell
  const selectCell = (headerId, rowId, options = {}) => {
    const { extend = false, ctrlKey = false } = options

    if (extend && selectedCells.value.start) {
      // Shift+click: Extend selection
      selectedCells.value.end = { headerId, rowId }
    } else if (ctrlKey) {
      // Ctrl+click: Start new selection
      selectedCells.value = {
        start: { headerId, rowId },
        end: null,
        isSelecting: false
      }
    } else {
      // Regular click: Select single cell
      selectedCells.value = {
        start: { headerId, rowId },
        end: null,
        isSelecting: false
      }
    }
  }

  // Clear selection
  const clearSelection = () => {
    selectedCells.value = {
      start: null,
      end: null,
      isSelecting: false
    }
  }

  // Toggle row selection
  const toggleRowSelection = (rowId, event = null) => {
    if (event?.shiftKey && lastSelectedRowIndex.value !== null) {
      // Range selection
      const currentIndex = processedRows.value.findIndex(r => r.id === rowId)
      const start = Math.min(lastSelectedRowIndex.value, currentIndex)
      const end = Math.max(lastSelectedRowIndex.value, currentIndex)

      for (let i = start; i <= end; i++) {
        const id = processedRows.value[i]?.id
        if (id) selectedRowIds.value.add(id)
      }
    } else {
      // Single toggle
      if (selectedRowIds.value.has(rowId)) {
        selectedRowIds.value.delete(rowId)
      } else {
        selectedRowIds.value.add(rowId)
      }
      lastSelectedRowIndex.value = processedRows.value.findIndex(r => r.id === rowId)
    }
  }

  // Select all rows
  const selectAllRows = () => {
    processedRows.value.forEach(row => {
      selectedRowIds.value.add(row.id)
    })
  }

  // Clear row selection
  const clearRowSelection = () => {
    selectedRowIds.value.clear()
    lastSelectedRowIndex.value = null
  }

  // Toggle selection mode
  const toggleSelectionMode = () => {
    selectionModeEnabled.value = !selectionModeEnabled.value
    if (!selectionModeEnabled.value) {
      clearRowSelection()
    }
  }

  return {
    // State
    selectedCells,
    selectionModeEnabled,
    selectedRowIds,
    lastSelectedRowIndex,

    // Computed
    selectionRange,
    rangeStatistics,

    // Methods
    isCellSelected,
    isInSelectionRange,
    getCellFromEvent,
    startSelection,
    handleDragSelection,
    endSelection,
    selectCell,
    clearSelection,
    toggleRowSelection,
    selectAllRows,
    clearRowSelection,
    toggleSelectionMode
  }
}
