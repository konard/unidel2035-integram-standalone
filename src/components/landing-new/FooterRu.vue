<template>
  <footer class="footer">
    <div class="footer-container">
      <div class="footer-grid">
        <div class="footer-column">
          <div class="footer-logo">
            <div class="footer-logo-icon">
              <span>I</span>
            </div>
            <span class="footer-logo-text">ИНТЕГРАМ</span>
          </div>
          <ul class="footer-links">
            <li><a href="https://integram.io/terms.html" target="_blank">Правила использования</a></li>
            <li><a href="https://integram.io/OfferOJSC.pdf" target="_blank">Публичная оферта</a></li>
            <li><a href="https://integram.io/acct.html" target="_blank">Платежная информация</a></li>
            <li>В реестре отечественного ПО,<br />запись №30872</li>
          </ul>
        </div>

        <div class="footer-column">
          <h3 class="footer-title">Быстрые ссылки</h3>
          <ul class="footer-links">
            <li><a href="#solution">Решения</a></li>
            <li><a href="#use-cases">Примеры использования</a></li>
            <li><a href="#process">Как это работает</a></li>
            <li><a href="#faq">Вопросы и ответы</a></li>
            <li><a href="https://integram.io/login.html#reg" target="_blank">Попробовать своими руками</a></li>
          </ul>
        </div>

        <div class="footer-column">
          <h3 class="footer-title">Контакты</h3>
          <ul class="footer-links">
            <li>Email: info@integram.io</li>
            <li>Телефон: +7 (995) 506-0167</li>
            <li>АО Интеграм, ИНН 9716002710</li>
            <li>Телеграм: <a href="https://t.me/ideavr" target="_blank">t.me/ideavr</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p>© {{ currentYear }} <a href="https://integram.io" target="_blank">ИНТЕГРАМ</a>. Все права защищены.</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'

const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.footer {
  background: #1f2937;
  color: white;
  padding: 3rem 1.5rem;
}

.footer-container {
  max-width: 75rem;
  margin: 0 auto;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

@media (min-width: 768px) {
  .footer-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.footer-column {
  display: flex;
  flex-direction: column;
}

.footer-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.footer-logo-icon {
  width: 2rem;
  height: 2rem;
  background: linear-gradient(135deg, #0077b6, #06b6d4);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer-logo-icon span {
  color: white;
  font-weight: bold;
}

.footer-logo-text {
  font-size: 1.25rem;
  font-weight: bold;
}

.footer-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.footer-links li {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
}

.footer-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.3s ease;
}

.footer-links a:hover {
  color: white;
}

.footer-bottom {
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  text-align: center;
}

.footer-bottom p {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.footer-bottom a {
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  transition: color 0.3s ease;
}

.footer-bottom a:hover {
  color: white;
}
</style>
