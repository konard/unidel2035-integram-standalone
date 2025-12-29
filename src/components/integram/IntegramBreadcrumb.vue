<template>
  <Breadcrumb :model="breadcrumbItems" :home="homeItem" class="integram-breadcrumb">
    <template #item="{ item }">
      <router-link v-if="item.route" :to="item.route" class="breadcrumb-link">
        <span :class="item.icon" v-if="item.icon"></span>
        <span class="ml-2">{{ item.label }}</span>
      </router-link>
      <span v-else>
        <span :class="item.icon" v-if="item.icon"></span>
        <span class="ml-2">{{ item.label }}</span>
      </span>
    </template>
  </Breadcrumb>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import integramApiClient from '@/services/integramApiClient'

const props = defineProps({
  /**
   * Breadcrumb items
   * Each item should have: { label: string, to?: string, icon?: string }
   * Last item is automatically marked as active
   */
  items: {
    type: Array,
    default: () => []
  },
  /**
   * Database name (optional)
   * If provided, adds database level to breadcrumb
   */
  database: {
    type: String,
    default: ''
  }
})

const route = useRoute()

// Home item - database name (instead of "Integram")
const homeItem = computed(() => {
  const databaseName = props.database || route.params.database || integramApiClient.getDatabase()
  return {
    icon: 'pi pi-database',
    route: databaseName ? `/integram/${databaseName}/` : '/integram',
    label: databaseName || 'База'
  }
})

// Convert items to PrimeVue Breadcrumb format
const breadcrumbItems = computed(() => {
  const result = []

  // Add custom breadcrumb items
  props.items.forEach((item, index) => {
    const isLast = index === props.items.length - 1
    result.push({
      label: item.label,
      route: isLast ? undefined : (item.route || item.to), // Support both 'route' and 'to' props
      icon: item.icon
    })
  })

  return result
})
</script>

<style scoped>
.integram-breadcrumb {
  margin: 0 0 1rem 0;
  background: var(--p-surface-card, var(--surface-card));
  border: 1px solid var(--p-surface-border, var(--surface-border));
  border-radius: var(--p-card-border-radius);
  padding: 0.75rem 1rem;
}

.integram-breadcrumb :deep(.p-breadcrumb) {
  background: transparent;
  border: none;
  padding: 0;
  border-radius: 0;
}

.breadcrumb-link {
  text-decoration: none;
  color: var(--primary-color);
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
}

.breadcrumb-link:hover {
  color: var(--primary-color-emphasis);
  text-decoration: underline;
}
</style>
