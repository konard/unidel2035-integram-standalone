<script setup>
// Hero component with minimalist design
</script>

<template>
  <section class="landing-hero">
    <div class="landing-hero-background"></div>
    <div class="landing-hero-container">
      <div class="landing-hero-content">
        <h1 class="landing-hero-title">
          ИНТЕГРАМ - безопасная и удобная платформа для управления данными
        </h1>
        <p class="landing-hero-subtitle">
          Платформа устанавливается внутри вашей компании: автоматизируйте учёт, планирование и отчётность, не доверяя данные сторонним сервисам.
        </p>
        <div class="landing-hero-actions">
          <a href="#contact">
            <Button
              label="Получить бесплатную консультацию"
              class="landing-hero-btn"
              size="large"
            />
          </a>
        </div>
        <p class="landing-hero-note">
          100% ваши данные. Ваши серверы. Ваш контроль.
        </p>
        <div class="landing-hero-badge">
          <i class="pi pi-verified"></i>
          В реестре российского софта
          <span class="badge-details">Реестровая запись №30872 от 26.11.2025</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.landing-hero {
  position: relative;
  min-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5rem 1.5rem;
  overflow: hidden;
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%);
}

.landing-hero-background {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.1), transparent 50%);
  pointer-events: none;
}

.landing-hero-container {
  position: relative;
  z-index: 10;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.landing-hero-content {
  text-align: center;
  color: white;
  animation: fadeInUp 0.8s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.landing-hero-title {
  font-size: 2.5rem;
  font-weight: bold;
  line-height: 1.2;
  margin: 0 0 1.5rem 0;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
}

@media (min-width: 768px) {
  .landing-hero-title {
    font-size: 3.5rem;
  }
}

@media (min-width: 1024px) {
  .landing-hero-title {
    font-size: 4rem;
  }
}

.landing-hero-subtitle {
  font-size: 1.125rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 2rem 0;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
}

@media (min-width: 768px) {
  .landing-hero-subtitle {
    font-size: 1.25rem;
  }
}

@media (min-width: 1024px) {
  .landing-hero-subtitle {
    font-size: 1.5rem;
  }
}

.landing-hero-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  padding-top: 1rem;
  margin-bottom: 2rem;
}

@media (min-width: 640px) {
  .landing-hero-actions {
    flex-direction: row;
  }
}

.landing-hero-btn {
  background: #06b6d4;
  border-color: #06b6d4;
  color: white;
  padding: 0.75rem 2rem;
  font-size: 1.125rem;
  font-weight: 500;
  box-shadow: 0 4px 14px rgba(6, 182, 212, 0.4);
  transition: all 0.3s ease;
}

.landing-hero-btn:hover {
  background: #0891b2;
  border-color: #0891b2;
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(6, 182, 212, 0.6);
}

.landing-hero-note {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.125rem;
  margin: 0;
}

@media (min-width: 768px) {
  .landing-hero-note {
    font-size: 1.25rem;
  }
}

.landing-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 2rem;
  color: white;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.3s ease;
}

.landing-hero-badge:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.landing-hero-badge i {
  font-size: 1.2rem;
  color: #22c55e;
}

.badge-details {
  display: block;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  margin-left: 0.25rem;
  font-weight: 400;
}

@media (max-width: 640px) {
  .landing-hero-badge {
    flex-direction: column;
    gap: 0.25rem;
    text-align: center;
    padding: 1rem;
  }

  .badge-details {
    margin-left: 0;
  }
}
</style>
