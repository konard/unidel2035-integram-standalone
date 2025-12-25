<template>
  <div class="integram-login-page flex align-items-center justify-content-center min-h-screen">
    <div class="surface-card p-5 shadow-2 border-round" style="max-width: 450px; width: 100%;">
      <!-- Header -->
      <div class="flex align-items-center mb-4" style="width: 100%; justify-content: space-between;">
        <div class="flex align-items-center gap-2">
          <!-- Integram Logo -->
          <svg width="40" height="34" viewBox="0 0 40 34" fill="none" xmlns="http://www.w3.org/2000/svg" class="integram-logo flex-shrink-0">
            <g clip-path="url(#clip0_login)">
              <path d="M21.0983 12.4256L19.5194 14.1254L22.2153 17.0289L13.4346 26.3889L2.28812 22.7817V11.2779L13.4346 7.67068L15.452 9.87038L17.0454 8.19038L14.1005 5L0 9.56361V24.4959L14.1005 29.0595L25.3877 17.0289L21.0983 12.4256Z" fill="currentColor"/>
              <path d="M15.4718 21.634L17.0489 19.9341L14.3548 17.0307L23.1356 7.67068L34.2802 11.2779V22.7817L23.1356 26.3889L21.1127 24.1838L19.5193 25.8656L22.4679 29.0595L36.5683 24.4977V9.56361L22.4679 5L11.1807 17.0307L15.4718 21.634Z" fill="currentColor"/>
            </g>
            <defs>
              <clipPath id="clip0_login">
                <rect width="36.6316" height="24" fill="white" transform="translate(0 5)"/>
              </clipPath>
            </defs>
          </svg>
          <span class="text-2xl font-semibold">Integram</span>
        </div>

        <!-- Language Toggle -->
        <div class="flex gap-1">
          <Button
            label="RU"
            :severity="locale === 'ru' ? 'primary' : 'secondary'"
            size="small"
            @click="locale = 'ru'"
            :text="locale !== 'ru'"
          />
          <Button
            label="EN"
            :severity="locale === 'en' ? 'primary' : 'secondary'"
            size="small"
            @click="locale = 'en'"
            :text="locale !== 'en'"
          />
        </div>
      </div>

      <!-- Active Databases Section -->
      <div v-if="authenticatedDatabases.length > 0 && mode === 'login'" class="databases-section mb-4">
        <!-- Active Databases -->
        <div class="db-category-card mb-3">
          <div class="category-header">
            <i class="pi pi-check-circle"></i>
            <span>{{ t('activeDatabases') }}</span>
          </div>
          <div class="flex flex-wrap gap-2 justify-content-center">
            <Button
              v-for="db in authenticatedDatabases"
              :key="db.name"
              :label="db.name"
              severity="success"
              outlined
              @click="enterDatabase(db.name)"
              v-tooltip.top="`${t('enterDatabase')}: ${db.name}`"
            >
              <template #icon>
                <i class="pi pi-database mr-2"></i>
              </template>
            </Button>
          </div>
        </div>

        <!-- Owned Databases -->
        <div v-if="ownedDatabases.length > 0" class="db-category-card">
          <div class="category-header secondary">
            <i class="pi pi-server"></i>
            <span>{{ t('ownedDatabases') }}</span>
          </div>
          <div class="flex flex-wrap gap-2 justify-content-center">
            <Button
              v-for="dbName in ownedDatabases"
              :key="dbName"
              :label="dbName"
              size="small"
              outlined
              @click="enterDatabase(dbName)"
            >
              <template #icon>
                <i class="pi pi-database mr-2"></i>
              </template>
            </Button>
          </div>
        </div>

        <Divider />

        <!-- Logout Button -->
        <div class="mt-3">
          <Button
            :label="t('logout')"
            icon="pi pi-sign-out"
            severity="danger"
            size="small"
            class="w-full"
            @click="handleLogout"
          />
        </div>
      </div>

      <!-- Login Form -->
      <form v-if="mode === 'login'" @submit.prevent="handleLogin">
        <h4 class="text-center mb-4">{{ t('loginTitle') }}</h4>

        <!-- Server Selection -->
        <div v-if="showServerInput" class="field mb-3">
          <label for="server" class="block text-sm font-medium mb-2">{{ t('server') }}</label>
          <Select
            id="server"
            v-model="loginForm.server"
            :options="serverOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div class="text-center mb-3">
          <a href="#" @click.prevent="showServerInput = !showServerInput" class="text-sm text-primary">
            {{ showServerInput ? t('hideServerInput') : t('showServerInput') }}
          </a>
        </div>

        <!-- Database -->
        <div class="field mb-3">
          <label for="database" class="block text-sm font-medium mb-2">{{ t('database') }}</label>
          <InputText
            id="database"
            v-model="loginForm.database"
            class="w-full"
            :class="{ 'p-invalid': errors.database }"
          />
          <small v-if="errors.database" class="p-error">{{ errors.database }}</small>
        </div>

        <!-- Login -->
        <div class="field mb-3">
          <label for="login" class="block text-sm font-medium mb-2">{{ t('loginLabel') }}</label>
          <InputText
            id="login"
            v-model="loginForm.login"
            class="w-full"
            :class="{ 'p-invalid': errors.login }"
            @keyup.enter="handleLogin"
          />
          <small v-if="errors.login" class="p-error">{{ errors.login }}</small>
        </div>

        <!-- Password -->
        <div class="field mb-3">
          <label for="password" class="block text-sm font-medium mb-2">{{ t('password') }}</label>
          <Password
            id="password"
            v-model="loginForm.password"
            :feedback="false"
            toggleMask
            class="w-full"
            inputClass="w-full"
            :class="{ 'p-invalid': errors.password }"
            @keyup.enter="handleLogin"
          />
          <small v-if="errors.password" class="p-error">{{ errors.password }}</small>
        </div>

        <Message v-if="error" severity="error" :closable="false" class="mb-3">
          {{ t('wrongCredentials') }}
        </Message>

        <Button
          type="submit"
          :label="t('signIn')"
          :loading="loading"
          class="w-full mb-3"
        />

        <div class="flex text-sm mb-3" style="justify-content: space-between;">
          <a href="#" @click.prevent="mode = 'reset'" class="text-primary">
            {{ t('resetPassword') }}
          </a>
          <a href="#" @click.prevent="showHelp = true" class="text-primary">
            {{ t('cantLogin') }}
          </a>
        </div>

        <Divider />

        <Button
          :label="t('signInWithGoogle')"
          icon="pi pi-google"
          outlined
          class="w-full mb-3"
          @click="handleGoogleSignIn"
        />

        <div class="text-center">
          <a href="#" @click.prevent="mode = 'register'" class="text-primary">
            {{ t('createAccount') }}
          </a>
        </div>
      </form>

      <!-- Registration Form -->
      <form v-else-if="mode === 'register'" @submit.prevent="handleRegister">
        <h4 class="text-center mb-4">{{ t('registerTitle') }}</h4>

        <div class="field mb-3">
          <label for="email" class="block text-sm font-medium mb-2">{{ t('email') }}</label>
          <InputText
            id="email"
            v-model="registerForm.email"
            type="email"
            class="w-full"
            :class="{ 'p-invalid': errors.email }"
          />
          <small v-if="errors.email" class="p-error">{{ errors.email }}</small>
        </div>

        <div class="field mb-3">
          <label for="regPassword" class="block text-sm font-medium mb-2">{{ t('password') }}</label>
          <Password
            id="regPassword"
            v-model="registerForm.password"
            :feedback="true"
            toggleMask
            class="w-full"
            inputClass="w-full"
            :class="{ 'p-invalid': errors.regPassword }"
          />
          <small v-if="errors.regPassword" class="p-error">{{ errors.regPassword }}</small>
        </div>

        <div class="field mb-3">
          <label for="regPassword2" class="block text-sm font-medium mb-2">{{ t('repeatPassword') }}</label>
          <Password
            id="regPassword2"
            v-model="registerForm.password2"
            :feedback="false"
            toggleMask
            class="w-full"
            inputClass="w-full"
            :class="{ 'p-invalid': errors.regPassword2 }"
          />
          <small v-if="errors.regPassword2" class="p-error">{{ errors.regPassword2 }}</small>
        </div>

        <div class="flex align-items-center gap-2 mb-3">
          <Checkbox
            id="agree"
            v-model="registerForm.agree"
            :binary="true"
            :class="{ 'p-invalid': errors.agree }"
          />
          <label for="agree" class="text-sm">
            {{ t('acceptTerms') }} {{ t('termsLink') }}
          </label>
        </div>

        <Message v-if="registerSuccess" severity="success" :closable="false" class="mb-3">
          {{ t('registrationSuccess') }}
        </Message>

        <Message v-if="error" severity="error" :closable="false" class="mb-3">
          {{ error }}
        </Message>

        <Button
          v-if="!registerSuccess"
          type="submit"
          :label="t('register')"
          :loading="loading"
          class="w-full mb-3"
        />

        <div class="text-center">
          <a href="#" @click.prevent="mode = 'login'" class="text-primary">
            {{ t('haveAccount') }}
          </a>
        </div>
      </form>

      <!-- Reset Password Form -->
      <form v-else-if="mode === 'reset'" @submit.prevent="handleReset">
        <h4 class="text-center mb-4">{{ t('resetPasswordTitle') }}</h4>
        <p class="text-sm text-color-secondary mb-3">{{ t('resetInstructions') }}</p>

        <div class="field mb-3">
          <label for="resetDb" class="block text-sm font-medium mb-2">{{ t('database') }}</label>
          <InputText
            id="resetDb"
            v-model="resetForm.database"
            class="w-full"
            :class="{ 'p-invalid': errors.resetDb }"
          />
        </div>

        <div class="field mb-3">
          <label for="resetLogin" class="block text-sm font-medium mb-2">{{ t('loginOrEmail') }}</label>
          <InputText
            id="resetLogin"
            v-model="resetForm.login"
            class="w-full"
            :class="{ 'p-invalid': errors.resetLogin }"
          />
          <small v-if="errors.resetLogin" class="p-error">{{ errors.resetLogin }}</small>
        </div>

        <Message v-if="resetSuccess" severity="success" :closable="false" class="mb-3">
          {{ t('resetSuccess') }}
        </Message>

        <Message v-if="error" severity="error" :closable="false" class="mb-3">
          {{ error }}
        </Message>

        <Button
          v-if="!resetSuccess"
          type="submit"
          :label="t('sendPassword')"
          :loading="loading"
          class="w-full mb-3"
        />

        <div class="text-center">
          <a href="#" @click.prevent="mode = 'login'" class="text-primary">
            {{ t('cancel') }}
          </a>
        </div>
      </form>

      <!-- Help Section -->
      <div v-if="showHelp" class="mt-4 pt-4 border-top-1 surface-border">
        <h5 class="text-center mb-3">{{ t('helpTitle') }}</h5>
        <p class="text-center text-sm mb-3">{{ t('helpQuestion') }}</p>

        <div class="flex justify-content-center gap-2 mb-3">
          <Button :label="t('yes')" outlined size="small" @click="helpMode = 'google'" />
          <Button :label="t('no')" outlined size="small" @click="helpMode = 'noGoogle'" />
          <Button :label="t('dontRemember')" outlined size="small" @click="helpMode = 'unknown'" />
        </div>

        <p v-if="helpMode === 'google'" class="text-sm text-color-secondary">
          {{ t('helpGoogle') }}
        </p>
        <p v-if="helpMode === 'noGoogle'" class="text-sm text-color-secondary" v-html="t('helpNoGoogle')"></p>
        <p v-if="helpMode === 'unknown'" class="text-sm text-color-secondary" v-html="t('helpUnknown')"></p>

        <div class="text-center mt-3">
          <a href="#" @click.prevent="showHelp = false; helpMode = null" class="text-primary">
            {{ t('backToLogin') }}
          </a>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import integramApiClient from '@/services/integramApiClient'
import integramService from '@/services/integramService'
import { getSafeRedirectUrl } from '@/utils/redirectValidation'

// PrimeVue components
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Divider from 'primevue/divider'
import Tag from 'primevue/tag'

const router = useRouter()
const route = useRoute()
const toast = useToast()

// State
const mode = ref('login')
const loading = ref(false)
const error = ref(null)
const registerSuccess = ref(false)
const resetSuccess = ref(false)
const showHelp = ref(false)
const helpMode = ref(null)
const locale = ref('ru')
const errors = ref({})
const showServerInput = ref(false)

// Server options
const serverOptions = ref([
  { label: 'dronedoc.ru', value: 'https://dronedoc.ru' },
  { label: 'integram.io', value: 'https://integram.io' },
  { label: 'app.integram.io', value: 'https://app.integram.io' }
])

// Database to server mapping
const databaseServerMap = {
  'my': 'https://dronedoc.ru',
  'a2025': 'https://dronedoc.ru',
  'andy': 'https://app.integram.io'
}

// Forms
const loginForm = ref({
  server: 'https://dronedoc.ru',
  database: 'my',
  login: '',
  password: ''
})

const registerForm = ref({
  email: '',
  password: '',
  password2: '',
  agree: false
})

const resetForm = ref({
  database: '',
  login: ''
})

// Issue #5112: Computed properties for authenticated databases
const authenticatedDatabases = computed(() => {
  const databases = []
  for (const [dbName, dbSession] of Object.entries(integramApiClient.databases)) {
    databases.push({
      name: dbName,
      userName: dbSession.userName,
      userRole: dbSession.userRole,
      isPrimary: dbName === 'my'
    })
  }
  return databases.sort((a, b) => {
    if (a.name === 'my') return -1
    if (b.name === 'my') return 1
    return a.name.localeCompare(b.name)
  })
})

const ownedDatabases = computed(() => {
  const mySession = integramApiClient.databases['my']
  if (!mySession || !mySession.ownedDatabases) return []

  // Filter out databases that are already authenticated
  return mySession.ownedDatabases.filter(
    dbName => !integramApiClient.databases[dbName]
  )
})

// Auto-select server based on database
watch(() => loginForm.value.database, (newDatabase) => {
  if (databaseServerMap[newDatabase]) {
    loginForm.value.server = databaseServerMap[newDatabase]
  }
})

// Translations
const translations = {
  en: {
    loginTitle: 'Sign in',
    registerTitle: 'Create account',
    resetPasswordTitle: 'Reset password',
    server: 'Server',
    showServerInput: 'Change server',
    hideServerInput: 'Hide server',
    database: 'Database',
    loginLabel: 'Login',
    password: 'Password',
    signIn: 'Sign in',
    resetPassword: 'Forgot password?',
    cantLogin: "Can't login?",
    createAccount: 'Create account',
    wrongCredentials: 'Invalid credentials',
    email: 'Email',
    repeatPassword: 'Repeat password',
    acceptTerms: 'I accept the',
    termsLink: 'Terms of Service',
    register: 'Register',
    haveAccount: 'Already have an account?',
    resetInstructions: 'Enter your database name and login or email to receive a new password.',
    loginOrEmail: 'Login / Email',
    sendPassword: 'Send password',
    cancel: 'Cancel',
    registrationSuccess: 'Registration successful! Check your email.',
    resetSuccess: 'New password sent to your email',
    signInWithGoogle: 'Sign in with Google',
    helpTitle: 'Login help',
    helpQuestion: 'Did you register with Google?',
    yes: 'Yes',
    no: 'No',
    dontRemember: "Don't remember",
    helpGoogle: 'If you registered with a different Google account, try signing in with that account.',
    helpNoGoogle: 'Check your email for the registration link. You can also reset your password.',
    helpUnknown: 'Try signing in with Google or contact us in Telegram.',
    backToLogin: 'Back to login',
    activeDatabases: 'Active Databases',
    ownedDatabases: 'Owned databases',
    enterDatabase: 'Enter',
    logout: 'Logout'
  },
  ru: {
    loginTitle: 'Вход',
    registerTitle: 'Регистрация',
    resetPasswordTitle: 'Сброс пароля',
    server: 'Сервер',
    showServerInput: 'Сменить сервер',
    hideServerInput: 'Скрыть',
    database: 'База данных',
    loginLabel: 'Логин',
    password: 'Пароль',
    signIn: 'Войти',
    resetPassword: 'Забыли пароль?',
    cantLogin: 'Не могу войти',
    createAccount: 'Регистрация',
    wrongCredentials: 'Неверный логин или пароль',
    email: 'Email',
    repeatPassword: 'Повторите пароль',
    acceptTerms: 'Я принимаю',
    termsLink: 'условия использования',
    register: 'Зарегистрироваться',
    haveAccount: 'Уже есть аккаунт?',
    resetInstructions: 'Введите название базы и логин или email для получения нового пароля.',
    loginOrEmail: 'Логин / Email',
    sendPassword: 'Отправить пароль',
    cancel: 'Отмена',
    registrationSuccess: 'Регистрация успешна! Проверьте почту.',
    resetSuccess: 'Новый пароль отправлен на почту',
    signInWithGoogle: 'Войти через Google',
    helpTitle: 'Помощь',
    helpQuestion: 'Вы регистрировались через Google?',
    yes: 'Да',
    no: 'Нет',
    dontRemember: 'Не помню',
    helpGoogle: 'Попробуйте войти под другой учётной записью Google.',
    helpNoGoogle: 'Проверьте почту с регистрацией. Также можно сбросить пароль.',
    helpUnknown: 'Попробуйте войти через Google или напишите нам в Telegram.',
    backToLogin: 'Назад',
    activeDatabases: 'Активные базы данных',
    ownedDatabases: 'Доступные БД',
    enterDatabase: 'Войти',
    logout: 'Выйти'
  }
}

const t = (key) => translations[locale.value]?.[key] || key

// Issue #5112: Enter database directly from active databases section
async function enterDatabase(dbName) {
  try {
    await integramApiClient.switchDatabase(dbName)

    toast.add({
      severity: 'success',
      summary: t('enterDatabase'),
      detail: dbName,
      life: 2000
    })

    // Navigate to database
    router.push(`/integram/${dbName}/`)
  } catch (error) {
    console.error('Failed to enter database:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  }
}

// Logout from all databases
async function handleLogout() {
  try {
    // Clear all authenticated databases
    integramApiClient.databases = {}

    toast.add({
      severity: 'info',
      summary: t('logout'),
      detail: 'Вы вышли из всех баз данных',
      life: 2000
    })

    // Reset form
    loginForm.value = {
      server: 'https://dronedoc.ru',
      database: 'my',
      login: '',
      password: ''
    }

    // Stay on login page
  } catch (error) {
    console.error('Logout error:', error)
  }
}

// Validation
function validateLogin() {
  errors.value = {}
  if (!loginForm.value.login) errors.value.login = 'Обязательное поле'
  if (!loginForm.value.password) errors.value.password = 'Обязательное поле'
  return Object.keys(errors.value).length === 0
}

function validateRegister() {
  errors.value = {}
  if (!registerForm.value.email) errors.value.email = 'Обязательное поле'
  if (!registerForm.value.password || registerForm.value.password.length < 6) {
    errors.value.regPassword = 'Минимум 6 символов'
  }
  if (registerForm.value.password !== registerForm.value.password2) {
    errors.value.regPassword2 = 'Пароли не совпадают'
  }
  if (!registerForm.value.agree) errors.value.agree = true
  return Object.keys(errors.value).length === 0
}

function validateReset() {
  errors.value = {}
  if (!resetForm.value.login) errors.value.resetLogin = 'Обязательное поле'
  return Object.keys(errors.value).length === 0
}

// Handlers
async function handleLogin() {
  if (!validateLogin()) return

  try {
    loading.value = true
    error.value = null

    if (!loginForm.value.database) loginForm.value.database = 'my'

    const serverURL = loginForm.value.server || 'https://dronedoc.ru'
    integramApiClient.setServer(serverURL)

    const result = await integramApiClient.authenticate(
      loginForm.value.database,
      loginForm.value.login,
      loginForm.value.password
    )

    if (result.success) {
      integramService.setServer(serverURL)
      integramService.setDatabase(loginForm.value.database)
      integramService.authToken = result.token
      integramService.xsrfToken = result.xsrf
      integramService.userId = result.userId
      integramService.userName = result.userName
      integramService.userRole = result.userRole
      integramService.authDatabase = loginForm.value.database  // Issue #5002: Set authDatabase for correct header selection
      integramService.saveSession()

      localStorage.setItem('token', result.token)
      localStorage.setItem('_xsrf', result.xsrf || '')
      localStorage.setItem('user', result.userName || loginForm.value.login)
      localStorage.setItem('id', result.userId || '')
      localStorage.setItem('db', loginForm.value.database)

      // Issue #5005: Save session timestamp for expiration validation
      localStorage.setItem('session_timestamp', Date.now().toString())

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Вход выполнен',
        life: 3000
      })

      // Issue #5112: Redirect to database-specific URL
      const defaultRedirect = `/integram/${loginForm.value.database}/`
      const redirectUrl = getSafeRedirectUrl(route.query.redirect, defaultRedirect)
      router.push(redirectUrl)
    } else {
      throw new Error('Authentication failed')
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!validateRegister()) return

  try {
    loading.value = true
    error.value = null

    const serverURL = loginForm.value.server || 'https://dronedoc.ru'
    integramApiClient.setServer(serverURL)

    const result = await integramApiClient.register({
      email: registerForm.value.email,
      password: registerForm.value.password,
      agree: registerForm.value.agree
    })

    if (result.success) {
      registerSuccess.value = true
      setTimeout(() => {
        mode.value = 'login'
        registerSuccess.value = false
        registerForm.value = { email: '', password: '', password2: '', agree: false }
      }, 3000)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function handleReset() {
  if (!validateReset()) return

  try {
    loading.value = true
    error.value = null

    const serverURL = loginForm.value.server || 'https://dronedoc.ru'
    integramApiClient.setServer(serverURL)

    const result = await integramApiClient.resetPassword({
      database: resetForm.value.database,
      login: resetForm.value.login
    })

    if (result.success) {
      resetSuccess.value = true
      setTimeout(() => {
        mode.value = 'login'
        resetSuccess.value = false
        resetForm.value = { database: '', login: '' }
      }, 3000)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function handleGoogleSignIn() {
  const clientId = '315358679657-oiaca19e5b44p73a5fl20e4q60sa7q4m.apps.googleusercontent.com'
  const redirectUri = `${window.location.origin}/auth.asp`
  const scope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
  const state = loginForm.value.database || ''
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`
  window.location.href = authUrl
}

onMounted(() => {
  // Issue #5112: Restore session to show authenticated databases
  integramApiClient.tryRestoreSession()

  // Issue #5100: Default to 'ru' if no saved locale
  const savedLocale = localStorage.getItem('integram_locale')
  if (savedLocale) {
    locale.value = savedLocale
  } else {
    locale.value = 'ru'
    localStorage.setItem('integram_locale', 'ru')
  }

  const savedServer = localStorage.getItem('integram_server') || integramApiClient.getServer()
  if (savedServer && savedServer !== 'https://dronedoc.ru') {
    showServerInput.value = true
    loginForm.value.server = savedServer
  }

  if (route.hash === '#reg') mode.value = 'register'
  else if (route.hash === '#change') mode.value = 'reset'
})

watch(locale, (val) => localStorage.setItem('integram_locale', val))
</script>

<style scoped>
.integram-login-page {
  background: var(--surface-ground);
  padding: 1rem;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

:deep(.p-password-input) {
  width: 100%;
}

.integram-logo {
  color: var(--p-primary-color, var(--primary-color));
}

/* Database Categories Styling */
.databases-section {
  padding: 0;
}

.db-category-card {
  padding: 0;
}

.category-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #4ade80 0%, #16a34a 100%);
  color: white;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(74, 222, 128, 0.3);
}

.category-header i {
  font-size: 1rem;
}

.category-header.secondary {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  box-shadow: 0 2px 4px rgba(96, 165, 250, 0.3);
}
</style>
