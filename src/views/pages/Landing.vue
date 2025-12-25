<script setup>
import { onMounted } from 'vue'
import HeaderRu from '@/components/landing-new/HeaderRu.vue'
import HeroRu from '@/components/landing-new/HeroRu.vue'
import ProblemsRu from '@/components/landing-new/ProblemsRu.vue'
import SolutionRu from '@/components/landing-new/SolutionRu.vue'
import UseCasesRu from '@/components/landing-new/UseCasesRu.vue'
import ProcessRu from '@/components/landing-new/ProcessRu.vue'
import FAQRu from '@/components/landing-new/FAQRu.vue'
import ContactRu from '@/components/landing-new/ContactRu.vue'
import FooterRu from '@/components/landing-new/FooterRu.vue'

// SEO Meta Tags
onMounted(() => {
  // Set document title
  document.title = 'ИНТЕГРАМ - безопасная и удобная платформа для управления данными'

  // Set meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.name = 'description'
    document.head.appendChild(metaDescription)
  }
  metaDescription.content = 'Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам. 100% ваши данные. Ваши серверы. Ваш контроль.'

  // Set meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.name = 'keywords'
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.content = 'управление данными, платформа для данных, безопасное хранение данных, автоматизация учета, планирование, отчетность, корпоративная платформа, интеграм'
})
</script>

<template>
  <div class="landing-page">
    <!-- Header with Navigation -->
    <HeaderRu />

    <!-- Main Content -->
    <main class="landing-main">
      <!-- Hero Section -->
      <HeroRu />

      <!-- Problems Section -->
      <ProblemsRu />

      <!-- Solution Section -->
      <section id="solution">
        <SolutionRu />
      </section>

      <!-- Use Cases Section -->
      <section id="use-cases">
        <UseCasesRu />
      </section>

      <!-- Process Section -->
      <section id="process">
        <ProcessRu />
      </section>

      <!-- FAQ Section -->
      <section id="faq">
        <FAQRu />
      </section>

      <!-- Contact Section -->
      <section id="contact">
        <ContactRu />
      </section>
    </main>

    <!-- Footer -->
    <FooterRu />
  </div>
</template>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: #ffffff;
}

.landing-main {
  padding-top: 64px; /* Account for fixed header */
}
</style>
