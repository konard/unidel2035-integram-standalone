<template>
  <div class="bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-950 dark:to-surface-900 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.useCases.title') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Customer Support -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="flex items-center mb-6">
            <div class="bg-white dark:bg-surface-700 rounded-lg w-16 h-16 flex items-center justify-center mr-4 shadow-sm">
              <Icon icon="flat-color-icons:support" width="48" height="48" />
            </div>
            <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl">
              {{ $t('landing.useCases.customerSupport.title') }}
            </h3>
          </div>

          <ul class="space-y-3 mb-6">
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.customerSupport.feature1') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.customerSupport.feature2') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.customerSupport.feature3') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.customerSupport.feature4') }}</span>
            </li>
          </ul>

          <div class="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
            <p class="text-sm text-surface-700 dark:text-surface-300 italic font-semibold">
              {{ $t('landing.useCases.customerSupport.case') }}
            </p>
          </div>
        </div>

        <!-- Sales -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="flex items-center mb-6">
            <div class="bg-white dark:bg-surface-700 rounded-lg w-16 h-16 flex items-center justify-center mr-4 shadow-sm">
              <Icon icon="flat-color-icons:sales-performance" width="48" height="48" />
            </div>
            <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl">
              {{ $t('landing.useCases.sales.title') }}
            </h3>
          </div>

          <ul class="space-y-3 mb-6">
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.sales.feature1') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.sales.feature2') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.sales.feature3') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.sales.feature4') }}</span>
            </li>
          </ul>

          <div class="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-4 rounded">
            <p class="text-sm text-surface-700 dark:text-surface-300 italic font-semibold">
              {{ $t('landing.useCases.sales.case') }}
            </p>
          </div>
        </div>

        <!-- Back-office -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="flex items-center mb-6">
            <div class="bg-white dark:bg-surface-700 rounded-lg w-16 h-16 flex items-center justify-center mr-4 shadow-sm">
              <Icon icon="flat-color-icons:business" width="48" height="48" />
            </div>
            <h3 class="text-surface-900 dark:text-surface-0 font-bold text-2xl">
              {{ $t('landing.useCases.backoffice.title') }}
            </h3>
          </div>

          <ul class="space-y-3 mb-6">
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.backoffice.feature1') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.backoffice.feature2') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.backoffice.feature3') }}</span>
            </li>
            <li class="flex items-start">
              <i class="pi pi-check text-green-500 mt-1 mr-3"></i>
              <span class="text-surface-700 dark:text-surface-300">{{ $t('landing.useCases.backoffice.feature4') }}</span>
            </li>
          </ul>

          <div class="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 p-4 rounded">
            <p class="text-sm text-surface-700 dark:text-surface-300 italic font-semibold">
              {{ $t('landing.useCases.backoffice.case') }}
            </p>
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
