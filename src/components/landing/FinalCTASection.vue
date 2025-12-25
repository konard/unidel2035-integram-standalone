<template>
  <section class="py-24 bg-gradient-to-br from-primary-600 via-cyan-600 to-blue-600 dark:from-primary-700 dark:via-cyan-700 dark:to-blue-700">
    <div class="container mx-auto px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
          {{ $t('landing.finalCta.title') }}
        </h2>
        <p class="text-xl sm:text-2xl text-white/90 mb-10 max-w-2xl mx-auto">
          {{ $t('landing.finalCta.subtitle') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <Button
            :label="$t('landing.finalCta.cta')"
            icon="pi pi-arrow-right"
            iconPos="right"
            class="px-8 py-4 text-lg bg-white text-primary-600 hover:bg-surface-50 border-0 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 font-semibold"
            @click="$router.push('/login')"
          />
        </div>

        <p class="text-white/80 text-lg">
          {{ $t('landing.finalCta.demo') }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
