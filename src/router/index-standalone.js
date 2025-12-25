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
          name: 'Integram Home',
          component: () => import('@/views/pages/Integram/IntegramLanding.vue')
        },
        {
          path: 'dict',
          name: 'Объекты',
          component: () => import('@/views/pages/Integram/IntegramDictionary.vue')
        },
        {
          path: 'object/:typeId',
          name: 'Integram Objects',
          component: () => import('@/views/pages/Integram/IntegramObjectView.vue')
        },
        {
          path: 'table',
          name: 'Таблицы',
          component: () => import('@/views/pages/Integram/IntegramTableList.vue')
        },
        {
          path: 'table/:typeId',
          name: 'Integram DataTable',
          component: () => import('@/components/integram/IntegramDataTableWrapper.vue')
        },
        {
          path: 'edit_obj/:objectId',
          name: 'Integram Edit Object',
          component: () => import('@/views/pages/Integram/IntegramObjectEdit.vue')
        },
        {
          path: 'edit_types',
          name: 'Integram Type Editor',
          component: () => import('@/views/pages/Integram/IntegramTypeEditor.vue')
        },
        {
          path: 'form/:formId?',
          name: 'Integram Form',
          component: () => import('@/components/integram/IntegramForm.vue')
        },
        {
          path: 'myform',
          name: 'Integram Form Builder',
          component: () => import('@/components/integram/IntegramFormBuilder.vue')
        },
        {
          path: 'report/:reportId?',
          name: 'Integram Report',
          component: () => import('@/views/pages/Integram/IntegrationReportPage.vue')
        },
        {
          path: 'sql',
          name: 'Integram SQL',
          component: () => import('@/components/integram/IntegramSQL.vue')
        },
        {
          path: 'sql/:reportId',
          name: 'Integram SQL Report',
          component: () => import('@/components/integram/IntegramSQL.vue')
        },
        {
          path: 'smartq',
          name: 'Integram Smart Query',
          component: () => import('@/views/pages/SmartQ.vue')
        },
        {
          path: 'mention-test',
          name: 'Integram Mention Test',
          component: () => import('@/views/pages/Integram/MentionTestPage.vue')
        },
        {
          path: 'query-builder',
          name: 'Integram Query Builder',
          component: () => import('@/components/integram/IntegramQueryBuilder.vue')
        },
        {
          path: 'quiz/:quizId?',
          name: 'Integram Quiz',
          component: () => import('@/components/integram/IntegramQuiz.vue')
        },
        {
          path: 'upload',
          name: 'Integram Upload',
          component: () => import('@/components/integram/IntegramUpload.vue')
        },
        {
          path: 'dir_admin',
          name: 'Integram Dir Admin',
          component: () => import('@/components/integram/IntegramDirAdmin.vue')
        },
        {
          path: 'info',
          name: 'Integram Info',
          component: () => import('@/components/integram/IntegramInfo.vue')
        },
        {
          path: 'api-docs',
          name: 'Integram API Docs',
          component: () => import('@/views/pages/Integram/IntegramApiDocs.vue')
        },
        {
          path: 'user/:id',
          name: 'User Profile',
          component: () => import('@/views/pages/Integram/UserProfile.vue')
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
