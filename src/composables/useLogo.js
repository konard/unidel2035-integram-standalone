import { ref, computed } from 'vue'

// Predefined colored logo variants from SVG files
const presetLogos = [
  { name: 'blue', file: '/demo/images/dd2.svg', color: '#3b82f6', label: 'Синий' },
  { name: 'red', file: '/demo/images/dd3.svg', color: '#ef4444', label: 'Красный' },
  { name: 'green', file: '/demo/images/dd4.svg', color: '#22c55e', label: 'Зелёный' },
  { name: 'purple', file: '/demo/images/dd5.svg', color: '#a855f7', label: 'Фиолетовый' },
  { name: 'cyan', file: '/demo/images/dd6.svg', color: '#06b6d4', label: 'Голубой' },
  { name: 'pink', file: '/demo/images/dd7.svg', color: '#ec4899', label: 'Розовый' },
  { name: 'gray', file: '/demo/images/dd8.svg', color: '#6b7280', label: 'Серый' }
]

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
  return saved ? JSON.parse(saved) : null
}

const logoConfig = ref(
  getSavedLogoConfig() || {
    type: 'preset', // 'preset', 'dynamic', or 'custom'
    preset: 'orange', // name from presetLogos
    color: 'cyan', // name from dynamicLogoColors
    customSvg: null
  }
)

export function useLogo() {
  const setPresetLogo = (presetName) => {
    logoConfig.value = {
      type: 'preset',
      preset: presetName,
      color: null,
      customSvg: null
    }
    saveLogo()
  }

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
      type: 'preset',
      preset: 'orange',
      color: null,
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
    presetLogos,
    dynamicLogoColors,
    setPresetLogo,
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
