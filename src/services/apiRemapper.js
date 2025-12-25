/**
 * API Response Remapper Service
 * Transforms raw Integram API data into Table.vue-compatible format
 */

/**
 * Remap Integram API response data to Table.vue format
 * @param {Object} data - Raw API response data
 * @param {Object} types - Type information (edit_types)
 * @param {Object} options - Remapping options
 * @returns {Object} Remapped data in Table-compatible format
 */
export function remapData(data, types = {}, options = {}) {
  // If data is already in the expected format, return as-is
  if (!data || typeof data !== 'object') {
    return data
  }

  // Handle array responses
  if (Array.isArray(data)) {
    return data.map(item => remapData(item, types, options))
  }

  // Handle object responses
  // The main remapping logic transforms Integram API format to Table.vue format
  // This is a simplified stub implementation

  // If data has 'object' and 'reqs' properties, it's likely an object list response
  if (data.object && data.reqs) {
    return {
      ...data,
      // Transform requisites data if needed
      transformedReqs: transformRequisites(data.reqs, types)
    }
  }

  // Otherwise return data as-is
  return data
}

/**
 * Transform requisites data structure
 * @param {Object} reqs - Requisites data
 * @param {Object} types - Type information
 * @returns {Object} Transformed requisites
 */
function transformRequisites(reqs, types) {
  if (!reqs || typeof reqs !== 'object') {
    return reqs
  }

  // Transform each requisite entry
  const transformed = {}

  for (const [key, value] of Object.entries(reqs)) {
    // Transform requisite value based on type
    transformed[key] = transformRequisiteValue(value, types)
  }

  return transformed
}

/**
 * Transform individual requisite value
 * @param {*} value - Requisite value
 * @param {Object} types - Type information
 * @returns {*} Transformed value
 */
function transformRequisiteValue(value, types) {
  // Handle different value types
  if (value === null || value === undefined) {
    return value
  }

  // If value is an object with specific structure, transform it
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Check if it has common Integram requisite properties
    if ('value' in value || 'val' in value) {
      return value.value || value.val || value
    }
  }

  // Otherwise return value as-is
  return value
}
