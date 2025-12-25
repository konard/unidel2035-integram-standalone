/**
 * useTableSort - Composable for multi-level sorting
 */

import { ref, computed } from 'vue'

export function useTableSort(rows, localHeaders) {
  // Multi-level sorting state: Array of { headerId, direction: 'asc' | 'desc' }
  const sortColumns = ref([])

  // Get sort direction for a column
  const getSortDirection = (headerId) => {
    const sortCol = sortColumns.value.find(s => s.headerId === headerId)
    return sortCol?.direction || null
  }

  // Get sort index for a column (for multi-sort)
  const getSortIndex = (headerId) => {
    const index = sortColumns.value.findIndex(s => s.headerId === headerId)
    return index >= 0 ? index + 1 : null
  }

  // Toggle sort for a column
  const toggleSort = (headerId, multiSort = false) => {
    const existingIndex = sortColumns.value.findIndex(s => s.headerId === headerId)

    if (existingIndex >= 0) {
      const current = sortColumns.value[existingIndex]
      if (current.direction === 'asc') {
        // Switch to descending
        sortColumns.value[existingIndex].direction = 'desc'
      } else {
        // Remove sort
        sortColumns.value.splice(existingIndex, 1)
      }
    } else {
      // Add new sort
      if (!multiSort) {
        // Single sort mode - clear others
        sortColumns.value = [{ headerId, direction: 'asc' }]
      } else {
        // Multi-sort mode - add to list
        sortColumns.value.push({ headerId, direction: 'asc' })
      }
    }
  }

  // Sort ascending
  const sortAsc = (headerId, multiSort = false) => {
    if (!multiSort) {
      sortColumns.value = [{ headerId, direction: 'asc' }]
    } else {
      const existingIndex = sortColumns.value.findIndex(s => s.headerId === headerId)
      if (existingIndex >= 0) {
        sortColumns.value[existingIndex].direction = 'asc'
      } else {
        sortColumns.value.push({ headerId, direction: 'asc' })
      }
    }
  }

  // Sort descending
  const sortDesc = (headerId, multiSort = false) => {
    if (!multiSort) {
      sortColumns.value = [{ headerId, direction: 'desc' }]
    } else {
      const existingIndex = sortColumns.value.findIndex(s => s.headerId === headerId)
      if (existingIndex >= 0) {
        sortColumns.value[existingIndex].direction = 'desc'
      } else {
        sortColumns.value.push({ headerId, direction: 'desc' })
      }
    }
  }

  // Clear all sorting
  const clearSort = () => {
    sortColumns.value = []
  }

  // Computed: sorted rows
  const sortedRows = computed(() => {
    if (sortColumns.value.length === 0) {
      return rows.value
    }

    return [...rows.value].sort((a, b) => {
      for (const { headerId, direction } of sortColumns.value) {
        const header = localHeaders.value.find(h => h.id === headerId)
        if (!header) continue

        const aCell = a.cells[headerId]
        const bCell = b.cells[headerId]

        let aValue = aCell?.value ?? ''
        let bValue = bCell?.value ?? ''

        // Handle different types
        const type = header.type

        // Numeric comparison
        if ([8, 13].includes(type)) {
          aValue = parseFloat(aValue) || 0
          bValue = parseFloat(bValue) || 0
        }
        // Date comparison
        else if ([4, 9].includes(type)) {
          aValue = aValue ? new Date(aValue * 1000).getTime() : 0
          bValue = bValue ? new Date(bValue * 1000).getTime() : 0
        }
        // Boolean comparison
        else if (type === 11) {
          aValue = aValue ? 1 : 0
          bValue = bValue ? 1 : 0
        }
        // String comparison (default)
        else {
          aValue = String(aValue).toLowerCase()
          bValue = String(bValue).toLowerCase()
        }

        if (aValue < bValue) return direction === 'asc' ? -1 : 1
        if (aValue > bValue) return direction === 'asc' ? 1 : -1
      }
      return 0
    })
  })

  return {
    // State
    sortColumns,

    // Methods
    getSortDirection,
    getSortIndex,
    toggleSort,
    sortAsc,
    sortDesc,
    clearSort,

    // Computed
    sortedRows
  }
}
