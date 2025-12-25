<template>
  <section class="relative min-h-[90vh] flex items-center overflow-hidden bg-gradient-to-br from-white via-blue-50 to-cyan-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-800">
    <!-- Animated background elements -->
    <div class="absolute inset-0 overflow-hidden">
      <div class="absolute w-96 h-96 bg-primary-200/30 dark:bg-primary-500/10 rounded-full blur-3xl -top-48 -left-48 animate-float"></div>
      <div class="absolute w-96 h-96 bg-cyan-200/30 dark:bg-cyan-500/10 rounded-full blur-3xl top-1/2 right-0 animate-float-delayed"></div>
      <div class="absolute w-64 h-64 bg-blue-200/20 dark:bg-blue-500/10 rounded-full blur-3xl bottom-0 left-1/4 animate-float-slow"></div>
    </div>

    <div class="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <!-- Text Content -->
        <div class="text-center lg:text-left space-y-8 animate-fade-in-up">
          <!-- Main Heading -->
          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-cyan-600 dark:from-primary-400 dark:to-cyan-400">
              {{ $t('landing.hero.title') }}
            </span>
          </h1>

          <!-- Subheading -->
          <p class="text-xl sm:text-2xl text-surface-600 dark:text-surface-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
            {{ $t('landing.hero.subtitle') }}
          </p>

          <!-- CTAs -->
          <div class="flex flex-row gap-3 justify-center lg:justify-start flex-wrap">
            <Button
              :label="$t('landing.hero.cta')"
              icon="pi pi-arrow-right"
              iconPos="right"
              class="px-4 py-3 text-base whitespace-nowrap bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 border-0 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300"
              @click="$router.push('/login')"
            />
            <Button
              label="🤖 Агенты"
              icon="pi pi-users"
              outlined
              class="px-4 py-3 text-base whitespace-nowrap border-2 border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-300"
              @click="$router.push('/spaces')"
            />
            <Button
              :label="$t('landing.hero.ctaROI')"
              icon="pi pi-calculator"
              outlined
              class="px-4 py-3 text-base whitespace-nowrap border-2 border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-300"
              @click="$router.push('/must-have-agents')"
            />
          </div>
        </div>

        <!-- Chat Widget for describing employee functions -->
        <div class="relative animate-fade-in-up animation-delay-300">
          <!-- Chat Widget Card -->
          <div class="relative">
            <div class="relative bg-white dark:bg-surface-800 rounded-3xl shadow-2xl overflow-hidden border border-surface-200 dark:border-surface-700">
              <!-- Chat Header -->
              <div class="bg-gradient-to-r from-primary-600 to-cyan-600 p-6 text-white">
                <h3 class="text-2xl font-bold mb-2">{{ $t('landing.hero.chatTitle') }}</h3>
                <p class="text-primary-100">{{ $t('landing.hero.chatSubtitle') }}</p>
              </div>

              <!-- Chat Body -->
              <div class="p-6 space-y-4">
                <!-- Chat Input Area -->
                <div class="bg-surface-50 dark:bg-surface-900 rounded-xl p-4">
                  <Textarea
                    v-model="employeeDescription"
                    :placeholder="$t('landing.hero.chatPlaceholder')"
                    rows="6"
                    class="w-full border-0 bg-transparent focus:ring-0"
                    auto-resize
                  />
                </div>

                <!-- Send Button -->
                <Button
                  :label="$t('landing.hero.chatSend')"
                  icon="pi pi-send"
                  iconPos="right"
                  class="w-full bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                  @click="handleSendDescription"
                  :disabled="!employeeDescription.trim()"
                />

                <!-- Examples -->
                <div class="space-y-2">
                  <p class="text-sm text-surface-600 dark:text-surface-400">Примеры функций:</p>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      v-for="example in examples"
                      :key="example"
                      :label="example"
                      text
                      size="small"
                      class="text-xs"
                      @click="employeeDescription = example"
                    />
                  </div>
                </div>
              </div>

              <!-- Floating UI elements -->
              <div class="absolute top-4 right-4 bg-white dark:bg-surface-800 rounded-xl shadow-lg p-3 animate-float">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span class="text-xs font-medium">{{ $t('landing.socialProof.agents') }}</span>
                </div>
              </div>
            </div>

            <!-- Decorative elements -->
            <div class="absolute -z-10 top-8 right-8 w-72 h-72 bg-gradient-to-br from-primary-400/20 to-cyan-400/20 rounded-full blur-3xl"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
      <i class="pi pi-chevron-down text-2xl text-surface-400"></i>
    </div>

    
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const employeeDescription = ref('')

const examples = [
  'Обработка входящих звонков',
  'Ответы на вопросы клиентов',
  'Обработка заказов',
  'Формирование отчетов'
]

const handleSendDescription = () => {
  if (employeeDescription.value.trim()) {
    // Store the description and redirect to customer journey
    localStorage.setItem('agentDescription', employeeDescription.value)
    router.push('/customer-journey')
  }
}

const handleImageError = (event) => {
  // Fallback to gradient if image fails to load
  event.target.style.display = 'none'
}
</script>

<style scoped>
@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-20px);
  }
}

@keyframes float-delayed {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-15px);
  }
}

@keyframes float-slow {
  0%, 100% {
    transform: translateY(0px) translateX(0px);
  }
  50% {
    transform: translateY(-10px) translateX(10px);
  }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-float-delayed {
  animation: float-delayed 8s ease-in-out infinite;
  animation-delay: 1s;
}

.animate-float-slow {
  animation: float-slow 10s ease-in-out infinite;
  animation-delay: 2s;
}

.animation-delay-300 {
  animation-delay: 300ms;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.8s ease-out forwards;
}

.video-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  height: 0;
  overflow: hidden;
}

.video-container iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
