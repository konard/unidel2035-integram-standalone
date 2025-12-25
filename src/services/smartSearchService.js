/**
 * Smart Search Service - Stub Implementation
 * Provides empty search results to prevent errors during development
 */

/**
 * Debounced smart search function
 * @param {string} query - Search query
 * @param {Array} menuModel - Menu model for searching
 * @param {Object} options - Search options
 * @param {Function} callback - Callback function to receive results
 */
export function debouncedSmartSearch(query, menuModel, options, callback) {
  // Stub implementation - returns empty results after a short delay
  setTimeout(() => {
    const emptyResults = {
      routes: [],
      agents: [],
      integrамResults: [],
      aiResults: []
    }

    if (typeof callback === 'function') {
      callback(emptyResults)
    }
  }, 100)
}

export default {
  debouncedSmartSearch
}
