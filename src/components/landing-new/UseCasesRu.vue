<template>
  <section class="usecases-section">
    <div class="usecases-container">
      <h2 class="usecases-title">
        Примеры использования
      </h2>
      <p class="usecases-description">
        ИНТЕГРАМ помогает автоматизировать любые процессы, где раньше использовались Excel-файлы
      </p>

      <div class="usecases-grid">
        <div
          v-for="(useCase, index) in useCases"
          :key="index"
          class="usecase-card"
        >
          <h3 class="usecase-title">
            {{ useCase.title }}
          </h3>

          <div class="usecase-comparison">
            <div class="usecase-before">
              <div class="usecase-label">
                <div class="usecase-badge usecase-badge-red">
                  <span>✗</span>
                </div>
                <span class="usecase-label-text">Было:</span>
              </div>
              <p class="usecase-text">{{ useCase.before }}</p>
            </div>

            <div class="usecase-after">
              <div class="usecase-label">
                <div class="usecase-badge usecase-badge-green">
                  <span>✓</span>
                </div>
                <span class="usecase-label-text usecase-label-strong">Стало:</span>
              </div>
              <p class="usecase-text usecase-text-strong">{{ useCase.after }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const useCases = [
  {
    title: 'Производственное планирование',
    before: '20+ файлов Excel, постоянная сверка версий, ошибки в расчётах материалов',
    after: 'Единая система планирования с автоматическим расчётом потребности в материалах и контролем сроков'
  },
  {
    title: 'Управление проектами',
    before: 'Таблицы с задачами теряются, непонятно кто что делает, сроки срываются',
    after: 'Прозрачная система с распределением задач, контролем выполнения и автоматической отчётностью'
  },
  {
    title: 'Складской учёт',
    before: 'Ручной ввод остатков, расхождения при инвентаризации, потери из-за ошибок',
    after: 'Автоматический учёт движения товаров с историей операций и контролем минимальных остатков'
  },
  {
    title: 'Бюджетирование',
    before: 'Месяц на сбор данных от подразделений, множество ошибок при консолидации',
    after: 'Каждое подразделение вносит данные в единую систему, консолидация происходит автоматически'
  },
  {
    title: 'CRM и продажи',
    before: 'Данные о клиентах в личных таблицах менеджеров, теряются при увольнении',
    after: 'Централизованная база клиентов с историей взаимодействий и автоматическими напоминаниями'
  },
  {
    title: 'HR и табельный учёт',
    before: 'Таблицы с отпусками и больничными путаются, сложно посчитать фонд оплаты труда',
    after: 'Автоматизированный учёт рабочего времени с интеграцией в расчёт зарплаты'
  }
]
</script>

<style scoped>
.usecases-section {
  padding: 5rem 1.5rem;
  background: linear-gradient(180deg, #fafbfc, #ffffff);
}

.usecases-container {
  max-width: 75rem;
  margin: 0 auto;
}

.usecases-title {
  font-size: 2.5rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .usecases-title {
    font-size: 3rem;
  }
}

.usecases-description {
  font-size: 1.25rem;
  color: #6b7280;
  text-align: center;
  margin-bottom: 4rem;
  max-width: 48rem;
  margin-left: auto;
  margin-right: auto;
}

.usecases-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 768px) {
  .usecases-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.usecase-card {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
}

.usecase-card:hover {
  box-shadow: 0 8px 24px rgba(255, 111, 66, 0.2);
}

.usecase-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #0077b6;
}

.usecase-comparison {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.usecase-before,
.usecase-after {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.usecase-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.usecase-badge {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
}

.usecase-badge-red {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.usecase-badge-green {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.usecase-label-text {
  font-weight: 600;
  font-size: 0.875rem;
  color: #6b7280;
}

.usecase-label-strong {
  color: #1f2937;
}

.usecase-text {
  color: #6b7280;
  margin-left: 2rem;
  margin: 0;
  margin-left: 2rem;
  line-height: 1.5;
}

.usecase-text-strong {
  color: #1f2937;
  font-weight: 500;
}
</style>
