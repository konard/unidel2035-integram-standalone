<template>
  <div class="language-switcher">
    <button
      @click="toggle"
      class="language-button"
      :title="currentLocaleData.name"
      type="button"
    >
      <span class="flag-display">
        <component :is="currentLocaleData.flagComponent" :width="20" :height="14" />
      </span>
    </button>

    <Popover ref="op" class="language-popover">
      <div class="language-menu">
        <button
          v-for="loc in locales"
          :key="loc.code"
          @click="selectLocale(loc.code)"
          :class="['language-item', { active: currentLocale === loc.code }]"
          type="button"
        >
          <span class="flag-display">
            <component :is="loc.flagComponent" :width="20" :height="14" />
          </span>
          <span class="locale-name">{{ loc.name }}</span>
          <i v-if="currentLocale === loc.code" class="pi pi-check check-icon"></i>
        </button>
      </div>
    </Popover>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlagRU from './flags/FlagRU.vue'
import FlagGB from './flags/FlagGB.vue'
import FlagCN from './flags/FlagCN.vue'

const { locale } = useI18n()

const locales = [
  { code: 'ru', name: 'Русский', flagComponent: FlagRU },
  { code: 'en', name: 'English', flagComponent: FlagGB },
  { code: 'zh', name: '中文', flagComponent: FlagCN }
]

const currentLocale = ref(locale.value)
const op = ref()

const currentLocaleData = computed(() => {
  return locales.find(l => l.code === currentLocale.value) || locales[0]
})

const toggle = (event) => {
  op.value.toggle(event)
}

const changeLocale = (newLocale) => {
  locale.value = newLocale
  currentLocale.value = newLocale
  localStorage.setItem('locale', newLocale)
  document.documentElement.setAttribute('lang', newLocale)
}

const selectLocale = (newLocale) => {
  changeLocale(newLocale)
  op.value.hide()
}

// Watch for external locale changes
watch(locale, (newLocale) => {
  currentLocale.value = newLocale
})
</script>

<style scoped>
.language-switcher {
  display: inline-block;
}

.language-button {
  background: transparent;
  border: none;
  border-radius: 50%;
  padding: 0.5rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
}

.language-button:hover {
  background-color: var(--surface-hover);
}

.flag-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.flag-display svg {
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* Popover menu */
.language-menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
}

.language-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
  text-align: left;
  color: var(--text-color);
}

.language-item:first-child {
  border-radius: 6px 6px 0 0;
}

.language-item:last-child {
  border-radius: 0 0 6px 6px;
}

.language-item:hover {
  background-color: var(--surface-hover);
}

.language-item.active {
  background-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.language-item .locale-name {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
}

.check-icon {
  font-size: 0.75rem;
  opacity: 0.9;
}
</style>

<style>
/* Global styles for Popover */
.language-popover {
  border-radius: 8px !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
}

.language-popover .p-popover-content {
  padding: 0.25rem !important;
}
</style>
