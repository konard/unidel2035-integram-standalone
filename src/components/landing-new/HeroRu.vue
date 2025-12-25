<template>
  <section class="hero-section">
    <div class="hero-overlay"></div>
    <div class="hero-container">
      <div class="hero-content">
        <h1 class="hero-title">
          Перестаньте работать в режиме авралов. <br />
          <span class="hero-subtitle">Ваш Excel — это бомба замедленного действия.</span>
        </h1>
        <p class="hero-description">
          ИНТЕГРАМ — это безопасное и удобное управление данными. Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам.
        </p>
        <div class="hero-actions">
          <a href="#contact">
            <button class="hero-btn">
              Получить бесплатную консультацию
            </button>
          </a>
        </div>
        <p class="hero-tagline">
          100% ваши данные. Ваши серверы. Ваш контроль.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
// Hero component for landing page
</script>

<style scoped>
.hero-section {
  min-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5rem 1.5rem;
  background: linear-gradient(135deg, #1e3a5f, #0d9488);
  color: white;
  position: relative;
  overflow: hidden;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.1), transparent 50%);
}

.hero-container {
  max-width: 80rem;
  margin: 0 auto;
  position: relative;
  z-index: 10;
}

.hero-content {
  text-align: center;
  animation: fadeIn 1s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-title {
  font-size: 3rem;
  font-weight: bold;
  line-height: 1.2;
  margin-bottom: 2rem;
}

@media (min-width: 768px) {
  .hero-title {
    font-size: 4.5rem;
  }
}

.hero-subtitle {
  color: rgba(255, 255, 255, 0.9);
}

.hero-description {
  font-size: 1.25rem;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.9);
  max-width: 48rem;
  margin: 0 auto 2rem;
}

@media (min-width: 768px) {
  .hero-description {
    font-size: 1.5rem;
  }
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  justify-content: center;
  align-items: center;
  padding-top: 1rem;
  margin-bottom: 2rem;
}

@media (min-width: 640px) {
  .hero-actions {
    flex-direction: row;
  }
}

.hero-btn {
  padding: 1.5rem 2rem;
  font-size: 1.125rem;
  font-weight: 500;
  background: #ff6f42;
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 111, 66, 0.3);
  transition: all 0.3s ease;
}

.hero-btn:hover {
  background: #ff5722;
  transform: scale(1.05);
}

.hero-tagline {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.125rem;
  padding-top: 2rem;
}
</style>
