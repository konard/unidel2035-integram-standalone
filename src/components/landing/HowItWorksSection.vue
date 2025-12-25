<template>
  <div class="bg-surface-0 dark:bg-surface-900 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.howItWorks.title') }}
        </h2>
      </div>

      <div class="relative">
        <!-- Timeline connector (desktop only) -->
        <div class="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-primary-300 via-cyan-300 to-purple-300 dark:from-primary-700 dark:via-cyan-700 dark:to-purple-700 -translate-y-1/2"></div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          <!-- Step 1 -->
          <div class="relative flex flex-col items-center text-center">
            <div class="bg-gradient-to-br from-primary-500 to-primary-600 rounded-full w-24 h-24 flex items-center justify-center mb-6 shadow-lg relative z-10">
              <span class="text-white font-bold text-4xl">1</span>
            </div>
            <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300">
              <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-3">
                {{ $t('landing.howItWorks.step1') }}
              </h3>
              <p class="text-surface-600 dark:text-surface-400 text-lg">
                {{ $t('landing.howItWorks.step1Desc') }}
              </p>
              <div class="mt-6">
                <Icon icon="vscode-icons:file-type-coffeelint" width="64" height="64" />
              </div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="relative flex flex-col items-center text-center">
            <div class="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-full w-24 h-24 flex items-center justify-center mb-6 shadow-lg relative z-10">
              <span class="text-white font-bold text-4xl">2</span>
            </div>
            <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300">
              <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-3">
                {{ $t('landing.howItWorks.step2') }}
              </h3>
              <p class="text-surface-600 dark:text-surface-400 text-lg">
                {{ $t('landing.howItWorks.step2Desc') }}
              </p>
              <div class="mt-6">
                <Icon icon="flat-color-icons:data-configuration" width="64" height="64" />
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="relative flex flex-col items-center text-center">
            <div class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-full w-24 h-24 flex items-center justify-center mb-6 shadow-lg relative z-10">
              <span class="text-white font-bold text-4xl">3</span>
            </div>
            <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-md hover:shadow-xl transition-all duration-300">
              <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl mb-3">
                {{ $t('landing.howItWorks.step3') }}
              </h3>
              <p class="text-surface-600 dark:text-surface-400 text-lg">
                {{ $t('landing.howItWorks.step3Desc') }}
              </p>
              <div class="mt-6">
                <Icon icon="flat-color-icons:start" width="64" height="64" />
              </div>
            </div>
          </div>
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
