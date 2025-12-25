<template>
  <div class="mention-test-page p-4">
    <Card>
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-at text-primary"></i>
          <span>Тест упоминаний пользователей (@mentions)</span>
        </div>
      </template>

      <template #content>
        <div class="mb-4">
          <Message severity="info">
            <p class="mb-2">
              <strong>Как использовать:</strong>
            </p>
            <ul class="ml-3 mb-0">
              <li>Введите <code>@</code> в текстовом поле</li>
              <li>Выберите пользователя из выпадающего списка</li>
              <li>Упоминание сохраняется в формате <code>@{'{database}'}_{'{userId}'}</code></li>
              <li>В режиме отображения упоминания показываются с фото и именем</li>
            </ul>
          </Message>
        </div>

        <div class="grid">
          <!-- Edit Mode -->
          <div class="col-12 md:col-6">
            <h3 class="text-lg font-semibold mb-3">
              <i class="pi pi-pencil mr-2"></i>
              Режим редактирования
            </h3>

            <div class="field">
              <label for="mention-input" class="block mb-2">Текст с упоминаниями:</label>
              <MentionAutocomplete
                id="mention-input"
                v-model="testText"
                :database="database"
                placeholder="Введите текст и попробуйте @упомянуть пользователя..."
              />
            </div>

            <div class="field">
              <label class="block mb-2">Сырое значение:</label>
              <div class="p-3 surface-100 border-round">
                <code class="text-sm">{{ testText || '(пусто)' }}</code>
              </div>
            </div>
          </div>

          <!-- Display Mode -->
          <div class="col-12 md:col-6">
            <h3 class="text-lg font-semibold mb-3">
              <i class="pi pi-eye mr-2"></i>
              Режим отображения
            </h3>

            <div class="field">
              <label class="block mb-2">Отображение в таблице:</label>
              <div class="p-3 surface-50 border-round border-1 surface-border">
                <MentionDisplay
                  v-if="testText"
                  :text="testText"
                  :database="database"
                />
                <span v-else class="text-500">(пусто)</span>
              </div>
            </div>

            <div class="field">
              <label class="block mb-2">Информация об упоминаниях:</label>
              <div class="p-3 surface-100 border-round">
                <div v-if="mentions.length === 0" class="text-500 text-sm">
                  Упоминаний не найдено
                </div>
                <div v-else class="flex flex-column gap-2">
                  <div
                    v-for="(mention, index) in mentions"
                    :key="index"
                    class="flex align-items-center gap-2 text-sm"
                  >
                    <Badge :value="mention.database" severity="info" size="small" />
                    <span>User ID: {{ mention.userId }}</span>
                    <span class="text-500">{{ mention.full }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sample texts -->
        <div class="mt-4">
          <h3 class="text-lg font-semibold mb-3">
            <i class="pi pi-sparkles mr-2"></i>
            Примеры для тестирования
          </h3>

          <div class="flex flex-wrap gap-2">
            <Button
              label="Простое упоминание"
              size="small"
              outlined
              @click="testText = 'Привет, @my_1!'"
            />
            <Button
              label="Множественные упоминания"
              size="small"
              outlined
              @click="testText = 'Команда: @my_1, @my_2 и @my_3 работают над проектом'"
            />
            <Button
              label="Смешанный текст"
              size="small"
              outlined
              @click="testText = 'Задача назначена на @my_1. Копия для @my_2. Срок до 01.01.2025.'"
            />
            <Button
              label="Очистить"
              size="small"
              severity="secondary"
              @click="testText = ''"
            />
          </div>
        </div>

        <!-- Database info -->
        <div class="mt-4 p-3 surface-100 border-round">
          <div class="text-sm">
            <strong>Текущая БД:</strong> <code>{{ database }}</code>
            <span class="ml-3 text-500">
              (Пользователи загружаются из таблицы 18)
            </span>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import MentionAutocomplete from '@/components/integram/MentionAutocomplete.vue'
import MentionDisplay from '@/components/integram/MentionDisplay.vue'
import { useUserMentions } from '@/components/integram/DataTable/composables/useUserMentions'

const route = useRoute()
const database = ref(route.params.database || 'my')
const testText = ref('')

// Use mentions composable to parse mentions
const { parseMentions } = useUserMentions(database.value)

// Computed property to show parsed mentions
const mentions = computed(() => parseMentions(testText.value))
</script>

<style scoped>
.mention-test-page {
  max-width: 1200px;
  margin: 0 auto;
}

code {
  background: var(--surface-200);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}
</style>
