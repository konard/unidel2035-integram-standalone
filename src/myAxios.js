/**
 * MY DATABASE API CLIENT
 *
 * ⚠️ This axios client is ONLY for 'my' database API calls.
 *
 * Issue #3651: Migrated from ddadmin to my database for unified user account storage
 * Issue #3554: Updated to use Unified Authentication tokens
 * Issue #3xxx: All requests converted to POST method (GET is auto-converted)
 *
 * Use this client ONLY for:
 * - AI Tokens management (Tokens.vue)
 * - System-level administrative features that are stored in my database
 * - User account management
 * - Database references
 *
 * Token retrieval priority:
 * 1. Unified auth session (if available)
 * 2. my_token from localStorage
 *
 * Key differences from axios2.js:
 * - Always uses 'my' database
 * - Uses my-specific token
 * - Base URL: https://dronedoc.ru/my
 * - ALL requests are POST (GET requests are auto-converted to POST)
 *
 * DO NOT use this client for:
 * - User-specific database operations (use axios2.js)
 * - Orchestrator APIs (use orchestratorAxios.js)
 */

import axios from 'axios'
import { remapData } from './services/apiRemapper'
import { unifiedAuthService } from './services/unifiedAuthService'
// Note: We do NOT use installApiInterceptors for my client
// See explanation at the end of this file

let activeRequests = 0
const loaders = new Map()

export const registerLoaderCallbacks = (show, hide, loaderId) => {
  loaders.set(loaderId, { show, hide })
  return () => loaders.delete(loaderId)
}

const updateLoaders = isLoading => {
  loaders.forEach(loader => {
    isLoading ? loader.show() : loader.hide()
  })
}

// Function to get base URL for my database
const getBaseURL = () => {
  const apiBase = localStorage.getItem('apiBase')

  // If localhost is selected, use local address
  if (apiBase === 'localhost') return 'http://localhost/my/'

  // Issue #3651: my is the unified user account database and ALWAYS uses dronedoc.ru
  // regardless of which server the user selected for their primary database
  // Important: Always add trailing slash to prevent double-slash issues with axios URL joining
  return 'https://dronedoc.ru/my/'
}

const myClient = axios.create({
  baseURL: getBaseURL(),
  timeout: 5000000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Cache for unified auth token to avoid async calls in interceptor
let myTokenCache = null
let myTokenCacheTime = 0
const MY_CACHE_TTL = 30000 // 30 seconds

/**
 * Get my token from localStorage synchronously
 * Issue #3811 (simplified): Use single token source
 *
 * Simplified token storage system:
 * 1. Single 'token' in localStorage for all databases ('my' and others)
 * 2. If authDb is 'my', use the same token for /my/ requests
 */
function getMyToken() {
  const authDb = localStorage.getItem('db') || 'a2025'
  const token = localStorage.getItem('token')

  // Only return token if user is logged in to 'my' database
  return authDb === 'my' ? token : null
}

// Export function to clear cache (called on logout)
export function clearMyTokenCache() {
  myTokenCache = null
  myTokenCacheTime = 0
}

// Request interceptor
// Issue #3811 (production fix): Removed async to ensure headers are set correctly in production
myClient.interceptors.request.use(
  config => {
    // Get my token from localStorage synchronously
    const myToken = getMyToken()

    if (myToken) {
      // Issue #3811: Use X-Authorization for requests to /my/ database (direct access)
      // The 'my' header is only used for accessing OTHER databases via kernel routing
      // Since myAxios.js is specifically for /my/ database requests, always use X-Authorization
      config.headers['X-Authorization'] = myToken
    } else {
      console.warn('⚠️ my database token not found. Some features may not work.')
    }

    // Update baseURL before each request
    config.baseURL = getBaseURL()

    // Issue #3xxx: Convert all GET requests to POST for 'my' database
    // The 'my' database requires all requests to be POST
    if (config.method === 'get') {
      config.method = 'post'
      // Move query params to POST body as form data
      const formData = new URLSearchParams()
      // Add JSON_KV to POST body
      formData.append('JSON_KV', 'true')
      // Add existing params to body
      if (config.params) {
        for (const [key, value] of Object.entries(config.params)) {
          if (value !== null && value !== undefined) {
            formData.append(key, value)
          }
        }
      }
      config.data = formData.toString()
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded'
      config.params = {} // Clear params since they're now in body
    } else {
      // For non-GET requests, add JSON_KV to params
      if (!config.params) {
        config.params = {}
      }
      config.params.JSON_KV = true
    }

    // Automatically set multipart/form-data for FormData objects
    if (config.data instanceof FormData) {
      config.headers['Content-Type'] = 'multipart/form-data'
    }

    activeRequests++
    if (activeRequests === 1) updateLoaders(true)
    return config
  },
  error => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Handle request error
    if (window.errorHandler) {
      window.errorHandler.handle(error, { source: 'myAxios-request' })
    }

    return Promise.reject(error)
  },
)

// Response interceptor
myClient.interceptors.response.use(
  async response => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Apply remapping for /object/ endpoints
    const url = response.config.url || ''
    const isObjectEndpoint = url.includes('/object/')

    if (isObjectEndpoint && response.data) {
      try {
        // Only apply remapping if data has 'type' field
        // Subordinate queries (F_U) don't have 'type' - pass raw data through
        if (response.data.type) {
          const types = { edit_types: {} }
          const remapped = remapData(response.data, types, {})
          response.data = {
            status: 200,
            response: remapped
          }
        } else {
          // Pass through raw data for transformData to parse
          response.data = {
            status: 200,
            response: response.data
          }
        }
      } catch (error) {
        console.error('Error remapping my database response:', error)
        if (!response.data.response) {
          response.data = {
            status: 200,
            response: response.data
          }
        }
      }
    }

    return response
  },
  error => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Handle response error
    if (window.errorHandler) {
      window.errorHandler.handle(error, {
        source: 'myAxios-response',
        url: error.config?.url,
        method: error.config?.method
      })
    }

    return Promise.reject(error)
  },
)

// DO NOT install API interceptors for my client
// The apiInterceptor uses apiService which creates new requests with directApiClient
// This would cause my requests to use the wrong token (primary DB token instead of my_token)
// myClient should make direct requests without transformation
// installApiInterceptors(myClient)

export default myClient
