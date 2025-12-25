<template>
  <div class="integram-hero">
    <Card class="hero-card">
      <template #content>
        <div class="hero-content">
          <!-- Icon and Title -->
          <div class="hero-header">
            <i class="pi pi-database hero-icon" aria-hidden="true"></i>
            <h1 class="hero-title">{{ title }}</h1>
          </div>

          <!-- Subtitle -->
          <p class="hero-subtitle">{{ subtitle }}</p>

          <!-- User Info Tags -->
          <div v-if="database || userName" class="hero-tags">
            <Tag v-if="database" :value="database" icon="pi pi-database" severity="info" />
            <Tag v-if="userName" :value="userName" icon="pi pi-user" severity="success" />
          </div>

          <!-- CTA Button -->
          <div v-if="showCta" class="hero-cta">
            <Button
              :label="ctaLabel"
              icon="pi pi-arrow-right"
              iconPos="right"
              size="large"
              @click="handleCtaClick"
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

const props = defineProps({
  title: {
    type: String,
    default: 'Integram'
  },
  subtitle: {
    type: String,
    default: 'Универсальная система управления данными'
  },
  database: {
    type: String,
    default: ''
  },
  userName: {
    type: String,
    default: ''
  },
  showCta: {
    type: Boolean,
    default: false
  },
  ctaLabel: {
    type: String,
    default: 'Начать работу'
  }
})

const emit = defineEmits(['cta-click'])

function handleCtaClick() {
  emit('cta-click')
}
</script>

<style scoped>
.integram-hero {
  margin-bottom: 1.5rem;
}

.hero-card {
  background: var(--p-card-background);
  border: 1px solid var(--p-card-border-color);
}

.hero-content {
  text-align: center;
  padding: 2rem 1rem;
}

.hero-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.hero-icon {
  font-size: 3rem;
  color: var(--p-primary-color);
  animation: fadeInScale 0.6s ease-out;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
  color: var(--p-text-color);
  line-height: 1.2;
}

.hero-subtitle {
  font-size: 1.125rem;
  color: var(--p-text-muted-color);
  margin: 0 0 1.5rem 0;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}

.hero-tags {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.hero-cta {
  margin-top: 2rem;
}

/* Animations */
@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .hero-content {
    padding: 1.5rem 0.75rem;
  }

  .hero-title {
    font-size: 2rem;
  }

  .hero-subtitle {
    font-size: 1rem;
  }

  .hero-icon {
    font-size: 2.5rem;
  }
}

@media (max-width: 480px) {
  .hero-title {
    font-size: 1.75rem;
  }

  .hero-subtitle {
    font-size: 0.9375rem;
  }

  .hero-icon {
    font-size: 2rem;
  }
}

/* Dark mode support (automatically handled by PrimeVue theme variables) */
</style>
