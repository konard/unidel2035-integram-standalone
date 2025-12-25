<template>
  <div class="integram-db-selector">
    <!-- Header -->
    <div class="header">
      <div class="logo-container">
        <svg width="64" height="54" viewBox="0 0 40 34" fill="none" xmlns="http://www.w3.org/2000/svg" class="integram-logo">
          <g clip-path="url(#clip0_integram)">
            <path d="M21.0983 12.4256L19.5194 14.1254L22.2153 17.0289L13.4346 26.3889L2.28812 22.7817V11.2779L13.4346 7.67068L15.452 9.87038L17.0454 8.19038L14.1005 5L0 9.56361V24.4959L14.1005 29.0595L25.3877 17.0289L21.0983 12.4256Z" fill="currentColor"/>
            <path d="M15.4718 21.634L17.0489 19.9341L14.3548 17.0307L23.1356 7.67068L34.2802 11.2779V22.7817L23.1356 26.3889L21.1127 24.1838L19.5193 25.8656L22.4679 29.0595L36.5683 24.4977V9.56361L22.4679 5L11.1807 17.0307L15.4718 21.634Z" fill="currentColor"/>
          </g>
          <defs>
            <clipPath id="clip0_integram">
              <rect width="36.6316" height="24" fill="white" transform="translate(0 5)"/>
            </clipPath>
          </defs>
        </svg>
      </div>
      <h1>Integram Database Selector</h1>
      <p class="subtitle">Выберите базу данных или войдите в новую</p>
    </div>

    <!-- Authenticated Databases -->
    <div v-if="authenticatedDatabases.length > 0" class="section">
      <h2>
        <i class="pi pi-database"></i>
        Авторизованные базы данных
      </h2>
      <div class="db-grid">
        <Card
          v-for="db in authenticatedDatabases"
          :key="db.name"
          class="db-card"
          @click="enterDatabase(db.name)"
        >
          <template #title>
            <div class="db-title">
              <i class="pi pi-database"></i>
              {{ db.name }}
              <Tag v-if="db.isPrimary" severity="success" value="Primary" />
            </div>
          </template>
          <template #content>
            <div class="db-info">
              <div class="info-row">
                <i class="pi pi-user"></i>
                <span>{{ db.userName }}</span>
              </div>
              <div class="info-row">
                <i class="pi pi-shield"></i>
                <span>{{ db.userRole }}</span>
              </div>
            </div>
          </template>
          <template #footer>
            <Button
              label="Войти"
              icon="pi pi-sign-in"
              @click.stop="enterDatabase(db.name)"
              class="w-full"
            />
          </template>
        </Card>
      </div>
    </div>

    <!-- Owned Databases (from 'my' auth) -->
    <div v-if="ownedDatabases.length > 0" class="section">
      <h2>
        <i class="pi pi-th-large"></i>
        Доступные базы данных (через 'my')
      </h2>
      <div class="db-grid">
        <Card
          v-for="dbName in ownedDatabases"
          :key="dbName"
          class="db-card owned-db"
          @click="enterDatabase(dbName)"
        >
          <template #title>
            <div class="db-title">
              <i class="pi pi-database"></i>
              {{ dbName }}
              <Tag severity="info" value="Owned" />
            </div>
          </template>
          <template #content>
            <div class="db-info">
              <div class="info-row">
                <i class="pi pi-key"></i>
                <span>Доступ через токен 'my'</span>
              </div>
            </div>
          </template>
          <template #footer>
            <Button
              label="Войти"
              icon="pi pi-sign-in"
              @click.stop="enterDatabase(dbName)"
              class="w-full"
              severity="secondary"
            />
          </template>
        </Card>
      </div>
    </div>

    <!-- Login to New Database - Redirect Button -->
    <div class="section text-center">
      <Button
        label="Войти в новую базу данных"
        icon="pi pi-sign-in"
        @click="goToLogin"
        size="large"
        class="login-redirect-button"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import integramApiClient from '@/services/integramApiClient'

const router = useRouter()
const toast = useToast()

// Computed: Authenticated databases
const authenticatedDatabases = computed(() => {
  const databases = []

  for (const [dbName, dbSession] of Object.entries(integramApiClient.databases)) {
    databases.push({
      name: dbName,
      userName: dbSession.userName,
      userRole: dbSession.userRole,
      isPrimary: dbName === 'my'
    })
  }

  return databases.sort((a, b) => {
    // 'my' first, then alphabetical
    if (a.name === 'my') return -1
    if (b.name === 'my') return 1
    return a.name.localeCompare(b.name)
  })
})

// Computed: Owned databases (from 'my' auth)
const ownedDatabases = computed(() => {
  const mySession = integramApiClient.databases['my']
  if (!mySession || !mySession.ownedDatabases) {
    return []
  }

  // Filter out databases that are already authenticated
  return mySession.ownedDatabases.filter(
    dbName => !integramApiClient.databases[dbName]
  )
})

// Enter database
async function enterDatabase(dbName) {
  try {
    // Switch to database
    await integramApiClient.switchDatabase(dbName)

    // Navigate to database home
    router.push(`/integram/${dbName}/`)
  } catch (error) {
    console.error('Failed to enter database:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message,
      life: 5000
    })
  }
}

// Navigate to login page
function goToLogin() {
  router.push('/integram/login')
}

// Lifecycle
onMounted(() => {
  // Check if user has any authenticated databases
  if (Object.keys(integramApiClient.databases).length === 0) {
    console.log('[IntegramDatabaseSelector] No authenticated databases. Please login.')
  }
})
</script>

<style scoped>
.integram-db-selector {
  min-height: 100vh;
  background: var(--p-surface-ground, var(--surface-ground));
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 3rem;
}

.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.integram-logo {
  color: var(--p-primary-color, var(--primary-color));
}

.header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--p-text-color, var(--text-color));
}

.subtitle {
  font-size: 1.2rem;
  color: var(--p-text-color-secondary, var(--text-color-secondary));
}

.section {
  max-width: 1200px;
  margin: 0 auto 3rem;
}

.section h2 {
  color: var(--p-text-color, var(--text-color));
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.db-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.db-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.db-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  border-color: var(--p-primary-color, var(--primary-color));
}

.db-card.owned-db {
  opacity: 0.95;
}

.db-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.db-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--p-text-color-secondary, var(--text-color-secondary));
}

.login-redirect-button {
  min-width: 300px;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  font-weight: 600;
}
</style>
