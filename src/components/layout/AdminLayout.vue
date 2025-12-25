<template>
  <div class="admin-layout">
    <div class="admin-topbar">
      <div class="admin-topbar-left">
        <h1 class="admin-title">Admin Panel</h1>
      </div>
      <div class="admin-topbar-right">
        <div class="admin-user-info">
          <i class="pi pi-shield"></i>
          <span class="admin-role">{{ currentAdminRole }}</span>
          <span class="admin-username">{{ currentUser }}</span>
        </div>
        <Button
          icon="pi pi-sign-out"
          label="Exit Admin"
          @click="exitAdmin"
          text
          severity="secondary"
        />
      </div>
    </div>

    <div class="admin-container">
      <div class="admin-sidebar">
        <Menu :model="menuItems" class="admin-menu" />
      </div>

      <div class="admin-content">
        <SafeRouterView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminAuth } from '@/composables/useAdminAuth'

import SafeRouterView from '@/components/SafeRouterView.vue'

const router = useRouter()
const { adminRole, adminUser, logout, hasPermission } = useAdminAuth()

const currentAdminRole = computed(() => adminRole.value || 'Admin')
const currentUser = computed(() => adminUser.value || 'Administrator')

const menuItems = computed(() => {
  const items = []

  // Dashboard - available to all admins
  items.push({
    label: 'Dashboard',
    icon: 'pi pi-home',
    command: () => router.push('/admin/dashboard')
  })

  // User Management - Super Admin, Support
  if (hasPermission(['super_admin', 'support'])) {
    items.push({
      label: 'Users',
      icon: 'pi pi-users',
      command: () => router.push('/admin/users')
    })
  }

  // Organization Management - Super Admin, Support
  if (hasPermission(['super_admin', 'support'])) {
    items.push({
      label: 'Organizations',
      icon: 'pi pi-building',
      command: () => router.push('/admin/organizations')
    })
  }

  // Billing & Payments - Super Admin, Finance
  if (hasPermission(['super_admin', 'finance'])) {
    items.push({
      label: 'Billing',
      icon: 'pi pi-wallet',
      command: () => router.push('/admin/billing')
    })
  }

  // Content Management - Super Admin, Content Manager
  if (hasPermission(['super_admin', 'content_manager'])) {
    items.push({
      label: 'Content',
      icon: 'pi pi-file-edit',
      command: () => router.push('/admin/content')
    })
  }

  // System Monitoring - Super Admin
  if (hasPermission(['super_admin'])) {
    items.push({
      label: 'System Monitoring',
      icon: 'pi pi-chart-line',
      command: () => router.push('/admin/monitoring')
    })
  }

  // Analytics - Super Admin
  if (hasPermission(['super_admin'])) {
    items.push({
      label: 'Analytics',
      icon: 'pi pi-chart-bar',
      command: () => router.push('/admin/analytics')
    })
  }

  // Support Tools - Super Admin, Support
  if (hasPermission(['super_admin', 'support'])) {
    items.push({
      label: 'Support',
      icon: 'pi pi-question-circle',
      command: () => router.push('/admin/support')
    })
  }

  // Configuration - Super Admin
  if (hasPermission(['super_admin'])) {
    items.push({
      label: 'Configuration',
      icon: 'pi pi-cog',
      command: () => router.push('/admin/configuration')
    })
  }

  // Audit Log - Super Admin
  if (hasPermission(['super_admin'])) {
    items.push({
      label: 'Audit Log',
      icon: 'pi pi-history',
      command: () => router.push('/admin/audit')
    })
  }

  // Moderation - Super Admin, Support
  if (hasPermission(['super_admin', 'support'])) {
    items.push({
      label: 'Moderation',
      icon: 'pi pi-flag',
      command: () => router.push('/admin/moderation')
    })
  }

  return items
})

const exitAdmin = () => {
  logout()
  router.push('/dashboard')
}

onMounted(() => {
  // Verify admin access on mount
  if (!adminUser.value) {
    router.push('/admin/login')
  }
})
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: var(--p-surface-50);
}

.admin-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: var(--p-surface-0);
  border-bottom: 1px solid var(--p-surface-200);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.admin-topbar-left {
  display: flex;
  align-items: center;
}

.admin-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: var(--p-primary-color);
}

.admin-topbar-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.admin-user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--p-surface-100);
  border-radius: var(--p-border-radius);
}

.admin-role {
  font-weight: 600;
  color: var(--p-primary-color);
}

.admin-username {
  color: var(--p-text-color);
}

.admin-container {
  display: flex;
  height: calc(100vh - 65px);
}

.admin-sidebar {
  width: 250px;
  background: var(--p-surface-0);
  border-right: 1px solid var(--p-surface-200);
  padding: 1rem 0;
  overflow-y: auto;
}

.admin-menu {
  border: none;
  box-shadow: none;
}

.admin-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}
</style>
