<template>
  <div class="integram-info-page">
    <!-- Breadcrumb Navigation -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <Card>
      <template #content>
        <h2>🎓 Интеграл приветствует вас!</h2>

        <!-- Progress Bar -->
        <div v-if="totalProgress > 0" class="mb-4">
          <div class="flex justify-content-between mb-2">
            <span class="text-sm font-semibold">Общий прогресс</span>
            <span class="text-sm font-semibold">{{ totalProgress }}%</span>
          </div>
          <ProgressBar :value="totalProgress" :showValue="false" />
          <p class="text-xs text-color-secondary mt-1">
            Завершено {{ completedLessonsCount }} из {{ lessons.length }} уроков
          </p>
        </div>

        <p>
          Рекомендую для начала посмотреть
          <a href="https://youtu.be/JHYIWIUDkSk" target="_blank">обзорный ролик</a>
          по возможностям сервиса.
        </p>
        <p>
          Далее я предлагаю вам пройти интерактивные уроки, чтобы самостоятельно делать приложения,
          показанные в ролике. Уроки следует проходить в указанной последовательности, потому что
          некоторые уроки используют материал, созданный в предыдущих уроках.
        </p>

        <!-- Lessons Grid -->
        <div class="grid">
          <div v-for="(lesson, index) in lessons" :key="index" class="col-12 md:col-6 lg:col-4 mb-3">
            <Card
              class="h-full shadow-2 lesson-card"
              :class="{
                'lesson-completed': lesson.completed,
                'lesson-in-progress': lesson.inProgress,
                'lesson-locked': lesson.disabled
              }"
            >
              <template #header>
                <div class="lesson-status-badge">
                  <i v-if="lesson.completed" class="pi pi-check-circle text-green-500 text-2xl"></i>
                  <i v-else-if="lesson.inProgress" class="pi pi-spin pi-spinner text-blue-500 text-2xl"></i>
                  <i v-else-if="lesson.disabled" class="pi pi-lock text-gray-400 text-2xl"></i>
                  <i v-else class="pi pi-play-circle text-primary text-2xl"></i>
                </div>
              </template>
              <template #title>
                <h5>{{ lesson.number }}. {{ lesson.title }}</h5>
              </template>
              <template #subtitle>
                <div class="flex justify-content-between align-items-center">
                  <h6 class="text-500 m-0">{{ lesson.duration }}</h6>
                  <Tag
                    v-if="lesson.completed"
                    value="Завершено"
                    severity="success"
                    :rounded="true"
                  />
                  <Tag
                    v-else-if="lesson.inProgress"
                    value="В процессе"
                    severity="info"
                    :rounded="true"
                  />
                </div>
              </template>
              <template #content>
                <p class="text-sm">{{ lesson.description }}</p>

                <!-- Lesson Progress -->
                <div v-if="lesson.inProgress && lesson.progress > 0" class="mt-3">
                  <div class="flex justify-content-between mb-1">
                    <span class="text-xs">Прогресс</span>
                    <span class="text-xs">{{ lesson.progress }}%</span>
                  </div>
                  <ProgressBar :value="lesson.progress" :showValue="false" style="height: 6px" />
                </div>

                <!-- Completion Time -->
                <div v-if="lesson.completedAt" class="mt-2 text-xs text-color-secondary">
                  <i class="pi pi-calendar mr-1"></i>
                  Завершено: {{ formatDate(lesson.completedAt) }}
                </div>
              </template>
              <template #footer>
                <Button
                  :label="getButtonLabel(lesson)"
                  :class="['w-full']"
                  :severity="getButtonSeverity(lesson)"
                  :disabled="lesson.disabled"
                  :loading="lesson.inProgress"
                  @click="startLesson(lesson)"
                >
                  <template #icon>
                    <i :class="getButtonIcon(lesson)"></i>
                  </template>
                </Button>
              </template>
            </Card>
          </div>
        </div>

        <!-- Achievement Badges (when all lessons completed) -->
        <div v-if="allLessonsCompleted" class="mt-4 p-4 bg-green-50 border-round">
          <div class="flex align-items-center gap-3">
            <i class="pi pi-trophy text-yellow-500 text-4xl"></i>
            <div>
              <h3 class="m-0 mb-2">Поздравляем! 🎉</h3>
              <p class="m-0">
                Вы успешно завершили все интерактивные уроки! Теперь вы готовы создавать приложения любой сложности.
              </p>
            </div>
          </div>
        </div>

        <!-- Tips for Beginners -->
        <div class="mt-4">
          <a href="#" @click.prevent="showTips = !showTips" class="text-primary">
            <i :class="showTips ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="mr-1"></i>
            Вы новичок в ИТ?
          </a>
          <Message v-if="showTips" severity="warn" class="mt-2">
            <h4>Пара полезных советов по интерактивным урокам:</h4>
            <ol>
              <li class="mb-2">
                Не всё будет идти гладко, иногда придётся остановиться и искать проблему.
                Так в любом программировании, будь то с кодом или без.
              </li>
              <li class="mb-2">
                Если что-то пошло не так, попробуйте просто обновить страницу (F5 в Windows, Command+R в маках),
                это часто помогает.
              </li>
              <li class="mb-2">
                Используйте кнопку "Отметить завершенным", когда полностью закончите урок. Это откроет следующий урок.
              </li>
            </ol>
            <p>
              <strong>Хорошая новость:</strong> если вы прошли урок до конца, то у вас нет противопоказаний
              продолжать развитие в ИТ.
            </p>
          </Message>
        </div>

        <!-- Additional Resources -->
        <div class="mt-4">
          <h3>Дополнительные ресурсы</h3>
          <p>
            После этих вводных уроков вы можете изучить
            <a href="https://help.ideav.online" target="_blank">Руководство разработчика</a>
            и посмотреть
            <a href="https://www.youtube.com/channel/UCwycC92C9FIJjm62aO0unIQ/videos" target="_blank">
              Обучающие ролики партнеров сервиса
            </a>,
            после чего вы сможете делать приложения любой сложности.
          </p>
          <p>
            Ваш личный кабинет IdeaV находится
            <a :href="`/my?login=${database || 'my'}`" target="_my">здесь</a>.
          </p>
        </div>

        <!-- Reset Progress Button (dev/testing) -->
        <div class="mt-4 pt-3 border-top-1 surface-border">
          <Button
            label="Сбросить прогресс"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            size="small"
            @click="resetProgress"
          />
        </div>
      </template>
    </Card>

    <!-- Lesson Completion Dialog -->
    <Dialog
      v-model:visible="showCompletionDialog"
      header="Урок завершен!"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex flex-column align-items-center gap-3 p-3">
        <i class="pi pi-check-circle text-green-500 text-6xl"></i>
        <h3 class="m-0">Поздравляем!</h3>
        <p class="text-center m-0">
          Вы успешно завершили урок "{{ completedLesson?.title }}".
        </p>
        <p v-if="nextLesson" class="text-center text-sm text-color-secondary m-0">
          Следующий урок "{{ nextLesson.title }}" теперь доступен.
        </p>
      </div>
      <template #footer>
        <Button
          v-if="nextLesson"
          label="Начать следующий урок"
          icon="pi pi-arrow-right"
          @click="startNextLesson"
          autofocus
        />
        <Button
          v-else
          label="Закрыть"
          severity="secondary"
          @click="showCompletionDialog = false"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import integramApiClient from '@/services/integramApiClient'
import { useTimer } from '@/composables/useTimer'

// Get database directly from client (simpler, avoids composable issues)
const database = computed(() => integramApiClient.getDatabase() || 'default')

const toast = useToast()
const confirm = useConfirm()
const { setTimeout: setTimerTimeout } = useTimer()

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
  {
    label: 'Информация',
    icon: 'pi pi-info-circle',
    to: undefined
  }
])
const showTips = ref(false)
const showCompletionDialog = ref(false)
const completedLesson = ref(null)
const nextLesson = ref(null)

// Load lesson progress from localStorage
const PROGRESS_KEY = computed(() => `integram_lesson_progress_${database.value || 'default'}`)

const lessons = ref([
  {
    number: 1,
    title: 'Быстрое знакомство',
    duration: '8-10 мин',
    description: 'Обзорная экскурсия по Интегралу',
    buttonText: 'Начать',
    action: 'overview',
    disabled: false,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  },
  {
    number: 2,
    title: 'Универсальный импорт',
    duration: '5-10 мин',
    description: 'Создание простых таблиц загрузкой файла',
    buttonText: 'Научиться',
    action: 'upload',
    disabled: true,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  },
  {
    number: 3,
    title: 'Запросы',
    duration: '10 мин',
    description: 'Конструктор запросов: правила выборки данных из множества таблиц',
    buttonText: 'Сделать выборку',
    action: 'queries',
    disabled: true,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  },
  {
    number: 4,
    title: 'Формы',
    duration: '8-10 мин',
    description: 'Конструктор форм: панели с таблицами и графиками, дэшборды, сводные таблицы',
    buttonText: 'Построить',
    action: 'forms',
    disabled: true,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  },
  {
    number: 5,
    title: 'Базы данных',
    duration: '15-20 мин',
    description: 'Многомерная структура данных Планировщика задач',
    buttonText: 'Создать',
    action: 'tasks',
    disabled: true,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  },
  {
    number: 6,
    title: 'Зачёт',
    duration: '5 мин',
    description: 'Проверьте как вы усвоили материал и выберите платное задание',
    buttonText: 'Сдать',
    action: 'test',
    disabled: true,
    completed: false,
    inProgress: false,
    progress: 0,
    completedAt: null
  }
])

// Computed properties
const completedLessonsCount = computed(() => {
  return lessons.value.filter(l => l.completed).length
})

const totalProgress = computed(() => {
  return Math.round((completedLessonsCount.value / lessons.value.length) * 100)
})

const allLessonsCompleted = computed(() => {
  return completedLessonsCount.value === lessons.value.length
})

// Methods
function getButtonLabel(lesson) {
  if (lesson.completed) return 'Повторить'
  if (lesson.inProgress) return 'Продолжить'
  return lesson.buttonText
}

function getButtonSeverity(lesson) {
  if (lesson.completed) return 'success'
  if (lesson.inProgress) return 'info'
  if (lesson.disabled) return 'secondary'
  return 'primary'
}

function getButtonIcon(lesson) {
  if (lesson.completed) return 'pi pi-replay'
  if (lesson.inProgress) return 'pi pi-arrow-right'
  return 'pi pi-play'
}

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function startLesson(lesson) {
  if (lesson.disabled) {
    toast.add({
      severity: 'info',
      summary: 'Урок заблокирован',
      detail: 'Сначала завершите предыдущие уроки',
      life: 3000
    })
    return
  }

  // Mark lesson as in progress
  lesson.inProgress = true
  lesson.progress = 25
  saveProgress()

  // Store current lesson in cookie for legacy system
  document.cookie = `_qip=${lesson.action};Path=/${database.value || 'my'}; max-age=31622400;`

  toast.add({
    severity: 'info',
    summary: 'Урок запущен',
    detail: `Начинаем урок "${lesson.title}"`,
    life: 3000
  })

  // Simulate lesson progress (in real implementation, this would be tracked by actual progress)
  // For now, show completion dialog after 5 seconds for demo purposes
  setTimerTimeout(() => {
    lesson.progress = 50
    saveProgress()
  }, 2000)

  setTimerTimeout(() => {
    lesson.progress = 75
    saveProgress()
  }, 4000)

  setTimerTimeout(() => {
    showLessonCompletionPrompt(lesson)
  }, 6000)

  // TODO: In real implementation, integrate with actual lesson pages
  // and track progress based on user actions within the lesson
}

function showLessonCompletionPrompt(lesson) {
  if (lesson.inProgress && !lesson.completed) {
    confirm.require({
      message: `Вы завершили урок "${lesson.title}"?`,
      header: 'Завершение урока',
      icon: 'pi pi-question-circle',
      acceptLabel: 'Да, завершить',
      rejectLabel: 'Еще нет',
      accept: () => {
        completeLesson(lesson)
      },
      reject: () => {
        toast.add({
          severity: 'info',
          summary: 'Продолжайте',
          detail: 'Вы можете завершить урок позже',
          life: 3000
        })
      }
    })
  }
}

function completeLesson(lesson) {
  lesson.completed = true
  lesson.inProgress = false
  lesson.progress = 100
  lesson.completedAt = new Date().toISOString()

  // Unlock next lesson
  const currentIndex = lessons.value.findIndex(l => l.number === lesson.number)
  if (currentIndex < lessons.value.length - 1) {
    lessons.value[currentIndex + 1].disabled = false
    nextLesson.value = lessons.value[currentIndex + 1]
  } else {
    nextLesson.value = null
  }

  saveProgress()

  completedLesson.value = lesson
  showCompletionDialog.value = true

  toast.add({
    severity: 'success',
    summary: 'Урок завершен!',
    detail: `Поздравляем! Вы завершили урок "${lesson.title}"`,
    life: 5000
  })
}

function startNextLesson() {
  showCompletionDialog.value = false
  if (nextLesson.value) {
    startLesson(nextLesson.value)
  }
}

function saveProgress() {
  const progressData = lessons.value.map(l => ({
    number: l.number,
    completed: l.completed,
    inProgress: l.inProgress,
    progress: l.progress,
    disabled: l.disabled,
    completedAt: l.completedAt
  }))

  localStorage.setItem(PROGRESS_KEY.value, JSON.stringify(progressData))
}

function loadProgress() {
  const savedProgress = localStorage.getItem(PROGRESS_KEY.value)
  if (savedProgress) {
    try {
      const progressData = JSON.parse(savedProgress)
      progressData.forEach(saved => {
        const lesson = lessons.value.find(l => l.number === saved.number)
        if (lesson) {
          lesson.completed = saved.completed
          lesson.inProgress = saved.inProgress
          lesson.progress = saved.progress
          lesson.disabled = saved.disabled
          lesson.completedAt = saved.completedAt
        }
      })

      toast.add({
        severity: 'info',
        summary: 'Прогресс восстановлен',
        detail: `Завершено ${completedLessonsCount.value} из ${lessons.value.length} уроков`,
        life: 3000
      })
    } catch (e) {
      console.error('Failed to load progress:', e)
    }
  }
}

function resetProgress() {
  confirm.require({
    message: 'Вы уверены, что хотите сбросить весь прогресс обучения?',
    header: 'Подтверждение',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Да, сбросить',
    rejectLabel: 'Отмена',
    acceptClass: 'p-button-danger',
    accept: () => {
      // Reset all lessons
      lessons.value.forEach((lesson, index) => {
        lesson.completed = false
        lesson.inProgress = false
        lesson.progress = 0
        lesson.disabled = index > 0 // Only first lesson is enabled
        lesson.completedAt = null
      })

      // Clear localStorage
      localStorage.removeItem(PROGRESS_KEY.value)

      toast.add({
        severity: 'success',
        summary: 'Прогресс сброшен',
        detail: 'Вы можете начать уроки заново',
        life: 3000
      })
    }
  })
}

// Watch for database changes
watch(database, () => {
  loadProgress()
})

onMounted(() => {
  loadProgress()
})
</script>

<style scoped>
h2 {
  margin-bottom: 1rem;
}

a {
  color: var(--primary-color);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

ol {
  padding-left: 1.5rem;
}

.lesson-card {
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.lesson-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.lesson-completed {
  border: 2px solid var(--green-500);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, transparent 100%);
}

.lesson-in-progress {
  border: 2px solid var(--blue-500);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%);
}

.lesson-locked {
  opacity: 0.6;
}

.lesson-status-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
}

.lesson-card :deep(.p-card-header) {
  padding: 1rem;
  min-height: 60px;
}

.lesson-card :deep(.p-card-body) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.lesson-card :deep(.p-card-content) {
  flex-grow: 1;
}
</style>
