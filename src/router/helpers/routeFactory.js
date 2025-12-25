// Route Factory Helpers to eliminate code duplication
// Issue: Router refactoring - reducing 3409 lines by eliminating duplication

import { criticalRoute, standardRoute, lazyRoute } from '../importHelpers'

// Lazy-load layouts
const AppLayout = () => import('@/layout/AppLayout.vue')
const AdminLayout = () => import('@/layout/AdminLayout.vue')

/**
 * Create a standard authenticated route with AppLayout
 * This pattern is used 140+ times in the router
 *
 * @param {string} path - Route path
 * @param {string} name - Route name
 * @param {string} componentPath - Path to component (relative to @/views or @/components)
 * @param {object} options - Additional options
 * @returns {object} Route definition
 */
export function createAuthRoute(path, name, componentPath, options = {}) {
  const {
    layout = AppLayout,
    meta = {},
    props = false,
    loadingStrategy = 'critical' // 'critical', 'standard', 'lazy'
  } = options

  // Select loading strategy
  const importFn = loadingStrategy === 'critical'
    ? criticalRoute
    : loadingStrategy === 'standard'
      ? standardRoute
      : lazyRoute

  return {
    path,
    component: layout,
    meta: { requiresAuth: true, ...meta },
    children: [{
      path: '',
      name,
      component: importFn(() => import(/* @vite-ignore */ componentPath)),
      props
    }]
  }
}

/**
 * Create a public route (no auth required)
 *
 * @param {string} path - Route path
 * @param {string} name - Route name
 * @param {string} componentPath - Path to component
 * @param {object} options - Additional options
 * @returns {object} Route definition
 */
export function createPublicRoute(path, name, componentPath, options = {}) {
  const {
    meta = {},
    props = false,
    loadingStrategy = 'critical'
  } = options

  const importFn = loadingStrategy === 'critical'
    ? criticalRoute
    : loadingStrategy === 'standard'
      ? standardRoute
      : lazyRoute

  return {
    path,
    name,
    component: importFn(() => import(/* @vite-ignore */ componentPath)),
    meta: { requiresAuth: false, ...meta },
    props
  }
}

/**
 * Create a guest-only route (requiresGuest: true)
 * Used for login, register pages
 *
 * @param {string} path - Route path
 * @param {string} name - Route name
 * @param {string} componentPath - Path to component
 * @param {object} options - Additional options
 * @returns {object} Route definition
 */
export function createGuestRoute(path, name, componentPath, options = {}) {
  const {
    meta = {},
    props = false,
    loadingStrategy = 'critical'
  } = options

  const importFn = loadingStrategy === 'critical'
    ? criticalRoute
    : standardRoute

  return {
    path,
    name,
    component: importFn(() => import(/* @vite-ignore */ componentPath)),
    meta: { requiresGuest: true, ...meta },
    props
  }
}

/**
 * Create an admin route (requiresAdmin: true)
 *
 * @param {string} path - Route path
 * @param {string} name - Route name
 * @param {string} componentPath - Path to component
 * @param {object} options - Additional options
 * @returns {object} Route definition
 */
export function createAdminRoute(path, name, componentPath, options = {}) {
  const {
    layout = AdminLayout,
    meta = {},
    props = false,
    loadingStrategy = 'critical'
  } = options

  const importFn = loadingStrategy === 'critical'
    ? criticalRoute
    : standardRoute

  return {
    path,
    component: layout,
    meta: { requiresAdmin: true, ...meta },
    children: [{
      path: '',
      name,
      component: importFn(() => import(/* @vite-ignore */ componentPath)),
      props
    }]
  }
}

/**
 * Create a route with nested children
 * Common pattern for module routes (agriculture, integram, etc.)
 *
 * @param {string} path - Base path
 * @param {object} options - Configuration
 * @param {array} children - Child routes
 * @returns {object} Route definition
 */
export function createModuleRoute(path, options = {}, children = []) {
  const {
    layout = AppLayout,
    meta = {},
    requiresAuth = true,
    redirect = null
  } = options

  const route = {
    path,
    component: layout,
    meta: { requiresAuth, ...meta },
    children
  }

  // Add redirect if specified
  if (redirect) {
    route.redirect = redirect
  }

  return route
}

/**
 * Create a simple redirect route
 *
 * @param {string} from - Source path
 * @param {string} to - Destination path
 * @returns {object} Route definition
 */
export function createRedirect(from, to) {
  return {
    path: from,
    redirect: to
  }
}

/**
 * Create a child route for use in nested routes
 * Helper for building children arrays
 *
 * @param {string} path - Path (relative to parent)
 * @param {string} name - Route name
 * @param {string} componentPath - Component path
 * @param {object} options - Additional options
 * @returns {object} Child route definition
 */
export function createChildRoute(path, name, componentPath, options = {}) {
  const {
    props = false,
    meta = {},
    loadingStrategy = 'critical'
  } = options

  const importFn = loadingStrategy === 'critical'
    ? criticalRoute
    : loadingStrategy === 'standard'
      ? standardRoute
      : lazyRoute

  return {
    path,
    name,
    component: importFn(() => import(/* @vite-ignore */ componentPath)),
    props,
    meta
  }
}

/**
 * Create SEO-optimized landing page route
 *
 * @param {string} path - Route path
 * @param {string} name - Route name
 * @param {string} componentPath - Component path
 * @param {object} seo - SEO metadata
 * @returns {object} Route definition
 */
export function createLandingRoute(path, name, componentPath, seo = {}) {
  const {
    title = '',
    description = '',
    keywords = ''
  } = seo

  return {
    path,
    name,
    component: criticalRoute(() => import(/* @vite-ignore */ componentPath)),
    meta: {
      requiresAuth: false,
      seoTitle: title,
      seoDescription: description,
      seoKeywords: keywords
    }
  }
}
