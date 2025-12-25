<script setup>
// Simple footer component
</script>

<template>
  <footer id="contact" class="landing-footer">
    <div class="landing-footer-container">
      <div class="landing-footer-content">
        <div class="landing-footer-section">
          <div class="landing-footer-logo">
            <div class="landing-footer-logo-icon">
              <span>И</span>
            </div>
            <span class="landing-footer-logo-text">ИНТЕГРАМ</span>
          </div>
          <p class="landing-footer-description">
            Безопасная и удобная платформа для управления данными
          </p>
        </div>

        <div class="landing-footer-section">
          <h3 class="landing-footer-title">Платформа</h3>
          <ul class="landing-footer-links">
            <li><a href="#about" class="landing-footer-link">О платформе</a></li>
            <li><a href="#features" class="landing-footer-link">Возможности</a></li>
            <li><RouterLink to="/login" class="landing-footer-link">Войти</RouterLink></li>
            <li><RouterLink to="/register" class="landing-footer-link">Регистрация</RouterLink></li>
          </ul>
        </div>

        <div class="landing-footer-section">
          <h3 class="landing-footer-title">Контакты</h3>
          <ul class="landing-footer-links">
            <li class="landing-footer-text">Свяжитесь с нами для получения консультации</li>
          </ul>
        </div>
      </div>

      <div class="landing-footer-bottom">
        <p class="landing-footer-copyright">
          © {{ new Date().getFullYear() }} ИНТЕГРАМ. Все права защищены.
        </p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.landing-footer {
  background: #1f2937;
  color: #d1d5db;
  padding: 3rem 1.5rem 2rem;
}

.landing-footer-container {
  max-width: 1200px;
  margin: 0 auto;
}

.landing-footer-content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 3rem;
}

@media (min-width: 768px) {
  .landing-footer-content {
    grid-template-columns: 2fr 1fr 1fr;
  }
}

.landing-footer-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.landing-footer-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.landing-footer-logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1rem;
}

.landing-footer-logo-text {
  font-size: 1.25rem;
  font-weight: bold;
  color: white;
}

.landing-footer-description {
  color: #9ca3af;
  font-size: 0.875rem;
  line-height: 1.5;
  max-width: 300px;
  margin: 0;
}

.landing-footer-title {
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.landing-footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.landing-footer-link {
  color: #9ca3af;
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.2s;
}

.landing-footer-link:hover {
  color: #06b6d4;
}

.landing-footer-text {
  color: #9ca3af;
  font-size: 0.875rem;
  line-height: 1.5;
}

.landing-footer-bottom {
  border-top: 1px solid #374151;
  padding-top: 2rem;
  text-align: center;
}

.landing-footer-copyright {
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0;
}
</style>
