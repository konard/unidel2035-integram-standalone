/**
 * Grouping Composable
 * Handles row grouping, multi-column grouping, and group expansion
 */

import { ref, computed } from 'vue'

export function useGrouping(localHeaders, sortedAndFilteredRows) {
  // Grouping state
  const groupedData = ref(null)
  const currentGroupColumns = ref([])
  const expandedGroups = ref({})
  const currentGroupColumn = ref(null)

  // Flattened rows for virtual scrolling with grouping support
  const flattenedRows = computed(() => {
    if (!groupedData.value) {
      return sortedAndFilteredRows.value.map(row => ({ type: 'row', data: row }))
    }

    const result = []
    for (const [groupKey, group] of Object.entries(groupedData.value.groups)) {
      result.push({ type: 'group', key: groupKey, data: group })
      if (expandedGroups.value[groupKey]) {
        result.push(...group.rows.map(row => ({ type: 'row', data: row })))
      }
    }
    return result
  })

  // Toggle multi-column grouping
  const toggleMultiGroupBy = (headerIds) => {
    const validHeaderIds = headerIds.filter(id =>
      id && localHeaders.value.some(header => header.id === id)
    )

    if (validHeaderIds.length === 0 ||
        (currentGroupColumns.value.length === validHeaderIds.length &&
         currentGroupColumns.value.every(id => validHeaderIds.includes(id)))) {
      groupedData.value = null
      currentGroupColumns.value = []
      expandedGroups.value = {}
    } else {
      currentGroupColumns.value = validHeaderIds
      groupMultiData(validHeaderIds)
    }
  }

  // Group data by multiple columns
  const groupMultiData = (headerIds) => {
    const groups = {}

    sortedAndFilteredRows.value.forEach(row => {
      const groupKey = headerIds.map(headerId => {
        const cell = row.cells[headerId]
        const value = cell?.value
        return value !== null && value !== undefined ? value : '(Пусто)'
      }).join('|')

      if (!groups[groupKey]) groups[groupKey] = { rows: [], count: 0 }
      groups[groupKey].rows.push(row)
      groups[groupKey].count++
    })

    groupedData.value = { columns: headerIds, groups: groups }
    expandedGroups.value = Object.keys(groups).reduce((acc, key) => {
      acc[key] = true
      return acc
    }, {})
  }

  // Toggle single-column grouping
  const toggleGroupBy = (headerId) => {
    if (currentGroupColumn.value === headerId) {
      groupedData.value = null
      currentGroupColumn.value = null
      expandedGroups.value = {}
    } else {
      currentGroupColumn.value = headerId
      groupData(headerId)
    }
  }

  // Group data by single column
  const groupData = (headerId) => {
    const groups = {}
    sortedAndFilteredRows.value.forEach(row => {
      const cell = row.cells[headerId]
      const groupKey = cell?.value || '(Пусто)'
      if (!groups[groupKey]) groups[groupKey] = { rows: [], count: 0 }
      groups[groupKey].rows.push(row)
      groups[groupKey].count++
    })
    groupedData.value = { column: headerId, groups }
    expandedGroups.value = Object.keys(groups).reduce((acc, key) => {
      acc[key] = true
      return acc
    }, {})
  }

  // Toggle group expansion
  const toggleGroup = (groupKey) => {
    expandedGroups.value[groupKey] = !expandedGroups.value[groupKey]
  }

  // Format multi-group header display
  const formatMultiGroupHeader = (groupKey) => {
    const values = groupKey.split('|')
    return values.map((value, index) => {
      const headerId = currentGroupColumns.value[index]
      const header = localHeaders.value.find(h => h.id === headerId)
      return header ? `${header.value}: ${value}` : value
    }).join('; ')
  }

  // Cleanup
  const cleanup = () => {
    groupedData.value = null
    currentGroupColumns.value = []
    expandedGroups.value = {}
    currentGroupColumn.value = null
  }

  return {
    // State
    groupedData,
    currentGroupColumns,
    expandedGroups,
    currentGroupColumn,
    flattenedRows,

    // Functions
    toggleMultiGroupBy,
    groupMultiData,
    toggleGroupBy,
    groupData,
    toggleGroup,
    formatMultiGroupHeader,
    cleanup
  }
}
