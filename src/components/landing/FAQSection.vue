<template>
  <div class="bg-surface-50 dark:bg-surface-950 px-6 py-20 md:px-12 lg:px-20">
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-surface-900 dark:text-surface-0 font-bold text-4xl lg:text-5xl mb-4">
          {{ $t('landing.faq.title') }}
        </h2>
      </div>

      <Accordion :multiple="true" class="space-y-4">
        <!-- FAQ 1 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q1') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a1') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 2 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q2') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a2') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 3 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q3') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a3') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 4 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q4') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a4') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 5 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q5') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a5') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 6 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q6') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a6') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 7 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q7') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a7') }}
            </p>
          </AccordionContent>
        </AccordionPanel>

        <!-- FAQ 8 -->
        <AccordionPanel>
          <AccordionHeader>
            <span class="font-semibold text-lg">{{ $t('landing.faq.q8') }}</span>
          </AccordionHeader>
          <AccordionContent>
            <p class="text-surface-600 dark:text-surface-400">
              {{ $t('landing.faq.a8') }}
            </p>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
