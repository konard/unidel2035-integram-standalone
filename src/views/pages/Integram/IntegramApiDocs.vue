<template>
  <div class="integram-api-docs">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <!-- Main Card -->
    <Card class="api-docs-card">
      <template #title>
        <div class="flex align-items-center justify-content-between flex-wrap gap-3">
          <div class="flex align-items-center gap-2">
            <span>API Документация</span>
            <Badge :value="allCommands.length" v-tooltip.top="'Всего команд'" />
          </div>
          <div class="flex align-items-center gap-2 ml-auto">
            <Tag :value="isAuthenticated ? '● Подключено' : '○ Офлайн'"
                 :severity="isAuthenticated ? 'success' : 'warn'" />
            <Tag v-if="database" :value="database" severity="info" />
          </div>
        </div>
      </template>

      <template #content>
        <!-- Category Navigation -->
        <div class="category-nav flex flex-wrap gap-2 mb-3">
          <Button
            v-for="cat in categories"
            :key="cat.value"
            :label="cat.name"
            :outlined="selectedCategory !== cat.value"
            :severity="selectedCategory === cat.value ? 'primary' : 'secondary'"
            size="small"
            @click="selectedCategory = cat.value; selectedSubcategory = 'all'"
          />
        </div>

        <!-- Subcategory Navigation -->
        <div v-if="availableSubcategories.length > 0" class="subcategory-nav flex flex-wrap gap-2 mb-4">
          <Button
            label="Все"
            :outlined="selectedSubcategory !== 'all'"
            :severity="selectedSubcategory === 'all' ? 'info' : 'secondary'"
            size="small"
            @click="selectedSubcategory = 'all'"
          />
          <Button
            v-for="subcat in availableSubcategories"
            :key="subcat"
            :label="subcat"
            :outlined="selectedSubcategory !== subcat"
            :severity="selectedSubcategory === subcat ? 'info' : 'secondary'"
            size="small"
            @click="selectedSubcategory = subcat"
          />
        </div>

        <!-- Search -->
        <div class="mb-4">
          <IconField iconPosition="left">
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="searchQuery"
              placeholder="Поиск команды..."
              class="w-full"
            />
          </IconField>
        </div>

        <!-- Overview Section -->
        <div v-show="selectedCategory === 'all' && !searchQuery" class="mb-4">
          <div class="section-header" @click="sections.overview = !sections.overview">
            <h3 class="section-title">Обзор</h3>
            <i :class="sections.overview ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.overview" class="section-content">
            <div class="grid">
              <div class="col-12 md:col-6 lg:col-3">
                <div class="stat-card">
                  <div class="stat-value">{{ mcpTools.length }}</div>
                  <div class="stat-label">MCP инструментов</div>
                </div>
              </div>
              <div class="col-12 md:col-6 lg:col-3">
                <div class="stat-card">
                  <div class="stat-value">{{ dataTypes.length }}</div>
                  <div class="stat-label">Типов данных</div>
                </div>
              </div>
              <div class="col-12 md:col-6 lg:col-3">
                <div class="stat-card">
                  <div class="stat-value">{{ allCommands.length }}</div>
                  <div class="stat-label">REST команд</div>
                </div>
              </div>
              <div class="col-12 md:col-6 lg:col-3">
                <div class="stat-card">
                  <div class="stat-value">{{ macros.length }}</div>
                  <div class="stat-label">Макросов</div>
                </div>
              </div>
            </div>

            <div class="info-block mt-4">
              <h4>Формат URL</h4>
              <code class="code-inline">/api/{database}/[{cmd}/{id}][?{params}]</code>
              <div class="mt-3">
                <p class="text-color-secondary mb-2"><strong>Категории команд:</strong></p>
                <ul class="text-color-secondary text-sm m-0 pl-4">
                  <li><code>_d_*</code> — DDL (изменение структуры: типы, реквизиты)</li>
                  <li><code>_m_*</code> — DML (изменение данных: объекты, значения)</li>
                  <li>Остальные — Query (получение данных для построения форм)</li>
                </ul>
              </div>
            </div>

            <div class="info-block mt-3">
              <h4>Авторизация и безопасность</h4>
              <ul class="text-color-secondary text-sm m-0 pl-4">
                <li>POST-запросы требуют <code>_xsrf</code> токен в параметрах</li>
                <li>После <code>auth</code> клиент получает токен для заголовка <code>X-Authorization</code></li>
                <li>Все изменяющие операции (_d_*, _m_*) — только POST</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Commands Table -->
        <div class="mb-4">
          <div class="section-header" @click="sections.commands = !sections.commands">
            <h3 class="section-title">
              Команды
              <Badge :value="filteredCommands.length" class="ml-2" />
            </h3>
            <i :class="sections.commands ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.commands" class="section-content">
            <DataTable
              :value="filteredCommands"
              v-model:expandedRows="expandedRows"
              :paginator="true"
              :rows="15"
              stripedRows
              class="commands-table"
              dataKey="cmd"
              @row-click="toggleRowExpansion"
            >
              <Column :expander="true" style="width: 50px" />
              <Column field="cmd" header="Команда" sortable style="width: 180px">
                <template #body="{ data }">
                  <code class="cmd-code">{{ data.cmd }}</code>
                </template>
              </Column>
              <Column field="method" header="Метод" sortable style="width: 80px">
                <template #body="{ data }">
                  <Tag v-if="data.method" :value="data.method.toUpperCase()" :severity="data.method === 'post' ? 'info' : 'success'" />
                  <Tag v-else value="MCP" severity="secondary" />
                </template>
              </Column>
              <Column field="subcategory" header="Раздел" sortable style="width: 130px">
                <template #body="{ data }">
                  <span class="text-sm text-color-secondary">{{ data.subcategory }}</span>
                </template>
              </Column>
              <Column field="description" header="Описание"></Column>
              <Column header="" style="width: 50px">
                <template #body="{ data }">
                  <Button
                    icon="pi pi-play"
                    size="small"
                    text
                    rounded
                    @click="openPlayground(data)"
                    v-tooltip.left="'Тестировать'"
                  />
                </template>
              </Column>

              <!-- Expanded Row Template -->
              <template #expansion="{ data }">
                <div class="expansion-content">
                  <div class="grid">
                    <!-- Left: Description and Parameters -->
                    <div class="col-12 lg:col-6">
                      <h4 class="mt-0 mb-3">Описание</h4>
                      <p class="text-color-secondary">{{ data.detailedDescription || data.description }}</p>

                      <h4 class="mt-4 mb-3">Параметры</h4>
                      <div class="params-block" v-html="formatParams(data.params || 'Нет параметров')"></div>
                    </div>

                    <!-- Right: Examples -->
                    <div class="col-12 lg:col-6">
                      <h4 class="mt-0 mb-3">Примеры</h4>

                      <!-- REST API Examples -->
                      <div v-if="data.method">
                        <!-- URL Example -->
                        <div class="example-block mb-3">
                          <div class="example-label">URL:</div>
                          <div class="code-block">
                            <pre>{{ data.method.toUpperCase() }} /{{ database || 'db' }}/{{ data.exampleUrl || data.cmd }}</pre>
                          </div>
                        </div>

                        <!-- POST Body Example -->
                        <div v-if="data.method === 'post' && data.exampleBody" class="example-block mb-3">
                          <div class="example-label">POST Body (application/x-www-form-urlencoded):</div>
                          <div class="code-block">
                            <pre>{{ formatExampleBody(data.exampleBody) }}</pre>
                          </div>
                          <div class="text-xs mt-2 text-color-secondary">
                            <strong>Примечание:</strong> Данные отправляются в формате application/x-www-form-urlencoded.
                            Параметр <code>?JSON_KV</code> влияет на формат <em>ответа</em>, а не запроса.
                          </div>
                        </div>
                      </div>

                      <!-- MCP Tool Info -->
                      <div v-else class="text-color-secondary">
                        <p>Инструмент MCP (Model Context Protocol) для AI-ассистентов.</p>
                        <p class="text-sm">Используется через Claude Code или другие MCP-клиенты.</p>
                      </div>

                      <!-- Response Example -->
                      <div v-if="data.exampleResponse" class="example-block">
                        <div class="example-label">Ответ:</div>
                        <div class="code-block">
                          <pre>{{ formatJSON(data.exampleResponse) }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </DataTable>
          </div>
        </div>

        <!-- MCP Tools Section -->
        <div class="mb-4">
          <div class="section-header" @click="sections.mcp = !sections.mcp">
            <h3 class="section-title">
              MCP Tools
              <Badge :value="mcpTools.length" class="ml-2" />
            </h3>
            <i :class="sections.mcp ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.mcp" class="section-content">
            <div class="info-block mb-3">
              <code class="code-inline">https://dev.drondoc.ru/api/mcp/integram</code>
            </div>
            <DataTable
              :value="filteredMcpTools"
              :paginator="true"
              :rows="10"
              stripedRows
              size="small"
            >
              <Column field="name" header="Инструмент" sortable style="width: 280px">
                <template #body="{ data }">
                  <code class="cmd-code">{{ data.name }}</code>
                </template>
              </Column>
              <Column field="category" header="Категория" sortable style="width: 100px">
                <template #body="{ data }">
                  <Tag :value="data.category" size="small" />
                </template>
              </Column>
              <Column field="description" header="Описание"></Column>
              <Column field="params" header="Параметры" style="width: 180px">
                <template #body="{ data }">
                  <span class="text-color-secondary text-sm">{{ data.params }}</span>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>

        <!-- Data Model Section (Quintet) -->
        <div class="mb-4">
          <div class="section-header" @click="sections.dataModel = !sections.dataModel">
            <h3 class="section-title">Модель данных (Квинтет)</h3>
            <i :class="sections.dataModel ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.dataModel" class="section-content">
            <div class="info-block mb-3">
              <h4>Структура квинтета</h4>
              <p class="text-color-secondary mb-2">Все данные в Integram хранятся в виде 5-элементных кортежей (квинтетов):</p>
              <code class="code-inline">(id, type, up, ord, value)</code>
            </div>

            <DataTable :value="quintetFields" size="small" stripedRows class="mb-4">
              <Column field="field" header="Поле" style="width: 80px">
                <template #body="{ data }">
                  <code class="text-primary font-bold">{{ data.field }}</code>
                </template>
              </Column>
              <Column field="synonyms" header="Синонимы" style="width: 200px">
                <template #body="{ data }">
                  <span class="text-color-secondary text-sm">{{ data.synonyms }}</span>
                </template>
              </Column>
              <Column field="description" header="Описание"></Column>
            </DataTable>

            <h4 class="mt-4 mb-3">Типы объектов</h4>
            <DataTable :value="objectTypes" size="small" stripedRows>
              <Column field="name" header="Тип объекта" style="width: 180px">
                <template #body="{ data }">
                  <strong>{{ data.name }}</strong>
                </template>
              </Column>
              <Column field="condition" header="Условие" style="width: 200px">
                <template #body="{ data }">
                  <code class="text-sm">{{ data.condition }}</code>
                </template>
              </Column>
              <Column field="description" header="Описание"></Column>
            </DataTable>

            <div class="info-block mt-4">
              <h4>Особый объект ROOT</h4>
              <code class="code-inline">id=1, type=1, up=1, ord=1, value="ROOT"</code>
              <p class="text-color-secondary mt-2 mb-0">Корневой объект — родитель всех независимых строк таблиц (up=1 означает "подчинён ROOT")</p>
            </div>
          </div>
        </div>

        <!-- Data Types Section -->
        <div class="mb-4">
          <div class="section-header" @click="sections.types = !sections.types">
            <h3 class="section-title">
              Типы данных
              <Badge :value="dataTypes.length" class="ml-2" />
            </h3>
            <i :class="sections.types ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.types" class="section-content">
            <div class="grid">
              <div class="col-12 lg:col-6">
                <h4 class="mt-0 mb-3">Базовые типы (Requisite Types)</h4>
                <DataTable :value="dataTypes" size="small" stripedRows>
                  <Column field="id" header="ID" style="width: 50px"></Column>
                  <Column field="name" header="Тип" style="width: 100px">
                    <template #body="{ data }">
                      <code>{{ data.name }}</code>
                    </template>
                  </Column>
                  <Column field="description" header="Описание"></Column>
                  <Column field="example" header="Пример" style="width: 120px">
                    <template #body="{ data }">
                      <code class="text-sm">{{ data.example }}</code>
                    </template>
                  </Column>
                </DataTable>
              </div>
              <div class="col-12 lg:col-6">
                <h4 class="mt-0 mb-3">Макросы значений</h4>
                <DataTable :value="macros" size="small" stripedRows>
                  <Column field="macro" header="Макрос">
                    <template #body="{ data }">
                      <code class="text-primary">{{ data.macro }}</code>
                    </template>
                  </Column>
                  <Column field="description" header="Описание"></Column>
                  <Column field="example" header="Пример">
                    <template #body="{ data }">
                      <code class="text-sm">{{ data.example }}</code>
                    </template>
                  </Column>
                </DataTable>

                <h4 class="mt-4 mb-3">Формат attrs (настройки колонки)</h4>
                <DataTable :value="attrsFormats" size="small" stripedRows>
                  <Column field="syntax" header="Синтаксис" style="width: 150px">
                    <template #body="{ data }">
                      <code class="text-primary">{{ data.syntax }}</code>
                    </template>
                  </Column>
                  <Column field="description" header="Описание"></Column>
                  <Column field="example" header="Пример">
                    <template #body="{ data }">
                      <code class="text-sm">{{ data.example }}</code>
                    </template>
                  </Column>
                </DataTable>
              </div>
            </div>
          </div>
        </div>

        <!-- Examples Section -->
        <div class="mb-4">
          <div class="section-header" @click="sections.examples = !sections.examples">
            <h3 class="section-title">Примеры</h3>
            <i :class="sections.examples ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.examples" class="section-content">
            <Accordion :multiple="true">
              <AccordionTab header="Создание таблицы">
                <div class="example-steps">
                  <!-- Step 1 -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-number">1</span>
                      <span class="step-title">Создаём таблицу</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method">POST</span>
                          <span class="http-path">/A2025/_d_new?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                        <div class="http-body">
                          <div class="body-param">
                            <span class="param-key">val</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">Товары</span>
                          </div>
                          <div class="body-param">
                            <span class="param-key">t</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">3</span>
                          </div>
                          <div class="body-param">
                            <span class="param-key">unique</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">0</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "obj": 12345 }</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Step 2 -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-number">2</span>
                      <span class="step-title">Добавляем колонку "Цена" (NUMBER)</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method">POST</span>
                          <span class="http-path">/A2025/_d_req/12345?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                        <div class="http-body">
                          <div class="body-param">
                            <span class="param-key">t</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">13</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "id": 12346 }</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Step 3 -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-number">3</span>
                      <span class="step-title">Устанавливаем алиас</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method">POST</span>
                          <span class="http-path">/A2025/_d_alias/12346?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                        <div class="http-body">
                          <div class="body-param">
                            <span class="param-key">val</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">Цена</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "ok": true }</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="CRUD операции">
                <div class="example-steps">
                  <!-- Create -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Create — Создание объекта</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method">POST</span>
                          <span class="http-path">/A2025/_m_new/12345?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                        <div class="http-body">
                          <div class="body-param">
                            <span class="param-key">t12345</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">Товар</span>
                          </div>
                          <div class="body-param">
                            <span class="param-key">t12346</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">1500</span>
                          </div>
                          <div class="body-param">
                            <span class="param-key">up</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">1</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "id": 99998 }</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Read -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Read — Чтение объектов</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method get">GET</span>
                          <span class="http-path">/A2025/object/12345?JSON_KV&LIMIT=100&pg=1</span>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "object": [...], "reqs": {...} }</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Update -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Update — Обновление объекта</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method">POST</span>
                          <span class="http-path">/A2025/_m_set/99999?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                        <div class="http-body">
                          <div class="body-param">
                            <span class="param-key">t12346</span>
                            <span class="param-equals">=</span>
                            <span class="param-value">2000</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "ok": true }</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Delete -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">Delete — Удаление объекта</span>
                    </div>
                    <div class="example-request mb-2">
                      <div class="request-label">Запрос:</div>
                      <div class="http-request-block">
                        <div class="http-line">
                          <span class="http-method delete">POST</span>
                          <span class="http-path">/A2025/_m_del/99999?JSON_KV</span>
                        </div>
                        <div class="http-header">
                          <span class="header-name">Content-Type:</span>
                          <span class="header-value">application/x-www-form-urlencoded</span>
                        </div>
                      </div>
                    </div>
                    <div class="example-response">
                      <div class="response-label">Ответ:</div>
                      <div class="code-block response">
                        <pre>{ "ok": true }</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Создание структуры">
                <div class="example-steps">
                  <!-- Step 1 -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-number">1</span>
                      <span class="step-title">Авторизация</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_authenticate</span>({
  <span class="mcp-key">serverURL</span>: <span class="mcp-string">"${import.meta.env.VITE_INTEGRAM_URL}"</span>,
  <span class="mcp-key">database</span>: <span class="mcp-string">"my"</span>,
  <span class="mcp-key">login</span>: <span class="mcp-string">"user"</span>,
  <span class="mcp-key">password</span>: <span class="mcp-string">"pass"</span>
})</pre>
                    </div>
                  </div>

                  <!-- Step 2 -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-number">2</span>
                      <span class="step-title">Создать таблицу с колонками</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_create_table_with_columns</span>({
  <span class="mcp-key">tableName</span>: <span class="mcp-string">"Клиенты"</span>,
  <span class="mcp-key">columns</span>: [
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Email"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">3</span> },
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Телефон"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">3</span> },
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Баланс"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">13</span> }
  ]
})</pre>
                    </div>
                  </div>

                  <!-- Step 3 -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-number">3</span>
                      <span class="step-title">Добавить справочник</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_create_lookup_table</span>({
  <span class="mcp-key">tableName</span>: <span class="mcp-string">"Статусы"</span>,
  <span class="mcp-key">values</span>: [<span class="mcp-string">"Новый"</span>, <span class="mcp-string">"Активный"</span>, <span class="mcp-string">"Заблокирован"</span>]
})</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Smart Query">
                <div class="example-steps">
                  <!-- Simple Query -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Простой запрос</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_smart_query</span>({
  <span class="mcp-key">tables</span>: [{ <span class="mcp-key">id</span>: <span class="mcp-number">18</span>, <span class="mcp-key">alias</span>: <span class="mcp-string">"u"</span> }],
  <span class="mcp-key">columns</span>: [
    { <span class="mcp-key">field</span>: <span class="mcp-number">18</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Имя"</span> },
    { <span class="mcp-key">field</span>: <span class="mcp-number">115</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Email"</span> }
  ],
  <span class="mcp-key">where</span>: <span class="mcp-string">"u.115 IS NOT NULL"</span>,
  <span class="mcp-key">limit</span>: <span class="mcp-number">50</span>
})</pre>
                    </div>
                  </div>

                  <!-- Aggregation Query -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">С агрегацией</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_smart_query</span>({
  <span class="mcp-key">tables</span>: [{ <span class="mcp-key">id</span>: <span class="mcp-number">12360</span>, <span class="mcp-key">alias</span>: <span class="mcp-string">"o"</span> }],
  <span class="mcp-key">columns</span>: [
    { <span class="mcp-key">field</span>: <span class="mcp-number">12363</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Статус"</span>, <span class="mcp-key">groupBy</span>: <span class="mcp-boolean">true</span> },
    { <span class="mcp-key">field</span>: <span class="mcp-number">0</span>, <span class="mcp-key">formula</span>: <span class="mcp-string">"COUNT(*)"</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Количество"</span> }
  ]
})</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="JavaScript/Vue">
                <div class="example-steps">
                  <!-- Import -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Импорт</span>
                    </div>
                    <div class="js-code-block">
                      <div class="code-label">JavaScript:</div>
                      <pre class="js-code"><span class="js-keyword">import</span> integramApiClient <span class="js-keyword">from</span> <span class="js-string">'@/services/integramApiClient'</span></pre>
                    </div>
                  </div>

                  <!-- Auth -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Авторизация</span>
                    </div>
                    <div class="js-code-block">
                      <div class="code-label">JavaScript:</div>
                      <pre class="js-code"><span class="js-keyword">await</span> integramApiClient.<span class="js-function">setServer</span>(<span class="js-string">'${import.meta.env.VITE_INTEGRAM_URL}'</span>)
<span class="js-keyword">await</span> integramApiClient.<span class="js-function">authenticate</span>(<span class="js-string">'A2025'</span>, <span class="js-string">'user'</span>, <span class="js-string">'password'</span>)</pre>
                    </div>
                  </div>

                  <!-- Get Dictionary -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Получить список таблиц</span>
                    </div>
                    <div class="js-code-block">
                      <div class="code-label">JavaScript:</div>
                      <pre class="js-code"><span class="js-keyword">const</span> dict = <span class="js-keyword">await</span> integramApiClient.<span class="js-function">getDictionary</span>()</pre>
                    </div>
                  </div>

                  <!-- Get Objects -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Получить записи</span>
                    </div>
                    <div class="js-code-block">
                      <div class="code-label">JavaScript:</div>
                      <pre class="js-code"><span class="js-keyword">const</span> objects = <span class="js-keyword">await</span> integramApiClient.<span class="js-function">getObjectList</span>(<span class="js-number">18</span>, { <span class="js-key">LIMIT</span>: <span class="js-number">50</span> })</pre>
                    </div>
                  </div>

                  <!-- Create Object -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">Создать запись</span>
                    </div>
                    <div class="js-code-block">
                      <div class="code-label">JavaScript:</div>
                      <pre class="js-code"><span class="js-keyword">const</span> result = <span class="js-keyword">await</span> integramApiClient.<span class="js-function">createObject</span>(<span class="js-number">18</span>, <span class="js-string">'Название'</span>, {
  <span class="js-string">'115'</span>: <span class="js-string">'Значение поля'</span>
})</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="Формат ответа: auth">
                <div class="example-steps">
                  <!-- Success Response -->
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Успешная авторизация</span>
                    </div>
                    <div class="json-code-block">
                      <div class="code-label">Response:</div>
                      <pre class="json-code">{
  <span class="json-key">"_xsrf"</span>: <span class="json-string">"ef1bbd56839b1e97636a5"</span>,
  <span class="json-key">"token"</span>: <span class="json-string">"67a450965bf763cd719b5fcdb4ca41"</span>,
  <span class="json-key">"msg"</span>: <span class="json-null">null</span>
}</pre>
                    </div>
                  </div>

                  <!-- Error Response -->
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">Ошибка авторизации</span>
                    </div>
                    <div class="json-code-block">
                      <div class="code-label">Response:</div>
                      <pre class="json-code">{
  <span class="json-key">"failed"</span>: <span class="json-string">"wrong"</span>
}</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="Формат ответа: metadata">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">GET /andy/metadata/18</span>
                    </div>
                    <div class="json-code-block">
                      <div class="code-label">Response:</div>
                      <pre class="json-code">{
  <span class="json-key">"id"</span>: <span class="json-string">"18"</span>,
  <span class="json-key">"up"</span>: <span class="json-string">"0"</span>,
  <span class="json-key">"type"</span>: <span class="json-string">"3"</span>,
  <span class="json-key">"val"</span>: <span class="json-string">"Пользователь"</span>,
  <span class="json-key">"unique"</span>: <span class="json-string">"1"</span>,
  <span class="json-key">"reqs"</span>: [
    {
      <span class="json-key">"num"</span>: <span class="json-number">1</span>,
      <span class="json-key">"id"</span>: <span class="json-string">"115"</span>,
      <span class="json-key">"val"</span>: <span class="json-string">"Роль"</span>,
      <span class="json-key">"type"</span>: <span class="json-string">"3"</span>,
      <span class="json-key">"ref"</span>: <span class="json-string">"42"</span>,        <span class="json-comment">// Ссылка на таблицу 42</span>
      <span class="json-key">"ref_id"</span>: <span class="json-string">"114"</span>,
      <span class="json-key">"attrs"</span>: <span class="json-string">":!NULL:164"</span>  <span class="json-comment">// !NULL = обязательное</span>
    },
    {
      <span class="json-key">"num"</span>: <span class="json-number">2</span>,
      <span class="json-key">"id"</span>: <span class="json-string">"41"</span>,
      <span class="json-key">"val"</span>: <span class="json-string">"Email"</span>,
      <span class="json-key">"type"</span>: <span class="json-string">"3"</span>,
      <span class="json-key">"attrs"</span>: <span class="json-string">":!NULL:"</span>
    },
    {
      <span class="json-key">"num"</span>: <span class="json-number">3</span>,
      <span class="json-key">"id"</span>: <span class="json-string">"156"</span>,
      <span class="json-key">"val"</span>: <span class="json-string">"Дата"</span>,
      <span class="json-key">"type"</span>: <span class="json-string">"9"</span>,
      <span class="json-key">"attrs"</span>: <span class="json-string">"[TODAY]"</span>  <span class="json-comment">// Значение по умолчанию</span>
    }
  ]
}</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="Формат ответа: object">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">GET /andy/object/1141</span>
                    </div>
                    <div class="json-code-block">
                      <div class="code-label">Response:</div>
                      <pre class="json-code">{
  <span class="json-key">"type"</span>: {
    <span class="json-key">"id"</span>: <span class="json-number">1141</span>,
    <span class="json-key">"up"</span>: <span class="json-number">1</span>,
    <span class="json-key">"val"</span>: <span class="json-string">"Plan"</span>,
    <span class="json-key">"base"</span>: <span class="json-string">"SHORT"</span>
  },
  <span class="json-key">"base"</span>: { <span class="json-key">"id"</span>: <span class="json-string">"3"</span> },
  <span class="json-key">"req_base"</span>: { <span class="json-key">"1274"</span>: <span class="json-string">"SIGNED"</span> },
  <span class="json-key">"req_type"</span>: { <span class="json-key">"1274"</span>: <span class="json-string">"Price"</span> },
  <span class="json-key">"req_order"</span>: [<span class="json-string">"1274"</span>],
  <span class="json-key">"object"</span>: [
    { <span class="json-key">"id"</span>: <span class="json-string">"1146"</span>, <span class="json-key">"up"</span>: <span class="json-string">"1"</span>, <span class="json-key">"val"</span>: <span class="json-string">"Free"</span>, <span class="json-key">"base"</span>: <span class="json-string">"1141"</span> },
    { <span class="json-key">"id"</span>: <span class="json-string">"1148"</span>, <span class="json-key">"up"</span>: <span class="json-string">"1"</span>, <span class="json-key">"val"</span>: <span class="json-string">"Scalable"</span>, <span class="json-key">"base"</span>: <span class="json-string">"1141"</span> }
  ],
  <span class="json-key">"reqs"</span>: {
    <span class="json-key">"1146"</span>: { <span class="json-key">"1274"</span>: <span class="json-string">"0.00"</span> },
    <span class="json-key">"1148"</span>: { <span class="json-key">"1274"</span>: <span class="json-string">"1950.00"</span> }
  }
}</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="Формат ответа: xsrf">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">GET /andy/xsrf</span>
                    </div>
                    <div class="json-code-block">
                      <div class="code-label">Response:</div>
                      <pre class="json-code">{
  <span class="json-key">"_xsrf"</span>: <span class="json-string">"2ae0f4375dabb5"</span>,
  <span class="json-key">"token"</span>: <span class="json-string">"b4ad9d6b31a7c82972ef1b2"</span>,
  <span class="json-key">"user"</span>: <span class="json-string">"admin"</span>,
  <span class="json-key">"role"</span>: <span class="json-string">"admin"</span>,
  <span class="json-key">"id"</span>: <span class="json-string">"130152"</span>,
  <span class="json-key">"msg"</span>: <span class="json-string">""</span>
}</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Batch операции">
                <div class="example-steps">
                  <div class="example-step mb-4">
                    <div class="step-header mb-2">
                      <span class="step-title">Массовое создание объектов</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_create_objects_batch</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">objects</span>: [
    {
      <span class="mcp-key">value</span>: <span class="mcp-string">"Главная"</span>,
      <span class="mcp-key">requisites</span>: { <span class="mcp-string">"195630"</span>: <span class="mcp-string">"/"</span>, <span class="mcp-string">"195631"</span>: <span class="mcp-string">"pi pi-home"</span> }
    },
    {
      <span class="mcp-key">value</span>: <span class="mcp-string">"Профиль"</span>,
      <span class="mcp-key">requisites</span>: { <span class="mcp-string">"195630"</span>: <span class="mcp-string">"/profile"</span>, <span class="mcp-string">"195631"</span>: <span class="mcp-string">"pi pi-user"</span> }
    },
    {
      <span class="mcp-key">value</span>: <span class="mcp-string">"Настройки"</span>,
      <span class="mcp-key">requisites</span>: { <span class="mcp-string">"195630"</span>: <span class="mcp-string">"/settings"</span>, <span class="mcp-string">"195631"</span>: <span class="mcp-string">"pi pi-cog"</span> }
    }
  ]
})
<span class="mcp-comment">// Возвращает: [197070, 197071, 197072]</span></pre>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-header mb-2">
                      <span class="step-title">Создание родителя с детьми</span>
                    </div>
                    <div class="mcp-code-block">
                      <div class="code-label">MCP Tool:</div>
                      <pre class="mcp-code"><span class="mcp-function">integram_create_parent_with_children</span>({
  <span class="mcp-key">parentTypeId</span>: <span class="mcp-number">22</span>,      <span class="mcp-comment">// Отчет</span>
  <span class="mcp-key">parentValue</span>: <span class="mcp-string">"Продажи по менеджерам"</span>,
  <span class="mcp-key">parentRequisites</span>: { <span class="mcp-string">"228"</span>: <span class="mcp-string">"1"</span> },  <span class="mcp-comment">// EXECUTE flag</span>
  <span class="mcp-key">childTypeId</span>: <span class="mcp-number">28</span>,       <span class="mcp-comment">// Колонки отчета</span>
  <span class="mcp-key">children</span>: [
    { <span class="mcp-key">value</span>: <span class="mcp-string">"Менеджер"</span>, <span class="mcp-key">requisites</span>: { <span class="mcp-string">"100"</span>: <span class="mcp-string">"Менеджер"</span> } },
    { <span class="mcp-key">value</span>: <span class="mcp-string">"Сумма"</span>, <span class="mcp-key">requisites</span>: { <span class="mcp-string">"100"</span>: <span class="mcp-string">"Сумма"</span>, <span class="mcp-string">"72"</span>: <span class="mcp-string">"1"</span> } }
  ]
})</pre>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Multiselect">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-circle">1</div>
                    <div class="step-content">
                      <div class="step-title">Добавить элемент в multiselect</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_add_multiselect_item</span>({
  <span class="mcp-key">objectId</span>: <span class="mcp-number">197070</span>,
  <span class="mcp-key">requisiteId</span>: <span class="mcp-number">197038</span>,  <span class="mcp-comment">// multiselect реквизит</span>
  <span class="mcp-key">value</span>: <span class="mcp-string">"197039"</span>       <span class="mcp-comment">// ID выбираемого объекта</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">2</div>
                    <div class="step-content">
                      <div class="step-title">Получить все элементы multiselect</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> items = <span class="mcp-function">integram_get_multiselect_items</span>({
  <span class="mcp-key">objectId</span>: <span class="mcp-number">197070</span>,
  <span class="mcp-key">requisiteId</span>: <span class="mcp-number">197038</span>
})</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Ответ:</div>
                        <pre class="json-code">[
  { <span class="json-key">"id"</span>: <span class="json-string">"123"</span>, <span class="json-key">"value"</span>: <span class="json-string">"197039"</span> },
  { <span class="json-key">"id"</span>: <span class="json-string">"124"</span>, <span class="json-key">"value"</span>: <span class="json-string">"197040"</span> }
]</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">3</div>
                    <div class="step-content">
                      <div class="step-title">Удалить элемент multiselect</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_remove_multiselect_item</span>({
  <span class="mcp-key">itemId</span>: <span class="mcp-string">"123"</span>  <span class="mcp-comment">// НЕ objectId, а ID связи!</span>
})</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Структурные операции">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-circle">1</div>
                    <div class="step-content">
                      <div class="step-title">Получить полную структуру таблицы</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> structure = <span class="mcp-function">integram_get_table_structure</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>
})</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Возвращает:</div>
                        <pre class="json-code"><span class="mcp-comment">// metadata, columns с именами и типами, статистику</span></pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">2</div>
                    <div class="step-content">
                      <div class="step-title">Клонировать структуру таблицы</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_clone_table_structure</span>({
  <span class="mcp-key">sourceTypeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">newTableName</span>: <span class="mcp-string">"БоковоеМеню_Копия"</span>,
  <span class="mcp-key">baseTypeId</span>: <span class="mcp-number">3</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">3</div>
                    <div class="step-content">
                      <div class="step-title">Переименовать таблицу</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_rename_table</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">newName</span>: <span class="mcp-string">"ГлавноеМеню"</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">4</div>
                    <div class="step-content">
                      <div class="step-title">Добавить несколько колонок сразу</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_add_columns_to_table</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">columns</span>: [
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Описание"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">2</span>, <span class="mcp-key">allowNull</span>: <span class="mcp-boolean">true</span> },
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Активен"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">7</span>, <span class="mcp-key">allowNull</span>: <span class="mcp-boolean">false</span> },
    { <span class="mcp-key">alias</span>: <span class="mcp-string">"Порядок"</span>, <span class="mcp-key">requisiteTypeId</span>: <span class="mcp-number">13</span> }
  ]
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">5</div>
                    <div class="step-content">
                      <div class="step-title">Удалить таблицу со всеми данными</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_delete_table_cascade</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">confirm</span>: <span class="mcp-boolean">true</span>  <span class="mcp-comment">// Обязательное подтверждение</span>
})</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Работа с отчетами">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-circle">1</div>
                    <div class="step-content">
                      <div class="step-title">Создать отчет с FROM и колонками</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> reportId = <span class="mcp-function">integram_create_report</span>({
  <span class="mcp-key">name</span>: <span class="mcp-string">"Клиенты с заказами"</span>,
  <span class="mcp-key">fromTables</span>: [
    { <span class="mcp-key">tableId</span>: <span class="mcp-number">204210</span>, <span class="mcp-key">alias</span>: <span class="mcp-string">"c"</span> },
    { <span class="mcp-key">tableId</span>: <span class="mcp-number">204220</span>, <span class="mcp-key">alias</span>: <span class="mcp-string">"o"</span>, <span class="mcp-key">joinOn</span>: <span class="mcp-string">"o.client_id = c.id"</span> }
  ],
  <span class="mcp-key">columns</span>: [
    { <span class="mcp-key">field</span>: <span class="mcp-number">204210</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Клиент"</span> },
    { <span class="mcp-key">field</span>: <span class="mcp-number">0</span>, <span class="mcp-key">formula</span>: <span class="mcp-string">"COUNT(o.id)"</span>, <span class="mcp-key">name</span>: <span class="mcp-string">"Заказов"</span> }
  ],
  <span class="mcp-key">where</span>: <span class="mcp-string">"c.active = 1"</span>,
  <span class="mcp-key">orderBy</span>: <span class="mcp-string">"c.name"</span>,
  <span class="mcp-key">limit</span>: <span class="mcp-number">100</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">2</div>
                    <div class="step-content">
                      <div class="step-title">Добавить колонку в существующий отчет</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_add_report_column</span>({
  <span class="mcp-key">reportId</span>: <span class="mcp-number">12345</span>,
  <span class="mcp-key">fieldId</span>: <span class="mcp-number">204214</span>,
  <span class="mcp-key">nameInReport</span>: <span class="mcp-string">"Телефон"</span>,
  <span class="mcp-key">formula</span>: <span class="mcp-string">"c.phone"</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">3</div>
                    <div class="step-content">
                      <div class="step-title">Клонировать отчет</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_clone_report</span>({
  <span class="mcp-key">sourceReportId</span>: <span class="mcp-number">12345</span>,
  <span class="mcp-key">newName</span>: <span class="mcp-string">"Клиенты с заказами (копия)"</span>,
  <span class="mcp-key">setExecute</span>: <span class="mcp-boolean">true</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">4</div>
                    <div class="step-content">
                      <div class="step-title">Получить структуру отчета</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> reportStructure = <span class="mcp-function">integram_get_report_structure</span>({
  <span class="mcp-key">reportId</span>: <span class="mcp-number">12345</span>
})</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Возвращает:</div>
                        <pre class="json-code"><span class="mcp-comment">// FROM tables, columns, requisites</span></pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Lookup с reference">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-circle">1</div>
                    <div class="step-content">
                      <div class="step-title">Создать справочник И добавить как колонку</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_create_lookup_with_reference</span>({
  <span class="mcp-key">targetTableId</span>: <span class="mcp-number">195629</span>,        <span class="mcp-comment">// Таблица БоковоеМеню</span>
  <span class="mcp-key">lookupTableName</span>: <span class="mcp-string">"Статусы меню"</span>,
  <span class="mcp-key">values</span>: [<span class="mcp-string">"Активный"</span>, <span class="mcp-string">"Скрытый"</span>, <span class="mcp-string">"Удален"</span>],
  <span class="mcp-key">columnAlias</span>: <span class="mcp-string">"Статус"</span>,
  <span class="mcp-key">multiSelect</span>: <span class="mcp-boolean">false</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">2</div>
                    <div class="step-content">
                      <div class="step-title">Или создать lookup отдельно</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> lookupId = <span class="mcp-function">integram_create_lookup_table</span>({
  <span class="mcp-key">tableName</span>: <span class="mcp-string">"Приоритеты"</span>,
  <span class="mcp-key">values</span>: [<span class="mcp-string">"Низкий"</span>, <span class="mcp-string">"Средний"</span>, <span class="mcp-string">"Высокий"</span>, <span class="mcp-string">"Критический"</span>],
  <span class="mcp-key">unique</span>: <span class="mcp-boolean">true</span>
})</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">3</div>
                    <div class="step-content">
                      <div class="step-title">Затем добавить как reference колонку</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="mcp-function">integram_add_reference_column</span>({
  <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span>,
  <span class="mcp-key">referenceTableId</span>: lookupId,
  <span class="mcp-key">alias</span>: <span class="mcp-string">"Приоритет"</span>,
  <span class="mcp-key">multiSelect</span>: <span class="mcp-boolean">false</span>,
  <span class="mcp-key">allowNull</span>: <span class="mcp-boolean">true</span>
})</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>

              <AccordionTab header="MCP: Работа с метаданными">
                <div class="example-steps">
                  <div class="example-step">
                    <div class="step-circle">1</div>
                    <div class="step-content">
                      <div class="step-title">Получить метаданные всех типов сразу</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> allTypes = <span class="mcp-function">integram_get_all_types_metadata</span>()</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">2</div>
                    <div class="step-content">
                      <div class="step-title">Подсчитать объекты без загрузки данных</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> count = <span class="mcp-function">integram_get_object_count</span>({ <span class="mcp-key">typeId</span>: <span class="mcp-number">195629</span> })</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Ответ:</div>
                        <pre class="json-code">{ <span class="json-key">"count"</span>: <span class="json-number">42</span> }</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">3</div>
                    <div class="step-content">
                      <div class="step-title">Получить метаданные объекта</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> objMeta = <span class="mcp-function">integram_get_object_meta</span>({
  <span class="mcp-key">objectId</span>: <span class="mcp-number">197070</span>
})</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Ответ:</div>
                        <pre class="json-code">{
  <span class="json-key">"type"</span>: <span class="json-number">195629</span>,
  <span class="json-key">"parent"</span>: <span class="json-number">1</span>,
  <span class="json-key">"created"</span>: <span class="json-string">"..."</span>,
  <span class="json-key">"modified"</span>: <span class="json-string">"..."</span>
}</pre>
                      </div>
                    </div>
                  </div>

                  <div class="example-step">
                    <div class="step-circle">4</div>
                    <div class="step-content">
                      <div class="step-title">Получить компактную схему для AI</div>
                      <div class="mcp-code-block">
                        <div class="code-label">MCP Tool:</div>
                        <pre class="mcp-code"><span class="js-keyword">const</span> schema = <span class="mcp-function">integram_get_schema</span>({
  <span class="mcp-key">filter</span>: <span class="mcp-string">"Меню"</span>,
  <span class="mcp-key">includeSystemTables</span>: <span class="mcp-boolean">false</span>
})</pre>
                      </div>
                      <div class="json-code-block">
                        <div class="code-label">Формат:</div>
                        <pre class="json-code">[
  {
    <span class="json-key">"id"</span>: <span class="json-number">195629</span>,
    <span class="json-key">"name"</span>: <span class="json-string">"БоковоеМеню"</span>,
    <span class="json-key">"fields"</span>: [
      { <span class="json-key">"id"</span>: <span class="json-number">195630</span>, <span class="json-key">"name"</span>: <span class="json-string">"path"</span>, <span class="json-key">"type"</span>: <span class="json-string">"SHORT"</span>, <span class="json-key">"ref"</span>: <span class="json-null">null</span> }
    ]
  }
]</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTab>
            </Accordion>
          </div>
        </div>

        <!-- Playground Section -->
        <div class="mb-4">
          <div class="section-header" @click="sections.playground = !sections.playground">
            <h3 class="section-title">Playground</h3>
            <i :class="sections.playground ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="section-chevron"></i>
          </div>
          <div v-show="sections.playground" class="section-content">
            <div class="grid">
              <!-- Request Section -->
              <div class="col-12 md:col-6">
                <div class="p-fluid">
                  <div class="field">
                    <label class="block mb-2">Метод</label>
                    <SelectButton
                      v-model="playground.method"
                      :options="[{label: 'GET', value: 'GET'}, {label: 'POST', value: 'POST'}]"
                      optionLabel="label"
                      optionValue="value"
                    />
                  </div>

                  <div class="field">
                    <label class="block mb-2">Endpoint</label>
                    <div class="p-inputgroup">
                      <span class="p-inputgroup-addon">/{{ database || 'db' }}/</span>
                      <InputText
                        v-model="playground.endpoint"
                        placeholder="dict"
                      />
                    </div>
                  </div>

                  <div class="field" v-if="playground.method === 'POST'">
                    <label class="block mb-2 font-semibold">Параметры запроса</label>

                    <!-- Request Parameters Editor (Postman-style) -->
                    <div class="params-editor">
                      <div class="params-header">
                        <div class="param-col-checkbox"></div>
                        <div class="param-col-key">KEY</div>
                        <div class="param-col-value">VALUE</div>
                        <div class="param-col-actions"></div>
                      </div>

                      <div class="params-body">
                        <div
                          v-for="(param, index) in playground.params"
                          :key="index"
                          class="param-row"
                          :class="{ 'param-disabled': !param.enabled }"
                        >
                          <!-- Checkbox -->
                          <div class="param-col-checkbox">
                            <Checkbox
                              v-model="param.enabled"
                              :binary="true"
                              @change="toggleParam(index)"
                            />
                          </div>

                          <!-- Key Input -->
                          <div class="param-col-key">
                            <InputText
                              v-model="param.key"
                              placeholder="key"
                              :disabled="!param.enabled"
                              class="param-input"
                            />
                          </div>

                          <!-- Value Input -->
                          <div class="param-col-value">
                            <InputText
                              v-model="param.value"
                              placeholder="value"
                              :disabled="!param.enabled"
                              class="param-input"
                            />
                          </div>

                          <!-- Actions -->
                          <div class="param-col-actions">
                            <Button
                              icon="pi pi-trash"
                              size="small"
                              text
                              severity="danger"
                              @click="removeParam(index)"
                              v-tooltip.top="'Удалить'"
                              :disabled="playground.params.length === 1"
                              class="p-0"
                            />
                          </div>
                        </div>
                      </div>

                      <div class="params-footer">
                        <Button
                          label="Добавить параметр"
                          icon="pi pi-plus"
                          size="small"
                          text
                          @click="addParam"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <Button
                      label="Выполнить"
                      icon="pi pi-play"
                      @click="executePlayground"
                      :loading="playgroundLoading"
                      :disabled="!isAuthenticated"
                      class="flex-1"
                    />
                    <Button
                      icon="pi pi-refresh"
                      outlined
                      @click="resetPlayground"
                      v-tooltip.top="'Очистить'"
                    />
                  </div>

                  <small v-if="!isAuthenticated" class="text-orange-500 block mt-2">
                    Требуется авторизация
                  </small>
                </div>
              </div>

              <!-- Response Section -->
              <div class="col-12 md:col-6">
                <div class="field">
                  <label class="block mb-2 font-semibold">Ответ</label>

                  <!-- Response Viewer -->
                  <div class="response-viewer">
                    <div v-if="playgroundResult" class="response-header">
                      <div class="response-status">
                        <i class="pi pi-check-circle text-sm" v-if="playgroundResult.status < 400"></i>
                        <i class="pi pi-times-circle text-sm" v-else></i>
                        <span class="text-xs">Status {{ playgroundResult.status }}</span>
                      </div>
                      <div class="response-meta">
                        <Tag :value="`${playgroundResult.time}ms`" severity="secondary" size="small" />
                        <Button
                          icon="pi pi-copy"
                          size="small"
                          text
                          severity="secondary"
                          @click="copyResponse"
                          v-tooltip.top="'Копировать'"
                          class="p-0"
                        />
                      </div>
                    </div>

                    <div v-if="playgroundResult" class="response-body">
                      <pre class="response-json">{{ formatJSON(playgroundResult.data) }}</pre>
                    </div>
                    <div v-else class="response-empty">
                      <i class="pi pi-inbox"></i>
                      <p>Выполните запрос</p>
                      <small class="text-xs text-color-secondary">Ответ появится здесь</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <Toast />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import integramApiClient from '@/services/integramApiClient'
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue'

const toast = useToast()

// State
const searchQuery = ref('')
const selectedCategory = ref('all')
const selectedSubcategory = ref('all')
const expandedRows = ref({})
const sections = ref({
  overview: true,
  commands: true,
  mcp: false,
  dataModel: false,
  types: false,
  examples: false,
  playground: false
})

// Auth state
const isAuthenticated = computed(() => integramApiClient.isAuthenticated())
const database = computed(() => integramApiClient.getDatabase())

// Breadcrumb
const breadcrumbItems = computed(() => [
  { label: 'API Документация', icon: 'pi pi-book' }
])

// Categories
const categories = [
  { name: 'Все', value: 'all' },
  { name: 'DDL', value: 'ddl' },
  { name: 'DML', value: 'dml' },
  { name: 'Query', value: 'query' },
  { name: 'Auth', value: 'auth' },
  { name: 'Files', value: 'files' }
]

// Playground
const playground = ref({
  method: 'GET',
  endpoint: 'dict',
  params: [
    { key: '', value: '', enabled: true }
  ]
})
const playgroundLoading = ref(false)
const playgroundResult = ref(null)

// DDL Commands (Data Definition Language - управление структурой)
const ddlCommands = [
  {
    cmd: '_d_new',
    method: 'post',
    category: 'ddl',
    subcategory: 'Типы (таблицы)',
    description: 'Создать новый тип (таблицу)',
    detailedDescription: 'Создает новый тип данных (таблицу) в базе. Тип определяет структуру для хранения объектов. После создания типа к нему можно добавлять реквизиты (колонки) через _d_req.',
    params: `val — название типа (строка)
t — ID базового типа (0=базовый, 3=стандартный)
unique — уникальность первого поля (0/1)`,
    exampleUrl: '_d_new?JSON_KV',
    exampleBody: {
      val: 'Товары',
      t: 3,
      unique: 0
    },
    exampleResponse: {
      obj: 12345,
      msg: null
    }
  },
  {
    cmd: '_d_save/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Сохранить изменения типа',
    detailedDescription: 'Обновляет свойства существующего типа: название, базовый тип, флаг уникальности. Используется для переименования таблиц или изменения их базовых настроек.',
    params: `{id} — ID типа в URL
val — новое название типа
t — ID базового типа
unique — уникальность (0/1)`,
    exampleUrl: '_d_save/12345?JSON_KV',
    exampleBody: {
      val: 'Товары (обновлено)',
      unique: 0
    },
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_d_del/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Удалить тип и все его объекты',
    detailedDescription: 'Удаляет тип (таблицу) и все связанные с ним объекты, реквизиты и данные. Операция необратима, будьте осторожны! Каскадно удаляются все записи этого типа.',
    params: `{id} — ID удаляемого типа в URL`,
    exampleUrl: '_d_del/12345?JSON_KV',
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_d_req/{typeId}',
    method: 'post',
    category: 'ddl',
    description: 'Добавить реквизит (колонку) к типу',
    detailedDescription: 'Добавляет новый реквизит (колонку) к существующему типу. После добавления реквизита обязательно установите его псевдоним через _d_alias.',
    params: `{typeId} — ID типа в URL
t — ID типа реквизита:
  2=LONG, 3=SHORT, 4=DATETIME,
  7=BOOL, 8=CHARS, 13=NUMBER`,
    exampleUrl: '_d_req/12345?JSON_KV',
    exampleBody: {
      t: 13
    },
    exampleResponse: {
      id: 12346,
      msg: null
    }
  },
  {
    cmd: '_d_del_req/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Удалить реквизит из типа',
    params: `{id} — ID реквизита в URL`
  },
  {
    cmd: '_d_alias/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Установить псевдоним (alias) реквизита',
    detailedDescription: 'Устанавливает человекочитаемое имя для реквизита. Псевдоним отображается в интерфейсе как название колонки. Обязательно вызывайте после добавления реквизита через _d_req.',
    params: `{id} — ID реквизита в URL
val — текст псевдонима (например "Цена")`,
    exampleUrl: '_d_alias/12346?JSON_KV',
    exampleBody: {
      val: 'Цена'
    },
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_d_attrs/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Установить значение по умолчанию',
    params: `{id} — ID реквизита в URL
val — значение по умолчанию
  Макросы: [TODAY], [NOW], [USER_ID]`
  },
  {
    cmd: '_d_null/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Переключить флаг NOT NULL',
    params: `{id} — ID реквизита в URL
(toggle: вкл→выкл, выкл→вкл)`
  },
  {
    cmd: '_d_multi/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Переключить режим мультивыбора',
    params: `{id} — ID реквизита в URL
(для ссылочных полей: один→много)`
  },
  {
    cmd: '_d_up/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Переместить реквизит вверх в списке',
    params: `{id} — ID реквизита в URL`
  },
  {
    cmd: '_d_ord/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Установить порядок реквизита',
    params: `{id} — ID реквизита в URL
order — числовой порядок (0, 1, 2...)`
  },
  {
    cmd: '_d_ref/{id}',
    method: 'post',
    category: 'ddl',
    description: 'Создать ссылку на тип (reference)',
    params: `{id} — ID типа в URL
Создаёт ссылочный реквизит на указанный тип`
  }
]

// DML Commands (Data Manipulation Language - работа с данными)
const dmlCommands = [
  {
    cmd: '_m_new/{typeId}',
    method: 'post',
    category: 'dml',
    description: 'Создать новый объект (запись)',
    detailedDescription: 'Создает новый объект (запись) указанного типа. Параметр up=1 означает независимый объект (подчинен ROOT). Значения реквизитов передаются как t{reqId}=значение.',
    params: `{typeId} — ID типа в URL
t{typeId} — значение главного поля
t{reqId} — значения реквизитов
up — ID родителя (0 или 1 для независимых)`,
    exampleUrl: '_m_new/12345?JSON_KV',
    exampleBody: {
      t12345: 'Товар 1',
      t12346: '1500',
      up: 1
    },
    exampleResponse: {
      obj: 99999,
      msg: null
    }
  },
  {
    cmd: '_m_save/{id}',
    method: 'post',
    category: 'dml',
    description: 'Сохранить объект целиком',
    detailedDescription: 'Сохраняет объект с указанием всех реквизитов. В отличие от _m_set, требует передачи всех полей объекта, даже если они не изменились. Для обновления отдельных полей рекомендуется использовать _m_set.',
    params: `{id} — ID объекта в URL
t{typeId} — новое значение главного поля
t{reqId} — значения реквизитов`,
    exampleUrl: '_m_save/99999?JSON_KV',
    exampleBody: {
      t12345: 'Товар 1 (обновлено)',
      t12346: '2500'
    },
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_m_set/{id}',
    method: 'post',
    category: 'dml',
    description: 'Обновить только указанные реквизиты (рекомендуется)',
    detailedDescription: 'Обновляет только указанные реквизиты объекта, не затрагивая остальные поля. Это предпочтительный способ обновления данных, так как не требует передачи всех полей объекта.',
    params: `{id} — ID объекта в URL
t{reqId} — значения реквизитов
(только переданные поля обновятся)`,
    exampleUrl: '_m_set/99999?JSON_KV',
    exampleBody: {
      t12346: '2000'
    },
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_m_del/{id}',
    method: 'post',
    category: 'dml',
    description: 'Удалить объект',
    detailedDescription: 'Удаляет объект по его ID. Все связанные подчиненные объекты также будут удалены каскадно. Операция необратима.',
    params: `{id} — ID удаляемого объекта в URL`,
    exampleUrl: '_m_del/99999?JSON_KV',
    exampleResponse: {
      ok: true,
      msg: null
    }
  },
  {
    cmd: '_m_up/{id}',
    method: 'post',
    category: 'dml',
    description: 'Переместить объект вверх в списке',
    params: `{id} — ID объекта в URL`
  },
  {
    cmd: '_m_move/{id}',
    method: 'post',
    category: 'dml',
    description: 'Переместить к другому родителю',
    params: `{id} — ID объекта в URL
up — ID нового родительского объекта`
  },
  {
    cmd: '_m_ord/{id}',
    method: 'post',
    category: 'dml',
    description: 'Установить порядок объекта',
    params: `{id} — ID объекта в URL
order — числовой порядок (0, 1, 2...)`
  },
  {
    cmd: '_m_id/{id}',
    method: 'post',
    category: 'dml',
    description: 'Изменить ID объекта',
    params: `{id} — текущий ID объекта в URL
new_id — новый ID объекта`
  }
]

// Query Commands (чтение данных)
const queryCommands = [
  {
    cmd: 'dict',
    method: 'get',
    category: 'query',
    description: 'Получить список всех типов (справочник)',
    detailedDescription: 'Возвращает список всех типов (таблиц) в базе данных. Используйте для получения списка доступных таблиц и их ID перед работой с данными.',
    params: `(без параметров)
Возвращает: types[], объекты с id, name, up`,
    exampleUrl: 'dict?JSON_KV',
    exampleResponse: {
      types: [
        { id: '18', name: 'Пользователь', up: '0' },
        { id: '42', name: 'Роль', up: '0' },
        { id: '12345', name: 'Товары', up: '0' }
      ]
    }
  },
  {
    cmd: 'metadata/{id}',
    method: 'get',
    category: 'query',
    description: 'Получить метаданные типа',
    detailedDescription: 'Возвращает подробную информацию о структуре типа: список реквизитов, их типы, псевдонимы, ограничения, значения по умолчанию. Необходимо для понимания структуры данных перед чтением или записью объектов.',
    params: `{id} — ID типа в URL
Возвращает: реквизиты, их типы, alias'ы`,
    exampleUrl: 'metadata/12345?JSON_KV',
    exampleResponse: {
      id: '12345',
      val: 'Товары',
      type: '3',
      unique: '0',
      reqs: [
        {
          num: 1,
          id: '12346',
          val: 'Цена',
          type: '13',
          attrs: ':!NULL:'
        }
      ]
    }
  },
  {
    cmd: 'object/{typeId}',
    method: 'get',
    category: 'query',
    description: 'Получить список объектов типа',
    detailedDescription: 'Возвращает список объектов (записей) указанного типа с их реквизитами. Поддерживает пагинацию, фильтрацию и сортировку. Основная команда для чтения данных из таблиц.',
    params: `{typeId} — ID типа в URL
LIMIT — макс. кол-во записей (по умолч. 50)
pg — номер страницы (начиная с 1)
F_{reqId} — фильтр по реквизиту
sort — сортировка (reqId или -reqId)
POST: _m_del_select — удалить все по фильтру`,
    exampleUrl: 'object/12345?JSON_KV&LIMIT=10&pg=1',
    exampleResponse: {
      type: { id: '12345', val: 'Товары' },
      object: [
        { id: '99999', up: '1', val: 'Товар 1' },
        { id: '99998', up: '1', val: 'Товар 2' }
      ],
      reqs: {
        '99999': { '12346': '1500' },
        '99998': { '12346': '2000' }
      }
    }
  },
  {
    cmd: 'edit_obj/{id}',
    method: 'get',
    category: 'query',
    description: 'Получить данные объекта для редактирования',
    detailedDescription: 'Возвращает полную информацию об объекте для редактирования: основные поля, значения всех реквизитов, информацию о ссылочных полях (reference) и доступные опции для выпадающих списков. Используется перед обновлением объекта.',
    params: `{id} — ID объекта в URL
Возвращает: obj{}, reqs{}, ref-данные`,
    exampleUrl: 'edit_obj/99999?JSON_KV',
    exampleResponse: {
      obj: {
        id: '99999',
        val: 'Товар 1',
        typ: '12345',
        parent: '1'
      },
      reqs: {
        '12346': {
          type: '13',
          value: '1500',
          ref: null
        }
      }
    }
  },
  {
    cmd: 'edit_types',
    method: 'get',
    category: 'query',
    description: 'Получить данные редактора типов',
    params: `(без параметров)
Возвращает: baseTypes, requisiteTypes`
  },
  {
    cmd: 'report/{id}',
    method: 'get',
    category: 'query',
    description: 'Выполнить отчёт (запрос)',
    params: `{id} — ID отчёта в URL
p{reqId} — параметры отчёта
LIMIT — лимит записей
pg — номер страницы
POST: _m_confirmed — выполнить изменения`
  },
  {
    cmd: 'xsrf',
    method: 'get',
    category: 'query',
    description: 'Получить информацию о сессии',
    params: `(без параметров)
Возвращает: xsrf token, user info, permissions`
  },
  {
    cmd: '_ref_reqs/{reqId}',
    method: 'get',
    category: 'query',
    description: 'Получить опции для выпадающего списка',
    detailedDescription: 'Возвращает список доступных значений для ссылочного (reference) поля. Используется для формирования выпадающих списков в UI. Поддерживает фильтрацию по поисковому запросу и ограничение по родительскому объекту.',
    params: `{reqId} — ID ссылочного реквизита
id — ID редактируемого объекта
r — ограничение (restrict)
q — поисковый запрос (фильтр)`,
    exampleUrl: '_ref_reqs/12347?JSON_KV&id=99999&q=Кат',
    exampleResponse: {
      options: [
        { id: '101', val: 'Категория 1' },
        { id: '102', val: 'Категория 2' }
      ]
    }
  },
  {
    cmd: 'obj_meta/{id}',
    method: 'get',
    category: 'query',
    description: 'Получить метаданные объекта',
    params: `{id} — ID объекта в URL
Возвращает: type, parent, created, modified`
  },
  {
    cmd: 'report/{id}',
    method: 'get',
    category: 'query',
    description: 'Получить данные выполненного отчёта',
    detailedDescription: 'Возвращает результаты выполнения отчёта (запроса). POST с параметром _m_confirmed выполняет изменения запроса.',
    params: `{id} — ID отчёта в URL
_m_confirmed — выполнить изменения (для POST)
Возвращает: данные выполненного запроса`,
    exampleUrl: 'report/12345?JSON_KV'
  },
  {
    cmd: 'edit_obj/{id}',
    method: 'get',
    category: 'query',
    description: 'Данные для формы редактирования объекта',
    params: `{id} — ID объекта в URL
Возвращает: данные для построения формы редактирования`
  },
  {
    cmd: 'edit_types',
    method: 'get',
    category: 'query',
    description: 'Данные для Редактора типов',
    params: `(без параметров)
Возвращает: данные для редактора типов (структура БД)`
  },
  {
    cmd: 'xsrf',
    method: 'get',
    category: 'query',
    description: 'Получить информацию о текущей сессии',
    params: `(без параметров)
Возвращает: _xsrf, token, user, role, id`,
    exampleUrl: 'xsrf?JSON_KV',
    exampleResponse: {
      _xsrf: '2ae0f4375dabb5',
      token: 'b4ad9d6b31a7c82972ef1b2',
      user: 'admin',
      role: 'admin',
      id: '130152'
    }
  }
]

// Auth Commands (авторизация)
const authCommands = [
  {
    cmd: 'auth',
    method: 'post',
    category: 'auth',
    description: 'Авторизация по логину и паролю',
    detailedDescription: 'Выполняет аутентификацию пользователя по логину и паролю. При успешной авторизации создается сессия и возвращается XSRF токен. Сессия сохраняется в HTTP-only cookie для последующих запросов.',
    params: `login — имя пользователя
pwd — пароль
Возвращает: session cookie, xsrf token`,
    exampleUrl: 'auth?JSON_KV',
    exampleBody: {
      login: 'd',
      pwd: 'd'
    },
    exampleResponse: {
      xsrf: 'abc123def456',
      user: {
        id: '285',
        name: 'Администратор'
      }
    }
  },
  {
    cmd: 'jwt',
    method: 'post',
    category: 'auth',
    description: 'Авторизация по JWT токену',
    params: `jwt — JSON Web Token
(используется для SSO и API-интеграций)`
  },
  {
    cmd: 'getcode',
    method: 'post',
    category: 'auth',
    description: 'Запросить OTP код на email/телефон',
    params: `u — email или телефон пользователя
(код отправляется на указанный адрес)`
  },
  {
    cmd: 'checkcode',
    method: 'post',
    category: 'auth',
    description: 'Проверить OTP код',
    params: `u — email или телефон
c — код подтверждения (6 цифр)`
  },
  {
    cmd: 'exit',
    method: 'post',
    category: 'auth',
    description: 'Выход из системы',
    params: `(без параметров)
Удаляет session cookie`
  }
]

// File Commands (файлы и бэкапы)
const fileCommands = [
  {
    cmd: 'dir_admin',
    method: 'get',
    category: 'files',
    description: 'Получить список файлов в директории',
    params: `path — путь к директории
  "" = корневая директория
  "folder/" = подпапка
Возвращает: files[], folders[]`
  },
  {
    cmd: 'dir_admin',
    method: 'post',
    category: 'files',
    description: 'Загрузить файл на сервер',
    params: `file — файл (multipart/form-data)
path — путь назначения
  "" = корневая директория`
  },
  {
    cmd: 'backup',
    method: 'post',
    category: 'files',
    description: 'Создать резервную копию БД',
    detailedDescription: 'Создает полную резервную копию текущей базы данных в формате .zip архива. Включает все типы, объекты, реквизиты и файлы. Рекомендуется выполнять регулярные бэкапы перед серьезными изменениями в структуре данных.',
    params: `(без параметров)
Создаёт .zip архив всей базы данных`,
    exampleUrl: 'backup?JSON_KV',
    exampleResponse: {
      ok: true,
      file: 'backup_20250115_143000.zip',
      size: 1048576
    }
  },
  {
    cmd: '_new_db',
    method: 'post',
    category: 'files',
    description: 'Создать новую базу данных',
    params: `name — имя базы (3-15 символов, a-z0-9)
template — шаблон:
  "ru" = русский
  "en" = английский
  "{db}" = клонировать из БД`
  }
]

// Subcategories mapping based on official Integram terminology
const subcategoryMap = {
  // DDL - Редактор типов
  '_d_new': 'Типы',
  '_d_save': 'Типы',
  '_d_del': 'Типы',
  '_d_req': 'Реквизиты',
  '_d_del_req': 'Реквизиты',
  '_d_alias': 'Реквизиты',
  '_d_attrs': 'Реквизиты',
  '_d_null': 'Реквизиты',
  '_d_multi': 'Реквизиты',
  '_d_up': 'Реквизиты',
  '_d_ref': 'Реквизиты',
  // DML - Базовый интерфейс
  '_m_new': 'Создание',
  '_m_save': 'Изменение',
  '_m_set': 'Изменение',
  '_m_up': 'Изменение',
  '_m_move': 'Изменение',
  '_m_del': 'Удаление',
  // Query
  'dict': 'Метаданные',
  'metadata': 'Метаданные',
  'edit_types': 'Метаданные',
  'object': 'Объекты',
  'edit_obj': 'Объекты',
  'obj_meta': 'Объекты',
  'report': 'Отчёты',
  '_ref_reqs': 'Справочники',
  'xsrf': 'Сессия',
  // Auth
  'auth': 'Авторизация',
  // Files
  'dir_admin': 'Файлы',
  'backup': 'Резервные копии',
  '_new_db': 'Резервные копии'
}

// All commands with subcategories
const allCommands = computed(() => {
  const commands = [
    ...ddlCommands,
    ...dmlCommands,
    ...queryCommands,
    ...authCommands,
    ...fileCommands
  ]
  return commands.map(cmd => ({
    ...cmd,
    subcategory: subcategoryMap[cmd.cmd.split('/')[0]] || subcategoryMap[cmd.cmd] || 'Прочее'
  }))
})

// Available subcategories based on selected category
const availableSubcategories = computed(() => {
  let commands = allCommands.value

  // Filter by category if not 'all'
  if (selectedCategory.value !== 'all') {
    commands = commands.filter(c => c.category === selectedCategory.value)
  }

  // Get unique subcategories
  const subcats = [...new Set(commands.map(c => c.subcategory).filter(Boolean))]
  return subcats.sort()
})

// Filtered commands
const filteredCommands = computed(() => {
  let commands = allCommands.value

  if (selectedCategory.value !== 'all') {
    commands = commands.filter(c => c.category === selectedCategory.value)
  }

  if (selectedSubcategory.value !== 'all') {
    commands = commands.filter(c => c.subcategory === selectedSubcategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    commands = commands.filter(c =>
      c.cmd.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query) ||
      c.params.toLowerCase().includes(query)
    )
  }

  return commands
})

// MCP Tools (Model Context Protocol - для AI-ассистентов)
const mcpTools = [
  // Auth
  {
    name: 'integram_authenticate',
    category: 'auth',
    description: 'Авторизация в Integram',
    params: `serverURL — URL сервера (${import.meta.env.VITE_INTEGRAM_URL})
database — имя БД (a2025, my)
login — имя пользователя
password — пароль`
  },
  {
    name: 'integram_set_context',
    category: 'auth',
    description: 'Установить контекст из существующей сессии',
    params: `serverURL — URL сервера
database — имя БД
token — session token
xsrfToken — XSRF токен`
  },
  // DDL
  {
    name: 'integram_create_type',
    category: 'ddl',
    description: 'Создать новый тип (таблицу)',
    params: `name — название типа (рус.)
baseTypeId — базовый тип (по умолч. 3)
unique — уникальность (false)`
  },
  {
    name: 'integram_save_type',
    category: 'ddl',
    description: 'Сохранить изменения типа',
    params: `typeId — ID типа
name — новое название
baseTypeId — базовый тип`
  },
  {
    name: 'integram_delete_type',
    category: 'ddl',
    description: 'Удалить тип и все объекты',
    params: `typeId — ID удаляемого типа`
  },
  {
    name: 'integram_add_requisite',
    category: 'ddl',
    description: 'Добавить реквизит (колонку)',
    params: `typeId — ID типа-владельца
requisiteTypeId — тип реквизита:
  3=SHORT, 2=LONG, 13=NUMBER,
  4=DATETIME, 7=BOOL, 8=CHARS`
  },
  {
    name: 'integram_delete_requisite',
    category: 'ddl',
    description: 'Удалить реквизит',
    params: `requisiteId — ID реквизита`
  },
  {
    name: 'integram_save_requisite_alias',
    category: 'ddl',
    description: 'Установить псевдоним реквизита',
    params: `requisiteId — ID реквизита
alias — текст псевдонима ("Цена")`
  },
  {
    name: 'integram_rename_requisite',
    category: 'ddl',
    description: 'Переименовать реквизит (изменить название И тип)',
    params: `requisiteId — ID реквизита
name — новое название
typeId — новый тип реквизита (3, 13, и т.д.)`
  },
  {
    name: 'integram_toggle_requisite_null',
    category: 'ddl',
    description: 'Переключить NOT NULL',
    params: `requisiteId — ID реквизита
(toggle: вкл↔выкл)`
  },
  {
    name: 'integram_toggle_requisite_multi',
    category: 'ddl',
    description: 'Переключить мультивыбор',
    params: `requisiteId — ID реквизита
(для ссылочных: один↔много)`
  },
  {
    name: 'integram_modify_requisite_attributes',
    category: 'ddl',
    description: 'Массовая модификация attrs реквизита',
    params: `requisiteId — ID реквизита
alias — псевдоним (опц.)
setNull — установить NOT NULL (опц.)
multi — установить MULTI (опц.)`
  },
  {
    name: 'integram_set_requisite_order',
    category: 'ddl',
    description: 'Установить порядок реквизита',
    params: `requisiteId — ID реквизита
order — числовой порядок (0, 1, 2...)`
  },
  // DML
  {
    name: 'integram_create_object',
    category: 'dml',
    description: 'Создать новый объект (запись)',
    params: `typeId — ID типа
value — значение главного поля
parentId — ID родителя (опц.)
requisites — {reqId: value} (опц.)`
  },
  {
    name: 'integram_save_object',
    category: 'dml',
    description: 'Сохранить объект целиком',
    params: `objectId — ID объекта
typeId — ID типа
value — новое значение
requisites — {reqId: value}`
  },
  {
    name: 'integram_set_object_requisites',
    category: 'dml',
    description: 'Обновить реквизиты объекта (рекомендуется)',
    params: `objectId — ID объекта
requisites — {reqId: value}
(обновляет только переданные)`
  },
  {
    name: 'integram_delete_object',
    category: 'dml',
    description: 'Удалить объект',
    params: `objectId — ID объекта`
  },
  {
    name: 'integram_move_object_up',
    category: 'dml',
    description: 'Переместить объект вверх в списке',
    params: `objectId — ID объекта
(изменяет ord, перемещая на позицию выше)`
  },
  {
    name: 'integram_move_object_to_parent',
    category: 'dml',
    description: 'Переместить к другому родителю',
    params: `objectId — ID объекта
newParentId — ID нового родителя`
  },
  {
    name: 'integram_set_object_order',
    category: 'dml',
    description: 'Установить порядок объекта',
    params: `objectId — ID объекта
order — числовой порядок (0, 1, 2...)`
  },
  {
    name: 'integram_set_object_id',
    category: 'dml',
    description: 'Изменить ID объекта',
    params: `objectId — текущий ID объекта
newId — новый ID объекта`
  },
  // Query
  {
    name: 'integram_get_dictionary',
    category: 'query',
    description: 'Получить список типов',
    params: `(без параметров)
Возвращает: types[] с id, name, up`
  },
  {
    name: 'integram_get_type_metadata',
    category: 'query',
    description: 'Получить метаданные типа',
    params: `typeId — ID типа
Возвращает: requisites[], name, base`
  },
  {
    name: 'integram_get_all_types_metadata',
    category: 'query',
    description: 'Получить метаданные всех типов сразу',
    params: `(без параметров)
Возвращает: массив типов с requisites`
  },
  {
    name: 'integram_get_object_list',
    category: 'query',
    description: 'Получить список объектов',
    params: `typeId — ID типа
params — { LIMIT, pg, sort, F_{reqId} }`
  },
  {
    name: 'integram_get_all_objects',
    category: 'query',
    description: 'Получить ВСЕ объекты (с автопагинацией)',
    params: `typeId — ID типа
pageSize — размер страницы (100)
maxPages — макс. страниц (50)`
  },
  {
    name: 'integram_get_object_count',
    category: 'query',
    description: 'Подсчитать объекты в таблице (быстро)',
    params: `typeId — ID типа
(без загрузки данных, только счетчик)`
  },
  {
    name: 'integram_get_object_edit_data',
    category: 'query',
    description: 'Получить данные объекта для редактирования',
    params: `objectId — ID объекта
Возвращает: obj, reqs, ref-данные`
  },
  {
    name: 'integram_get_object_meta',
    category: 'query',
    description: 'Получить метаданные объекта',
    params: `objectId — ID объекта
Возвращает: type, parent, created, modified`
  },
  {
    name: 'integram_get_type_editor_data',
    category: 'query',
    description: 'Получить данные редактора типов',
    params: `(без параметров)
Возвращает: baseTypeOptions, requisiteTypes`
  },
  {
    name: 'integram_get_reference_options',
    category: 'query',
    description: 'Получить опции для выпадающего списка',
    params: `requisiteId — ID ссылочного реквизита
objectId — ID редактируемого объекта
query — поисковый запрос (опц.)
restrict — ограничение (опц.)`
  },
  {
    name: 'integram_get_ref_reqs',
    category: 'query',
    description: 'Альтернативный метод для reference options',
    params: `requisiteId — ID ссылочного реквизита
limit — макс. кол-во опций (100)
query — поисковый запрос (опц.)`
  },
  {
    name: 'integram_get_multiselect_items',
    category: 'query',
    description: 'Получить элементы multiselect поля',
    params: `objectId — ID объекта
requisiteId — ID multiselect реквизита
Возвращает: [{id, value}]`
  },
  {
    name: 'integram_get_dir_admin',
    category: 'query',
    description: 'Получить содержимое директории',
    params: `path — путь к директории (по умолч. "")
Возвращает: files[], folders[]`
  },
  {
    name: 'integram_get_schema',
    category: 'query',
    description: 'Получить компактную схему БД для AI',
    params: `filter — фильтр по имени таблицы
includeSystemTables — включить системные
Формат: [{id, name, fields: [{id, name, type, ref}]}]`
  },
  // High-level
  {
    name: 'integram_create_table_with_columns',
    category: 'high',
    description: 'Создать таблицу с колонками (всё сразу)',
    params: `tableName — название таблицы
columns — [{ alias, requisiteTypeId,
  allowNull?, multiSelect? }]
parentTableId — для подчинённых`
  },
  {
    name: 'integram_create_lookup_table',
    category: 'high',
    description: 'Создать справочник со значениями',
    params: `tableName — название справочника
values — ["Знач1", "Знач2", ...]
unique — уникальность (true)`
  },
  {
    name: 'integram_add_reference_column',
    category: 'high',
    description: 'Добавить ссылочную колонку',
    params: `typeId — ID целевой таблицы
referenceTableId — ID справочника
alias — название колонки
multiSelect — множ. выбор (false)
allowNull — разрешить NULL (true)`
  },
  {
    name: 'integram_create_lookup_with_reference',
    category: 'high',
    description: 'Создать lookup + добавить как reference колонку',
    params: `targetTableId — ID таблицы для колонки
lookupTableName — название справочника
values — ["Знач1", "Знач2", ...] (опц.)
columnAlias — название колонки (опц.)
multiSelect — множ. выбор (false)`
  },
  {
    name: 'integram_execute_connector',
    category: 'high',
    description: 'Выполнить внешний коннектор (_connect)',
    params: `objectId — ID объекта с CONNECT реквизитом
params — параметры запроса (опц.)
(используется как прокси к внешним API)`
  },
  {
    name: 'integram_create_backup',
    category: 'high',
    description: 'Создать резервную копию БД',
    params: `(без параметров)
Создаёт .zip архив всей базы данных`
  },
  {
    name: 'integram_create_database',
    category: 'high',
    description: 'Создать новую базу данных',
    params: `dbName — имя БД (3-15 символов, a-z0-9)
template — шаблон: "ru", "en", или БД для клонирования
description — описание (опц.)`
  },
  // Structure Operations
  {
    name: 'integram_delete_table_cascade',
    category: 'structure',
    description: 'Удалить таблицу и все данные (каскадно)',
    params: `typeId — ID типа для удаления
confirm — подтверждение (true)
ВНИМАНИЕ: Удаляет тип и все объекты!`
  },
  {
    name: 'integram_get_table_structure',
    category: 'structure',
    description: 'Получить полную структуру таблицы',
    params: `typeId — ID типа
Возвращает: metadata, columns, stats`
  },
  {
    name: 'integram_clone_table_structure',
    category: 'structure',
    description: 'Клонировать структуру таблицы',
    params: `sourceTypeId — ID исходного типа
newTableName — название новой таблицы
baseTypeId — базовый тип (3)`
  },
  {
    name: 'integram_rename_table',
    category: 'structure',
    description: 'Переименовать существующую таблицу',
    params: `typeId — ID типа
newName — новое название таблицы`
  },
  {
    name: 'integram_add_columns_to_table',
    category: 'structure',
    description: 'Массово добавить колонки к таблице',
    params: `typeId — ID типа
columns — [{ alias, requisiteTypeId,
  allowNull?, multiSelect? }]`
  },
  // Batch Operations
  {
    name: 'integram_create_objects_batch',
    category: 'batch',
    description: 'Массовое создание объектов',
    params: `typeId — ID типа
objects — [{ value, requisites }]
parentId — ID родителя (опц.)
Возвращает: массив созданных ID`
  },
  {
    name: 'integram_create_parent_with_children',
    category: 'batch',
    description: 'Создать родителя с подчинёнными объектами',
    params: `parentTypeId — ID типа родителя
parentValue — значение родителя
parentRequisites — реквизиты родителя
childTypeId — ID типа детей
children — [{ value, requisites }]`
  },
  // Multiselect Operations
  {
    name: 'integram_add_multiselect_item',
    category: 'multiselect',
    description: 'Добавить элемент в multiselect поле',
    params: `objectId — ID объекта
requisiteId — ID multiselect реквизита
value — ID элемента для добавления`
  },
  {
    name: 'integram_remove_multiselect_item',
    category: 'multiselect',
    description: 'Удалить элемент из multiselect поля',
    params: `itemId — ID элемента multiselect
(НЕ objectId, а ID связи!)`
  },
  // Advanced Query
  {
    name: 'integram_smart_query',
    category: 'query',
    description: 'Выполнить SQL-подобный запрос',
    params: `tables — [{id, alias}]
columns — [{field, name, total?, groupBy?}]
where — условие (MySQL синтаксис)
orderBy — сортировка
limit — лимит записей (100)`
  },
  {
    name: 'integram_natural_query',
    category: 'query',
    description: 'Запрос на естественном языке',
    params: `question — вопрос на русском
  "Покажи всех клиентов"
  "Сколько заказов в статусе Новый?"
targetTable — ID таблицы (опц.)`
  },
  {
    name: 'integram_create_report',
    category: 'report',
    description: 'Создать отчёт (Query)',
    params: `name — название отчёта
fromTables — [{tableId, alias, joinOn?}]
columns — [{field, name, formula?, ...}]
where, having, orderBy, limit`
  },
  {
    name: 'integram_execute_report',
    category: 'report',
    description: 'Выполнить существующий отчёт',
    params: `reportId — ID отчёта
params — параметры {reqId: value}`
  },
  {
    name: 'integram_add_report_column',
    category: 'report',
    description: 'Добавить колонку в отчёт (typeId=28)',
    params: `reportId — ID отчёта (родитель)
fieldId — ID поля из rep_col_list (0 для вычисляемых)
nameInReport — название колонки в отчёте (опц.)
formula — формула/alias (опц.)
functionId — ID функции, например 85 для abn_ID (опц.)
hide — скрыть колонку (false)`
  },
  {
    name: 'integram_add_report_from',
    category: 'report',
    description: 'Добавить FROM таблицу в отчёт (typeId=44)',
    params: `reportId — ID отчёта (родитель)
tableId — ID таблицы для FROM
alias — алиас таблицы (опц.)
joinOn — условие JOIN ON (опц.)`
  },
  {
    name: 'integram_clone_report',
    category: 'report',
    description: 'Клонировать отчёт со всеми FROM/columns',
    params: `sourceReportId — ID исходного отчёта
newName — название нового отчёта
setExecute — установить EXECUTE flag (false)`
  },
  {
    name: 'integram_get_report_structure',
    category: 'report',
    description: 'Получить полную структуру отчёта',
    params: `reportId — ID отчёта
Возвращает: FROM tables, columns, requisites`
  }
]

// Filtered MCP tools
const filteredMcpTools = computed(() => {
  let tools = mcpTools

  if (selectedCategory.value !== 'all') {
    tools = tools.filter(t => t.category === selectedCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    tools = tools.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.params.toLowerCase().includes(query)
    )
  }

  return tools
})

// Data types
const dataTypes = [
  { id: 2, name: 'LONG', description: 'Длинный текст', example: 'Описание...' },
  { id: 3, name: 'SHORT', description: 'Короткий текст (≤127)', example: 'Название' },
  { id: 4, name: 'DATETIME', description: 'Дата и время', example: '2025-01-15 10:30' },
  { id: 7, name: 'BOOL', description: 'Логическое', example: 'true/false' },
  { id: 8, name: 'CHARS', description: 'Неограниченный текст', example: 'JSON...' },
  { id: 9, name: 'DATE', description: 'Только дата', example: '2025-01-15' },
  { id: 10, name: 'FILE', description: 'Файл', example: 'doc.pdf' },
  { id: 13, name: 'NUMBER', description: 'Целое число', example: '42' },
  { id: 14, name: 'SIGNED', description: 'Десятичное', example: '3.14' }
]

// Macros
const macros = [
  { macro: '[TODAY]', description: 'Текущая дата', example: '2025-01-15' },
  { macro: '[NOW]', description: 'Дата и время', example: '2025-01-15 10:30' },
  { macro: '[USER_ID]', description: 'ID пользователя', example: '285' },
  { macro: '[MONTH_AGO]', description: 'Месяц назад', example: '2024-12-15' }
]

// Attrs format (column settings stored in value field)
const attrsFormats = [
  { syntax: ':!NULL:', description: 'Поле обязательно (NOT NULL)', example: ':!NULL:' },
  { syntax: ':!NULL:ID', description: 'Обязательно + значение по умолч.', example: ':!NULL:164' },
  { syntax: '[MACRO]', description: 'Значение по умолчанию (макрос)', example: '[TODAY]' },
  { syntax: 'значение', description: 'Значение по умолчанию (текст)', example: 'Новый' },
  { syntax: ':MULTI:', description: 'Мультивыбор для ссылочного поля', example: ':MULTI:' }
]

// Quintet fields (from dio.csv)
const quintetFields = [
  { field: 'id', synonyms: 'идентификатор, айдишник, номер объекта', description: 'Уникальный идентификатор объекта. Первый элемент квинтета.' },
  { field: 'type', synonyms: 'тип, класс', description: 'Тип объекта. Указывает на таблицу или базовый тип. Второй элемент квинтета.' },
  { field: 'up', synonyms: 'родитель, parent', description: 'ID родительского объекта. 0 = независимый, 1 = подчинён ROOT. Третий элемент.' },
  { field: 'ord', synonyms: 'order, порядок', description: 'Порядковый номер в списке. Четвёртый элемент квинтета.' },
  { field: 'value', synonyms: 'значение, имя, название, val', description: 'Значение объекта (название типа, значение ячейки и т.д.). Пятый элемент.' }
]

// Object types in Integram (from dio.csv)
const objectTypes = [
  {
    name: 'Базовый тип',
    condition: 'id = type, up = 0',
    description: 'Системный тип данных (SHORT=3, LONG=2, NUMBER=13 и т.д.). Представляет пустую таблицу-шаблон.'
  },
  {
    name: 'Таблица (справочник)',
    condition: 'type = базовый, up = 0',
    description: 'Независимая таблица. ord=1 означает уникальность первой колонки. value = название таблицы.'
  },
  {
    name: 'Колоночный тип',
    condition: 'type = базовый, up = 0',
    description: 'Ссылка на колонку. Пустая таблица, которая станет колонкой при добавлении к родителю.'
  },
  {
    name: 'Колонка со ссылкой',
    condition: 'type = таблица, up = 0',
    description: 'Select/multiselect колонка. type указывает на справочник, из которого выбираются значения.'
  },
  {
    name: 'Подтаблица',
    condition: 'type = базовый, up = 0, есть колонки',
    description: 'Колоночный тип с собственными колонками. Вложенная таблица внутри родительской.'
  },
  {
    name: 'Колонка таблицы',
    condition: 'up = ID таблицы',
    description: 'Реквизит (свойство) таблицы. type = колоночный тип, ord = порядок, value = доп. настройки (:!NULL:).'
  },
  {
    name: 'Строка таблицы',
    condition: 'type = таблица, up = 1',
    description: 'Запись в таблице. up=1 означает подчинение ROOT. value = значение первой ячейки.'
  },
  {
    name: 'Ячейка (простая)',
    condition: 'up = строка, type = колонка',
    description: 'Значение в ячейке таблицы. value содержит данные ячейки.'
  },
  {
    name: 'Ячейка (select)',
    condition: 'up = строка, type = строка справочника',
    description: 'Ссылка на строку другой таблицы. type = ID выбранной строки, value = ID колонки.'
  },
  {
    name: 'Строка подтаблицы',
    condition: 'up = строка, type = подтаблица',
    description: 'Вложенная запись. Находится в ячейке на пересечении строки up и колонки type.'
  }
]

// Methods
function openPlayground(command) {
  // Only REST API commands can be tested in playground
  if (!command.method) {
    toast.add({
      severity: 'info',
      summary: 'MCP Tool',
      detail: 'MCP инструменты используются через Claude Code, а не через REST API',
      life: 4000
    })
    return
  }

  sections.value.playground = true
  playground.value.method = command.method.toUpperCase()
  playground.value.endpoint = command.cmd.replace('/{id}', '/123').replace('/{typeId}', '/18').replace('/{reqId}', '/100')

  // Заполняем параметры из exampleBody
  if (command.exampleBody && typeof command.exampleBody === 'object') {
    playground.value.params = Object.entries(command.exampleBody).map(([key, value]) => ({
      key,
      value: String(value),
      enabled: true
    }))
  } else if (playground.value.method === 'POST') {
    // Если нет примера, создаём один пустой параметр
    playground.value.params = [{ key: '', value: '', enabled: true }]
  }

  // Прокручиваем к секции Playground
  setTimeout(() => {
    // Ищем секцию Playground по тексту заголовка
    const headers = document.querySelectorAll('.section-header')
    const playgroundHeader = Array.from(headers).find(h => h.textContent.includes('Playground'))
    if (playgroundHeader) {
      playgroundHeader.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, 100)
}

async function executePlayground() {
  if (!isAuthenticated.value) {
    toast.add({ severity: 'warn', summary: 'Внимание', detail: 'Требуется авторизация', life: 3000 })
    return
  }

  playgroundLoading.value = true
  playgroundResult.value = null
  const startTime = performance.now()

  try {
    let result
    if (playground.value.method === 'GET') {
      result = await integramApiClient.get(playground.value.endpoint)
    } else {
      // Собираем body из параметров (только enabled)
      const body = {}
      playground.value.params
        .filter(param => param.enabled && param.key.trim())
        .forEach(param => {
          body[param.key.trim()] = param.value.trim()
        })

      result = await integramApiClient.post(playground.value.endpoint, body)
    }

    playgroundResult.value = {
      status: 200,
      time: Math.round(performance.now() - startTime),
      data: result
    }
  } catch (error) {
    playgroundResult.value = {
      status: error.response?.status || 500,
      time: Math.round(performance.now() - startTime),
      data: { error: error.message }
    }
  } finally {
    playgroundLoading.value = false
  }
}

function resetPlayground() {
  playground.value = {
    method: 'GET',
    endpoint: 'dict',
    params: [
      { key: '', value: '', enabled: true }
    ]
  }
  playgroundResult.value = null
}

// Управление параметрами
function addParam() {
  playground.value.params.push({ key: '', value: '', enabled: true })
}

function removeParam(index) {
  if (playground.value.params.length > 1) {
    playground.value.params.splice(index, 1)
  }
}

function toggleParam(index) {
  playground.value.params[index].enabled = !playground.value.params[index].enabled
}

function formatJSON(data) {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function formatExampleBody(body) {
  if (typeof body === 'string') {
    return body
  }
  if (typeof body === 'object') {
    // Format as JSON for better readability
    return JSON.stringify(body, null, 2)
  }
  return String(body)
}

function formatParams(params) {
  if (!params || params === 'Нет параметров') {
    return '<span class="text-color-secondary">Нет параметров</span>'
  }

  // Format parameters with styling:
  // - {variable} → <code class="param-var">{variable}</code>
  // - parameter — description → <strong>parameter</strong> — description

  let formatted = params
    // Highlight variables in curly braces
    .replace(/\{([^}]+)\}/g, '<code class="param-var">{$1}</code>')
    // Make parameter names bold (before — or :)
    .replace(/^(\w+)(\s*[—:])/gm, '<strong>$1</strong>$2')
    // Highlight macro values in square brackets
    .replace(/\[([A-Z_]+)\]/g, '<code class="param-macro">[$1]</code>')
    // Make sure newlines are preserved
    .replace(/\n/g, '<br>')

  return `<div class="params-formatted">${formatted}</div>`
}

function toggleRowExpansion(event) {
  const rowData = event.data
  const key = rowData.cmd

  if (expandedRows.value[key]) {
    // Строка уже раскрыта - закрываем
    delete expandedRows.value[key]
  } else {
    // Строка закрыта - раскрываем
    expandedRows.value[key] = true
  }
}

function copyResponse() {
  if (playgroundResult.value) {
    navigator.clipboard.writeText(formatJSON(playgroundResult.value.data))
    toast.add({ severity: 'success', summary: 'Скопировано', life: 2000 })
  }
}

onMounted(() => {
  // Nothing to load initially
})
</script>

<style scoped>
.integram-api-docs {
  /* Container provided by parent */
}

/* Section styling (like categories in dict) */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--surface-border);
  cursor: pointer;
  user-select: none;
}

.section-header:hover {
  background: var(--surface-hover);
  margin: 0 -1rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
}

.section-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--primary-color);
  display: flex;
  align-items: center;
}

.section-chevron {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.section-content {
  padding: 1rem 0;
}

/* Category navigation */
.category-nav {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

/* Stats cards */
.stat-card {
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 1.25rem;
  text-align: center;
  transition: all 0.2s ease;
}

.stat-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 2rem;
  font-weight: 600;
  color: var(--primary-color);
}

.stat-label {
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
  font-size: 0.875rem;
}

/* Info block */
.info-block {
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 1rem;
}

.info-block h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

/* Code styling */
code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875rem;
}

.code-inline {
  background: var(--surface-100);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
}

.cmd-code {
  color: var(--primary-color);
  font-weight: 500;
}

.code-block {
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 1rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tables */
.commands-table :deep(.p-datatable-thead > tr > th) {
  padding: 0.75rem 1rem;
  font-weight: 600;
}

.commands-table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.625rem 1rem;
}

/* Accordion */
:deep(.p-accordion-header-link) {
  padding: 0.875rem 1rem;
}

:deep(.p-accordion-content) {
  padding: 1rem;
}

:deep(.p-accordionpanel) {
  margin-bottom: 0.25rem;
}

/* Form fields */
.field {
  margin-bottom: 1rem;
}

.field > label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
}

/* Icon field */
:deep(.p-iconfield .p-inputicon) {
  top: 50% !important;
}

/* Grid */
.grid {
  margin: -0.5rem;
}

.grid > [class*="col"] {
  padding: 0.5rem;
}

/* Commands Table - Larger Rows */
.commands-table :deep(.p-datatable-tbody > tr > td) {
  padding: 1rem 0.75rem !important;
  font-size: 0.95rem !important;
  height: auto !important;
}

.commands-table :deep(.p-datatable-tbody > tr) {
  height: 60px !important;
  cursor: pointer;
  transition: background-color 0.2s;
}

.commands-table :deep(.p-datatable-tbody > tr:hover) {
  background-color: var(--surface-hover) !important;
}

.commands-table :deep(.p-datatable-thead > tr > th) {
  padding: 1rem 0.75rem !important;
  font-size: 0.95rem !important;
}

/* Expansion Content */
.expansion-content {
  padding: 1.5rem;
  background: var(--surface-ground);
  border-top: 1px solid var(--surface-border);
}

.expansion-content h4 {
  color: var(--primary-color);
  font-weight: 600;
  font-size: 1rem;
}

/* Parameters Formatting */
.params-block {
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--text-color-secondary);
}

.params-formatted strong {
  color: var(--text-color);
  font-weight: 600;
}

.param-var {
  background: var(--surface-card);
  color: var(--primary-color);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
  border: 1px solid var(--surface-border);
}

.param-macro {
  background: var(--surface-card);
  color: var(--orange-500);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
  border: 1px solid var(--surface-border);
}

.example-block {
  margin-bottom: 1rem;
}

.example-label {
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-block {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: auto;
}

.code-block pre {
  margin: 0;
  padding: 1rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Main Card Styling (like /integram/dict) */
.api-docs-card {
  border: 1px solid var(--surface-border);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.api-docs-card :deep(.p-card-title) {
  font-size: 1.5rem;
  font-weight: 600;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.api-docs-card :deep(.p-card-body) {
  padding: 1.5rem;
}

.api-docs-card :deep(.p-card-content) {
  padding-top: 1.5rem;
}

/* Playground Styling */
.playground-textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  padding: 0.75rem;
  line-height: 1.6;
}

.playground-textarea:focus {
  background: var(--surface-0);
}

/* Request Body Editor */
.request-body-editor {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
}

.editor-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.editor-label i {
  color: var(--primary-color);
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.editor-actions .p-button {
  width: 2rem;
  height: 2rem;
}

.request-body-textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 0.875rem !important;
  background: var(--surface-0) !important;
  border: none !important;
  padding: 1rem !important;
  line-height: 1.8 !important;
  resize: vertical;
  min-height: 180px;
  box-shadow: none !important;
}

.request-body-textarea:focus {
  background: var(--surface-0) !important;
  box-shadow: none !important;
  outline: none !important;
}

.request-body-textarea::placeholder {
  color: var(--text-color-secondary);
  opacity: 0.6;
}

.editor-footer {
  padding: 0.625rem 0.875rem;
  background: var(--surface-50);
  border-top: 1px solid var(--surface-border);
}

.example-param {
  background: var(--primary-50);
  color: var(--primary-color);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8rem;
  font-weight: 500;
}

/* Params Editor (Postman-style) */
.params-editor {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.params-header {
  display: grid;
  grid-template-columns: 40px 1fr 1fr 40px;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
}

.params-body {
  max-height: 300px;
  overflow-y: auto;
  background: var(--surface-0);
}

.param-row {
  display: grid;
  grid-template-columns: 40px 1fr 1fr 40px;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  align-items: center;
  transition: background-color 0.15s;
}

.param-row:hover {
  background: var(--surface-50);
}

.param-row:last-child {
  border-bottom: none;
}

.param-row.param-disabled {
  opacity: 0.5;
}

.param-row.param-disabled:hover {
  background: transparent;
}

.param-col-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
}

.param-col-key,
.param-col-value {
  display: flex;
  align-items: center;
}

.param-col-actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.param-col-actions .p-button {
  width: 2rem;
  height: 2rem;
}

.param-input {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 0.875rem !important;
  width: 100%;
  padding: 0.5rem !important;
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 4px !important;
  transition: all 0.15s;
}

.param-input:hover:not(:disabled) {
  background: var(--surface-card) !important;
  border-color: var(--surface-border) !important;
}

.param-input:focus {
  background: var(--surface-card) !important;
  border-color: var(--primary-color) !important;
  box-shadow: 0 0 0 1px var(--primary-color) !important;
}

.param-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.param-input::placeholder {
  color: var(--text-color-secondary);
  opacity: 0.5;
  font-style: italic;
}

.params-footer {
  padding: 0.625rem 0.75rem;
  background: var(--surface-50);
  border-top: 1px solid var(--surface-border);
}

.params-footer .p-button {
  font-size: 0.875rem;
}

/* Response Viewer */
.response-viewer {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.response-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.response-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.response-status i {
  color: var(--green-500);
}

.response-status i.pi-times-circle {
  color: var(--red-500);
}

.response-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.response-meta .p-button {
  width: 2rem;
  height: 2rem;
}

.response-body {
  flex: 1;
  overflow: auto;
  max-height: 450px;
  background: var(--surface-0);
}

.response-json {
  margin: 0;
  padding: 1rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.8;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.response-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  background: var(--surface-50);
  color: var(--text-color-secondary);
  flex: 1;
}

.response-empty i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.4;
  color: var(--primary-color);
}

.response-empty p {
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  font-weight: 500;
}

.playground-result {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: auto;
  max-height: 500px;
}

.playground-result pre {
  margin: 0;
  padding: 0.75rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-color);
}

.playground-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  color: var(--text-color-secondary);
}

.playground-empty i {
  font-size: 3rem;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

.playground-empty p {
  margin: 0;
  font-size: 0.875rem;
}

/* Example Steps Styling */
.example-steps {
  padding: 0.5rem 0;
}

.example-step {
  padding: 1rem;
  background: var(--surface-ground);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--primary-color);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 0.875rem;
}

.step-title {
  font-weight: 600;
  color: var(--text-color);
  font-size: 1rem;
}

.request-label,
.response-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
  margin-bottom: 0.5rem;
}

.code-block.response {
  background: var(--surface-ground);
  border-left: 3px solid var(--green-500);
}

.http-method {
  color: var(--blue-500);
  font-weight: 700;
}

.http-method.get {
  color: var(--green-500);
}

.http-method.delete {
  color: var(--red-500);
}

.http-path {
  color: var(--text-color);
}

.param-key {
  color: var(--primary-color);
  font-weight: 600;
}

/* HTTP Request Block Styling */
.http-request-block {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
}

.http-line {
  padding: 0.75rem 1rem;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
}

.http-header {
  padding: 0.5rem 1rem;
  background: var(--surface-50);
  border-bottom: 1px solid var(--surface-border);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8rem;
}

.header-name {
  color: var(--text-color-secondary);
  font-weight: 600;
}

.header-value {
  color: var(--orange-500);
  margin-left: 0.5rem;
}

.http-body {
  padding: 0.75rem 1rem;
}

.body-param {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.8;
  display: flex;
  align-items: baseline;
}

.body-param .param-key {
  color: var(--primary-color);
  font-weight: 600;
  min-width: 80px;
}

.body-param .param-equals {
  color: var(--text-color-secondary);
  margin: 0 0.5rem;
}

.body-param .param-value {
  color: var(--text-color);
}

/* Step Circle and Content */
.step-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--primary-color);
  color: white;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.9rem;
  flex-shrink: 0;
  margin-right: 0.75rem;
}

.example-step {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-color);
  margin-bottom: 0.75rem;
}

.code-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
  margin-bottom: 0.5rem;
  display: block;
}

/* MCP Code Block Styling */
.mcp-code-block {
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.mcp-code-block:last-child {
  margin-bottom: 0;
}

.mcp-code {
  margin: 0;
  padding: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.mcp-function {
  color: var(--purple-500);
  font-weight: 600;
}

.mcp-key {
  color: var(--primary-color);
}

.mcp-string {
  color: var(--green-600);
}

.mcp-number {
  color: var(--orange-500);
}

.mcp-boolean {
  color: var(--blue-600);
  font-weight: 600;
}

.mcp-comment {
  color: var(--text-color-secondary);
  font-style: italic;
}

/* JavaScript Code Block Styling */
.js-code-block {
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.js-code-block:last-child {
  margin-bottom: 0;
}

.js-code {
  margin: 0;
  padding: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.js-keyword {
  color: var(--purple-500);
  font-weight: 600;
}

.js-function {
  color: var(--blue-500);
  font-weight: 600;
}

.js-string {
  color: var(--green-600);
}

.js-number {
  color: var(--orange-500);
}

.js-key {
  color: var(--primary-color);
}

/* JSON Code Block Styling */
.json-code-block {
  background: var(--surface-ground);
  border: 1px solid var(--green-900);
  border-left: 3px solid var(--green-500);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.json-code-block:last-child {
  margin-bottom: 0;
}

.json-code {
  margin: 0;
  padding: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.json-key {
  color: var(--primary-color);
  font-weight: 600;
}

.json-string {
  color: var(--green-600);
}

.json-number {
  color: var(--orange-500);
}

.json-null {
  color: var(--text-color-secondary);
  font-style: italic;
}

.json-comment {
  color: var(--text-color-secondary);
  font-style: italic;
}

/* Responsive */
@media (max-width: 768px) {
  .stat-card {
    padding: 1rem;
  }

  .stat-value {
    font-size: 1.5rem;
  }

  .expansion-content {
    padding: 1rem;
  }

  .code-block pre {
    font-size: 0.75rem;
  }

  .example-step {
    padding: 0.75rem;
  }

  .step-number {
    width: 24px;
    height: 24px;
    font-size: 0.75rem;
  }
}
</style>
