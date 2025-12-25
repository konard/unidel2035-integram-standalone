<script setup>
import { ref, onMounted } from 'vue'
import { useSEO } from '@/composables/useSEO'
import LandingHeader from '@/components/landing/LandingHeader.vue'
import LandingHero from '@/components/landing/LandingHero.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'

const isMounted = ref(false)

// SEO Meta Tags using our custom composable
const { setStructuredData } = useSEO({
  title: 'ИНТЕГРАМ - безопасная и удобная платформа для управления данными',
  description: 'Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам. 100% ваши данные. Ваши серверы. Ваш контроль.',
  keywords: 'управление данными, платформа для данных, безопасное хранение данных, автоматизация учета, планирование, отчетность, корпоративная платформа, интеграм',
  url: 'https://integram.io',
  image: '/images/integram-preview.png',
  type: 'website',
  siteName: 'ИНТЕГРАМ',
  locale: 'ru_RU',
  twitterCard: 'summary_large_image'
})

// Add structured data for SoftwareApplication
onMounted(() => {
  isMounted.value = true

  setStructuredData({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'ИНТЕГРАМ',
    'description': 'Безопасная и удобная платформа для управления данными. Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам.',
    'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'Web',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'RUB'
    }
  })
})
</script>


<template>
  <div class="landing-page">
    <!-- Header with Navigation -->
    <LandingHeader />

    <!-- Main Content -->
    <main class="landing-main">
      <!-- Hero Section -->
      <LandingHero />

      <!-- About Section -->
      <section id="about" class="landing-section">
        <div class="landing-section-container">
          <h2 class="landing-section-title">О платформе</h2>
          <p class="landing-section-text">
            ИНТЕГРАМ - это современная платформа для управления данными, которая устанавливается внутри вашей компании.
            Вы сохраняете полный контроль над своими данными, не доверяя их сторонним сервисам.
          </p>
        </div>
      </section>

      <!-- Features Section -->
      <section id="features" class="landing-section landing-section-alt">
        <div class="landing-section-container">
          <h2 class="landing-section-title">Возможности</h2>
          <div class="landing-features-grid">
            <div class="landing-feature-card">
              <div class="landing-feature-icon">
                <i class="pi pi-lock"></i>
              </div>
              <h3 class="landing-feature-title">Безопасность</h3>
              <p class="landing-feature-text">
                Ваши данные хранятся на ваших серверах. Полный контроль и безопасность.
              </p>
            </div>
            <div class="landing-feature-card">
              <div class="landing-feature-icon">
                <i class="pi pi-chart-line"></i>
              </div>
              <h3 class="landing-feature-title">Автоматизация</h3>
              <p class="landing-feature-text">
                Автоматизируйте учёт, планирование и отчётность в одной системе.
              </p>
            </div>
            <div class="landing-feature-card">
              <div class="landing-feature-icon">
                <i class="pi pi-users"></i>
              </div>
              <h3 class="landing-feature-title">Удобство</h3>
              <p class="landing-feature-text">
                Простой и понятный интерфейс для всех сотрудников компании.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <LandingFooter />
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

/* About and Features Sections */
.landing-section {
  padding: 4rem 1.5rem;
}

.landing-section-alt {
  background: #f9fafb;
}

.landing-section-container {
  max-width: 1200px;
  margin: 0 auto;
}

.landing-section-title {
  font-size: 2.5rem;
  font-weight: bold;
  text-align: center;
  color: #1f2937;
  margin: 0 0 2rem 0;
}

@media (min-width: 768px) {
  .landing-section-title {
    font-size: 3rem;
  }
}

.landing-section-text {
  font-size: 1.125rem;
  line-height: 1.8;
  color: #4b5563;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .landing-section-text {
    font-size: 1.25rem;
  }
}

/* Features Grid */
.landing-features-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-top: 3rem;
}

@media (min-width: 768px) {
  .landing-features-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.landing-feature-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-align: center;
  transition: all 0.3s ease;
}

.landing-feature-card:hover {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  transform: translateY(-5px);
}

.landing-feature-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1.5rem;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 2rem;
}

.landing-feature-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 1rem 0;
}

.landing-feature-text {
  font-size: 1rem;
  line-height: 1.6;
  color: #6b7280;
  margin: 0;
}
</style>