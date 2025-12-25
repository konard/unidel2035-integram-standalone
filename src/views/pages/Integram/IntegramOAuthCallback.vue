<template>
  <div class="oauth-callback-page">
    <div class="callback-container">
      <Card class="callback-card">
        <template #content>
          <div class="text-center">
            <ProgressSpinner v-if="loading" style="width: 50px; height: 50px;" strokeWidth="4" />
            <div v-else-if="error" class="error-container">
              <i class="pi pi-times-circle" style="font-size: 3rem; color: var(--red-500);"></i>
              <h3 class="mt-3">{{ t('authFailed') }}</h3>
              <p class="text-muted mt-2">{{ error }}</p>
              <Button
                :label="t('backToLogin')"
                class="mt-3"
                @click="goToLogin"
              />
            </div>
            <div v-else class="success-container">
              <i class="pi pi-check-circle" style="font-size: 3rem; color: var(--green-500);"></i>
              <h3 class="mt-3">{{ t('authSuccess') }}</h3>
              <p class="text-muted mt-2">{{ t('redirecting') }}</p>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import integramApiClient from '@/services/integramApiClient';

// PrimeVue Components

const router = useRouter();
const route = useRoute();
const toast = useToast();

const loading = ref(true);
const error = ref(null);
const locale = ref('ru');

// Translations
const translations = {
  en: {
    authFailed: 'Authentication Failed',
    authSuccess: 'Authentication Successful',
    redirecting: 'Redirecting to your database...',
    backToLogin: 'Back to Login'
  },
  ru: {
    authFailed: 'Ошибка авторизации',
    authSuccess: 'Авторизация успешна',
    redirecting: 'Перенаправление в вашу базу...',
    backToLogin: 'Вернуться к входу'
  }
};

function t(key) {
  return translations[locale.value]?.[key] || key;
}

function goToLogin() {
  router.push('/integram/login');
}

async function handleOAuthCallback() {
  try {
    // Get OAuth code and state from URL query parameters
    const code = route.query.code;
    const database = route.query.state || 'my';
    const errorParam = route.query.error;

    if (errorParam) {
      throw new Error(`OAuth error: ${errorParam}`);
    }

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Call the OAuth callback handler in integramApiClient
    const result = await integramApiClient.handleGoogleOAuthCallback(code, database);

    if (result.success) {
      // Save to localStorage for compatibility with router guard
      localStorage.setItem('token', result.token);
      localStorage.setItem('_xsrf', result.xsrf || '');
      localStorage.setItem('user', result.userName || result.email || '');
      localStorage.setItem('id', result.userId || '');
      localStorage.setItem('db', database);

      // Extract apiBase from server URL
      try {
        const url = new URL(integramApiClient.getServer());
        localStorage.setItem('apiBase', url.host);
      } catch (e) {
        localStorage.setItem('apiBase', 'dronedoc.ru');
      }

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Авторизация через Google выполнена!',
        life: 3000
      });

      // Redirect to Integram landing page
      setTimeout(() => {
        router.push('/integram');
      }, 1000);
    } else {
      throw new Error('OAuth authentication failed');
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
    error.value = err.message;
    loading.value = false;

    toast.add({
      severity: 'error',
      summary: 'Ошибка аутентификации',
      detail: err.message,
      life: 5000
    });
  }
}

onMounted(() => {
  // Load locale from localStorage
  const savedLocale = localStorage.getItem('integram_locale');
  if (savedLocale) {
    locale.value = savedLocale;
  }

  // Handle OAuth callback
  handleOAuthCallback();
});
</script>

<style scoped>
.oauth-callback-page {
  min-height: 100vh;
  background: linear-gradient(to right, #0062E6, #33AEFF);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.callback-container {
  max-width: 500px;
  width: 100%;
}

.callback-card {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.callback-card :deep(.p-card-body) {
  padding: 3rem 2rem;
}

.error-container,
.success-container {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
