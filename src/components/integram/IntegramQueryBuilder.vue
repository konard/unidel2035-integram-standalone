<template>
  <div class="integram-query-builder-container">
    <!-- Toast for notifications -->
    <Toast />

    <!-- Breadcrumb Navigation -->
    <div class="mb-3">
      <IntegramBreadcrumb :items="breadcrumbItems" />
    </div>

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Конструктор запросов</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              label="Выполнить"
              icon="pi pi-play"
              @click="executeQuery"
              :loading="executing"
              :disabled="!isQueryValid"
              size="small"
            />
            <Button
              icon="pi pi-save"
              @click="saveAsReport"
              :disabled="!isQueryValid"
              outlined
              rounded
              size="small"
              v-tooltip.bottom="'Сохранить как отчет'"
            />
            <Button
              icon="pi pi-times"
              @click="clearQuery"
              outlined
              rounded
              size="small"
              severity="secondary"
              v-tooltip.bottom="'Очистить'"
            />
          </div>
        </div>
      </template>

      <template #content>
        <!-- Query Builder Form -->
        <div class="query-builder-form">
          <!-- SELECT Columns -->
          <div class="form-section mb-4">
            <label class="form-label font-semibold">
              SELECT (Выбрать колонки)
            </label>
            <div class="flex gap-2 mb-2">
              <MultiSelect
                v-model="selectedColumns"
                :options="availableColumns"
                optionLabel="label"
                optionValue="value"
                placeholder="Выберите колонки"
                :filter="true"
                class="flex-1"
                display="chip"
              />
              <Button
                label="Добавить выражение"
                icon="pi pi-plus"
                @click="addCustomExpression"
                outlined
                size="small"
              />
            </div>

            <!-- Custom expressions -->
            <div v-if="customExpressions.length > 0" class="custom-expressions">
              <div
                v-for="(expr, index) in customExpressions"
                :key="index"
                class="flex gap-2 mb-2"
              >
                <InputText
                  v-model="expr.expression"
                  placeholder="Выражение (например: COUNT(*), SUM(column))"
                  class="flex-1"
                />
                <InputText
                  v-model="expr.alias"
                  placeholder="Алиас"
                  style="width: 150px"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeCustomExpression(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
            </div>

            <!-- Aggregate Functions GUI -->
            <div v-if="aggregateFunctions.length > 0" class="aggregate-functions mt-3">
              <label class="form-label text-sm text-color-secondary mb-2">Агрегатные функции</label>
              <div
                v-for="(agg, index) in aggregateFunctions"
                :key="'agg-' + index"
                class="flex gap-2 mb-2 p-2 surface-ground border-round flex-wrap"
              >
                <Dropdown
                  v-model="agg.func"
                  :options="aggregateFunctionTypes"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Функция"
                  class="w-auto"
                  style="min-width: 130px"
                />
                <Dropdown
                  v-model="agg.column"
                  :options="availableColumnsForAggregate"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Колонка"
                  :filter="true"
                  class="flex-1"
                  style="min-width: 120px"
                  :disabled="agg.func === 'COUNT_ALL'"
                />
                <InputText
                  v-model="agg.alias"
                  placeholder="Алиас"
                  style="width: 120px"
                />
                <Dropdown
                  v-model="agg.format"
                  :options="columnFormatTypes"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Формат"
                  class="w-auto"
                  style="min-width: 130px"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeAggregateFunction(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
            </div>

            <div class="flex gap-2 mt-2">
              <Button
                label="Добавить функцию"
                icon="pi pi-calculator"
                @click="addAggregateFunction"
                outlined
                size="small"
                severity="info"
              />
            </div>
          </div>

          <!-- FROM Table -->
          <div class="form-section mb-4">
            <label class="form-label font-semibold">FROM (Таблица)</label>
            <Dropdown
              v-model="selectedTable"
              :options="availableTables"
              optionLabel="label"
              optionValue="value"
              placeholder="Выберите таблицу"
              :filter="true"
              class="w-full"
              @change="onTableChange"
            />
          </div>

          <!-- JOIN -->
          <div class="form-section mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <label class="form-label font-semibold">JOIN (Связи)</label>
              <Button
                label="Добавить JOIN"
                icon="pi pi-plus"
                @click="addJoin"
                outlined
                size="small"
              />
            </div>
            <div v-if="joins.length > 0">
              <div
                v-for="(join, index) in joins"
                :key="index"
                class="join-row mb-3 p-3 border-1 surface-border border-round"
              >
                <div class="flex gap-2 mb-2">
                  <Dropdown
                    v-model="join.type"
                    :options="joinTypes"
                    placeholder="Тип JOIN"
                    class="w-full"
                  />
                  <Dropdown
                    v-model="join.table"
                    :options="availableTables"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Таблица"
                    :filter="true"
                    class="w-full"
                  />
                  <Button
                    icon="pi pi-trash"
                    @click="removeJoin(index)"
                    text
                    rounded
                    severity="danger"
                    size="small"
                  />
                </div>
                <div class="flex gap-2">
                  <InputText
                    v-model="join.onLeft"
                    placeholder="Левое поле"
                    class="flex-1"
                  />
                  <span class="flex align-items-center">=</span>
                  <InputText
                    v-model="join.onRight"
                    placeholder="Правое поле"
                    class="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- WHERE Conditions -->
          <div class="form-section mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <label class="form-label font-semibold">WHERE (Условия)</label>
              <Button
                label="Добавить условие"
                icon="pi pi-plus"
                @click="addCondition"
                outlined
                size="small"
              />
            </div>
            <div v-if="conditions.length > 0">
              <div
                v-for="(condition, index) in conditions"
                :key="index"
                class="condition-row mb-2 flex gap-2"
              >
                <Dropdown
                  v-if="index > 0"
                  v-model="condition.logic"
                  :options="['AND', 'OR']"
                  placeholder="Логика"
                  class="w-auto"
                  style="width: 100px"
                />
                <InputText
                  v-model="condition.field"
                  placeholder="Поле"
                  class="flex-1"
                />
                <Dropdown
                  v-model="condition.operator"
                  :options="operators"
                  placeholder="Оператор"
                  class="w-auto"
                  style="width: 120px"
                />
                <InputText
                  v-model="condition.value"
                  placeholder="Значение"
                  class="flex-1"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeCondition(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
            </div>
          </div>

          <!-- GROUP BY -->
          <div class="form-section mb-4">
            <label class="form-label font-semibold">GROUP BY (Группировка)</label>
            <MultiSelect
              v-model="groupByColumns"
              :options="selectedColumns"
              placeholder="Выберите колонки для группировки"
              class="w-full"
              display="chip"
            />
          </div>

          <!-- HAVING Conditions -->
          <div class="form-section mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <label class="form-label font-semibold">HAVING (Условия группировки)</label>
              <Button
                label="Добавить условие"
                icon="pi pi-plus"
                @click="addHavingCondition"
                outlined
                size="small"
                :disabled="aggregateFunctions.length === 0"
                v-tooltip.bottom="aggregateFunctions.length === 0 ? 'Сначала добавьте агрегатную функцию' : ''"
              />
            </div>
            <div v-if="havingConditions.length > 0">
              <div
                v-for="(having, index) in havingConditions"
                :key="'having-' + index"
                class="having-row mb-2 flex gap-2 p-2 surface-ground border-round"
              >
                <Dropdown
                  v-if="index > 0"
                  v-model="having.logic"
                  :options="['AND', 'OR']"
                  placeholder="Логика"
                  class="w-auto"
                  style="width: 100px"
                />
                <Dropdown
                  v-model="having.aggregate"
                  :options="havingAggregateOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Агрегатная функция"
                  class="flex-1"
                />
                <Dropdown
                  v-model="having.operator"
                  :options="operators"
                  placeholder="Оператор"
                  class="w-auto"
                  style="width: 120px"
                />
                <InputText
                  v-model="having.valueFrom"
                  placeholder="От"
                  class="w-auto"
                  style="width: 100px"
                />
                <InputText
                  v-model="having.valueTo"
                  placeholder="До (опционально)"
                  class="w-auto"
                  style="width: 120px"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeHavingCondition(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
            </div>
            <small v-if="aggregateFunctions.length === 0" class="text-color-secondary">
              HAVING используется после GROUP BY для фильтрации агрегированных результатов
            </small>
          </div>

          <!-- SET Expressions (for UPDATE operations) -->
          <div class="form-section mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <label class="form-label font-semibold">SET (Вычисляемые присваивания)</label>
              <Button
                label="Добавить SET"
                icon="pi pi-plus"
                @click="addSetExpression"
                outlined
                size="small"
              />
            </div>
            <div v-if="setExpressions.length > 0" class="set-expressions">
              <div
                v-for="(set, index) in setExpressions"
                :key="'set-' + index"
                class="flex gap-2 mb-2 p-2 surface-ground border-round"
              >
                <Dropdown
                  v-model="set.column"
                  :options="availableColumns"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Колонка"
                  :filter="true"
                  class="w-auto"
                  style="min-width: 150px"
                />
                <span class="flex align-items-center">=</span>
                <InputText
                  v-model="set.expression"
                  placeholder="Выражение (например: RAND(), колонка*2, IF(...))"
                  class="flex-1"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeSetExpression(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
              <small class="text-color-secondary">
                SET используется для вычисления новых значений. Примеры: RAND(), POWER(val,2), IF(val>0,'Да','Нет')
              </small>
            </div>
          </div>

          <!-- ORDER BY -->
          <div class="form-section mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <label class="form-label font-semibold">ORDER BY (Сортировка)</label>
              <Button
                label="Добавить сортировку"
                icon="pi pi-plus"
                @click="addOrderBy"
                outlined
                size="small"
              />
            </div>
            <div v-if="orderByColumns.length > 0">
              <div
                v-for="(order, index) in orderByColumns"
                :key="index"
                class="flex gap-2 mb-2"
              >
                <Dropdown
                  v-model="order.column"
                  :options="selectedColumns"
                  placeholder="Колонка"
                  class="flex-1"
                />
                <Dropdown
                  v-model="order.direction"
                  :options="['ASC', 'DESC']"
                  placeholder="Направление"
                  class="w-auto"
                  style="width: 120px"
                />
                <Button
                  icon="pi pi-trash"
                  @click="removeOrderBy(index)"
                  text
                  rounded
                  severity="danger"
                  size="small"
                />
              </div>
            </div>
          </div>

          <!-- LIMIT -->
          <div class="form-section mb-4">
            <label class="form-label font-semibold">LIMIT (Лимит записей)</label>
            <InputNumber
              v-model="limit"
              placeholder="Количество записей"
              :min="1"
              :max="10000"
              showButtons
            />
          </div>
        </div>

        <!-- Generated SQL Preview -->
        <div class="sql-preview-section mt-4">
          <Divider />
          <div class="flex justify-content-between align-items-center mb-3">
            <h4 class="m-0">Сгенерированный SQL</h4>
            <Button
              label="Копировать"
              icon="pi pi-copy"
              @click="copySqlToClipboard"
              outlined
              size="small"
            />
          </div>
          <div class="sql-preview-box">
            <pre>{{ generatedSql }}</pre>
          </div>
        </div>

        <!-- Query Results -->
        <div v-if="queryResults" class="query-results-section mt-4">
          <Divider />
          <h4>Результаты запроса</h4>
          <DataTable
            :value="queryResults.rows"
            :paginator="true"
            :rows="20"
            stripedRows
            showGridlines
            responsiveLayout="scroll"
          >
            <Column
              v-for="col in queryResults.columns"
              :key="col.field"
              :field="col.field"
              :header="col.header"
            ></Column>
          </DataTable>
          <div class="mt-2 text-sm text-muted">
            Всего записей: {{ queryResults.total || queryResults.rows.length }}
          </div>
        </div>

        <!-- Error Message -->
        <Message
          v-if="error"
          severity="error"
          @close="error = null"
          closable
          class="mt-4"
        >
          {{ error }}
        </Message>
      </template>
    </Card>

    <!-- Save Report Dialog -->
    <Dialog
      v-model:visible="showSaveDialog"
      header="Сохранить как отчет"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div>
          <label for="reportName" class="form-label">Название отчета</label>
          <InputText
            id="reportName"
            v-model="reportName"
            placeholder="Введите название отчета"
            class="w-full"
          />
        </div>
        <div>
          <label for="reportDescription" class="form-label">Описание (опционально)</label>
          <Textarea
            id="reportDescription"
            v-model="reportDescription"
            placeholder="Описание отчета"
            :autoResize="true"
            rows="3"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showSaveDialog = false"
          text
        />
        <Button
          label="Сохранить"
          icon="pi pi-check"
          @click="confirmSaveReport"
          :loading="saving"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'

import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import integramService from '@/services/integramService'
import { logger } from '@/utils/logger'

const router = useRouter()
const toast = useToast()

// State
const selectedTable = ref(null)
const selectedColumns = ref([])
const customExpressions = ref([])
const aggregateFunctions = ref([])
const joins = ref([])
const conditions = ref([])
const groupByColumns = ref([])
const havingConditions = ref([])
const setExpressions = ref([])
const orderByColumns = ref([])
const limit = ref(100)

const availableTables = ref([])
const availableColumns = ref([])

const executing = ref(false)
const queryResults = ref(null)
const error = ref(null)

const showSaveDialog = ref(false)
const reportName = ref('')
const reportDescription = ref('')
const saving = ref(false)

// Constants - frozen for immutability and performance
const joinTypes = Object.freeze(['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN'])
const operators = Object.freeze(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'])

// Aggregate function types for the GUI dropdown
const aggregateFunctionTypes = Object.freeze([
  { value: 'COUNT', label: 'COUNT - Количество' },
  { value: 'COUNT_ALL', label: 'COUNT(*) - Всего записей' },
  { value: 'SUM', label: 'SUM - Сумма' },
  { value: 'AVG', label: 'AVG - Среднее' },
  { value: 'MAX', label: 'MAX - Максимум' },
  { value: 'MIN', label: 'MIN - Минимум' },
  { value: 'GROUP_CONCAT', label: 'GROUP_CONCAT - Объединить' }
])

// Column format options
const columnFormatTypes = Object.freeze([
  { value: '', label: 'По умолчанию' },
  { value: 'number', label: 'Число' },
  { value: 'decimal2', label: 'Десятичное (2 знака)' },
  { value: 'decimal4', label: 'Десятичное (4 знака)' },
  { value: 'currency', label: 'Валюта (₽)' },
  { value: 'percent', label: 'Процент (%)' },
  { value: 'date', label: 'Дата' },
  { value: 'datetime', label: 'Дата и время' },
  { value: 'time', label: 'Время' },
  { value: 'bool', label: 'Да/Нет' }
])

// ✅ Extract constant object for aggregate columns to avoid recreation
const ALL_COLUMNS_OPTION = Object.freeze({ value: '*', label: '* (все колонки)' })

// ✅ Extract constant breadcrumb to avoid recreation
const QUERY_BUILDER_BREADCRUMB = Object.freeze([
  Object.freeze({ label: 'Конструктор запросов', icon: 'pi pi-sliders-h' })
])

// Breadcrumb
const breadcrumbItems = computed(() => QUERY_BUILDER_BREADCRUMB)

// Computed
const isQueryValid = computed(() => {
  return selectedTable.value && (selectedColumns.value.length > 0 || aggregateFunctions.value.length > 0)
})

// Available columns for aggregate functions (includes * for COUNT)
const availableColumnsForAggregate = computed(() => {
  return [
    ALL_COLUMNS_OPTION,
    ...availableColumns.value
  ]
})

// HAVING aggregate options - built from user's aggregate functions
const havingAggregateOptions = computed(() => {
  return aggregateFunctions.value.map((agg, index) => {
    let label = ''
    if (agg.func === 'COUNT_ALL') {
      label = 'COUNT(*)'
    } else {
      label = `${agg.func}(${agg.column || '*'})`
    }
    if (agg.alias) {
      label += ` AS ${agg.alias}`
    }
    return {
      value: index,
      label: label
    }
  })
})

const generatedSql = computed(() => {
  if (!selectedTable.value) {
    return '-- Выберите таблицу для начала'
  }

  let sql = 'SELECT '

  // Columns
  const allColumns = []

  // Regular columns
  if (selectedColumns.value.length > 0) {
    allColumns.push(...selectedColumns.value)
  }

  // Custom expressions (manual input)
  customExpressions.value.forEach(expr => {
    if (expr.expression) {
      allColumns.push(expr.alias ? `${expr.expression} AS ${expr.alias}` : expr.expression)
    }
  })

  // Aggregate functions from GUI
  aggregateFunctions.value.forEach(agg => {
    if (agg.func) {
      let funcExpr = ''
      if (agg.func === 'COUNT_ALL') {
        funcExpr = 'COUNT(*)'
      } else if (agg.func === 'GROUP_CONCAT') {
        funcExpr = `GROUP_CONCAT(${agg.column || '*'})`
      } else {
        funcExpr = `${agg.func}(${agg.column || '*'})`
      }
      if (agg.alias) {
        funcExpr += ` AS ${agg.alias}`
      }
      allColumns.push(funcExpr)
    }
  })

  if (allColumns.length === 0) {
    sql += '*'
  } else {
    sql += allColumns.join(', ')
  }

  // FROM
  sql += `\nFROM ${selectedTable.value}`

  // JOINs
  joins.value.forEach(join => {
    if (join.table && join.onLeft && join.onRight) {
      sql += `\n${join.type || 'INNER JOIN'} ${join.table} ON ${join.onLeft} = ${join.onRight}`
    }
  })

  // WHERE
  if (conditions.value.length > 0) {
    sql += '\nWHERE '
    const whereClauses = conditions.value.map((cond, index) => {
      let clause = ''
      if (index > 0 && cond.logic) {
        clause += `${cond.logic} `
      }

      if (cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL') {
        clause += `${cond.field} ${cond.operator}`
      } else if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
        clause += `${cond.field} ${cond.operator} (${cond.value})`
      } else if (cond.operator === 'LIKE') {
        clause += `${cond.field} LIKE '%${cond.value}%'`
      } else {
        clause += `${cond.field} ${cond.operator} '${cond.value}'`
      }

      return clause
    }).join(' ')
    sql += whereClauses
  }

  // GROUP BY
  if (groupByColumns.value.length > 0) {
    sql += `\nGROUP BY ${groupByColumns.value.join(', ')}`
  }

  // HAVING
  if (havingConditions.value.length > 0 && aggregateFunctions.value.length > 0) {
    sql += '\nHAVING '
    const havingClauses = havingConditions.value.map((having, index) => {
      let clause = ''
      if (index > 0 && having.logic) {
        clause += `${having.logic} `
      }

      // Get the aggregate expression
      const aggIndex = having.aggregate
      const agg = aggregateFunctions.value[aggIndex]
      if (agg) {
        let aggExpr = ''
        if (agg.func === 'COUNT_ALL') {
          aggExpr = 'COUNT(*)'
        } else {
          aggExpr = `${agg.func}(${agg.column || '*'})`
        }

        // Build condition
        if (having.valueTo && having.valueFrom) {
          // Range: BETWEEN from AND to
          clause += `${aggExpr} BETWEEN ${having.valueFrom} AND ${having.valueTo}`
        } else if (having.valueFrom) {
          clause += `${aggExpr} ${having.operator || '>'} ${having.valueFrom}`
        }
      }
      return clause
    }).filter(c => c).join(' ')

    if (havingClauses) {
      sql += havingClauses
    } else {
      // Remove HAVING if no valid clauses
      sql = sql.replace('\nHAVING ', '')
    }
  }

  // ORDER BY
  if (orderByColumns.value.length > 0) {
    const orderClauses = orderByColumns.value.map(order =>
      `${order.column} ${order.direction || 'ASC'}`
    ).join(', ')
    sql += `\nORDER BY ${orderClauses}`
  }

  // LIMIT
  if (limit.value) {
    sql += `\nLIMIT ${limit.value}`
  }

  return sql
})

// Methods
async function loadTables() {
  try {
    const response = await integramService.getDictionary()
    if (response && response.types) {
      availableTables.value = Object.entries(response.types).map(([id, type]) => ({
        value: type.val,
        label: `${type.val} (ID: ${id})`
      }))
    }
  } catch (err) {
    logger.error('Failed to load tables:', err)
    error.value = 'Не удалось загрузить список таблиц'
  }
}

async function onTableChange() {
  // Load columns for selected table
  if (!selectedTable.value) return

  try {
    // Find table ID
    const table = availableTables.value.find(t => t.value === selectedTable.value)
    if (!table) return

    const tableId = parseInt(table.label.match(/ID: (\d+)/)[1])
    const metadata = await integramService.getMetadata(tableId)

    if (metadata && metadata.reqs) {
      availableColumns.value = metadata.reqs.map(req => ({
        value: req.name || req.val,
        label: req.name || req.val
      }))
    }
  } catch (err) {
    logger.error('Failed to load columns:', err)
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Не удалось загрузить колонки таблицы',
      life: 3000
    })
  }
}

function addCustomExpression() {
  customExpressions.value.push({ expression: '', alias: '' })
}

function removeCustomExpression(index) {
  customExpressions.value.splice(index, 1)
}

function addAggregateFunction() {
  aggregateFunctions.value.push({ func: 'COUNT', column: '*', alias: '', format: '' })
}

function removeAggregateFunction(index) {
  aggregateFunctions.value.splice(index, 1)
}

function addJoin() {
  joins.value.push({ type: 'INNER JOIN', table: null, onLeft: '', onRight: '' })
}

function removeJoin(index) {
  joins.value.splice(index, 1)
}

function addCondition() {
  conditions.value.push({ logic: 'AND', field: '', operator: '=', value: '' })
}

function removeCondition(index) {
  conditions.value.splice(index, 1)
}

function addOrderBy() {
  orderByColumns.value.push({ column: '', direction: 'ASC' })
}

function removeOrderBy(index) {
  orderByColumns.value.splice(index, 1)
}

// HAVING functions
function addHavingCondition() {
  if (aggregateFunctions.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Сначала добавьте хотя бы одну агрегатную функцию',
      life: 3000
    })
    return
  }
  havingConditions.value.push({
    logic: 'AND',
    aggregate: 0,
    operator: '>',
    valueFrom: '',
    valueTo: ''
  })
}

function removeHavingCondition(index) {
  havingConditions.value.splice(index, 1)
}

// SET functions
function addSetExpression() {
  setExpressions.value.push({
    column: '',
    expression: ''
  })
}

function removeSetExpression(index) {
  setExpressions.value.splice(index, 1)
}

async function executeQuery() {
  if (!isQueryValid.value) {
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Заполните обязательные поля',
      life: 3000
    })
    return
  }

  executing.value = true
  error.value = null
  queryResults.value = null

  try {
    // For now, we'll execute through SQL endpoint
    const response = await integramService.post('sql', {
      query: generatedSql.value,
      JSON: true
    })

    // Transform response to table format
    if (response && response.data) {
      const columns = response.columns || Object.keys(response.data[0] || {})
      queryResults.value = {
        columns: columns.map(col => ({
          field: col,
          header: col
        })),
        rows: response.data,
        total: response.total || response.data.length
      }

      toast.add({
        severity: 'success',
        summary: 'Успех',
        detail: `Запрос выполнен. Получено ${queryResults.value.rows.length} записей`,
        life: 3000
      })
    }
  } catch (err) {
    logger.error('Query execution failed:', err)
    error.value = 'Ошибка выполнения запроса: ' + err.message
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.value,
      life: 5000
    })
  } finally {
    executing.value = false
  }
}

function copySqlToClipboard() {
  navigator.clipboard.writeText(generatedSql.value).then(() => {
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'SQL запрос скопирован в буфер обмена',
      life: 2000
    })
  })
}

function clearQuery() {
  selectedTable.value = null
  selectedColumns.value = []
  customExpressions.value = []
  aggregateFunctions.value = []
  joins.value = []
  conditions.value = []
  groupByColumns.value = []
  havingConditions.value = []
  setExpressions.value = []
  orderByColumns.value = []
  limit.value = 100
  queryResults.value = null
  error.value = null
  availableColumns.value = []
}

function saveAsReport() {
  showSaveDialog.value = true
}

async function confirmSaveReport() {
  if (!reportName.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Предупреждение',
      detail: 'Введите название отчета',
      life: 3000
    })
    return
  }

  saving.value = true

  try {
    // Build WHERE clause from conditions
    let whereClause = ''
    if (conditions.value.length > 0) {
      whereClause = conditions.value.map((cond, index) => {
        let clause = ''
        if (index > 0 && cond.logic) {
          clause += `${cond.logic} `
        }
        if (cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL') {
          clause += `${cond.field} ${cond.operator}`
        } else if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
          clause += `${cond.field} ${cond.operator} (${cond.value})`
        } else if (cond.operator === 'LIKE') {
          clause += `${cond.field} LIKE '%${cond.value}%'`
        } else {
          clause += `${cond.field} ${cond.operator} '${cond.value}'`
        }
        return clause
      }).join(' ')
    }

    // Build ORDER BY clause
    let orderByClause = ''
    if (orderByColumns.value.length > 0) {
      orderByClause = orderByColumns.value.map(order =>
        `${order.column} ${order.direction || 'ASC'}`
      ).join(', ')
    }

    // Build HAVING clause
    let havingClause = ''
    if (havingConditions.value.length > 0 && aggregateFunctions.value.length > 0) {
      havingClause = havingConditions.value.map((having, index) => {
        let clause = ''
        if (index > 0 && having.logic) {
          clause += `${having.logic} `
        }
        const agg = aggregateFunctions.value[having.aggregate]
        if (agg) {
          let aggExpr = agg.func === 'COUNT_ALL' ? 'COUNT(*)' : `${agg.func}(${agg.column || '*'})`
          if (having.valueTo && having.valueFrom) {
            clause += `${aggExpr} BETWEEN ${having.valueFrom} AND ${having.valueTo}`
          } else if (having.valueFrom) {
            clause += `${aggExpr} ${having.operator || '>'} ${having.valueFrom}`
          }
        }
        return clause
      }).filter(c => c).join(' ')
    }

    // Create report using new API method
    const report = await integramService.createReport(reportName.value, {
      where: whereClause || undefined,
      having: havingClause || undefined,
      orderBy: orderByClause || undefined,
      limit: limit.value ? String(limit.value) : undefined
    })

    if (!report || !report.id) {
      throw new Error('Failed to create report')
    }

    const reportId = report.id
    logger.info(`Created report ${reportId}: ${reportName.value}`)

    // Add main FROM table
    if (selectedTable.value) {
      const table = availableTables.value.find(t => t.value === selectedTable.value)
      if (table) {
        const tableId = parseInt(table.label.match(/ID: (\d+)/)?.[1])
        if (tableId) {
          await integramService.addReportFrom(reportId, tableId, 't1')
          logger.info(`Added FROM table ${tableId} to report ${reportId}`)
        }
      }
    }

    // Add JOIN tables
    for (let i = 0; i < joins.value.length; i++) {
      const join = joins.value[i]
      if (join.table) {
        const table = availableTables.value.find(t => t.value === join.table)
        if (table) {
          const tableId = parseInt(table.label.match(/ID: (\d+)/)?.[1])
          if (tableId) {
            const alias = `t${i + 2}`
            const joinOn = join.onLeft && join.onRight
              ? `${join.onLeft} = ${join.onRight}`
              : null
            await integramService.addReportFrom(reportId, tableId, alias, joinOn)
            logger.info(`Added JOIN table ${tableId} to report ${reportId}`)
          }
        }
      }
    }

    // Add columns
    for (const columnName of selectedColumns.value) {
      // Find column/field ID from metadata
      const column = availableColumns.value.find(c => c.value === columnName)
      if (column) {
        await integramService.addReportColumn(reportId, {
          fieldId: 0, // Will be resolved by backend or use 0 for expression
          nameInReport: columnName,
          formula: columnName
        })
        logger.info(`Added column ${columnName} to report ${reportId}`)
      }
    }

    // Add custom expressions as computed columns
    for (const expr of customExpressions.value) {
      if (expr.expression) {
        await integramService.addReportColumn(reportId, {
          fieldId: 0, // Computed column
          nameInReport: expr.alias || expr.expression,
          formula: expr.expression,
          set: expr.expression
        })
        logger.info(`Added expression ${expr.expression} to report ${reportId}`)
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Успех',
      detail: 'Отчет успешно сохранен',
      life: 3000
    })

    showSaveDialog.value = false
    reportName.value = ''
    reportDescription.value = ''

    // Navigate to the report
    router.push(`/integram/smartq?reportId=${reportId}`)
  } catch (err) {
    logger.error('Failed to save report:', err)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить отчет: ' + err.message,
      life: 5000
    })
  } finally {
    saving.value = false
  }
}

// Lifecycle
onMounted(() => {
  loadTables()
})
</script>

<style scoped>
.integram-query-builder-container {
  padding: 1rem;
}

.form-section {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.sql-preview-box {
  background: var(--surface-50);
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  padding: 1rem;
  overflow-x: auto;
}

.sql-preview-box pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-color);
}

.join-row,
.condition-row {
  background: var(--surface-ground);
}

.custom-expressions {
  background: var(--surface-ground);
  padding: 0.75rem;
  border-radius: var(--border-radius);
}

.aggregate-functions {
  background: var(--surface-ground);
  padding: 0.75rem;
  border-radius: var(--border-radius);
  border-left: 3px solid var(--primary-color);
}

.having-row {
  border-left: 3px solid var(--orange-500);
}

.set-expressions {
  background: var(--surface-ground);
  padding: 0.75rem;
  border-radius: var(--border-radius);
  border-left: 3px solid var(--green-500);
}

.query-results-section {
  margin-top: 2rem;
}
</style>
