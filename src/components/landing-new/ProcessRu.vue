<template>
  <section class="process-section">
    <div class="process-container">
      <h2 class="process-title">
        Как это работает?
      </h2>

      <div class="steps-grid">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step-card"
        >
          <div class="step-number">
            {{ step.number }}
          </div>
          <h3 class="step-title">
            {{ step.title }}
          </h3>
          <p class="step-description">
            {{ step.description }}
          </p>
          <div v-if="index < steps.length - 1" class="step-connector"></div>
        </div>
      </div>

      <div class="testimonial">
        <div class="testimonial-icon">💬</div>
        <div class="testimonial-content">
          <p class="testimonial-quote">
            «Мы годами вели планирование производства в Excel. Это был кошмар: постоянные ошибки, неактуальные данные, путаница при смене ответственного. INTEGRAM позволяет не просто автоматизировать процесс, а буквально „вшить" в него наши уникальные правила. И главное — всё остаётся на нашем сервере, бухгалтерия и руководство спокойны. Это переход из каменного века в цифровой!»
          </p>
          <p class="testimonial-author">
            — Типичный пользователь, директор по производству
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const steps = [
  {
    number: '1',
    title: 'Консультация и проектирование',
    description: 'Наш специалист анализирует ваши процессы и помогает спроектировать идеальную систему в конструкторе.'
  },
  {
    number: '2',
    title: 'Установка и настройка',
    description: 'Мы устанавливаем ИНТЕГРАМ на ваши серверы и настраиваем под ваши задачи. Ваши IT-специалисты получают всю необходимую документацию.'
  },
  {
    number: '3',
    title: 'Запуск и обучение',
    description: 'Вы переносите данные из Excel, обучаете сотрудников и начинаете работать в безопасной и автоматизированной среде.'
  }
]
</script>

<style scoped>
.process-section {
  padding: 5rem 1.5rem;
  background: linear-gradient(180deg, #fafbfc, #ffffff);
}

.process-container {
  max-width: 75rem;
  margin: 0 auto;
}

.process-title {
  font-size: 2.5rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 4rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .process-title {
    font-size: 3rem;
  }
}

.steps-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 4rem;
}

@media (min-width: 768px) {
  .steps-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.step-card {
  position: relative;
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 2px solid transparent;
  transition: all 0.3s ease;
  height: 100%;
}

.step-card:hover {
  box-shadow: 0 8px 24px rgba(255, 111, 66, 0.2);
  transform: translateY(-8px);
  border-color: #ff6f42;
}

.step-number {
  font-size: 3.75rem;
  font-weight: bold;
  color: rgba(255, 111, 66, 0.2);
  margin-bottom: 1rem;
}

.step-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
  color: #1f2937;
}

.step-description {
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}

.step-connector {
  display: none;
}

@media (min-width: 768px) {
  .step-card:not(:last-child) .step-connector {
    display: block;
    position: absolute;
    top: 50%;
    right: -2rem;
    width: 2rem;
    height: 2px;
    background: rgba(255, 111, 66, 0.3);
  }
}

.testimonial {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: flex-start;
  background: rgba(0, 119, 182, 0.05);
  border-radius: 1rem;
  padding: 2rem;
  border: 2px solid rgba(0, 119, 182, 0.2);
}

@media (min-width: 768px) {
  .testimonial {
    flex-direction: row;
    padding: 3rem;
  }
}

.testimonial-icon {
  font-size: 3rem;
}

.testimonial-content {
  flex: 1;
}

.testimonial-quote {
  font-size: 1.125rem;
  line-height: 1.75;
  color: #1f2937;
  font-style: italic;
  margin-bottom: 1rem;
}

@media (min-width: 768px) {
  .testimonial-quote {
    font-size: 1.25rem;
  }
}

.testimonial-author {
  color: #6b7280;
  font-weight: 600;
  margin: 0;
}
</style>
