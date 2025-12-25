<template>
  <div class="bg-surface-0 dark:bg-surface-900 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.problems.title') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Problem 1: Hiring Time -->
        <div class="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:clock" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.hiring') }}
          </h3>
        </div>

        <!-- Problem 2: Salary Costs -->
        <div class="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-2 border-orange-200 dark:border-orange-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:money-transfer" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.salary') }}
          </h3>
        </div>

        <!-- Problem 3: Turnover -->
        <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:leave" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.turnover') }}
          </h3>
        </div>

        <!-- Problem 4: Scaling -->
        <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-2 border-green-200 dark:border-green-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:area-chart" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.scaling') }}
          </h3>
        </div>

        <!-- Problem 5: Training -->
        <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:reading" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.training') }}
          </h3>
        </div>

        <!-- Problem 6: Availability -->
        <div class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl p-8 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:scale-105">
          <div class="mb-4">
            <Icon icon="flat-color-icons:overtime" width="64" height="64" />
          </div>
          <h3 class="text-surface-900 dark:text-surface-100 font-semibold text-lg leading-tight">
            {{ $t('landing.problems.availability') }}
          </h3>
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
