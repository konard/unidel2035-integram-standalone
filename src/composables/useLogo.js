import { ref, computed } from 'vue'

// Preset logos removed - only dynamic Integram logos are supported
const presetLogos = []

// Dynamic Integram logo colors (generated with SVG color)
const dynamicLogoColors = [
  { name: 'cyan', color: '#06b6d4', label: 'Голубой' },
  { name: 'blue', color: '#3b82f6', label: 'Синий' },
  { name: 'indigo', color: '#6366f1', label: 'Индиго' },
  { name: 'violet', color: '#8b5cf6', label: 'Фиолетовый' },
  { name: 'purple', color: '#a855f7', label: 'Пурпурный' },
  { name: 'pink', color: '#ec4899', label: 'Розовый' },
  { name: 'red', color: '#ef4444', label: 'Красный' },
  { name: 'orange', color: '#f97316', label: 'Оранжевый' },
  { name: 'amber', color: '#f59e0b', label: 'Янтарный' },
  { name: 'yellow', color: '#eab308', label: 'Жёлтый' },
  { name: 'lime', color: '#84cc16', label: 'Лайм' },
  { name: 'green', color: '#22c55e', label: 'Зелёный' },
  { name: 'emerald', color: '#10b981', label: 'Изумрудный' },
  { name: 'teal', color: '#14b8a6', label: 'Бирюзовый' },
  { name: 'sky', color: '#0ea5e9', label: 'Небесный' },
  { name: 'slate', color: '#64748b', label: 'Сланцевый' }
]

// Get saved logo config from localStorage
const getSavedLogoConfig = () => {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem('logoConfig')
  if (!saved) return null

  const config = JSON.parse(saved)

  // Migration: convert old 'preset' type to 'dynamic'
  if (config.type === 'preset') {
    return {
      type: 'dynamic',
      preset: null,
      color: 'blue',
      customSvg: null
    }
  }

  return config
}

const logoConfig = ref(
  getSavedLogoConfig() || {
    type: 'dynamic', // 'preset', 'dynamic', or 'custom'
    preset: null, // name from presetLogos
    color: 'blue', // name from dynamicLogoColors
    customSvg: null
  }
)

export function useLogo() {
  // setPresetLogo removed - only dynamic colors supported now

  const setDynamicColor = (colorName) => {
    logoConfig.value = {
      type: 'dynamic',
      preset: null,
      color: colorName,
      customSvg: null
    }
    saveLogo()
  }

  const setCustomLogo = (svgContent) => {
    logoConfig.value = {
      type: 'custom',
      preset: null,
      color: null,
      customSvg: svgContent
    }
    saveLogo()
  }

  const resetLogo = () => {
    logoConfig.value = {
      type: 'dynamic',
      preset: null,
      color: 'blue',
      customSvg: null
    }
    saveLogo()
  }

  const saveLogo = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('logoConfig', JSON.stringify(logoConfig.value))
    }
  }

  const getCurrentColor = computed(() => {
    if (logoConfig.value.type === 'dynamic') {
      const colorObj = dynamicLogoColors.find((c) => c.name === logoConfig.value.color)
      return colorObj?.color || '#06b6d4'
    }
    return null
  })

  const getCurrentPreset = computed(() => {
    if (logoConfig.value.type === 'preset') {
      return presetLogos.find((p) => p.name === logoConfig.value.preset)
    }
    return null
  })

  const isCustomLogo = computed(() => logoConfig.value.type === 'custom')
  const isPresetLogo = computed(() => logoConfig.value.type === 'preset')
  const isDynamicLogo = computed(() => logoConfig.value.type === 'dynamic')

  const getLogoSvg = computed(() => {
    if (logoConfig.value.type === 'custom' && logoConfig.value.customSvg) {
      return logoConfig.value.customSvg
    }
    return null
  })

  return {
    logoConfig,
    presetLogos, // Empty array - presets removed
    dynamicLogoColors,
    // setPresetLogo removed - no longer supported
    setDynamicColor,
    setCustomLogo,
    resetLogo,
    getCurrentColor,
    getCurrentPreset,
    isCustomLogo,
    isPresetLogo,
    isDynamicLogo,
    getLogoSvg
  }
}
