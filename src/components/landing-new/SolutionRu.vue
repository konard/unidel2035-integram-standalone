<template>
  <section class="solution-section">
    <div class="solution-container">
      <div class="solution-header">
        <h2 class="solution-title">
          ИНТЕГРАМ — это безопасность и свобода
        </h2>
        <p class="solution-description">
          Платформа, которая даёт вам инструменты для создания собственных систем управления данными,
          не зависящих от внешних сервисов и программистов.
        </p>
      </div>

      <div class="benefits-grid">
        <div
          v-for="(benefit, index) in benefits"
          :key="index"
          class="benefit-card"
        >
          <i :class="`pi ${benefit.icon} benefit-icon`"></i>
          <h3 class="benefit-title">
            {{ benefit.title }}
          </h3>
          <p class="benefit-description">
            {{ benefit.description }}
          </p>
        </div>
      </div>

      <div class="onpremise-section">
        <h3 class="onpremise-title">
          Почему on-premise решение?
        </h3>
        <div class="onpremise-grid">
          <div v-for="(reason, index) in onPremiseReasons" :key="index" class="onpremise-item">
            <h4 class="onpremise-item-title">✓ {{ reason.title }}</h4>
            <p class="onpremise-item-description">
              {{ reason.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const benefits = [
  {
    icon: 'pi-shield',
    title: 'Полный контроль над данными',
    description: 'ИНТЕГРАМ устанавливается на ваших серверах. Никаких облаков, никакой передачи данных третьим лицам.'
  },
  {
    icon: 'pi-lock',
    title: 'Безопасность на уровне предприятия',
    description: 'Разграничение прав доступа, история изменений, резервное копирование — всё как в серьёзных корпоративных системах.'
  },
  {
    icon: 'pi-wrench',
    title: 'Конструктор для ваших процессов',
    description: 'Не нужны программисты! Ваши сотрудники могут сами настраивать поля, правила, формы и отчёты.'
  },
  {
    icon: 'pi-bolt',
    title: 'Автоматизация рутины',
    description: 'Забудьте про ручной ввод данных и сверку файлов. Всё работает автоматически по заданным правилам.'
  },
  {
    icon: 'pi-clock',
    title: 'Всегда актуальные данные',
    description: 'Все работают с одной версией данных в реальном времени. Никаких конфликтов версий.'
  },
  {
    icon: 'pi-users',
    title: 'Совместная работа',
    description: 'Все видят актуальную информацию, знают, кто и что делает, прозрачность на всех этапах.'
  }
]

const onPremiseReasons = [
  {
    title: 'Ваши данные остаются у вас',
    description: 'Конфиденциальная информация не покидает вашу инфраструктуру. Соблюдение требований безопасности и регуляторов.'
  },
  {
    title: 'Независимость от внешних сервисов',
    description: 'Не зависите от доступности интернета или решений сторонних компаний. Полный контроль.'
  },
  {
    title: 'Настройка под ваши нужды',
    description: 'Интеграция с вашими системами, адаптация под ваши процессы и требования.'
  },
  {
    title: 'Разумная стоимость владения',
    description: 'Один раз платите за лицензию и работаете сколько нужно. Без ежемесячных подписок за каждого пользователя.'
  }
]
</script>

<style scoped>
.solution-section {
  padding: 5rem 1.5rem;
  background: #ffffff;
}

.solution-container {
  max-width: 75rem;
  margin: 0 auto;
}

.solution-header {
  text-align: center;
  margin-bottom: 4rem;
}

.solution-title {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .solution-title {
    font-size: 3rem;
  }
}

.solution-description {
  font-size: 1.25rem;
  color: #6b7280;
  max-width: 48rem;
  margin: 0 auto;
  line-height: 1.6;
}

.benefits-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin-bottom: 4rem;
}

@media (min-width: 768px) {
  .benefits-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .benefits-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.benefit-card {
  padding: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.benefit-card:hover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.benefit-icon {
  font-size: 3rem;
  color: #0077b6;
  margin-bottom: 1rem;
}

.benefit-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #1f2937;
}

.benefit-description {
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}

.onpremise-section {
  background: linear-gradient(135deg, rgba(0, 119, 182, 0.1), rgba(255, 111, 66, 0.1));
  border-radius: 1rem;
  padding: 2rem;
  border: 2px solid rgba(0, 119, 182, 0.2);
}

@media (min-width: 768px) {
  .onpremise-section {
    padding: 3rem;
  }
}

.onpremise-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  text-align: center;
  color: #1f2937;
}

@media (min-width: 768px) {
  .onpremise-title {
    font-size: 1.875rem;
  }
}

.onpremise-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .onpremise-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.onpremise-item {
  font-size: 1.125rem;
}

.onpremise-item-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #0077b6;
}

.onpremise-item-description {
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}
</style>
