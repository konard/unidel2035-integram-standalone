<template>
  <div class="integram-type-editor integram-touch-friendly">
    <Card class="mb-3">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Структура</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <SelectButton
              v-model="viewMode"
              :options="viewModeOptions"
              optionLabel="icon"
              optionValue="value"
              :allowEmpty="false"
              class="view-toggle"
            >
              <template #option="{ option }">
                <i :class="option.icon" v-tooltip.top="option.label"></i>
              </template>
            </SelectButton>
          </div>
        </div>
      </template>
      <template #content>

    <!-- Legacy View (SVG lines on hover) - Default -->
    <div v-if="viewMode === 'legacy'" class="legacy-view-container">
      <IntegramSchemaLegacy
        :types-data="typesList"
        @open-table="handleOpenTable"
        @edit-type="handleEditType"
      />
    </div>

    <!-- Tree View -->
    <div v-else-if="viewMode === 'tree'" class="tree-view-container">
      <IntegramSchemaTree
        :types-data="typesList"
        @open-table="handleOpenTable"
        @edit-type="handleEditType"
      />
    </div>

    <!-- List View -->
    <div v-else-if="viewMode === 'list'">

    <!-- Badge Legend -->
    <div class="integram-badge-legend mb-3">
      <div class="legend-item">
        <Tag severity="info" value="Уникальный" />
        <span class="legend-label">— первый столбец уникален</span>
      </div>
      <div class="legend-item">
        <Badge value="Служебный" severity="secondary" />
        <span class="legend-label">— системный тип</span>
      </div>
      <div class="legend-item">
        <Badge value="Простой" />
        <span class="legend-label">— базовый тип данных</span>
      </div>
      <div class="legend-item">
        <Badge value="5" severity="secondary" />
        <span class="legend-label">— количество реквизитов</span>
      </div>
    </div>

    <!-- Create New Type Panel -->
    <Panel header="Добавить тип" class="mb-2">
      <div class="grid">
        <div class="col-12 md:col-4">
          <div class="field">
            <label for="newTypeName">Название типа *</label>
            <InputText
              id="newTypeName"
              v-model="newType.name"
              placeholder="Новый тип"
              class="w-full"
              @keyup="filterExistingTypes"
            />
          </div>
        </div>

        <div class="col-12 md:col-3">
          <div class="field">
            <label for="baseType">Базовый тип *</label>
            <Select
              id="baseType"
              v-model="newType.baseType"
              :options="baseTypes"
              optionLabel="label"
              optionValue="value"
              placeholder="Выберите базовый тип"
              class="w-full"
            >
              <template #option="{ option }">
                <div>
                  <strong>{{ option.label }}</strong>
                  <div class="text-sm text-color-secondary">{{ option.description }}</div>
                </div>
              </template>
            </Select>
          </div>
        </div>

        <div class="col-12 md:col-2 flex align-items-end pb-3">
          <div class="flex align-items-center gap-2">
            <Checkbox
              id="newTypeUnique"
              v-model="newType.unique"
              :binary="true"
            />
            <label for="newTypeUnique">Уникальный</label>
          </div>
        </div>

        <div class="col-12 md:col-3 flex align-items-end">
          <Button
            icon="pi pi-plus"
            label="Добавить"
            @click="createType"
            :loading="loading.create"
            :disabled="!canCreateType"
            class="w-full"
            aria-label="Добавить новый тип"
          />
        </div>
      </div>

      <!-- Base Type Info -->
      <Panel header="Описание базовых типов" :toggleable="true" :collapsed="true" class="mt-3">
        <DataTable :value="baseTypesAll" stripedRows>
          <Column field="label" header="Тип" style="width: 150px">
            <template #body="{ data }">
              <span :class="{ 'text-color-secondary': data.hidden }">{{ data.label }}</span>
              <Tag v-if="data.hidden" value="системный" severity="secondary" class="ml-2" style="font-size: 0.7rem" />
            </template>
          </Column>
          <Column field="description" header="Описание"></Column>
          <Column field="example" header="Пример" style="width: 200px">
            <template #body="{ data }">
              <code v-if="data.example">{{ data.example }}</code>
            </template>
          </Column>
        </DataTable>
      </Panel>
    </Panel>

    <!-- Search/Filter Types -->
    <Panel header="Поиск типов" :toggleable="true" :collapsed="collapseSearch" class="mb-2">
      <div class="flex gap-2 align-items-center flex-wrap">
        <IconField iconPosition="left" class="flex-1">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="searchQuery"
            placeholder="Поиск по названию типа..."
            class="w-full"
            @input="filterTypes"
            aria-label="Поиск типов"
          />
        </IconField>
        <Button
          icon="pi pi-times"
          label="Очистить"
          @click="clearSearch"
          severity="secondary"
          outlined
          aria-label="Очистить поиск"
        />
        <div class="integram-actions">
          <Button
            :label="showService ? 'Скрыть служебные' : 'Показать служебные'"
            @click="toggleServiceTypes"
            outlined
            aria-label="Переключить отображение служебных типов"
          />
          <Button
            :label="showSimple ? 'Скрыть простые' : 'Показать простые'"
            @click="toggleSimpleTypes"
            outlined
            aria-label="Переключить отображение простых типов"
          />
        </div>
      </div>
    </Panel>

    <!-- Types List -->
    <Panel header="Типы данных" class="mb-3">
      <div v-if="loading.list" class="flex justify-content-center p-5">
        <ProgressSpinner />
      </div>

      <div v-else class="types-list">
        <div v-for="type in filteredTypes" :key="type.id" class="type-card mb-3" :data-type-id="type.id">
          <Card>
            <template #title>
              <div class="flex justify-content-between align-items-center">
                <div class="flex align-items-center gap-2 flex-wrap">
                  <Tag v-if="type.unique" severity="info" value="Уникальный" />
                  <span class="font-bold">{{ type.name }}</span>
                  <Badge v-if="type.isService" value="Служебный" severity="secondary" />
                  <Badge v-if="type.isSimple" value="Простой" />
                  <!-- Requisites summary like legacy: shortИмя referenceТип (ТипНазвание) -->
                  <span
                    v-for="req in (type.requisites || []).slice(0, 5)"
                    :key="req.id"
                    class="requisite-chip"
                    :class="{ 'ref-chip': req.isReference }"
                    :title="req.refTypeName ? `Ссылка на: ${req.refTypeName}` : req.type"
                  >
                    <span class="chip-type">{{ req.type }}</span>{{ req.name }}
                    <span v-if="req.refTypeName" class="ref-name">({{ req.refTypeName }})</span>
                  </span>
                  <span v-if="(type.requisites || []).length > 5" class="text-color-secondary text-sm">
                    +{{ type.requisites.length - 5 }} ещё
                  </span>
                </div>
                <div class="flex gap-2 align-items-center">
                  <Badge v-if="type.requisites?.length" :value="type.requisites.length" severity="secondary" />
                  <Button
                    :icon="expandedTypes.includes(type.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                    @click="toggleTypeExpansion(type.id)"
                    text
                    rounded
                  />
                </div>
              </div>
            </template>

            <template #content>
              <div v-if="expandedTypes.includes(type.id)">
                <!-- Type Info -->
                <div class="grid mb-3">
                  <div class="col-12 md:col-4">
                    <span class="font-semibold">ID:</span> <code>{{ type.id }}</code>
                  </div>
                  <div class="col-12 md:col-4">
                    <span class="font-semibold">Базовый тип:</span> {{ getBaseTypeName(type.baseType) }}
                  </div>
                  <div class="col-12 md:col-4">
                    <span class="font-semibold">Реквизитов:</span> {{ (type.requisites || []).length }}
                  </div>
                </div>

                <Divider />

                <!-- Actions -->
                <div class="integram-actions mb-3">
                  <Button
                    icon="pi pi-pencil"
                    label="Редактировать тип"
                    @click="editType(type)"
                    outlined
                    aria-label="Редактировать тип"
                  />
                  <Button
                    icon="pi pi-eye"
                    label="Просмотр таблицы"
                    @click="viewTable(type.id)"
                    outlined
                    aria-label="Открыть таблицу"
                  />
                  <Button
                    icon="pi pi-sitemap"
                    label="Создать подчинённый"
                    @click="showSubordinateTypeDialog(type)"
                    outlined
                    severity="secondary"
                    aria-label="Создать подчинённый тип"
                    v-tooltip.top="'Создать подчинённый тип (таблица со ссылкой на родителя)'"
                  />
                  <Button
                    icon="pi pi-link"
                    label="Создать ссылку"
                    @click="createReferenceToType(type)"
                    outlined
                    severity="secondary"
                    aria-label="Создать ссылку на этот тип"
                    v-tooltip.top="'Использовать этот тип как справочник (добавить колонку-ссылку в другой таблице)'"
                  />
                  <!-- Кнопка удаления визуально отделена (margin-left: auto в CSS) -->
                  <Button
                    v-if="!type.hasReferences"
                    icon="pi pi-trash"
                    label="Удалить тип"
                    @click="confirmDeleteType(type)"
                    severity="danger"
                    outlined
                    aria-label="Удалить тип"
                  />
                </div>

                <!-- Requisites Panel -->
                <Panel header="Реквизиты (колонки)" class="requisites-panel">
                  <template #header>
                    <div class="flex justify-content-between align-items-center w-full">
                      <span>Реквизиты (колонки)</span>
                      <Button
                        icon="pi pi-plus"
                        label="Добавить реквизит"
                        @click="showAddRequisiteDialog(type)"
                        aria-label="Добавить новый реквизит"
                      />
                    </div>
                  </template>

                  <div v-if="type.requisites && type.requisites.length > 0">
                    <DataTable :value="type.requisites" stripedRows>
                      <Column field="order" header="#" style="width: 50px">
                        <template #body="{ index }">
                          {{ index + 1 }}
                        </template>
                      </Column>

                      <Column field="name" header="Название"></Column>

                      <Column field="type" header="Тип">
                        <template #body="{ data }">
                          <span :class="{ 'text-orange-600': data.isReference }">
                            {{ data.type }}
                            <span v-if="data.refTypeName" class="text-sm ml-1">
                              → {{ data.refTypeName }}
                            </span>
                          </span>
                        </template>
                      </Column>

                      <Column field="attributes" header="Атрибуты">
                        <template #body="{ data }">
                          <div class="flex gap-1">
                            <Tag v-if="data.nullable === false" severity="warning" value="NOT NULL" />
                            <Tag v-if="data.multi" severity="info" value="MULTI" />
                            <Tag v-if="data.alias" value="ALIAS" />
                          </div>
                        </template>
                      </Column>

                      <Column header="Действия" style="width: 180px">
                        <template #body="{ data }">
                          <div class="integram-actions">
                            <Button
                              icon="pi pi-arrow-up"
                              @click="moveRequisiteUp(type, data)"
                              text
                              rounded
                              v-tooltip.top="'Переместить выше'"
                              aria-label="Переместить реквизит выше"
                            />
                            <Button
                              icon="pi pi-arrow-down"
                              @click="moveRequisiteDown(type, data)"
                              text
                              rounded
                              v-tooltip.top="'Переместить ниже'"
                              aria-label="Переместить реквизит ниже"
                            />
                            <Button
                              icon="pi pi-pencil"
                              @click="editRequisite(type, data)"
                              text
                              rounded
                              v-tooltip.top="'Редактировать'"
                              aria-label="Редактировать реквизит"
                            />
                            <!-- Кнопка удаления визуально отделена -->
                            <Button
                              icon="pi pi-trash"
                              @click="confirmDeleteRequisite(type, data)"
                              severity="danger"
                              text
                              rounded
                              v-tooltip.top="'Удалить'"
                              aria-label="Удалить реквизит"
                              class="ml-auto"
                            />
                          </div>
                        </template>
                      </Column>
                    </DataTable>
                  </div>
                  <div v-else class="text-center p-4 text-color-secondary">
                    Реквизитов пока нет. Добавьте первый реквизит.
                  </div>
                </Panel>
              </div>
            </template>
          </Card>
        </div>

        <div v-if="filteredTypes.length === 0" class="text-center p-5 text-color-secondary">
          Типы не найдены
        </div>
      </div>
    </Panel>
    </div><!-- Close List View v-else -->
      </template>
    </Card>

    <!-- Add/Edit Requisite Dialog -->
    <Dialog
      v-model:visible="requisiteDialog.visible"
      :header="requisiteDialog.mode === 'add' ? 'Добавить реквизит' : 'Редактировать реквизит'"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="reqName">Название реквизита *</label>
          <InputText
            id="reqName"
            v-model="requisiteDialog.data.name"
            placeholder="Название"
            class="w-full"
          />
        </div>

        <div class="field">
          <label for="reqType">Тип данных *</label>
          <Select
            id="reqType"
            v-model="requisiteDialog.data.type"
            :options="requisiteTypes"
            optionLabel="label"
            optionValue="value"
            placeholder="Выберите тип"
            class="w-full"
          />
        </div>

        <!-- Hide nullable/multi for CALCULATABLE - they don't apply to computed fields -->
        <div v-if="requisiteDialog.data.type !== 'CALCULATABLE'" class="field-checkbox">
          <Checkbox
            id="reqNullable"
            v-model="requisiteDialog.data.nullable"
            :binary="true"
          />
          <label for="reqNullable" class="ml-2">Разрешить NULL (может быть пустым)</label>
        </div>

        <div v-if="requisiteDialog.data.type !== 'CALCULATABLE'" class="field-checkbox">
          <Checkbox
            id="reqMulti"
            v-model="requisiteDialog.data.multi"
            :binary="true"
          />
          <label for="reqMulti" class="ml-2">MULTI (множественное значение)</label>
        </div>

        <div class="field">
          <label for="reqAlias">ALIAS (псевдоним)</label>
          <InputText
            id="reqAlias"
            v-model="requisiteDialog.data.alias"
            placeholder="Псевдоним (опционально)"
            class="w-full"
          />
        </div>

        <div class="field">
          <label for="reqDefault">
            {{ requisiteDialog.data.type === 'CALCULATABLE' ? 'Формула (обязательно) *' : 'Значение по умолчанию' }}
          </label>

          <!-- For CALCULATABLE - prominent formula selector -->
          <div v-if="requisiteDialog.data.type === 'CALCULATABLE'" class="flex flex-column gap-2">
            <Select
              v-model="requisiteDialog.data.defaultValue"
              :options="getDefaultMacros('CALCULATABLE').filter(o => !o.disabled)"
              optionLabel="label"
              optionValue="value"
              placeholder="Выберите формулу"
              class="w-full"
              :class="{ 'p-invalid': !requisiteDialog.data.defaultValue }"
            />
            <div class="p-3 surface-ground border-round">
              <div class="flex align-items-center gap-2 mb-2">
                <i class="pi pi-info-circle text-primary"></i>
                <span class="font-semibold">CALCULATABLE:</span>
              </div>
              <ul class="m-0 pl-4 text-sm">
                <li>Значение вычисляется <strong>один раз</strong> при создании записи</li>
                <li>Поле <strong>нельзя редактировать</strong> (read-only)</li>
                <li>Пример: [TODAY] → "{{ new Date().toLocaleDateString('ru-RU') }}"</li>
              </ul>
            </div>
          </div>

          <!-- For other types - text input with optional macro dropdown -->
          <div v-else class="flex gap-2">
            <InputText
              id="reqDefault"
              v-model="requisiteDialog.data.defaultValue"
              placeholder="Значение или макрос"
              class="flex-grow-1"
            />
            <Select
              v-if="getDefaultMacros(requisiteDialog.data.type).length > 0"
              :options="getDefaultMacros(requisiteDialog.data.type)"
              optionLabel="label"
              optionValue="value"
              placeholder="Макросы"
              @change="(e) => requisiteDialog.data.defaultValue = e.value"
              class="w-12rem"
            />
          </div>
          <small class="text-color-secondary" v-if="requisiteDialog.data.type !== 'CALCULATABLE' && getDefaultMacros(requisiteDialog.data.type).length > 0">
            Выберите макрос из списка или введите значение вручную
          </small>
        </div>
      </div>

      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="requisiteDialog.visible = false"
            text
            aria-label="Отменить"
          />
          <Button
            :label="requisiteDialog.mode === 'add' ? 'Добавить' : 'Сохранить'"
            icon="pi pi-check"
            @click="saveRequisite"
            :disabled="!requisiteDialog.data.name || !requisiteDialog.data.type || (requisiteDialog.data.type === 'CALCULATABLE' && !requisiteDialog.data.defaultValue)"
            aria-label="Сохранить реквизит"
          />
        </div>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      v-model:visible="deleteDialog.visible"
      header="Подтверждение удаления"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex align-items-center gap-3">
        <i class="pi pi-exclamation-triangle text-4xl text-warning"></i>
        <span>
          Вы уверены, что хотите удалить <strong>{{ deleteDialog.itemName }}</strong>?
        </span>
      </div>
      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="deleteDialog.visible = false"
            text
            aria-label="Отменить удаление"
          />
          <Button
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            @click="executeDelete"
            aria-label="Подтвердить удаление"
          />
        </div>
      </template>
    </Dialog>

    <!-- Create Subordinate Type Dialog -->
    <Dialog
      v-model:visible="subordinateTypeDialog.visible"
      header="Создать подчинённый тип"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="p-3 surface-ground border-round">
          <div class="flex align-items-center gap-2 mb-2">
            <i class="pi pi-info-circle text-primary"></i>
            <span class="font-semibold">Родительский тип:</span>
          </div>
          <div class="text-lg">{{ subordinateTypeDialog.parentType?.name }}</div>
          <small class="text-color-secondary">
            Подчинённый тип будет связан с записями родительского типа
          </small>
        </div>

        <div class="field">
          <label for="subordinateTypeName">Название подчинённого типа *</label>
          <InputText
            id="subordinateTypeName"
            v-model="subordinateTypeDialog.name"
            placeholder="Например: Детали заказа"
            class="w-full"
            @keyup.enter="createSubordinateType"
          />
        </div>

        <div class="field-checkbox">
          <Checkbox
            id="subordinateTypeUnique"
            v-model="subordinateTypeDialog.unique"
            :binary="true"
          />
          <label for="subordinateTypeUnique" class="ml-2">Уникальный (первый столбец)</label>
        </div>
      </div>

      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="subordinateTypeDialog.visible = false"
            text
            aria-label="Отменить"
          />
          <Button
            label="Создать"
            icon="pi pi-plus"
            @click="createSubordinateType"
            :disabled="!subordinateTypeDialog.name"
            :loading="loading.createSubordinate"
            aria-label="Создать подчинённый тип"
          />
        </div>
      </template>
    </Dialog>

    <!-- Edit Type Dialog -->
    <Dialog
      v-model:visible="editTypeDialog.visible"
      header="Редактировать тип"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="p-3 surface-ground border-round">
          <div class="flex align-items-center gap-2 mb-2">
            <i class="pi pi-pencil text-primary"></i>
            <span class="font-semibold">Редактирование типа:</span>
          </div>
          <div class="text-lg">{{ editTypeDialog.originalName }}</div>
          <small class="text-color-secondary">
            ID: {{ editTypeDialog.type?.id }}
          </small>
        </div>

        <div class="field">
          <label for="editTypeName">Название типа *</label>
          <InputText
            id="editTypeName"
            v-model="editTypeDialog.name"
            placeholder="Название типа"
            class="w-full"
            @keyup.enter="saveEditedType"
          />
        </div>

        <div class="field-checkbox">
          <Checkbox
            id="editTypeUnique"
            v-model="editTypeDialog.unique"
            :binary="true"
          />
          <label for="editTypeUnique" class="ml-2">Уникальный (первый столбец)</label>
        </div>

        <Message severity="info" :closable="false" class="mt-2">
          <small>
            Базовый тип нельзя изменить после создания. Для изменения базового типа
            создайте новый тип и перенесите данные.
          </small>
        </Message>
      </div>

      <template #footer>
        <div class="integram-actions justify-content-end w-full">
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="editTypeDialog.visible = false"
            text
            aria-label="Отменить"
          />
          <Button
            label="Сохранить"
            icon="pi pi-check"
            @click="saveEditedType"
            :disabled="!editTypeDialog.name"
            :loading="loading.editType"
            aria-label="Сохранить изменения"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import integramApiClient from '@/services/integramApiClient';
import IntegramSchemaLegacy from './IntegramSchemaLegacy.vue';
import IntegramSchemaTree from './IntegramSchemaTree.vue';

const props = defineProps({
  session: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['view-table', 'refresh']);

const toast = useToast();

// View mode - default to 'legacy' (connections view)
const viewMode = ref('legacy');
const viewModeOptions = [
  { value: 'legacy', label: 'Связи', icon: 'pi pi-share-alt' },
  { value: 'tree', label: 'Дерево', icon: 'pi pi-sitemap' },
  { value: 'list', label: 'Список', icon: 'pi pi-list' }
];

// Base types (all types including hidden system types)
const baseTypesAll = [
  { value: 'SHORT', label: 'SHORT', description: 'Короткая строка (до 127 символов)', example: 'Интеграл' },
  { value: 'CHARS', label: 'CHARS', description: 'Строка без ограничения длины', example: '' },
  { value: 'DATE', label: 'DATE', description: 'Дата', example: '30.10.2019' },
  { value: 'NUMBER', label: 'NUMBER', description: 'Целое число', example: '100500' },
  { value: 'SIGNED', label: 'SIGNED', description: 'Число с десятичной частью', example: '12.50' },
  { value: 'BOOLEAN', label: 'BOOLEAN', description: 'Логическое значение (Да/Нет)', example: 'true' },
  { value: 'MEMO', label: 'MEMO', description: 'Многострочный текст', example: '' },
  { value: 'DATETIME', label: 'DATETIME', description: 'Дата и время', example: '05.11.2019 13:35:40' },
  { value: 'FILE', label: 'FILE', description: 'Файл', example: 'document.pdf' },
  { value: 'HTML', label: 'HTML', description: 'HTML-текст', example: '<span>777</span>' },
  { value: 'BUTTON', label: 'BUTTON', description: 'Действие (кнопка) над записью', example: '' },
  { value: 'PWD', label: 'PWD', description: 'Пароль (маскируется)', example: '******' },
  { value: 'GRANT', label: 'GRANT', description: 'Объект системы (выбор из таблиц)', example: '', hidden: true },
  { value: 'CALCULATABLE', label: 'CALCULATABLE', description: 'Вычисляемое поле (read-only, автозаполнение)', example: '[TODAY], [USER]' },
  { value: 'REPORT_COLUMN', label: 'REPORT_COLUMN', description: 'Колонка запроса', example: '', hidden: true },
  { value: 'PATH', label: 'PATH', description: 'Путь к файлу', example: '/path/to/file' },
  { value: '0', label: '------------', description: 'Разделитель закладок', example: '' }
];

// Visible base types for dropdowns (excludes system types)
const baseTypes = baseTypesAll.filter(t => !t.hidden);

const requisiteTypes = baseTypes;

// Mapping type names to Integram type IDs
const typeNameToId = {
  'HTML': 2,
  'SHORT': 3,
  'DATETIME': 4,
  'GRANT': 5,
  'PWD': 6,
  'BUTTON': 7,
  'CHARS': 8,
  'DATE': 9,
  'FILE': 10,
  'BOOLEAN': 11,
  'MEMO': 12,
  'NUMBER': 13,
  'SIGNED': 14,
  'CALCULATABLE': 15,
  'REPORT_COLUMN': 16,
  'PATH': 17,
  '0': 0  // Tab delimiter
};

function getTypeIdFromName(typeName) {
  return typeNameToId[typeName] || typeName;
}

// State
const newType = reactive({
  name: '',
  baseType: 'SHORT',
  unique: false
});

const typesList = ref([]);
const expandedTypes = ref([]);
const searchQuery = ref('');
const showService = ref(false);
const showSimple = ref(false);
const collapseSearch = ref(false);

const loading = reactive({
  list: false,
  create: false,
  delete: false,
  createSubordinate: false,
  editType: false
});

const requisiteDialog = reactive({
  visible: false,
  mode: 'add', // 'add' or 'edit'
  typeId: null,
  data: {
    id: null,
    name: '',
    type: 'SHORT',
    nullable: true,
    multi: false,
    alias: '',
    defaultValue: ''
  }
});

// Default value macros for different field types
const defaultMacrosByType = {
  DATE: [
    { label: '[TODAY] — сегодня', value: '[TODAY]' },
    { label: '[YESTERDAY] — вчера', value: '[YESTERDAY]' },
    { label: '[TOMORROW] — завтра', value: '[TOMORROW]' },
    { label: '[MONTH_AGO] — месяц назад', value: '[MONTH_AGO]' },
    { label: '[WEEK_AGO] — неделя назад', value: '[WEEK_AGO]' },
    { label: '[MONTH_PLUS] — месяц вперёд', value: '[MONTH_PLUS]' }
  ],
  DATETIME: [
    { label: '[NOW] — текущие дата и время', value: '[NOW]' }
  ],
  REFERENCE: [
    { label: '[USER_ID] — ID текущего пользователя', value: '[USER_ID]' }
  ],
  // CALCULATABLE - вычисляемые поля (read-only, автозаполнение при создании)
  CALCULATABLE: [
    { label: '--- Дата/время ---', value: '', disabled: true },
    { label: '[TODAY] — сегодня', value: '[TODAY]' },
    { label: '[NOW] — дата и время', value: '[NOW]' },
    { label: '[YESTERDAY] — вчера', value: '[YESTERDAY]' },
    { label: '[TOMORROW] — завтра', value: '[TOMORROW]' },
    { label: '[MONTH_AGO] — месяц назад', value: '[MONTH_AGO]' },
    { label: '[WEEK_AGO] — неделя назад', value: '[WEEK_AGO]' },
    { label: '[MONTH_PLUS] — месяц вперёд', value: '[MONTH_PLUS]' },
    { label: '--- Пользователь ---', value: '', disabled: true },
    { label: '[USER] — логин пользователя', value: '[USER]' },
    { label: '[USER_ID] — ID пользователя', value: '[USER_ID]' },
    { label: '[ROLE] — название роли', value: '[ROLE]' },
    { label: '[ROLE_ID] — ID роли', value: '[ROLE_ID]' },
    { label: '--- Система ---', value: '', disabled: true },
    { label: '[REMOTE_ADDR] — IP адрес', value: '[REMOTE_ADDR]' },
    { label: '[HTTP_USER_AGENT] — браузер', value: '[HTTP_USER_AGENT]' },
    { label: '[HTTP_REFERER] — откуда пришёл', value: '[HTTP_REFERER]' },
    { label: '[HTTP_HOST] — хост сервера', value: '[HTTP_HOST]' },
    { label: '[REQUEST_URI] — URL запроса', value: '[REQUEST_URI]' },
    { label: '[TSHIFT] — часовой пояс', value: '[TSHIFT]' }
  ]
};

function getDefaultMacros(fieldType) {
  return defaultMacrosByType[fieldType] || [];
}

const deleteDialog = reactive({
  visible: false,
  type: null, // 'type' or 'requisite'
  item: null,
  itemName: ''
});

// Subordinate type dialog state
const subordinateTypeDialog = reactive({
  visible: false,
  parentType: null,
  name: '',
  unique: false
});

// Edit type dialog state
const editTypeDialog = reactive({
  visible: false,
  type: null,
  name: '',
  baseType: 'SHORT',
  unique: false,
  originalName: ''
});

// Computed
const canCreateType = computed(() => {
  return newType.name && newType.baseType;
});

const filteredTypes = computed(() => {
  // Issue #4104: Ensure typesList.value is always an array before filtering
  // Prevents "result.filter is not a function" error
  let result = Array.isArray(typesList.value) ? typesList.value : [];

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(t => t.name && t.name.toLowerCase().includes(query));
  }

  // Filter service types
  if (!showService.value) {
    result = result.filter(t => !t.isService);
  }

  // Filter simple types
  if (!showSimple.value) {
    result = result.filter(t => !t.isSimple);
  }

  return result;
});

// Base type ID to name mapping (system types 0-20)
const baseTypeNameMap = {
  '0': 'tab',        // Tab delimiter
  '1': 'short',      // SHORT (legacy ID)
  '2': 'html',       // HTML/LONG
  '3': 'short',      // SHORT
  '4': 'datetime',   // DATETIME
  '5': 'grant',      // GRANT
  '6': 'pwd',        // PWD
  '7': 'button',     // BUTTON
  '8': 'chars',      // CHARS
  '9': 'date',       // DATE
  '10': 'file',      // FILE
  '11': 'boolean',   // BOOLEAN
  '12': 'memo',      // MEMO
  '13': 'number',    // NUMBER
  '14': 'signed',    // SIGNED
  '15': 'calculatable', // CALCULATABLE
  '16': 'path',      // PATH
  '17': 'report_column', // REPORT_COLUMN
  '18': 'user',      // User type (system)
  '19': 'connect',   // CONNECT
  '20': 'time'       // TIME
};

// Set of base type IDs for quick lookup
const baseTypeIds = new Set(Object.keys(baseTypeNameMap));

function getBaseTypeNameFromId(baseTypeId) {
  return baseTypeNameMap[String(baseTypeId)] || 'reference';
}

// Check if a type ID is a base/system type (not a user-defined reference)
function isBaseType(typeId) {
  const id = String(typeId);
  return baseTypeIds.has(id) || parseInt(id) <= 20;
}

// Methods
async function loadTypes() {
  loading.list = true;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    const response = await integramApiClient.getTypeEditorData();

    // Parse response - API returns columnar format in edit_types:
    // edit_types.0 = array of type IDs (repeats for each requisite of that type)
    // edit_types.1 = array of base types OR reference target type IDs
    // edit_types.2 = array of ref_val (reference target type ID for FK)
    // edit_types.3 = array of uniqueness flags
    // edit_types.4 = array of names (type name or requisite name)
    // Data is interleaved: first occurrence of type ID = type definition,
    // subsequent occurrences = requisites of that type
    if (response && response.edit_types) {
      const editTypes = response.edit_types;

      // DEBUG: Log all available keys in editTypes to understand API structure
      console.log('[IntegramTypeEditor] DEBUG: editTypes keys:', Object.keys(editTypes));
      console.log('[IntegramTypeEditor] DEBUG: Sample data (first 5 rows):');
      const sampleKeys = Object.keys(editTypes).slice(0, 10);
      sampleKeys.forEach(key => {
        const arr = editTypes[key];
        if (Array.isArray(arr)) {
          console.log(`  ${key}: [${arr.slice(0, 5).join(', ')}] (${arr.length} items)`);
        }
      });

      // DEBUG: Find and log rows where req_t (column 7) > 20 (potential references)
      const reqTypesCol = editTypes['7'] || editTypes['req_t'] || [];
      const refCandidates = reqTypesCol
        .map((val, idx) => ({ idx, val: parseInt(val) || 0 }))
        .filter(item => item.val > 20)
        .slice(0, 5);
      if (refCandidates.length > 0) {
        console.log('[IntegramTypeEditor] DEBUG: Potential reference rows (req_t > 20):');
        refCandidates.forEach(({ idx, val }) => {
          const typeId = (editTypes['0'] || [])[idx];
          const name = (editTypes['4'] || [])[idx];
          console.log(`  Row ${idx}: typeId=${typeId}, req_t=${val}, name="${name}"`);
        });
      } else {
        console.log('[IntegramTypeEditor] DEBUG: No potential references found (all req_t <= 20)');
      }

      const ids = editTypes['0'] || editTypes['id'] || [];
      const baseTypesList = editTypes['1'] || editTypes['t'] || [];
      const refVals = editTypes['2'] || editTypes['ref_val'] || [];
      const uniqueFlags = editTypes['3'] || editTypes['uniq'] || [];
      const names = editTypes['4'] || editTypes['val'] || [];
      // Additional columns for requisites (from legacy: ord, req_id, req_t, attrs, reft)
      const orders = editTypes['5'] || editTypes['ord'] || [];
      const reqIds = editTypes['6'] || editTypes['req_id'] || [];
      const reqTypes = editTypes['7'] || editTypes['req_t'] || [];
      const attrs = editTypes['8'] || editTypes['attrs'] || [];
      const refts = editTypes['9'] || editTypes['reft'] || []; // Reference type for requisites!

      // Group rows by type ID - first occurrence is type, rest are requisites
      const typeMap = new Map();
      const typeOrder = []; // Preserve order of first occurrences

      for (let i = 0; i < ids.length; i++) {
        const typeId = String(ids[i]);
        const baseType = baseTypesList[i];
        const refVal = refVals[i];
        const unique = uniqueFlags[i];
        const name = names[i] || '';
        const order = orders[i];
        const reqId = reqIds[i];
        const reft = refts[i]; // Reference type ID for requisites

        // Use 'ord' (order) to distinguish: empty = type definition, non-empty = requisite
        const isRequisiteRow = order !== undefined && order !== '' && order !== null;

        if (!isRequisiteRow && !typeMap.has(typeId)) {
          // Type definition row (no order or first occurrence)
          typeOrder.push(typeId);
          const isReferenceTable = refVal && refVal !== '' && refVal !== '0' && refVal !== 0;
          typeMap.set(typeId, {
            id: typeId,
            name: name,
            baseType: baseType,
            refVal: refVal,
            unique: unique === 1 || unique === '1' || unique === true,
            requisites: [],
            isService: baseType === 0 || baseType === '0',
            isSimple: !refVal || refVal === '' || refVal === '0' || refVal === 0,
            isReferenceTable: isReferenceTable
          });
        } else if (isRequisiteRow && typeMap.has(typeId)) {
          // Requisite row (has order value)
          const type = typeMap.get(typeId);

          // Get the requisite's type ID from column 7 (req_t)
          const reqTypeId = reqTypes[i];

          // LEGACY LOGIC: A requisite is a reference if its type ID is NOT a base type
          // Base types are 0-20 (SHORT, CHARS, NUMBER, etc.)
          // If reqTypeId > 20 or not in baseTypeNameMap, it's a reference to a user-defined table
          const isReference = reqTypeId && !isBaseType(reqTypeId);

          // For references, the refTypeId IS the reqTypeId (the user-defined type it references)
          // For base types, refTypeId is null
          const reqRefTypeId = isReference ? String(reqTypeId) : null;

          type.requisites.push({
            id: reqId ? String(reqId) : `${typeId}-req-${i}`,
            name: name,
            type: isReference ? 'reference' : getBaseTypeNameFromId(baseType),
            baseTypeId: baseType,
            refTypeId: reqRefTypeId,
            isReference: isReference,
            order: order
          });
        } else if (!typeMap.has(typeId)) {
          // Type definition (fallback for APIs that don't have 'ord' column)
          typeOrder.push(typeId);
          const isReferenceTable = refVal && refVal !== '' && refVal !== '0' && refVal !== 0;
          typeMap.set(typeId, {
            id: typeId,
            name: name,
            baseType: baseType,
            refVal: refVal,
            unique: unique === 1 || unique === '1' || unique === true,
            requisites: [],
            isService: baseType === 0 || baseType === '0',
            isSimple: !refVal || refVal === '' || refVal === '0' || refVal === 0,
            isReferenceTable: isReferenceTable
          });
        }
      }

      // Second pass: resolve reference type names
      typeMap.forEach((type) => {
        type.requisites.forEach((req) => {
          if (req.refTypeId && typeMap.has(req.refTypeId)) {
            req.refTypeName = typeMap.get(req.refTypeId).name;
          }
        });
      });

      // Convert to array preserving order
      const types = typeOrder.map(id => typeMap.get(id));
      typesList.value = types;

      const totalRequisites = types.reduce((sum, t) => sum + t.requisites.length, 0);
      const totalRefRequisites = types.reduce((sum, t) =>
        sum + t.requisites.filter(r => r.isReference).length, 0);
      console.log(`[IntegramTypeEditor] Loaded ${types.length} types with ${totalRequisites} requisites (${totalRefRequisites} are references)`);

      // DEBUG: Log first few reference requisites found
      if (totalRefRequisites > 0) {
        console.log('[IntegramTypeEditor] DEBUG: Sample reference requisites:');
        let count = 0;
        for (const type of types) {
          for (const req of type.requisites) {
            if (req.isReference && count < 5) {
              console.log(`  ${type.name}.${req.name} -> type ${req.refTypeId} "${req.refTypeName || 'NOT FOUND'}"`);
              count++;
            }
          }
          if (count >= 5) break;
        }
      } else {
        console.log('[IntegramTypeEditor] DEBUG: No reference requisites found. Checking raw data...');
        // Log sample requisite type IDs to debug
        const sampleReqs = [];
        for (const type of types) {
          for (const req of type.requisites.slice(0, 2)) {
            sampleReqs.push(`${type.name}.${req.name}: baseTypeId=${req.baseTypeId}, refTypeId=${req.refTypeId}`);
          }
          if (sampleReqs.length >= 5) break;
        }
        console.log('[IntegramTypeEditor] DEBUG: Sample requisites:', sampleReqs);
      }
    } else if (response && response.types) {
      // Fallback: support older format with response.types array
      typesList.value = Array.isArray(response.types) ? response.types : [];
    } else {
      console.warn('Unexpected response format:', response);
      typesList.value = [];
    }
  } catch (error) {
    console.error('Error loading types:', error);
    typesList.value = [];
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось загрузить типы',
      life: 5000
    });
  } finally {
    loading.list = false;
  }
}

async function createType() {
  loading.create = true;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    // Find base type ID from label (integramApiClient expects baseTypeId as number/string)
    const baseType = baseTypes.find(t => t.value === newType.baseType);
    const baseTypeId = baseType ? baseType.value : newType.baseType;

    const response = await integramApiClient.createType(
      newType.name,
      baseTypeId,
      newType.unique
    );

    if (response) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Тип "${newType.name}" создан`,
        life: 3000
      });

      // Reset form
      newType.name = '';
      newType.baseType = 'SHORT';
      newType.unique = false;

      // Reload types
      loadTypes();
    }
  } catch (error) {
    console.error('Create type error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось создать тип',
      life: 5000
    });
  } finally {
    loading.create = false;
  }
}

function toggleTypeExpansion(typeId) {
  const index = expandedTypes.value.indexOf(typeId);
  if (index > -1) {
    expandedTypes.value.splice(index, 1);
  } else {
    expandedTypes.value.push(typeId);
  }
}

function filterTypes() {
  // Filtering is done via computed property
}

function clearSearch() {
  searchQuery.value = '';
}

function toggleServiceTypes() {
  showService.value = !showService.value;
}

function toggleSimpleTypes() {
  showSimple.value = !showSimple.value;
}

function getBaseTypeName(baseType) {
  const type = baseTypesAll.find(t => t.value === baseType);
  return type ? type.label : baseType;
}

function editType(type) {
  // Populate the edit dialog with current type data
  editTypeDialog.type = type;
  editTypeDialog.name = type.name;
  editTypeDialog.baseType = type.baseType || type.base || 'SHORT';
  editTypeDialog.unique = type.unique || false;
  editTypeDialog.originalName = type.name;
  editTypeDialog.visible = true;
}

async function saveEditedType() {
  if (!editTypeDialog.name || !editTypeDialog.type) {
    toast.add({
      severity: 'warn',
      summary: 'Ошибка',
      detail: 'Название типа не может быть пустым',
      life: 3000
    });
    return;
  }

  loading.editType = true;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    // Get the base type value (convert label to ID if needed)
    let baseTypeValue = editTypeDialog.baseType;

    // If baseType is a string label like 'SHORT', convert to the numeric ID
    // The API expects the base type ID from the metadata
    const typeMetadata = await integramApiClient.getTypeMetadata(editTypeDialog.type.id);
    const baseTypeId = typeMetadata.type?.t || editTypeDialog.type.baseTypeId || 3;

    // Save the type with new name and settings
    await integramApiClient.saveType(
      editTypeDialog.type.id,
      editTypeDialog.name,
      baseTypeId,
      editTypeDialog.unique
    );

    toast.add({
      severity: 'success',
      summary: 'Тип обновлён',
      detail: `Тип "${editTypeDialog.name}" успешно сохранён`,
      life: 3000
    });

    // Close dialog and reload
    editTypeDialog.visible = false;
    await loadTypes();
    emit('refresh');

  } catch (error) {
    console.error('Save type error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка сохранения',
      detail: error.response?.data?.details || error.message || 'Не удалось сохранить тип',
      life: 5000
    });
  } finally {
    loading.editType = false;
  }
}

function viewTable(typeId) {
  emit('view-table', typeId);
}

// Subordinate type functions
function showSubordinateTypeDialog(parentType) {
  subordinateTypeDialog.parentType = parentType;
  subordinateTypeDialog.name = '';
  subordinateTypeDialog.unique = false;
  subordinateTypeDialog.visible = true;
}

async function createSubordinateType() {
  if (!subordinateTypeDialog.name || !subordinateTypeDialog.parentType) {
    return;
  }

  loading.createSubordinate = true;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    // Create subordinate type using parent type ID as baseTypeId
    // In Integram, a subordinate type has the parent type's ID as its baseTypeId
    const parentTypeId = subordinateTypeDialog.parentType.id;

    const response = await integramApiClient.createType(
      subordinateTypeDialog.name,
      parentTypeId,  // Using parent type ID as baseTypeId creates subordination
      subordinateTypeDialog.unique
    );

    if (response) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Подчинённый тип "${subordinateTypeDialog.name}" создан для "${subordinateTypeDialog.parentType.name}"`,
        life: 3000
      });

      // Close dialog
      subordinateTypeDialog.visible = false;
      subordinateTypeDialog.name = '';
      subordinateTypeDialog.parentType = null;

      // Reload types to show the new type
      loadTypes();
    }
  } catch (error) {
    console.error('Create subordinate type error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось создать подчинённый тип',
      life: 5000
    });
  } finally {
    loading.createSubordinate = false;
  }
}

// Create reference to type (use type as lookup/dictionary)
async function createReferenceToType(type) {
  try {
    await integramApiClient.createTypeReference(type.id);
    toast.add({
      severity: 'success',
      summary: 'Ссылка создана',
      detail: `Тип "${type.name}" теперь можно использовать как справочник в других таблицах`,
      life: 3000
    });
    // Reload types to reflect changes
    await loadTypes();
  } catch (error) {
    console.error('Create type reference error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось создать ссылку на тип',
      life: 5000
    });
  }
}

// Flow view handlers
function handleOpenTable(typeId) {
  emit('view-table', typeId);
}

function handleEditType(typeId) {
  const type = typesList.value.find(t => t.id === typeId);
  if (type) {
    // Switch to list view and expand the type
    viewMode.value = 'list';
    if (!expandedTypes.value.includes(typeId)) {
      expandedTypes.value.push(typeId);
    }
    // Scroll to the type card
    setTimeout(() => {
      const element = document.querySelector(`[data-type-id="${typeId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
}

function confirmDeleteType(type) {
  deleteDialog.type = 'type';
  deleteDialog.item = type;
  deleteDialog.itemName = type.name;
  deleteDialog.visible = true;
}

async function executeDelete() {
  deleteDialog.visible = false;

  if (deleteDialog.type === 'type') {
    await deleteType(deleteDialog.item);
  } else if (deleteDialog.type === 'requisite') {
    await deleteRequisite(deleteDialog.item.type, deleteDialog.item.requisite);
  }
}

async function deleteType(type) {
  loading.delete = true;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    const response = await integramApiClient.deleteType(type.id);

    if (response) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Тип "${type.name}" удален`,
        life: 3000
      });

      loadTypes();
    }
  } catch (error) {
    console.error('Delete type error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось удалить тип',
      life: 5000
    });
  } finally {
    loading.delete = false;
  }
}

// Requisite management
function showAddRequisiteDialog(type) {
  requisiteDialog.mode = 'add';
  requisiteDialog.typeId = type.id;
  requisiteDialog.data = {
    id: null,
    name: '',
    type: 'SHORT',
    nullable: true,
    multi: false,
    alias: '',
    defaultValue: ''
  };
  requisiteDialog.visible = true;
}

function editRequisite(type, requisite) {
  requisiteDialog.mode = 'edit';
  requisiteDialog.typeId = type.id;
  requisiteDialog.data = { ...requisite };
  requisiteDialog.visible = true;
}

async function saveRequisite() {
  requisiteDialog.visible = false;

  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    if (requisiteDialog.mode === 'add') {
      // Add requisite - convert type name to numeric ID
      const typeId = getTypeIdFromName(requisiteDialog.data.type);
      const response = await integramApiClient.addRequisite(
        requisiteDialog.typeId,
        typeId
      );

      // Set alias if provided
      if (response && response.id && requisiteDialog.data.name) {
        await integramApiClient.saveRequisiteAlias(response.id, requisiteDialog.data.name);
      }

      // Set nullable flag if specified
      if (response && response.id && !requisiteDialog.data.nullable) {
        await integramApiClient.toggleRequisiteNull(response.id);
      }

      // Set multi flag if specified
      if (response && response.id && requisiteDialog.data.multi) {
        await integramApiClient.toggleRequisiteMulti(response.id);
      }

      // Set default value if specified (supports macros like [TODAY], [NOW])
      if (response && response.id && requisiteDialog.data.defaultValue) {
        await integramApiClient.saveRequisiteDefaultValue(
          response.id,
          requisiteDialog.data.defaultValue
        );
      }
    } else {
      // Update requisite
      if (requisiteDialog.data.name) {
        await integramApiClient.saveRequisiteAlias(
          requisiteDialog.data.id,
          requisiteDialog.data.name
        );
      }

      // Update default value if changed
      if (requisiteDialog.data.defaultValue !== undefined) {
        await integramApiClient.saveRequisiteDefaultValue(
          requisiteDialog.data.id,
          requisiteDialog.data.defaultValue || ''
        );
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: requisiteDialog.mode === 'add' ? 'Реквизит добавлен' : 'Реквизит обновлен',
      life: 3000
    });

    loadTypes();
  } catch (error) {
    console.error('Save requisite error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось сохранить реквизит',
      life: 5000
    });
  }
}

function confirmDeleteRequisite(type, requisite) {
  deleteDialog.type = 'requisite';
  deleteDialog.item = { type, requisite };
  deleteDialog.itemName = requisite.name;
  deleteDialog.visible = true;
}

async function deleteRequisite(type, requisite) {
  try {
    // Set database context
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }

    const response = await integramApiClient.deleteRequisite(requisite.id);

    if (response) {
      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Реквизит "${requisite.name}" удален`,
        life: 3000
      });

      loadTypes();
    }
  } catch (error) {
    console.error('Delete requisite error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось удалить реквизит',
      life: 5000
    });
  }
}

async function moveRequisiteUp(type, requisite) {
  try {
    await integramApiClient.moveRequisiteUp(requisite.id);
    toast.add({
      severity: 'success',
      summary: 'Реквизит перемещён',
      detail: `"${requisite.alias || requisite.name}" перемещён выше`,
      life: 2000
    });
    // Reload all types to get updated order
    await loadTypes();
  } catch (error) {
    console.error('Move requisite up error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось переместить реквизит',
      life: 5000
    });
  }
}

async function moveRequisiteDown(type, requisite) {
  try {
    // Find current index and calculate new order
    const reqs = type.requisites || [];
    const currentIndex = reqs.findIndex(r => r.id === requisite.id);

    if (currentIndex === -1 || currentIndex >= reqs.length - 1) {
      toast.add({
        severity: 'warn',
        summary: 'Невозможно переместить',
        detail: 'Реквизит уже находится в самом низу',
        life: 2000
      });
      return;
    }

    // Use setRequisiteOrder to move down (order = currentIndex + 2 for 1-based)
    const newOrder = currentIndex + 2;
    await integramApiClient.setRequisiteOrder(requisite.id, newOrder);

    toast.add({
      severity: 'success',
      summary: 'Реквизит перемещён',
      detail: `"${requisite.alias || requisite.name}" перемещён ниже`,
      life: 2000
    });
    // Reload all types to get updated order
    await loadTypes();
  } catch (error) {
    console.error('Move requisite down error:', error);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: error.response?.data?.details || error.message || 'Не удалось переместить реквизит',
      life: 5000
    });
  }
}

function filterExistingTypes() {
  // Check if type with same name already exists
  const exists = typesList.value.some(
    t => t.name.toLowerCase() === newType.name.toLowerCase().trim() &&
         t.baseType === newType.baseType
  );

  if (exists) {
    toast.add({
      severity: 'warn',
      summary: 'Дубликат',
      detail: 'Тип с таким именем уже существует',
      life: 2000
    });
  }
}

// Lifecycle
onMounted(() => {
  if (props.session && props.session.sessionId) {
    // Set database context from session
    if (props.session.database) {
      integramApiClient.setDatabase(props.session.database);
    }
    loadTypes();
  }
});
</script>

<style scoped>
.integram-type-editor {
  width: 100%;
}

.view-mode-toggle {
  position: relative;
  z-index: 1;
}

.view-mode-selector :deep(.p-button) {
  padding: 0.5rem 1rem;
}

.view-toggle :deep(.p-button) {
  padding: 0.5rem;
  min-width: 2rem;
}

.view-toggle :deep(.p-button .pi) {
  font-size: 0.875rem;
}

.legacy-view-container {
  height: calc(100vh - 200px);
  min-height: 600px;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  overflow: hidden;
}

.tree-view-container {
  height: calc(100vh - 200px);
  min-height: 600px;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  overflow: hidden;
}

.types-list {
  max-height: 800px;
  overflow-y: auto;
}

.type-card {
  border-left: 4px solid var(--primary-color);
}

.requisites-panel {
  margin-top: 1rem;
}

/* Requisite chips like legacy: shortИмя referenceТип (Название) */
.requisite-chip {
  display: inline-flex;
  align-items: center;
  background: var(--p-surface-100);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.8rem;
  margin: 2px;
  border: 1px solid var(--p-surface-200);
}

.requisite-chip.ref-chip {
  background: #fff3e0;
  border-color: #ffcc80;
}

.requisite-chip .chip-type {
  font-weight: 600;
  color: var(--p-primary-color);
  margin-right: 2px;
  font-size: 0.75rem;
}

.requisite-chip.ref-chip .chip-type {
  color: #e65100;
}

.requisite-chip .ref-name {
  font-size: 0.7rem;
  color: #ff8f00;
  margin-left: 4px;
}
</style>
