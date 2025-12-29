/**
 * DDADMIN DATABASE API CLIENT (DEPRECATED)
 *
 * ⚠️ DEPRECATED: This file is kept for backwards compatibility only.
 *
 * Issue #3651: Migrated from ddadmin to my database
 *
 * This file now re-exports myAxios for backwards compatibility.
 * All new code should import from './myAxios' instead.
 *
 * @deprecated Use './myAxios' instead
 */

import myClient, {
  registerLoaderCallbacks as myRegisterLoaderCallbacks,
  clearMyTokenCache
} from './myAxios'

// Re-export for backwards compatibility
export const registerLoaderCallbacks = myRegisterLoaderCallbacks

// Deprecated function names (for backwards compatibility)
export function clearDdadminTokenCache() {
  console.warn('clearDdadminTokenCache() is deprecated. Use clearMyTokenCache() from myAxios instead.')
  clearMyTokenCache()
}

// Re-export my client as ddadmin client for backwards compatibility
export default myClient

console.warn('[ddadminAxios] DEPRECATED: This module is deprecated. Use myAxios instead. (Issue #3651)')
