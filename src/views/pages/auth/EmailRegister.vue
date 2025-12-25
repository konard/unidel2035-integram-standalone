<template>
  <div class="email-register-container">
    <div class="register-card">
      <!-- Logo/Header -->
      <div class="header">
        <h1>📧 Регистрация через Email</h1>
        <p class="subtitle">Создайте аккаунт DronDoc</p>
      </div>

      <!-- Registration Form -->
      <div v-if="!registrationSent" class="form-section">
        <form @submit.prevent="handleRegister">
          <!-- Email Field -->
          <div class="form-group">
            <label for="email">Email <span class="required">*</span></label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              placeholder="example@domain.com"
              required
              :disabled="loading"
              class="form-input"
            />
          </div>

          <!-- Username Field -->
          <div class="form-group">
            <label for="username">Имя пользователя</label>
            <input
              id="username"
              v-model="formData.username"
              type="text"
              placeholder="johndoe"
              :disabled="loading"
              class="form-input"
            />
          </div>

          <!-- Display Name Field -->
          <div class="form-group">
            <label for="displayName">Отображаемое имя</label>
            <input
              id="displayName"
              v-model="formData.displayName"
              type="text"
              placeholder="John Doe"
              :disabled="loading"
              class="form-input"
            />
          </div>

          <!-- Password Field -->
          <div class="form-group">
            <label for="password">Пароль <span class="required">*</span></label>
            <div class="password-input-wrapper">
              <input
                id="password"
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Минимум 8 символов"
                required
                minlength="8"
                :disabled="loading"
                class="form-input"
              />
              <button
                type="button"
                class="toggle-password"
                @click="showPassword = !showPassword"
                :disabled="loading"
              >
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
            <small class="hint">Минимум 8 символов</small>
          </div>

          <!-- Confirm Password Field -->
          <div class="form-group">
            <label for="confirmPassword">Подтвердите пароль <span class="required">*</span></label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Повторите пароль"
              required
              :disabled="loading"
              class="form-input"
            />
          </div>

          <!-- Error Message -->
          <div v-if="error" class="error-message">
            ⚠️ {{ error }}
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            class="submit-button"
            :disabled="loading || !isFormValid"
          >
            <span v-if="loading" class="spinner">⏳</span>
            <span v-else>✉️ Зарегистрироваться</span>
          </button>
        </form>

        <!-- Already Have Account -->
        <div class="footer-links">
          <p>
            Уже есть аккаунт?
            <router-link to="/login" class="link">Войти</router-link>
          </p>
        </div>
      </div>

      <!-- Success Message -->
      <div v-else class="success-section">
        <div class="success-icon">✅</div>
        <h2>Проверьте вашу почту!</h2>
        <p>
          Мы отправили письмо с подтверждением на адрес:
        </p>
        <p class="email-display">{{ formData.email }}</p>
        <p class="instructions">
          Пожалуйста, перейдите по ссылке в письме для завершения регистрации.
        </p>

        <!-- Resend Button -->
        <div class="resend-section">
          <p class="small-text">Не получили письмо?</p>
          <button
            @click="handleResend"
            class="resend-button"
            :disabled="resendLoading || resendCooldown > 0"
          >
            <span v-if="resendLoading">⏳ Отправка...</span>
            <span v-else-if="resendCooldown > 0">
              ⏱️ Повторить через {{ resendCooldown }}с
            </span>
            <span v-else>🔄 Отправить снова</span>
          </button>
        </div>

        <div class="footer-links">
          <router-link to="/login" class="link">← Назад к входу</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { registerWithEmail, resendVerification } from '@/services/emailAuthService';

const router = useRouter();

// Form data
const formData = ref({
  email: '',
  username: '',
  displayName: '',
  password: ''
});

const confirmPassword = ref('');
const showPassword = ref(false);

// UI state
const loading = ref(false);
const resendLoading = ref(false);
const registrationSent = ref(false);
const error = ref('');
const resendCooldown = ref(0);

// Reset form to initial state
function resetForm() {
  formData.value = {
    email: '',
    username: '',
    displayName: '',
    password: ''
  };
  confirmPassword.value = '';
  showPassword.value = false;
  error.value = '';
}

// Clear form on component mount (page reload)
onMounted(() => {
  resetForm();
});

// Form validation
const isFormValid = computed(() => {
  return (
    formData.value.email &&
    formData.value.password &&
    formData.value.password.length >= 8 &&
    formData.value.password === confirmPassword.value
  );
});

// Handle registration
async function handleRegister() {
  if (!isFormValid.value) {
    error.value = 'Пожалуйста, заполните все обязательные поля правильно';
    return;
  }

  if (formData.value.password !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const emailToSave = formData.value.email; // Save email for success message

    await registerWithEmail({
      email: formData.value.email,
      password: formData.value.password,
      username: formData.value.username || undefined,
      displayName: formData.value.displayName || undefined
    });

    registrationSent.value = true;
    startResendCooldown();

    // Clear password fields for security after successful registration
    formData.value.password = '';
    confirmPassword.value = '';
    showPassword.value = false;

    // Restore email for display in success message
    formData.value.email = emailToSave;
  } catch (err) {
    error.value = err.message || 'Ошибка регистрации. Попробуйте снова.';
  } finally {
    loading.value = false;
  }
}

// Handle resend verification
async function handleResend() {
  if (resendCooldown.value > 0) return;

  resendLoading.value = true;
  error.value = '';

  try {
    await resendVerification({
      email: formData.value.email,
      password: formData.value.password,
      username: formData.value.username || undefined,
      displayName: formData.value.displayName || undefined
    });

    startResendCooldown();
  } catch (err) {
    error.value = err.message || 'Ошибка отправки письма. Попробуйте снова.';
  } finally {
    resendLoading.value = false;
  }
}

// Resend cooldown (60 seconds)
function startResendCooldown() {
  resendCooldown.value = 60;
  const interval = setInterval(() => {
    resendCooldown.value--;
    if (resendCooldown.value <= 0) {
      clearInterval(interval);
    }
  }, 1000);
}
</script>

<style scoped>
.email-register-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.register-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  padding: 3rem;
  max-width: 500px;
  width: 100%;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  font-size: 1rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #333;
  font-weight: 500;
}

.required {
  color: #e74c3c;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.toggle-password {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
}

.hint {
  display: block;
  margin-top: 0.25rem;
  color: #999;
  font-size: 0.875rem;
}

.error-message {
  background-color: #fee;
  color: #c33;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  border-left: 4px solid #e74c3c;
}

.submit-button {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.footer-links {
  text-align: center;
  margin-top: 1.5rem;
  color: #666;
}

.link {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}

/* Success Section */
.success-section {
  text-align: center;
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.success-section h2 {
  color: #333;
  margin-bottom: 1rem;
}

.email-display {
  font-weight: 600;
  color: #667eea;
  font-size: 1.1rem;
  margin: 1rem 0;
}

.instructions {
  color: #666;
  line-height: 1.6;
  margin-bottom: 2rem;
}

.resend-section {
  background: #f9f9f9;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.small-text {
  color: #999;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.resend-button {
  padding: 0.75rem 1.5rem;
  background: white;
  border: 2px solid #667eea;
  color: #667eea;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.resend-button:hover:not(:disabled) {
  background: #667eea;
  color: white;
}

.resend-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .register-card {
    padding: 2rem 1.5rem;
  }

  .header h1 {
    font-size: 1.5rem;
  }
}
</style>
