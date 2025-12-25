<template>
  <section class="problems-section">
    <div class="problems-container">
      <h2 class="problems-title">
        Если ваш бизнес-процесс живёт в Excel, <br />
        <span class="problems-subtitle">вы теряете деньги и нервы каждый день</span>
      </h2>

      <div class="problems-grid">
        <div
          v-for="(problem, index) in problems"
          :key="index"
          class="problem-card"
          :style="{ animationDelay: `${index * 100}ms` }"
        >
          <i :class="`pi ${problem.icon} problem-icon ${problem.color}`"></i>
          <h3 class="problem-title">
            {{ problem.title }}
          </h3>
          <p class="problem-description">
            {{ problem.description }}
          </p>
        </div>
      </div>

      <div class="problems-quote">
        <p>
          «Excel — это отличный калькулятор, но не система управления бизнесом. Он не предназначен для совместной работы и контроля процессов. Он создаёт иллюзию порядка, но на деле — это хаос, который стоит вам денег.»
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
const problems = [
  {
    icon: 'pi-exclamation-circle',
    title: 'Конфликт версий',
    description: '«Какой файл актуальный?» — классика, замедляющая все процессы',
    color: 'text-red'
  },
  {
    icon: 'pi-flag',
    title: 'Ошибки в формулах',
    description: 'Одна неверная ячейка — и бюджет проекта не сходится, ошибки находятся постфактум',
    color: 'text-orange'
  },
  {
    icon: 'pi-shield',
    title: 'Нет защиты данных',
    description: 'Пароль на файл — иллюзия: любой сотрудник может случайно или умышленно скопировать, изменить или удалить все данные',
    color: 'text-blue'
  },
  {
    icon: 'pi-bolt',
    title: 'Хаос и непрозрачность',
    description: 'Непонятно, кто на каком этапе, какие задачи висят, каков статус проекта',
    color: 'text-yellow'
  },
  {
    icon: 'pi-clock',
    title: 'Медленно и не масштабируется',
    description: 'По мере роста бизнеса ваши таблицы превращаются в монстра, которого невозможно обслуживать',
    color: 'text-purple'
  },
  {
    icon: 'pi-ban',
    title: 'Ограниченные возможности таблиц',
    description: 'Нет полной свободы развития проекта, которая есть у дорогих программистов',
    color: 'text-gray'
  }
]
</script>

<style scoped>
.problems-section {
  padding: 5rem 1.5rem;
  background: #ffffff;
}

.problems-container {
  max-width: 75rem;
  margin: 0 auto;
}

.problems-title {
  font-size: 2.5rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .problems-title {
    font-size: 3rem;
  }
}

.problems-subtitle {
  color: #6b7280;
}

.problems-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin-top: 4rem;
}

@media (min-width: 768px) {
  .problems-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .problems-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.problem-card {
  padding: 1.5rem;
  background: white;
  border-left: 4px solid #ff6f42;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.problem-card:hover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.problem-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.text-red { color: #ef4444; }
.text-orange { color: #f97316; }
.text-blue { color: #3b82f6; }
.text-yellow { color: #eab308; }
.text-purple { color: #a855f7; }
.text-gray { color: #6b7280; }

.problem-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #1f2937;
}

.problem-description {
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}

.problems-quote {
  margin-top: 4rem;
  padding: 2rem;
  background: rgba(243, 244, 246, 0.5);
  border-left: 4px solid #0077b6;
  border-radius: 0.75rem;
}

.problems-quote p {
  font-size: 1.125rem;
  line-height: 1.75;
  color: #1f2937;
  font-style: italic;
  margin: 0;
}

@media (min-width: 768px) {
  .problems-quote p {
    font-size: 1.25rem;
  }
}
</style>
