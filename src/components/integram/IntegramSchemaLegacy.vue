<template>
  <div class="integram-schema-legacy" ref="containerRef">
    <!-- SVG overlay for drawing lines (improved based on legacy implementation) -->
    <svg class="connection-lines" ref="svgRef">
      <defs>
        <!-- Improved arrowhead markers for different directions -->
        <marker
          id="arrowhead-right"
          markerWidth="12"
          markerHeight="8"
          refX="10"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 0, 12 4, 0 8" fill="#ff9800" />
        </marker>
        <marker
          id="arrowhead-left"
          markerWidth="12"
          markerHeight="8"
          refX="2"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="12 0, 0 4, 12 8" fill="#ff9800" />
        </marker>
        <!-- Glow filter for better visibility -->
        <filter id="connection-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <!-- Draw connections using bezier curves -->
      <g v-for="line in visibleLines" :key="line.id" class="connection-group">
        <!-- Shadow/glow line -->
        <path
          :d="line.path"
          fill="none"
          stroke="rgba(255, 152, 0, 0.3)"
          stroke-width="6"
          :stroke-dasharray="line.animated ? '8,4' : 'none'"
        />
        <!-- Main line -->
        <path
          :d="line.path"
          fill="none"
          stroke="#ff9800"
          stroke-width="2"
          :marker-end="line.direction === 'left' ? 'url(#arrowhead-left)' : 'url(#arrowhead-right)'"
          class="connection-path"
          :class="{ 'animated': line.animated }"
        />
        <!-- Start point indicator -->
        <circle
          :cx="line.x1"
          :cy="line.y1"
          r="4"
          fill="#ff9800"
        />
      </g>
    </svg>

    <!-- Toolbar -->
    <div class="legacy-toolbar">
      <IconField iconPosition="left">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="searchQuery"
          placeholder="Поиск таблиц..."
          class="search-input"
          @input="filterTypes"
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
      <!-- Show all connections toggle -->
      <Button
        :icon="showAllConnections ? 'pi pi-eye-slash' : 'pi pi-share-alt'"
        :label="showAllConnections ? 'Скрыть связи' : 'Все связи'"
        :severity="showAllConnections ? 'warning' : 'secondary'"
        size="small"
        outlined
        @click="toggleAllConnections"
        v-tooltip.bottom="'Показать/скрыть все связи между таблицами'"
      />
      <Button
        icon="pi pi-expand"
        label="Развернуть"
        severity="secondary"
        size="small"
        outlined
        @click="expandAll"
        v-tooltip.bottom="'Развернуть все таблицы'"
      />
      <Button
        icon="pi pi-minus"
        label="Свернуть"
        severity="secondary"
        size="small"
        outlined
        @click="collapseAll"
        v-tooltip.bottom="'Свернуть все таблицы'"
      />
      <div class="stats">
        <Tag :value="`${filteredTypes.length} таблиц`" severity="info" />
        <Tag :value="`${totalReferences} связей`" severity="warning" />
      </div>
    </div>

    <!-- Types Grid/List -->
    <div class="types-container">
      <div
        v-for="type in filteredTypes"
        :key="type.id"
        :ref="el => setTypeRef(type.id, el)"
        class="type-card"
        :class="{
          'highlighted': highlightedTypeId === type.id,
          'is-reference-table': type.isReferenceTable
        }"
        :data-type-id="type.id"
      >
        <div class="type-header" @click="toggleExpand(type.id)">
          <div class="type-icon">
            <i :class="getTypeIcon(type)"></i>
          </div>
          <div class="type-name">{{ type.name }}</div>
          <div class="type-badges">
            <span v-if="type.unique" class="badge unique" title="Уникальный">U</span>
            <span v-if="type.isReferenceTable" class="badge ref" title="Справочник">R</span>
          </div>
          <div class="type-count" v-if="type.requisites?.length">
            {{ type.requisites.length }}
          </div>
          <!-- Action buttons -->
          <div class="type-actions" @click.stop>
            <Button
              icon="pi pi-database"
              text
              rounded
              size="small"
              severity="secondary"
              v-tooltip.bottom="'Просмотр данных'"
              @click="emit('open-table', type.id)"
            />
            <Button
              icon="pi pi-cog"
              text
              rounded
              size="small"
              severity="secondary"
              v-tooltip.bottom="'Редактировать структуру'"
              @click="emit('edit-type', type.id)"
            />
          </div>
          <i :class="expandedTypes.has(type.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></i>
        </div>

        <!-- Requisites -->
        <div v-if="expandedTypes.has(type.id)" class="type-requisites">
          <div
            v-for="req in type.requisites"
            :key="req.id"
            class="requisite-row"
            :class="{ 'is-ref': req.isReference }"
            @mouseenter="req.isReference && showConnection(type.id, req)"
            @mouseleave="hideConnection"
            :ref="el => req.isReference && setReqRef(req.id, el)"
          >
            <span class="req-type-badge" :class="getReqTypeClass(req.type)">
              {{ getReqTypeAbbr(req.type) }}
            </span>
            <span class="req-name">{{ req.name }}</span>
            <a
              v-if="req.isReference && req.refTypeName"
              class="req-ref-link"
              @click.stop="scrollToType(req.refTypeId)"
              :title="`Перейти к: ${req.refTypeName}`"
            >
              → {{ req.refTypeName }}
            </a>
          </div>
        </div>

        <!-- Collapsed requisites preview -->
        <div v-else class="type-preview">
          <span
            v-for="req in (type.requisites || []).slice(0, 5)"
            :key="req.id"
            class="preview-chip"
            :class="{ 'is-ref': req.isReference }"
            @mouseenter="req.isReference && showConnection(type.id, req)"
            @mouseleave="hideConnection"
          >
            <span class="chip-type">{{ getReqTypeAbbr(req.type) }}</span>
            {{ req.name }}
            <span v-if="req.refTypeName" class="chip-ref">({{ req.refTypeName }})</span>
          </span>
          <span v-if="(type.requisites || []).length > 5" class="more">
            +{{ type.requisites.length - 5 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  typesData: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['open-table', 'edit-type'])

// Refs
const containerRef = ref(null)
const svgRef = ref(null)
const typeRefs = ref({})
const reqRefs = ref({})

// State
const searchQuery = ref('')
const expandedTypes = ref(new Set())
const highlightedTypeId = ref(null)
const visibleLines = ref([])
const showAllConnections = ref(false)

// Build type map for lookups
const typeMap = computed(() => {
  const map = new Map()
  props.typesData.forEach(type => {
    map.set(String(type.id), type)
  })
  return map
})

// Filtered types
const filteredTypes = computed(() => {
  let types = props.typesData || []

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    types = types.filter(t =>
      t.name?.toLowerCase().includes(query) ||
      t.requisites?.some(r => r.name?.toLowerCase().includes(query))
    )
  }

  // Sort: tables with references first, then by name
  return types.sort((a, b) => {
    const aHasRefs = a.requisites?.some(r => r.isReference) ? 1 : 0
    const bHasRefs = b.requisites?.some(r => r.isReference) ? 1 : 0
    if (aHasRefs !== bHasRefs) return bHasRefs - aHasRefs
    return (a.name || '').localeCompare(b.name || '')
  })
})

// Total references count
const totalReferences = computed(() => {
  return props.typesData.reduce((sum, type) => {
    return sum + (type.requisites?.filter(r => r.isReference).length || 0)
  }, 0)
})

// Methods
function setTypeRef(typeId, el) {
  if (el) {
    typeRefs.value[typeId] = el
  }
}

function setReqRef(reqId, el) {
  if (el) {
    reqRefs.value[reqId] = el
  }
}

function toggleExpand(typeId) {
  if (expandedTypes.value.has(typeId)) {
    expandedTypes.value.delete(typeId)
  } else {
    expandedTypes.value.add(typeId)
  }
  expandedTypes.value = new Set(expandedTypes.value) // Trigger reactivity
}

function filterTypes() {
  // Filtering is reactive
}

function clearSearch() {
  searchQuery.value = ''
}

function getTypeIcon(type) {
  if (type.isReferenceTable) return 'pi pi-book'
  if (type.isService) return 'pi pi-cog'
  return 'pi pi-table'
}

function getReqTypeClass(type) {
  const normalized = type?.toLowerCase()
  const map = {
    'short': 'type-string',
    'chars': 'type-string',
    'number': 'type-number',
    'signed': 'type-number',
    'date': 'type-date',
    'datetime': 'type-date',
    'boolean': 'type-bool',
    'memo': 'type-text',
    'reference': 'type-ref'
  }
  return map[normalized] || 'type-other'
}

function getReqTypeAbbr(type) {
  const normalized = type?.toLowerCase()
  const map = {
    'short': 'str',
    'chars': 'txt',
    'number': 'int',
    'signed': 'dec',
    'date': 'dt',
    'datetime': 'dt',
    'boolean': 'bool',
    'memo': 'memo',
    'reference': 'ref'
  }
  return map[normalized] || type?.slice(0, 3) || '?'
}

/**
 * Calculate bezier curve path between two points
 * Improved from legacy edit_types.html implementation
 */
function calculateBezierPath(x1, y1, x2, y2) {
  // Determine direction: is target to the right or left of source?
  const isTargetRight = x2 > x1
  const isTargetBelow = y2 > y1

  // Calculate control point offsets for smooth curves
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  const offset = Math.max(50, Math.min(dx / 3, 150)) // Control curve intensity

  let path
  let direction = 'right'

  if (isTargetRight) {
    // Target is to the right - standard curve
    const cx1 = x1 + offset
    const cy1 = y1
    const cx2 = x2 - offset
    const cy2 = y2
    path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
  } else {
    // Target is to the left - need special handling
    // Draw curve that goes up/down first, then to the target
    direction = 'left'
    const loopHeight = Math.max(40, dy / 4)
    const midY = (y1 + y2) / 2

    if (Math.abs(dy) < 50) {
      // Source and target at similar height - make S-curve
      const cx1 = x1 + offset
      const cy1 = y1 - loopHeight
      const cx2 = x2 - offset
      const cy2 = y2 + loopHeight
      path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
    } else {
      // Different heights - curve around
      const cx1 = x1 + offset
      const cy1 = y1
      const cx2 = x2 - offset
      const cy2 = y2
      path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
    }
  }

  return { path, direction }
}

function showConnection(sourceTypeId, req) {
  if (!req.refTypeId) return

  const targetTypeId = req.refTypeId
  highlightedTypeId.value = targetTypeId

  // Get source and target elements
  const sourceEl = reqRefs.value[req.id] || typeRefs.value[sourceTypeId]
  const targetEl = typeRefs.value[targetTypeId]

  if (!sourceEl || !targetEl || !containerRef.value) {
    console.log('Cannot draw line: missing elements', { sourceEl: !!sourceEl, targetEl: !!targetEl })
    return
  }

  const containerRect = containerRef.value.getBoundingClientRect()
  const sourceRect = sourceEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()

  // Calculate coordinates relative to container with scroll offset
  const scrollTop = containerRef.value.scrollTop || 0
  const scrollLeft = containerRef.value.scrollLeft || 0

  // Source point: right edge, vertical center
  const x1 = sourceRect.right - containerRect.left + scrollLeft + 5
  const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top + scrollTop

  // Target point: depends on relative position
  const isTargetRight = (targetRect.left + targetRect.width / 2) > (sourceRect.right)
  let x2, y2

  if (isTargetRight) {
    // Target to the right - connect to left edge
    x2 = targetRect.left - containerRect.left + scrollLeft - 5
    y2 = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop
  } else {
    // Target to the left - connect to right edge
    x2 = targetRect.right - containerRect.left + scrollLeft + 5
    y2 = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop
  }

  // Calculate bezier path
  const { path, direction } = calculateBezierPath(x1, y1, x2, y2)

  visibleLines.value = [{
    id: `${sourceTypeId}-${req.id}-${targetTypeId}`,
    x1,
    y1,
    x2,
    y2,
    path,
    direction,
    animated: true
  }]
}

function hideConnection() {
  if (!showAllConnections.value) {
    highlightedTypeId.value = null
    visibleLines.value = []
  }
}

/**
 * Toggle showing all connections between types
 */
function toggleAllConnections() {
  showAllConnections.value = !showAllConnections.value

  if (showAllConnections.value) {
    showAllConnectionLines()
  } else {
    visibleLines.value = []
    highlightedTypeId.value = null
  }
}

/**
 * Draw all connections between types
 */
async function showAllConnectionLines() {
  // Wait for DOM update
  await nextTick()

  const lines = []
  const containerRect = containerRef.value?.getBoundingClientRect()
  if (!containerRect) return

  const scrollTop = containerRef.value.scrollTop || 0
  const scrollLeft = containerRef.value.scrollLeft || 0

  // Collect all reference connections
  props.typesData.forEach(type => {
    const typeEl = typeRefs.value[type.id]
    if (!typeEl) return

    const typeRect = typeEl.getBoundingClientRect()

    type.requisites?.forEach(req => {
      if (!req.isReference || !req.refTypeId) return

      const targetEl = typeRefs.value[req.refTypeId]
      if (!targetEl) return

      const targetRect = targetEl.getBoundingClientRect()

      // Calculate line coordinates
      const x1 = typeRect.right - containerRect.left + scrollLeft + 5
      const y1 = typeRect.top + typeRect.height / 2 - containerRect.top + scrollTop

      const isTargetRight = (targetRect.left + targetRect.width / 2) > (typeRect.right)
      let x2, y2

      if (isTargetRight) {
        x2 = targetRect.left - containerRect.left + scrollLeft - 5
        y2 = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop
      } else {
        x2 = targetRect.right - containerRect.left + scrollLeft + 5
        y2 = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop
      }

      const { path, direction } = calculateBezierPath(x1, y1, x2, y2)

      lines.push({
        id: `${type.id}-${req.id}-${req.refTypeId}`,
        x1,
        y1,
        x2,
        y2,
        path,
        direction,
        animated: false // No animation for "show all" mode
      })
    })
  })

  visibleLines.value = lines
}

/**
 * Expand all type cards
 */
function expandAll() {
  props.typesData.forEach(type => {
    if (type.requisites?.length > 0) {
      expandedTypes.value.add(type.id)
    }
  })
  expandedTypes.value = new Set(expandedTypes.value)

  // Redraw connections if showing all
  if (showAllConnections.value) {
    showAllConnectionLines()
  }
}

/**
 * Collapse all type cards
 */
function collapseAll() {
  expandedTypes.value.clear()
  expandedTypes.value = new Set(expandedTypes.value)

  // Redraw connections if showing all
  if (showAllConnections.value) {
    showAllConnectionLines()
  }
}

function scrollToType(typeId) {
  const el = typeRefs.value[typeId]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedTypeId.value = typeId

    // Expand if collapsed
    if (!expandedTypes.value.has(typeId)) {
      expandedTypes.value.add(typeId)
      expandedTypes.value = new Set(expandedTypes.value)
    }

    setTimeout(() => {
      highlightedTypeId.value = null
    }, 2000)
  }
}

// Handle scroll/resize to redraw connections
function handleScrollResize() {
  if (showAllConnections.value) {
    showAllConnectionLines()
  }
}

// Lifecycle
onMounted(() => {
  // Expand first few types by default
  props.typesData.slice(0, 3).forEach(type => {
    if (type.requisites?.length > 0) {
      expandedTypes.value.add(type.id)
    }
  })

  // Add scroll listener for connection updates
  if (containerRef.value) {
    containerRef.value.addEventListener('scroll', handleScrollResize, { passive: true })
  }

  // Add resize observer
  const resizeObserver = new ResizeObserver(() => {
    handleScrollResize()
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('scroll', handleScrollResize)
  }
})
</script>

<style scoped>
.integram-schema-legacy {
  position: relative;
  height: 100%;
  overflow: auto;
  background: var(--p-surface-ground);
}

/* SVG overlay for connections */
.connection-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
  overflow: visible;
}

.connection-group {
  opacity: 0;
  animation: fadeInConnection 0.3s ease forwards;
}

@keyframes fadeInConnection {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.connection-path {
  stroke-linecap: round;
  stroke-linejoin: round;
}

.connection-path.animated {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawPath 0.5s ease forwards;
}

@keyframes drawPath {
  to {
    stroke-dashoffset: 0;
  }
}

/* Pulsing circle at connection start */
.connection-group circle {
  animation: pulseCircle 1s ease-in-out infinite;
}

@keyframes pulseCircle {
  0%, 100% {
    r: 4;
    opacity: 1;
  }
  50% {
    r: 6;
    opacity: 0.7;
  }
}

/* Toolbar */
.legacy-toolbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
}

.search-input {
  width: 300px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--p-surface-border);
  margin: 0 8px;
}

.stats {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

/* Types container */
.types-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 12px;
  padding: 16px;
}

/* Type card */
.type-card {
  background: var(--p-surface-card);
  border: 2px solid var(--p-surface-border);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.type-card:hover {
  border-color: var(--p-primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.type-card.highlighted {
  border-color: #ff9800;
  box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.3);
}

.type-card.is-reference-table {
  border-left: 4px solid #ff9800;
}

/* Type header */
.type-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--p-surface-50);
  cursor: pointer;
  transition: background 0.2s;
}

.type-header:hover {
  background: var(--p-surface-100);
}

.type-icon {
  font-size: 1.1rem;
  color: var(--p-primary-color);
}

.type-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.95rem;
}

.type-badges {
  display: flex;
  gap: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
}

.badge.unique {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.badge.ref {
  background: #fff3e0;
  color: #ff9800;
}

.type-count {
  background: var(--p-surface-200);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.type-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.type-card:hover .type-actions {
  opacity: 1;
}

/* Requisites */
.type-requisites {
  border-top: 1px solid var(--p-surface-border);
  max-height: 300px;
  overflow-y: auto;
}

.requisite-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--p-surface-100);
  transition: background 0.2s;
}

.requisite-row:last-child {
  border-bottom: none;
}

.requisite-row:hover {
  background: var(--p-surface-50);
}

.requisite-row.is-ref {
  background: rgba(255, 152, 0, 0.05);
}

.requisite-row.is-ref:hover {
  background: rgba(255, 152, 0, 0.1);
}

.req-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.type-string { background: #e3f2fd; color: #1565c0; }
.type-number { background: #e8f5e9; color: #2e7d32; }
.type-date { background: #fff3e0; color: #ef6c00; }
.type-bool { background: #fce4ec; color: #c2185b; }
.type-text { background: #f3e5f5; color: #7b1fa2; }
.type-ref { background: #fff8e1; color: #ff8f00; }
.type-other { background: #eceff1; color: #546e7a; }

.req-name {
  flex: 1;
  font-size: 0.85rem;
}

.req-ref-link {
  color: #ff9800;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: none;
}

.req-ref-link:hover {
  text-decoration: underline;
}

/* Preview chips */
.type-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--p-surface-100);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: default;
}

.preview-chip.is-ref {
  background: #fff8e1;
  cursor: pointer;
}

.preview-chip .chip-type {
  font-weight: 600;
  color: var(--p-primary-color);
}

.preview-chip.is-ref .chip-type {
  color: #ff8f00;
}

.preview-chip .chip-ref {
  color: #ff9800;
  font-size: 0.7rem;
}

.more {
  color: var(--p-text-secondary-color);
  font-size: 0.75rem;
  padding: 3px 8px;
}
</style>
