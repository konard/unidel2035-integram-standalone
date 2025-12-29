<template>
  <div class="tokens-page">
    <div class="header">
      <div>
        <h1>Управление токенами</h1>
        <p class="subtitle">Единый токен для всех AI моделей и мини-приложений</p>
      </div>
      <div class="header-actions">
        <!-- Period Selector -->
        <div class="period-selector-header">
          <span class="period-label">Период:</span>
          <div class="period-buttons">
            <Button
              label="7 дней"
              @click="periodDays = 7"
              :severity="periodDays === 7 ? 'success' : 'secondary'"
              :outlined="periodDays !== 7"
              size="small"
            />
            <Button
              label="30 дней"
              @click="periodDays = 30"
              :severity="periodDays === 30 ? 'success' : 'secondary'"
              :outlined="periodDays !== 30"
              size="small"
            />
            <Button
              label="90 дней"
              @click="periodDays = 90"
              :severity="periodDays === 90 ? 'success' : 'secondary'"
              :outlined="periodDays !== 90"
              size="small"
            />
          </div>
        </div>
        <Button
          label="Быстрый старт"
          icon="pi pi-bolt"
          @click="showQuickStartWizard = true"
          outlined
          severity="contrast"
        />
        <Button
          label="Сгенерировать токен"
          icon="pi pi-key"
          @click="openCreateTokenDialog"
          severity="success"
        />
      </div>
    </div>

    <div class="tokens-content">
      <!-- KPI Overview -->
      <div class="kpi-overview">
        <Card class="kpi-card">
          <template #title>
            <div class="kpi-title">
              <i class="pi pi-wallet"></i>
              <span>Текущий баланс</span>
            </div>
          </template>
          <template #content>
            <div class="kpi-value">{{ formatCurrencyRUB(rublesBalance) }}</div>
            <Button
              label="Пополнить баланс"
              icon="pi pi-plus"
              @click="showTopUpDialog = true"
              class="topup-button"
              size="small"
              style="margin-top: 1rem; width: 100%;"
            />
          </template>
        </Card>

        <Card class="kpi-card">
          <template #title>
            <div class="kpi-title">
              <i class="pi pi-arrow-up-right"></i>
              <span>Потрачено</span>
            </div>
          </template>
          <template #content>
            <div class="kpi-value">{{ formatCurrencyRUB(totalSpentRub) }}</div>
            <div class="kpi-sub">за {{ periodDays }} дней</div>
          </template>
        </Card>

        <Card class="kpi-card">
          <template #title>
            <div class="kpi-title">
              <i class="pi pi-sliders-h"></i>
              <span>Использовано токенов</span>
            </div>
          </template>
          <template #content>
            <div class="kpi-value">{{ formatTokens(totalTokensUsed) }}</div>
            <div class="kpi-sub">за {{ periodDays }} дней</div>
          </template>
        </Card>
      </div>

      <!-- Referral Program Banner -->
      <Card class="welcome-banner">
        <template #content>
          <div class="banner-content">
            <div class="banner-icon">
              <i class="pi pi-users" style="font-size: 2rem; color: var(--orange-500);"></i>
            </div>
            <div class="banner-text-wrapper">
              <div class="banner-text-left">
                <h2>Реферальная программа</h2>
                <p>
                  Приглашайте друзей и получайте <strong>100 000 токенов</strong> за каждого нового пользователя!
                </p>

                <!-- Referral Link Display (Only Link) -->
                <div v-if="referralCode" class="referral-code-display">
                  <div class="referral-link-box">
                    <span class="referral-code-label">Реферальная ссылка:</span>
                    <div class="referral-code-value">
                      <code class="referral-link">{{ referralLink }}</code>
                      <Button
                        icon="pi pi-copy"
                        size="small"
                        text
                        rounded
                        @click="copyReferralLink"
                        v-tooltip.top="'Копировать ссылку'"
                      />
                    </div>
                  </div>
                </div>

                <!-- Referral Stats -->
                <div class="referral-stats">
                  <i class="pi pi-users" style="margin-right: 0.5rem;"></i>
                  <span v-if="loadingReferrals">Загрузка...</span>
                  <span v-else>Приглашено пользователей: <strong>{{ referralCount }}</strong></span>
                </div>

                <p class="token-info-text">
                  <i class="pi pi-info-circle" style="margin-right: 0.25rem;"></i>
                  Токены начисляются автоматически после регистрации реферала.
                </p>
              </div>

              <!-- Generate Code Button (Right Side) -->
              <div v-if="!referralCode" class="banner-button-wrapper">
                <Button
                  label="Получить код"
                  icon="pi pi-qrcode"
                  @click="generateReferralCode"
                  :loading="generatingReferralCode"
                  size="small"
                />
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- Period Summary -->
      <Card class="period-summary-card">
        <template #title>
          <div class="card-title-wrapper">
            <div class="title-left">
              <i class="pi pi-calendar"></i>
              <span>Всего за период</span>
            </div>
            <span class="period-badge">{{ periodDays }} дней</span>
          </div>
        </template>
        <template #content>
          <div class="period-grid">
            <div class="period-item">
              <div class="period-label">Потрачено</div>
              <div class="period-value">{{ formatCurrencyRUB(totalSpentRub) }}</div>
            </div>
            <div class="period-item">
              <div class="period-label">Средняя стоимость</div>
              <div class="period-value">{{ formatAvgCurrencyRUB(avgCostPerRequestRub) }}/запрос</div>
            </div>
            <div class="period-item">
              <div class="period-label">API запросы</div>
              <div class="period-value">{{ totalRequests }} <span class="period-sub">≈ {{ formatAvgPerDay(approxRequestsPerDay) }} в день</span></div>
            </div>
          </div>
        </template>
      </Card>

      <!-- Daily Charts -->
      <div class="charts-row">
        <Card class="chart-card">
          <template #title>
            <div class="card-title-wrapper">
              <i class="pi pi-chart-line"></i>
              <span>Использование по дням</span>
            </div>
          </template>
          <template #content>
            <div class="chart-container"><canvas ref="usageByDayChart"></canvas></div>
          </template>
        </Card>
        <Card class="chart-card">
          <template #title>
            <div class="card-title-wrapper">
              <i class="pi pi-chart-bar"></i>
              <span>Стоимость по дням</span>
            </div>
          </template>
          <template #content>
            <div class="chart-container"><canvas ref="costByDayChart"></canvas></div>
          </template>
        </Card>
      </div>
      <!-- Benefits Cards -->
      <div class="benefits-section">
        <Card class="benefit-card">
          <template #content>
            <div class="benefit-content">
              <i class="pi pi-chart-line benefit-icon" style="color: var(--green-500);"></i>
              <h3>Экономия до 70%</h3>
              <p>Покупайте токены пакетами и экономьте. Не тратьте всё сразу — токены не сгорают!</p>
            </div>
          </template>
        </Card>

        <Card class="benefit-card">
          <template #content>
            <div class="benefit-content">
              <i class="pi pi-lock-open benefit-icon" style="color: var(--blue-500);"></i>
              <h3>Доступ ко всем моделям</h3>
              <p>Один токен открывает доступ к DeepSeek, GPT-4, Claude и другим передовым моделям</p>
            </div>
          </template>
        </Card>

        <Card class="benefit-card">
          <template #content>
            <div class="benefit-content">
              <i class="pi pi-shield benefit-icon" style="color: var(--purple-500);"></i>
              <h3>Контроль расходов</h3>
              <p>Платите только за использованные токены. Никаких скрытых платежей и подписок</p>
            </div>
          </template>
        </Card>
      </div>

      <!-- Chat Invitation Card -->
      <Card class="chat-invitation-card">
        <template #content>
          <div class="chat-invitation-content">
            <div class="chat-icon-section">
              <i class="pi pi-comments" style="font-size: 4rem; color: var(--primary-color);"></i>
            </div>
            <div class="chat-text-section">
              <h2>Свободный доступ к передовым AI-моделям</h2>
              <p class="chat-description">
                Присоединяйтесь к нашему чату для прямого общения с самыми 
                современными AI моделям. Бесплатный доступ для всех 
                пользователей платформы!
              </p>
              <div class="chat-features">
                <div class="chat-feature">
                  <i class="pi pi-check-circle" style="color: var(--green-500);"></i>
                  <span>Доступ к GPT-4, Claude, Gemini</span>
                </div>
                <div class="chat-feature">
                  <i class="pi pi-check-circle" style="color: var(--green-500);"></i>
                  <span>Генерация изображений и работа с документами</span>
                </div>
                <div class="chat-feature">
                  <i class="pi pi-check-circle" style="color: var(--green-500);"></i>
                  <span>История диалогов и избранное</span>
                </div>
              </div>
              <Button
                label="Открыть чат"
                icon="pi pi-arrow-right"
                iconPos="right"
                @click="router.push('/chat')"
                size="large"
                class="chat-button"
              />
            </div>
          </div>
        </template>
      </Card>

      

      

      <!-- Supported AI Models - Using SingleTable component (my database table 195686) -->
      <Card class="collapsible-card">
        <template #title>
          <div class="flex align-items-center justify-content-between cursor-pointer" @click="aiModelsCollapsed = !aiModelsCollapsed">
            <div class="flex align-items-center gap-2">
              <i :class="aiModelsCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"></i>
              <i class="pi pi-brain"></i>
              <span>AI модели</span>
            </div>
          </div>
        </template>
        <template #content>
          <div v-show="!aiModelsCollapsed">
            <PrimeVueTable
              endpointId="object/195686"
              :showTitle="false"
              :rows="10"
              :rowsPerPageOptions="[5, 10, 25, 50]"
            />
          </div>
        </template>
      </Card>

      <!-- AI Agents - Using SingleTable component (my database table 194865) -->
      <Card class="collapsible-card">
        <template #title>
          <div class="flex align-items-center justify-content-between cursor-pointer" @click="aiAgentsCollapsed = !aiAgentsCollapsed">
            <div class="flex align-items-center gap-2">
              <i :class="aiAgentsCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"></i>
              <i class="pi pi-robot"></i>
              <span>AI Агенты</span>
            </div>
          </div>
        </template>
        <template #content>
          <div v-show="!aiAgentsCollapsed">
            <PrimeVueTable
              endpointId="object/194865"
              :showTitle="false"
              :rows="10"
              :rowsPerPageOptions="[5, 10, 25, 50]"
            />
          </div>
        </template>
      </Card>

      <!-- User Tokens Report (my database report my_tokens) -->
      <Card class="report-card">
        <template #title>
          <div class="card-title-wrapper">
            <div class="title-left">
              <i class="pi pi-key"></i>
              <span>Мои токены</span>
            </div>
            <Button
              label="Создать токен"
              icon="pi pi-plus"
              @click="openCreateTokenDialog"
              size="small"
              severity="success"
            />
          </div>
        </template>
        <template #content>
          <IntegramReportEmbed
            reportName="my_tokens"
            title="Мои токены"
            :showTotals="false"
            :autoRefresh="0"
          />
        </template>
      </Card>

      <!-- Payments Report (my database report my_paid) -->
      <Card class="report-card">
        <template #title>
          <div class="card-title-wrapper">
            <i class="pi pi-credit-card"></i>
            <span>Мои платежи</span>
          </div>
        </template>
        <template #content>
          <IntegramReportEmbed
            reportName="my_paid"
            title="Мои платежи"
            :showTotals="false"
            :autoRefresh="0"
          />
        </template>
      </Card>

      <!-- Token Consumption Report (Issue #4934: Integram report потребление_токенов) -->
      <Card class="report-card">
        <template #title>
          <div class="card-title-wrapper">
            <i class="pi pi-chart-line"></i>
            <span>Отчет по потреблению токенов</span>
          </div>
        </template>
        <template #content>
          <IntegramReportEmbed
            reportName="потребление_токенов"
            title="Потребление токенов"
            :showTotals="true"
            :autoRefresh="0"
          />
        </template>
      </Card>

      <!-- Token Usage Documentation Link -->
      <Card class="integration-card">
        <template #title>
          <div class="card-title-wrapper">
            <i class="pi pi-code"></i>
            <span>Использование токена</span>
          </div>
        </template>
        <template #content>
          <div class="documentation-link-content">
            <div class="doc-icon">
              <i class="pi pi-book" style="font-size: 4rem; color: var(--primary-color);"></i>
            </div>
            <h3>Документация по использованию токенов</h3>
            <p class="doc-description">
              Узнайте, как использовать сгенерированный токен для доступа к AI 
              моделям через API. DronDoc API совместим с OpenAI SDK и другими 
              популярными библиотеками.
            </p>
            <div class="resource-buttons">
              <Button
                label="Открыть документацию"
                icon="pi pi-book"
                @click="router.push('/developers')"
                size="large"
                severity="primary"
              />
              <Button
                label="API Песочница"
                icon="pi pi-play"
                @click="router.push('/api')"
                outlined
                size="large"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Top-up Dialog -->
    <Dialog
      v-model:visible="showTopUpDialog"
      header="Пополнение токенов"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="topup-dialog-content">
        <p class="topup-description">
          Выберите количество токенов для пополнения баланса
        </p>

        <div class="token-packages">
          <div
            v-for="pkg in tokenPackages"
            :key="pkg.tokens"
            :class="['token-package', { 'selected': selectedPackage === pkg }]"
            @click="selectedPackage = pkg"
          >
            <div class="package-tokens-display">{{ formatTokens(pkg.tokens) }}</div>
            <div class="package-price-display">{{ pkg.price }} ₽</div>
            <div v-if="pkg.bonus" class="package-bonus">+{{ pkg.bonus }}% бонус</div>
          </div>
        </div>

        <div class="selected-package-info" v-if="selectedPackage">
          <div class="info-row">
            <span>Токены:</span>
            <span class="value">{{ formatTokens(selectedPackage.tokens) }}</span>
          </div>
          <div class="info-row">
            <span>Стоимость:</span>
            <span class="value">{{ selectedPackage.price }} ₽</span>
          </div>
        </div>

        <Button
          label="Перейти к оплате"
          icon="pi pi-arrow-right"
          @click="proceedToPayment"
          :disabled="!selectedPackage"
          class="payment-button"
        />
      </div>
    </Dialog>

    <!-- Limits Dialog -->
    <Dialog
      v-model:visible="showLimitsDialog"
      header="Настройка лимитов"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="limits-dialog-content">
        <p class="limits-description">
          Установите лимиты потребления токенов для контроля расходов
        </p>

        <div class="limit-input-group">
          <label for="daily-limit">Дневной лимит (токенов)</label>
          <InputNumber
            id="daily-limit"
            v-model="editLimits.daily"
            :min="0"
            :step="1000"
            showButtons
          />
        </div>

        <div class="limit-input-group">
          <label for="monthly-limit">Месячный лимит (токенов)</label>
          <InputNumber
            id="monthly-limit"
            v-model="editLimits.monthly"
            :min="0"
            :step="10000"
            showButtons
          />
        </div>

        <div class="limit-actions">
          <Button
            label="Сохранить"
            icon="pi pi-check"
            @click="saveLimits"
          />
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="showLimitsDialog = false"
            outlined
          />
        </div>
      </div>
    </Dialog>

    <!-- Legacy Token Generation Dialog removed - using single unified dialog below -->

    <!-- Quick Start Wizard Dialog -->
    <Dialog
      v-model:visible="showQuickStartWizard"
      header="Быстрый старт с AI токенами"
      :modal="true"
      :style="{ width: '700px' }"
    >
      <div class="wizard-content">
        <Steps :model="wizardSteps" :activeIndex="currentWizardStep" :readonly="false" />

        <div class="wizard-step-content">
          <!-- Step 1: Welcome -->
          <div v-if="currentWizardStep === 0" class="step-panel">
            <div class="step-icon">🎉</div>
            <h3>Добро пожаловать!</h3>
            <p>
              Этот мастер поможет вам настроить доступ к AI моделям через 
              DronDoc API. Вы научитесь:
            </p>
            <ul class="wizard-list">
              <li><i class="pi pi-check-circle"></i> Генерировать токены доступа</li>
              <li><i class="pi pi-check-circle"></i> Просматривать доступные модели</li>
              <li><i class="pi pi-check-circle"></i> Управлять балансом и лимитами</li>
              <li><i class="pi pi-check-circle"></i> Интегрировать API в ваше приложение</li>
            </ul>
          </div>

          <!-- Step 2: Generate Token -->
          <div v-if="currentWizardStep === 1" class="step-panel">
            <div class="step-icon">🔑</div>
            <h3>Генерация токена</h3>
            <p>
              Токен необходим для аутентификации запросов к AI моделям.
              Нажмите кнопку ниже, чтобы создать ваш первый токен.
            </p>
            <div class="wizard-action">
              <Button
                label="Сгенерировать токен"
                icon="pi pi-key"
                @click="openTokenGenerationFromWizard"
                severity="success"
                size="large"
              />
            </div>
            <Message severity="info" :closable="false" class="wizard-tip">
              <p>
              <strong>Совет:</strong> Храните токен в безопасном месте. 
              Он не будет показан повторно!
            </p>
            </Message>
          </div>

          <!-- Step 3: View Models -->
          <div v-if="currentWizardStep === 2" class="step-panel">
            <div class="step-icon">🤖</div>
            <h3>Выбор моделей</h3>
            <p>
              DronDoc предоставляет доступ к 250+ моделям ИИ от ведущих 
              провайдеров: OpenAI, Anthropic, Google, Meta и других.
            </p>
            <div class="models-preview">
              <div v-for="model in aiModels.slice(0, 3)" :key="model.id" class="model-preview-card">
                <strong>{{ model.name }}</strong>
                <span class="model-cost">{{ model.costPer1k }} токенов/1K</span>
              </div>
            </div>
            <div class="wizard-action">
              <Button
                label="Посмотреть все модели"
                icon="pi pi-external-link"
                @click="router.push('/ai-models')"
                outlined
                size="large"
              />
            </div>
          </div>

          <!-- Step 4: Integration -->
          <div v-if="currentWizardStep === 3" class="step-panel">
            <div class="step-icon">⚡</div>
            <h3>Интеграция API</h3>
            <p>Используйте ваш токен для выполнения запросов к AI моделям:</p>
            <div class="code-example">
              <pre><code>curl https://api.dronedoc.ru/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'</code></pre>
            </div>
            <div class="wizard-action">
              <Button
                label="Полная документация API"
                icon="pi pi-book"
                @click="router.push('/developers')"
                outlined
                size="large"
              />
            </div>
          </div>

          <!-- Step 5: Complete -->
          <div v-if="currentWizardStep === 4" class="step-panel">
            <div class="step-icon">✅</div>
            <h3>Всё готово!</h3>
            <p>
              Теперь вы готовы использовать AI модели через DronDoc API.
              Следите за балансом токенов и лимитами на этой странице.
            </p>
            <div class="quick-links">
              <Card class="quick-link-card" @click="router.push('/ai-models')">
                <template #content>
                  <i class="pi pi-sparkles"></i>
                  <span>Модели ИИ</span>
                </template>
              </Card>
              <Card class="quick-link-card" @click="router.push('/developers')">
                <template #content>
                  <i class="pi pi-code"></i>
                  <span>API Документация</span>
                </template>
              </Card>
              <Card class="quick-link-card" @click="router.push('/api')">
                <template #content>
                  <i class="pi pi-play"></i>
                  <span>API Песочница</span>
                </template>
              </Card>
            </div>
          </div>
        </div>

        <div class="wizard-navigation">
          <Button
            v-if="currentWizardStep > 0"
            label="Назад"
            icon="pi pi-arrow-left"
            @click="previousWizardStep"
            text
          />
          <div class="spacer"></div>
          <Button
            v-if="currentWizardStep < 4"
            label="Далее"
            icon="pi pi-arrow-right"
            iconPos="right"
            @click="nextWizardStep"
          />
          <Button
            v-if="currentWizardStep === 4"
            label="Завершить"
            icon="pi pi-check"
            @click="showQuickStartWizard = false"
            severity="success"
          />
        </div>
      </div>
    </Dialog>

    

    <!-- Create Token Dialog -->
    <Dialog
      v-model:visible="showCreateTokenDialog"
      header="Создание нового токена"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="create-token-content">
        <Message severity="info" :closable="false" class="info-msg">
          <p>
            <strong>Создание токена для доступа к AI моделям</strong>
          </p>
          <p>
            Токен будет сохранен в таблице AI token (ID: 198016) через Integram API
            с привязкой к вашему пользователю.
          </p>
          <p>
            <small>Эндпоинт: /_m_new/198016?JSON&up=USER_ID (база данных: my)</small>
          </p>
        </Message>

        <div class="field">
          <label for="token-transaction">Название/Описание токена</label>
          <InputText
            id="token-transaction"
            v-model="createTokenForm.transaction"
            placeholder="Мой AI токен для проекта"
            class="w-full"
          />
          <small>Понятное название для идентификации токена</small>
        </div>

        <div class="field">
          <label for="token-date">Дата создания</label>
          <InputText
            id="token-date"
            v-model="createTokenForm.date"
            :placeholder="new Date().toISOString().split('T')[0]"
            class="w-full"
          />
          <small>Дата в формате YYYY-MM-DD (оставьте пустым для автоматической установки)</small>
        </div>

        <div class="field">
          <label for="token-expiry">Срок действия</label>
          <InputText
            id="token-expiry"
            v-model="createTokenForm.expiry"
            :placeholder="getDefaultExpiryDate()"
            class="w-full"
          />
          <small>Дата истечения токена (оставьте пустым для установки через 1 год)</small>
        </div>

        <div class="token-preview">
          <h4>Предварительный просмотр:</h4>
          <div class="preview-item">
            <span class="preview-label">Название:</span>
            <span class="preview-value">{{ createTokenForm.transaction || 'Мой AI токен' }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">Дата создания:</span>
            <span class="preview-value">{{ createTokenForm.date || new Date().toISOString().split('T')[0] }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">Срок действия:</span>
            <span class="preview-value">{{ createTokenForm.expiry || getDefaultExpiryDate() }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          @click="showCreateTokenDialog = false"
          outlined
          severity="secondary"
        />
        <Button
          label="Создать токен"
          @click="createToken"
          :loading="creatingToken"
          :disabled="creatingToken"
          severity="success"
          icon="pi pi-plus"
        />
        <div v-if="creatingToken" class="loading-status">
          <i class="pi pi-spin pi-spinner" style="margin-right: 0.5rem;"></i>
          Создание токена...
        </div>
      </template>
    </Dialog>

    <!-- Generated Token Display Dialog -->
    <Dialog
      v-model:visible="showGeneratedTokenDialog"
      header="Ваш новый токен создан!"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="generated-token-dialog">
        <Message severity="warn" :closable="false">
          <p><strong>Важно!</strong> Сохраните этот токен прямо сейчас. Он не будет показан повторно!</p>
        </Message>

        <div class="token-display-box">
          <label>Ваш токен:</label>
          <div class="token-value-container">
            <code class="token-value">{{ generatedToken }}</code>
            <Button
              icon="pi pi-copy"
              @click="copyToken"
              text
              severity="secondary"
              v-tooltip="'Копировать токен'"
            />
          </div>
        </div>

        <div class="token-usage-info">
          <h4><i class="pi pi-info-circle"></i> Как использовать токен:</h4>
          <pre><code>curl https://api.dronedoc.ru/v1/chat/completions \
  -H "Authorization: Bearer {{ generatedToken }}" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "Hello!"}]}'</code></pre>
        </div>
      </div>

      <template #footer>
        <Button
          label="Я сохранил токен"
          icon="pi pi-check"
          @click="showGeneratedTokenDialog = false; loadTokenData()"
          severity="success"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'

import PrimeVueTable from '@/components/PrimeVueTable.vue'
import SmartQTable from '@/components/SmartQTable.vue'
import IntegramReportEmbed from '@/components/integram/IntegramReportEmbed.vue'
import { Chart, registerables } from 'chart.js'
import myClient from '@/myAxios'
import { createPaymentIntent, processPayment } from '@/services/paymentService'
import integramService from '@/services/integramService'

Chart.register(...registerables)

const router = useRouter()
const toast = useToast()

// State
const tokenBalance = ref(0)
const dailyUsage = ref(0)
const monthlyUsage = ref(0)
// История потребления по дням для диаграмм
const consumptionHistory = ref([])
const limits = ref({
  daily: 50000,
  monthly: 1000000
})

const editLimits = ref({ ...limits.value })
const loadingBalance = ref(false)
const loadingUsage = ref(false)

// Collapsible sections state
const aiModelsCollapsed = ref(true)
const aiAgentsCollapsed = ref(true)

// UI State
const showTopUpDialog = ref(false)
const showLimitsDialog = ref(false)
const selectedPackage = ref(null)
// showTokenGenerationDialog - REMOVED
const showQuickStartWizard = ref(false)
const creatingToken = ref(false)
// generatedTokenValue - REMOVED
const currentWizardStep = ref(0)
// New component dialogs
const showCreateTokenDialog = ref(false)
const showPaymentDialog = ref(false)
const showGeneratedTokenDialog = ref(false)
const generatedToken = ref('')

// Referral Program State
const referralCode = ref(null)
const generatingReferralCode = ref(false)
const referralCount = ref(0)
const loadingReferrals = ref(false)

// Removed redundant token report state to focus on Integram integration

// Create Token State
const createTokenForm = ref({
  date: '',
  expiry: '',
  transaction: ''
})

// All AI Models State (for full paginated table)
const allAiModels = ref([])
const loadingModels = ref(false)

// New token form - REMOVED

// Wizard steps
const wizardSteps = ref([
  { label: 'Добро пожаловать' },
  { label: 'Токен' },
  { label: 'Модели' },
  { label: 'API' },
  { label: 'Готово' }
])

// Token packages
const tokenPackages = ref([
  { tokens: 50000, price: 100, bonus: 0 },
  { tokens: 100000, price: 180, bonus: 10 },
  { tokens: 500000, price: 800, bonus: 20 },
  { tokens: 1000000, price: 1500, bonus: 25 }
])

// AI Models - будет загружаться из таблицы 305 через интеграм API
const aiModels = ref([])

// Usage History - REMOVED

// === KPI & Daily Charts ===
const periodDays = ref(30)
const TOKENS_PER_RUBLE = 1000 // Approximate conversion: 1000 токенов ≈ 1 ₽

// Refs for daily charts
const usageByDayChart = ref(null)
const costByDayChart = ref(null)
let usageByDayChartInstance = null
let costByDayChartInstance = null

// Formatting helpers
const formatCurrencyRUB = (amount) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0)
}

const getDefaultExpiryDate = () => {
  const defaultExpiry = new Date()
  defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1)
  return defaultExpiry.toISOString().split('T')[0]
}

const formatAvgCurrencyRUB = (amount) => {
  const value = Number.isFinite(amount) ? amount : 0
  return `${value.toFixed(3)} ₽`
}

const formatAvgPerDay = (val) => {
  if (!val || !Number.isFinite(val)) return '0'
  if (val < 0.1) return '<0.1'
  return val.toFixed(1)
}

// Conversion helpers
const tokensToRub = (tokens) => Math.round((tokens / TOKENS_PER_RUBLE) * 100) / 100

// Payment function moved to line ~1263 (proceedToPayment with database integration)

// KPI computed values
// tokenBalance already contains balance in rubles (from report)
const rublesBalance = computed(() => tokenBalance.value)
const filteredHistory = computed(() => {
  // Фильтруем историю потребления по выбранному периоду
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays.value * 24 * 60 * 60 * 1000)
  return consumptionHistory.value.filter(item => {
    const itemDate = new Date(item.timestamp)
    return itemDate >= startDate && itemDate <= now
  })
})
// Calculate totals based on selected period (filteredHistory respects periodDays)
const totalTokensUsed = computed(() => {
  return filteredHistory.value.reduce((sum, item) => {
    return sum + (item.tokens || item.total_tokens || 0)
  }, 0)
})
const totalRequests = computed(() => Math.ceil(totalTokensUsed.value / 1000)) // Estimate ~1000 tokens per request
const totalSpentRub = computed(() => tokensToRub(totalTokensUsed.value))
const avgCostPerRequestRub = computed(() => totalRequests.value > 0 ? totalSpentRub.value / totalRequests.value : 0)
const approxRequestsPerDay = computed(() => periodDays.value > 0 ? totalRequests.value / periodDays.value : 0)

// Referral Link
const referralLink = computed(() => {
  if (!referralCode.value) return ''
  return `${window.location.origin}/register?ref=${referralCode.value}`
})

// Aggregate usage per day
const usageByDay = computed(() => {
  const map = new Map()
  const today = new Date()
  for (let i = periodDays.value - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    map.set(key, 0)
  }
  for (const item of filteredHistory.value) {
    const key = new Date(item.timestamp).toISOString().slice(0, 10)
    if (map.has(key)) {
      map.set(key, (map.get(key) || 0) + (item.tokens || item.total_tokens || 0))
    }
  }
  const labels = []
  const values = []
  for (const [key, value] of map.entries()) {
    const d = new Date(key)
    labels.push(d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }))
    values.push(value)
  }
  return { labels, values }
})

const costByDay = computed(() => ({
  labels: usageByDay.value.labels,
  values: usageByDay.value.values.map(v => tokensToRub(v))
}))

// Current user ID for filtering tokens
const currentUserId = ref(null)

// User's AI token ID for filtering consumption (subordinate table)
// Issue #3962: Transactions are subordinate to user's token, not directly to user
const userTokenId = ref(null)

// Computed endpoint for token consumption table (my database table 198038)
// Issue #3962: Transactions are subordinate to user's token, so filter by tokenId not userId
const consumptionEndpoint = computed(() => {
  const baseEndpoint = 'object/198038'

  // Use userTokenId (ID токена пользователя из таблицы 198016)
  // Транзакции подчинены токену, а не напрямую пользователю
  if (userTokenId.value) {
    return `${baseEndpoint}?F_U=${userTokenId.value}`
  }
  // Return null if no token ID - table won't render without v-if
  return null
})

// Chart

// Methods
const formatTokens = (amount) => {
  return new Intl.NumberFormat('ru-RU').format(amount)
}

// Wizard and dialog methods - REMOVED

// Token management methods - REMOVED

// Create new token using Integram REST API with proper authentication
const createToken = async () => {
  creatingToken.value = true

  try {
    // Get authentication token from localStorage (Issue #3945: Use my database token)
    const myToken = localStorage.getItem('token')
    const authDb = localStorage.getItem('db')

    if (!myToken || authDb !== 'my') {
      throw new Error('Токен аутентификации не найден. Пожалуйста, войдите в систему с базой данных "my"')
    }

    // Get current user ID (try to extract from token or use default)
    const userId = await getCurrentUserId()

    console.log('🎯 Creating token in my database...')
    console.log('📋 Token form data:', createTokenForm.value)
    console.log('👤 Current user ID:', userId)

    // Prepare form data for Integram API
    // Issue #3945: Changed from ddadmin/298 to my/198016
    // Issue #4109: Fixed requisite IDs and added token value generation
    const formData = new URLSearchParams()
    formData.append('typ', '198016') // AI token table ID in my database

    // Generate unique token value (dd_tok_<random32chars>)
    const generateTokenValue = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let result = 'dd_tok_'
      for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return result
    }
    const tokenValue = generateTokenValue()

    // Add required fields with default values
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

    // Set the main value (token) - this is the actual token string
    formData.append('val', tokenValue)

    // Requisite IDs for table 198016 (ai_token):
    // - 198018: Дата (date)
    // - 198020: Название (name/description)
    // - 198023: Срок (expiry reference to table 198021)
    // Срок options: 198024=7дней, 198025=1месяц, 198026=1год
    formData.append('t198018', createTokenForm.value.date || today)
    formData.append('t198020', createTokenForm.value.transaction || `Токен ${new Date().toLocaleDateString('ru-RU')}`)

    // Map expiry selection to reference IDs
    const expiryOptions = { '7d': '198024', '1m': '198025', '1y': '198026' }
    formData.append('t198023', expiryOptions[createTokenForm.value.expiry] || '198026') // Default: 1 year

    // CRITICAL FIX: Save the token to access_token requisite (205985) for proper storage
    // The 'val' field is just the object name - the actual token must be in this requisite
    formData.append('t205985', tokenValue)  // access_token requisite

    // Set default values for other token fields
    formData.append('t205987', 'deepseek-chat')  // model_id - default model
    formData.append('t205989', '1000000')        // token_balance - 1M tokens
    formData.append('t205991', '100000')         // daily_limit - 100K tokens/day
    formData.append('t205993', '1000000')        // monthly_limit - 1M tokens/month

    // Try to get XSRF token first
    let xsrfToken = null
    try {
      const xsrfResponse = await myClient.get('/xsrf?JSON_KV=true')
      xsrfToken = xsrfResponse.data.xsrf || xsrfResponse.data._xsrf || xsrfResponse.data.XSRF
      if (xsrfToken) {
        formData.append('_xsrf', xsrfToken)
        console.log('✅ XSRF token obtained:', xsrfToken.substring(0, 20) + '...')
      }
    } catch (xsrfError) {
      console.warn('⚠️ Could not get XSRF token, continuing without it:', xsrfError.message)
    }

    // Use the correct Integram endpoint with user ID (Issue #3945: my database table 198016)
    const endpoint = `/_m_new/198016?JSON&up=${userId}`

    console.log(`🔄 Using endpoint: ${endpoint}`)

    const response = await myClient.post(endpoint, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    
    console.log('📊 Response data:', response.data)
    
    const result = response.data
    
    // Check for success
    if (result && !result.error) {
      console.log('✅ Token created successfully!')
      console.log('🔑 Generated token value:', tokenValue)

      toast.add({
        severity: 'success',
        summary: 'Токен создан',
        detail: 'Новый токен успешно создан и сохранен в базе данных',
        life: 5000
      })

      // Close create dialog and reset form
      showCreateTokenDialog.value = false
      createTokenForm.value = {
        date: '',
        expiry: '',
        transaction: ''
      }

      // Show the generated token dialog so user can copy the token
      generatedToken.value = tokenValue
      showGeneratedTokenDialog.value = true

      // Issue #3962: Refresh userTokenId for consumption table after creating new token
      await loadUserTokenId()

      // Refresh balance data
      await loadTokenBalance()

      return
    } else if (result && result.error) {
      throw new Error(result.error)
    } else {
      throw new Error('Неизвестный формат ответа от сервера')
    }
    
  } catch (error) {
    console.error('❌ Error creating token:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка создания',
      detail: error.message || 'Не удалось создать токен. Проверьте подключение к базе данных.',
      life: 5000
    })
  } finally {
    creatingToken.value = false
  }
}

// Token management functions - REMOVED

// New component event handlers
const handleTokenCreated = async (newTokenData) => {
  toast.add({
    severity: 'success',
    summary: 'Токен создан',
    detail: 'Новый токен успешно создан',
    life: 3000
  })
  showCreateTokenDialog.value = false
}

// Initialize form when dialog opens
const openCreateTokenDialog = () => {
  initializeCreateTokenForm()
  showCreateTokenDialog.value = true
}

const initializeCreateTokenForm = () => {
  createTokenForm.value = {
    date: '',
    expiry: '1y',
    transaction: ''
  }
}

// Copy generated token to clipboard
const copyToken = async () => {
  try {
    await navigator.clipboard.writeText(generatedToken.value)
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'Токен скопирован в буфер обмена',
      life: 2000
    })
  } catch (error) {
    console.error('Failed to copy token:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось скопировать токен',
      life: 3000
    })
  }
}

// Get current user ID from session/token
const getCurrentUserId = async () => {
  try {
    const authDb = localStorage.getItem('db')

    // 1. For my database, userId is stored in 'id' key when db === 'my'
    if (authDb === 'my') {
      const myUserId = localStorage.getItem('id')
      if (myUserId) {
        console.log('✅ Found my database user ID:', myUserId)
        return myUserId
      }
    }

    // 2. Try to extract from URL parameters (F_U=xxx)
    const urlParams = new URLSearchParams(window.location.search)
    const urlUserId = urlParams.get('F_U')
    if (urlUserId) {
      console.log('✅ Found user ID in URL:', urlUserId)
      return urlUserId
    }

    // 3. Try to get from my database session info
    try {
      const sessionResponse = await myClient.get('/session')
      if (sessionResponse.data?.user?.id) {
        console.log('✅ Found user ID in session:', sessionResponse.data.user.id)
        return sessionResponse.data.user.id.toString()
      }
    } catch (sessionError) {
      console.warn('Could not get session info:', sessionError.message)
    }

    // 4. No userId found
    console.warn('⚠️ No user ID found for my database')
    return null

  } catch (error) {
    console.warn('Could not get current user ID:', error)
    return null
  }
}

/**
 * Get user object ID from Integram database by userId
 */
const getUserObjectId = async (userId) => {
  try {
    // Get user from Integram (table 18 - Users)
    const users = await integramService.getObjectList(18, { limit: 1000 })

    // Find user by userId (need to check which column stores userId)
    // For now, we'll use the object ID directly if userId matches object ID format
    // This is a placeholder - adjust based on actual table structure

    // If userId is already an Integram object ID, return it
    if (users && users.length > 0) {
      // Try to find user by some identifier
      // This needs to be adjusted based on actual table structure
      const user = users.find(u => u.id === userId || u.val === userId)
      return user ? user.id : null
    }

    return null
  } catch (error) {
    console.error('Failed to get user object ID:', error)
    return null
  }
}

/**
 * Generate referral code for current user and save to Integram database
 * Database: https://dronedoc.ru/my/object/18 (Users table)
 * Column: 209325 (Referral Code)
 */
const generateReferralCode = async () => {
  try {
    generatingReferralCode.value = true
    const userId = await getCurrentUserId()

    if (!userId) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось определить ID пользователя',
        life: 3000
      })
      return
    }

    // Generate unique referral code: first 8 chars of userId + random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    const code = `${userId.substring(0, 8).toUpperCase()}-${randomSuffix}`

    // Get current user object ID from Integram
    const userObjectId = await getUserObjectId(userId)

    if (!userObjectId) {
      console.warn('User object ID not found, using userId directly:', userId)
      // If we can't find the user, try using userId as object ID
      // This assumes userId might be the Integram object ID
    }

    // Save to Integram database (table 18, column 209325)
    const objectId = userObjectId || userId
    await integramService.setObjectRequisites(objectId, {
      '209325': code  // Referral code column
    })

    referralCode.value = code

    // Load referral statistics
    await loadReferralStats()

    toast.add({
      severity: 'success',
      summary: 'Код создан',
      detail: 'Реферальный код успешно сгенерирован',
      life: 3000
    })
  } catch (error) {
    console.error('Failed to generate referral code:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.message || 'Не удалось создать реферальный код',
      life: 3000
    })
  } finally {
    generatingReferralCode.value = false
  }
}

/**
 * Copy referral code to clipboard
 */
const copyReferralCode = async () => {
  try {
    await navigator.clipboard.writeText(referralCode.value)
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'Реферальный код скопирован в буфер обмена',
      life: 2000
    })
  } catch (error) {
    console.error('Failed to copy referral code:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось скопировать код',
      life: 2000
    })
  }
}

/**
 * Copy referral link to clipboard
 */
const copyReferralLink = async () => {
  try {
    await navigator.clipboard.writeText(referralLink.value)
    toast.add({
      severity: 'success',
      summary: 'Скопировано',
      detail: 'Реферальная ссылка скопирована в буфер обмена',
      life: 2000
    })
  } catch (error) {
    console.error('Failed to copy referral link:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось скопировать ссылку',
      life: 2000
    })
  }
}

/**
 * Load referral statistics - count users who were invited by current user
 * Checks column 209326 (referrer code) in table 18 (Users)
 */
const loadReferralStats = async () => {
  if (!referralCode.value) return

  try {
    loadingReferrals.value = true

    // Get all users from Integram (table 18)
    const users = await integramService.getObjectList(18, { limit: 10000 })

    if (!users) {
      referralCount.value = 0
      return
    }

    // Count users who have our referral code in column 209326
    let count = 0
    for (const user of users) {
      // Get user data to check referrer column
      try {
        const userData = await integramService.getObjectEditData(user.id)
        if (userData && userData.reqs && userData.reqs['209326'] === referralCode.value) {
          count++
        }
      } catch (error) {
        console.warn(`Failed to check user ${user.id}:`, error)
      }
    }

    referralCount.value = count
    console.log(`✅ Found ${count} users invited with code ${referralCode.value}`)
  } catch (error) {
    console.error('Failed to load referral stats:', error)
  } finally {
    loadingReferrals.value = false
  }
}

const handlePaymentCompleted = async (paymentData) => {
  toast.add({
    severity: 'success',
    summary: 'Оплата успешна',
    detail: `Добавлено ${formatTokens(paymentData.tokens)} токенов`,
    life: 5000
  })
  showPaymentDialog.value = false
  // Reload balance after successful payment
  await loadTokenBalance()
}

/**
 * Issue #4117: Proceed to payment for selected token package
 * Creates payment intent and initiates payment flow
 */
const proceedToPayment = async () => {
  if (!selectedPackage.value) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Выберите пакет токенов',
      life: 3000
    })
    return
  }

  try {
    // Get current user ID
    const userId = await getCurrentUserId()
    if (!userId) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось определить пользователя. Пожалуйста, войдите в систему.',
        life: 5000
      })
      return
    }

    console.log('Processing payment for package:', selectedPackage.value)

    // Load user's token ID if not loaded
    if (!userTokenId.value) {
      await loadUserTokenId()
    }

    if (!userTokenId.value) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не найден токен пользователя. Обратитесь к администратору.',
        life: 5000
      })
      return
    }

    try {
      // Create transaction record in table 198038 (subordinate to token)
      // The "balance" report will automatically calculate balance from transactions
      const transactionResponse = await myClient.post('/object/198038', {
        typeId: 198038,
        value: `Пополнение на ${selectedPackage.value.price} ₽`,
        parentId: userTokenId.value, // Link to user's token
        requisites: {
          '198043': selectedPackage.value.price.toString() // Цена field
        }
      })

      console.log('Transaction created:', transactionResponse.data)

      // Reload balance from report (it calculates from transactions)
      await loadTokenBalance()

      // Show success message with new balance
      toast.add({
        severity: 'success',
        summary: 'Баланс пополнен',
        detail: `Добавлено ${selectedPackage.value.price} ₽. Новый баланс: ${formatCurrencyRUB(tokenBalance.value)}`,
        life: 5000
      })

      // Close dialogs
      showTopUpDialog.value = false

    } catch (createError) {
      console.error('Failed to process payment:', createError)

      // Fallback: Show payment dialog for manual processing
      toast.add({
        severity: 'error',
        summary: 'Ошибка пополнения',
        detail: 'Не удалось обновить баланс. Попробуйте позже.',
        life: 5000
      })

      showPaymentDialog.value = true
      showTopUpDialog.value = false
    }

  } catch (error) {
    console.error('Payment error:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка оплаты',
      detail: error.message || 'Не удалось создать платеж. Попробуйте позже.',
      life: 5000
    })
  }
}

const editToken = (token) => {
  toast.add({
    severity: 'info',
    summary: 'Информация',
    detail: `Редактирование токена: ${token.name || 'Без названия'}`,
    life: 3000
  })
}

// toggleTokenActive - REMOVED

const parseJsonField = (field) => {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field)
    } catch (e) {
      return []
    }
  }
  return Array.isArray(field) ? field : []
}

/**
 * Issue #3962: Load user's token ID from table 198016 for consumption filtering
 * Transactions (198038) are subordinate to tokens (198016), not directly to users
 * So we need to filter by tokenId, not userId
 */
const loadUserTokenId = async () => {
  try {
    if (!currentUserId.value) {
      console.warn('Cannot load user token ID: no current user ID')
      return
    }

    console.log('Loading user token ID from table 198016 for user:', currentUserId.value)

    // Fetch user's tokens from table 198016 with user filter
    const response = await myClient.get(`/object/198016?F_U=${currentUserId.value}`)

    if (response.data?.response?.rows?.length > 0) {
      // Get the first token's ID
      const firstToken = response.data.response.rows[0]
      userTokenId.value = firstToken.id
      console.log('Found user token ID:', userTokenId.value)
    } else {
      console.warn('No tokens found for user:', currentUserId.value)
      userTokenId.value = null
    }
  } catch (error) {
    console.error('Error loading user token ID:', error)
    userTokenId.value = null
  }
}

// Load token data from API
const loadTokenData = async () => {
  loadingModels.value = true
  try {
    await loadFromIntegramDatabase()
  } catch (error) {
    console.error('Error loading token data:', error)
  } finally {
    loadingModels.value = false
  }
}

/**
 * Load AI models from Integram database (table 195686) and AI agents from table 194865
 * Issue #3945: Migrated from ddadmin to my database
 * Uses my database with unified authentication token
 */
const loadFromIntegramDatabase = async () => {
  try {
    // Check if my database authentication is available (Issue #3945)
    const myToken = localStorage.getItem('token')
    const authDb = localStorage.getItem('db')

    if (!myToken || authDb !== 'my') {
      console.warn('my database authentication not available. Cannot load from Integram database.')
      toast.add({
        severity: 'warn',
        summary: 'Ограниченный доступ',
        detail: 'Некоторые функции недоступны. Требуется доступ к базе данных "my".',
        life: 5000
      })
      return
    }

    // Issue #5112: Authenticate integramService before calling executeReport
    // Check if integramService is already authenticated
    if (!integramService.isAuthenticated()) {
      console.log('🔄 Authenticating integramService...')

      // Try to restore session from localStorage
      const storedSession = localStorage.getItem('integram_session')
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession)
          integramService.setSession(sessionData)

          if (integramService.isAuthenticated()) {
            console.log('✅ Restored integramService session from localStorage')
          }
        } catch (e) {
          console.error('❌ Failed to parse integram_session:', e)
        }
      }

      // If still not authenticated, try with credentials from localStorage
      if (!integramService.isAuthenticated()) {
        const storedUser = localStorage.getItem('user')
        const storedPassword = localStorage.getItem('password')
        const storedDatabase = localStorage.getItem('db')

        if (storedUser && storedPassword && storedDatabase) {
          console.log('🔄 Attempting to authenticate integramService with stored credentials...')
          try {
            const authResult = await integramService.auth(storedUser, storedPassword, storedDatabase)
            if (authResult.success) {
              console.log('✅ Successfully authenticated integramService')
            } else {
              console.warn('⚠️ Authentication failed:', authResult.error)
              toast.add({
                severity: 'error',
                summary: 'Ошибка авторизации',
                detail: 'Не удалось авторизоваться в Integram. Обновите страницу.',
                life: 5000
              })
              return
            }
          } catch (authError) {
            console.error('❌ Error during authentication:', authError)
            toast.add({
              severity: 'error',
              summary: 'Ошибка авторизации',
              detail: 'Произошла ошибка при авторизации в Integram.',
              life: 5000
            })
            return
          }
        } else {
          console.warn('⚠️ No stored credentials available for integramService authentication')
          toast.add({
            severity: 'warn',
            summary: 'Требуется авторизация',
            detail: 'Войдите в систему для доступа к данным.',
            life: 5000
          })
          return
        }
      }
    } else {
      console.log('✅ integramService already authenticated')
    }

    // Initialize current user ID for tokens filtering
    currentUserId.value = await getCurrentUserId()

    // Issue #3962: Load user's token ID for consumption table filtering
    // Transactions are subordinate to tokens, so we need tokenId not userId
    await loadUserTokenId()

    // Load balance and usage data from database
    // Issue #4109: Connect balance section to real database data
    await Promise.all([
      loadTokenBalance(),
      loadTokenUsage()
    ])

    // Load AI Models from table 195686 (Issue #3945: migrated from ddadmin/305)
    try {
      console.log('Loading AI models from table 195686...')
      const modelsResult = await myClient.get('/object/195686')

      if (modelsResult.data?.response) {
        const modelsData = modelsResult.data.response

        // Transform models data
        allAiModels.value = modelsData.rows.map(row => {
          const getValueByHeaderId = (headerId) => {
            const cell = row.values.find(v => v.headerId === headerId)
            return cell ? cell.value : null
          }

          // Map table columns to model properties
          return {
            id: row.id,
            model_id: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Model ID')?.id) || row.id,
            display_name: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Name' || h.value === 'Model Name')?.id) || 'Unknown Model',
            provider_name: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Provider')?.id) || 'unknown',
            provider_display_name: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Provider')?.id) || 'Unknown',
            description: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Description')?.id) || '',
            context_window: parseInt(getValueByHeaderId(modelsData.headers.find(h => h.value === 'Context Window')?.id)) || 0,
            cost_per_1k_input: parseFloat(getValueByHeaderId(modelsData.headers.find(h => h.value === 'Input Cost')?.id)) || 0,
            cost_per_1k_output: parseFloat(getValueByHeaderId(modelsData.headers.find(h => h.value === 'Output Cost')?.id)) || 0,
            capabilities: getValueByHeaderId(modelsData.headers.find(h => h.value === 'Capabilities')?.id) || '[]'
          }
        })

        // Update aiModels for wizard preview (first 6)
        aiModels.value = allAiModels.value.slice(0, 6).map(model => ({
          id: model.model_id,
          name: model.display_name,
          provider: model.provider_display_name,
          description: model.description || 'AI модель',
          costPer1k: Math.round((model.cost_per_1k_input || 0) * 100) / 100,
          usage: Math.floor(Math.random() * 50000),
          enabled: true
        }))

        console.log('Successfully loaded AI models from table 195686:', allAiModels.value.length, 'models')
      }
    } catch (modelsError) {
      console.warn('Failed to load AI models from table 195686:', modelsError)
      console.warn('Using fallback data due to API error')
      useFallbackData()
    }

    // Load AI Agents from table 194865 (Issue #3945: migrated from ddadmin/837)
    try {
      console.log('Loading AI agents from table 194865...')
      const agentsResult = await myClient.get('/object/194865')

      if (agentsResult.data?.response) {
        const agentsData = agentsResult.data.response
        console.log('Successfully loaded AI agents from table 194865:', agentsData.rows?.length || 0, 'agents')
      }
    } catch (agentsError) {
      console.warn('Failed to load AI agents from table 194865:', agentsError)
      // Continue without agents data
    }

  } catch (error) {
    console.error('❌ Failed to load from my database:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: 'Не удалось загрузить данные из базы данных',
      life: 5000
    })
  }
}

// Daily charts renderer (usage and cost)
const renderDailyCharts = () => {
  // Usage by day (bar)
  if (usageByDayChart.value) {
    if (usageByDayChartInstance) usageByDayChartInstance.destroy()
    const ctx1 = usageByDayChart.value.getContext('2d')
    usageByDayChartInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: usageByDay.value.labels,
        datasets: [{
          label: 'Токены',
          data: usageByDay.value.values,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: '#3B82F6',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Токены: ${formatTokens(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatTokens(v) } }
        }
      }
    })
  }

  // Cost by day (line)
  if (costByDayChart.value) {
    if (costByDayChartInstance) costByDayChartInstance.destroy()
    const ctx2 = costByDayChart.value.getContext('2d')
    costByDayChartInstance = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: costByDay.value.labels,
        datasets: [{
          label: 'Стоимость, ₽',
          data: costByDay.value.values,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `Стоимость: ${formatCurrencyRUB(ctx.parsed.y)}` } }
        },
        scales: { y: { beginAtZero: true } }
      }
    })
  }
}

// Load token balance from Integram report "balance"
// Issue #5133: Report automatically filters by current authenticated user
const loadTokenBalance = async () => {
  loadingBalance.value = true
  try {
    console.log('Loading balance from Integram report "balance"')

    // Execute Integram report "balance" by name
    // Report URL: https://dronedoc.ru/my/report/balance
    // The report automatically filters by current authenticated user
    const reportResult = await integramService.executeReport('balance')

    console.log('Balance report result:', reportResult)

    // Parse report data structure
    // Two possible formats:
    // 1. Object with data field: { obj: {...}, columns: [...], data: [[value1, value2, ...]], reqs: {...} }
    // 2. Direct array: [{"Вычисляемое":"1998.57"}]
    const data = Array.isArray(reportResult) ? reportResult : (reportResult.data || [])

    console.log(`Balance report returned ${data.length} rows`)

    if (data.length > 0) {
      // Get first row (report returns only current user's balance)
      const firstRow = data[0]

      // Extract balance value
      // Format: {"balance":"1998.57"} or {"Вычисляемое":"1998.57"} (legacy) or [value1, value2, ...]
      let balanceValue = 0
      if (typeof firstRow === 'object' && !Array.isArray(firstRow)) {
        // Object format: {"balance":"1998.57"} - prioritize 'balance' field
        balanceValue = firstRow['balance'] || firstRow['Balance'] || firstRow['Вычисляемое'] || 0
      } else if (Array.isArray(firstRow)) {
        // Array format: [value1, value2, ...]
        balanceValue = firstRow[0] || 0
      }

      // Parse balance value (remove spaces, convert to number)
      // Report returns balance in rubles
      const cleanBalance = String(balanceValue).replace(/\s/g, '').replace(',', '.')
      tokenBalance.value = Math.max(0, parseFloat(cleanBalance) || 0)

      console.log('✅ Loaded balance from report:', tokenBalance.value, 'RUB')

      // Save to localStorage for offline access
      localStorage.setItem('tokenBalance', tokenBalance.value.toString())
    } else {
      console.warn('Balance report returned no data')

      // Fallback to localStorage
      const savedBalance = localStorage.getItem('tokenBalance')
      tokenBalance.value = savedBalance ? parseInt(savedBalance, 10) : 0
    }
  } catch (error) {
    console.error('❌ Error loading balance from report:', error)

    // Fallback to localStorage
    const savedBalance = localStorage.getItem('tokenBalance')
    tokenBalance.value = savedBalance ? parseInt(savedBalance, 10) : 0
  } finally {
    loadingBalance.value = false
  }
}

// Load token usage statistics from Integram report
const loadTokenUsage = async () => {
  loadingUsage.value = true
  try {
    console.log('Loading usage data from Integram report 206055')

    // Execute Integram report "потребление_токенов"
    const reportResult = await integramService.executeReport(206055)

    console.log('Report result:', reportResult)

    // Parse report data - executeReport returns array of objects directly
    const rows = Array.isArray(reportResult) ? reportResult : (reportResult.rows || [])

    console.log(`Report returned ${rows.length} rows`)

    if (rows.length > 0) {
      const history = []

      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      let dailyTotal = 0
      let monthlyTotal = 0

      // Process each row from the report
      rows.forEach((row, idx) => {
        // Report columns: Транзакция, Модель, Входящих токенов, Исходящих токенов, Стоимость токенов
        const dateStr = row['Транзакция']
        const model = row['Модель'] || 'AI Model'
        const inputTokens = parseFloat(row['Входящих токенов']) || 0
        const outputTokens = parseFloat(row['Исходящих токенов']) || 0
        const cost = parseFloat(row['Стоимость токенов']) || 0

        // Total tokens = input + output
        const totalTokens = inputTokens + outputTokens

        // Parse date from format "DD.MM.YYYY HH:mm:ss"
        let txDate = null
        if (typeof dateStr === 'string' && dateStr.match(/^\d{2}\.\d{2}\.\d{4}/)) {
          const datePart = dateStr.split(' ')[0]
          const timePart = dateStr.split(' ')[1] || '00:00:00'
          const [day, month, year] = datePart.split('.').map(Number)
          const [hours, minutes, seconds] = timePart.split(':').map(Number)
          txDate = new Date(year, month - 1, day, hours, minutes, seconds)
        }

        // If no valid date, skip this row
        if (!txDate || isNaN(txDate.getTime())) {
          console.warn(`Skipping row ${idx} - invalid date:`, dateStr)
          return
        }

        // Add to history (for charts)
        if (totalTokens > 0) {
          history.push({
            id: `tx-${idx}`,
            timestamp: txDate.toISOString(),
            tokens: totalTokens,
            total_tokens: totalTokens,
            model: model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost: cost
          })
        }

        // Add to totals based on date
        if (txDate >= oneDayAgo) {
          dailyTotal += totalTokens
        }
        if (txDate >= thirtyDaysAgo) {
          monthlyTotal += totalTokens
        }
      })

      // Sort by date (newest first)
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      consumptionHistory.value = history
      dailyUsage.value = dailyTotal
      monthlyUsage.value = monthlyTotal

      console.log('Usage stats from report - Daily:', dailyTotal, 'Monthly:', monthlyTotal, 'History:', history.length, 'records')

      // Save to localStorage
      localStorage.setItem('consumptionHistory', JSON.stringify(history.slice(0, 100)))
      localStorage.setItem('tokenUsage', JSON.stringify({
        daily: dailyUsage.value,
        monthly: monthlyUsage.value,
        updatedAt: new Date().toISOString()
      }))
    } else {
      console.warn('Report returned no data')
      consumptionHistory.value = []
      dailyUsage.value = 0
      monthlyUsage.value = 0
    }
  } catch (error) {
    console.error('Error loading usage from report:', error)
    // Fall back to localStorage
    const savedHistory = localStorage.getItem('consumptionHistory')
    const savedUsage = localStorage.getItem('tokenUsage')
    if (savedHistory) {
      consumptionHistory.value = JSON.parse(savedHistory)
    }
    if (savedUsage) {
      const usage = JSON.parse(savedUsage)
      dailyUsage.value = usage.daily || 0
      monthlyUsage.value = usage.monthly || 0
    } else {
      dailyUsage.value = 0
      monthlyUsage.value = 0
    }
  } finally {
    loadingUsage.value = false
    // Обновляем диаграммы после загрузки данных
    nextTick(() => renderDailyCharts())
  }
}

// Load saved limits from API or localStorage (Mock Data - Backend disabled)
const loadLimits = async () => {
  try {
    // Mock data - no API calls, use default limits
    limits.value = { daily: 100000, monthly: 1000000 }
    editLimits.value = { ...limits.value }

    // Save to localStorage
    localStorage.setItem('tokenLimits', JSON.stringify(limits.value))
  } catch (error) {
    console.error('Error loading limits:', error)
    const savedLimits = localStorage.getItem('tokenLimits')
    if (savedLimits) {
      limits.value = JSON.parse(savedLimits)
      editLimits.value = { ...limits.value }
    } else {
      // Default limits
      limits.value = { daily: 100000, monthly: 1000000 }
      editLimits.value = { ...limits.value }
    }
  }
}

// Fallback data function
const useFallbackData = () => {
  console.warn('Using fallback data for demonstration')
  
  // Fallback AI Models
  allAiModels.value = [
    {
      id: 1,
      display_name: 'GPT-4',
      model_id: 'gpt-4',
      provider_name: 'OpenAI',
      provider_display_name: 'OpenAI',
      description: 'Самая продвинутая модель для сложных задач',
      context_window: 8192,
      cost_per_1k_input: 0.03,
      cost_per_1k_output: 0.06,
      capabilities: JSON.stringify(['text-generation', 'reasoning', 'coding'])
    },
    {
      id: 2,
      display_name: 'GPT-3.5 Turbo',
      model_id: 'gpt-3.5-turbo',
      provider_name: 'OpenAI',
      provider_display_name: 'OpenAI',
      description: 'Быстрая модель для повседневных задач',
      context_window: 4096,
      cost_per_1k_input: 0.002,
      cost_per_1k_output: 0.006,
      capabilities: JSON.stringify(['text-generation', 'chat'])
    },
    {
      id: 3,
      display_name: 'Claude 3',
      model_id: 'claude-3',
      provider_name: 'Anthropic',
      provider_display_name: 'Anthropic',
      description: 'Мощная модель с длинным контекстом',
      context_window: 200000,
      cost_per_1k_input: 0.015,
      cost_per_1k_output: 0.075,
      capabilities: JSON.stringify(['text-generation', 'analysis', 'reasoning'])
    }
  ]

  // Update aiModels for wizard preview
  aiModels.value = allAiModels.value.map(model => ({
    id: model.model_id,
    name: model.display_name,
    provider: model.provider_display_name,
    description: model.description || 'AI модель',
    costPer1k: Math.round((model.cost_per_1k_input || 0) * 100) / 100,
    usage: Math.floor(Math.random() * 50000),
    enabled: true
  }))
}

// Lifecycle
onMounted(async () => {
  nextTick(() => {
    renderDailyCharts()
  })

  // Load token data from Integram database
  await loadTokenData()

  // Load referral code from Integram database (table 18, column 209325)
  const userId = await getCurrentUserId()
  if (userId) {
    try {
      const userObjectId = await getUserObjectId(userId)
      const objectId = userObjectId || userId

      // Get user data from Integram
      const userData = await integramService.getObjectEditData(objectId)

      if (userData && userData.reqs && userData.reqs['209325']) {
        const refCodeData = userData.reqs['209325']

        // Extract referral code from Integram requisite object
        // The object may be a string OR an object with {value, type, base, order} structure
        if (typeof refCodeData === 'string' && refCodeData.trim()) {
          // Direct string value
          referralCode.value = refCodeData.trim()
        } else if (typeof refCodeData === 'object' && refCodeData.value && typeof refCodeData.value === 'string' && refCodeData.value.trim()) {
          // Object with non-empty value property
          referralCode.value = refCodeData.value.trim()
        } else {
          // Empty or invalid - code not generated yet
          referralCode.value = null
          console.log('⚠️ Referral code not generated yet')
        }

        console.log('✅ Loaded referral code from Integram:', referralCode.value)

        // Load referral statistics only if code exists
        if (referralCode.value) {
          await loadReferralStats()
        }
      }
    } catch (error) {
      console.warn('Failed to load referral code from Integram:', error)
    }
  }
})

onUnmounted(() => {
  if (usageByDayChartInstance) usageByDayChartInstance.destroy()
  if (costByDayChartInstance) costByDayChartInstance.destroy()
})

// Re-render daily charts when history changes
watch(filteredHistory, () => {
  nextTick(() => renderDailyCharts())
})

// Re-render daily charts when period changes
watch(periodDays, () => {
  nextTick(() => renderDailyCharts())
})
</script>

<style scoped>
.tokens-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 2rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
}

.header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
}

.subtitle {
  margin: 0;
  color: var(--text-color-secondary);
}

.header-actions {
  display: flex;
  gap: 1rem;
  flex-shrink: 0;
  align-items: center;
}

/* Period Selector Header */
.period-selector-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--surface-100);
  border-radius: 8px;
  border: 1px solid var(--surface-200);
}

.dark .period-selector-header {
  background: var(--surface-700);
  border-color: var(--surface-600);
}

.period-selector-header .period-label {
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.period-selector-header .period-buttons {
  display: flex;
  gap: 0.5rem;
}

.period-selector-header :deep(.p-button) {
  min-width: 70px;
}

.tokens-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* KPI and charts */
.kpi-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.kpi-card .p-card-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kpi-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.kpi-title i { color: var(--primary-color); }
.kpi-value { font-size: 1.75rem; font-weight: 700; color: var(--text-color); }
.kpi-sub { color: var(--text-color-secondary); font-size: 0.9rem; }

.period-summary-card .period-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.period-item { padding: 0.25rem 0; }
.period-label { color: var(--text-color-secondary); font-size: 0.9rem; }
.period-value { font-weight: 700; font-size: 1.25rem; }
.period-sub { color: var(--text-color-secondary); font-weight: 400; font-size: 0.95rem; margin-left: 0.25rem; }
.period-badge { color: var(--text-color-secondary); font-size: 0.9rem; }

.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}
.chart-card .chart-container { height: 280px; }

.overview-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
}

.card-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 1.1rem;
  width: 100%;
}

.card-title-wrapper .title-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.card-title-wrapper i {
  color: var(--primary-color);
}

/* Balance Card */
.balance-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.balance-card :deep(.p-card-title),
.balance-card :deep(.p-card-content) {
  color: white;
}

.balance-card .card-title-wrapper i {
  color: white;
}

.balance-display {
  text-align: center;
  margin: 1rem 0 1.5rem 0;
}

.token-count {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  color: var(--primary-color);
}

.token-label {
  font-size: 1rem;
  opacity: 0.9;
  margin-top: 0.5rem;
}

.topup-button {
  width: 100%;
  background: white;
  color: var(--primary-color);
  border-color: white;
}

.topup-button:hover {
  background: rgba(255, 255, 255, 0.9);
}

/* Limit Card */
.limit-info {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.limit-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.limit-label {
  font-weight: 600;
  color: var(--text-color);
}

.limit-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
}

.limit-progress {
  margin: 0.25rem 0;
}

.limit-usage {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.limits-button {
  width: 100%;
}

/* Models Card */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.model-item {
  padding: 1.25rem;
  border: 2px solid var(--surface-border);
  border-radius: 12px;
  background: var(--surface-card);
  transition: all 0.3s;
}

.model-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.model-item.model-active {
  border-color: var(--primary-color);
  background: var(--primary-50);
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.model-name {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-color);
}

.model-description {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.75rem;
  line-height: 1.4;
}

.model-cost {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.model-usage {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

/* Chart */
.chart-container {
  padding: 1rem;
  min-height: 300px;
}

/* Usage Table */
.token-amount {
  font-weight: 600;
  color: var(--primary-color);
}

/* Integration Guide */
.integration-card {
  margin-top: 1.5rem;
}

.integration-intro {
  font-size: 1rem;
  color: var(--text-color-secondary);
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.code-block {
  position: relative;
  background: var(--surface-900);
  color: var(--surface-50);
  padding: 1.5rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1rem 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.code-block pre {
  margin: 0;
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
}

.code-block code {
  color: var(--surface-50);
}

.code-block button {
  flex-shrink: 0;
  margin-left: 1rem;
}

.integration-links {
  margin-top: 1.5rem;
}

.integration-links h4 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.resource-buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Dialogs */
.topup-dialog-content,
.limits-dialog-content,
.create-token-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.topup-description,
.limits-description {
  color: var(--text-color-secondary);
  margin: 0;
}

.token-packages {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.token-package {
  padding: 1.5rem;
  border: 2px solid var(--surface-border);
  border-radius: 12px;
  cursor: pointer;
  text-align: center;
  transition: all 0.3s;
  background: var(--surface-card);
}

.token-package:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.token-package.selected {
  border-color: var(--primary-color);
  background: var(--primary-50);
}

.package-tokens,
.package-tokens-display {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.package-price,
.package-price-display {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-color);
}

.package-bonus {
  margin-top: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: var(--green-500);
  color: white;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  display: inline-block;
}

.selected-package-info {
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.info-row .value {
  font-weight: 700;
  color: var(--primary-color);
}

.payment-button {
  width: 100%;
}

.limit-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.limit-input-group label {
  font-weight: 600;
  color: var(--text-color);
}

.limit-actions {
  display: flex;
  gap: 1rem;
}

.limit-actions button {
  flex: 1;
}

/* Token Generation Dialog */
.token-generation-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-msg {
  margin-bottom: 0.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 600;
  color: var(--text-color);
}

.field small {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.limits-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.limit-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.generated-token-display {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

.token-value-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--surface-card);
  border: 2px solid var(--primary-color);
  border-radius: 8px;
  margin-top: 1rem;
}

.token-value-box code {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: var(--primary-color);
}

/* Token Preview Styles */
.token-preview {
  background: var(--surface-50);
  border: 1px solid var(--surface-200);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 0.5rem;
}

.token-preview h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: var(--text-color);
  font-weight: 600;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--surface-100);
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-label {
  font-weight: 600;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.preview-value {
  font-weight: 500;
  color: var(--text-color);
  font-size: 0.875rem;
  text-align: right;
}

/* Loading status */
.loading-status {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.loading-status i {
  color: var(--primary-color);
}

/* Report section styles */
.report-section {
  margin: 2rem 0;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.report-section h3 {
  margin: 0 0 1.5rem 0;
  color: var(--text-color);
  font-size: 1.25rem;
  font-weight: 600;
}

.report-section h3 i {
  color: var(--primary-color);
}

/* Quick Start Wizard */
.wizard-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 1rem 0;
}

.wizard-step-content {
  min-height: 300px;
  padding: 1rem;
}

.step-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;
}

.step-icon {
  font-size: 4rem;
  margin-bottom: 0.5rem;
}

.step-panel h3 {
  margin: 0;
  font-size: 1.75rem;
  color: var(--text-color);
}

.step-panel p {
  max-width: 600px;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

.wizard-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: left;
  width: 100%;
  max-width: 500px;
}

.wizard-list li {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface-50);
  border-radius: 8px;
}

.wizard-list i {
  color: var(--green-500);
  font-size: 1.25rem;
}

.wizard-action {
  margin: 1.5rem 0;
}

.wizard-tip {
  max-width: 500px;
}

.models-preview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  width: 100%;
  max-width: 600px;
  margin: 1.5rem 0;
}

.model-preview-card {
  padding: 1rem;
  background: var(--surface-50);
  border: 2px solid var(--surface-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all 0.3s;
}

.model-preview-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.model-preview-card strong {
  color: var(--text-color);
  font-size: 0.95rem;
}

.model-cost {
  font-size: 0.85rem;
  color: var(--primary-color);
  font-weight: 600;
}

.code-example {
  width: 100%;
  max-width: 600px;
  margin: 1.5rem 0;
}

.code-example pre {
  background: var(--surface-900);
  color: var(--surface-50);
  padding: 1.5rem;
  border-radius: 8px;
  overflow-x: auto;
  text-align: left;
}

.code-example code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  width: 100%;
  max-width: 600px;
  margin: 1.5rem 0;
}

.quick-link-card {
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.quick-link-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.quick-link-card :deep(.p-card-content) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
}

.quick-link-card i {
  font-size: 2rem;
  color: var(--primary-color);
}

.quick-link-card span {
  font-weight: 600;
  color: var(--text-color);
}

.wizard-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border);
}

.wizard-navigation .spacer {
  flex: 1;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .tokens-content {
    padding: 1rem;
  }

  .overview-section {
    grid-template-columns: 1fr;
  }

  .models-grid {
    grid-template-columns: 1fr;
  }

  .token-packages {
    grid-template-columns: 1fr;
  }

  .limits-grid {
    grid-template-columns: 1fr;
  }

  .models-preview {
    grid-template-columns: 1fr;
  }

  .quick-links {
    grid-template-columns: 1fr;
  }

  .wizard-step-content {
    min-height: 250px;
  }
}

.token-actions {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

/* Token Details Dialog */
.token-details-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  gap: 1rem;
}

.detail-label {
  font-weight: 500;
  color: var(--text-color-secondary);
  min-width: 180px;
}

.detail-value {
  font-weight: 600;
  color: var(--text-color);
  text-align: right;
  flex: 1;
}

.scopes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  flex: 1;
}

/* Delete Token Dialog */
.delete-token-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.delete-token-content p {
  margin: 0;
  color: var(--text-color);
  line-height: 1.6;
}

/* Documentation Link Section */
.documentation-link-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
  text-align: center;
}

.doc-icon {
  margin-bottom: 1rem;
}

.documentation-link-content h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.doc-description {
  max-width: 600px;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin: 0;
}

/* AI Models Table Cells */
.model-name-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.model-id {
  font-size: 0.875rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  opacity: 0.7;
}

.model-description-cell {
  max-width: 300px;
  line-height: 1.4;
}

.cost-value {
  font-weight: 600;
  font-family: monospace;
}

.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* DataTable styling - respects theme colors */
:deep(.p-datatable-tbody) td {
  color: var(--text-color);
}

:deep(.p-paginator) {
  color: var(--text-color);
}

/* Welcome Bonus Banner */
.welcome-banner {
  margin-bottom: 1.5rem;
  width: 100%;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
  border: 3px solid #FF6B00;
  box-shadow: 0 8px 24px rgba(255, 107, 0, 0.3);
}

.welcome-banner :deep(.p-card-content) {
  padding: 1rem;
}

.banner-content {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0;
}

.banner-icon {
  flex-shrink: 0;
  font-size: 2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.banner-text-wrapper {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
}

.banner-text-left {
  flex: 1;
}

.banner-text-left h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #333;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
}

.banner-text-left p {
  margin: 0;
  font-size: 0.9rem;
  color: #444;
  line-height: 1.4;
  font-weight: 500;
}

.banner-button-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.token-info-text {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
}

/* Referral Code Display */
.referral-code-display {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.referral-code-box,
.referral-link-box {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.referral-code-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 0.25rem;
}

.referral-code-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.referral-code-value code {
  flex: 1;
  background: rgba(0, 0, 0, 0.1);
  padding: 0.4rem 0.6rem;
  border-radius: 0.375rem;
  font-family: 'Courier New', monospace;
  font-size: 0.95rem;
  font-weight: 600;
  color: #222;
  letter-spacing: 0.5px;
}

.referral-link {
  font-size: 0.85rem !important;
  word-break: break-all;
}

.referral-stats {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
  display: flex;
  align-items: center;
}

.referral-stats strong {
  color: #FF6B00;
  font-size: 1.1rem;
}

/* Unified Balance Card */
.unified-balance-card {
  width: 100%;
}

.unified-balance-layout {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  align-items: start;
}

.balance-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: linear-gradient(135deg, var(--primary-500) 0%, var(--purple-600) 100%);
  border-radius: 12px;
  color: white;
  min-height: 250px;
}

.balance-section .balance-display {
  text-align: center;
  margin-bottom: 1.5rem;
}

.balance-section .token-count {
  color: white;
  font-size: 3.5rem;
  margin-bottom: 0.5rem;
}

.balance-section .token-label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.1rem;
}

.balance-section .topup-button {
  width: 100%;
  background: white;
  color: var(--primary-color);
  border-color: white;
  font-weight: 600;
}

.balance-section .topup-button:hover {
  background: rgba(255, 255, 255, 0.9);
}

.limits-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.limit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

/* Benefits Section */
.benefits-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.benefit-card {
  transition: transform 0.3s, box-shadow 0.3s;
}

.benefit-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.benefit-content {
  text-align: center;
  padding: 1rem;
}

.benefit-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.benefit-content h3 {
  margin: 0 0 0.75rem 0;
  color: var(--text-color);
  font-size: 1.25rem;
}

.benefit-content p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 0.95rem;
  line-height: 1.5;
}

/* Chat Invitation Card */
.chat-invitation-card {
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, var(--blue-50) 0%, var(--purple-50) 100%);
  border: 2px solid var(--primary-color);
}

.chat-invitation-content {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2rem;
  align-items: center;
  padding: 1.5rem;
}

.chat-icon-section {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.chat-text-section h2 {
  margin: 0 0 1rem 0;
  color: var(--text-color);
  font-size: 1.75rem;
}

.chat-description {
  margin: 0 0 1.5rem 0;
  color: var(--text-color-secondary);
  font-size: 1rem;
  line-height: 1.6;
}

.chat-features {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.chat-feature {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-color);
  font-size: 0.95rem;
}

.chat-button {
  align-self: flex-start;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .unified-balance-layout {
    grid-template-columns: 1fr;
  }

  .banner-content {
    flex-direction: column;
    text-align: center;
  }

  .chat-invitation-content {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .chat-features {
    align-items: center;
  }

  .benefits-section {
    grid-template-columns: 1fr;
  }
}

/* Token Cards Grid - New Component Styles */
.tokens-grid h3 {
  color: var(--text-color);
  margin: 0 0 1rem 0;
}

.token-cards-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .token-cards-container {
    grid-template-columns: 1fr;
  }
}

/* User Tokens Report Card */
.user-tokens-report-card {
  margin-top: 1.5rem;
}

/* User Tokens List Card */
.user-tokens-list-card {
  margin-top: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.create-token-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.create-token-content .field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.create-token-content label {
  font-weight: 600;
  color: var(--text-color);
}

.create-token-content small {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.info-msg {
  margin-top: 1rem;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--text-color-secondary);
}

.loading-container i {
  margin-bottom: 1rem;
}

.error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  text-align: center;
}

.error-state i, .empty-state i {
  margin-bottom: 1rem;
  opacity: 0.5;
}

.error-message {
  color: var(--red-500);
  font-size: 0.9rem;
  margin: 1rem 0;
  font-style: italic;
}

.report-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.report-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-0);
  border: 1px solid var(--surface-200);
  border-radius: var(--border-radius);
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0.5rem;
}

.summary-label {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.25rem;
}

.summary-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--primary-color);
}

.report-table {
  margin-top: 1rem;
}

.mcp-info {
  margin-top: 1rem;
}

.mcp-info p {
  margin: 0.25rem 0;
}

.mcp-info a {
  color: var(--primary-color);
  text-decoration: underline;
}

@media (max-width: 768px) {
  .report-summary {
    grid-template-columns: 1fr;
  }

  .summary-item {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
  }
}

/* Generated Token Dialog Styles */
.generated-token-dialog {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.token-display-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.token-display-box label {
  font-weight: 600;
  color: var(--text-color);
}

.token-value-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--surface-900);
  border-radius: 8px;
  border: 2px solid var(--green-500);
}

.token-value {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  color: var(--green-400);
  word-break: break-all;
}

.token-usage-info {
  padding: 1rem;
  background: var(--surface-50);
  border-radius: 8px;
  border: 1px solid var(--surface-200);
}

.token-usage-info h4 {
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color);
}

.token-usage-info pre {
  background: var(--surface-900);
  color: var(--surface-50);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.8rem;
  margin: 0;
}

.token-usage-info code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

/* Report Card Styling (Issue #4934) */
.report-card {
  margin-bottom: 2rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.report-card .card-title-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.report-card .card-title-wrapper i {
  font-size: 1.5rem;
  color: var(--primary-color);
}

.report-card :deep(.p-card-content) {
  padding: 0;
}

/* Collapsible card styles */
.collapsible-card :deep(.p-card-title) {
  cursor: pointer;
  user-select: none;
}

.collapsible-card .cursor-pointer {
  transition: background-color 0.2s;
  padding: 0.25rem;
  border-radius: 4px;
}

.collapsible-card .cursor-pointer:hover {
  background-color: var(--surface-hover);
}

.collapsible-card .pi-chevron-right,
.collapsible-card .pi-chevron-down {
  transition: transform 0.2s;
  font-size: 1rem;
}
</style>
