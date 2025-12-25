<template>
  <div class="bg-surface-50 dark:bg-surface-950 px-6 py-20 md:px-12 lg:px-20">
    <div class="flex flex-col gap-4 items-center justify-center mb-12">
      <div class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl text-center leading-tight">
        {{ $t('landing.pricing.title') }}
      </div>
    </div>

    <div class="flex lg:flex-row flex-col gap-8 max-w-7xl mx-auto">
      <!-- Starter -->
      <div class="w-full flex-1 p-8 flex rounded-2xl flex-col bg-surface-0 dark:bg-surface-800 shadow-sm gap-6">
        <div class="flex flex-col gap-2">
          <h4 class="text-surface-900 dark:text-surface-0 font-medium text-xl leading-tight">
            {{ $t('landing.pricing.starter.title') }}
          </h4>
        </div>

        <div class="w-full h-px bg-surface-200 dark:bg-surface-700" />
        <div class="flex items-center gap-2">
          <span class="font-bold text-3xl text-surface-900 dark:text-surface-0 leading-tight">
            {{ $t('landing.pricing.starter.price') }}
          </span>
        </div>
        <div class="w-full h-px bg-surface-200 dark:bg-surface-600" />
        <ul class="list-none flex flex-col gap-4 flex-1">
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.starter.agent') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.starter.interactions') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.starter.integrations') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.starter.support') }}</span>
          </li>
        </ul>
        <Button :label="$t('landing.pricing.starter.cta')" rounded class="w-full" @click="$router.push('/welcome')" />
      </div>

      <!-- Business -->
      <div class="w-full flex-1 p-8 flex rounded-2xl flex-col bg-surface-0 dark:bg-surface-800 shadow-sm gap-6 border-2 border-primary-500">
        <div class="flex flex-col gap-2">
          <h4 class="text-surface-900 dark:text-surface-0 font-medium text-xl leading-tight">
            {{ $t('landing.pricing.business.title') }}
          </h4>
        </div>

        <div class="w-full h-px bg-surface-200 dark:bg-surface-700" />
        <div class="flex items-center gap-2">
          <span class="font-bold text-3xl text-surface-900 dark:text-surface-0 leading-tight">
            {{ $t('landing.pricing.business.price') }}
          </span>
        </div>
        <div class="w-full h-px bg-surface-200 dark:bg-surface-600" />
        <ul class="list-none flex flex-col gap-4 flex-1">
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.business.agents') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.business.interactions') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.business.integrations') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.business.support') }}</span>
          </li>
        </ul>
        <Button :label="$t('landing.pricing.business.cta')" rounded class="w-full" severity="primary" @click="$router.push('/welcome')" />
      </div>

      <!-- Enterprise -->
      <div class="w-full flex-1 p-8 flex rounded-2xl flex-col bg-surface-0 dark:bg-surface-800 shadow-sm gap-6">
        <div class="flex flex-col gap-2">
          <h4 class="text-surface-900 dark:text-surface-0 font-medium text-xl leading-tight">
            {{ $t('landing.pricing.enterprise.title') }}
          </h4>
        </div>

        <div class="w-full h-px bg-surface-200 dark:bg-surface-700" />
        <div class="flex items-center gap-2">
          <span class="font-bold text-3xl text-surface-900 dark:text-surface-0 leading-tight">
            {{ $t('landing.pricing.enterprise.price') }}
          </span>
        </div>
        <div class="w-full h-px bg-surface-200 dark:bg-surface-600" />
        <ul class="list-none flex flex-col gap-4 flex-1">
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.enterprise.agents') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.enterprise.server') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.enterprise.sla') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <i class="pi pi-check-circle text-lg! text-green-500" />
            <span class="text-surface-800 dark:text-surface-100 leading-tight">{{ $t('landing.pricing.enterprise.manager') }}</span>
          </li>
        </ul>
        <Button :label="$t('landing.pricing.enterprise.cta')" rounded class="w-full" severity="secondary" @click="$router.push('/welcome')" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
