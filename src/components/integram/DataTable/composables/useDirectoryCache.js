/**
 * Directory Cache Composable
 * Handles directory list caching, loading, and management for dropdown/multiselect cells
 */

import { ref, computed } from 'vue'

export function useDirectoryCache(localHeaders, emit) {
  // Directory caching state
  const directoryLists = ref({})
  const directoryCache = ref({})
  const loadingDirectories = ref(new Set())

  // Computed: Check if directory is loading
  const isDirectoryLoading = (dirTableId) => {
    const isLoading = loadingDirectories.value.has(dirTableId)
    console.log('[isDirectoryLoading] dirTableId:', dirTableId, 'isLoading:', isLoading, 'loadingSet:', [...loadingDirectories.value])
    return isLoading
  }

  // Get options from directory cache
  const getDirectoryOptions = (dirTableId) => {
    const options = directoryCache.value[dirTableId] || []
    console.log('[getDirectoryOptions] dirTableId:', dirTableId, 'options:', options.length, 'sample:', options[0])
    return options
  }

  // Load directory list (with caching)
  const loadDirectoryList = (dirTableId) => {
    console.log('[DataTable.loadDirectoryList] dirTableId:', dirTableId, 'cached:', !!directoryCache.value[dirTableId])
    if (!directoryCache.value[dirTableId]) {
      loadingDirectories.value.add(dirTableId)
      console.log('[DataTable.loadDirectoryList] Emitting load-directory-list for:', dirTableId)
      emit('load-directory-list', {
        dirTableId,
        callback: list => {
          console.log('[DataTable.loadDirectoryList] Callback received for:', dirTableId, 'items:', list?.length)
          directoryCache.value[dirTableId] = list
          loadingDirectories.value.delete(dirTableId)
        }
      })
    }
  }

  // Update directory value (single select)
  const updateDirValue = (header) => {
    const dirTableId = header.dirTableId
    const selectedItem = directoryCache.value[dirTableId]?.find(item => item.id === header.dirRowId)
    header.value = selectedItem ? selectedItem.value : ''
  }

  // Update multi-directory value (multi-select)
  const updateMultiDirValue = (header) => {
    const dirTableId = header.dirTableId
    const selectedItems = directoryCache.value[dirTableId]?.filter(item => header.dirValues.includes(item.id))
    header.value = selectedItems.map(item => item.value).join(', ') || ''
  }

  // Preload all directories for current headers
  const preloadAllDirectories = async () => {
    const dirTableIds = [...new Set(
      localHeaders.value
        .map(h => h.dirTableId)
        .filter(Boolean)
    )]

    if (dirTableIds.length === 0) return

    // Load all directories in parallel
    await Promise.all(
      dirTableIds.map(id => new Promise(resolve => {
        if (!directoryCache.value[id]) {
          loadingDirectories.value.add(id)
          emit('load-directory-list', {
            dirTableId: id,
            callback: list => {
              directoryCache.value[id] = list
              directoryLists.value[id] = list
              loadingDirectories.value.delete(id)
              resolve()
            }
          })
        } else {
          resolve()
        }
      }))
    )
  }

  // Load all directories (synchronous, fire-and-forget)
  const loadAllDirectories = () => {
    const dirTableIds = new Set()
    localHeaders.value.forEach(header => {
      if (header.dirTableId) dirTableIds.add(header.dirTableId)
    })
    dirTableIds.forEach(id => loadDirectoryList(id))
  }

  // Refresh directory cache
  const refreshDirectoryCache = () => {
    const dirTableIds = Object.keys(directoryCache.value)

    dirTableIds.forEach(id => {
      loadingDirectories.value.add(id)
      emit('load-directory-list', {
        dirTableId: id,
        callback: list => {
          directoryCache.value[id] = list
          directoryLists.value[id] = list
          loadingDirectories.value.delete(id)
        }
      })
    })
  }

  // Clear directory cache
  const clearDirectoryCache = () => {
    directoryLists.value = {}
    directoryCache.value = {}
    loadingDirectories.value.clear()
  }

  // Computed: Check if loading any directory
  const isLoadingAnyDirectory = computed(() => {
    return loadingDirectories.value.size > 0
  })

  return {
    // State
    directoryLists,
    directoryCache,
    loadingDirectories,

    // Computed
    isLoadingAnyDirectory,

    // Functions
    isDirectoryLoading,
    getDirectoryOptions,
    loadDirectoryList,
    updateDirValue,
    updateMultiDirValue,
    preloadAllDirectories,
    loadAllDirectories,
    refreshDirectoryCache,
    clearDirectoryCache
  }
}
