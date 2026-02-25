/**
 * JSON Key Sorting Utility (Issue #173)
 *
 * Provides functions to sort object keys alphabetically to achieve byte-for-byte
 * parity with PHP's json_encode() behavior.
 *
 * PHP's json_encode() sorts associative array keys alphabetically by default,
 * while JavaScript's JSON.stringify() preserves insertion order. Additionally,
 * V8 (Node.js) automatically sorts numeric string keys in numeric order.
 *
 * This utility ensures Node.js responses match PHP responses exactly by using
 * a custom JSON stringification that controls key ordering explicitly.
 */

/**
 * Get keys of an object sorted alphabetically (string comparison).
 *
 * @param {Object} obj - The object to get keys from
 * @returns {string[]} - Array of keys sorted alphabetically
 */
function getSortedKeys(obj) {
  return Object.keys(obj).sort((a, b) => a.localeCompare(b));
}

/**
 * Recursively sort all keys in an object alphabetically.
 * Note: Due to V8's automatic numeric key sorting, the returned object may not
 * preserve alphabetical order for numeric keys. Use jsonStringifySorted() for
 * guaranteed alphabetical JSON output.
 *
 * @param {*} value - The value to process (object, array, or primitive)
 * @returns {*} - The value with all object keys sorted alphabetically
 *
 * @example
 * sortKeysRecursive({ b: 1, a: 2 }) // returns { a: 2, b: 1 }
 */
export function sortKeysRecursive(value) {
  // Handle null and primitives
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Handle arrays - preserve array order, but sort keys in array elements
  if (Array.isArray(value)) {
    return value.map(item => sortKeysRecursive(item));
  }

  // Handle Date objects - return as-is (will be serialized by JSON.stringify)
  if (value instanceof Date) {
    return value;
  }

  // Handle objects - sort keys alphabetically
  const sortedKeys = getSortedKeys(value);
  const sortedObj = {};

  for (const key of sortedKeys) {
    sortedObj[key] = sortKeysRecursive(value[key]);
  }

  return sortedObj;
}

/**
 * Convert a value to JSON with keys sorted alphabetically.
 * This function manually constructs the JSON string to ensure alphabetical key ordering,
 * bypassing V8's automatic numeric key sorting.
 *
 * @param {*} value - The value to stringify
 * @param {number|string} [space] - Indentation spaces (numeric) or undefined for compact
 * @returns {string} - JSON string with alphabetically sorted keys
 */
export function jsonStringifySorted(value, space) {
  const spaceNum = typeof space === 'number' ? space : (space ? 2 : 0);
  return _stringify(value, 0, spaceNum);
}

/**
 * Internal recursive stringify function that controls key ordering.
 *
 * @param {*} value - The value to stringify
 * @param {number} indent - Current indentation level
 * @param {number} space - Number of spaces per indent level (0 for compact)
 * @returns {string} - JSON string
 * @private
 */
function _stringify(value, indent, space) {
  const indentStr = space ? ' '.repeat(indent) : '';
  const nextIndent = space ? indent + space : 0;
  const newline = space ? '\n' : '';
  const sep = space ? ': ' : ':';

  // Handle null
  if (value === null) return 'null';

  // Handle undefined - JSON spec says undefined becomes null in arrays, omitted in objects
  if (value === undefined) return 'null';

  // Handle primitives
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!isFinite(value)) return 'null';
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);

  // Handle Date objects
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => {
      const result = _stringify(v, nextIndent, space);
      return space ? ' '.repeat(nextIndent) + result : result;
    });
    return '[' + newline + items.join(',' + newline) + newline + indentStr + ']';
  }

  // Handle objects
  if (typeof value === 'object') {
    const keys = getSortedKeys(value);
    if (keys.length === 0) return '{}';

    const pairs = [];
    for (const k of keys) {
      const val = value[k];
      // Skip undefined values in objects
      if (val === undefined) continue;
      const valStr = _stringify(val, nextIndent, space);
      const keyStr = JSON.stringify(k);
      pairs.push((space ? ' '.repeat(nextIndent) : '') + keyStr + sep + valStr);
    }

    if (pairs.length === 0) return '{}';
    return '{' + newline + pairs.join(',' + newline) + newline + indentStr + '}';
  }

  // Fallback for any other types
  return JSON.stringify(value);
}

/**
 * Wrapper around Express res.json that sends JSON with alphabetically sorted keys.
 * This handles the V8 numeric key sorting issue by directly writing the sorted JSON string.
 *
 * @param {object} res - Express response object
 * @param {*} data - Data to send as JSON
 */
export function sendSortedJson(res, data) {
  const json = jsonStringifySorted(data);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(json);
}

/**
 * Express middleware that wraps res.json() to automatically sort keys alphabetically.
 * Use this middleware on routes that need PHP-compatible JSON responses.
 *
 * Note: This middleware overrides res.json() to use a custom serialization that
 * correctly handles numeric string keys (which V8 normally sorts numerically).
 *
 * @returns {Function} Express middleware function
 *
 * @example
 * router.use(phpJsonMiddleware());
 * router.get('/data', (req, res) => {
 *   res.json({ b: 1, a: 2 }); // Will send {"a":2,"b":1}
 * });
 */
export function phpJsonMiddleware() {
  return (req, res, next) => {
    const originalSend = res.send.bind(res);

    res.json = function(data) {
      // Use custom sorting to ensure alphabetical key order
      const sortedJson = jsonStringifySorted(data);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return originalSend(sortedJson);
    };

    next();
  };
}

export default {
  sortKeysRecursive,
  jsonStringifySorted,
  sendSortedJson,
  phpJsonMiddleware
};
