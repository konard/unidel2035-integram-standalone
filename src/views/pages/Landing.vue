<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSEO } from '@/composables/useSEO'
import NewHero from '@/components/landing/NewHero.vue'
import ProblemsSection from '@/components/landing/ProblemsSection.vue'
import SolutionSection from '@/components/landing/SolutionSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import UseCasesSection from '@/components/landing/UseCasesSection.vue'
import NewFeaturesSection from '@/components/landing/NewFeaturesSection.vue'
import NewPricingSection from '@/components/landing/NewPricingSection.vue'
import FAQSection from '@/components/landing/FAQSection.vue'
import FinalCTASection from '@/components/landing/FinalCTASection.vue'
import Footer from '@/components/landing/Footer.vue'
import AppConfigurator from '@/layout/AppConfigurator.vue'
import LogoDisplay from '@/components/LogoDisplay.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import Avatar from 'primevue/avatar'

const isMounted = ref(false)
const user = ref(localStorage.getItem('user'))
const userPhoto = ref(localStorage.getItem('currentUserPhoto') || '')

const logout = () => {
  ;['_xsrf', 'token', 'user', 'id'].forEach(key => localStorage.removeItem(key))
  user.value = null
}

// SEO Meta Tags using our custom composable
const { setStructuredData } = useSEO({
  title: 'ИНТЕГРАМ - безопасная и удобная платформа для управления данными',
  description: 'Платформа для управления данными с удобным интерфейсом и высоким уровнем безопасности. Эффективное хранение, обработка и анализ данных для вашего бизнеса.',
  keywords: 'управление данными, база данных, integram, интеграм, хранение данных, обработка данных, безопасность данных, платформа данных',
  url: 'https://integram.ru',
  image: 'https://integram.ru/demo/images/prew.png',
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
    'description': 'Безопасная и удобная платформа для управления данными с интуитивным интерфейсом. Эффективное хранение, обработка и анализ данных для вашего бизнеса.',
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
  <AppConfigurator />
  <div class="bg-surface-0 dark:bg-surface-900 min-h-screen transition-colors duration-300">
    <div class="overflow-hidden">
      <!-- Modern Navigation Header -->
      <header
        class="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-surface-900/80 border-b border-surface-200 dark:border-surface-700"
        :class="{ 'animate-fade-in': isMounted }"
      >
        <div class="container mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <!-- Logo -->
            <div class="flex items-center gap-2">
              <RouterLink
                to="/dashboard"
                class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium"
              >
                <LogoDisplay width="120" height="32" class="hidden sm:block" />
              </RouterLink>
              <span class="text-xl font-bold text-surface-900 dark:text-surface-100 sm:hidden">ИНТЕГРАМ</span>
            </div>

            <!-- Navigation Actions -->
            <div class="flex items-center gap-3" v-if="!user">
              <!-- Language Switcher -->
              <div class="language-switcher-wrapper">
                <LanguageSwitcher />
              </div>
              <RouterLink
                to="/register"
                class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium hidden sm:block"
              >
                Регистрация
              </RouterLink>
              <RouterLink
                to="/login"
                class="bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 text-white px-6 py-2 rounded-full transition-all duration-300 shadow-md hover:shadow-lg font-medium"
              >
                Войти
              </RouterLink>
            </div>

            <div class="flex items-center gap-4" v-else>
              <!-- Language Switcher for logged in users -->
              <div class="language-switcher-wrapper">
                <LanguageSwitcher />
              </div>
              <div class="flex items-center gap-2">
                <Avatar
                  v-if="userPhoto"
                  :image="userPhoto"
                  shape="circle"
                  class="landing-user-avatar"
                />
                <i v-else class="pi pi-user text-surface-700 dark:text-surface-300" />
                <span class="text-surface-700 dark:text-surface-300 hidden sm:block">
                  {{ user }}
                </span>
              </div>
              <button
                @click="logout"
                class="bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-900 dark:text-surface-100 px-4 py-2 rounded-full transition-colors shadow-sm hover:shadow-md font-medium"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Add padding to account for fixed header -->
      <div class="pt-16"></div>

      <!-- Main Content Sections (10 sections) -->
      <main class="space-y-0">
        <!-- 1. Hero Section -->
        <section :class="{ 'animate-fade-in-up delay-100': isMounted }">
          <NewHero />
        </section>

        <!-- 2. Problems Section -->
        <section :class="{ 'animate-fade-in-up delay-200': isMounted }">
          <ProblemsSection />
        </section>

        <!-- 3. Solution Section -->
        <section :class="{ 'animate-fade-in-up delay-300': isMounted }">
          <SolutionSection />
        </section>

        <!-- 4. How It Works Section -->
        <section :class="{ 'animate-fade-in-up delay-400': isMounted }">
          <HowItWorksSection />
        </section>

        <!-- 5. Use Cases Section -->
        <section :class="{ 'animate-fade-in-up delay-500': isMounted }">
          <UseCasesSection />
        </section>

        <!-- 6. Features Section -->
        <section :class="{ 'animate-fade-in-up delay-600': isMounted }">
          <NewFeaturesSection />
        </section>

        <!-- 7. Pricing Section -->
        <section :class="{ 'animate-fade-in-up delay-700': isMounted }">
          <NewPricingSection />
        </section>

        <!-- 8. FAQ Section -->
        <section :class="{ 'animate-fade-in-up delay-800': isMounted }">
          <FAQSection />
        </section>

        <!-- 9. Final CTA Section -->
        <section :class="{ 'animate-fade-in-up delay-900': isMounted }">
          <FinalCTASection />
        </section>

        <!-- 10. Footer -->
        <section :class="{ 'animate-fade-in-up delay-1000': isMounted }">
          <Footer />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.language-switcher-wrapper {
  display: inline-flex;
  align-items: center;
  margin-right: 0.5rem;
}

.language-switcher-wrapper :deep(.language-icon-button) {
  border: 2px solid transparent;
  background: transparent;
  transition: all 0.2s ease;
}

.language-switcher-wrapper :deep(.language-icon-button:hover) {
  background-color: rgba(var(--primary-600-rgb, 37, 99, 235), 0.1);
  border-color: var(--primary-600);
}

.language-switcher-wrapper :deep(.language-icon-button.active) {
  background: linear-gradient(135deg, var(--primary-600), var(--cyan-600));
  border-color: var(--primary-600);
}

/* Adjust for dark mode */
.dark .language-switcher-wrapper :deep(.language-icon-button:hover) {
  background-color: rgba(var(--primary-500-rgb, 59, 130, 246), 0.2);
}

.dark .language-switcher-wrapper :deep(.language-icon-button.active) {
  background: linear-gradient(135deg, var(--primary-500), var(--cyan-500));
}

/* User Avatar */
.landing-user-avatar {
  width: 1.5rem;
  height: 1.5rem;
}

.landing-user-avatar :deep(img) {
  object-fit: cover;
  width: 100%;
  height: 100%;
}
</style>