import { createI18n } from 'vue-i18n'

// Simple i18n setup with minimal messages
const messages = {
  en: {
    welcome: 'Welcome'
  },
  ru: {
    welcome: 'Добро пожаловать'
  }
}

export default createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'en',
  messages
})
