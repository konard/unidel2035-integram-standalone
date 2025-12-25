/**
 * Virtual Scrolling Composable
 * Handles virtual scrolling for large datasets to optimize rendering performance
 */

import { ref, computed } from 'vue'

// Virtual scrolling constants
export const VIRTUAL_SCROLL_ROW_HEIGHT = 32 // Row height in pixels (matches comfortable density)
export const VIRTUAL_SCROLL_BUFFER = 20 // Extra rows to render above/below viewport
export const VIRTUAL_SCROLL_ENABLED_THRESHOLD = 500 // Enable virtual scrolling when rows > threshold

export function useVirtualScroll(flattenedRows, emit) {
  // Virtual scrolling state
  const virtualScrollTop = ref(0)
  const containerHeight = ref(600)

  // Computed: is virtual scrolling enabled
  const isVirtualScrollEnabled = computed(() => {
    // TEMPORARILY DISABLED for debugging white space issue
    // TODO: Re-enable after finding root cause
    return false

    // Original logic:
    // return flattenedRows.value.length > VIRTUAL_SCROLL_ENABLED_THRESHOLD
  })

  // Computed: visible row range (start, end, offset)
  const visibleRowRange = computed(() => {
    if (!isVirtualScrollEnabled.value) {
      // Return all rows if virtual scroll is disabled
      return { start: 0, end: flattenedRows.value.length, offset: 0 }
    }

    const scrollTop = virtualScrollTop.value
    const startIndex = Math.floor(scrollTop / VIRTUAL_SCROLL_ROW_HEIGHT)
    const visibleCount = Math.ceil(containerHeight.value / VIRTUAL_SCROLL_ROW_HEIGHT)

    const start = Math.max(0, startIndex - VIRTUAL_SCROLL_BUFFER)
    const end = Math.min(flattenedRows.value.length, startIndex + visibleCount + VIRTUAL_SCROLL_BUFFER)
    const offset = start * VIRTUAL_SCROLL_ROW_HEIGHT

    return { start, end, offset }
  })

  // Computed: visible rows (slice of flattenedRows)
  const visibleRows = computed(() => {
    const { start, end } = visibleRowRange.value
    return flattenedRows.value.slice(start, end)
  })

  // Computed: total height of all rows
  const totalRowsHeight = computed(() => {
    if (!isVirtualScrollEnabled.value) {
      return null
    }
    return flattenedRows.value.length * VIRTUAL_SCROLL_ROW_HEIGHT
  })

  // Update table height based on layout
  const updateTableHeight = () => {
    const tableContainer = document.querySelector('.table-container')
    if (!tableContainer) return

    const tabview = document.querySelector('.p-tabview-tablist-container')
    const tabviewHeight = tabview ? tabview.offsetHeight : 0
    const layoutMain = document.querySelector('.layout-main')
    const layoutMainHeight = layoutMain ? layoutMain.offsetHeight : 0
    const panels = document.querySelector('.p-tabview-panels')
    const styles = panels ? window.getComputedStyle(panels) : null
    const paddingTop = styles ? parseFloat(styles.paddingTop) : 0
    const paddingBottom = styles ? parseFloat(styles.paddingBottom) : 0
    const layoutMainStyles = layoutMain ? window.getComputedStyle(layoutMain) : null
    const layoutMainPaddingBottom = layoutMainStyles ? parseFloat(layoutMainStyles.paddingBottom) : 0

    let heightDifference = layoutMainHeight - tabviewHeight - paddingTop - paddingBottom - layoutMainPaddingBottom

    // Fallback: if layoutMain doesn't exist or heightDifference is invalid,
    // use the container's actual clientHeight or a reasonable default
    if (!layoutMain || heightDifference <= 0) {
      // Use actual container height if available, otherwise use viewport-based fallback
      const actualHeight = tableContainer.clientHeight
      if (actualHeight > 0) {
        heightDifference = actualHeight
      } else {
        // Fallback to window height minus some padding for header/footer
        heightDifference = Math.max(400, window.innerHeight - 200)
      }
    }

    tableContainer.style.setProperty('max-height', `${heightDifference}px`)
    containerHeight.value = heightDifference
  }

  // Handle scroll events
  const handleScroll = (event) => {
    const container = event.target
    const { scrollTop, scrollHeight, clientHeight } = container

    // Update virtual scroll position only when virtual scrolling is enabled
    // This prevents unnecessary reactive updates for small tables
    if (isVirtualScrollEnabled.value) {
      virtualScrollTop.value = scrollTop
    }

    // Load more data when near bottom
    const threshold = 100
    if (scrollHeight - (scrollTop + clientHeight) < threshold) {
      emit('load-more')
    }
  }

  return {
    // State
    virtualScrollTop,
    containerHeight,

    // Computed
    isVirtualScrollEnabled,
    visibleRowRange,
    visibleRows,
    totalRowsHeight,

    // Functions
    updateTableHeight,
    handleScroll
  }
}
