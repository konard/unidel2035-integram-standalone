<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'

const login = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const agreeToTerms = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const referralCode = ref(null) // Referral code from URL
const toast = useToast()
const router = useRouter()

// OAuth loading states
const oauthLoading = ref({
  yandex: false,
  vk: false,
  google: false,
  telegram: false,
})

// Email Auth Service
import { registerWithEmail } from '@/services/emailAuthService'

// API URLs for OAuth (use relative path to support both dev and production)
const AUTH_API_URL = '/api/auth'

// Valid drondoc.ru mailboxes (from mail server configuration)
const VALID_MAILBOXES = [
  'info@drondoc.ru',
  'admin@drondoc.ru',
  'support@drondoc.ru',
  'sales@drondoc.ru',
  'noreply@drondoc.ru',
  'contact@drondoc.ru',
  'help@drondoc.ru'
]

// Handle Telegram OAuth callback on mount
onMounted(() => {
  // Read referral code from URL query parameter (?ref=CODE)
  const urlParams = new URLSearchParams(window.location.search)
  const refParam = urlParams.get('ref')
  if (refParam) {
    referralCode.value = refParam
    console.log('✅ Referral code from URL:', refParam)
  }

  // Check for Telegram auth result in hash
  const hash = window.location.hash
  if (hash && hash.includes('tgAuthResult=')) {
    try {
      const tgAuthResult = hash.split('tgAuthResult=')[1]
      const authData = JSON.parse(decodeURIComponent(tgAuthResult))

      // Process Telegram auth
      processTelegramAuth(authData)

      // Clear hash
      window.history.replaceState(null, '', window.location.pathname)
    } catch (e) {
      console.error('Failed to parse Telegram auth result:', e)
    }
  }
})

// Process Telegram authentication data
const processTelegramAuth = async (authData) => {
  oauthLoading.value.telegram = true

  try {
    const response = await axios.post(`${AUTH_API_URL}/oauth/telegram`, authData)

    if (response.data.success) {
      const { accessToken, refreshToken, username, displayName } = response.data.data

      // Save tokens
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Добро пожаловать, ${displayName || username}!`,
        life: 3000,
      })

      // Close popup if this is a popup window
      if (window.opener) {
        window.opener.postMessage({ type: 'telegram_auth_success', data: response.data.data }, '*')
        window.close()
      } else {
        // Redirect to welcome page
        setTimeout(() => router.push('/welcome'), 1000)
      }
    }
  } catch (error) {
    console.error('Telegram auth error:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка авторизации',
      detail: error.response?.data?.error || 'Не удалось войти через Telegram',
      life: 5000,
    })
  } finally {
    oauthLoading.value.telegram = false
  }
}

const validateForm = () => {
  if (!login.value || !email.value || !password.value || !confirmPassword.value) return (errorMessage.value = 'Все поля должны быть заполнены') && false

  // Validate email is one of the valid drondoc.ru mailboxes
  if (!VALID_MAILBOXES.includes(email.value.toLowerCase())) {
    errorMessage.value = `Email должен быть одним из: ${VALID_MAILBOXES.join(', ')}`
    return false
  }

  if (password.value !== confirmPassword.value) return (errorMessage.value = 'Пароли не совпадают') && false
  if (password.value.length < 8) return (errorMessage.value = 'Пароль должен содержать минимум 8 символов') && false
  if (!agreeToTerms.value) return (errorMessage.value = 'Вы должны согласиться с условиями использования') && false
  return true
}

const handleSubmit = async () => {
  if (!validateForm()) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка валидации',
      detail: errorMessage.value,
      life: 3000
    })
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const result = await registerWithEmail({
      username: login.value,
      email: email.value,
      password: password.value,
      displayName: login.value,
      referralCode: referralCode.value // Pass referral code to registration
    })

    toast.add({
      severity: 'success',
      summary: 'Проверьте Email',
      detail: 'Письмо с подтверждением отправлено на ' + email.value,
      life: 8000
    })

    // Redirect to email verification page
    setTimeout(() => {
      router.push(`/email-verify?email=${encodeURIComponent(email.value)}`)
    }, 2000)
  } catch (error) {
    console.error('Registration error:', error)
    errorMessage.value = error.message || 'Ошибка регистрации'

    toast.add({
      severity: 'error',
      summary: 'Ошибка регистрации',
      detail: errorMessage.value,
      life: 5000
    })
  } finally {
    isLoading.value = false
  }
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

// Telegram auth callback (called by Telegram widget)
window.onTelegramAuth = async (user) => {
  oauthLoading.value.telegram = true

  try {
    const response = await axios.post(`${AUTH_API_URL}/oauth/telegram`, user)

    if (response.data.success) {
      // Store tokens and user data
      localStorage.setItem('accessToken', response.data.data.accessToken)
      localStorage.setItem('refreshToken', response.data.data.refreshToken)
      localStorage.setItem('user', response.data.data.username || response.data.data.displayName)
      localStorage.setItem('id', response.data.data.userId)
      localStorage.setItem('session_timestamp', Date.now().toString())

      toast.add({
        severity: 'success',
        summary: 'Успешная авторизация',
        detail: 'Вход через Telegram выполнен',
        life: 3000,
      })

      setTimeout(() => {
        router.push('/')
      }, 1000)
    }
  } catch (error) {
    console.error('Telegram auth error:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка Telegram',
      detail: error.response?.data?.error || 'Не удалось войти через Telegram',
      life: 3000,
    })
  } finally {
    oauthLoading.value.telegram = false
  }
}

// Open Telegram Login Widget
const openTelegramLogin = () => {
  oauthLoading.value.telegram = true

  const origin = window.location.origin

  // Telegram Login Widget URL
  const width = 550
  const height = 470
  const left = (window.innerWidth - width) / 2
  const top = (window.innerHeight - height) / 2

  const popup = window.open(
    `https://oauth.telegram.org/auth?bot_id=8383750910&origin=${encodeURIComponent(origin)}&request_access=write&return_to=${encodeURIComponent(origin + '/register')}`,
    'telegram_login',
    `width=${width},height=${height},left=${left},top=${top}`
  )

  // Check if popup was blocked
  if (!popup) {
    oauthLoading.value.telegram = false
    toast.add({
      severity: 'warn',
      summary: 'Popup заблокирован',
      detail: 'Разрешите popup-окна для авторизации через Telegram',
      life: 5000,
    })
    return
  }

  // Listen for message from popup
  const messageHandler = (event) => {
    if (event.data?.type === 'telegram_auth_success') {
      window.removeEventListener('message', messageHandler)
      oauthLoading.value.telegram = false

      const { accessToken, refreshToken, username, displayName } = event.data.data

      // Save tokens
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Добро пожаловать, ${displayName || username}!`,
        life: 3000,
      })

      // Redirect to welcome
      setTimeout(() => router.push('/welcome'), 1000)
    }
  }
  window.addEventListener('message', messageHandler)

  // Check if popup closed without auth
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      window.removeEventListener('message', messageHandler)
      oauthLoading.value.telegram = false
    }
  }, 500)

  // Cleanup after timeout
  setTimeout(() => {
    clearInterval(checkClosed)
    window.removeEventListener('message', messageHandler)
    oauthLoading.value.telegram = false
  }, 120000)
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
                        <div class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-1">Создать аккаунт</div>
                        <span class="text-muted-color text-sm">Начните работу с платформой</span>
                    </div>

                    <div>
                        <form @submit.prevent="handleSubmit">
                            <InputText id="login" type="text" placeholder="Логин"
                                class="w-full" style="margin-bottom: 1rem;" v-model="login" />

                            <Password id="password" v-model="password" placeholder="Пароль" :toggleMask="true"
                                style="margin-bottom: 1rem;" :feedback="false" inputClass="w-full" fluid></Password>

                            <Password id="confirmPassword" v-model="confirmPassword" placeholder="Повторите пароль" :toggleMask="true"
                                style="margin-bottom: 1rem;" :feedback="false" inputClass="w-full" fluid></Password>

                            <div class="flex items-start gap-2 mb-3">
                                <Checkbox v-model="agreeToTerms" :binary="true" inputId="agreeToTerms" />
                                <label for="agreeToTerms" class="text-xs text-surface-700 dark:text-surface-200">
                                    Согласен с
                                    <router-link to="/legal/terms-of-service" target="_blank" class="text-primary font-semibold no-underline hover:underline">условиями</router-link>
                                    и
                                    <router-link to="/legal/privacy-policy" target="_blank" class="text-primary font-semibold no-underline hover:underline">политикой</router-link>
                                </label>
                            </div>

                            <Button label="Зарегистрироваться" class="w-full mb-3" type="submit" :loading="isLoading" />

                            <div v-if="errorMessage" class="text-red-500 text-center text-sm mb-2">
                                {{ errorMessage }}
                            </div>

                            <!-- OAuth Section -->
                            <div class="mt-4">
                                <div class="divider">
                                    <span>или через</span>
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
                                    <button @click="openTelegramLogin" :disabled="oauthLoading.telegram"
                                        class="oauth-btn oauth-telegram" type="button" title="Telegram">
                                        <svg v-if="!oauthLoading.telegram" class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" fill="currentColor"/>
                                        </svg>
                                        <i v-else class="pi pi-spin pi-spinner"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="text-center mt-3">
                                <span class="text-muted-color text-sm">Уже есть аккаунт? </span>
                                <router-link to="/login" class="text-primary font-semibold no-underline hover:underline text-sm">
                                    Войти
                                </router-link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.svg-container {
  display: grid;
  place-items: center;
}

.p-password {
  width: 100%;
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
