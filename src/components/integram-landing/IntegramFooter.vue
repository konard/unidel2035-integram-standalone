<template>
  <div class="integram-footer">
    <Card class="footer-card">
      <template #content>
        <div class="footer-content">
          <!-- Links Section -->
          <div class="footer-links">
            <a
              v-for="(link, index) in links"
              :key="index"
              :href="link.url"
              :target="link.external ? '_blank' : '_self'"
              :rel="link.external ? 'noopener noreferrer' : ''"
              class="footer-link"
              @click="handleLinkClick($event, link)"
            >
              <i v-if="link.icon" :class="link.icon" class="footer-link-icon" aria-hidden="true"></i>
              {{ link.label }}
              <i v-if="link.external" class="pi pi-external-link" style="font-size: 0.75rem; margin-left: 0.25rem" aria-hidden="true"></i>
            </a>
          </div>

          <!-- Divider -->
          <div class="footer-divider"></div>

          <!-- Copyright Section -->
          <div class="footer-copyright">
            <p class="copyright-text">
              <i class="pi pi-copyright" aria-hidden="true"></i>
              {{ copyrightYear }} {{ copyrightText }}
            </p>
          </div>

          <!-- Additional Info -->
          <div v-if="additionalInfo" class="footer-info">
            <p class="info-text">{{ additionalInfo }}</p>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue'
import Card from 'primevue/card'

const props = defineProps({
  copyrightText: {
    type: String,
    default: 'Integram. Все права защищены.'
  },
  copyrightYear: {
    type: [String, Number],
    default: () => new Date().getFullYear()
  },
  links: {
    type: Array,
    default: () => [
      {
        label: 'Документация',
        url: '#',
        icon: 'pi pi-book',
        external: false
      },
      {
        label: 'API',
        url: '#',
        icon: 'pi pi-code',
        external: false
      },
      {
        label: 'Поддержка',
        url: '#',
        icon: 'pi pi-question-circle',
        external: false
      }
    ]
  },
  additionalInfo: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['link-click'])

function handleLinkClick(event, link) {
  if (!link.external && link.url.startsWith('#')) {
    event.preventDefault()
    emit('link-click', link)
  }
}
</script>

<style scoped>
.integram-footer {
  margin-top: 3rem;
}

.footer-card {
  background: var(--p-card-background);
  border: 1px solid var(--p-card-border-color);
}

.footer-content {
  padding: 1.5rem 0;
  text-align: center;
}

.footer-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-primary-color);
  text-decoration: none;
  font-size: 0.9375rem;
  font-weight: 500;
  transition: all 0.3s ease;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius);
}

.footer-link:hover {
  color: var(--p-primary-600);
  background: var(--p-surface-100);
  transform: translateY(-1px);
}

.footer-link-icon {
  font-size: 1rem;
}

.footer-divider {
  width: 100%;
  height: 1px;
  background: var(--p-surface-border);
  margin: 1rem 0;
}

.footer-copyright {
  margin-bottom: 0.5rem;
}

.copyright-text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.footer-info {
  margin-top: 0.75rem;
}

.info-text {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

/* Responsive Design */
@media (max-width: 768px) {
  .footer-links {
    gap: 1rem;
  }

  .footer-link {
    font-size: 0.875rem;
    padding: 0.4rem 0.6rem;
  }

  .footer-link-icon {
    font-size: 0.875rem;
  }
}

@media (max-width: 480px) {
  .footer-content {
    padding: 1rem 0;
  }

  .footer-links {
    flex-direction: column;
    gap: 0.75rem;
  }

  .copyright-text {
    font-size: 0.8125rem;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-text {
    font-size: 0.75rem;
  }
}

/* Dark mode support (automatically handled by PrimeVue theme variables) */
</style>
