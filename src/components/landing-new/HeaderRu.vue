<template>
  <header class="landing-header">
    <nav class="landing-nav">
      <div class="landing-nav-content">
        <div class="landing-logo">
          <div class="landing-logo-icon">
            <span>I</span>
          </div>
          <span class="landing-logo-text">ИНТЕГРАМ</span>
        </div>

        <!-- Desktop Navigation -->
        <div class="landing-nav-desktop">
          <a
            v-for="item in navigation"
            :key="item.name"
            :href="item.href"
            class="landing-nav-link"
          >
            {{ item.name }}
          </a>
        </div>

        <div class="landing-nav-actions">
          <a href="/app/login">
            <button class="landing-btn landing-btn-accent">
              Войти
            </button>
          </a>
        </div>

        <!-- Mobile menu button -->
        <button
          class="landing-menu-button"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <i class="pi pi-bars"></i>
        </button>
      </div>

      <!-- Mobile Navigation -->
      <div v-if="mobileMenuOpen" class="landing-nav-mobile">
        <a
          v-for="item in navigation"
          :key="item.name"
          :href="item.href"
          class="landing-nav-mobile-link"
          @click="mobileMenuOpen = false"
        >
          {{ item.name }}
        </a>
        <div class="landing-nav-mobile-actions">
          <button class="landing-btn landing-btn-accent landing-btn-full">
            Войти
          </button>
        </div>
      </div>
    </nav>
  </header>
</template>

<script setup>
import { ref } from 'vue'

const navigation = [
  { name: 'Решения', href: '#solution' },
  { name: 'Как это работает', href: '#process' },
  { name: 'Примеры', href: '#use-cases' },
  { name: 'Вопросы и ответы', href: '#faq' },
  { name: 'Контакты', href: '#contact' }
]

const mobileMenuOpen = ref(false)
</script>

<style scoped>
.landing-header {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #e5e7eb;
  z-index: 50;
}

.landing-nav {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
}

.landing-nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.landing-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.landing-logo-icon {
  width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, #0077b6, #06b6d4);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.landing-logo-icon span {
  color: white;
  font-weight: bold;
  font-size: 1.25rem;
}

.landing-logo-text {
  font-size: 1.5rem;
  font-weight: bold;
}

.landing-nav-desktop {
  display: none;
  align-items: center;
  gap: 2rem;
}

@media (min-width: 1024px) {
  .landing-nav-desktop {
    display: flex;
  }
}

.landing-nav-link {
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  transition: color 0.3s ease;
}

.landing-nav-link:hover {
  color: #1f2937;
}

.landing-nav-actions {
  display: none;
  align-items: center;
  gap: 1rem;
}

@media (min-width: 1024px) {
  .landing-nav-actions {
    display: flex;
  }
}

.landing-btn {
  padding: 0.625rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.landing-btn-accent {
  background: #ff6f42;
  color: white;
}

.landing-btn-accent:hover {
  background: #ff5722;
}

.landing-btn-full {
  width: 100%;
}

.landing-menu-button {
  display: block;
  padding: 0.5rem;
  background: none;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.3s ease;
}

@media (min-width: 1024px) {
  .landing-menu-button {
    display: none;
  }
}

.landing-menu-button:hover {
  background: #f3f4f6;
}

.landing-menu-button i {
  font-size: 1.5rem;
}

.landing-nav-mobile {
  display: block;
  margin-top: 1rem;
  padding-bottom: 1rem;
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}

@media (min-width: 1024px) {
  .landing-nav-mobile {
    display: none;
  }
}

.landing-nav-mobile-link {
  display: block;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  border-radius: 0.5rem;
  transition: all 0.3s ease;
}

.landing-nav-mobile-link:hover {
  color: #1f2937;
  background: #f3f4f6;
}

.landing-nav-mobile-actions {
  padding: 0 1rem;
  padding-top: 0.5rem;
}
</style>
