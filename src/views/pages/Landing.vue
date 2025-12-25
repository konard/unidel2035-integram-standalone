<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSEO } from '@/composables/useSEO'
import IntegramHero from '@/components/integram-landing/IntegramHero.vue'
import IntegramFeatures from '@/components/integram-landing/IntegramFeatures.vue'
import IntegramFooter from '@/components/integram-landing/IntegramFooter.vue'
import AppConfigurator from '@/layout/AppConfigurator.vue'
import LogoDisplay from '@/components/LogoDisplay.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import Avatar from 'primevue/avatar'

const router = useRouter()

const isMounted = ref(false)
const user = ref(localStorage.getItem('user'))
const userPhoto = ref(localStorage.getItem('currentUserPhoto') || '')

const logout = () => {
  ;['_xsrf', 'token', 'user', 'id'].forEach(key => localStorage.removeItem(key))
  user.value = null
}

const handleCtaClick = () => {
  if (user.value) {
    router.push('/dashboard')
  } else {
    router.push('/login')
  }
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
                to="/"
                class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium"
              >
                <LogoDisplay width="140" height="32" class="hidden sm:block" />
                <span class="text-xl font-bold text-surface-900 dark:text-surface-100 sm:hidden">ИНТЕГРАМ</span>
              </RouterLink>
            </div>

            <!-- Navigation Menu (Desktop) -->
            <nav class="hidden lg:flex items-center gap-6">
              <a href="#about" class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
                О платформе
              </a>
              <a href="#docs" class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
                Документация
              </a>
              <a href="#contacts" class="text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
                Контакты
              </a>
            </nav>

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
                class="bg-gradient-to-r from-[#0062E6] to-[#33AEFF] hover:from-[#0052C6] hover:to-[#2A9EEF] text-white px-6 py-2 rounded-full transition-all duration-300 shadow-md hover:shadow-lg font-medium"
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

      <!-- Main Content - Minimalist Design -->
      <main class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Hero Section -->
        <section :class="{ 'animate-fade-in-up delay-100': isMounted }">
          <IntegramHero
            title="ИНТЕГРАМ - безопасная и удобная платформа для управления данными"
            subtitle="Платформа для управления данными с удобным интерфейсом и высоким уровнем безопасности"
            :show-cta="true"
            :cta-label="user ? 'Перейти в приложение' : 'Начать работу'"
            @cta-click="handleCtaClick"
          />
        </section>

        <!-- Features Section -->
        <section :class="{ 'animate-fade-in-up delay-200': isMounted }">
          <IntegramFeatures
            title="Ключевые возможности"
            subtitle="Всё необходимое для эффективной работы с данными"
          />
        </section>

        <!-- Footer -->
        <section :class="{ 'animate-fade-in-up delay-300': isMounted }">
          <IntegramFooter
            copyright-text="ИНТЕГРАМ. Все права защищены."
            :links="[
              { label: 'Документация', url: '/docs', icon: 'pi pi-book', external: false },
              { label: 'API', url: '/api', icon: 'pi pi-code', external: false },
              { label: 'Поддержка', url: '/support', icon: 'pi pi-question-circle', external: false }
            ]"
          />
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
  background: linear-gradient(135deg, #0062E6, #33AEFF);
  border-color: #0062E6;
}

/* Adjust for dark mode */
.dark .language-switcher-wrapper :deep(.language-icon-button:hover) {
  background-color: rgba(var(--primary-500-rgb, 59, 130, 246), 0.2);
}

.dark .language-switcher-wrapper :deep(.language-icon-button.active) {
  background: linear-gradient(135deg, #0062E6, #33AEFF);
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