<template>
  <Dialog
    v-model:visible="showDialog"
    :modal="true"
    :closable="false"
    :draggable="false"
    :style="{ width: '50rem' }"
    :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
  >
    <template #header>
      <div class="flex align-items-center gap-2">
        <i class="pi pi-heart-fill text-4xl text-primary"></i>
        <span class="font-bold text-2xl">Добро пожаловать в Integram!</span>
      </div>
    </template>

    <div class="flex flex-column gap-4 py-4">
      <!-- Welcome Message -->
      <div class="text-center mb-3">
        <h2 class="text-3xl font-bold mb-3">Мы рады видеть вас!</h2>
        <p class="text-lg text-color-secondary">
          Integram - это мощная платформа для управления дронами, агентами и бизнес-процессами.
          Давайте настроим вашу рабочую среду.
        </p>
      </div>

      <!-- Step Indicator -->
      <div class="flex justify-content-center gap-2 mb-4">
        <div
          v-for="n in 3"
          :key="n"
          class="step-indicator"
          :class="{ active: currentLocalStep >= n }"
        />
      </div>

      <!-- Step 1: Introduction -->
      <div v-if="currentLocalStep === 1" class="step-content">
        <h3 class="text-xl font-semibold mb-3">Что вы можете делать с Integram?</h3>
        <div class="grid">
          <div class="col-12 md:col-6 mb-3">
            <Card class="feature-card h-full">
              <template #content>
                <div class="flex flex-column align-items-center text-center gap-2">
                  <i class="pi pi-users text-4xl text-primary"></i>
                  <h4 class="font-semibold">Управление агентами</h4>
                  <p class="text-sm text-color-secondary">
                    Создавайте и управляйте AI-агентами для автоматизации задач
                  </p>
                </div>
              </template>
            </Card>
          </div>
          <div class="col-12 md:col-6 mb-3">
            <Card class="feature-card h-full">
              <template #content>
                <div class="flex flex-column align-items-center text-center gap-2">
                  <i class="pi pi-sitemap text-4xl text-primary"></i>
                  <h4 class="font-semibold">Рабочие процессы</h4>
                  <p class="text-sm text-color-secondary">
                    Проектируйте сложные бизнес-процессы визуально
                  </p>
                </div>
              </template>
            </Card>
          </div>
          <div class="col-12 md:col-6 mb-3">
            <Card class="feature-card h-full">
              <template #content>
                <div class="flex flex-column align-items-center text-center gap-2">
                  <i class="pi pi-chart-line text-4xl text-primary"></i>
                  <h4 class="font-semibold">Аналитика</h4>
                  <p class="text-sm text-color-secondary">
                    Отслеживайте метрики и анализируйте производительность
                  </p>
                </div>
              </template>
            </Card>
          </div>
          <div class="col-12 md:col-6 mb-3">
            <Card class="feature-card h-full">
              <template #content>
                <div class="flex flex-column align-items-center text-center gap-2">
                  <i class="pi pi-cloud text-4xl text-primary"></i>
                  <h4 class="font-semibold">Интеграции</h4>
                  <p class="text-sm text-color-secondary">
                    Подключайте внешние сервисы и API
                  </p>
                </div>
              </template>
            </Card>
          </div>
        </div>
      </div>

      <!-- Step 2: Role Selection -->
      <div v-if="currentLocalStep === 2" class="step-content">
        <h3 class="text-xl font-semibold mb-3">Выберите вашу роль</h3>
        <p class="text-color-secondary mb-4">
          Это поможет нам настроить интерфейс под ваши нужды
        </p>
        <div class="grid">
          <div
            v-for="role in roles"
            :key="role.id"
            class="col-12 md:col-6 mb-3"
            @click="selectRole(role.id)"
          >
            <Card
              class="role-card cursor-pointer h-full"
              :class="{ selected: selectedRoleId === role.id }"
            >
              <template #content>
                <div class="flex align-items-start gap-3">
                  <i :class="[role.icon, 'text-3xl', 'text-primary']"></i>
                  <div class="flex-1">
                    <h4 class="font-semibold mb-2">{{ role.name }}</h4>
                    <p class="text-sm text-color-secondary">{{ role.description }}</p>
                  </div>
                  <i
                    v-if="selectedRoleId === role.id"
                    class="pi pi-check-circle text-2xl text-primary"
                  ></i>
                </div>
              </template>
            </Card>
          </div>
        </div>
      </div>

      <!-- Step 3: Use Case Selection -->
      <div v-if="currentLocalStep === 3" class="step-content">
        <h3 class="text-xl font-semibold mb-3">Что вы планируете делать?</h3>
        <p class="text-color-secondary mb-4">
          Выберите основной сценарий использования
        </p>
        <div class="flex flex-column gap-3">
          <div
            v-for="useCase in useCases"
            :key="useCase.id"
            class="use-case-item cursor-pointer p-3 border-round"
            :class="{ selected: selectedUseCaseId === useCase.id }"
            @click="selectUseCase(useCase.id)"
          >
            <div class="flex align-items-center gap-3">
              <i :class="[useCase.icon, 'text-2xl', 'text-primary']"></i>
              <div class="flex-1">
                <div class="font-semibold">{{ useCase.name }}</div>
                <div class="text-sm text-color-secondary">{{ useCase.description }}</div>
              </div>
              <i
                v-if="selectedUseCaseId === useCase.id"
                class="pi pi-check-circle text-2xl text-primary"
              ></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-content-between align-items-center w-full">
        <div>
          <Button
            v-if="currentLocalStep > 1"
            label="Назад"
            icon="pi pi-arrow-left"
            text
            @click="previousStep"
          />
        </div>
        <div class="flex gap-2">
          <Button
            label="Пропустить"
            severity="secondary"
            text
            @click="skipWelcome"
          />
          <Button
            v-if="currentLocalStep < 3"
            label="Далее"
            icon="pi pi-arrow-right"
            iconPos="right"
            @click="nextStep"
          />
          <Button
            v-else
            label="Начать"
            icon="pi pi-check"
            :disabled="!selectedRoleId || !selectedUseCaseId"
            @click="completeWelcome"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboardingStore'

const router = useRouter()
const onboardingStore = useOnboardingStore()

const showDialog = ref(true)
const currentLocalStep = ref(1)
const selectedRoleId = ref(null)
const selectedUseCaseId = ref(null)

const roles = ref([
  {
    id: 'developer',
    name: 'Разработчик',
    description: 'Создаю и интегрирую решения на базе AI',
    icon: 'pi pi-code',
  },
  {
    id: 'manager',
    name: 'Менеджер проекта',
    description: 'Управляю командой и процессами',
    icon: 'pi pi-users',
  },
  {
    id: 'analyst',
    name: 'Аналитик',
    description: 'Работаю с данными и аналитикой',
    icon: 'pi pi-chart-bar',
  },
  {
    id: 'operator',
    name: 'Оператор',
    description: 'Управляю дронами и оборудованием',
    icon: 'pi pi-cog',
  },
])

const useCases = ref([
  {
    id: 'automation',
    name: 'Автоматизация бизнес-процессов',
    description: 'Создание AI-агентов для автоматизации рутинных задач',
    icon: 'pi pi-sync',
  },
  {
    id: 'drone_management',
    name: 'Управление дронами',
    description: 'Координация полетов и мониторинг оборудования',
    icon: 'pi pi-send',
  },
  {
    id: 'analytics',
    name: 'Аналитика и отчетность',
    description: 'Сбор, анализ и визуализация данных',
    icon: 'pi pi-chart-line',
  },
  {
    id: 'agriculture',
    name: 'Сельское хозяйство',
    description: 'Управление полями и агро-операциями',
    icon: 'pi pi-sun',
  },
  {
    id: 'integration',
    name: 'Интеграция систем',
    description: 'Подключение и синхронизация различных систем',
    icon: 'pi pi-link',
  },
])

const selectRole = (roleId) => {
  selectedRoleId.value = roleId
}

const selectUseCase = (useCaseId) => {
  selectedUseCaseId.value = useCaseId
}

const nextStep = () => {
  if (currentLocalStep.value < 3) {
    currentLocalStep.value++
  }
}

const previousStep = () => {
  if (currentLocalStep.value > 1) {
    currentLocalStep.value--
  }
}

const skipWelcome = () => {
  onboardingStore.markWelcomeSeen()
  showDialog.value = false
  router.push('/dashboard')
}

const completeWelcome = () => {
  if (selectedRoleId.value && selectedUseCaseId.value) {
    onboardingStore.setUserRole(selectedRoleId.value, selectedUseCaseId.value)
    onboardingStore.markWelcomeSeen()
    showDialog.value = false

    // Start the product tour
    router.push('/dashboard?startTour=true')
  }
}

onMounted(() => {
  // Initialize onboarding store
  onboardingStore.initFromLocalStorage()

  // Check if welcome has already been seen
  if (onboardingStore.hasSeenWelcome) {
    showDialog.value = false
  }
})
</script>

<style scoped>
.step-indicator {
  width: 40px;
  height: 4px;
  background-color: var(--surface-300);
  border-radius: 2px;
  transition: background-color 0.3s ease;
}

.step-indicator.active {
  background-color: var(--primary-color);
}

.feature-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--surface-border);
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.role-card {
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.role-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.role-card.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-50);
}

.use-case-item {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.use-case-item:hover {
  border-color: var(--primary-color);
  background-color: var(--surface-50);
}

.use-case-item.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-50);
}

.step-content {
  min-height: 400px;
}
</style>
