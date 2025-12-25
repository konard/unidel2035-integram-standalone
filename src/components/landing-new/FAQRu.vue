<template>
  <section class="faq-section">
    <div class="faq-container">
      <h2 class="faq-title">
        Часто задаваемые вопросы
      </h2>

      <Accordion :multiple="false">
        <AccordionTab
          v-for="(faq, index) in faqs"
          :key="index"
          :header="faq.question"
          class="faq-item"
        >
          <p class="faq-answer">{{ faq.answer }}</p>
        </AccordionTab>
      </Accordion>
    </div>
  </section>
</template>

<script setup>
import Accordion from 'primevue/accordion'
import AccordionTab from 'primevue/accordiontab'

const faqs = [
  {
    question: 'Сколько стоит установить систему на нашем предприятии?',
    answer: 'Годовая стоимость лицензии — 290000 рублей. Для сравнения, это стоимость месяца работы среднего аналитика, а вы весь год сможете экономить нервы и сотни часов целой команды.'
  },
  {
    question: 'Насколько сложно установить и поддерживать систему?',
    answer: 'Установку выполняет наша команда. Поддержка требует обычного системного администратора, знакомого с вашей серверной инфраструктурой. Мы предоставляем всю документацию.'
  },
  {
    question: 'Что входит в стоимость лицензии?',
    answer: 'В первый год в неё входят услуги по установке и первичной настройке, а также 20 часов поддержки, что достаточно для запуска небольшого проекта.'
  },
  {
    question: 'Сколько времени займет перенос наших данных из Excel?',
    answer: 'Обычно требуется в пределах недели, чтобы перенести все ваши данные в новую систему, сделать отчеты и дэшборды и настроить права пользователей.'
  },
  {
    question: 'Сможем ли мы сами дорабатывать систему после внедрения?',
    answer: 'Конечно! В этом и есть главная идея конструктора. Ваши сотрудники смогут менять поля, добавлять процессы, создавать новые отчёты без программистов.'
  },
  {
    question: 'Что нужно от нашей IT-инфраструктуры?',
    answer: 'Сервер (виртуальный или физический) под управлением Windows Server или Linux. Подойдёт самая недорогая конфигурация с 2 ядрами и 2ГБ памяти.'
  }
]
</script>

<style scoped>
.faq-section {
  padding: 5rem 1.5rem;
  background: #ffffff;
}

.faq-container {
  max-width: 64rem;
  margin: 0 auto;
}

.faq-title {
  font-size: 2.5rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 4rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .faq-title {
    font-size: 3rem;
  }
}

.faq-answer {
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
  padding: 0.5rem 0;
}

:deep(.p-accordion) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

:deep(.p-accordion-tab) {
  background: white;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.3s ease;
}

:deep(.p-accordion-tab:hover) {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

:deep(.p-accordion-header-link) {
  padding: 1.25rem 1.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
  background: transparent;
  border: none;
}

:deep(.p-accordion-header-link:hover) {
  color: #0077b6;
}

:deep(.p-accordion-content) {
  padding: 0 1.5rem 1.25rem;
  border: none;
}
</style>
