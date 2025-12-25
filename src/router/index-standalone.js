import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Landing',
      component: () => import('@/views/pages/Landing.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/pages/auth/Login.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/pages/auth/Register.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/oauth/callback',
      name: 'OAuthCallback',
      component: () => import('@/views/pages/auth/OAuthCallback.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/welcome',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'Welcome',
          component: () => import('@/views/pages/Welcome.vue')
        }
      ]
    },
    {
      path: '/integram',
      name: 'Integram Database Selector',
      component: () => import('@/views/pages/Integram/IntegramDatabaseSelector.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/integram/:database',
      component: () => import('@/views/pages/Integram/IntegramMain.vue'),
      meta: { requiresAuth: false },
      children: [
        {
          path: '',
          name: 'IntegramHome',
          component: () => import('@/views/pages/Integram/IntegramLanding.vue')
        },
        {
          path: 'dictionary',
          name: 'IntegramDictionary',
          component: () => import('@/views/pages/Integram/IntegramDictionary.vue')
        },
        {
          path: 'objects/:typeId',
          name: 'IntegramObjects',
          component: () => import('@/views/pages/Integram/IntegramObjectView.vue')
        },
        {
          path: 'tables',
          name: 'IntegramTables',
          component: () => import('@/views/pages/Integram/IntegramTableList.vue')
        }
      ]
    }
  ]
})

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('token')

  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if ((to.path === '/login' || to.path === '/register') && isAuthenticated) {
    next('/welcome')
  } else {
    next()
  }
})

export function clearUserCache() {
  // Clear user-related cache
}

export default router
