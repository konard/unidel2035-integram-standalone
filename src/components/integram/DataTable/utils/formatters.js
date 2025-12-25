/**
 * DataTable Formatters
 * Utility functions for formatting cell values
 */

/**
 * Format date from Unix timestamp
 * @param {number} timestamp - Unix timestamp in seconds
 * @param {string} format - Format string (dd.MM.yyyy HH:mm:ss)
 * @returns {string} Formatted date string
 */
export const formatDate = (timestamp, format) => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  return format
    .replace('dd', String(date.getDate()).padStart(2, '0'))
    .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
    .replace('yyyy', date.getFullYear())
    .replace('HH', String(date.getHours()).padStart(2, '0'))
    .replace('mm', String(date.getMinutes()).padStart(2, '0'))
    .replace('ss', String(date.getSeconds()).padStart(2, '0'))
}

/**
 * Pluralize Russian word "запись" (record)
 * @param {number} count - Number of records
 * @returns {string} Correct form of the word
 */
export const pluralizeRecords = (count) => {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'записей'
  if (n1 > 1 && n1 < 5) return 'записи'
  if (n1 === 1) return 'запись'
  return 'записей'
}

/**
 * Get CSS class for nested badge based on count
 * @param {number|string} count - Number of nested items
 * @returns {string} CSS class name
 */
export const getNestedBadgeClass = (count) => {
  const n = parseInt(count) || 0
  if (n === 0) return 'badge-empty'
  if (n <= 3) return 'badge-few'
  if (n <= 10) return 'badge-some'
  return 'badge-many'
}

/**
 * Get label for nested table column
 * @param {number|string} count - Number of nested items
 * @param {string} headerLabel - Column header label
 * @returns {string} Display label
 */
export const getNestedLabel = (count, headerLabel) => {
  const n = parseInt(count) || 0
  // If column name is short, use it
  if (headerLabel && headerLabel.length <= 12) {
    return headerLabel
  }
  return pluralizeRecords(n)
}

/**
 * Format cell value based on type
 * @param {*} value - Cell value
 * @param {number} type - Cell type ID
 * @param {Function} evaluateFormula - Formula evaluation function (optional)
 * @param {Array} rows - All rows (for formula evaluation)
 * @param {string|number} rowId - Current row ID
 * @param {string|number} headerId - Current header ID
 * @returns {string} Formatted value
 */
export const formatCellValue = (value, type, evaluateFormula = null, rows = [], rowId = null, headerId = null) => {
  let displayValue = value

  // Evaluate formula if needed
  if (evaluateFormula && rowId !== null && typeof value === 'string' && value.startsWith('=')) {
    displayValue = evaluateFormula(value, rows, rowId, headerId, 0, new Set())
  }

  if (displayValue === null || displayValue === undefined) return ''

  switch (type) {
    case 11: // Boolean
      return displayValue ? '✓' : '✗'
    case 9: { // Date
      if (typeof displayValue === 'number') {
        return formatDate(displayValue, 'dd.MM.yyyy')
      }
      if (typeof displayValue === 'string') {
        if (/^\d+$/.test(displayValue)) {
          return formatDate(parseInt(displayValue, 10), 'dd.MM.yyyy')
        }
        return displayValue
      }
      return displayValue
    }
    case 4: { // DateTime
      if (typeof displayValue === 'number') {
        return formatDate(displayValue, 'dd.MM.yyyy HH:mm:ss')
      }
      if (typeof displayValue === 'string') {
        if (/^\d+$/.test(displayValue)) {
          return formatDate(parseInt(displayValue, 10), 'dd.MM.yyyy HH:mm:ss')
        }
        return displayValue
      }
      return displayValue
    }
    default:
      return displayValue
  }
}

/**
 * Format time ago for change indicators
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable time ago string
 */
export const formatTimeAgo = (timestamp) => {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours >= 24) return 'сегодня'
  if (hours >= 1) return `${hours} ч назад`
  if (minutes >= 1) return `${minutes} мин назад`
  return `${seconds} сек назад`
}

/**
 * Normalize string for comparison (lowercase, trim, collapse whitespace)
 * @param {*} value - Value to normalize
 * @returns {string} Normalized string
 */
export const normalizeValue = (value) => {
  if (value === null || value === undefined) return ''
  return String(value).toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Get display value for tag (multi-select)
 * @param {Object} header - Column header
 * @param {string|number} dirRowId - Directory row ID
 * @param {Object} dirValue - Directory value object
 * @param {Object} directoryCache - Cache of directory values
 * @returns {string} Display value
 */
export const getTagDisplayValue = (header, dirRowId, dirValue, directoryCache = {}) => {
  // Try to get from cache first
  if (header.dirTableId && directoryCache[header.dirTableId]) {
    const cachedItem = directoryCache[header.dirTableId].find(item => item.id === dirRowId)
    if (cachedItem) {
      return cachedItem.value || cachedItem.val || `#${dirRowId}`
    }
  }
  // Fallback to dirValue properties
  return dirValue?.value || dirValue?.val || `#${dirRowId}`
}
