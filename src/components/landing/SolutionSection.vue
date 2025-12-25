<template>
  <div class="bg-gradient-to-br from-primary-50 to-cyan-50 dark:from-primary-950 dark:to-cyan-950 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.solution.title') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <!-- Speed -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
          <div class="bg-white dark:bg-surface-700 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:flash-on" width="56" height="56" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-2">
            {{ $t('landing.solution.speedDesc') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 text-lg">
            {{ $t('landing.solution.speed') }}
          </p>
        </div>

        <!-- Savings -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
          <div class="bg-white dark:bg-surface-700 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:sales-performance" width="56" height="56" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-2">
            {{ $t('landing.solution.savingsDesc') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 text-lg">
            {{ $t('landing.solution.savings') }}
          </p>
        </div>

        <!-- Simplicity -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
          <div class="bg-white dark:bg-surface-700 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:ok" width="56" height="56" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-2">
            {{ $t('landing.solution.simplicityDesc') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 text-lg">
            {{ $t('landing.solution.simplicity') }}
          </p>
        </div>

        <!-- Scale -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
          <div class="bg-white dark:bg-surface-700 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:positive-dynamic" width="56" height="56" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-2">
            {{ $t('landing.solution.scaleDesc') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 text-lg">
            {{ $t('landing.solution.scale') }}
          </p>
        </div>

        <!-- Availability -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
          <div class="bg-white dark:bg-surface-700 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:clock" width="56" height="56" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-2">
            {{ $t('landing.solution.availabilityDesc') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 text-lg">
            {{ $t('landing.solution.availability') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'

const { t } = useI18n()
</script>
