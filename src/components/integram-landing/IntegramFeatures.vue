<template>
  <div class="integram-features">
    <Card v-if="title || subtitle" class="features-card">
      <template #title>
        <div class="features-title">
          {{ title }}
        </div>
      </template>
      <template #subtitle>
        {{ subtitle }}
      </template>
      <template #content>
        <div class="features-grid">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="feature-item"
          >
            <div class="feature-icon-wrapper">
              <i :class="feature.icon" class="feature-icon" aria-hidden="true"></i>
            </div>
            <div class="feature-content">
              <h3 class="feature-title">{{ feature.title }}</h3>
              <p class="feature-description">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Simple grid without card wrapper if no title/subtitle -->
    <div v-else class="features-grid-simple">
      <div
        v-for="(feature, index) in features"
        :key="index"
        class="feature-item-simple"
      >
        <div class="feature-icon-wrapper">
          <i :class="feature.icon" class="feature-icon" aria-hidden="true"></i>
        </div>
        <div class="feature-content">
          <h3 class="feature-title">{{ feature.title }}</h3>
          <p class="feature-description">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'
import Card from 'primevue/card'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  features: {
    type: Array,
    default: () => [
      {
        icon: 'pi pi-shield',
        title: 'Безопасность',
        description: 'Система прав доступа и защита данных'
      },
      {
        icon: 'pi pi-bolt',
        title: 'Удобство',
        description: 'Интуитивный интерфейс для работы с данными'
      },
      {
        icon: 'pi pi-database',
        title: 'Управление данными',
        description: 'Полный контроль над структурой и содержимым'
      }
    ]
  }
})
</script>

<style scoped>
.integram-features {
  margin-bottom: 1.5rem;
}

.features-card {
  background: var(--p-card-background);
  border: 1px solid var(--p-card-border-color);
}

.features-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.features-grid,
.features-grid-simple {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.feature-item,
.feature-item-simple {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem;
  border-radius: var(--p-border-radius);
  transition: all 0.3s ease;
}

.feature-item:hover,
.feature-item-simple:hover {
  background: var(--p-surface-100);
  transform: translateY(-2px);
}

.feature-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  min-width: 3rem;
  min-height: 3rem;
  background: var(--p-primary-color);
  border-radius: var(--p-border-radius);
  flex-shrink: 0;
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-primary-contrast-color);
  font-size: 1.5rem;
}

.feature-content {
  flex: 1;
  min-width: 0;
}

.feature-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--p-text-color);
  line-height: 1.3;
}

.feature-description {
  font-size: 0.9375rem;
  color: var(--p-text-muted-color);
  margin: 0;
  line-height: 1.5;
}

/* Responsive Design */
@media (max-width: 768px) {
  .features-grid,
  .features-grid-simple {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .feature-item,
  .feature-item-simple {
    padding: 0.75rem;
  }

  .feature-icon-wrapper {
    width: 2.5rem;
    height: 2.5rem;
    min-width: 2.5rem;
    min-height: 2.5rem;
  }

  .feature-icon {
    font-size: 1.25rem;
  }

  .feature-title {
    font-size: 1rem;
  }

  .feature-description {
    font-size: 0.875rem;
  }
}

@media (max-width: 480px) {
  .features-title {
    font-size: 1.25rem;
  }
}

/* Dark mode support (automatically handled by PrimeVue theme variables) */
</style>
