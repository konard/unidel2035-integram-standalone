import { createI18n } from 'vue-i18n'
import ru from './locales/ru'
import en from './locales/en'
import zh from './locales/zh'

/**
 * Get user's preferred locale
 * Priority: localStorage > browser language > default (ru)
 * Supported locales: ru (Russian), en (English), zh (Chinese)
 */
function getUserLocale() {
  // Check localStorage first
  const savedLocale = localStorage.getItem('locale')
  if (savedLocale && (savedLocale === 'ru' || savedLocale === 'en' || savedLocale === 'zh')) {
    return savedLocale
  }

  // Check browser language
  const browserLang = navigator.language || navigator.userLanguage
  if (browserLang) {
    // Extract language code (e.g., 'en-US' -> 'en')
    const langCode = browserLang.split('-')[0].toLowerCase()
    if (langCode === 'en') {
      return 'en'
    }
    if (langCode === 'zh') {
      return 'zh'
    }
    // Default to Russian for Slavic languages
    if (['ru', 'uk', 'be', 'kk'].includes(langCode)) {
      return 'ru'
    }
  }

  // Default to Russian
  return 'ru'
}

const initialLocale = getUserLocale()

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    ru,
    en,
    zh
  },
  // Additional i18n options
  globalInjection: true,
  missingWarn: false, // Disable warnings for missing translations in production
  fallbackWarn: false
})

// Save initial locale to localStorage if not already saved
if (!localStorage.getItem('locale')) {
  localStorage.setItem('locale', initialLocale)
}

// Set document language attribute for accessibility
document.documentElement.setAttribute('lang', initialLocale)

export default i18n

/**
 * Change application locale
 * @param {string} locale - Locale code ('ru', 'en', or 'zh')
 */
export function setLocale(locale) {
  if (i18n.global.locale) {
    i18n.global.locale.value = locale
    localStorage.setItem('locale', locale)
    document.documentElement.setAttribute('lang', locale)
  }
}

/**
 * Get current locale
 * @returns {string} Current locale code
 */
export function getCurrentLocale() {
  return i18n.global.locale?.value || 'ru'
}
