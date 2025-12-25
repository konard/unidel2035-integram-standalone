<template>
  <div class="integram-schema-tree">
    <!-- Toolbar -->
    <div class="tree-toolbar">
      <IconField iconPosition="left">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="searchQuery"
          placeholder="Поиск таблиц..."
          class="search-input"
          @input="onSearch"
        />
      </IconField>
      <Button
        v-if="searchQuery"
        icon="pi pi-times"
        text
        rounded
        size="small"
        @click="clearSearch"
      />
      <div class="toolbar-divider"></div>
      <Button
        icon="pi pi-plus"
        label="Развернуть все"
        severity="secondary"
        size="small"
        outlined
        @click="expandAll"
      />
      <Button
        icon="pi pi-minus"
        label="Свернуть все"
        severity="secondary"
        size="small"
        outlined
        @click="collapseAll"
      />
      <div class="stats">
        <Tag :value="`${rootTables.length} корневых`" severity="info" />
        <Tag :value="`${totalTables} таблиц`" severity="secondary" />
        <Tag :value="`${totalReferences} связей`" severity="warning" />
      </div>
    </div>

    <!-- Tree Legend -->
    <div class="tree-legend">
      <span class="legend-item">
        <i class="pi pi-table" style="color: var(--p-primary-color)"></i> Таблица
      </span>
      <span class="legend-item">
        <i class="pi pi-book" style="color: #ff9800"></i> Справочник
      </span>
      <span class="legend-item">
        <i class="pi pi-link" style="color: #9c27b0"></i> Ссылка
      </span>
      <span class="legend-item">
        <Badge value="U" severity="info" size="small" /> Уникальный
      </span>
    </div>

    <!-- Tree View -->
    <Tree
      v-model:expandedKeys="expandedKeys"
      :value="treeNodes"
      :filter="!!searchQuery"
      :filterBy="filterBy"
      filterMode="lenient"
      selectionMode="single"
      v-model:selectionKeys="selectedKey"
      class="schema-tree"
      @node-select="onNodeSelect"
    >
      <template #default="{ node }">
        <div
          class="tree-node-content"
          :class="{
            'is-table': node.type === 'table',
            'is-reference': node.type === 'reference',
            'is-requisite': node.type === 'requisite',
            'is-ref-requisite': node.isReference
          }"
        >
          <!-- Icon -->
          <i :class="getNodeIcon(node)" class="node-icon"></i>

          <!-- Label -->
          <span class="node-label">{{ node.label }}</span>

          <!-- Badges -->
          <div class="node-badges">
            <!-- Requisite type badge -->
            <span
              v-if="node.reqType"
              class="req-type-badge"
              :class="getReqTypeClass(node.reqType)"
            >
              {{ node.reqType }}
            </span>

            <!-- Unique badge -->
            <Badge
              v-if="node.unique"
              value="U"
              severity="info"
              size="small"
              v-tooltip.top="'Уникальный'"
            />

            <!-- Reference target -->
            <span
              v-if="node.refTarget"
              class="ref-target"
              @click.stop="scrollToNode(node.refTargetId)"
            >
              → {{ node.refTarget }}
            </span>

            <!-- Requisite count -->
            <Badge
              v-if="node.reqCount"
              :value="node.reqCount"
              severity="secondary"
              size="small"
              v-tooltip.top="'Количество полей'"
            />
          </div>

          <!-- Actions -->
          <div class="node-actions" v-if="node.type === 'table'">
            <Button
              icon="pi pi-database"
              text
              rounded
              size="small"
              severity="secondary"
              v-tooltip.top="'Просмотр данных'"
              @click.stop="emit('open-table', node.typeId)"
            />
            <Button
              icon="pi pi-cog"
              text
              rounded
              size="small"
              severity="secondary"
              v-tooltip.top="'Редактировать'"
              @click.stop="emit('edit-type', node.typeId)"
            />
          </div>
        </div>
      </template>
    </Tree>

    <!-- Empty state -->
    <div v-if="treeNodes.length === 0" class="empty-state">
      <i class="pi pi-inbox"></i>
      <p>Нет данных для отображения</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  typesData: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['open-table', 'edit-type'])

// State
const searchQuery = ref('')
const expandedKeys = ref({})
const selectedKey = ref(null)
const filterBy = 'label'

// Build lookup maps
const typeMap = computed(() => {
  const map = new Map()
  props.typesData.forEach(type => {
    map.set(String(type.id), type)
  })
  return map
})

// Find which types are referenced by others
const referencedTypeIds = computed(() => {
  const refs = new Set()
  props.typesData.forEach(type => {
    type.requisites?.forEach(req => {
      if (req.isReference && req.refTypeId) {
        refs.add(String(req.refTypeId))
      }
    })
  })
  return refs
})

// Root tables = tables that are NOT referenced by anyone OR are reference tables themselves
const rootTables = computed(() => {
  return props.typesData.filter(type => {
    // Include tables that have references TO them (справочники)
    // or tables that are not referenced by anyone
    const isReferenced = referencedTypeIds.value.has(String(type.id))
    const hasReferences = type.requisites?.some(r => r.isReference)

    // Root = not referenced OR is a reference table (справочник)
    return !isReferenced || type.isReferenceTable || !hasReferences
  })
})

// Build tree structure
const treeNodes = computed(() => {
  const nodes = []
  const processedIds = new Set()

  // Helper to build node for a type
  function buildTypeNode(type, depth = 0) {
    if (processedIds.has(type.id) || depth > 10) {
      // Prevent infinite recursion
      return null
    }
    processedIds.add(type.id)

    const children = []

    // Add requisites as children
    type.requisites?.forEach(req => {
      const reqNode = {
        key: `req-${req.id}`,
        label: req.name || req.alias || `Поле ${req.id}`,
        type: 'requisite',
        reqType: getReqTypeAbbr(req.type),
        isReference: req.isReference,
        refTarget: req.refTypeName,
        refTargetId: req.refTypeId,
        icon: req.isReference ? 'pi pi-link' : 'pi pi-minus',
        selectable: false
      }

      // If this requisite references another table, add it as nested
      if (req.isReference && req.refTypeId) {
        const refType = typeMap.value.get(String(req.refTypeId))
        if (refType && !processedIds.has(refType.id)) {
          const refNode = buildTypeNode(refType, depth + 1)
          if (refNode) {
            reqNode.children = [refNode]
          }
        }
      }

      children.push(reqNode)
    })

    return {
      key: `type-${type.id}`,
      label: type.name,
      type: 'table',
      typeId: type.id,
      unique: type.unique,
      isReferenceTable: type.isReferenceTable,
      reqCount: type.requisites?.length || 0,
      icon: type.isReferenceTable ? 'pi pi-book' : 'pi pi-table',
      children: children.length > 0 ? children : undefined
    }
  }

  // Build tree from root tables
  rootTables.value.forEach(type => {
    const node = buildTypeNode(type)
    if (node) {
      nodes.push(node)
    }
  })

  // Sort by name
  nodes.sort((a, b) => (a.label || '').localeCompare(b.label || ''))

  return nodes
})

// Stats
const totalTables = computed(() => props.typesData.length)
const totalReferences = computed(() => {
  return props.typesData.reduce((sum, type) => {
    return sum + (type.requisites?.filter(r => r.isReference).length || 0)
  }, 0)
})

// Methods
function getNodeIcon(node) {
  if (node.type === 'table') {
    return node.isReferenceTable ? 'pi pi-book' : 'pi pi-table'
  }
  if (node.type === 'requisite') {
    return node.isReference ? 'pi pi-link' : 'pi pi-minus'
  }
  return 'pi pi-circle'
}

function getReqTypeAbbr(type) {
  const map = {
    'short': 'STR',
    'chars': 'TXT',
    'number': 'INT',
    'signed': 'DEC',
    'date': 'DATE',
    'datetime': 'DT',
    'boolean': 'BOOL',
    'memo': 'MEMO',
    'reference': 'REF',
    'file': 'FILE',
    'html': 'HTML'
  }
  return map[type?.toLowerCase()] || type?.slice(0, 4)?.toUpperCase() || '?'
}

function getReqTypeClass(type) {
  const map = {
    'STR': 'type-string',
    'TXT': 'type-string',
    'INT': 'type-number',
    'DEC': 'type-number',
    'DATE': 'type-date',
    'DT': 'type-date',
    'BOOL': 'type-bool',
    'MEMO': 'type-text',
    'REF': 'type-ref',
    'FILE': 'type-file',
    'HTML': 'type-html'
  }
  return map[type] || 'type-other'
}

function expandAll() {
  const keys = {}
  function addKeys(nodes) {
    nodes.forEach(node => {
      keys[node.key] = true
      if (node.children) {
        addKeys(node.children)
      }
    })
  }
  addKeys(treeNodes.value)
  expandedKeys.value = keys
}

function collapseAll() {
  expandedKeys.value = {}
}

function onSearch() {
  if (searchQuery.value) {
    // Expand all when searching
    expandAll()
  }
}

function clearSearch() {
  searchQuery.value = ''
}

function scrollToNode(typeId) {
  const key = `type-${typeId}`
  // Expand parents and select
  expandedKeys.value = { ...expandedKeys.value, [key]: true }
  selectedKey.value = { [key]: true }

  // Scroll to element
  setTimeout(() => {
    const el = document.querySelector(`[data-pc-section="label"]:has(+ [data-type-id="${typeId}"])`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, 100)
}

function onNodeSelect(node) {
  if (node.type === 'table') {
    // Could emit an event or expand
  }
}

// Auto-expand root nodes on mount
watch(() => props.typesData, () => {
  if (props.typesData.length > 0 && Object.keys(expandedKeys.value).length === 0) {
    // Expand first 5 root nodes
    const keys = {}
    treeNodes.value.slice(0, 5).forEach(node => {
      keys[node.key] = true
    })
    expandedKeys.value = keys
  }
}, { immediate: true })
</script>

<style scoped>
.integram-schema-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

/* Toolbar */
.tree-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.search-input {
  width: 250px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--p-surface-border);
}

.stats {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

/* Legend */
.tree-legend {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: var(--p-surface-50);
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.8rem;
  flex-shrink: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-text-secondary-color);
}

/* Tree */
.schema-tree {
  flex: 1;
  overflow: auto;
  padding: 12px;
  background: var(--p-surface-card);
}

.schema-tree :deep(.p-tree-node-content) {
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.schema-tree :deep(.p-tree-node-content:hover) {
  background: var(--p-surface-100);
}

.schema-tree :deep(.p-tree-node-selected > .p-tree-node-content) {
  background: var(--p-primary-100);
}

/* Tree node content */
.tree-node-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
}

.node-icon {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.is-table .node-icon {
  color: var(--p-primary-color);
}

.is-reference .node-icon,
.is-ref-requisite .node-icon {
  color: #ff9800;
}

.is-requisite .node-icon {
  color: var(--p-text-secondary-color);
}

.node-label {
  flex: 1;
  font-weight: 500;
}

.is-table .node-label {
  font-weight: 600;
}

.is-requisite .node-label {
  font-weight: 400;
  font-size: 0.9rem;
}

.node-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Requisite type badge */
.req-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
}

.type-string { background: #e3f2fd; color: #1565c0; }
.type-number { background: #e8f5e9; color: #2e7d32; }
.type-date { background: #fff3e0; color: #ef6c00; }
.type-bool { background: #fce4ec; color: #c2185b; }
.type-text { background: #f3e5f5; color: #7b1fa2; }
.type-ref { background: #fff8e1; color: #ff8f00; }
.type-file { background: #e0f7fa; color: #00838f; }
.type-html { background: #fbe9e7; color: #d84315; }
.type-other { background: #eceff1; color: #546e7a; }

/* Reference target link */
.ref-target {
  color: #ff9800;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.2s;
}

.ref-target:hover {
  color: #f57c00;
  text-decoration: underline;
}

/* Node actions */
.node-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.tree-node-content:hover .node-actions {
  opacity: 1;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--p-text-secondary-color);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 12px;
}

/* Highlighted reference table node */
.is-table.is-reference-table .node-icon {
  color: #ff9800;
}

/* Nested reference indicator */
.schema-tree :deep(.p-tree-node-children) {
  border-left: 2px solid var(--p-surface-200);
  margin-left: 10px;
  padding-left: 8px;
}

/* Reference chain highlight */
.schema-tree :deep(.p-tree-node:has(.is-ref-requisite) > .p-tree-node-content) {
  border-left: 3px solid #ff9800;
  padding-left: 8px;
  margin-left: -3px;
}
</style>
