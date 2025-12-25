<template>
  <div class="integram-form-page integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Формы</span>
        </div>
      </template>
      <template #content>
        <!-- Form Selection -->
        <div v-if="!selectedForm" class="mb-4">
          <div class="integram-field">
            <label for="formSelect">Выберите форму</label>
            <Select
              id="formSelect"
              v-model="selectedFormId"
              :options="availableForms"
              optionLabel="name"
              optionValue="id"
              placeholder="Выберите форму"
              class="w-full"
              @change="loadForm"
            />
          </div>
        </div>

        <!-- Form Display -->
        <div v-if="selectedForm">
          <div class="mb-3">
            <Button
              icon="pi pi-arrow-left"
              label="Назад к выбору"
              @click="resetForm"
              text
              aria-label="Вернуться к списку форм"
            />
          </div>

          <h4>{{ selectedForm.name }}</h4>
          <p v-if="selectedForm.description" class="text-500 mb-3">
            {{ selectedForm.description }}
          </p>

          <!-- Form Panels -->
          <div class="grid">
            <div
              v-for="(panel, index) in selectedForm.panels"
              :key="index"
              :class="panelClass(panel)"
            >
              <Panel :header="panel.title" :toggleable="true">
                <!-- Panel Content Based on Type -->
                <div v-if="panel.type === 'table'">
                  <DataTable
                    :value="panel.data || []"
                    :paginator="panel.paginator"
                    :rows="panel.rows || 10"
                  >
                    <Column
                      v-for="col in panel.columns"
                      :key="col.field"
                      :field="col.field"
                      :header="col.header"
                    />
                  </DataTable>
                </div>

                <div v-else-if="panel.type === 'chart'">
                  <Chart
                    :type="panel.chartType || 'bar'"
                    :data="panel.chartData"
                    :options="panel.chartOptions"
                  />
                </div>

                <div v-else-if="panel.type === 'text'">
                  <div v-html="panel.content"></div>
                </div>

                <div v-else-if="panel.type === 'query'">
                  <p class="mb-2">SQL Query:</p>
                  <pre class="text-sm bg-gray-100 p-2 border-round">{{ panel.query }}</pre>
                  <Button
                    label="Выполнить запрос"
                    icon="pi pi-play"
                    @click="executePanelQuery(panel)"
                    class="mt-2"
                    aria-label="Выполнить SQL запрос"
                  />
                </div>

                <div v-else>
                  <Message severity="warn">
                    Неизвестный тип панели: {{ panel.type }}
                  </Message>
                </div>
              </Panel>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="!selectedForm && availableForms.length === 0" class="integram-empty-state">
          <i class="pi pi-inbox empty-icon"></i>
          <p class="empty-title">Формы не найдены</p>
          <p class="empty-description">Создайте первую форму для отображения данных</p>
          <div class="empty-action">
            <Button
              label="Создать форму"
              icon="pi pi-plus"
              @click="createNewForm"
              aria-label="Создать новую форму"
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'

// PrimeVue Components

defineProps({
  session: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['navigate'])

const toast = useToast()

const selectedFormId = ref(null)
const selectedForm = ref(null)
const availableForms = ref([])

// Breadcrumb navigation
const breadcrumbItems = computed(() => {
  const items = [
    {
      label: 'Формы',
      icon: 'pi pi-file',
      to: selectedForm.value ? '/integram/form' : undefined
    }
  ]

  // Add current form name if viewing a form
  if (selectedForm.value?.name) {
    items.push({
      label: selectedForm.value.name,
      icon: 'pi pi-file'
    })
  }

  return items
})

function loadForm() {
  if (!selectedFormId.value) return

  // TODO: Load form from API
  // Simulate form loading
  selectedForm.value = {
    id: selectedFormId.value,
    name: 'Демонстрационная форма',
    description: 'Пример формы с различными панелями',
    panels: [
      {
        title: 'Таблица данных',
        type: 'table',
        width: 'col-12',
        paginator: true,
        rows: 10,
        columns: [
          { field: 'id', header: 'ID' },
          { field: 'name', header: 'Название' },
          { field: 'value', header: 'Значение' }
        ],
        data: [
          { id: 1, name: 'Item 1', value: 100 },
          { id: 2, name: 'Item 2', value: 200 },
          { id: 3, name: 'Item 3', value: 300 }
        ]
      },
      {
        title: 'График',
        type: 'chart',
        width: 'col-12 md:col-6',
        chartType: 'bar',
        chartData: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr'],
          datasets: [{
            label: 'Sales',
            data: [65, 59, 80, 81],
            backgroundColor: '#42A5F5'
          }]
        }
      },
      {
        title: 'Текстовый блок',
        type: 'text',
        width: 'col-12 md:col-6',
        content: '<h4>Заголовок</h4><p>Это пример текстового контента в панели.</p>'
      }
    ]
  }
}

function panelClass(panel) {
  return panel.width || 'col-12'
}

function executePanelQuery() {
  toast.add({
    severity: 'info',
    summary: 'Выполнение запроса',
    detail: 'Функционал будет реализован через API',
    life: 3000
  })
}

function resetForm() {
  selectedForm.value = null
  selectedFormId.value = null
}

function createNewForm() {
  emit('navigate', 'formBuilder')
}

onMounted(() => {
  // Load available forms
  availableForms.value = [
    { id: '1', name: 'Демо форма 1' },
    { id: '2', name: 'Демо форма 2' }
  ]
})
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
