/**
 * API Response Remapper
 * Transforms Integram API responses into Table.vue-compatible format
 */

/**
 * Remap Integram API data to Table.vue format
 * @param {Object} data - Raw API response data
 * @param {Object} types - Type metadata including edit_types
 * @param {Object} options - Remapping options
 * @returns {Object} Remapped data compatible with Table.vue
 */
export function remapData(data, types = {}, options = {}) {
  // If data is already in expected format, return as-is
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Check if it's already wrapped in response format
    if (data.response || data.status) {
      return data
    }

    // Check if it looks like Table.vue data (has rows/columns)
    if (data.rows || data.columns) {
      return data
    }
  }

  // If data is an array, assume it's rows
  if (Array.isArray(data)) {
    return {
      rows: data,
      total: data.length,
      columns: []
    }
  }

  // If data is a single object, wrap it
  if (data && typeof data === 'object') {
    return {
      item: data,
      ...data
    }
  }

  // Return data as-is if we don't know how to remap it
  return data
}

export default remapData
