<template>
  <div class="welcome-page">
    <!-- Onboarding Wizard for NEW users (comprehensive flow) -->
    <OnboardingWizard v-if="!hasSeenWelcome" />

    <!-- Welcome Screen Modal (alternative, legacy) -->
    <!-- <WelcomeScreen v-if="!hasSeenWelcome" /> -->

    <!-- Main Welcome Content -->
    <div class="editor-container">
      <!-- 1. Welcome Section -->
      <div class="editor-title">
        <h1 contenteditable="false" class="title-editable">
          👋 Добро пожаловать в Integram!
        </h1>
      </div>

      <div class="editor-subtitle">
        <p contenteditable="false" class="value-proposition">
          ИНТЕГРАМ — это безопасное и удобное управление данными.
        </p>
        <p contenteditable="false" class="value-subtext">
          Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам.
        </p>
        <p contenteditable="false" class="value-tagline">
          100% ваши данные. Ваши серверы. Ваш контроль.
        </p>
      </div>

      <div class="editor-divider"></div>

      <!-- 2. Learning & Tutorials Section -->
      <div class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">🎓</span>
          Обучение и быстрый старт
        </h2>
        <p class="section-subtitle">Освойте Integram за 7 дней с нашими интерактивными уроками</p>
      </div>

      <div class="lessons-container">
        <Card class="lesson-card featured-lesson">
          <template #content>
            <div class="lesson-badge">Новичкам</div>
            <div class="lesson-icon">🚀</div>
            <h3 class="lesson-title">Быстрый старт - 15 минут</h3>
            <p class="lesson-description">
              Создайте свою первую базу данных и научитесь основам работы с Integram
            </p>
            <div class="lesson-steps">
              <div class="lesson-step">✓ Создание базы данных</div>
              <div class="lesson-step">✓ Первая таблица и данные</div>
              <div class="lesson-step">✓ Простой запрос</div>
            </div>
            <Button
              label="Начать быстрый старт"
              icon="pi pi-play"
              class="p-button-lg w-full mt-3"
              @click="startQuickTutorial"
            />
          </template>
        </Card>

        <Card class="lesson-card">
          <template #content>
            <div class="lesson-badge">7 дней</div>
            <div class="lesson-icon">📚</div>
            <h3 class="lesson-title">Полный курс обучения</h3>
            <p class="lesson-description">
              Пройдите 7-дневный курс и станьте профессионалом в работе с Integram
            </p>
            <div class="lesson-progress">
              <div class="progress-info">
                <span>День 1: Основы</span>
                <span class="progress-badge">Доступно</span>
              </div>
              <div class="progress-info">
                <span>День 2: Структура данных</span>
                <span class="progress-badge locked">Заблокировано</span>
              </div>
              <div class="progress-info">
                <span>День 3: Запросы и отчёты</span>
                <span class="progress-badge locked">Заблокировано</span>
              </div>
            </div>
            <Button
              label="Начать курс"
              icon="pi pi-book"
              class="p-button-lg p-button-outlined w-full mt-3"
              @click="startFullCourse"
            />
          </template>
        </Card>

        <Card class="lesson-card">
          <template #content>
            <div class="lesson-badge">Интерактивно</div>
            <div class="lesson-icon">🎯</div>
            <h3 class="lesson-title">Видео-уроки</h3>
            <p class="lesson-description">
              Смотрите короткие видео-уроки по работе с ключевыми функциями платформы
            </p>
            <div class="video-list">
              <div class="video-item">
                <i class="pi pi-play-circle"></i>
                <span>Создание таблиц (5:30)</span>
              </div>
              <div class="video-item">
                <i class="pi pi-play-circle"></i>
                <span>Работа с SQL (7:15)</span>
              </div>
              <div class="video-item">
                <i class="pi pi-play-circle"></i>
                <span>Отчёты и формы (6:45)</span>
              </div>
            </div>
            <Button
              label="Смотреть уроки"
              icon="pi pi-video"
              class="p-button-lg p-button-outlined w-full mt-3"
              @click="openVideoLessons"
            />
          </template>
        </Card>
      </div>

      <div class="editor-divider"></div>

      <!-- 3. Invite Friends & Create Databases Section -->
      <div class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">🤝</span>
          Растите вместе с друзьями
        </h2>
        <p class="section-subtitle">Пригласите коллег и создавайте новые базы данных для разных проектов</p>
      </div>

      <div class="collaboration-grid">
        <Card class="collaboration-card invite-card">
          <template #content>
            <div class="collab-icon">👥</div>
            <h3>Пригласить друзей</h3>
            <p class="collab-description">
              Работайте над проектами вместе с командой. Приглашайте коллег и делитесь базами данных.
            </p>
            <div class="invite-benefits">
              <div class="benefit-item">
                <i class="pi pi-check-circle"></i>
                <span>Совместная работа над проектами</span>
              </div>
              <div class="benefit-item">
                <i class="pi pi-check-circle"></i>
                <span>Распределение ролей и прав доступа</span>
              </div>
              <div class="benefit-item">
                <i class="pi pi-check-circle"></i>
                <span>Общие базы знаний</span>
              </div>
            </div>
            <Button
              label="Пригласить друзей"
              icon="pi pi-users"
              class="p-button-lg p-button-success w-full mt-3"
              @click="inviteFriends"
            />
          </template>
        </Card>

        <Card class="collaboration-card database-card">
          <template #content>
            <div class="collab-icon">🗄️</div>
            <h3>Создать новую базу данных</h3>
            <p class="collab-description">
              Бесплатный тариф позволяет создать до 3 баз данных. Каждая для своего проекта или команды.
            </p>
            <div class="database-stats">
              <div class="stat-box">
                <div class="stat-number">0/3</div>
                <div class="stat-label">Созданных БД</div>
              </div>
              <div class="stat-box">
                <div class="stat-number">500M</div>
                <div class="stat-label">Записей на БД</div>
              </div>
            </div>
            <Button
              label="Создать базу данных"
              icon="pi pi-database"
              class="p-button-lg p-button-primary w-full mt-3"
              @click="createNewDatabase"
            />
          </template>
        </Card>
      </div>

      <div class="editor-divider"></div>

      <!-- 4. Ready Solutions Section -->
      <div class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">💼</span>
          Готовые решения для вашего бизнеса
        </h2>
        <p class="section-subtitle">Выберите решение под вашу задачу — настройка за 1 день</p>
      </div>

      <div class="solutions-single-row">
        <!-- IT Companies Solution -->
        <Card
          class="solution-card premium"
          @click="navigateToSolution('it-companies')"
        >
          <template #header>
            <div class="solution-badge">🥇 Хит продаж</div>
          </template>
          <template #content>
            <div class="solution-icon">💻</div>
            <h3 class="solution-title">Для IT-компаний</h3>
            <p class="solution-description">
              Замените аутстафф на цифровую команду. Первичная поддержка, сбор требований, управление проектами.
            </p>
            <div class="solution-features">
              <div class="feature-item">✓ Первичная поддержка клиентов</div>
              <div class="feature-item">✓ Сбор требований к проектам</div>
              <div class="feature-item">✓ Управление проектами</div>
              <div class="feature-item">✓ Автоматизация тестирования</div>
            </div>
            <div class="solution-stats">
              <div class="stat-item">
                <strong>-70%</strong>
                <span>затрат на поддержку</span>
              </div>
              <div class="stat-item">
                <strong>24/7</strong>
                <span>без выходных</span>
              </div>
            </div>
            <Button
              label="Подключить решение"
              icon="pi pi-arrow-right"
              class="p-button-lg w-full mt-3"
              @click.stop="navigateToSolution('it-companies')"
            />
          </template>
        </Card>

        <!-- Micro Business Solution -->
        <Card
          class="solution-card"
          @click="navigateToSolution('micro-business')"
        >
          <template #header>
            <div class="solution-badge">🥈 Популярно</div>
          </template>
          <template #content>
            <div class="solution-icon">🏪</div>
            <h3 class="solution-title">Для малого бизнеса</h3>
            <p class="solution-description">
              Первый сотрудник за 1/10 зарплаты. Прием заказов, запись клиентов, поддержка.
            </p>
            <div class="solution-features">
              <div class="feature-item">✓ Прием заказов 24/7</div>
              <div class="feature-item">✓ Запись на консультации</div>
              <div class="feature-item">✓ Обработка возвратов</div>
              <div class="feature-item">✓ Расчет стоимости услуг</div>
            </div>
            <div class="solution-stats">
              <div class="stat-item">
                <strong>150 000₽</strong>
                <span>экономия в месяц</span>
              </div>
              <div class="stat-item">
                <strong>100%</strong>
                <span>ответов клиентам</span>
              </div>
            </div>
            <Button
              label="Подключить решение"
              icon="pi pi-arrow-right"
              class="p-button-lg p-button-outlined w-full mt-3"
              @click.stop="navigateToSolution('micro-business')"
            />
          </template>
        </Card>

        <!-- Telecom Solution -->
        <Card
          class="solution-card"
          @click="navigateToSolution('telecom')"
        >
          <template #header>
            <div class="solution-badge">🥉 Enterprise</div>
          </template>
          <template #content>
            <div class="solution-icon">📞</div>
            <h3 class="solution-title">Для телеком</h3>
            <p class="solution-description">
              Масштабируемая система для автоматизации массовых операций с клиентами.
            </p>
            <div class="solution-features">
              <div class="feature-item">✓ Консультации по тарифам</div>
              <div class="feature-item">✓ Обработка заявок на подключение</div>
              <div class="feature-item">✓ Техническая поддержка</div>
              <div class="feature-item">✓ Снижение нагрузки на колл-центр</div>
            </div>
            <div class="solution-stats">
              <div class="stat-item">
                <strong>-60%</strong>
                <span>звонков в колл-центр</span>
              </div>
              <div class="stat-item">
                <strong>+25%</strong>
                <span>конверсия в продажи</span>
              </div>
            </div>
            <Button
              label="Подключить решение"
              icon="pi pi-arrow-right"
              class="p-button-lg p-button-outlined w-full mt-3"
              @click.stop="navigateToSolution('telecom')"
            />
          </template>
        </Card>
      </div>

      <div class="editor-divider"></div>

      <!-- 4. Learning Resources -->
      <div class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">📚</span>
          Полезные ресурсы
        </h2>
        <p class="section-subtitle">Всё, что нужно для быстрого старта</p>
      </div>

      <div class="resources-container">
        <!-- Video Tours -->
        <div class="resource-section">
          <h3>📹 Видео-туры</h3>
          <div class="video-grid">
            <Card
              v-for="video in videos"
              :key="video.id"
              class="video-card"
              @click="playVideo(video)"
            >
              <template #header>
                <img :src="video.thumbnail" :alt="video.title" class="video-thumbnail" />
                <div class="play-overlay">
                  <i class="pi pi-play-circle"></i>
                </div>
              </template>
              <template #content>
                <h4>{{ video.title }}</h4>
                <p class="video-duration">{{ video.duration }}</p>
              </template>
            </Card>
          </div>
        </div>

        <!-- Documentation -->
        <div class="resource-section">
          <h3>📖 Документация</h3>
          <div class="docs-list">
            <a
              v-for="doc in documentation"
              :key="doc.id"
              :href="doc.url"
              class="doc-item"
              @click.prevent="openDocumentation(doc)"
            >
              <i :class="doc.icon"></i>
              <div class="doc-content">
                <h4>{{ doc.title }}</h4>
                <p>{{ doc.description }}</p>
              </div>
              <i class="pi pi-external-link"></i>
            </a>
          </div>
        </div>

        <!-- Community -->
        <div class="resource-section">
          <h3>💬 Сообщество</h3>
          <div class="community-grid">
            <Card
              class="community-card"
              @click="openCommunity({ id: 'telegram', url: 'https://t.me/agent2b' })"
            >
              <template #content>
                <i class="pi pi-send community-icon"></i>
                <h4>Telegram-группа</h4>
                <p>Присоединяйтесь к нашему сообществу</p>
                <div class="community-stats">
                  <span>t.me/agent2b</span>
                </div>
              </template>
            </Card>
          </div>
        </div>
      </div>

      <div class="editor-divider"></div>

      <!-- 5. Support Section -->
      <div class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">💬</span>
          Нужна помощь?
        </h2>
        <p class="section-subtitle">Мы всегда на связи</p>
      </div>

      <div class="support-grid">
        <Card class="support-card" @click="openChat">
          <template #content>
            <i class="pi pi-comments support-icon"></i>
            <h3>Чат поддержки</h3>
            <div class="status-badge online">Онлайн 24/7</div>
            <p>Среднее время ответа: &lt;5 минут</p>
            <Button
              label="Открыть чат"
              icon="pi pi-comments"
              class="p-button-primary mt-3"
            />
          </template>
        </Card>

        <Card class="support-card" @click="openEmail">
          <template #content>
            <i class="pi pi-envelope support-icon"></i>
            <h3>Email</h3>
            <div class="email-address">support@drondoc.ru</div>
            <p>Время ответа: &lt;2 часа</p>
            <Button
              label="Написать письмо"
              icon="pi pi-envelope"
              class="p-button-primary mt-3"
            />
          </template>
        </Card>

        <Card class="support-card" @click="openPhone">
          <template #content>
            <i class="pi pi-phone support-icon"></i>
            <h3>Телефон</h3>
            <div class="phone-number">+7 (XXX) XXX-XX-XX</div>
            <p>Пн-Пт 9:00-18:00 МСК</p>
            <Button
              label="Позвонить"
              icon="pi pi-phone"
              class="p-button-primary mt-3"
            />
          </template>
        </Card>

        <Card class="support-card" @click="scheduleDemo">
          <template #content>
            <i class="pi pi-calendar support-icon"></i>
            <h3>Запланировать демо</h3>
            <div class="demo-info">Персональная демонстрация</div>
            <p>Длительность: 30 минут</p>
            <Button
              label="Выбрать время"
              icon="pi pi-calendar"
              class="p-button-primary mt-3"
            />
          </template>
        </Card>
      </div>

      <div class="editor-divider"></div>

      <!-- 7. Personalization Section -->
      <div v-if="selectedRole" class="editor-section">
        <h2 class="section-heading">
          <span class="heading-icon">✨</span>
          Персональные рекомендации
        </h2>
        <p class="section-subtitle">На основе вашего профиля</p>
      </div>

      <Card v-if="selectedRole" class="personalization-card">
        <template #content>
          <div class="personalization-content">
            <div class="role-badge">
              <i :class="getRoleIcon(selectedRole)"></i>
              <span>{{ getRoleLabel(selectedRole) }}</span>
            </div>
            <p class="recommendation-text">{{ getPersonalizedMessage() }}</p>
            <div class="recommended-templates">
              <h4>Рекомендуемые модули для вас:</h4>
              <div class="modules-grid mt-3">
                <div
                  v-for="module in getRecommendedModules()"
                  :key="module.id"
                  class="module-card"
                  @click="navigateToModule(module.path)"
                >
                  <div class="module-icon">{{ module.icon }}</div>
                  <div class="module-content">
                    <h3 class="module-title">{{ module.name }}</h3>
                    <p class="module-description">{{ module.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- Quick Actions -->
      <div class="editor-section mt-6">
        <h2 class="section-heading">
          <span class="heading-icon">🚀</span>
          Начните прямо сейчас
        </h2>
        <p class="section-subtitle">Три простых способа автоматизировать ваш бизнес</p>
      </div>

      <div class="quick-actions">
        <Card class="action-card primary-action" @click="trackAndNavigate('/organization/ready-solutions', 'view_ready_solutions')">
          <template #content>
            <div class="action-icon">💼</div>
            <h3>Готовые решения</h3>
            <p>Выберите готовый пакет инструментов под вашу отрасль</p>
            <Button
              label="Просмотреть решения"
              icon="pi pi-arrow-right"
              class="p-button-lg p-button-primary w-full mt-3"
            />
          </template>
        </Card>
        <Card class="action-card" @click="trackAndNavigate('/organization', 'view_my_organization')">
          <template #content>
            <div class="action-icon">🏢</div>
            <h3>Моя организация</h3>
            <p>Настройте и управляйте вашей организацией</p>
            <Button
              label="Перейти к организации"
              icon="pi pi-building"
              class="p-button-lg p-button-outlined w-full mt-3"
            />
          </template>
        </Card>
        <Card class="action-card" @click="trackAndNavigate('/agents/constructor', 'create_custom_agent')">
          <template #content>
            <div class="action-icon">🛠️</div>
            <h3>Собрать с нуля</h3>
            <p>Создайте модуль под специфичную задачу</p>
            <Button
              label="Открыть конструктор"
              icon="pi pi-plus"
              class="p-button-lg p-button-outlined w-full mt-3"
            />
          </template>
        </Card>
      </div>

      <!-- Footer -->
      <div class="editor-footer">
        <p class="footer-hint">
          <i class="pi pi-lightbulb"></i>
          <strong>Integram:</strong> Собирайте вашу цифровую организацию за 1 день. Не месяцы на разработку — часы на настройку.
        </p>
      </div>
    </div>

    <!-- Ensemble Deployment Dialog -->
    <EnsembleDeploymentDialog
      v-if="selectedEnsemble"
      v-model:visible="deploymentDialogVisible"
      :ensemble="selectedEnsemble"
      :organization-id="userOrganizationId"
      @deployment-complete="handleDeploymentComplete"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboardingStore'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard.vue'
import EnsembleDeploymentDialog from '@/components/ensembles/EnsembleDeploymentDialog.vue'

import { getAllEnsembles, getEnsemble } from '@/services/ensembleService'

const router = useRouter()
const onboardingStore = useOnboardingStore()

// Ensemble deployment state
const deploymentDialogVisible = ref(false)
const selectedEnsemble = ref(null)
const userOrganizationId = ref('00000000-0000-0000-0000-000000000000') // TODO: Get from auth/organization store

// Initialize onboarding
onMounted(() => {
  onboardingStore.initFromLocalStorage()
  onboardingStore.markWelcomeSeen()

  // Track page view
  onboardingStore.trackFeatureInteraction('welcome_page_viewed')
})

// User data
const userName = computed(() => onboardingStore.selectedRole ? 'пользователь' : 'друг')
const hasSeenWelcome = computed(() => onboardingStore.hasSeenWelcome)
const selectedRole = computed(() => onboardingStore.selectedRole)

// Onboarding progress
const hasCreatedAgent = computed(() =>
  onboardingStore.checklistItems.find(item => item.id === 'first_agent')?.completed || false
)
const hasTestedAgent = computed(() =>
  onboardingStore.checklistItems.find(item => item.id === 'explore_dashboard')?.completed || false
)
const onboardingProgress = computed(() => {
  let progress = 33 // Account created
  if (hasCreatedAgent.value) progress += 34
  if (hasTestedAgent.value) progress += 33
  return progress
})

// Progress steps
const progressSteps = computed(() => [
  {
    id: 'registration',
    title: 'Регистрация',
    description: 'Аккаунт создан',
    completed: true,
    current: false
  },
  {
    id: 'create_agent',
    title: 'Создание модуля',
    description: 'Выберите шаблон или создайте с нуля',
    completed: hasCreatedAgent.value,
    current: !hasCreatedAgent.value
  },
  {
    id: 'test_agent',
    title: 'Тестирование',
    description: 'Проверьте работу модуля',
    completed: hasTestedAgent.value,
    current: hasCreatedAgent.value && !hasTestedAgent.value
  },
  {
    id: 'integration',
    title: 'Интеграция',
    description: 'Подключите внешние сервисы',
    completed: false,
    current: false
  },
  {
    id: 'production',
    title: 'Запуск в продакшн',
    description: 'Переведите модуль в рабочий режим',
    completed: false,
    current: false
  }
])

// Templates by category
const supportTemplates = ref([
  {
    id: 'first-line-support',
    name: 'Модуль первой линии',
    description: 'Отвечает на типовые вопросы клиентов 24/7',
    icon: '💬',
    path: '/agents/constructor',
    category: 'support'
  },
  {
    id: 'faq-bot',
    name: 'FAQ-бот',
    description: 'База знаний с автоответами на частые вопросы',
    icon: '❓',
    path: '/knowledge-management',
    category: 'support'
  },
  {
    id: 'feedback-collector',
    name: 'Сбор обратной связи',
    description: 'Опросы клиентов и сбор оценок',
    icon: '⭐',
    path: '/agents/constructor',
    category: 'support'
  }
])

const salesTemplates = ref([
  {
    id: 'lead-qualification',
    name: 'Квалификация лидов',
    description: 'Оценка потенциальных клиентов с помощью AI',
    icon: '🎯',
    path: '/lead-scorer',
    category: 'sales'
  },
  {
    id: 'appointment-booking',
    name: 'Запись на консультацию',
    description: 'Планирование встреч и консультаций',
    icon: '📅',
    path: '/agents/constructor',
    category: 'sales'
  },
  {
    id: 'upsell-agent',
    name: 'Upsell-модуль',
    description: 'Предложение дополнительных услуг и продуктов',
    icon: '💰',
    path: '/agents/constructor',
    category: 'sales'
  }
])

const operationsTemplates = ref([
  {
    id: 'order-processing',
    name: 'Прием заказов',
    description: 'Обработка заказов 24/7 без выходных',
    icon: '🛒',
    path: '/marketplace-analytics',
    category: 'operations'
  },
  {
    id: 'request-handling',
    name: 'Обработка заявок',
    description: 'Сбор и структурирование информации от клиентов',
    icon: '📋',
    path: '/agents/constructor',
    category: 'operations'
  },
  {
    id: 'reminders',
    name: 'Напоминания и уведомления',
    description: 'Автоматические напоминания о событиях',
    icon: '🔔',
    path: '/agents/constructor',
    category: 'operations'
  }
])

const hrTemplates = ref([
  {
    id: 'resume-screening',
    name: 'Скрининг резюме',
    description: 'Первичная оценка кандидатов с помощью AI',
    icon: '📄',
    path: '/agents/constructor',
    category: 'hr'
  },
  {
    id: 'interview-scheduling',
    name: 'Планирование собеседований',
    description: 'Назначение встреч с кандидатами',
    icon: '📅',
    path: '/agents/constructor',
    category: 'hr'
  },
  {
    id: 'employee-onboarding',
    name: 'Онбординг сотрудников',
    description: 'Введение новых сотрудников в курс дела',
    icon: '👋',
    path: '/agents/constructor',
    category: 'hr'
  }
])

// Learning resources
const videos = ref([
  {
    id: 'create-agent-5min',
    title: 'Как создать модуль за 5 минут',
    duration: '5:00',
    thumbnail: '/placeholder-video-1.jpg',
    url: 'https://youtube.com/watch?v=example1'
  },
  {
    id: 'setup-integrations',
    title: 'Настройка интеграций',
    duration: '3:00',
    thumbnail: '/placeholder-video-2.jpg',
    url: 'https://youtube.com/watch?v=example2'
  },
  {
    id: 'analytics-monitoring',
    title: 'Аналитика и мониторинг',
    duration: '4:00',
    thumbnail: '/placeholder-video-3.jpg',
    url: 'https://youtube.com/watch?v=example3'
  }
])

const documentation = ref([
  {
    id: 'quick-start',
    title: 'Быстрый старт',
    description: 'Пошаговое руководство для начинающих',
    icon: 'pi pi-bolt',
    url: '/docs/getting-started'
  },
  {
    id: 'best-practices',
    title: 'Лучшие практики',
    description: 'Проверенные методы для максимальной эффективности',
    icon: 'pi pi-star',
    url: '/docs/best-practices'
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Документация для разработчиков',
    icon: 'pi pi-code',
    url: '/developers'
  }
])

const communityLinks = ref([
  {
    id: 'telegram',
    name: 'Telegram-чат',
    description: 'Общайтесь с другими пользователями',
    icon: 'pi pi-send',
    members: '2,500+ участников',
    url: 'https://t.me/integram'
  },
  {
    id: 'forum',
    name: 'Форум',
    description: 'Вопросы и ответы сообщества',
    icon: 'pi pi-comments',
    members: '1,200+ постов',
    url: '/forum'
  },
  {
    id: 'blog',
    name: 'Блог и кейсы',
    description: 'Истории успеха и новости',
    icon: 'pi pi-book',
    members: '150+ статей',
    url: '/blog'
  }
])

// Functions
function useTemplate(template) {
  onboardingStore.trackFeatureInteraction('template_selected')
  onboardingStore.trackFeatureInteraction(`template_${template.category}_${template.id}`)
  router.push(template.path)
}

function navigateToModule(path) {
  router.push(path)
}

function trackAndNavigate(path, eventName) {
  onboardingStore.trackFeatureInteraction(eventName)
  router.push(path)
}

function playVideo(video) {
  onboardingStore.trackFeatureInteraction('video_watched')
  onboardingStore.trackFeatureInteraction(`video_${video.id}`)
  window.open(video.url, '_blank')
}

function openDocumentation(doc) {
  onboardingStore.trackFeatureInteraction('documentation_viewed')
  router.push(doc.url)
}

function openCommunity(community) {
  onboardingStore.trackFeatureInteraction('community_accessed')
  onboardingStore.trackFeatureInteraction(`community_${community.id}`)
  if (community.url.startsWith('http')) {
    window.open(community.url, '_blank')
  } else {
    router.push(community.url)
  }
}

function openChat() {
  onboardingStore.trackFeatureInteraction('support_contacted')
  onboardingStore.trackFeatureInteraction('support_chat_opened')
  // TODO: Integrate with actual chat system (Intercom/Telegram)
  alert('Функция чата в разработке. Пока напишите нам на support@drondoc.ru')
}

function openEmail() {
  onboardingStore.trackFeatureInteraction('support_contacted')
  onboardingStore.trackFeatureInteraction('support_email_clicked')
  window.location.href = 'mailto:support@drondoc.ru'
}

function openPhone() {
  onboardingStore.trackFeatureInteraction('support_contacted')
  onboardingStore.trackFeatureInteraction('support_phone_clicked')
  // TODO: Add actual phone number
  alert('Телефон: +7 (XXX) XXX-XX-XX')
}

function scheduleDemo() {
  onboardingStore.trackFeatureInteraction('support_contacted')
  onboardingStore.trackFeatureInteraction('demo_scheduled')
  // TODO: Integrate with Calendly or similar
  alert('Функция планирования демо в разработке. Напишите нам на support@drondoc.ru')
}

// New solution-focused functions
function navigateToSolution(solutionType) {
  onboardingStore.trackFeatureInteraction('solution_selected')
  onboardingStore.trackFeatureInteraction(`solution_${solutionType}`)
  // Navigate to organization ready-solutions page filtered by solution type
  router.push(`/organization/ready-solutions?solution=${solutionType}`)
}

function navigateToAgent(path) {
  onboardingStore.trackFeatureInteraction('agent_selected')
  router.push(path)
}

async function activateEnsemble(ensembleType) {
  onboardingStore.trackFeatureInteraction('ensemble_activated')
  onboardingStore.trackFeatureInteraction(`ensemble_${ensembleType}`)

  try {
    // Fetch ensemble details
    const ensemble = await getEnsemble(ensembleType)
    selectedEnsemble.value = ensemble

    // Show deployment dialog
    deploymentDialogVisible.value = true
  } catch (error) {
    console.error('Failed to load ensemble:', error)
    alert(`Не удалось загрузить ансамбль. Попробуйте позже или свяжитесь с support@drondoc.ru`)
  }
}

function handleDeploymentComplete(result) {
  onboardingStore.trackFeatureInteraction('ensemble_deployed_success')
  deploymentDialogVisible.value = false

  // Navigate to organization page to see deployed agents
  if (result.success) {
    setTimeout(() => {
      router.push('/organization')
    }, 1000)
  }
}

// Personalization functions
function getRoleIcon(role) {
  const roleIcons = {
    developer: 'pi pi-code',
    manager: 'pi pi-users',
    analyst: 'pi pi-chart-bar',
    operator: 'pi pi-cog'
  }
  return roleIcons[role] || 'pi pi-user'
}

function getRoleLabel(role) {
  const roleLabels = {
    developer: 'Разработчик',
    manager: 'Менеджер проекта',
    analyst: 'Аналитик',
    operator: 'Оператор'
  }
  return roleLabels[role] || role
}

function getPersonalizedMessage() {
  const role = selectedRole.value
  const messages = {
    developer: 'Для разработчиков мы рекомендуем начать с API-интеграций и конструктора модулей',
    manager: 'Для менеджеров проектов мы подготовили инструменты управления воркфлоу и аналитику',
    analyst: 'Для аналитиков у нас есть мощные инструменты сбора и визуализации данных',
    operator: 'Для операторов дронов доступны инструменты управления полетами и телеметрией'
  }
  return messages[role] || 'Мы подобрали для вас релевантные модули и инструменты'
}

function getRecommendedModules() {
  const role = selectedRole.value
  const allModules = [
    {
      id: 'agent-constructor',
      name: 'Конструктор модулей (3 в 1)',
      description: 'No-Code конструктор, Workflow Builder и AI-создание модулей',
      icon: '🤖',
      path: '/agents/constructor',
      roles: ['developer', 'manager']
    },
    {
      id: 'youtube-analytics',
      name: 'Аналитика YouTube',
      description: 'Собирайте статистику и анализируйте тренды',
      icon: '📺',
      path: '/youtube-analytics',
      roles: ['analyst', 'manager']
    },
    {
      id: 'drone-control',
      name: 'Управление дронами',
      description: 'Управляйте дронами через MAVLink',
      icon: '🚁',
      path: '/drone',
      roles: ['operator', 'developer']
    },
    {
      id: 'web-scraper',
      name: 'Парсинг сайтов',
      description: 'Извлекайте данные с веб-сайтов',
      icon: '🕷️',
      path: '/web-scraper',
      roles: ['developer', 'analyst']
    },
    {
      id: 'api-sandbox',
      name: 'Тестирование API',
      description: 'Тестируйте API endpoints',
      icon: '🧪',
      path: '/api',
      roles: ['developer']
    }
  ]

  return allModules.filter(module =>
    !role || module.roles.includes(role)
  ).slice(0, 3)
}

// New functions for Learning section
function startQuickTutorial() {
  onboardingStore.trackFeatureInteraction('quick_tutorial_started')
  // TODO: Navigate to quick tutorial or show interactive guide
  router.push('/tutorials/quick-start')
}

function startFullCourse() {
  onboardingStore.trackFeatureInteraction('full_course_started')
  // TODO: Navigate to 7-day course
  router.push('/tutorials/7-day-course')
}

function openVideoLessons() {
  onboardingStore.trackFeatureInteraction('video_lessons_opened')
  // TODO: Navigate to video lessons page
  router.push('/tutorials/videos')
}

// New functions for Invite Friends & Create Databases
function inviteFriends() {
  onboardingStore.trackFeatureInteraction('invite_friends_clicked')
  // TODO: Show invite dialog with email/link sharing options
  alert('Функция приглашения друзей в разработке. Вы можете поделиться ссылкой на регистрацию с коллегами через настройки профиля.')
}

function createNewDatabase() {
  onboardingStore.trackFeatureInteraction('create_database_clicked')
  // TODO: Navigate to database creation page or show dialog
  router.push('/databases/create')
}
</script>

<style scoped>
.welcome-page {
  min-height: 100vh;
  background: var(--surface-0);
  padding: 2rem 1rem;
  display: flex;
  justify-content: center;
}

.editor-container {
  max-width: 1000px;
  width: 100%;
  background: var(--surface-0);
  padding: 3rem 2rem;
}

/* Title Section */
.editor-title {
  margin-bottom: 1rem;
}

.title-editable {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-color);
  border: none;
  outline: none;
  padding: 0.5rem 0;
  line-height: 1.2;
  margin: 0;
}

.editor-subtitle {
  margin-bottom: 2rem;
}

.editor-subtitle p {
  font-size: 1.25rem;
  color: var(--text-color-secondary);
  margin: 0;
  padding: 0.5rem 0;
}

.editor-divider {
  height: 1px;
  background: var(--surface-border);
  margin: 2rem 0;
}

/* Section Headings */
.editor-section {
  margin: 2rem 0 1rem 0;
}

.section-heading {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem 0;
}

.heading-icon {
  font-size: 1.5rem;
}

.section-subtitle {
  color: var(--text-color-secondary);
  font-size: 1rem;
  margin: 0.5rem 0;
}

/* Value Proposition */
.value-proposition {
  font-size: 1.4rem !important;
  font-weight: 600;
  color: var(--primary-color) !important;
  line-height: 1.4;
}

.value-subtext {
  font-size: 1.1rem !important;
  color: var(--text-color) !important;
  margin-top: 0.5rem !important;
}

/* Solutions Single Row */
.solutions-single-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin: 1.5rem 0;
}

.solution-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid var(--surface-border);
  position: relative;
  overflow: visible;
}

.solution-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.solution-card.premium {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
}

.solution-badge {
  position: absolute;
  top: -12px;
  right: 16px;
  background: var(--primary-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.solution-icon {
  font-size: 3.5rem;
  text-align: center;
  margin-bottom: 1rem;
}

.solution-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 0.75rem 0;
}

.solution-description {
  font-size: 1rem;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.solution-features {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

.feature-item {
  font-size: 0.9rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.solution-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat-item {
  text-align: center;
  padding: 0.75rem;
  background: var(--surface-0);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.stat-item strong {
  display: block;
  font-size: 1.5rem;
  color: var(--primary-color);
  margin-bottom: 0.25rem;
}

.stat-item span {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

/* Ensembles Section */
.ensembles-accordion {
  margin: 1.5rem 0;
}

.ensemble-description {
  background: var(--surface-50);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.ensemble-description p {
  margin: 0.5rem 0;
  color: var(--text-color);
}

.agents-ensemble {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.agent-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
  text-align: center;
}

.agent-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.agent-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.agent-card h4 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--text-color);
}

.agent-card p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.agent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.tag {
  background: var(--primary-100);
  color: var(--primary-700);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
}

/* Quick Actions Cards */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin: 1.5rem 0;
}

.action-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid var(--surface-border);
  text-align: center;
}

.action-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-4px);
}

.action-card.primary-action {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
}

.action-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.action-card h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.5rem 0;
}

.action-card p {
  font-size: 0.95rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin-bottom: 1rem;
}

/* Onboarding Checklist */
.onboarding-checklist {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 2rem;
  margin: 1.5rem 0;
}

.progress-container {
  margin-bottom: 2rem;
}

.progress-text {
  text-align: center;
  color: var(--text-color-secondary);
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.5rem;
  background: var(--surface-0);
  border: 2px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.checklist-item:hover {
  border-color: var(--primary-color);
  transform: translateX(4px);
}

.checklist-item.completed {
  border-color: var(--green-500);
  background: var(--green-50);
}

.check-icon {
  font-size: 2rem;
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.check-icon.inactive {
  color: var(--surface-400);
}

.checklist-item.completed .check-icon {
  color: var(--green-500);
}

.item-content {
  flex: 1;
}

.item-content h4 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.5rem 0;
}

.item-content p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.reward-message {
  margin-top: 1.5rem;
}

/* Templates Section */
.templates-accordion {
  margin: 1.5rem 0;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.template-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
}

.template-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.template-icon {
  font-size: 3rem;
  text-align: center;
  padding: 1rem;
  background: var(--surface-50);
}

.template-card h4 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.5rem 0;
}

.template-card p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

/* Resources Section */
.resources-container {
  margin: 1.5rem 0;
}

.resource-section {
  margin-bottom: 2rem;
}

.resource-section h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.video-card {
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.video-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.video-thumbnail {
  width: 100%;
  height: 150px;
  object-fit: cover;
  background: var(--surface-200);
  border-radius: 8px 8px 0 0;
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px 8px 0 0;
}

.play-overlay i {
  font-size: 3rem;
  color: white;
  opacity: 0.9;
}

.video-card h4 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.video-duration {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.docs-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-color);
  transition: all 0.2s ease;
}

.doc-item:hover {
  border-color: var(--primary-color);
  background: var(--primary-50);
  transform: translateX(4px);
}

.doc-item > i:first-child {
  font-size: 1.5rem;
  color: var(--primary-color);
  flex-shrink: 0;
}

.doc-content {
  flex: 1;
}

.doc-content h4 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.doc-content p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.doc-item > i:last-child {
  color: var(--text-color-secondary);
  font-size: 1rem;
  flex-shrink: 0;
}

.community-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.community-card {
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
}

.community-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.community-icon {
  font-size: 2.5rem;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.community-card h4 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.community-card p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem 0;
}

.community-stats {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-weight: 600;
}

/* Support Section */
.support-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.support-card {
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
}

.support-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.support-icon {
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
}

.support-card h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.status-badge.online {
  background: var(--green-100);
  color: var(--green-700);
}

.email-address,
.phone-number,
.demo-info {
  font-weight: 600;
  color: var(--primary-color);
  margin: 0.5rem 0;
}

.support-card p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0.5rem 0;
}

/* Progress Card */
.progress-card {
  margin: 1.5rem 0;
}

.detailed-progress {
  padding: 1rem 0;
}

.progress-steps {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.progress-step {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  position: relative;
}

.progress-step::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 40px;
  bottom: -24px;
  width: 2px;
  background: var(--surface-300);
}

.progress-step:last-child::before {
  display: none;
}

.progress-step.completed::before {
  background: var(--primary-color);
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-200);
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
  z-index: 1;
}

.progress-step.completed .step-number {
  background: var(--primary-color);
  color: white;
}

.progress-step.current .step-number {
  background: var(--primary-100);
  color: var(--primary-color);
  border: 2px solid var(--primary-color);
}

.step-info {
  flex: 1;
  padding-top: 0.25rem;
}

.step-info h4 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.25rem 0;
}

.step-info p {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
}

/* Personalization Section */
.personalization-card {
  margin: 1.5rem 0;
}

.personalization-content {
  padding: 1rem 0;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 20px;
  font-weight: 600;
  margin-bottom: 1rem;
}

.role-badge i {
  font-size: 1.25rem;
}

.recommendation-text {
  font-size: 1rem;
  color: var(--text-color-secondary);
  margin: 1rem 0;
  line-height: 1.6;
}

.recommended-templates h4 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 1.5rem 0 0.5rem 0;
}

/* Modules Grid */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.module-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.module-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.module-icon {
  font-size: 2.5rem;
}

.module-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.module-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.module-description {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin: 0;
}

/* Quick Actions */
/* Стили перенесены в секцию "Quick Actions Cards" выше */

/* Footer */
.editor-footer {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--surface-border);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.footer-hint i {
  color: var(--primary-color);
}

/* Utility Classes */
.mt-2 {
  margin-top: 0.5rem;
}

.mt-3 {
  margin-top: 0.75rem;
}

.mt-4 {
  margin-top: 1rem;
}

.mt-6 {
  margin-top: 3rem;
}

.mb-3 {
  margin-bottom: 0.75rem;
}

.mb-4 {
  margin-bottom: 1rem;
}

/* Value Tagline */
.value-tagline {
  font-size: 1.15rem !important;
  font-weight: 600;
  color: var(--primary-color) !important;
  margin-top: 0.75rem !important;
}

/* Lessons Section */
.lessons-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin: 1.5rem 0;
}

.lesson-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid var(--surface-border);
  position: relative;
}

.lesson-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.lesson-card.featured-lesson {
  border-color: var(--primary-color);
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--surface-0) 100%);
}

.lesson-badge {
  position: absolute;
  top: -12px;
  right: 16px;
  background: var(--primary-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.lesson-icon {
  font-size: 3.5rem;
  text-align: center;
  margin-bottom: 1rem;
}

.lesson-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 0.75rem 0;
  text-align: center;
}

.lesson-description {
  font-size: 1rem;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin-bottom: 1rem;
  text-align: center;
}

.lesson-steps {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

.lesson-step {
  font-size: 0.9rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lesson-progress {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--surface-50);
  border-radius: 6px;
}

.progress-badge {
  font-size: 0.7rem;
  padding: 0.25rem 0.5rem;
  border-radius: 10px;
  font-weight: 600;
  background: var(--green-100);
  color: var(--green-700);
}

.progress-badge.locked {
  background: var(--surface-200);
  color: var(--surface-600);
}

.video-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.video-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--surface-50);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text-color);
}

.video-item i {
  color: var(--primary-color);
  font-size: 1.25rem;
}

/* Collaboration Section */
.collaboration-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
  margin: 1.5rem 0;
}

.collaboration-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid var(--surface-border);
  text-align: center;
}

.collaboration-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.collab-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.collaboration-card h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 0.75rem 0;
}

.collab-description {
  font-size: 1rem;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.invite-benefits {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  text-align: left;
}

.benefit-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
  color: var(--text-color);
}

.benefit-item i {
  color: var(--green-500);
  font-size: 1.25rem;
}

.database-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat-box {
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary-color);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

/* Responsive Design */
@media (max-width: 768px) {
  .editor-container {
    padding: 2rem 1rem;
  }

  .title-editable {
    font-size: 2rem;
  }

  .editor-subtitle p {
    font-size: 1rem;
  }

  .solutions-single-row {
    grid-template-columns: 1fr;
  }

  .templates-grid,
  .modules-grid {
    grid-template-columns: 1fr;
  }

  .support-grid {
    grid-template-columns: 1fr;
  }

  .video-grid {
    grid-template-columns: 1fr;
  }

  .community-grid {
    grid-template-columns: 1fr;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }

  .checklist-item {
    flex-direction: column;
  }

  .progress-step {
    flex-direction: row;
  }

  .lessons-container {
    grid-template-columns: 1fr;
  }

  .collaboration-grid {
    grid-template-columns: 1fr;
  }
}
</style>
