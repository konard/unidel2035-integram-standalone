<template>
  <Card class="checklist-card">
    <template #title>
      <div class="flex align-items-center justify-content-between">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-list-check text-2xl text-primary"></i>
          <span>Быстрый старт</span>
        </div>
        <Badge
          :value="`${completedCount}/${totalCount}`"
          :severity="completedCount === totalCount ? 'success' : 'info'"
        />
      </div>
    </template>

    <template #content>
      <!-- Progress Bar -->
      <div class="mb-4">
        <div class="flex align-items-center justify-content-between mb-2">
          <span class="text-sm font-semibold">Прогресс</span>
          <span class="text-sm text-color-secondary">{{ Math.round(progress) }}%</span>
        </div>
        <ProgressBar :value="progress" :showValue="false" />
      </div>

      <!-- Checklist Items -->
      <div class="flex flex-column gap-3">
        <div
          v-for="item in checklistItems"
          :key="item.id"
          class="checklist-item p-3 border-round cursor-pointer"
          :class="{ completed: item.completed }"
          @click="handleItemClick(item)"
        >
          <div class="flex align-items-center gap-3">
            <Checkbox
              :modelValue="item.completed"
              :binary="true"
              :disabled="item.completed"
              @update:modelValue="toggleItem(item)"
            />
            <div class="flex-1">
              <div class="font-semibold" :class="{ 'line-through': item.completed }">
                {{ item.label }}
              </div>
              <div v-if="item.description" class="text-sm text-color-secondary mt-1">
                {{ item.description }}
              </div>
            </div>
            <Button
              v-if="!item.completed && item.route"
              icon="pi pi-arrow-right"
              text
              rounded
              severity="secondary"
              size="small"
            />
            <i
              v-if="item.completed"
              class="pi pi-check-circle text-xl text-green-500"
            ></i>
          </div>
        </div>
      </div>

      <!-- Completion Message -->
      <div
        v-if="completedCount === totalCount"
        class="mt-4 p-3 border-round bg-green-50 text-green-900"
      >
        <div class="flex align-items-center gap-2">
          <i class="pi pi-trophy text-2xl"></i>
          <div>
            <div class="font-bold">Поздравляем!</div>
            <div class="text-sm">Вы завершили все шаги быстрого старта!</div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-4">
        <Button
          v-if="completedCount < totalCount"
          label="Скрыть"
          severity="secondary"
          text
          size="small"
          @click="hideChecklist"
        />
        <Button
          v-if="completedCount === totalCount"
          label="Сбросить"
          icon="pi pi-refresh"
          severity="secondary"
          text
          size="small"
          @click="resetChecklist"
        />
      </div>
    </template>
  </Card>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboardingStore'

import { useToast } from 'primevue/usetoast'

const router = useRouter()
const onboardingStore = useOnboardingStore()
const toast = useToast()

const checklistItems = computed(() => onboardingStore.checklistItems)
const completedCount = computed(() => onboardingStore.completedChecklistCount)
const totalCount = computed(() => checklistItems.value.length)
const progress = computed(() => onboardingStore.checklistProgress)

const toggleItem = (item) => {
  if (!item.completed) {
    onboardingStore.completeChecklistItem(item.id)

    toast.add({
      severity: 'success',
      summary: 'Отлично!',
      detail: `"${item.label}" выполнено`,
      life: 3000,
    })

    // Check if all items are completed
    if (completedCount.value === totalCount.value) {
      onboardingStore.completeOnboarding()

      toast.add({
        severity: 'success',
        summary: 'Поздравляем!',
        detail: 'Вы завершили онбординг!',
        life: 5000,
      })
    }
  }
}

const handleItemClick = (item) => {
  if (!item.completed && item.route) {
    router.push(item.route)
  }
}

const hideChecklist = () => {
  toast.add({
    severity: 'info',
    summary: 'Чек-лист скрыт',
    detail: 'Вы можете вернуться к нему в любое время в настройках',
    life: 3000,
  })

  // Update preferences to hide checklist
  onboardingStore.updatePreferences({ showChecklist: false })
}

const resetChecklist = () => {
  onboardingStore.checklistItems.forEach(item => {
    item.completed = false
  })

  toast.add({
    severity: 'info',
    summary: 'Чек-лист сброшен',
    detail: 'Начните заново!',
    life: 3000,
  })
}
</script>

<style scoped>
.checklist-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.checklist-item {
  transition: all 0.2s ease;
  border: 1px solid var(--surface-border);
  background-color: var(--surface-card);
}

.checklist-item:hover {
  background-color: var(--surface-hover);
  transform: translateX(4px);
}

.checklist-item.completed {
  background-color: var(--surface-100);
  opacity: 0.8;
}

.line-through {
  text-decoration: line-through;
  opacity: 0.7;
}
</style>
