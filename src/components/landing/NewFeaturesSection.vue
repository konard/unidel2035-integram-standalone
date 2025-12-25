<template>
  <div class="bg-surface-0 dark:bg-surface-900 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.features.title') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <!-- Feature 1: Agent Builder -->
        <div class="bg-gradient-to-br from-white to-primary-50 dark:from-surface-800 dark:to-primary-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-primary-200 dark:border-primary-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:puzzle" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.builder') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.builderDesc') }}
          </p>
        </div>

        <!-- Feature 2: Integrations -->
        <div class="bg-gradient-to-br from-white to-cyan-50 dark:from-surface-800 dark:to-cyan-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-cyan-200 dark:border-cyan-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:workflow" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.integrations') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.integrationsDesc') }}
          </p>
        </div>

        <!-- Feature 3: Multichannel -->
        <div class="bg-gradient-to-br from-white to-green-50 dark:from-surface-800 dark:to-green-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-green-200 dark:border-green-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:voice-presentation" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.multichannel') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.multichannelDesc') }}
          </p>
        </div>

        <!-- Feature 4: Analytics -->
        <div class="bg-gradient-to-br from-white to-purple-50 dark:from-surface-800 dark:to-purple-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-purple-200 dark:border-purple-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:line-chart" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.analytics') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.analyticsDesc') }}
          </p>
        </div>

        <!-- Feature 5: Security -->
        <div class="bg-gradient-to-br from-white to-orange-50 dark:from-surface-800 dark:to-orange-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-orange-200 dark:border-orange-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:privacy" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.security') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.securityDesc') }}
          </p>
        </div>

        <!-- Feature 6: Scalability -->
        <div class="bg-gradient-to-br from-white to-pink-50 dark:from-surface-800 dark:to-pink-900/20 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-2 border-pink-200 dark:border-pink-800">
          <div class="bg-white dark:bg-surface-700 rounded-xl w-16 h-16 flex items-center justify-center mb-6 shadow-sm">
            <Icon icon="flat-color-icons:deployment" width="48" height="48" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-0 font-bold text-xl mb-3">
            {{ $t('landing.features.scalability') }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400">
            {{ $t('landing.features.scalabilityDesc') }}
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
