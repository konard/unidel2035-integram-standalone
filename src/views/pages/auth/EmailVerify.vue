<template>
  <Toast />
  <div class="email-verify-container">
    <div class="verify-card">
      <div class="verify-card-inner">
        <!-- Loading State -->
        <div v-if="loading" class="loading-section">
        <div class="spinner-large">⏳</div>
        <h2>Проверка email...</h2>
        <p>Пожалуйста, подождите</p>
      </div>

      <!-- Success State -->
      <div v-else-if="verified" class="success-section">
        <div class="success-icon">✅</div>
        <h2>Email подтвержден!</h2>
        <p>Ваш аккаунт успешно создан. Сейчас вы будете перенаправлены на страницу входа.</p>

        <!-- Welcome Token Notification -->
        <div class="token-gift-box">
          <div class="gift-icon">🎁</div>
          <h3>Поздравляем!</h3>
          <p class="token-message">
            Вам начислен <strong>welcome-токен</strong> с балансом<br>
            <span class="token-balance">1,000,000 токенов</span>
          </p>
          <p class="token-description">
            Используйте токены для работы с AI агентами:<br>
            анализ данных, генерация контента, автоматизация задач
          </p>
        </div>

        <div class="user-info">
          <p><strong>Email:</strong> {{ verificationResult.email }}</p>
          <p v-if="verificationResult.userId">
            <strong>User ID:</strong> {{ verificationResult.userId }}
          </p>
        </div>

        <div class="databases-info" v-if="verificationResult.databases">
          <h3>Синхронизировано с базами данных:</h3>
          <ul>
            <li v-for="db in verificationResult.databases" :key="db.database">
              {{ db.database }} (ID: {{ db.recordId }})
            </li>
          </ul>
        </div>

        <div class="redirect-note">
          Перенаправление через 3 секунды...
        </div>

        <button @click="goToLogin" class="action-button">
          🚀 Войти сейчас
        </button>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-section">
        <div class="error-icon">❌</div>
        <h2>Ошибка подтверждения</h2>
        <p class="error-message">{{ error }}</p>

        <div class="error-suggestions">
          <h3>Что делать?</h3>
          <ul>
            <li>Проверьте, что вы перешли по правильной ссылке</li>
            <li>Ссылка действительна в течение 24 часов</li>
            <li>Попробуйте запросить новое письмо для подтверждения</li>
          </ul>
        </div>

        <div class="action-buttons">
          <button @click="goToRegister" class="action-button secondary">
            🔄 Повторить регистрацию
          </button>
          <button @click="goToLogin" class="action-button">
            🔑 Войти
          </button>
        </div>
      </div>

      <!-- Waiting for Email Verification (No Token Yet) -->
      <div v-else class="waiting-section">
        <div class="waiting-icon">📧</div>
        <h2>Ожидаем подтверждения Email</h2>
        <p v-if="userEmail">Мы отправили письмо на адрес:</p>
        <p v-if="userEmail" class="user-email">{{ userEmail }}</p>
        <p v-else>Проверьте вашу почту для подтверждения регистрации.</p>

        <div class="info-box">
          <h3>Что дальше?</h3>
          <ul>
            <li>📬 Откройте ваш почтовый ящик</li>
            <li>🔍 Найдите письмо от Integram Platform</li>
            <li>🔗 Нажмите на ссылку подтверждения</li>
            <li>✅ Вы будете перенаправлены обратно для завершения регистрации</li>
          </ul>
        </div>

        <p class="expiry-note">Ссылка действительна в течение 24 часов.</p>

        <div class="action-buttons">
          <button @click="handleResendEmail" :disabled="resendDisabled" class="action-button secondary">
            {{ resendDisabled ? `Повторить через ${resendCountdown}с` : '📨 Отправить письмо заново' }}
          </button>
          <button @click="goToLogin" class="action-button">
            🔑 Уже подтвердил? Войти
          </button>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { verifyEmail, resendVerification } from '@/services/emailAuthService';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/authStore';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();

const loading = ref(false);
const verified = ref(false);
const error = ref('');
const verificationResult = ref(null);
const userEmail = ref(route.query.email || '');

// Resend email functionality
const resendDisabled = ref(false);
const resendCountdown = ref(0);
let countdownInterval = null;

onMounted(async () => {
  const token = route.query.token;

  if (token) {
    // User clicked verification link in email
    await handleVerification(token);
  } else {
    // User is waiting for email, show waiting state
    // No error needed, just show the waiting UI
  }
});

onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});

async function handleVerification(token) {
  loading.value = true;
  error.value = '';

  try {
    // CRITICAL FIX: Logout current user before verification
    // This ensures that clicking the verification link logs out any existing session
    // and prepares for the new user to login
    await authStore.logout();

    const result = await verifyEmail(token);
    verificationResult.value = result;
    verified.value = true;

    toast.add({
      severity: 'success',
      summary: '✅ Регистрация завершена!',
      detail: '🎁 Вам начислен welcome-токен с балансом 1,000,000 токенов',
      life: 5000
    });

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/login');
    }, 3000);
  } catch (err) {
    error.value = err.message || 'Не удалось подтвердить email. Попробуйте снова.';
    toast.add({
      severity: 'error',
      summary: 'Ошибка подтверждения',
      detail: error.value,
      life: 5000
    });
  } finally {
    loading.value = false;
  }
}

async function handleResendEmail() {
  if (!userEmail.value) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Email не указан. Вернитесь к регистрации.',
      life: 3000
    });
    return;
  }

  try {
    // Note: resendVerification requires email and password
    // Since we don't have password here, we need to ask user to re-register
    toast.add({
      severity: 'info',
      summary: 'Информация',
      detail: 'Для повторной отправки письма, пожалуйста, зарегистрируйтесь заново.',
      life: 5000
    });

    setTimeout(() => {
      router.push('/register');
    }, 2000);
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: err.message || 'Не удалось отправить письмо',
      life: 3000
    });
  }
}

function startResendCooldown() {
  resendDisabled.value = true;
  resendCountdown.value = 60; // 60 seconds cooldown

  countdownInterval = setInterval(() => {
    resendCountdown.value--;
    if (resendCountdown.value <= 0) {
      clearInterval(countdownInterval);
      resendDisabled.value = false;
    }
  }, 1000);
}

function goToLogin() {
  router.push('/login');
}

function goToTokens() {
  // Redirect to login first, then to tokens
  router.push('/login?redirect=/tokens');
}

function goToRegister() {
  router.push('/register');
}
</script>

<style scoped>
.email-verify-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-50);
  padding: 2rem;
}

.dark .email-verify-container {
  background: var(--surface-950);
}

.verify-card {
  border-radius: 56px;
  padding: 0.3rem;
  background: linear-gradient(
    180deg,
    var(--primary-color) 10%,
    rgba(33, 150, 243, 0) 30%
  );
  max-width: 600px;
  width: 100%;
}

.verify-card-inner {
  background: var(--surface-0);
  border-radius: 53px;
  padding: 3rem;
  text-align: center;
}

.dark .verify-card-inner {
  background: var(--surface-900);
}

/* Loading Section */
.loading-section h2 {
  color: var(--surface-900);
  margin: 1rem 0;
}

.dark .loading-section h2 {
  color: var(--surface-0);
}

.loading-section p {
  color: var(--text-color-secondary);
}

.spinner-large {
  font-size: 4rem;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Success Section */
.success-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
}

.success-section h2 {
  color: var(--primary-color);
  margin-bottom: 1rem;
}

.dark .success-section h2 {
  color: var(--primary-color);
}

.success-section p {
  color: var(--text-color-secondary);
  font-size: 1.1rem;
  margin-bottom: 2rem;
}

.user-info {
  background: var(--surface-100);
  padding: 1.5rem;
  border-radius: 8px;
  margin: 2rem 0;
  text-align: left;
}

.dark .user-info {
  background: var(--surface-800);
}

.user-info p {
  margin: 0.5rem 0;
  color: var(--surface-900);
  font-size: 1rem;
}

.dark .user-info p {
  color: var(--surface-0);
}

.databases-info {
  background: #e8f5e9;
  padding: 1.5rem;
  border-radius: 8px;
  margin: 2rem 0;
  text-align: left;
}

.databases-info h3 {
  color: #27ae60;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.databases-info ul {
  list-style: none;
  padding: 0;
}

.databases-info li {
  padding: 0.5rem 0;
  color: #333;
  border-bottom: 1px solid #c8e6c9;
}

.databases-info li:last-child {
  border-bottom: none;
}

/* Token Gift Box */
.token-gift-box {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  border-radius: 12px;
  margin: 2rem 0;
  text-align: center;
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
  animation: slideIn 0.5s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.gift-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  animation: bounce 1s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.token-gift-box h3 {
  color: white;
  margin-bottom: 1rem;
  font-size: 1.5rem;
}

.token-message {
  font-size: 1.1rem;
  margin: 1rem 0;
  line-height: 1.6;
}

.token-balance {
  font-size: 2rem;
  font-weight: bold;
  color: #ffd700;
  display: inline-block;
  margin: 0.5rem 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.token-description {
  font-size: 0.95rem;
  opacity: 0.95;
  margin: 1rem 0;
  line-height: 1.6;
}

.token-button {
  background: white !important;
  color: #667eea !important;
  margin-top: 1rem;
  font-weight: bold;
  transition: all 0.3s ease;
}

.token-button:hover {
  background: #ffd700 !important;
  color: #333 !important;
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 8px 25px rgba(255, 215, 0, 0.4);
}

/* Error Section */
.error-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
}

.error-section h2 {
  color: #e74c3c;
  margin-bottom: 1rem;
}

.error-message {
  background-color: #fee;
  color: #c33;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
  border-left: 4px solid #e74c3c;
}

.error-suggestions {
  background: #f9f9f9;
  padding: 1.5rem;
  border-radius: 8px;
  margin: 2rem 0;
  text-align: left;
}

.error-suggestions h3 {
  color: #333;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.error-suggestions ul {
  list-style: disc;
  padding-left: 1.5rem;
  color: #666;
}

.error-suggestions li {
  margin: 0.5rem 0;
}

/* Waiting Section */
.waiting-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.waiting-section h2 {
  color: var(--primary-color);
  margin-bottom: 1rem;
}

.dark .waiting-section h2 {
  color: var(--primary-color);
}

.waiting-section p {
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
}

.user-email {
  font-weight: bold;
  color: var(--surface-900);
  font-size: 1.1rem;
  background: var(--surface-100);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}

.dark .user-email {
  color: var(--surface-0);
  background: var(--surface-800);
}

.info-box {
  background: var(--surface-100);
  padding: 1.5rem;
  border-radius: 8px;
  margin: 2rem 0;
  text-align: left;
  border-left: 4px solid var(--primary-color);
}

.dark .info-box {
  background: var(--surface-800);
}

.info-box h3 {
  color: var(--primary-color);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.info-box ul {
  list-style: none;
  padding: 0;
}

.info-box li {
  padding: 0.5rem 0;
  color: var(--surface-900);
}

.dark .info-box li {
  color: var(--surface-0);
}

.expiry-note {
  color: var(--text-color-secondary);
  font-size: 0.9rem;
  font-style: italic;
  margin-top: 1.5rem;
}

.redirect-note {
  color: var(--primary-color);
  font-size: 0.95rem;
  font-style: italic;
  margin: 1rem 0;
  font-weight: 500;
}

/* Action Buttons */
.action-button {
  padding: 1rem 2rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin: 0.5rem;
}

.action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(var(--primary-color-rgb, 102, 126, 234), 0.4);
  opacity: 0.9;
}

.action-button.secondary {
  background: transparent;
  color: var(--primary-color);
  border: 2px solid var(--primary-color);
}

.action-button.secondary:hover {
  background: var(--primary-color);
  color: white;
}

.action-buttons {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 2rem;
}

@media (max-width: 600px) {
  .verify-card {
    padding: 2rem 1.5rem;
  }

  .action-button {
    width: 100%;
    margin: 0.5rem 0;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
