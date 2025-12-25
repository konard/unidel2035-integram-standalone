<template>
  <div v-if="visible" class="contextual-help" :class="position">
    <div class="help-content p-3 border-round shadow-3">
      <div class="flex align-items-start gap-2">
        <i class="pi pi-info-circle text-xl text-primary flex-shrink-0"></i>
        <div class="flex-1">
          <div v-if="title" class="font-semibold mb-1">{{ title }}</div>
          <div class="text-sm text-color-secondary">{{ message }}</div>
          <div v-if="actionLabel" class="mt-2">
            <Button
              :label="actionLabel"
              size="small"
              text
              @click="handleAction"
            />
          </div>
        </div>
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          @click="dismiss"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

import { useOnboardingStore } from '@/stores/onboardingStore'

const props = defineProps({
  helpId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: null,
  },
  message: {
    type: String,
    required: true,
  },
  actionLabel: {
    type: String,
    default: null,
  },
  position: {
    type: String,
    default: 'bottom-right',
    validator: (value) => ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(value),
  },
  showOnce: {
    type: Boolean,
    default: true,
  },
  autoHideDelay: {
    type: Number,
    default: 0, // 0 means no auto-hide
  },
})

const emit = defineEmits(['action', 'dismiss'])

const onboardingStore = useOnboardingStore()
const visible = ref(false)

onMounted(() => {
  // Check if help should be shown
  if (!onboardingStore.preferences.showHints) {
    return
  }

  // Check if this help was already shown
  if (props.showOnce) {
    const shownHelps = JSON.parse(localStorage.getItem('shown_contextual_helps') || '[]')
    if (shownHelps.includes(props.helpId)) {
      return
    }
  }

  // Show help after a small delay
  setTimeout(() => {
    visible.value = true

    // Mark as shown
    if (props.showOnce) {
      const shownHelps = JSON.parse(localStorage.getItem('shown_contextual_helps') || '[]')
      shownHelps.push(props.helpId)
      localStorage.setItem('shown_contextual_helps', JSON.stringify(shownHelps))
    }

    // Auto-hide if specified
    if (props.autoHideDelay > 0) {
      setTimeout(() => {
        visible.value = false
      }, props.autoHideDelay)
    }
  }, 500)
})

const handleAction = () => {
  emit('action')
  dismiss()
}

const dismiss = () => {
  visible.value = false
  emit('dismiss')
}
</script>

<style scoped>
.contextual-help {
  position: fixed;
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

.contextual-help.top-left {
  top: 80px;
  left: 20px;
}

.contextual-help.top-right {
  top: 80px;
  right: 20px;
}

.contextual-help.bottom-left {
  bottom: 20px;
  left: 20px;
}

.contextual-help.bottom-right {
  bottom: 20px;
  right: 20px;
}

.contextual-help.center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.help-content {
  max-width: 400px;
  background-color: var(--surface-card);
  border: 1px solid var(--surface-border);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .contextual-help {
    left: 10px !important;
    right: 10px !important;
    bottom: 10px;
  }

  .help-content {
    max-width: 100%;
  }
}
</style>
