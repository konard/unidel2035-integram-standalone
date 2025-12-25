<template>
  <div class="query-builder-gui">
    <!-- Header with Toggle -->
    <div class="query-builder-header">
      <div class="flex justify-content-between align-items-center">
        <h4 class="m-0 flex align-items-center gap-2">
          <i class="pi pi-cog"></i>
          {{ $t('queryBuilder.title') }}
        </h4>
        <div class="flex gap-2 align-items-center">
          <label class="mr-2">
            <input
              type="checkbox"
              v-model="isInteractive"
              @change="handleInteractiveToggle"
              class="mr-1"
            />
            {{ $t('queryBuilder.interactive') }}
          </label>
          <InputNumber
            v-model="reportLimit"
            :placeholder="$t('queryBuilder.limit')"
            :min="1"
            :max="1000"
            showButtons
            buttonLayout="horizontal"
            style="width: 150px"
            @update:modelValue="handleLimitChange"
          >
            <template #incrementbuttonicon>
              <span class="pi pi-plus" />
            </template>
            <template #decrementbuttonicon>
              <span class="pi pi-minus" />
            </template>
          </InputNumber>
        </div>
      </div>
    </div>

    <!-- Control Buttons -->
    <div class="control-buttons mt-3 mb-3">
      <Button
        v-for="control in columnControls"
        :key="control.id"
        :label="control.label"
        :class="{ 'p-button-primary': activeControls.includes(control.id) }"
        :outlined="!activeControls.includes(control.id)"
        size="small"
        @click="toggleControl(control.id)"
        class="mr-2 mb-2"
      />
    </div>

    <!-- Table and Column Selection -->
    <div class="table-column-selector mb-4">
      <div class="flex gap-3 align-items-end">
        <div class="flex-1">
          <label class="block mb-2 font-semibold">
            {{ $t('queryBuilder.addColumn') }}
          </label>
          <div class="flex gap-2">
            <!-- Table Dropdown -->
            <Dropdown
              v-if="!selectedTableForColumns"
              v-model="selectedTable"
              :options="availableTables"
              optionLabel="name"
              optionValue="id"
              :placeholder="$t('queryBuilder.selectTable')"
              class="flex-1"
              @change="handleTableSelect"
              showClear
            />

            <!-- Table Selected - Show Column Dropdown -->
            <template v-else>
              <Chip
                :label="selectedTableName"
                removable
                @remove="clearTableSelection"
                class="mr-2"
              />
              <Dropdown
                v-model="selectedColumn"
                :options="columnsForSelectedTable"
                optionLabel="name"
                optionValue="id"
                :placeholder="$t('queryBuilder.selectColumn')"
                class="flex-1"
                @change="handleColumnAdd"
              />
            </template>
          </div>
        </div>

        <!-- Add Calculated Column -->
        <Button
          :label="$t('queryBuilder.addCalculated')"
          icon="pi pi-calculator"
          outlined
          @click="addCalculatedColumn"
        />

        <!-- Add JOIN -->
        <Button
          :label="$t('queryBuilder.addJoin')"
          icon="pi pi-link"
          outlined
          @click="showJoinDialog = true"
        />
      </div>
    </div>

    <!-- Selected Columns Table -->
    <div v-if="selectedColumns.length > 0" class="selected-columns-table">
      <DataTable
        :value="selectedColumns"
        responsiveLayout="scroll"
        showGridlines
        stripedRows
      >
        <!-- Column Headers -->
        <Column header="#" style="width: 50px">
          <template #body="{ index }">
            {{ index + 1 }}
          </template>
        </Column>

        <Column :header="$t('queryBuilder.columnName')" field="name">
          <template #body="{ data }">
            <InputText
              v-model="data.alias"
              :placeholder="data.name"
              class="w-full p-inputtext-sm"
              @change="handleColumnAliasChange(data)"
            />
          </template>
        </Column>

        <!-- Dynamic Control Columns -->
        <Column
          v-if="activeControls.includes('filter')"
          :header="$t('queryBuilder.filter')"
          style="min-width: 200px"
        >
          <template #body="{ data }">
            <div class="flex gap-1">
              <InputText
                v-model="data.filterFrom"
                :placeholder="$t('queryBuilder.from')"
                class="p-inputtext-sm"
                style="width: 90px"
                @change="handleControlChange(data)"
              />
              <InputText
                v-model="data.filterTo"
                :placeholder="$t('queryBuilder.to')"
                class="p-inputtext-sm"
                style="width: 90px"
                @change="handleControlChange(data)"
              />
            </div>
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('format')"
          :header="$t('queryBuilder.format')"
        >
          <template #body="{ data }">
            <Dropdown
              v-model="data.format"
              :options="formatOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="$t('queryBuilder.selectFormat')"
              class="p-inputtext-sm w-full"
              @change="handleControlChange(data)"
            />
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('function')"
          :header="$t('queryBuilder.function')"
        >
          <template #body="{ data }">
            <Dropdown
              v-model="data.function"
              :options="functionOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="$t('queryBuilder.selectFunction')"
              class="p-inputtext-sm w-full"
              @change="handleControlChange(data)"
            />
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('order')"
          :header="$t('queryBuilder.order')"
          style="width: 150px"
        >
          <template #body="{ data }">
            <div class="flex gap-1 align-items-center">
              <Button
                icon="pi pi-sort-amount-up"
                :severity="data.orderDir === 'ASC' ? 'primary' : 'secondary'"
                :outlined="data.orderDir !== 'ASC'"
                size="small"
                @click="setColumnOrder(data, 'ASC')"
              />
              <Button
                icon="pi pi-sort-amount-down"
                :severity="data.orderDir === 'DESC' ? 'primary' : 'secondary'"
                :outlined="data.orderDir !== 'DESC'"
                size="small"
                @click="setColumnOrder(data, 'DESC')"
              />
              <InputNumber
                v-if="data.orderDir"
                v-model="data.orderPriority"
                :min="1"
                :max="99"
                showButtons
                style="width: 80px"
                @update:modelValue="handleControlChange(data)"
              />
            </div>
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('totals')"
          :header="$t('queryBuilder.totals')"
        >
          <template #body="{ data }">
            <Dropdown
              v-model="data.totals"
              :options="totalsOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="$t('queryBuilder.selectTotals')"
              class="p-inputtext-sm w-full"
              @change="handleControlChange(data)"
            />
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('expression')"
          :header="$t('queryBuilder.expression')"
          style="min-width: 200px"
        >
          <template #body="{ data }">
            <InputText
              v-model="data.expression"
              :placeholder="$t('queryBuilder.expressionPlaceholder')"
              class="p-inputtext-sm w-full"
              @change="handleControlChange(data)"
            />
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('having')"
          :header="$t('queryBuilder.having')"
          style="min-width: 200px"
        >
          <template #body="{ data }">
            <div class="flex gap-1">
              <InputText
                v-model="data.havingFrom"
                :placeholder="$t('queryBuilder.from')"
                class="p-inputtext-sm"
                style="width: 90px"
                @change="handleControlChange(data)"
              />
              <InputText
                v-model="data.havingTo"
                :placeholder="$t('queryBuilder.to')"
                class="p-inputtext-sm"
                style="width: 90px"
                @change="handleControlChange(data)"
              />
            </div>
          </template>
        </Column>

        <Column
          v-if="activeControls.includes('set')"
          :header="$t('queryBuilder.set')"
          style="min-width: 250px"
        >
          <template #body="{ data }">
            <div class="flex flex-column gap-1">
              <InputText
                v-model="data.setExpression"
                :placeholder="$t('queryBuilder.setPlaceholder')"
                class="p-inputtext-sm w-full"
                @change="handleControlChange(data)"
              />
              <small class="text-muted">{{ $t('queryBuilder.setHint') }}</small>
            </div>
          </template>
        </Column>

        <!-- Column Actions -->
        <Column :header="$t('queryBuilder.actions')" style="width: 200px">
          <template #body="{ data, index }">
            <div class="flex gap-1">
              <Button
                icon="pi pi-arrow-up"
                size="small"
                text
                rounded
                :disabled="index === 0"
                @click="moveColumnUp(index)"
                v-tooltip.top="$t('queryBuilder.moveUp')"
              />
              <Button
                icon="pi pi-arrow-down"
                size="small"
                text
                rounded
                :disabled="index === selectedColumns.length - 1"
                @click="moveColumnDown(index)"
                v-tooltip.top="$t('queryBuilder.moveDown')"
              />
              <Button
                :icon="data.hidden ? 'pi pi-eye' : 'pi pi-eye-slash'"
                size="small"
                text
                rounded
                @click="toggleColumnVisibility(data)"
                v-tooltip.top="data.hidden ? $t('queryBuilder.show') : $t('queryBuilder.hide')"
              />
              <Button
                v-if="canAddIdColumn(data)"
                icon="pi pi-id-card"
                size="small"
                text
                rounded
                @click="addIdColumn(data)"
                v-tooltip.top="$t('queryBuilder.addIdColumn')"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                rounded
                @click="removeColumn(index)"
                v-tooltip.top="$t('queryBuilder.removeColumn')"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state text-center py-5">
      <i class="pi pi-table text-6xl text-400 mb-3"></i>
      <p class="text-xl text-500 mb-2">{{ $t('queryBuilder.noColumns') }}</p>
      <p class="text-muted">{{ $t('queryBuilder.noColumnsHint') }}</p>
    </div>

    <!-- JOIN Dialog -->
    <Dialog
      v-model:visible="showJoinDialog"
      :header="$t('queryBuilder.joinDialog.title')"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="join-dialog-content">
        <div class="mb-3">
          <label class="block mb-2 font-semibold">{{ $t('queryBuilder.joinDialog.leftTable') }}</label>
          <Dropdown
            v-model="joinConfig.leftTable"
            :options="availableTables"
            optionLabel="name"
            optionValue="id"
            :placeholder="$t('queryBuilder.selectTable')"
            class="w-full"
          />
        </div>

        <div class="mb-3">
          <label class="block mb-2 font-semibold">{{ $t('queryBuilder.joinDialog.alias') }}</label>
          <InputText
            v-model="joinConfig.alias"
            :placeholder="$t('queryBuilder.joinDialog.aliasPlaceholder')"
            class="w-full"
          />
        </div>

        <div class="mb-3 grid">
          <div class="col-5">
            <label class="block mb-2 font-semibold">{{ $t('queryBuilder.joinDialog.leftField') }}</label>
            <Dropdown
              v-model="joinConfig.leftField"
              :options="joinFieldOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="$t('queryBuilder.joinDialog.selectField')"
              class="w-full"
            />
          </div>
          <div class="col-2 flex align-items-center justify-content-center">
            <span class="text-3xl">=</span>
          </div>
          <div class="col-5">
            <label class="block mb-2 font-semibold">{{ $t('queryBuilder.joinDialog.rightField') }}</label>
            <Dropdown
              v-model="joinConfig.rightField"
              :options="joinFieldOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="$t('queryBuilder.joinDialog.selectField')"
              class="w-full"
            />
          </div>
        </div>

        <div class="mb-3">
          <label class="block mb-2 font-semibold">{{ $t('queryBuilder.joinDialog.rightColumn') }}</label>
          <Dropdown
            v-model="joinConfig.rightTable"
            :options="availableColumnsForJoin"
            optionLabel="name"
            optionValue="id"
            :placeholder="$t('queryBuilder.selectColumn')"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          :label="$t('common.cancel')"
          icon="pi pi-times"
          @click="showJoinDialog = false"
          text
        />
        <Button
          :label="$t('common.add')"
          icon="pi pi-check"
          @click="addJoin"
          :disabled="!isJoinConfigValid"
        />
      </template>
    </Dialog>

    <!-- Generated SQL Preview (Collapsible) -->
    <div class="sql-preview mt-4">
      <Accordion>
        <AccordionTab :header="$t('queryBuilder.sqlPreview')">
          <pre class="sql-code"><code>{{ generatedSQL }}</code></pre>
          <div class="flex gap-2 mt-3">
            <Button
              :label="$t('queryBuilder.copySQL')"
              icon="pi pi-copy"
              outlined
              size="small"
              @click="copySQL"
            />
            <Button
              :label="$t('queryBuilder.executeQuery')"
              icon="pi pi-play"
              severity="success"
              size="small"
              @click="executeQuery"
            />
          </div>
        </AccordionTab>
      </Accordion>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'

import integramService from '@/services/integramService'
import { logger } from '@/utils/logger'

const props = defineProps({
  reportId: {
    type: [Number, String],
    default: null
  },
  initialColumns: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:columns', 'sql-changed', 'execute-query'])

const { t } = useI18n()
const toast = useToast()

// State
const isInteractive = ref(false)
const reportLimit = ref(20)
const availableTables = ref([])
const selectedTable = ref(null)
const selectedTableForColumns = ref(null)
const selectedColumn = ref(null)
const selectedColumns = ref([])
const activeControls = ref([])
const showJoinDialog = ref(false)
const joins = ref([])

// Column controls configuration (matches legacy: Filter, Format, Function, Order, Totals, Expression, HAVING, SET)
const columnControls = [
  { id: 'filter', label: t('queryBuilder.controls.filter'), reqId: 102 },
  { id: 'format', label: t('queryBuilder.controls.format'), reqId: 84 },
  { id: 'function', label: t('queryBuilder.controls.function'), reqId: 104 },
  { id: 'order', label: t('queryBuilder.controls.order'), reqId: 109 },
  { id: 'totals', label: t('queryBuilder.controls.totals'), reqId: 72 },
  { id: 'expression', label: t('queryBuilder.controls.expression'), reqId: 101 },
  { id: 'having', label: t('queryBuilder.controls.having'), reqId: 105 },
  { id: 'set', label: t('queryBuilder.controls.set'), reqId: 132 }
]

// Options for dropdowns
const formatOptions = ref([
  { label: 'Short Text', value: 'SHORT' },
  { label: 'Long Text', value: 'LONG' },
  { label: 'Number', value: 'NUMBER' },
  { label: 'Date', value: 'DATE' },
  { label: 'DateTime', value: 'DATETIME' },
  { label: 'Boolean', value: 'BOOLEAN' }
])

const functionOptions = ref([
  { label: 'None', value: null },
  { label: 'COUNT', value: 'COUNT' },
  { label: 'SUM', value: 'SUM' },
  { label: 'AVG', value: 'AVG' },
  { label: 'MIN', value: 'MIN' },
  { label: 'MAX', value: 'MAX' }
])

const totalsOptions = ref([
  { label: 'None', value: null },
  { label: 'SUM', value: 'SUM' },
  { label: 'COUNT', value: 'COUNT' },
  { label: 'AVG', value: 'AVG' },
  { label: 'MIN', value: 'MIN' },
  { label: 'MAX', value: 'MAX' }
])

const joinFieldOptions = [
  { label: 'ID', value: 'id' },
  { label: 'Type (table)', value: 't' },
  { label: 'Parent (up)', value: 'up' },
  { label: 'Value', value: 'val' }
]

// JOIN configuration
const joinConfig = ref({
  leftTable: null,
  alias: '',
  leftField: 'id',
  rightField: 't',
  rightTable: null
})

// Computed
const selectedTableName = computed(() => {
  if (!selectedTableForColumns.value) return ''
  const table = availableTables.value.find(t => t.id === selectedTableForColumns.value)
  return table ? table.name : ''
})

const columnsForSelectedTable = computed(() => {
  if (!selectedTableForColumns.value) return []
  // In real implementation, fetch columns for the selected table from Integram API
  // For now, return mock data
  return []
})

const availableColumnsForJoin = computed(() => {
  // Return columns that can be used in JOIN
  return selectedColumns.value.map(col => ({
    id: col.id,
    name: col.alias || col.name
  }))
})

const isJoinConfigValid = computed(() => {
  return joinConfig.value.leftTable &&
         joinConfig.value.alias &&
         joinConfig.value.leftField &&
         joinConfig.value.rightField &&
         joinConfig.value.rightTable
})

const generatedSQL = computed(() => {
  if (selectedColumns.value.length === 0) {
    return '-- Select columns to generate SQL'
  }

  // Build SELECT clause
  const selectClauses = []
  selectedColumns.value.forEach(col => {
    if (col.hidden) return

    let clause = col.expression || col.name

    if (col.function) {
      clause = `${col.function}(${clause})`
    }

    if (col.alias && col.alias !== col.name) {
      clause += ` AS ${col.alias}`
    }

    selectClauses.push(clause)
  })

  let sql = `SELECT\n  ${selectClauses.join(',\n  ')}`

  // FROM clause (simplified)
  sql += '\nFROM integram_objects'

  // WHERE clause (filters)
  const whereConditions = []
  selectedColumns.value.forEach(col => {
    if (col.filterFrom) {
      whereConditions.push(`${col.name} >= '${col.filterFrom}'`)
    }
    if (col.filterTo) {
      whereConditions.push(`${col.name} <= '${col.filterTo}'`)
    }
  })

  if (whereConditions.length > 0) {
    sql += '\nWHERE\n  ' + whereConditions.join(' AND\n  ')
  }

  // ORDER BY clause
  const orderClauses = selectedColumns.value
    .filter(col => col.orderDir)
    .sort((a, b) => (a.orderPriority || 99) - (b.orderPriority || 99))
    .map(col => `${col.name} ${col.orderDir}`)

  if (orderClauses.length > 0) {
    sql += '\nORDER BY\n  ' + orderClauses.join(',\n  ')
  }

  // LIMIT clause
  if (reportLimit.value) {
    sql += `\nLIMIT ${reportLimit.value}`
  }

  return sql
})

// Methods
async function loadAvailableTables() {
  try {
    // Load dictionary types (tables) from Integram
    const response = await integramService.getDictionary()

    if (response && response.types) {
      availableTables.value = response.types.map(type => ({
        id: type.id,
        name: type.name || `Type ${type.id}`,
        baseTypeId: type.base_type_id
      }))
    }
  } catch (error) {
    logger.error('Failed to load available tables:', error)
    toast.add({
      severity: 'error',
      summary: t('error'),
      detail: t('queryBuilder.errors.loadTablesFailed'),
      life: 3000
    })
  }
}

function handleTableSelect() {
  selectedTableForColumns.value = selectedTable.value
  selectedColumn.value = null
}

function clearTableSelection() {
  selectedTableForColumns.value = null
  selectedTable.value = null
  selectedColumn.value = null
}

function handleColumnAdd() {
  if (!selectedColumn.value) return

  const newColumn = {
    id: `col_${Date.now()}`,
    tableId: selectedTableForColumns.value,
    columnId: selectedColumn.value,
    name: `Column_${selectedColumns.value.length + 1}`,
    alias: '',
    type: 'SHORT',
    hidden: false,
    // Control values
    filterFrom: '',
    filterTo: '',
    format: null,
    function: null,
    orderDir: null,
    orderPriority: null,
    totals: null,
    expression: '',
    havingFrom: '',
    havingTo: '',
    setExpression: '' // SET для вычисляемых значений (RAND(), IF(), POWER() и т.д.)
  }

  selectedColumns.value.push(newColumn)
  selectedColumn.value = null

  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function addCalculatedColumn() {
  const newColumn = {
    id: `calc_${Date.now()}`,
    tableId: null,
    columnId: null,
    name: 'Calculated',
    alias: `Calc_${selectedColumns.value.length + 1}`,
    type: 'NUMBER',
    hidden: false,
    isCalculated: true,
    expression: '',
    filterFrom: '',
    filterTo: '',
    format: null,
    function: null,
    orderDir: null,
    orderPriority: null,
    totals: null,
    havingFrom: '',
    havingTo: '',
    setExpression: '' // SET для вычисляемых значений (RAND(), IF(), POWER() и т.д.)
  }

  selectedColumns.value.push(newColumn)

  emit('update:columns', selectedColumns.value)
  emitSQLChange()

  toast.add({
    severity: 'success',
    summary: t('success'),
    detail: t('queryBuilder.calculatedColumnAdded'),
    life: 2000
  })
}

function addJoin() {
  joins.value.push({ ...joinConfig.value })

  showJoinDialog.value = false

  // Reset join config
  joinConfig.value = {
    leftTable: null,
    alias: '',
    leftField: 'id',
    rightField: 't',
    rightTable: null
  }

  toast.add({
    severity: 'success',
    summary: t('success'),
    detail: t('queryBuilder.joinAdded'),
    life: 2000
  })

  emitSQLChange()
}

function toggleControl(controlId) {
  const index = activeControls.value.indexOf(controlId)
  if (index > -1) {
    activeControls.value.splice(index, 1)
  } else {
    activeControls.value.push(controlId)
  }
}

function handleColumnAliasChange(column) {
  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function handleControlChange(column) {
  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function setColumnOrder(column, direction) {
  if (column.orderDir === direction) {
    // Toggle off
    column.orderDir = null
    column.orderPriority = null
  } else {
    // Set direction and priority
    column.orderDir = direction
    if (!column.orderPriority) {
      const maxPriority = Math.max(
        0,
        ...selectedColumns.value
          .filter(c => c.orderPriority)
          .map(c => c.orderPriority)
      )
      column.orderPriority = maxPriority + 1
    }
  }

  handleControlChange(column)
}

function moveColumnUp(index) {
  if (index === 0) return
  const temp = selectedColumns.value[index]
  selectedColumns.value[index] = selectedColumns.value[index - 1]
  selectedColumns.value[index - 1] = temp

  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function moveColumnDown(index) {
  if (index === selectedColumns.value.length - 1) return
  const temp = selectedColumns.value[index]
  selectedColumns.value[index] = selectedColumns.value[index + 1]
  selectedColumns.value[index + 1] = temp

  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function toggleColumnVisibility(column) {
  column.hidden = !column.hidden

  emit('update:columns', selectedColumns.value)
  emitSQLChange()
}

function removeColumn(index) {
  selectedColumns.value.splice(index, 1)

  emit('update:columns', selectedColumns.value)
  emitSQLChange()

  toast.add({
    severity: 'info',
    summary: t('info'),
    detail: t('queryBuilder.columnRemoved'),
    life: 2000
  })
}

/**
 * Check if a column can have an ID column added
 * This is true for non-calculated columns that don't already end in 'ID'
 */
function canAddIdColumn(column) {
  if (column.isCalculated) return false
  const name = column.alias || column.name
  if (name.endsWith('ID') || name.endsWith('Id')) return false
  // Don't show if an ID column already exists for this base column
  const existingIdCol = selectedColumns.value.find(
    c => c.baseColumnId === column.id && c.isIdColumn
  )
  return !existingIdCol
}

/**
 * Add an ID column for a reference column
 * Creates a new column with [ColumnName]ID alias using abn_ID function
 */
function addIdColumn(baseColumn) {
  const baseName = baseColumn.alias || baseColumn.name
  const newColumn = {
    id: `id_${Date.now()}`,
    tableId: baseColumn.tableId,
    columnId: baseColumn.columnId,
    name: `${baseName}ID`,
    alias: `${baseName}ID`,
    type: 'NUMBER',
    hidden: false,
    isIdColumn: true,
    baseColumnId: baseColumn.id,
    // Control values
    filterFrom: '',
    filterTo: '',
    format: null,
    function: 'abn_ID', // Special Integram function to get object ID
    orderDir: null,
    orderPriority: null,
    totals: null,
    expression: '',
    havingFrom: '',
    havingTo: '',
    setExpression: ''
  }

  // Insert after the base column
  const baseIndex = selectedColumns.value.findIndex(c => c.id === baseColumn.id)
  selectedColumns.value.splice(baseIndex + 1, 0, newColumn)

  emit('update:columns', selectedColumns.value)
  emitSQLChange()

  toast.add({
    severity: 'success',
    summary: t('success'),
    detail: t('queryBuilder.idColumnAdded'),
    life: 2000
  })
}

function handleInteractiveToggle() {
  // Save interactive setting to report
  if (props.reportId) {
    // Call API to update report settings
    logger.info('Interactive mode toggled:', isInteractive.value)
  }
}

function handleLimitChange() {
  emitSQLChange()
}

function emitSQLChange() {
  emit('sql-changed', {
    sql: generatedSQL.value,
    columns: selectedColumns.value,
    joins: joins.value,
    limit: reportLimit.value,
    isInteractive: isInteractive.value
  })
}

function copySQL() {
  navigator.clipboard.writeText(generatedSQL.value)

  toast.add({
    severity: 'success',
    summary: t('success'),
    detail: t('queryBuilder.sqlCopied'),
    life: 2000
  })
}

function executeQuery() {
  emit('execute-query', {
    sql: generatedSQL.value,
    columns: selectedColumns.value
  })
}

// Lifecycle
onMounted(async () => {
  await loadAvailableTables()

  if (props.initialColumns && props.initialColumns.length > 0) {
    selectedColumns.value = props.initialColumns
  }
})

// Watch for external column changes
watch(() => props.initialColumns, (newColumns) => {
  if (newColumns && newColumns.length > 0) {
    selectedColumns.value = newColumns
  }
}, { deep: true })
</script>

<style scoped>
.query-builder-gui {
  padding: 1rem;
  background: var(--surface-ground);
  border-radius: var(--border-radius);
}

.query-builder-header {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.control-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.table-column-selector {
  background: var(--surface-card);
  padding: 1rem;
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-border);
}

.selected-columns-table {
  margin-top: 1rem;
}

.empty-state {
  background: var(--surface-card);
  border: 2px dashed var(--surface-border);
  border-radius: var(--border-radius);
}

.sql-preview {
  background: var(--surface-card);
  border-radius: var(--border-radius);
}

.sql-code {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: var(--border-radius);
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-color);
}

.join-dialog-content {
  padding: 1rem 0;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .control-buttons {
    flex-direction: column;
  }

  .control-buttons .p-button {
    width: 100%;
  }
}
</style>
