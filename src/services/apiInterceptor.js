/**
 * API Interceptor
 *
 * Axios interceptors for handling authentication, errors, and logging
 */

export function setupInterceptors(axiosInstance) {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config) => {
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}

export function installApiInterceptors(axiosInstance) {
  return setupInterceptors(axiosInstance);
}

export default {
  setupInterceptors,
  installApiInterceptors
};
