<template>
  <section class="contact-section">
    <div class="contact-container">
      <div class="contact-header">
        <h2 class="contact-title">
          Готовы избавиться от Excel-хаоса?
        </h2>
        <p class="contact-description">
          Оставьте заявку на бесплатную консультацию. Мы покажем, как ИНТЕГРАМ может решить ваши задачи.
        </p>
      </div>

      <form @submit.prevent="handleSubmit" class="contact-form">
        <div class="form-row">
          <div class="form-field">
            <label for="name" class="form-label">Ваше имя *</label>
            <InputText
              id="name"
              v-model="formData.name"
              required
              placeholder="Иван Иванов"
              class="form-input"
            />
          </div>
          <div class="form-field">
            <label for="phone" class="form-label">Телефон *</label>
            <InputText
              id="phone"
              v-model="formData.phone"
              type="tel"
              required
              placeholder="+7 (999) 123-45-67"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-field">
          <label for="email" class="form-label">Email *</label>
          <InputText
            id="email"
            v-model="formData.email"
            type="email"
            required
            placeholder="ivan@company.ru"
            class="form-input"
          />
        </div>

        <div class="form-field">
          <label for="company" class="form-label">Компания</label>
          <InputText
            id="company"
            v-model="formData.company"
            placeholder="ООО «Ваша компания»"
            class="form-input"
          />
        </div>

        <div class="form-field">
          <label for="message" class="form-label">Расскажите о вашей задаче</label>
          <Textarea
            id="message"
            v-model="formData.message"
            rows="5"
            placeholder="Какой процесс вы хотите автоматизировать?"
            class="form-input"
          />
        </div>

        <Button
          type="submit"
          :disabled="isSubmitting"
          class="submit-btn"
          :label="isSubmitting ? 'Отправка...' : 'Отправить заявку'"
        />

        <p class="form-disclaimer">
          Нажимая на кнопку, вы даете согласие на обработку персональных данных и соглашаетесь с
          <a href="https://integram.io/terms.html" target="_blank">Правилами использования</a>
        </p>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'

const toast = useToast()
const isSubmitting = ref(false)

const formData = reactive({
  name: '',
  phone: '',
  email: '',
  company: '',
  message: ''
})

const handleSubmit = async () => {
  isSubmitting.value = true

  try {
    const response = await fetch('/send_to_telegram.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    })

    const result = await response.json()

    if (response.ok && result.success) {
      toast.add({
        severity: 'success',
        summary: 'Спасибо за ваше обращение!',
        detail: 'Мы свяжемся с вами в ближайшее время.',
        life: 5000
      })

      // Reset form
      formData.name = ''
      formData.phone = ''
      formData.email = ''
      formData.company = ''
      formData.message = ''
    } else {
      throw new Error(result.error || 'Не удалось отправить заявку')
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message || 'Произошла ошибка при отправке заявки. Попробуйте еще раз.',
      life: 5000
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.contact-section {
  padding: 5rem 1.5rem;
  background: #ffffff;
}

.contact-container {
  max-width: 64rem;
  margin: 0 auto;
}

.contact-header {
  text-align: center;
  margin-bottom: 3rem;
}

.contact-title {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

@media (min-width: 768px) {
  .contact-title {
    font-size: 3rem;
  }
}

.contact-description {
  font-size: 1.25rem;
  color: #6b7280;
}

.contact-form {
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e5e7eb;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

@media (min-width: 768px) {
  .form-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.form-field {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #1f2937;
}

.form-input {
  width: 100%;
}

.submit-btn {
  width: 100%;
  padding: 1rem;
  font-size: 1.125rem;
  font-weight: 500;
  background: #ff6f42;
  border: none;
  color: white;
  margin-bottom: 1rem;
}

.submit-btn:hover:not(:disabled) {
  background: #ff5722;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-disclaimer {
  font-size: 0.875rem;
  color: #6b7280;
  text-align: center;
  margin: 0;
}

.form-disclaimer a {
  color: #0077b6;
  text-decoration: none;
}

.form-disclaimer a:hover {
  text-decoration: underline;
}
</style>
