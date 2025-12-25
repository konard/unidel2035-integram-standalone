<template>
  <div class="integram-quiz-container">
    <!-- Breadcrumb Navigation -->
    <div class="mb-3">
      <IntegramBreadcrumb :items="breadcrumbItems" />
    </div>

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Опросы</span>
        </div>
      </template>
      <template #content>
        <!-- Quiz Selection -->
        <div v-if="!activeQuiz" class="mb-4">
          <div class="field">
            <label for="quizSelect">Выберите опрос</label>
            <Select
              id="quizSelect"
              v-model="selectedQuizId"
              :options="availableQuizzes"
              optionLabel="name"
              optionValue="id"
              placeholder="Выберите опрос"
              class="w-full"
              @change="loadQuiz"
            />
          </div>
        </div>

        <!-- Active Quiz -->
        <div v-if="activeQuiz && !quizCompleted">
          <div class="mb-3">
            <Button
              icon="pi pi-arrow-left"
              label="Назад к выбору"
              @click="resetQuiz"
              text
            />
          </div>

          <h4>{{ activeQuiz.name }}</h4>
          <p v-if="activeQuiz.description" class="text-500 mb-3">
            {{ activeQuiz.description }}
          </p>

          <!-- Progress -->
          <div class="mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
              <span>Вопрос {{ currentQuestion + 1 }} из {{ activeQuiz.questions.length }}</span>
              <span class="text-500">{{ Math.round((currentQuestion / activeQuiz.questions.length) * 100) }}%</span>
            </div>
            <ProgressBar
              :value="(currentQuestion / activeQuiz.questions.length) * 100"
            />
          </div>

          <!-- Current Question -->
          <Panel :header="`Вопрос ${currentQuestion + 1}`" class="mb-3">
            <div class="question-content">
              <h5 class="mb-3">{{ currentQuestionData.text }}</h5>

              <!-- Single Choice -->
              <div v-if="currentQuestionData.type === 'single'" class="flex flex-column gap-2">
                <div
                  v-for="(option, index) in currentQuestionData.options"
                  :key="index"
                  class="field-radiobutton"
                >
                  <RadioButton
                    v-model="answers[currentQuestion]"
                    :inputId="`option-${index}`"
                    :value="option.value"
                  />
                  <label :for="`option-${index}`" class="ml-2">{{ option.label }}</label>
                </div>
              </div>

              <!-- Multiple Choice -->
              <div v-else-if="currentQuestionData.type === 'multiple'" class="flex flex-column gap-2">
                <div
                  v-for="(option, index) in currentQuestionData.options"
                  :key="index"
                  class="field-checkbox"
                >
                  <Checkbox
                    v-model="answers[currentQuestion]"
                    :inputId="`option-${index}`"
                    :value="option.value"
                  />
                  <label :for="`option-${index}`" class="ml-2">{{ option.label }}</label>
                </div>
              </div>

              <!-- Text Input -->
              <div v-else-if="currentQuestionData.type === 'text'">
                <Textarea
                  v-model="answers[currentQuestion]"
                  :rows="4"
                  class="w-full"
                  placeholder="Введите ваш ответ..."
                />
              </div>

              <!-- Rating -->
              <div v-else-if="currentQuestionData.type === 'rating'">
                <Rating
                  v-model="answers[currentQuestion]"
                  :cancel="false"
                />
              </div>
            </div>
          </Panel>

          <!-- Navigation -->
          <div class="flex justify-content-between">
            <Button
              label="Назад"
              icon="pi pi-arrow-left"
              @click="previousQuestion"
              :disabled="currentQuestion === 0"
              outlined
            />
            <Button
              v-if="currentQuestion < activeQuiz.questions.length - 1"
              label="Далее"
              icon="pi pi-arrow-right"
              iconPos="right"
              @click="nextQuestion"
            />
            <Button
              v-else
              label="Завершить"
              icon="pi pi-check"
              @click="submitQuiz"
              severity="success"
            />
          </div>
        </div>

        <!-- Quiz Results -->
        <div v-if="quizCompleted" class="text-center py-5">
          <i class="pi pi-check-circle text-6xl text-green-500 mb-3"></i>
          <h3>Опрос завершен!</h3>
          <p class="text-500 mb-3">Спасибо за ваши ответы</p>

          <Panel header="Ваши ответы" class="text-left mt-4">
            <div
              v-for="(answer, index) in answers"
              :key="index"
              class="mb-3 pb-3 border-bottom-1 surface-border"
            >
              <h5>{{ activeQuiz.questions[index].text }}</h5>
              <p class="text-500">{{ formatAnswer(answer, activeQuiz.questions[index].type) }}</p>
            </div>
          </Panel>

          <Button
            label="Пройти другой опрос"
            icon="pi pi-refresh"
            @click="resetQuiz"
            class="mt-3"
          />
        </div>

        <!-- Empty State -->
        <div v-if="!activeQuiz && availableQuizzes.length === 0" class="text-center py-5">
          <i class="pi pi-inbox text-5xl text-400 mb-3"></i>
          <p class="text-500">Опросы не найдены</p>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'

// PrimeVue Components

defineProps({
  session: {
    type: Object,
    required: true
  }
})

const toast = useToast()

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
  {
    label: 'Квиз',
    icon: 'pi pi-question-circle',
    to: undefined // Current page
  }
])

const selectedQuizId = ref(null)
const activeQuiz = ref(null)
const currentQuestion = ref(0)
const answers = ref([])
const quizCompleted = ref(false)
const availableQuizzes = ref([])

const currentQuestionData = computed(() => {
  if (!activeQuiz.value || !activeQuiz.value.questions) return null
  return activeQuiz.value.questions[currentQuestion.value]
})

function loadQuiz() {
  if (!selectedQuizId.value) return

  // TODO: Load quiz from API
  // Simulate quiz loading
  activeQuiz.value = {
    id: selectedQuizId.value,
    name: 'Демонстрационный опрос',
    description: 'Пример опроса с различными типами вопросов',
    questions: [
      {
        text: 'Как вы оцениваете систему Integram?',
        type: 'rating'
      },
      {
        text: 'Какие функции вы используете чаще всего?',
        type: 'multiple',
        options: [
          { label: 'Работа с таблицами', value: 'tables' },
          { label: 'Отчеты', value: 'reports' },
          { label: 'Формы', value: 'forms' },
          { label: 'Запросы', value: 'queries' }
        ]
      },
      {
        text: 'Какой тип баз данных вы предпочитаете?',
        type: 'single',
        options: [
          { label: 'SQL (PostgreSQL, MySQL)', value: 'sql' },
          { label: 'NoSQL (MongoDB, Redis)', value: 'nosql' },
          { label: 'Графовые БД', value: 'graph' },
          { label: 'Другое', value: 'other' }
        ]
      },
      {
        text: 'Какие улучшения вы хотели бы видеть?',
        type: 'text'
      }
    ]
  }

  // Initialize answers array
  answers.value = new Array(activeQuiz.value.questions.length)
  answers.value[currentQuestion.value] = activeQuiz.value.questions[currentQuestion.value].type === 'multiple' ? [] : null
}

function nextQuestion() {
  if (currentQuestion.value < activeQuiz.value.questions.length - 1) {
    currentQuestion.value++
    // Initialize answer for next question if needed
    if (answers.value[currentQuestion.value] === undefined) {
      answers.value[currentQuestion.value] = activeQuiz.value.questions[currentQuestion.value].type === 'multiple' ? [] : null
    }
  }
}

function previousQuestion() {
  if (currentQuestion.value > 0) {
    currentQuestion.value--
  }
}

function submitQuiz() {
  // TODO: Submit quiz answers to API
  quizCompleted.value = true

  toast.add({
    severity: 'success',
    summary: 'Опрос завершен',
    detail: 'Ваши ответы сохранены',
    life: 3000
  })
}

function resetQuiz() {
  activeQuiz.value = null
  selectedQuizId.value = null
  currentQuestion.value = 0
  answers.value = []
  quizCompleted.value = false
}

function formatAnswer(answer, type) {
  if (answer === null || answer === undefined) return 'Не отвечено'
  if (type === 'multiple') return Array.isArray(answer) ? answer.join(', ') : 'Не выбрано'
  if (type === 'rating') return `⭐ ${answer}/5`
  return answer.toString()
}

onMounted(() => {
  // Load available quizzes
  availableQuizzes.value = [
    { id: '1', name: 'Демо опрос 1' },
    { id: '2', name: 'Демо опрос 2' }
  ]
})
</script>

<style scoped>
.question-content {
  min-height: 200px;
}
</style>
