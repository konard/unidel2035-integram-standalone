/**
 * API Interceptor
 * Axios interceptors for request/response handling
 */

/**
 * Setup axios interceptors
 * @param {import('axios').AxiosInstance} axiosInstance
 */
export function setupInterceptors(axiosInstance) {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config) => {
      // Add auth headers if available
      const token = localStorage.getItem('token') || localStorage.getItem('integram_token')
      const xsrf = localStorage.getItem('_xsrf') || localStorage.getItem('integram_xsrf')

      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
      }
      if (xsrf) {
        config.headers['X-XSRF-TOKEN'] = xsrf
      }

      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response) => {
      return response
    },
    (error) => {
      // Handle 401 Unauthorized
      if (error.response && error.response.status === 401) {
        // Clear auth data
        localStorage.removeItem('token')
        localStorage.removeItem('_xsrf')
        localStorage.removeItem('integram_token')
        localStorage.removeItem('integram_xsrf')

        // Redirect to login if not already there
        if (window.location.pathname !== '/login' && window.location.pathname !== '/integram/login') {
          window.location.href = '/login'
        }
      }

      return Promise.reject(error)
    }
  )

  return axiosInstance
}

/**
 * Install API interceptors (alias for setupInterceptors)
 * @param {import('axios').AxiosInstance} axiosInstance
 */
export function installApiInterceptors(axiosInstance) {
  return setupInterceptors(axiosInstance)
}

export default setupInterceptors
