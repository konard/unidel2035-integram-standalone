<script setup>
import { ref, onMounted } from 'vue'
import apiClient from '@/axios2'
import axios from 'axios'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { clearUserCache } from '@/router'
import { useAuthStore } from '@/stores/authStore'
import { getSafeRedirectUrl } from '@/utils/redirectValidation'
import { getDefaultToken } from '@/services/tokenService'

// Initialize auth store with null-check to prevent Pinia initialization errors (Issue #5216)
let authStore = null
try {
  authStore = useAuthStore()
} catch (error) {
  console.warn('[Login] Pinia not ready, deferring authStore initialization to onMounted:', error.message)
  // Store will be initialized in onMounted - this is expected during initial page load
}

const route = useRoute()
const email = ref('')
const password = ref('')
const apiBase = ref(window.location.hostname) // Значение по умолчанию
const showApiBaseInput = ref(false) // Флаг для отображения/скрытия поля API Base
const database = ref('my') // Для хранения выбранной базы данных (DEFAULT: my)
const isLoading = ref(false)
const errorMessage = ref('')
const router = useRouter()
const toast = useToast()

// OAuth loading states
const oauthLoading = ref({
  yandex: false,
  vk: false,
  google: false,
  telegram: false,
})

// API URL for OAuth
const AUTH_API_URL = '/api/auth'

// Опции для выпадающего списка API Base
const apiBaseOptions = ref([
  { label: 'dronedoc.ru', value: 'dronedoc.ru' },
  { label: 'sim.sakhwings.ru', value: 'sim.sakhwings.ru' },
  { label: 'app.integram.io', value: 'app.integram.io' },
  { label: 'localhost', value: 'localhost' },
])

// Функция для получения cookie по имени
const getCookie = name => {
  // console.log(name)
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift()
}

// Проверяем cookies и URL параметры при загрузке компонента
onMounted(() => {
  // Ensure authStore is initialized (fallback if initial initialization failed)
  if (!authStore) {
    try {
      authStore = useAuthStore()
    } catch (error) {
      console.warn('[Login] Pinia still not ready in onMounted:', error.message)
      toast.add({
        severity: 'warn',
        summary: 'Инициализация...',
        detail: 'Система авторизации инициализируется. Пожалуйста, подождите.',
        life: 3000
      })
      return
    }
  }

  // console.log('dd')
  // Issue #3875: DO NOT clear localStorage on mount!
  // This was causing tokens to be deleted after successful login when user is redirected.
  // The Login component may still be mounted during redirect, causing token deletion.
  // Only clear auth data when user explicitly logs out (handled in authStore.logout()).

  // localStorage.removeItem('_xsrf')  // REMOVED
  // localStorage.removeItem('token')  // REMOVED
  // localStorage.removeItem('user')   // REMOVED
  // localStorage.removeItem('id')     // REMOVED
  // clearUserCache()                  // REMOVED

  // Проверяем наличие GET-параметра api
  const urlParams = new URLSearchParams(window.location.search)
  const apiParam = urlParams.get('api')

  if (apiParam) {
    // Если передан параметр api, показываем поле и устанавливаем значение
    showApiBaseInput.value = true
    apiBase.value = apiParam
  } else {
    // Иначе загружаем сохраненный apiBase из localStorage
    const savedApiBase = localStorage.getItem('apiBase')
    if (savedApiBase) apiBase.value = savedApiBase
  }

  // Загружаем сохраненную базу данных из localStorage
  const savedDatabase = localStorage.getItem('db')
  if (savedDatabase) database.value = savedDatabase

  const cookiesToCheck = ['_xsrf', 'token', 'id', 'user']
  const hasAllCookies = cookiesToCheck.every(cookie => getCookie(cookie))
  if (hasAllCookies) {
    // Копируем значения из cookies в localStorage
    cookiesToCheck.forEach(cookie => {
      // console.log(cookie)
      localStorage.setItem(cookie, getCookie(cookie))
    })

    // Issue #5005: Save session timestamp for expiration validation
    localStorage.setItem('session_timestamp', Date.now().toString())

    // Удаляем cookies
    cookiesToCheck.forEach(cookie => {
      document.cookie = `${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
    })

    // Перенаправляем на главную страницу вместо перезагрузки
    router.push('/')
  }
})

const handleSubmit = async () => {
  isLoading.value = true
  errorMessage.value = ''

  try {
    // Ensure authStore is initialized (Issue #5216)
    if (!authStore) {
      try {
        authStore = useAuthStore()
      } catch (error) {
        errorMessage.value = 'Ошибка инициализации системы авторизации. Пожалуйста, обновите страницу.'
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: errorMessage.value,
          life: 5000
        })
        isLoading.value = false
        return
      }
    }

    // Определяем apiBase и database
    // Issue #3806: Use apiBase.value which is loaded from localStorage or URL param,
    // not hardcoded 'dronedoc.ru' when input is hidden
    const finalApiBase = apiBase.value || window.location.hostname
    const finalDatabase = database.value || 'my' // DEFAULT: my

    // Use auth store for multi-database authentication
    // This will authenticate to both the selected database AND ddadmin
    await authStore.login(email.value, password.value, finalApiBase, finalDatabase)

    // Clear user cache after login to force fresh data fetch
    clearUserCache()

    // Fetch default token to show balance in welcome message
    let tokenBalance = null
    try {
      const userToken = localStorage.getItem('token') || authStore.token
      if (userToken) {
        const tokenData = await getDefaultToken(userToken)
        tokenBalance = tokenData.token?.token_balance
      }
    } catch (tokenError) {
      console.warn('Failed to fetch token balance:', tokenError)
      // Non-critical error, continue with login flow
    }

    // Show welcome toast with token balance if available
    toast.add({
      severity: 'success',
      summary: 'Добро пожаловать!',
      detail: tokenBalance
        ? `Ваш баланс: ${tokenBalance.toLocaleString('ru-RU')} токенов. Вы можете использовать AI модели бесплатно!`
        : 'Вы успешно вошли в систему',
      life: 5000,
    })

    // Redirect to original destination or default to /welcome
    // Issue #3786: Validate redirect URL to prevent open redirect and XSS
    // Issue #3788: Properly await router.push to ensure navigation completes
    // Issue #5112: Changed default redirect from /dash to /welcome
    const redirectUrl = getSafeRedirectUrl(route.query.redirect, '/welcome')

    try {
      await router.push(redirectUrl)
    } catch (navigationError) {
      // Handle navigation errors (e.g., navigation cancelled, route not found)
      console.error('Navigation error after login:', navigationError)

      // If redirect URL fails, try fallback to /welcome
      if (redirectUrl !== '/welcome') {
        console.warn('Redirect URL failed, trying fallback /welcome')
        await router.push('/welcome')
      }
    }
  } catch (error) {
    console.error('Authentication error:', error)
    errorMessage.value = 'Неверный логин или пароль'

    toast.add({
      severity: 'error',
      summary: 'Ошибка входа',
      detail: 'Неверный логин или пароль',
      life: 3000,
    })
  } finally {
    isLoading.value = false
  }
}

// Telegram Login Widget callback
// This function is called by the Telegram widget when user authorizes
const onTelegramAuth = async (telegramUser) => {
  oauthLoading.value.telegram = true

  try {
    // Send Telegram auth data to backend
    const response = await axios.post(`${AUTH_API_URL}/oauth/telegram`, telegramUser)

    if (response.data.success) {
      const { userId, username, displayName, accessToken, refreshToken, token, _xsrf } = response.data.data

      // Save tokens to localStorage
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      if (token) localStorage.setItem('token', token)
      if (_xsrf) localStorage.setItem('_xsrf', _xsrf)
      if (userId) localStorage.setItem('id', userId.toString())

      // Issue #5139: Save user for router session validation
      // Router checks accessToken + user for OAuth sessions
      const userName = displayName || username || `tg_${userId}`
      localStorage.setItem('user', userName)

      // Issue #5005: Save session timestamp
      localStorage.setItem('session_timestamp', Date.now().toString())

      // Clear user cache and redirect
      clearUserCache()

      toast.add({
        severity: 'success',
        summary: 'Добро пожаловать!',
        detail: 'Вы успешно вошли через Telegram',
        life: 3000,
      })

      // Use window.location for reliable redirect after Telegram widget auth
      const redirectUrl = getSafeRedirectUrl(route.query.redirect, '/welcome')
      window.location.href = redirectUrl
    }
  } catch (error) {
    console.error('Telegram auth error:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка авторизации',
      detail: error.response?.data?.error || 'Не удалось войти через Telegram',
      life: 3000,
    })
  } finally {
    oauthLoading.value.telegram = false
  }
}

// Make callback available globally for Telegram widget
if (typeof window !== 'undefined') {
  window.onTelegramAuth = onTelegramAuth
}

// Initialize Telegram Login Widget
const initTelegramWidget = () => {
  // Remove existing widget if any
  const existingWidget = document.getElementById('telegram-login-widget')
  if (existingWidget) existingWidget.remove()

  // Create widget container
  const container = document.getElementById('telegram-widget-container')
  if (!container) return

  // Create Telegram widget script
  const script = document.createElement('script')
  script.id = 'telegram-login-widget'
  script.src = 'https://telegram.org/js/telegram-widget.js?22'
  script.setAttribute('data-telegram-login', 'dd_login_bot')
  script.setAttribute('data-size', 'large')
  script.setAttribute('data-radius', '10')
  script.setAttribute('data-onauth', 'onTelegramAuth(user)')
  script.setAttribute('data-request-access', 'write')
  script.async = true

  container.appendChild(script)
}

// Start Telegram auth - initialize widget
const startTelegramAuth = () => {
  // Initialize Telegram Login Widget in place
  initTelegramWidget()

  toast.add({
    severity: 'info',
    summary: 'Telegram',
    detail: 'Нажмите на кнопку "Log in with Telegram" ниже',
    life: 3000,
  })
}

// Функция для переключения видимости поля API Base
const toggleApiBaseInput = () => {
  showApiBaseInput.value = !showApiBaseInput.value
}

// Вычисляемое свойство для отображения поля базы данных
const showDatabaseInput = () => {
  return showApiBaseInput.value
}

// OAuth handlers
const handleOAuthLogin = async (provider) => {
  oauthLoading.value[provider] = true

  try {
    const response = await axios.get(`${AUTH_API_URL}/oauth/${provider}`)

    if (response.data.success) {
      // Redirect to OAuth provider
      window.location.href = response.data.data.authUrl
    }
  } catch (error) {
    console.error(`${provider} OAuth error:`, error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка авторизации',
      detail: `Не удалось подключиться к ${provider}`,
      life: 3000,
    })
    oauthLoading.value[provider] = false
  }
}
</script>

<template>
  <Toast />
  <div
    class="bg-surface-50 dark:bg-surface-950"
    style="display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: hidden;">
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <div style="
          border-radius: 56px;
          padding: 0.3rem;
          background: linear-gradient(
            180deg,
            var(--primary-color) 10%,
            rgba(33, 150, 243, 0) 30%
          );
        ">
        <div class="w-full bg-surface-0 dark:bg-surface-900" style="border-radius: 53px; width: 450px; padding: 2rem 2.5rem;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="svg-container" style="display: none;">
              <svg width="256" height="150" version="1.1" id="svg1" sodipodi:docname="dd4.svg"
                inkscape:version="1.4.1 (93de688d07, 2025-03-30)"
                xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
                xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg"
                xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 512 300" preserveAspectRatio="xMidYMid meet">
                <defs id="defs1" />
                <g class="layer" id="g1" transform="translate(0,200)">
                  <title id="title1">Layer 1</title>
                  <path
                    d="m 7.0298654,-187.64476 c 5.6156266,-1.13042 11.3406496,-1.80502 17.0839036,-1.64093 16.299904,0.25526 33.000924,-1.18511 48.899712,3.22717 13.911439,5.21451 26.418971,14.82306 34.204269,27.56762 11.7053,21.07683 11.46828,48.91794 -2.57079,68.864357 -8.241112,11.322416 -19.818784,20.529856 -33.347339,24.613948 -5.214511,1.750326 -10.62958,3.136 -16.190509,3.008372 -16.081113,-0.09116 -32.162226,0.09116 -48.2433396,-0.255256 -0.1093953,-7.748836 -0.091163,-15.497671 -0.054698,-23.228274 14.2396256,-0.145861 28.4792506,0.03646 42.7188756,0.01823 16.518695,1.002791 32.107529,-10.027905 39.090598,-24.632177 0.200558,-0.9481 0.565209,-2.88075 0.765767,-3.84707 2.625488,-10.06437 2.151441,-21.45972 -3.063069,-30.66716 -4.685767,-8.84279 -12.872184,-15.44297 -22.061391,-19.19888 -18.925392,-3.59181 -38.270133,-0.74753 -57.396083,-1.96911 0.164093,-7.29303 0.1823256,-14.58605 0.1640934,-21.86084 z"
                    fill="#06B6D4" id="svg_3" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 135.91579,-187.95471 c 19.25358,0.34642 38.56186,-0.69284 57.77897,0.65637 2.40669,0.7293 4.83162,1.33098 7.29302,1.93265 14.23962,3.81061 26.45543,14.7866 29.73729,29.46381 1.96912,13.01804 -3.31832,26.34604 -12.98157,35.13413 -3.136,3.04484 -8.20465,5.21451 -7.27479,10.41079 8.97041,5.90735 14.38548,15.771162 18.08669,25.580276 0.58344,1.768558 1.16688,3.537116 1.76856,5.287441 2.47963,5.743255 5.21451,11.395347 6.85544,17.448555 -9.18921,0.0547 -18.36018,0.01823 -27.54939,-0.09116 -1.53154,-4.594604 -3.0813,-9.189208 -4.61284,-13.783811 -0.87516,-2.315535 -1.71386,-4.631069 -2.53432,-6.946604 -3.30009,-8.241114 -9.66326,-14.658977 -17.33916,-18.907157 -16.15404,-3.64652 -32.45395,0.30995 -48.75385,-0.54698 -0.49228,-2.00558 -0.94809,-4.01116 -1.42214,-5.99851 1.22158,-5.77972 0.87516,-11.7053 0.80223,-17.55795 10.61135,-2.352 21.62381,-1.40391 32.38102,-0.63814 6.65488,-0.41935 13.29153,-1.02102 19.94641,-1.568 2.00558,-0.63814 4.0294,-1.22158 6.05321,-1.75033 3.17246,-2.37023 6.14437-4.97748 8.95218-7.76706 0.69284,-1.80503 1.40391,-3.61005 2.13321,-5.37861 0.0729,-3.30009 0.1094,-6.58195 0.18233,-9.86381 -3.2454,-4.21172 -7.07423,-7.93116 -11.30418,-11.12186 -19.38121,-0.92986 -38.78065,-0.21879 -58.16185,-0.27349 -0.20056,-7.91293 -0.16409,-15.82585 -0.0365,-23.72055 z"
                    fill="#06B6D4" id="svg_4" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 281.21102,-182.55787 c 13.60148,-8.40521 30.22957,-8.22289 45.59962,-6.70958 18.19609,3.55534 34.69655,15.22418 43.70343,31.48762 8.93395,15.55237 10.59312,34.76948 5.87088,51.90808 -9.9732,35.04297 -52.67385,55.208176 -86.36761,41.643155 -18.19609,-7.037766 -33.94901,-21.532647 -40.47627,-40.148085 -3.33656,-10.15553 -5.26921,-21.20446 -2.47963,-31.70641 3.70121,-19.6547 17.37563,-36.28279 34.14958,-46.47478 z"
                    fill="#06B6D4" id="svg_5" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 481.02158,-187.75415 c 8.33228,-0.41935 16.68279,-0.38289 25.01507,0.0182 0.21879,41.29674 0.16409,82.59347 -0.0365,123.871976 -5.3239,3.774139 -13.1639,0.71107 -19.47236,1.768558 -15.7894,-19.12595 -30.19311,-39.364084 -45.32613,-59.018784 -4.72224,-6.72781 -10.53842,-12.65339 -14.8413,-19.69115 -0.82047,3.40948 -1.85972,6.83720 -1.75033,10.39255 -0.18232,22.75423 0.20056,45.508458 -0.27349,68.262686 -7.89469,-0.474046 -16.11758,1.057489 -23.73878,-1.640929 0.47404,-41.314967 -0.0547,-82.666407 -0.0182,-123.981367 5.87089,-0.0729 11.72354,-0.0912 17.59442,-0.0547 21.18623,23.81171 40.05692,49.55608 59.65692,74.68054 0.6746,0.0365 2.00558,0.12763 2.66195,0.16409 0.49228,-24.9239 0.29172,-49.8478 0.52874,-74.7717 z"
                    fill="#06B6D4" id="svg_6" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 6.0007673,-37.940259 c 11.1765557,-0.364651 22.3531117,-0.127628 33.5296677,-0.164093 10.374324,0.200558 21.022136,-0.802233 31.031808,2.589022 17.794974,6.290232 32.545107,20.548091 38.798877,38.43423 4.68577,18.45134 4.83163,39.94752 -6.80074,55.97394 C 92.769495,73.71591 76.88894,83.81674 59.622711,87.55442 42.192388,88.26549 24.743834,87.57262 7.2952787,87.8826 7.0764881,80.00614 7.0947206,72.12968 7.3317437,64.27144 21.735462,64.34434 36.13918,64.49023 50.542898,64.34434 54.4082,64.41724 58.091176,63.23216 61.755919,62.15644 72.367266,58.1453 81.155358,50.26884 85.877589,39.89452 89.195914,31.01526 88.338984,21.38847 87.536752,12.14457 83.106241,-0.3265 73.169499,-11.12017 59.823269,-13.76389 41.955365,-16.371145 23.595183,-12.578774 5.8366743,-15.878866 6.0919301,-23.226588 6.055465,-30.59254 6.0007673,-37.940259 Z"
                    fill="#06B6D4" id="svg_7" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 160.46697,-29.352726 c 15.04186,-10.574882 34.53245,-12.507533 52.21803,-9.20744 3.71944,0.948093 7.36595,2.187906 10.90307,3.719441 15.02362,6.746045 28.18753,19.016556 34.40483,34.423065 0.85693,2.37023 1.69563,4.74046 2.58902,7.1107 3.82884,15.18771 3.77414,31.85227 -3.39125,46.09189 -7.62121,14.42196 -19.85525,26.80186 -35.15237,32.928 -14.02083,5.19628 -29.64613,5.61563 -44.04985,1.76856 -15.95348,-4.79517 -29.19031,-16.20875 -38.23366,-29.93786 -9.04335,-14.45841 -10.26493,-32.50864 -6.96484,-48.86324 0.21879,-0.96633 0.69284,-2.89898 0.91163-3.86531 4.79516,-13.984366 15.07832-25.452645 26.76539-34.167806 z"
                    fill="#06B6D4" id="svg_8" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                  <path
                    d="m 283.40908,4.96094 c 10.64781,-25.689668 37.90548,-44.487432 66.03831,-42.810037 12.68986,0 25.37972,0.03647 38.08781,-0.109395 0.85693,7.839999 2.04205,16.062881 -0.38288,23.738788 -16.75572,-0.164093 -33.62083,-0.984558 -50.32185,0.510512 -1.89619,0.674604 -3.81061,1.330976 -5.70679,1.93265 -12.6534,5.214511 -22.49898,16.190512 -26.03609,29.445572 -0.8387,8.05879 -0.92986,16.33637 1.76856,24.08521 2.42493,4.24818 5.10511,8.36874 8.00409,12.32521 4.90455,4.04762 10.192,7.6212 16.17227,9.86381 18.79777,0.58344 37.59553,0.30995 56.39329,0.20056 1.07573,7.87646 1.60447,16.02641 -0.27348,23.82995 -14.34902,-0.23703 -28.71628,-0.47405 -43.0653,-0.36466 -7.94939,0.1094 -16.02641,-0.69283 -23.51999,-3.39125 -18.39665,-7.74884 -31.83404,-24.32223 -38.34307,-42.9012 -3.84706,-11.97879 -2.57079,-24.55925 1.18512-36.35572 z"
                    fill="#06B6D4" id="svg_9" opacity="1" stroke="#06B6D4" stroke-width="0.455814" />
                </g>
              </svg>
            </div>
            <div class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-1">Вход в систему</div>
            <span class="text-muted-color text-sm">Войдите, чтобы продолжить</span>
          </div>

          <div>
            <form @submit.prevent="handleSubmit">
              <!-- Кнопка для показа/скрытия поля API Base -->
              <div class="mb-4 flex justify-end">
                <Button type="button" icon="pi pi-cog" class="p-button-text p-button-sm" @click="toggleApiBaseInput"
                  title="'Настройки API'" />
              </div>

              <InputText id="email1" type="text" placeholder="Логин" class="w-full mb-3" v-model="email" />
              <Password id="password1" v-model="password" placeholder="Пароль" :toggleMask="true" class="mb-3" fluid
                :feedback="false"/>

              <!-- Добавлен отступ сверху для поля выбора API сервера -->
              <div v-if="showApiBaseInput" class="mt-3">
                <label for="apiBase" class="block text-surface-900 dark:text-surface-0 text-sm font-medium mb-1">
                  Сервер API
                </label>
                <Dropdown id="apiBase" v-model="apiBase" :options="apiBaseOptions" optionLabel="label"
                  optionValue="value" placeholder="Выберите сервер API" class="w-full" />
              </div>

              <!-- Поле для выбора базы данных -->
              <div v-if="showDatabaseInput()" class="mt-3">
                <label for="database" class="block text-surface-900 dark:text-surface-0 text-sm font-medium mb-1">
                  База данных (по умолчанию: my)
                </label>
                <InputText id="database" type="text" placeholder="my"
                  class="w-full" v-model="database" />
              </div>

              <Button label="Войти" class="w-full mt-4" type="submit" :loading="isLoading" />

              <div v-if="errorMessage" class="mt-4 text-red-500 text-center">
                {{ errorMessage }}
              </div>
            </form>
          </div>
          <!-- OAuth Section -->
          <div class="mt-4">
            <div class="divider">
              <span>или войти через</span>
            </div>

            <div class="oauth-buttons-row">
              <!-- Яндекс -->
              <button @click="handleOAuthLogin('yandex')" :disabled="oauthLoading.yandex"
                class="oauth-btn oauth-yandex" type="button" title="Яндекс">
                <svg v-if="!oauthLoading.yandex" class="oauth-icon oauth-icon-lg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.14 7.88h-.57c-.81 0-1.35.41-1.35 1.16 0 .66.32 1.05 1.19 1.6l.72.46-2.16 3.4H10.4l1.85-2.91c-1.13-.77-1.73-1.57-1.73-2.7 0-1.54 1.13-2.7 2.96-2.7h2.24v8.32h-1.58V7.88z" fill="currentColor"/>
                </svg>
                <i v-else class="pi pi-spin pi-spinner"></i>
              </button>

              <!-- Google -->
              <button @click="handleOAuthLogin('google')" :disabled="oauthLoading.google"
                class="oauth-btn oauth-google" type="button" title="Google">
                <svg v-if="!oauthLoading.google" class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <i v-else class="pi pi-spin pi-spinner"></i>
              </button>

              <!-- ВКонтакте -->
              <button @click="handleOAuthLogin('vk')" :disabled="oauthLoading.vk"
                class="oauth-btn oauth-vk" type="button" title="ВКонтакте">
                <svg v-if="!oauthLoading.vk" class="oauth-icon" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M25.54 34.58c-10.94 0-17.18-7.5-17.44-19.98h5.48c.18 9.16 4.22 13.04 7.42 13.84V14.6h5.16v7.9c3.16-.34 6.48-3.94 7.6-7.9h5.16c-.86 4.88-4.46 8.48-7.02 9.96 2.56 1.2 6.66 4.36 8.22 10.02h-5.68c-1.22-3.8-4.26-6.74-8.28-7.14v7.14h-.62z" fill="currentColor"/>
                </svg>
                <i v-else class="pi pi-spin pi-spinner"></i>
              </button>

              <!-- Telegram -->
              <button @click="startTelegramAuth" :disabled="oauthLoading.telegram"
                class="oauth-btn oauth-telegram" type="button" title="Telegram">
                <svg v-if="!oauthLoading.telegram" class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" fill="currentColor"/>
                </svg>
                <i v-else class="pi pi-spin pi-spinner"></i>
              </button>
            </div>

            <!-- Telegram Widget Container -->
            <div id="telegram-widget-container" class="telegram-widget-container"></div>
          </div>

          <div class="text-center mt-4">
            <span class="text-muted-color text-sm">Нет аккаунта? </span>
            <router-link to="/register" class="text-primary font-semibold no-underline hover:underline">
              Зарегистрируйтесь здесь
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pi-eye {
  transform: scale(1.6);
  margin-right: 1rem;
}

.pi-eye-slash {
  transform: scale(1.6);
  margin-right: 1rem;
}

.svg-container {
  display: grid;
  place-items: center;
}

.text-muted-color {
  color: var(--text-color-secondary);
}

.hover\:underline:hover {
  text-decoration: underline;
}

/* OAuth Section Styles */
.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 0.5rem 0;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--surface-200);
}

.divider span {
  padding: 0 0.5rem;
}

/* OAuth buttons row */
.oauth-buttons-row {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

/* Square OAuth button */
.oauth-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #fff;
}

.oauth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.oauth-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.oauth-icon {
  width: 24px;
  height: 24px;
}

.oauth-icon-lg {
  width: 28px;
  height: 28px;
}

/* Яндекс */
.oauth-yandex {
  background: #FC3F1D;
}

.oauth-yandex:hover:not(:disabled) {
  background: #E53517;
}

/* Google */
.oauth-google {
  background: #fff;
  border: 1px solid #e0e0e0;
}

.oauth-google:hover:not(:disabled) {
  background: #f5f5f5;
}

/* ВКонтакте */
.oauth-vk {
  background: #0077FF;
}

.oauth-vk:hover:not(:disabled) {
  background: #0066DD;
}

/* Telegram */
.oauth-telegram {
  background: #0088CC;
}

.oauth-telegram:hover:not(:disabled) {
  background: #0077B5;
}

/* Telegram Widget Container */
.telegram-widget-container {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
  min-height: 0;
  transition: min-height 0.3s ease;
}

.telegram-widget-container:not(:empty) {
  min-height: 50px;
}

/* Dark mode support */
.dark .divider::before,
.dark .divider::after {
  border-bottom-color: var(--surface-700);
}

.dark .oauth-google {
  background: #fff;
  border-color: transparent;
}
</style>

