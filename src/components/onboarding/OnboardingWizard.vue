<template>
  <Dialog
    v-model:visible="showDialog"
    :modal="true"
    :closable="false"
    :draggable="false"
    :style="{ width: '60rem' }"
    :breakpoints="{ '1199px': '80vw', '575px': '95vw' }"
    class="onboarding-wizard"
  >
    <template #header>
      <div class="flex align-items-center gap-3 w-full">
        <i class="pi pi-sparkles text-4xl text-primary"></i>
        <div class="flex-1">
          <span class="font-bold text-2xl">{{ currentStepData.title }}</span>
          <p class="text-sm text-color-secondary mt-1 mb-0">{{ currentStepData.subtitle }}</p>
        </div>
      </div>
    </template>

    <!-- Step Progress Indicator -->
    <div class="flex justify-content-center gap-2 mb-5">
      <div
        v-for="n in totalSteps"
        :key="n"
        class="step-indicator"
        :class="{ active: currentStep >= n, current: currentStep === n }"
      />
    </div>

    <!-- Step 1: Welcome & Gift Tokens -->
    <div v-if="currentStep === 1" class="step-content">
      <div class="text-center mb-4">
        <div class="gift-icon mb-3">🎁</div>
        <h2 class="text-3xl font-bold text-primary mb-3">Поздравляем с регистрацией!</h2>
        <p class="text-xl mb-4">
          Вы получили <strong class="text-primary">1 000 000 токенов</strong> для работы с AI моделями
        </p>
      </div>

      <Card class="token-gift-card mb-4">
        <template #content>
          <div class="flex align-items-center gap-4">
            <i class="pi pi-gift text-6xl text-primary"></i>
            <div class="flex-1">
              <h3 class="text-2xl font-semibold mb-2">Подарочные токены</h3>
              <p class="text-color-secondary mb-3">
                Этого достаточно для:
              </p>
              <ul class="token-usage-list">
                <li>✅ Создания и тестирования 10+ агентов</li>
                <li>✅ Обработки тысяч запросов</li>
                <li>✅ Полноценного тестирования платформы</li>
                <li>✅ Работы с различными AI моделями</li>
              </ul>
            </div>
          </div>
        </template>
      </Card>

      <div class="info-boxes grid">
        <div class="col-12 md:col-6">
          <Card class="info-card h-full">
            <template #content>
              <i class="pi pi-clock text-3xl text-blue-500 mb-2"></i>
              <h4 class="font-semibold mb-2">Быстрый старт</h4>
              <p class="text-sm text-color-secondary">
                Пройдите краткий тур и создайте первого агента за 5 минут
              </p>
            </template>
          </Card>
        </div>
        <div class="col-12 md:col-6">
          <Card class="info-card h-full">
            <template #content>
              <i class="pi pi-shield text-3xl text-green-500 mb-2"></i>
              <h4 class="font-semibold mb-2">Без рисков</h4>
              <p class="text-sm text-color-secondary">
                Тестируйте бесплатно, докупайте токены только при необходимости
              </p>
            </template>
          </Card>
        </div>
      </div>
    </div>

    <!-- Step 2: Platform Overview -->
    <div v-if="currentStep === 2" class="step-content">
      <h3 class="text-2xl font-semibold mb-4 text-center">Что вы можете делать на платформе?</h3>

      <div class="grid">
        <div
          v-for="feature in platformFeatures"
          :key="feature.id"
          class="col-12 md:col-6 mb-3"
        >
          <Card class="feature-card h-full cursor-pointer" @click="selectFeature(feature.id)">
            <template #content>
              <div class="flex flex-column align-items-center text-center gap-3">
                <div class="feature-icon">{{ feature.icon }}</div>
                <h4 class="font-semibold text-lg">{{ feature.title }}</h4>
                <p class="text-sm text-color-secondary">{{ feature.description }}</p>
                <div class="feature-badge">{{ feature.badge }}</div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </div>

    <!-- Step 3: Ready Solutions Catalog -->
    <div v-if="currentStep === 3" class="step-content">
      <h3 class="text-2xl font-semibold mb-3 text-center">Выберите готовое решение</h3>
      <p class="text-center text-color-secondary mb-4">
        Мы подготовили готовые пакеты агентов для быстрого старта
      </p>

      <div class="solutions-grid">
        <Card
          v-for="solution in readySolutions"
          :key="solution.id"
          class="solution-card cursor-pointer"
          :class="{ selected: selectedSolution === solution.id }"
          @click="selectSolution(solution.id)"
        >
          <template #content>
            <div class="solution-icon mb-3">{{ solution.icon }}</div>
            <h4 class="font-semibold mb-2">{{ solution.title }}</h4>
            <p class="text-sm text-color-secondary mb-3">{{ solution.description }}</p>
            <div class="solution-benefit">
              <span class="benefit-text">{{ solution.benefit }}</span>
            </div>
            <i
              v-if="selectedSolution === solution.id"
              class="pi pi-check-circle text-primary text-2xl mt-3"
            ></i>
          </template>
        </Card>
      </div>
    </div>

    <!-- Step 4: First Free Agent -->
    <div v-if="currentStep === 4" class="step-content">
      <div class="text-center mb-4">
        <div class="agent-icon mb-3">🤖</div>
        <h2 class="text-3xl font-bold mb-3">Получите первого агента БЕСПЛАТНО!</h2>
        <p class="text-xl text-color-secondary mb-4">
          Выберите одного из популярных агентов для ознакомления
        </p>
      </div>

      <div class="grid">
        <div
          v-for="agent in freeAgents"
          :key="agent.id"
          class="col-12 md:col-6 mb-3"
        >
          <Card
            class="agent-card cursor-pointer h-full"
            :class="{ selected: selectedAgent === agent.id }"
            @click="selectAgent(agent.id)"
          >
            <template #content>
              <div class="flex align-items-start gap-3">
                <div class="agent-avatar">{{ agent.icon }}</div>
                <div class="flex-1">
                  <h4 class="font-semibold mb-2">{{ agent.title }}</h4>
                  <p class="text-sm text-color-secondary mb-3">{{ agent.description }}</p>
                  <div class="agent-features">
                    <span
                      v-for="feature in agent.features"
                      :key="feature"
                      class="feature-tag"
                    >
                      {{ feature }}
                    </span>
                  </div>
                  <i
                    v-if="selectedAgent === agent.id"
                    class="pi pi-check-circle text-primary text-2xl mt-3"
                  ></i>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </div>

    <!-- Step 5: Tutorial Options -->
    <div v-if="currentStep === 5" class="step-content">
      <h3 class="text-2xl font-semibold mb-4 text-center">Как вы хотите начать?</h3>

      <div class="grid">
        <div class="col-12 md:col-6 mb-3">
          <Card
            class="tutorial-option-card cursor-pointer h-full"
            :class="{ selected: tutorialChoice === 'guided' }"
            @click="tutorialChoice = 'guided'"
          >
            <template #content>
              <div class="text-center">
                <i class="pi pi-compass text-6xl text-primary mb-3"></i>
                <h4 class="font-semibold text-xl mb-3">Пройти тур по платформе</h4>
                <p class="text-sm text-color-secondary mb-3">
                  Интерактивный тур поможет изучить основные возможности за 5 минут
                </p>
                <div class="tutorial-badge">Рекомендуется</div>
              </div>
            </template>
          </Card>
        </div>

        <div class="col-12 md:col-6 mb-3">
          <Card
            class="tutorial-option-card cursor-pointer h-full"
            :class="{ selected: tutorialChoice === 'skip' }"
            @click="tutorialChoice = 'skip'"
          >
            <template #content>
              <div class="text-center">
                <i class="pi pi-forward text-6xl text-color-secondary mb-3"></i>
                <h4 class="font-semibold text-xl mb-3">Начать самостоятельно</h4>
                <p class="text-sm text-color-secondary mb-3">
                  Пропустить тур и сразу перейти к работе с платформой
                </p>
                <div class="tutorial-badge-secondary">Для опытных</div>
              </div>
            </template>
          </Card>
        </div>
      </div>

      <Card class="help-card mt-4">
        <template #content>
          <div class="flex align-items-center gap-3">
            <i class="pi pi-info-circle text-3xl text-blue-500"></i>
            <div>
              <h4 class="font-semibold mb-1">Не волнуйтесь!</h4>
              <p class="text-sm text-color-secondary mb-0">
                Вы всегда можете вернуться к туру позже через меню "Справка" → "Пройти тур"
              </p>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Footer with Navigation -->
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

        <div class="flex align-items-center gap-2">
          <span class="text-sm text-color-secondary mr-2">
            Шаг {{ currentStep }} из {{ totalSteps }}
          </span>

          <Button
            label="Пропустить"
            severity="secondary"
            text
            @click="skipOnboarding"
          />

          <Button
            v-if="currentStep < totalSteps"
            label="Далее"
            icon="pi pi-arrow-right"
            iconPos="right"
            @click="nextStep"
            :disabled="!canProceed"
          />

          <Button
            v-else
            label="Начать работу"
            icon="pi pi-check"
            @click="completeOnboarding"
            :disabled="!tutorialChoice"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
/**
 * Onboarding Wizard Component
 *
 * Issue #4963: Comprehensive user onboarding flow with interactive wizard
 * Issue #4980: Fixed onboarding wizard not appearing for new users
 *
 * Triggers when:
 * - User logs in for the first time
 * - localStorage.getItem('onboarding_state').hasSeenWelcome is null or false
 * - User is redirected to /welcome route by router middleware
 * - User manually resets onboarding via developer mode
 *
 * Does NOT trigger when:
 * - User has completed onboarding before (hasSeenWelcome === true)
 * - User is on /auth/login or /auth/register routes
 * - User explicitly skipped or completed onboarding
 *
 * Redirect handling:
 * - Accepts ?redirect=<path> query parameter
 * - After onboarding completion, redirects to:
 *   1. User's chosen solution path (if selected)
 *   2. Agent constructor (if custom solution)
 *   3. Dashboard with tour (if guided tutorial selected)
 *   4. Original redirect URL (if provided)
 *   5. Dashboard (default fallback)
 *
 * Developer mode:
 * - Reset onboarding: localStorage.removeItem('onboarding_state'), then reload
 * - Toggle via Settings page or browser console
 */
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboardingStore'

const router = useRouter()
const route = useRoute()
const onboardingStore = useOnboardingStore()

const showDialog = ref(true)
const currentStep = ref(1)
const totalSteps = 5

const selectedFeature = ref(null)
const selectedSolution = ref(null)
const selectedAgent = ref(null)
const tutorialChoice = ref(null)

// Platform features data
const platformFeatures = ref([
  {
    id: 'agents',
    icon: '🤖',
    title: 'AI-агенты',
    description: 'Создавайте умных агентов для автоматизации задач',
    badge: 'Популярно'
  },
  {
    id: 'workflows',
    icon: '⚙️',
    title: 'Бизнес-процессы',
    description: 'Проектируйте сложные процессы визуально',
    badge: 'Мощно'
  },
  {
    id: 'analytics',
    icon: '📊',
    title: 'Аналитика',
    description: 'Отслеживайте метрики и производительность',
    badge: 'Инсайты'
  },
  {
    id: 'integrations',
    icon: '🔗',
    title: 'Интеграции',
    description: 'Подключайте внешние сервисы и API',
    badge: 'Расширяемо'
  }
])

// Ready solutions data
const readySolutions = ref([
  {
    id: 'it-companies',
    icon: '💻',
    title: 'Для IT-компаний',
    description: 'Поддержка клиентов, сбор требований, управление проектами',
    benefit: '-70% затрат на поддержку'
  },
  {
    id: 'micro-business',
    icon: '🏪',
    title: 'Для малого бизнеса',
    description: 'Прием заказов, запись клиентов, обработка возвратов',
    benefit: '150 000₽ экономии/мес'
  },
  {
    id: 'telecom',
    icon: '📞',
    title: 'Для телеком',
    description: 'Консультации по тарифам, обработка заявок, техподдержка',
    benefit: '-60% звонков'
  },
  {
    id: 'custom',
    icon: '🛠️',
    title: 'Собрать с нуля',
    description: 'Создайте собственное решение под вашу задачу',
    benefit: 'Полная гибкость'
  }
])

// Free agents for trial
const freeAgents = ref([
  {
    id: 'support-agent',
    icon: '💬',
    title: 'Агент поддержки 24/7',
    description: 'Отвечает на типовые вопросы клиентов круглосуточно',
    features: ['Чат', 'FAQ', 'Эскалация']
  },
  {
    id: 'lead-qualifier',
    icon: '🎯',
    title: 'Квалификация лидов',
    description: 'Оценивает потенциал клиентов с помощью AI',
    features: ['Скоринг', 'CRM', 'Автоматизация']
  },
  {
    id: 'appointment-bot',
    icon: '📅',
    title: 'Бот записи на встречи',
    description: 'Планирует консультации и встречи автоматически',
    features: ['Календарь', 'Напоминания', 'Синхронизация']
  },
  {
    id: 'analytics-agent',
    icon: '📈',
    title: 'Аналитический агент',
    description: 'Собирает и анализирует данные из разных источников',
    features: ['Дашборды', 'Отчеты', 'Инсайты']
  }
])

// Current step data
const currentStepData = computed(() => {
  const steps = [
    { title: 'Добро пожаловать!', subtitle: 'Начните работу с DronDoc' },
    { title: 'Обзор возможностей', subtitle: 'Узнайте, что умеет платформа' },
    { title: 'Готовые решения', subtitle: 'Выберите подходящий пакет агентов' },
    { title: 'Первый бесплатный агент', subtitle: 'Получите агента для ознакомления' },
    { title: 'Способ обучения', subtitle: 'Выберите, как начать работу' }
  ]
  return steps[currentStep.value - 1] || steps[0]
})

// Can proceed to next step
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return true
    case 2:
      return true // Optional selection
    case 3:
      return selectedSolution.value !== null
    case 4:
      return selectedAgent.value !== null
    case 5:
      return tutorialChoice.value !== null
    default:
      return true
  }
})

// Functions
function selectFeature(featureId) {
  selectedFeature.value = featureId
  onboardingStore.trackFeatureInteraction(`feature_viewed_${featureId}`)
}

function selectSolution(solutionId) {
  selectedSolution.value = solutionId
  onboardingStore.trackFeatureInteraction(`solution_selected_${solutionId}`)
}

function selectAgent(agentId) {
  selectedAgent.value = agentId
  onboardingStore.trackFeatureInteraction(`agent_selected_${agentId}`)
}

function nextStep() {
  if (canProceed.value && currentStep.value < totalSteps) {
    currentStep.value++
    onboardingStore.trackFeatureInteraction(`onboarding_step_${currentStep.value}_viewed`)
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

function skipOnboarding() {
  onboardingStore.markWelcomeSeen()
  onboardingStore.trackFeatureInteraction('onboarding_skipped')
  showDialog.value = false

  // Redirect to original destination if provided, otherwise go to dashboard
  const redirectUrl = route.query.redirect || '/dashboard'
  router.push(redirectUrl)
}

function completeOnboarding() {
  onboardingStore.markWelcomeSeen()
  onboardingStore.trackFeatureInteraction('onboarding_completed')

  // Store selected preferences
  if (selectedSolution.value) {
    localStorage.setItem('preferred_solution', selectedSolution.value)
  }
  if (selectedAgent.value) {
    localStorage.setItem('selected_trial_agent', selectedAgent.value)
  }

  showDialog.value = false

  // Determine where to redirect based on user choices and original destination
  let targetUrl = route.query.redirect || '/dashboard'

  // Route based on tutorial choice
  if (tutorialChoice.value === 'guided') {
    // Start interactive tour on dashboard
    targetUrl = '/dashboard?startTour=true'
  } else if (selectedSolution.value === 'custom') {
    // User wants to build from scratch
    targetUrl = '/agents/constructor'
  } else if (selectedSolution.value && selectedSolution.value !== 'custom') {
    // User selected a specific solution
    targetUrl = `/organization/ready-solutions?solution=${selectedSolution.value}`
  }
  // Otherwise, use the redirect URL or default to dashboard

  router.push(targetUrl)
}
</script>

<style scoped>
.onboarding-wizard :deep(.p-dialog-header) {
  padding: 2rem;
  border-bottom: 1px solid var(--surface-border);
}

.onboarding-wizard :deep(.p-dialog-content) {
  padding: 2rem;
}

.onboarding-wizard :deep(.p-dialog-footer) {
  padding: 1.5rem 2rem;
  border-top: 1px solid var(--surface-border);
}

.step-indicator {
  width: 50px;
  height: 5px;
  background-color: var(--surface-300);
  border-radius: 3px;
  transition: all 0.3s ease;
}

.step-indicator.active {
  background-color: var(--primary-color);
}

.step-indicator.current {
  background-color: var(--primary-color);
  transform: scaleY(1.4);
}

.step-content {
  min-height: 450px;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.gift-icon {
  font-size: 5rem;
}

.token-gift-card {
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
  border: 2px solid var(--primary-200);
}

.token-usage-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.token-usage-list li {
  padding: 0.5rem 0;
  font-size: 1rem;
}

.info-card {
  text-align: center;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
}

.info-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.feature-card {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.feature-icon {
  font-size: 3.5rem;
}

.feature-badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.solutions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.solution-card {
  text-align: center;
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.solution-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.solution-card.selected {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.solution-icon {
  font-size: 3.5rem;
}

.solution-benefit {
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: var(--green-100);
  color: var(--green-700);
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
}

.agent-icon {
  font-size: 5rem;
}

.agent-card {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.agent-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.agent-card.selected {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.agent-avatar {
  font-size: 3rem;
  flex-shrink: 0;
}

.agent-features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.feature-tag {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: var(--surface-100);
  color: var(--text-color);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.tutorial-option-card {
  transition: all 0.2s ease;
  border: 2px solid var(--surface-border);
}

.tutorial-option-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.tutorial-option-card.selected {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.tutorial-badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.tutorial-badge-secondary {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: var(--surface-200);
  color: var(--text-color);
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.help-card {
  background: var(--blue-50);
  border: 1px solid var(--blue-200);
}

/* Responsive */
@media (max-width: 768px) {
  .solutions-grid {
    grid-template-columns: 1fr;
  }

  .step-content {
    min-height: 400px;
  }

  .gift-icon,
  .agent-icon {
    font-size: 4rem;
  }
}
</style>
