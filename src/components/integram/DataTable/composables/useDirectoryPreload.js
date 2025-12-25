/**
 * Directory Preload Composable
 * Handles directory row preloading, caching, and background loading
 * Optimizes performance by preloading directory data on hover and in background
 */

import { ref } from 'vue'

export function useDirectoryPreload(localHeaders, processedRows, emit) {
  // Cache configuration
  const DIR_ROW_CACHE_TTL = 5 * 60 * 1000 // 5 minutes TTL
  const ROW_HOVER_DEBOUNCE_MS = 150 // Debounce time for row hover preloading
  const BACKGROUND_LOAD_DELAY_MS = 500 // Delay between background requests

  // Cache state
  const dirRowCache = ref(new Map()) // Map<string, { data: object, timestamp: number }>
  const preloadingDirRows = ref(new Set()) // Currently being preloaded

  // Background loading state
  const isBackgroundLoadingDirs = ref(false)
  const backgroundLoadProgress = ref({ loaded: 0, total: 0 })

  // Debounce timer for row hover
  let rowHoverDebounceTimer = null

  // Generate cache key for directory row
  const getDirRowCacheKey = (dirTableId, dirRowId) => `${dirTableId}:${dirRowId}`

  // Check if cache entry is still valid
  const isCacheValid = (cacheEntry) => {
    if (!cacheEntry) return false
    return Date.now() - cacheEntry.timestamp < DIR_ROW_CACHE_TTL
  }

  // Preload single directory row
  // autoLoadDirsEnabled can be:
  //   - true: force load (for hover/explicit user action)
  //   - false: don't load
  //   - 'false': string false (don't load)
  //   - undefined: use default (true for backward compatibility)
  const preloadSingleDirRow = (dirTableId, dirRowId, autoLoadDirsEnabled) => {
    // If explicitly true (e.g., from hover), always load regardless of settings
    if (autoLoadDirsEnabled === true) {
      // Load without any checks - user hovered
    } else {
      // Otherwise check if disabled
      const isDisabled = autoLoadDirsEnabled === false || autoLoadDirsEnabled === 'false'
      if (isDisabled) {
        return
      }
    }

    const cacheKey = getDirRowCacheKey(dirTableId, dirRowId)

    // Skip if already cached and valid
    const cached = dirRowCache.value.get(cacheKey)
    if (isCacheValid(cached)) {
      return
    }

    // Skip if already loading
    if (preloadingDirRows.value.has(cacheKey)) {
      return
    }

    preloadingDirRows.value.add(cacheKey)

    emit('load-dir-row', {
      dirTableId,
      dirRowId,
      callback: (data) => {
        // Cache even empty responses to avoid re-requesting
        dirRowCache.value.set(cacheKey, {
          data: data || null, // null means no data or error
          timestamp: Date.now()
        })
        preloadingDirRows.value.delete(cacheKey)
      }
    })
  }

  // Preload all directory rows for a specific row
  // autoLoadDirsEnabled can be:
  //   - true: force load (for hover/explicit user action)
  //   - false: don't load
  //   - 'false': string false (don't load)
  //   - undefined: use default (true for backward compatibility)
  const preloadRowDirData = (rowData, autoLoadDirsEnabled) => {
    // If explicitly true (e.g., from hover), always load regardless of settings
    if (autoLoadDirsEnabled === true) {
      // Load without any checks - user hovered
    } else {
      // Otherwise check if disabled
      const isDisabled = autoLoadDirsEnabled === false || autoLoadDirsEnabled === 'false'
      if (isDisabled) {
        return
      }
    }

    if (!rowData?.cells) return

    // Collect all directory references in this row
    const dirRefs = []

    localHeaders.value.forEach(header => {
      if (!header.dirTableId) return

      const cell = rowData.cells[header.id]
      if (!cell) return

      // Single directory reference
      if (cell.dirRowId) {
        dirRefs.push({ dirTableId: header.dirTableId, dirRowId: cell.dirRowId })
      }

      // Multi-select directory references
      if (cell.dirValues?.length > 0) {
        cell.dirValues.forEach(dv => {
          if (dv.dirRowId) {
            dirRefs.push({ dirTableId: header.dirTableId, dirRowId: dv.dirRowId })
          }
        })
      }
    })

    // Preload all directory rows
    dirRefs.forEach(ref => preloadSingleDirRow(ref.dirTableId, ref.dirRowId, autoLoadDirsEnabled))
  }

  // Handle row hover with debouncing
  const handleRowHover = (rowData, autoLoadDirsEnabled = true) => {
    if (rowHoverDebounceTimer) {
      clearTimeout(rowHoverDebounceTimer)
    }

    rowHoverDebounceTimer = setTimeout(() => {
      preloadRowDirData(rowData, autoLoadDirsEnabled)
    }, ROW_HOVER_DEBOUNCE_MS)
  }

  // Handle row focus (keyboard navigation)
  const handleRowFocus = (event, rowData, autoLoadDirsEnabled = true) => {
    // Only preload if focus came from keyboard navigation (tab)
    // Check if the focus is on a focusable element within the row
    const focusedElement = event.target
    if (focusedElement && rowData) {
      preloadRowDirData(rowData, autoLoadDirsEnabled)
    }
  }

  // Cancel row hover preloading
  const cancelRowHoverPreload = () => {
    if (rowHoverDebounceTimer) {
      clearTimeout(rowHoverDebounceTimer)
      rowHoverDebounceTimer = null
    }
  }

  // Background loading of all directory references in table
  const loadAllDirDataInBackground = async (autoLoadDirsEnabled = true) => {
    // ВАЖНО: Проверяем флаг autoLoadDirs перед началом загрузки!
    // Если отключено - не загружаем metadata справочников
    // Handle both boolean false and string "false"
    const isDisabled = autoLoadDirsEnabled === false || autoLoadDirsEnabled === 'false'
    if (isDisabled) {
      console.log('[loadAllDirDataInBackground] autoLoadDirs DISABLED - skipping directory background loading (value:', autoLoadDirsEnabled, ')')
      return
    }

    if (isBackgroundLoadingDirs.value) {
      console.log('Background loading already in progress')
      return
    }

    // Collect all unique directory references from all rows
    const dirRefsMap = new Map() // Map<cacheKey, {dirTableId, dirRowId}>

    processedRows.value.forEach(row => {
      if (!row?.cells) return

      localHeaders.value.forEach(header => {
        if (!header.dirTableId) return

        const cell = row.cells[header.id]
        if (!cell) return

        // Single directory reference
        if (cell.dirRowId) {
          const cacheKey = getDirRowCacheKey(header.dirTableId, cell.dirRowId)
          if (!dirRefsMap.has(cacheKey) && !isCacheValid(dirRowCache.value.get(cacheKey))) {
            dirRefsMap.set(cacheKey, { dirTableId: header.dirTableId, dirRowId: cell.dirRowId })
          }
        }

        // Multi-select directory references
        if (cell.dirValues?.length > 0) {
          cell.dirValues.forEach(dv => {
            if (dv.dirRowId) {
              const cacheKey = getDirRowCacheKey(header.dirTableId, dv.dirRowId)
              if (!dirRefsMap.has(cacheKey) && !isCacheValid(dirRowCache.value.get(cacheKey))) {
                dirRefsMap.set(cacheKey, { dirTableId: header.dirTableId, dirRowId: dv.dirRowId })
              }
            }
          })
        }
      })
    })

    const dirRefs = Array.from(dirRefsMap.values())

    if (dirRefs.length === 0) {
      console.log('All directory data already cached')
      return
    }

    isBackgroundLoadingDirs.value = true
    backgroundLoadProgress.value = { loaded: 0, total: dirRefs.length }

    console.log(`Starting background load of ${dirRefs.length} directory references...`)

    // Load with delay between requests
    for (let i = 0; i < dirRefs.length; i++) {
      // ВАЖНО: Проверяем флаг ВНУТРИ цикла чтобы можно было остановить loading
      // Это нужно потому что пользователь может отключить autoLoadDirs во время загрузки
      if (!isBackgroundLoadingDirs.value) {
        console.log(`[loadAllDirDataInBackground] Loading cancelled by user at ${i}/${dirRefs.length}`)
        break
      }

      const ref = dirRefs[i]
      const cacheKey = getDirRowCacheKey(ref.dirTableId, ref.dirRowId)

      // Skip if already cached (might have been cached by hover)
      if (isCacheValid(dirRowCache.value.get(cacheKey))) {
        backgroundLoadProgress.value.loaded++
        continue
      }

      // Skip if already loading
      if (preloadingDirRows.value.has(cacheKey)) {
        backgroundLoadProgress.value.loaded++
        continue
      }

      // Load directory row
      await new Promise(resolve => {
        preloadingDirRows.value.add(cacheKey)

        emit('load-dir-row', {
          dirTableId: ref.dirTableId,
          dirRowId: ref.dirRowId,
          callback: (data) => {
            // Cache even empty responses
            dirRowCache.value.set(cacheKey, {
              data: data || null,
              timestamp: Date.now()
            })
            preloadingDirRows.value.delete(cacheKey)
            backgroundLoadProgress.value.loaded++
            resolve()
          }
        })
      })

      // Delay before next request
      if (i < dirRefs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, BACKGROUND_LOAD_DELAY_MS))
      }
    }

    isBackgroundLoadingDirs.value = false
    console.log(`Background loading completed: ${backgroundLoadProgress.value.loaded}/${backgroundLoadProgress.value.total}`)
  }

  // Stop background loading
  const stopBackgroundLoading = () => {
    isBackgroundLoadingDirs.value = false
    backgroundLoadProgress.value = { loaded: 0, total: 0 }
  }

  // Clear directory row cache
  const clearDirRowCache = () => {
    dirRowCache.value.clear()
    preloadingDirRows.value.clear()
    cancelRowHoverPreload()
  }

  // Cleanup (for onBeforeUnmount)
  const cleanup = () => {
    cancelRowHoverPreload()
    stopBackgroundLoading()
    clearDirRowCache()
  }

  return {
    // State
    dirRowCache,
    preloadingDirRows,
    isBackgroundLoadingDirs,
    backgroundLoadProgress,

    // Constants
    DIR_ROW_CACHE_TTL,
    ROW_HOVER_DEBOUNCE_MS,
    BACKGROUND_LOAD_DELAY_MS,

    // Functions
    getDirRowCacheKey,
    isCacheValid,
    preloadSingleDirRow,
    preloadRowDirData,
    handleRowHover,
    handleRowFocus,
    cancelRowHoverPreload,
    loadAllDirDataInBackground,
    stopBackgroundLoading,
    clearDirRowCache,
    cleanup
  }
}
