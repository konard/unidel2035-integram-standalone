<template>
  <Dialog
    v-model:visible="showDialog"
    :modal="true"
    :closable="canClose"
    :draggable="false"
    :style="{ width: '60rem' }"
    :breakpoints="{ '1199px': '80vw', '575px': '95vw' }"
  >
    <template #header>
      <div class="flex align-items-center gap-2">
        <i class="pi pi-building text-4xl text-primary"></i>
        <span class="font-bold text-2xl">Настройка организации</span>
      </div>
    </template>

    <div class="flex flex-column gap-4 py-4">
      <!-- Progress Indicator -->
      <div class="flex justify-content-center gap-2 mb-4">
        <div
          v-for="n in 4"
          :key="n"
          class="step-indicator"
          :class="{ active: currentStep >= n, completed: currentStep > n }"
        >
          <span class="step-number">{{ n }}</span>
        </div>
      </div>

      <!-- Step 1: Create Organization -->
      <div v-if="currentStep === 1" class="step-content">
        <h3 class="text-xl font-semibold mb-3">
          <i class="pi pi-building mr-2"></i>
          Создание организации
        </h3>
        <p class="text-color-secondary mb-4">
          Организация - это ваше рабочее пространство, где вы управляете агентами, источниками данных и командой.
        </p>

        <div class="p-fluid">
          <div class="field mb-4">
            <label for="orgName" class="font-semibold mb-2">Название организации *</label>
            <InputText
              id="orgName"
              v-model="organizationData.name"
              placeholder="Например: ООО 'Ромашка'"
              :class="{ 'p-invalid': errors.name }"
            />
            <small v-if="errors.name" class="p-error">{{ errors.name }}</small>
          </div>

          <div class="field mb-4">
            <label for="orgType" class="font-semibold mb-2">Тип организации *</label>
            <Select
              id="orgType"
              v-model="organizationData.type"
              :options="organizationTypes"
              optionLabel="label"
              optionValue="value"
              placeholder="Выберите тип организации"
              :class="{ 'p-invalid': errors.type }"
            />
            <small v-if="errors.type" class="p-error">{{ errors.type }}</small>
          </div>

          <div class="field mb-4">
            <label for="orgDescription" class="font-semibold mb-2">Описание (необязательно)</label>
            <Textarea
              id="orgDescription"
              v-model="organizationData.description"
              rows="3"
              placeholder="Кратко опишите чем занимается ваша организация"
            />
          </div>

          <div class="field-checkbox mb-3">
            <Checkbox
              id="hasOrg"
              v-model="hasExistingOrganization"
              :binary="true"
            />
            <label for="hasOrg">У меня уже есть организация</label>
          </div>
        </div>

        <Message v-if="hasExistingOrganization" severity="info" :closable="false" class="mt-3">
          Отлично! Вы можете пропустить этот шаг и перейти к настройке готовых решений.
        </Message>
      </div>

      <!-- Step 2: Choose Ready Solution -->
      <div v-if="currentStep === 2" class="step-content">
        <h3 class="text-xl font-semibold mb-3">
          <i class="pi pi-box mr-2"></i>
          Выбор готового решения
        </h3>
        <p class="text-color-secondary mb-4">
          Выберите готовое решение или начните с пустой организации
        </p>

        <div class="solutions-grid">
          <Card
            v-for="solution in readySolutions"
            :key="solution.id"
            class="solution-card cursor-pointer"
            :class="{ selected: selectedSolution?.id === solution.id }"
            @click="selectSolution(solution)"
          >
            <template #content>
              <div class="flex flex-column align-items-center text-center gap-3">
                <div class="solution-icon">{{ solution.icon }}</div>
                <h4 class="font-semibold m-0">{{ solution.name }}</h4>
                <p class="text-sm text-color-secondary m-0">{{ solution.description }}</p>
                <div class="solution-tags">
                  <Tag v-for="tag in solution.tags" :key="tag" :value="tag" severity="info" class="mr-2" />
                </div>
                <i
                  v-if="selectedSolution?.id === solution.id"
                  class="pi pi-check-circle text-3xl text-primary mt-2"
                ></i>
              </div>
            </template>
          </Card>

          <Card
            class="solution-card cursor-pointer"
            :class="{ selected: selectedSolution?.id === 'empty' }"
            @click="selectSolution({ id: 'empty', name: 'Пустая организация' })"
          >
            <template #content>
              <div class="flex flex-column align-items-center text-center gap-3">
                <div class="solution-icon">✨</div>
                <h4 class="font-semibold m-0">Начать с нуля</h4>
                <p class="text-sm text-color-secondary m-0">Создайте организацию без готовых решений</p>
                <i
                  v-if="selectedSolution?.id === 'empty'"
                  class="pi pi-check-circle text-3xl text-primary mt-2"
                ></i>
              </div>
            </template>
          </Card>
        </div>
      </div>

      <!-- Step 3: Connect Data Sources -->
      <div v-if="currentStep === 3" class="step-content">
        <h3 class="text-xl font-semibold mb-3">
          <i class="pi pi-database mr-2"></i>
          Подключение источников данных
        </h3>
        <p class="text-color-secondary mb-4">
          Подключите источники данных для работы агентов (необязательно, можно настроить позже)
        </p>

        <div class="data-sources-grid">
          <Card
            v-for="source in dataSourceTypes"
            :key="source.id"
            class="data-source-card cursor-pointer"
            :class="{ selected: selectedDataSources.includes(source.id) }"
            @click="toggleDataSource(source.id)"
          >
            <template #content>
              <div class="flex align-items-center gap-3">
                <i :class="[source.icon, 'text-3xl', 'text-primary']"></i>
                <div class="flex-1">
                  <h4 class="font-semibold m-0 mb-2">{{ source.name }}</h4>
                  <p class="text-sm text-color-secondary m-0">{{ source.description }}</p>
                </div>
                <i
                  v-if="selectedDataSources.includes(source.id)"
                  class="pi pi-check-circle text-2xl text-primary"
                ></i>
              </div>
            </template>
          </Card>
        </div>

        <Message severity="info" :closable="false" class="mt-3">
          <i class="pi pi-info-circle mr-2"></i>
          Вы сможете добавить и настроить источники данных в любое время в разделе "Источники данных"
        </Message>
      </div>

      <!-- Step 4: Launch Agents -->
      <div v-if="currentStep === 4" class="step-content">
        <h3 class="text-xl font-semibold mb-3">
          <i class="pi pi-check-circle mr-2"></i>
          Запуск агентов
        </h3>
        <p class="text-color-secondary mb-4">
          Все готово! Вы можете запустить агентов сейчас или настроить их позже.
        </p>

        <Card class="summary-card">
          <template #content>
            <div class="flex flex-column gap-3">
              <div class="summary-item">
                <span class="font-semibold">Организация:</span>
                <span>{{ organizationData.name || 'Не указано' }}</span>
              </div>
              <div class="summary-item">
                <span class="font-semibold">Тип:</span>
                <span>{{ getOrganizationTypeLabel(organizationData.type) }}</span>
              </div>
              <div v-if="selectedSolution && selectedSolution.id !== 'empty'" class="summary-item">
                <span class="font-semibold">Готовое решение:</span>
                <span>{{ selectedSolution.name }}</span>
              </div>
              <div v-if="selectedDataSources.length > 0" class="summary-item">
                <span class="font-semibold">Источники данных:</span>
                <span>{{ selectedDataSources.length }} выбрано</span>
              </div>
            </div>
          </template>
        </Card>

        <div class="mt-4 p-4 surface-100 border-round">
          <h4 class="font-semibold mb-3">
            <i class="pi pi-lightbulb mr-2 text-primary"></i>
            Следующие шаги:
          </h4>
          <ul class="list-none p-0 m-0">
            <li class="flex align-items-start gap-2 mb-2">
              <i class="pi pi-check text-primary mt-1"></i>
              <span>Настройте агентов в разделе "Экземпляры агентов"</span>
            </li>
            <li class="flex align-items-start gap-2 mb-2">
              <i class="pi pi-check text-primary mt-1"></i>
              <span>Подключите дополнительные источники данных</span>
            </li>
            <li class="flex align-items-start gap-2 mb-2">
              <i class="pi pi-check text-primary mt-1"></i>
              <span>Пригласите членов команды</span>
            </li>
            <li class="flex align-items-start gap-2">
              <i class="pi pi-check text-primary mt-1"></i>
              <span>Настройте мониторинг и аналитику</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-content-between align-items-center w-full">
        <div>
          <Button
            v-if="currentStep > 1"
            label="Назад"
            icon="pi pi-arrow-left"
            text
            @click="previousStep"
          />
        </div>
        <div class="flex gap-2">
          <Button
            v-if="currentStep < 4"
            label="Пропустить"
            severity="secondary"
            text
            @click="skipOnboarding"
          />
          <Button
            v-if="currentStep < 4"
            label="Далее"
            icon="pi pi-arrow-right"
            iconPos="right"
            :disabled="!canProceed"
            @click="nextStep"
          />
          <Button
            v-else
            label="Завершить"
            icon="pi pi-check"
            @click="completeOnboarding"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboardingStore'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  canClose: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:visible', 'complete'])

const router = useRouter()
const onboardingStore = useOnboardingStore()

const showDialog = ref(props.visible)
const currentStep = ref(1)
const hasExistingOrganization = ref(false)

// Organization data
const organizationData = ref({
  name: '',
  type: '',
  description: ''
})

const errors = ref({
  name: '',
  type: ''
})

const organizationTypes = ref([
  { label: 'IT-компания', value: 'it-company' },
  { label: 'Малый бизнес', value: 'small-business' },
  { label: 'Телеком', value: 'telecom' },
  { label: 'E-commerce', value: 'ecommerce' },
  { label: 'Сельское хозяйство', value: 'agriculture' },
  { label: 'HR и рекрутинг', value: 'hr' },
  { label: 'Другое', value: 'other' }
])

const readySolutions = ref([
  {
    id: 'it-companies',
    name: 'Для IT-компаний',
    icon: '💻',
    description: 'Замените аутстафф на цифровую команду',
    tags: ['Поддержка', 'Проекты', 'Тестирование']
  },
  {
    id: 'micro-business',
    name: 'Для малого бизнеса',
    icon: '🏪',
    description: 'Первый сотрудник за 1/10 зарплаты',
    tags: ['Заказы 24/7', 'Запись', 'Консультации']
  },
  {
    id: 'telecom',
    name: 'Для телеком',
    icon: '📞',
    description: 'Автоматизация массовых операций',
    tags: ['Тарифы', 'Заявки', 'Техподдержка']
  },
  {
    id: 'hr',
    name: 'HR и рекрутинг',
    icon: '👥',
    description: 'Автоматизация найма',
    tags: ['Резюме', 'Собеседования', 'Онбординг']
  }
])

const selectedSolution = ref(null)

const dataSourceTypes = ref([
  {
    id: 'api',
    name: 'REST API',
    description: 'Подключение к внешним API',
    icon: 'pi pi-cloud'
  },
  {
    id: 'database',
    name: 'База данных',
    description: 'Подключение к SQL/NoSQL базам',
    icon: 'pi pi-database'
  },
  {
    id: 'files',
    name: 'Файлы',
    description: 'Загрузка и обработка файлов',
    icon: 'pi pi-file'
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Получение событий от внешних систем',
    icon: 'pi pi-send'
  }
])

const selectedDataSources = ref([])

// Computed
const canProceed = computed(() => {
  if (currentStep.value === 1) {
    if (hasExistingOrganization.value) return true
    return organizationData.value.name.trim() !== '' && organizationData.value.type !== ''
  }
  if (currentStep.value === 2) {
    return selectedSolution.value !== null
  }
  return true
})

// Methods
function validateStep1() {
  errors.value = { name: '', type: '' }

  if (hasExistingOrganization.value) return true

  let isValid = true

  if (organizationData.value.name.trim() === '') {
    errors.value.name = 'Название организации обязательно'
    isValid = false
  }

  if (organizationData.value.type === '') {
    errors.value.type = 'Выберите тип организации'
    isValid = false
  }

  return isValid
}

function nextStep() {
  if (currentStep.value === 1 && !validateStep1()) {
    return
  }

  if (currentStep.value < 4) {
    currentStep.value++
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

function selectSolution(solution) {
  selectedSolution.value = solution
}

function toggleDataSource(sourceId) {
  const index = selectedDataSources.value.indexOf(sourceId)
  if (index > -1) {
    selectedDataSources.value.splice(index, 1)
  } else {
    selectedDataSources.value.push(sourceId)
  }
}

function getOrganizationTypeLabel(value) {
  const type = organizationTypes.value.find(t => t.value === value)
  return type ? type.label : 'Не указано'
}

function skipOnboarding() {
  onboardingStore.trackFeatureInteraction('organization_onboarding_skipped')
  emit('update:visible', false)
  router.push('/organization')
}

function completeOnboarding() {
  onboardingStore.trackFeatureInteraction('organization_onboarding_completed')

  // Save organization data to localStorage or backend
  const onboardingResult = {
    organization: organizationData.value,
    solution: selectedSolution.value,
    dataSources: selectedDataSources.value,
    hasExistingOrg: hasExistingOrganization.value
  }

  localStorage.setItem('organization_onboarding', JSON.stringify(onboardingResult))

  emit('complete', onboardingResult)
  emit('update:visible', false)

  // Navigate to organization page
  router.push('/organization')
}

onMounted(() => {
  // Check if onboarding was already completed
  const savedOnboarding = localStorage.getItem('organization_onboarding')
  if (savedOnboarding) {
    const data = JSON.parse(savedOnboarding)
    organizationData.value = data.organization || organizationData.value
    selectedSolution.value = data.solution
    selectedDataSources.value = data.dataSources || []
  }
})
</script>

<style scoped>
.step-indicator {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background-color: var(--surface-300);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  position: relative;
}

.step-indicator.active {
  background-color: var(--primary-color);
  color: white;
}

.step-indicator.completed {
  background-color: var(--green-500);
  color: white;
}

.step-number {
  font-weight: 600;
  font-size: 1.25rem;
}

.step-content {
  min-height: 450px;
}

.solutions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.solution-card {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.solution-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.solution-card.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-50);
}

.solution-icon {
  font-size: 3rem;
}

.solution-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.data-sources-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.data-source-card {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
  cursor: pointer;
}

.data-source-card:hover {
  border-color: var(--primary-color);
  background-color: var(--surface-50);
}

.data-source-card.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-50);
}

.summary-card {
  border: 2px solid var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--surface-border);
}

.summary-item:last-child {
  border-bottom: none;
}
</style>
