<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'

const router = useRouter()
const route = useRoute()
const toast = useToast()

onMounted(() => {
  // Issue #5112: Handle both JWT and Integram tokens from OAuth callback
  const { accessToken, refreshToken, userId, token, _xsrf, error } = route.query

  if (error) {
    // OAuth error
    toast.add({
      severity: 'error',
      summary: 'Ошибка авторизации',
      detail: getErrorMessage(error),
      life: 5000,
    })

    setTimeout(() => {
      router.push('/login')
    }, 2000)
  } else if (accessToken && refreshToken) {
    // Success - store JWT tokens
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)

    // Store Integram credentials for legacy PHP API access
    if (userId) localStorage.setItem('id', userId)
    if (token) localStorage.setItem('token', token)
    if (_xsrf) localStorage.setItem('_xsrf', _xsrf)

    // Save session timestamp for expiration validation (Issue #5005)
    localStorage.setItem('session_timestamp', Date.now().toString())

    toast.add({
      severity: 'success',
      summary: 'Успешная авторизация',
      detail: 'Вход выполнен успешно',
      life: 3000,
    })

    setTimeout(() => {
      router.push('/welcome')
    }, 1000)
  } else {
    // No tokens - redirect to login
    router.push('/login')
  }
})

function getErrorMessage(error) {
  const messages = {
    invalid_state: 'Неверный токен безопасности. Попробуйте еще раз.',
    oauth_failed: 'Не удалось выполнить вход. Попробуйте еще раз.',
    access_denied: 'Вы отклонили запрос на авторизацию.',
  }

  return messages[error] || 'Произошла ошибка при входе'
}
</script>

<template>
  <Toast />
  <div class="callback-container">
    <div class="callback-content">
      <ProgressSpinner />
      <p class="callback-message">Обработка авторизации...</p>
    </div>
  </div>
</template>

<style scoped>
.callback-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-50);
}

.callback-content {
  text-align: center;
}

.callback-message {
  margin-top: 1rem;
  font-size: 1.1rem;
  color: var(--text-color-secondary);
}
</style>
