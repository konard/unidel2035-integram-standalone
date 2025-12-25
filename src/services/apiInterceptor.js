/**
 * API Interceptor Service
 * Handles proxy-style endpoint transformations for axios clients
 * This allows direct API calls while maintaining compatibility with Vue components
 */

/**
 * Install API interceptors for an axios instance
 * @param {Object} axiosInstance - Axios instance to intercept
 */
export function installApiInterceptors(axiosInstance) {
  // Request interceptor for endpoint transformation
  axiosInstance.interceptors.request.use(
    config => {
      // Transform endpoint paths if needed
      // For example, transform proxy.php?action=X to direct API endpoints

      // This is a stub implementation - endpoints are already transformed by components
      // The main transformation logic is handled by the baseURL configuration

      return config
    },
    error => {
      return Promise.reject(error)
    }
  )

  // Response interceptor for data transformation
  axiosInstance.interceptors.response.use(
    response => {
      // Transform response data if needed
      // This is handled in the main axios2.js response interceptor
      return response
    },
    error => {
      return Promise.reject(error)
    }
  )
}
