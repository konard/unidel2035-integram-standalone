<script setup>
import { ref } from 'vue'

const mobileMenuOpen = ref(false)
</script>

<template>
  <header class="landing-header">
    <nav class="landing-nav">
      <div class="landing-nav-container">
        <!-- Logo -->
        <div class="landing-logo">
          <div class="landing-logo-icon">
            <span>И</span>
          </div>
          <span class="landing-logo-text">ИНТЕГРАМ</span>
        </div>

        <!-- Desktop Navigation -->
        <div class="landing-nav-desktop">
          <a href="#about" class="landing-nav-link">О платформе</a>
          <a href="#features" class="landing-nav-link">Возможности</a>
          <a href="#contact" class="landing-nav-link">Контакты</a>
        </div>

        <!-- Desktop CTA -->
        <div class="landing-nav-cta">
          <RouterLink to="/login">
            <Button label="Войти" class="landing-btn-primary" />
          </RouterLink>
        </div>

        <!-- Mobile menu button -->
        <button
          class="landing-mobile-menu-btn"
          @click="mobileMenuOpen = !mobileMenuOpen"
          aria-label="Toggle menu"
        >
          <i class="pi pi-bars" />
        </button>
      </div>

      <!-- Mobile Navigation -->
      <div v-if="mobileMenuOpen" class="landing-mobile-nav">
        <a
          href="#about"
          class="landing-mobile-nav-link"
          @click="mobileMenuOpen = false"
        >
          О платформе
        </a>
        <a
          href="#features"
          class="landing-mobile-nav-link"
          @click="mobileMenuOpen = false"
        >
          Возможности
        </a>
        <a
          href="#contact"
          class="landing-mobile-nav-link"
          @click="mobileMenuOpen = false"
        >
          Контакты
        </a>
        <div class="landing-mobile-nav-cta">
          <RouterLink to="/login">
            <Button label="Войти" class="landing-btn-primary w-full" />
          </RouterLink>
        </div>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.landing-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.landing-nav {
  width: 100%;
}

.landing-nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
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
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1.25rem;
}

.landing-logo-text {
  font-size: 1.5rem;
  font-weight: bold;
  color: #1f2937;
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
  transition: color 0.2s;
}

.landing-nav-link:hover {
  color: #1f2937;
}

.landing-nav-cta {
  display: none;
  align-items: center;
  gap: 1rem;
}

@media (min-width: 1024px) {
  .landing-nav-cta {
    display: flex;
  }
}

.landing-btn-primary {
  background: #06b6d4;
  border-color: #06b6d4;
  color: white;
  padding: 0.5rem 1.5rem;
  font-weight: 500;
}

.landing-btn-primary:hover {
  background: #0891b2;
  border-color: #0891b2;
}

.landing-mobile-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #1f2937;
  font-size: 1.5rem;
}

@media (min-width: 1024px) {
  .landing-mobile-menu-btn {
    display: none;
  }
}

.landing-mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

@media (min-width: 1024px) {
  .landing-mobile-nav {
    display: none;
  }
}

.landing-mobile-nav-link {
  display: block;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.2s;
}

.landing-mobile-nav-link:hover {
  color: #1f2937;
  background: rgba(0, 0, 0, 0.05);
}

.landing-mobile-nav-cta {
  padding: 0.5rem 0;
}

.w-full {
  width: 100%;
}
</style>
