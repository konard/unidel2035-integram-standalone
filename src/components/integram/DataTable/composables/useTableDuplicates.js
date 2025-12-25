/**
 * useTableDuplicates - Composable for duplicate highlighting
 */

import { ref, computed } from 'vue'
import { DUPLICATE_COLORS } from '../utils/constants.js'
import { normalizeValue } from '../utils/formatters.js'

export function useTableDuplicates(rows, localHeaders) {
  // Set of column IDs with duplicate highlighting enabled
  const duplicateHighlightColumns = ref(new Set())

  // Computed: Map of duplicate groups per column
  // { headerId: Map<normalizedValue, { color, count, rowIds }> }
  const duplicateGroups = computed(() => {
    const groups = {}

    for (const headerId of duplicateHighlightColumns.value) {
      const valueMap = new Map() // normalizedValue -> { originalValue, rowIds }

      // Count occurrences
      for (const row of rows.value) {
        const cell = row.cells[headerId]
        const value = cell?.value
        if (value === null || value === undefined || value === '') continue

        const normalized = normalizeValue(value)
        if (valueMap.has(normalized)) {
          valueMap.get(normalized).rowIds.push(row.id)
        } else {
          valueMap.set(normalized, {
            originalValue: value,
            rowIds: [row.id]
          })
        }
      }

      // Filter to only duplicates and assign colors
      const duplicates = new Map()
      let colorIndex = 0

      for (const [normalized, data] of valueMap) {
        if (data.rowIds.length > 1) {
          duplicates.set(normalized, {
            color: DUPLICATE_COLORS[colorIndex % DUPLICATE_COLORS.length],
            count: data.rowIds.length,
            rowIds: data.rowIds,
            originalValue: data.originalValue
          })
          colorIndex++
        }
      }

      groups[headerId] = duplicates
    }

    return groups
  })

  // Toggle duplicate highlighting for a column
  const toggleDuplicateHighlight = (headerId) => {
    if (duplicateHighlightColumns.value.has(headerId)) {
      duplicateHighlightColumns.value.delete(headerId)
    } else {
      duplicateHighlightColumns.value.add(headerId)
    }
  }

  // Check if column has duplicate highlighting enabled
  const hasDuplicateHighlight = (headerId) => {
    return duplicateHighlightColumns.value.has(headerId)
  }

  // Get duplicate info for a cell
  const getDuplicateInfo = (headerId, rowId) => {
    const groups = duplicateGroups.value[headerId]
    if (!groups) return null

    const row = rows.value.find(r => r.id === rowId)
    if (!row) return null

    const cell = row.cells[headerId]
    const normalized = normalizeValue(cell?.value)

    return groups.get(normalized) || null
  }

  // Get duplicate color for a cell
  const getDuplicateColor = (headerId, rowId) => {
    const info = getDuplicateInfo(headerId, rowId)
    return info?.color || null
  }

  // Get duplicate count for a cell
  const getDuplicateCount = (headerId, rowId) => {
    const info = getDuplicateInfo(headerId, rowId)
    return info?.count || 0
  }

  // Check if cell is duplicate
  const isDuplicate = (headerId, rowId) => {
    return getDuplicateInfo(headerId, rowId) !== null
  }

  // Get total duplicate count for a column
  const getColumnDuplicateCount = (headerId) => {
    const groups = duplicateGroups.value[headerId]
    if (!groups) return { total: 0, groups: 0 }

    let total = 0
    for (const data of groups.values()) {
      total += data.count
    }

    return {
      total,
      groups: groups.size
    }
  }

  // Clear all duplicate highlighting
  const clearDuplicateHighlighting = () => {
    duplicateHighlightColumns.value.clear()
  }

  return {
    // State
    duplicateHighlightColumns,

    // Computed
    duplicateGroups,

    // Methods
    toggleDuplicateHighlight,
    hasDuplicateHighlight,
    getDuplicateInfo,
    getDuplicateColor,
    getDuplicateCount,
    isDuplicate,
    getColumnDuplicateCount,
    clearDuplicateHighlighting
  }
}
