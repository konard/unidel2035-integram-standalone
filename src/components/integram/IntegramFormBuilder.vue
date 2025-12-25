<template>
  <div class="integram-form-builder-page integram-touch-friendly">
    <!-- Breadcrumb Navigation -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <Message severity="info" :closable="false" class="mb-2">
      <strong>Конструктор форм (myform)</strong> - Полная реализация функционала создания и редактирования пользовательских форм с панелями, полями и кнопками
    </Message>

    <!-- Forms List -->
    <Card class="mb-3">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>Конструктор форм</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-refresh"
              @click="loadFormsList"
              :loading="loading.formsList"
              outlined
              rounded
              size="small"
              v-tooltip.bottom="'Обновить'"
            />
            <Button
              label="Создать"
              icon="pi pi-plus"
              @click="showCreateFormDialog = true"
              severity="primary"
              size="small"
            />
          </div>
        </div>
      </template>
      <template #content>
        <DataTable
          v-if="formsList.length > 0"
          :value="formsList"
          :paginator="true"
          :rows="10"
          :rowsPerPageOptions="[5, 10, 20, 50]"
          stripedRows
          showGridlines
        >
          <Column field="id" header="ID" sortable style="width: 100px">
            <template #body="{ data }">
              <code class="text-primary">{{ data.id }}</code>
            </template>
          </Column>
          <Column field="val" header="Название формы" sortable></Column>
          <Column header="Действия" style="width: 150px">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  text
                  severity="info"
                  @click="editForm(data.id)"
                  v-tooltip="'Редактировать'"
                />
                <Button
                  icon="pi pi-eye"
                  size="small"
                  text
                  severity="success"
                  @click="viewForm(data.id)"
                  v-tooltip="'Просмотр'"
                />
                <Button
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  @click="deleteForm(data.id)"
                  v-tooltip="'Удалить'"
                />
              </div>
            </template>
          </Column>
        </DataTable>
        <div v-else class="text-center p-4 text-muted">
          Нет форм. Создайте новую форму.
        </div>
      </template>
    </Card>

    <!-- Form Editor -->
    <Card v-if="currentForm" class="mb-3">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>{{ currentForm.val }}</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              icon="pi pi-arrow-left"
              @click="closeFormEditor"
              size="small"
              outlined
              rounded
              v-tooltip.bottom="'Назад к списку'"
            />
          </div>
        </div>
      </template>
      <template #content>
        <!-- Form Basic Info -->
        <div class="grid mb-3">
          <div class="col-12">
            <div class="field">
              <label for="formName">Название формы</label>
              <InputText
                id="formName"
                v-model="currentForm.val"
                class="w-full"
                @blur="updateFormName"
              />
            </div>
          </div>
        </div>

        <Divider />

        <!-- Panels Section -->
        <div class="mb-4">
          <div class="flex justify-content-between align-items-center mb-3">
            <h4 class="m-0">Панели формы</h4>
            <Button
              label="Добавить панель"
              icon="pi pi-plus"
              @click="showAddPanelDialog = true"
              size="small"
              severity="success"
            />
          </div>

          <!-- Panels List -->
          <div v-if="panels.length > 0" class="flex flex-column gap-2">
            <Card
              v-for="(panel, index) in panels"
              :key="panel.id"
              class="surface-border"
            >
              <template #title>
                <div class="flex justify-content-between align-items-center">
                  <div class="flex align-items-center gap-2">
                    <Badge :value="index + 1" severity="info" />
                    <span>{{ panel.val }}</span>
                  </div>
                  <div class="flex gap-1">
                    <Button
                      icon="pi pi-arrow-up"
                      size="small"
                      text
                      @click="movePanelUp(index)"
                      :disabled="index === 0"
                      v-tooltip="'Вверх'"
                    />
                    <Button
                      icon="pi pi-arrow-down"
                      size="small"
                      text
                      @click="movePanelDown(index)"
                      :disabled="index === panels.length - 1"
                      v-tooltip="'Вниз'"
                    />
                    <Button
                      icon="pi pi-pencil"
                      size="small"
                      text
                      severity="info"
                      @click="editPanel(panel)"
                      v-tooltip="'Редактировать'"
                    />
                    <Button
                      icon="pi pi-trash"
                      size="small"
                      text
                      severity="danger"
                      @click="deletePanel(panel.id)"
                      v-tooltip="'Удалить'"
                    />
                  </div>
                </div>
              </template>
              <template #content>
                <div class="grid">
                  <div class="col-12 md:col-6">
                    <div class="text-sm">
                      <div class="mb-2"><strong>Тип объекта:</strong> {{ panel.typeName || panel.type }}</div>
                      <div class="mb-2" v-if="panel.report"><strong>Отчет:</strong> {{ panel.report }}</div>
                      <div class="mb-2" v-if="panel.filter"><strong>Фильтр:</strong> <code>{{ panel.filter }}</code></div>
                      <div class="mb-2" v-if="panel.nextAction"><strong>Действие после submit:</strong> {{ panel.nextAction }}</div>
                    </div>
                  </div>
                  <div class="col-12 md:col-6">
                    <div class="text-sm">
                      <div class="mb-2" v-if="panel.bgcolor">
                        <strong>Цвет фона:</strong>
                        <span class="inline-flex align-items-center gap-2">
                          <span
                            class="inline-block"
                            :style="{ width: '20px', height: '20px', backgroundColor: panel.bgcolor, border: '1px solid #ccc' }"
                          ></span>
                          {{ panel.bgcolor }}
                        </span>
                      </div>
                      <div class="mb-2" v-if="panel.color">
                        <strong>Цвет текста:</strong>
                        <span class="inline-flex align-items-center gap-2">
                          <span
                            class="inline-block"
                            :style="{ width: '20px', height: '20px', backgroundColor: panel.color, border: '1px solid #ccc' }"
                          ></span>
                          {{ panel.color }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Divider />

                <!-- Panel Fields -->
                <div class="mb-3">
                  <div class="flex justify-content-between align-items-center mb-2">
                    <h6 class="m-0">Поля панели</h6>
                    <Button
                      label="Добавить поле"
                      icon="pi pi-plus"
                      size="small"
                      text
                      @click="openAddFieldDialog(panel)"
                    />
                  </div>
                  <div v-if="panel.fields && panel.fields.length > 0">
                    <DataTable :value="panel.fields" size="small" stripedRows>
                      <Column header="#" style="width: 50px">
                        <template #body="{ index }">
                          {{ index + 1 }}
                        </template>
                      </Column>
                      <Column field="fieldName" header="Поле"></Column>
                      <Column field="fieldAlias" header="Псевдоним"></Column>
                      <Column field="fieldValue" header="Значение по умолчанию"></Column>
                      <Column header="Действия" style="width: 100px">
                        <template #body="{ data }">
                          <div class="flex gap-1">
                            <Button
                              icon="pi pi-pencil"
                              size="small"
                              text
                              @click="editField(panel, data)"
                              v-tooltip="'Редактировать'"
                            />
                            <Button
                              icon="pi pi-trash"
                              size="small"
                              text
                              severity="danger"
                              @click="deleteField(panel, data.id)"
                              v-tooltip="'Удалить'"
                            />
                          </div>
                        </template>
                      </Column>
                    </DataTable>
                  </div>
                  <div v-else class="text-muted text-sm">
                    Полей пока нет
                  </div>
                </div>

                <!-- Pivot Config -->
                <div class="mb-3" v-if="panel.report">
                  <div class="flex justify-content-between align-items-center mb-2">
                    <h6 class="m-0">
                      <i class="pi pi-table mr-2"></i>Сводная таблица (Pivot)
                    </h6>
                    <div class="flex gap-1">
                      <Tag
                        v-if="panel.pivotConfig"
                        severity="success"
                        value="Настроено"
                        class="mr-2"
                      />
                      <Button
                        :label="panel.pivotConfig ? 'Изменить' : 'Настроить'"
                        :icon="panel.pivotConfig ? 'pi pi-pencil' : 'pi pi-cog'"
                        size="small"
                        :severity="panel.pivotConfig ? 'info' : 'secondary'"
                        text
                        @click="openPivotConfig(panel)"
                      />
                      <Button
                        v-if="panel.pivotConfig"
                        icon="pi pi-trash"
                        size="small"
                        severity="danger"
                        text
                        @click="clearPivotConfig(panel)"
                        v-tooltip="'Очистить настройки'"
                      />
                    </div>
                  </div>
                  <div v-if="panel.pivotConfig" class="surface-ground border-round p-2 text-sm">
                    <div class="grid">
                      <div class="col-6 md:col-3">
                        <strong>Строки:</strong> {{ panel.pivotConfig.rows?.join(', ') || '—' }}
                      </div>
                      <div class="col-6 md:col-3">
                        <strong>Столбцы:</strong> {{ panel.pivotConfig.cols?.join(', ') || '—' }}
                      </div>
                      <div class="col-6 md:col-3">
                        <strong>Значения:</strong> {{ panel.pivotConfig.vals?.join(', ') || '—' }}
                      </div>
                      <div class="col-6 md:col-3">
                        <strong>Агрегация:</strong> {{ panel.pivotConfig.aggregatorName || 'Count' }}
                      </div>
                    </div>
                  </div>
                </div>

                <Divider v-if="panel.report" />

                <!-- Panel Buttons -->
                <div>
                  <div class="flex justify-content-between align-items-center mb-2">
                    <h6 class="m-0">Кнопки панели</h6>
                    <Button
                      label="Добавить кнопку"
                      icon="pi pi-plus"
                      size="small"
                      text
                      @click="openAddButtonDialog(panel)"
                    />
                  </div>
                  <div v-if="panel.buttons && panel.buttons.length > 0">
                    <DataTable :value="panel.buttons" size="small" stripedRows>
                      <Column header="#" style="width: 50px">
                        <template #body="{ index }">
                          {{ index + 1 }}
                        </template>
                      </Column>
                      <Column field="buttonAlias" header="Название кнопки"></Column>
                      <Column field="buttonAction" header="Действие"></Column>
                      <Column field="buttonClass" header="CSS класс"></Column>
                      <Column header="Действия" style="width: 100px">
                        <template #body="{ data }">
                          <div class="flex gap-1">
                            <Button
                              icon="pi pi-pencil"
                              size="small"
                              text
                              @click="editButton(panel, data)"
                              v-tooltip="'Редактировать'"
                            />
                            <Button
                              icon="pi pi-trash"
                              size="small"
                              text
                              severity="danger"
                              @click="deleteButton(panel, data.id)"
                              v-tooltip="'Удалить'"
                            />
                          </div>
                        </template>
                      </Column>
                    </DataTable>
                  </div>
                  <div v-else class="text-muted text-sm">
                    Кнопок пока нет
                  </div>
                </div>
              </template>
            </Card>
          </div>
          <div v-else class="text-center p-4 text-muted surface-ground border-round">
            Панелей пока нет. Добавьте первую панель к форме.
          </div>
        </div>
      </template>
    </Card>

    <!-- Dialog: Create Form -->
    <Dialog
      v-model:visible="showCreateFormDialog"
      header="Создать новую форму"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="newFormName">Название формы *</label>
          <InputText
            id="newFormName"
            v-model="newFormData.name"
            class="w-full"
            placeholder="Введите название формы"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="showCreateFormDialog = false" text />
        <Button
          label="Создать"
          icon="pi pi-check"
          @click="createForm"
          :loading="loading.createForm"
          :disabled="!newFormData.name"
        />
      </template>
    </Dialog>

    <!-- Dialog: Add/Edit Panel -->
    <Dialog
      v-model:visible="showAddPanelDialog"
      :header="editingPanel ? 'Редактировать панель' : 'Добавить панель'"
      :modal="true"
      :style="{ width: '700px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="panelName">Название панели *</label>
          <InputText
            id="panelName"
            v-model="panelData.name"
            class="w-full"
            placeholder="Введите название панели"
          />
        </div>
        <div class="grid">
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="panelType">Тип объекта (ID) *</label>
              <InputText
                id="panelType"
                v-model="panelData.typeId"
                class="w-full"
                placeholder="ID типа"
              />
            </div>
          </div>
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="panelReport">ID отчета (опционально)</label>
              <InputText
                id="panelReport"
                v-model="panelData.reportId"
                class="w-full"
                placeholder="ID отчета"
              />
            </div>
          </div>
        </div>
        <div class="grid">
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="panelBgColor">Цвет фона</label>
              <InputText
                id="panelBgColor"
                v-model="panelData.bgcolor"
                class="w-full"
                placeholder="#ffffff"
              />
            </div>
          </div>
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="panelTextColor">Цвет текста</label>
              <InputText
                id="panelTextColor"
                v-model="panelData.color"
                class="w-full"
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
        <div class="field">
          <label for="panelFilter">Фильтр (SQL WHERE условие)</label>
          <Textarea
            id="panelFilter"
            v-model="panelData.filter"
            class="w-full"
            rows="2"
            placeholder="Например: status='active'"
          />
        </div>
        <div class="field">
          <label for="panelNextAction">Действие после submit</label>
          <InputText
            id="panelNextAction"
            v-model="panelData.nextAction"
            class="w-full"
            placeholder="URL или путь"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="closeAddPanelDialog" text />
        <Button
          :label="editingPanel ? 'Сохранить' : 'Добавить'"
          icon="pi pi-check"
          @click="savePanel"
          :loading="loading.savePanel"
          :disabled="!panelData.name || !panelData.typeId"
        />
      </template>
    </Dialog>

    <!-- Dialog: Add/Edit Field -->
    <Dialog
      v-model:visible="showAddFieldDialog"
      :header="editingField ? 'Редактировать поле' : 'Добавить поле'"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="fieldRequisite">Реквизит (ID или название) *</label>
          <InputText
            id="fieldRequisite"
            v-model="fieldData.fieldId"
            class="w-full"
            placeholder="ID реквизита"
          />
        </div>
        <div class="field">
          <label for="fieldAlias">Псевдоним поля</label>
          <InputText
            id="fieldAlias"
            v-model="fieldData.fieldAlias"
            class="w-full"
            placeholder="Отображаемое название"
          />
        </div>
        <div class="field">
          <label for="fieldValue">Значение по умолчанию</label>
          <InputText
            id="fieldValue"
            v-model="fieldData.fieldValue"
            class="w-full"
            placeholder="Значение"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="closeAddFieldDialog" text />
        <Button
          :label="editingField ? 'Сохранить' : 'Добавить'"
          icon="pi pi-check"
          @click="saveField"
          :loading="loading.saveField"
          :disabled="!fieldData.fieldId"
        />
      </template>
    </Dialog>

    <!-- Dialog: Add/Edit Button -->
    <Dialog
      v-model:visible="showAddButtonDialog"
      :header="editingButton ? 'Редактировать кнопку' : 'Добавить кнопку'"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="buttonAlias">Название кнопки *</label>
          <InputText
            id="buttonAlias"
            v-model="buttonData.buttonAlias"
            class="w-full"
            placeholder="Текст на кнопке"
          />
        </div>
        <div class="field">
          <label for="buttonAction">Действие (URL или JavaScript) *</label>
          <Textarea
            id="buttonAction"
            v-model="buttonData.buttonAction"
            class="w-full"
            rows="2"
            placeholder="Например: /save или javascript:doSomething()"
          />
        </div>
        <div class="field">
          <label for="buttonClass">CSS класс</label>
          <InputText
            id="buttonClass"
            v-model="buttonData.buttonClass"
            class="w-full"
            placeholder="btn btn-primary"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="closeAddButtonDialog" text />
        <Button
          :label="editingButton ? 'Сохранить' : 'Добавить'"
          icon="pi pi-check"
          @click="saveButton"
          :loading="loading.saveButton"
          :disabled="!buttonData.buttonAlias || !buttonData.buttonAction"
        />
      </template>
    </Dialog>

    <!-- Dialog: Pivot Config -->
    <Dialog
      v-model:visible="showPivotConfigDialog"
      header="Настройка сводной таблицы (Pivot)"
      :modal="true"
      :style="{ width: '800px' }"
    >
      <div class="flex flex-column gap-3">
        <Message severity="info" :closable="false">
          Настройте параметры сводной таблицы для данных отчета. Конфигурация будет сохранена в реквизите 225 панели.
        </Message>

        <!-- Report Fields (loaded from report) -->
        <div class="field">
          <label class="font-semibold mb-2 block">Доступные поля отчета</label>
          <div v-if="pivotAvailableFields.length > 0" class="flex flex-wrap gap-2">
            <Chip
              v-for="field in pivotAvailableFields"
              :key="field"
              :label="field"
              class="cursor-pointer"
              @click="addFieldToPivot(field)"
              v-tooltip="'Клик для добавления в строки/столбцы'"
            />
          </div>
          <div v-else class="text-muted">
            <Button
              label="Загрузить поля отчета"
              icon="pi pi-download"
              @click="loadReportFields"
              :loading="loading.pivotFields"
              outlined
              size="small"
            />
          </div>
        </div>

        <Divider />

        <!-- Rows -->
        <div class="field">
          <label for="pivotRows" class="font-semibold mb-2 block">
            <i class="pi pi-bars mr-2"></i>Строки (группировка по строкам)
          </label>
          <Chips
            id="pivotRows"
            v-model="pivotData.rows"
            :allowDuplicate="false"
            class="w-full"
            placeholder="Введите название поля или выберите из доступных"
          />
          <small class="text-muted">Поля, по которым будут группироваться данные по строкам</small>
        </div>

        <!-- Columns -->
        <div class="field">
          <label for="pivotCols" class="font-semibold mb-2 block">
            <i class="pi pi-table mr-2"></i>Столбцы (группировка по столбцам)
          </label>
          <Chips
            id="pivotCols"
            v-model="pivotData.cols"
            :allowDuplicate="false"
            class="w-full"
            placeholder="Введите название поля или выберите из доступных"
          />
          <small class="text-muted">Поля, по которым будут группироваться данные по столбцам</small>
        </div>

        <!-- Values -->
        <div class="field">
          <label for="pivotVals" class="font-semibold mb-2 block">
            <i class="pi pi-calculator mr-2"></i>Значения (агрегируемые поля)
          </label>
          <Chips
            id="pivotVals"
            v-model="pivotData.vals"
            :allowDuplicate="false"
            class="w-full"
            placeholder="Поля для агрегации (суммирования, подсчета и т.д.)"
          />
        </div>

        <!-- Aggregator -->
        <div class="grid">
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="pivotAggregator" class="font-semibold mb-2 block">Функция агрегации</label>
              <Select
                id="pivotAggregator"
                v-model="pivotData.aggregatorName"
                :options="aggregatorOptions"
                optionLabel="label"
                optionValue="value"
                class="w-full"
                placeholder="Выберите функцию"
              />
            </div>
          </div>
          <div class="col-12 md:col-6">
            <div class="field">
              <label for="pivotRenderer" class="font-semibold mb-2 block">Тип отображения</label>
              <Select
                id="pivotRenderer"
                v-model="pivotData.rendererName"
                :options="rendererOptions"
                optionLabel="label"
                optionValue="value"
                class="w-full"
                placeholder="Выберите тип"
              />
            </div>
          </div>
        </div>

        <!-- Sort Options -->
        <div class="grid">
          <div class="col-12 md:col-6">
            <div class="field">
              <label class="font-semibold mb-2 block">Сортировка строк</label>
              <div class="flex gap-3">
                <div class="flex align-items-center">
                  <RadioButton v-model="pivotData.rowOrder" inputId="rowAsc" value="key_a_to_z" />
                  <label for="rowAsc" class="ml-2">A → Z</label>
                </div>
                <div class="flex align-items-center">
                  <RadioButton v-model="pivotData.rowOrder" inputId="rowDesc" value="key_z_to_a" />
                  <label for="rowDesc" class="ml-2">Z → A</label>
                </div>
                <div class="flex align-items-center">
                  <RadioButton v-model="pivotData.rowOrder" inputId="rowVal" value="value_z_to_a" />
                  <label for="rowVal" class="ml-2">По значению ↓</label>
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 md:col-6">
            <div class="field">
              <label class="font-semibold mb-2 block">Сортировка столбцов</label>
              <div class="flex gap-3">
                <div class="flex align-items-center">
                  <RadioButton v-model="pivotData.colOrder" inputId="colAsc" value="key_a_to_z" />
                  <label for="colAsc" class="ml-2">A → Z</label>
                </div>
                <div class="flex align-items-center">
                  <RadioButton v-model="pivotData.colOrder" inputId="colDesc" value="key_z_to_a" />
                  <label for="colDesc" class="ml-2">Z → A</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Additional Options -->
        <div class="flex gap-4">
          <div class="flex align-items-center">
            <Checkbox v-model="pivotData.showTotals" inputId="showTotals" :binary="true" />
            <label for="showTotals" class="ml-2">Показывать итоги</label>
          </div>
          <div class="flex align-items-center">
            <Checkbox v-model="pivotData.enableFiltering" inputId="enableFiltering" :binary="true" />
            <label for="enableFiltering" class="ml-2">Включить фильтрацию</label>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="closePivotConfigDialog" text />
        <Button
          label="Сохранить"
          icon="pi pi-check"
          @click="savePivotConfig"
          :loading="loading.savePivot"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import IntegramBreadcrumb from './IntegramBreadcrumb.vue'

// PrimeVue Components

const props = defineProps({
  session: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['view-table'])

const toast = useToast()

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
  {
    label: 'Конструктор форм',
    icon: 'pi pi-sliders-h',
    to: undefined // Current page
  }
])

// State
const formsList = ref([])
const currentForm = ref(null)
const panels = ref([])
const loading = reactive({
  formsList: false,
  createForm: false,
  savePanel: false,
  saveField: false,
  saveButton: false,
  savePivot: false,
  pivotFields: false
})

// Dialog states
const showCreateFormDialog = ref(false)
const showAddPanelDialog = ref(false)
const showAddFieldDialog = ref(false)
const showAddButtonDialog = ref(false)
const showPivotConfigDialog = ref(false)

// Editing states
const editingPanel = ref(null)
const editingField = ref(null)
const editingButton = ref(null)
const currentPanelForField = ref(null)
const currentPanelForButton = ref(null)
const currentPanelForPivot = ref(null)

// Pivot config state
const pivotAvailableFields = ref([])
const pivotData = reactive({
  rows: [],
  cols: [],
  vals: [],
  aggregatorName: 'Count',
  rendererName: 'Table',
  rowOrder: 'key_a_to_z',
  colOrder: 'key_a_to_z',
  showTotals: true,
  enableFiltering: true
})

// Pivot aggregator options (matching pivotTable.js)
const aggregatorOptions = [
  { value: 'Count', label: 'Количество (Count)' },
  { value: 'Count Unique Values', label: 'Уникальные значения' },
  { value: 'List Unique Values', label: 'Список уникальных' },
  { value: 'Sum', label: 'Сумма (Sum)' },
  { value: 'Integer Sum', label: 'Целая сумма' },
  { value: 'Average', label: 'Среднее (Avg)' },
  { value: 'Median', label: 'Медиана' },
  { value: 'Sample Variance', label: 'Дисперсия' },
  { value: 'Sample Standard Deviation', label: 'Станд. отклонение' },
  { value: 'Minimum', label: 'Минимум' },
  { value: 'Maximum', label: 'Максимум' },
  { value: 'First', label: 'Первое значение' },
  { value: 'Last', label: 'Последнее значение' },
  { value: 'Sum over Sum', label: 'Сумма/Сумма' },
  { value: '80% Upper Bound', label: '80% верхняя граница' },
  { value: '80% Lower Bound', label: '80% нижняя граница' },
  { value: 'Sum as Fraction of Total', label: 'Доля от общего' },
  { value: 'Sum as Fraction of Rows', label: 'Доля от строки' },
  { value: 'Sum as Fraction of Columns', label: 'Доля от столбца' },
  { value: 'Count as Fraction of Total', label: 'Кол-во от общего' },
  { value: 'Count as Fraction of Rows', label: 'Кол-во от строки' },
  { value: 'Count as Fraction of Columns', label: 'Кол-во от столбца' }
]

// Pivot renderer options
const rendererOptions = [
  { value: 'Table', label: 'Таблица' },
  { value: 'Table Barchart', label: 'Таблица с барами' },
  { value: 'Heatmap', label: 'Тепловая карта' },
  { value: 'Row Heatmap', label: 'Тепловая карта (строки)' },
  { value: 'Col Heatmap', label: 'Тепловая карта (столбцы)' },
  { value: 'Line Chart', label: 'Линейный график' },
  { value: 'Bar Chart', label: 'Столбчатая диаграмма' },
  { value: 'Stacked Bar Chart', label: 'Накопительная диаграмма' },
  { value: 'Horizontal Bar Chart', label: 'Горизонтальные бары' },
  { value: 'Horizontal Stacked Bar Chart', label: 'Горизонтальные накоп.' },
  { value: 'Area Chart', label: 'Область' },
  { value: 'Scatter Chart', label: 'Точечная диаграмма' },
  { value: 'Treemap', label: 'Древовидная карта' }
]

// Form data
const newFormData = reactive({
  name: ''
})

const panelData = reactive({
  name: '',
  typeId: '',
  reportId: '',
  bgcolor: '',
  color: '',
  filter: '',
  nextAction: ''
})

const fieldData = reactive({
  fieldId: '',
  fieldAlias: '',
  fieldValue: ''
})

const buttonData = reactive({
  buttonAlias: '',
  buttonAction: '',
  buttonClass: ''
})

// API helpers
const API_BASE = computed(() => {
  const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8081'
  return `${orchestratorUrl}/api/integram/${props.session.database}`
})

const getHeaders = () => ({
  'X-Authorization': props.session.sessionId
})

// Load forms list
async function loadFormsList() {
  loading.formsList = true
  try {
    const response = await axios.get(`${API_BASE.value}/object/137`, {
      headers: getHeaders()
    })

    if (response.data && response.data['&main.a.&uni_obj.&uni_obj_all']) {
      const data = response.data['&main.a.&uni_obj.&uni_obj_all']
      formsList.value = data.id.map((id, index) => ({
        id: id,
        val: data.val[index]
      }))

      toast.add({
        severity: 'success',
        summary: 'Успешно',
        detail: `Загружено форм: ${formsList.value.length}`,
        life: 3000
      })
    }
  } catch (error) {
    console.error('Error loading forms:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить список форм',
      life: 3000
    })
  } finally {
    loading.formsList = false
  }
}

// Create new form
async function createForm() {
  loading.createForm = true
  try {
    const response = await axios.post(
      `${API_BASE.value}/_m_new`,
      `typ=137&t100=${encodeURIComponent(newFormData.name)}`,
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Форма создана',
      life: 3000
    })

    showCreateFormDialog.value = false
    newFormData.name = ''
    await loadFormsList()
  } catch (error) {
    console.error('Error creating form:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось создать форму',
      life: 3000
    })
  } finally {
    loading.createForm = false
  }
}

// Edit form
async function editForm(formId) {
  try {
    // Load form details
    const response = await axios.get(`${API_BASE.value}/object/${formId}`, {
      headers: getHeaders()
    })

    if (response.data && response.data.obj) {
      currentForm.value = response.data.obj
      // Load panels for this form
      await loadPanels(formId)
    }
  } catch (error) {
    console.error('Error loading form:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить форму',
      life: 3000
    })
  }
}

// Load panels for form
async function loadPanels(formId) {
  try {
    const response = await axios.get(`${API_BASE.value}/object/138?F_U=${formId}`, {
      headers: getHeaders()
    })

    if (response.data && response.data['&main.a.&uni_obj.&uni_obj_all']) {
      const data = response.data['&main.a.&uni_obj.&uni_obj_all']
      const reqs = response.data['&object_reqs']

      panels.value = data.id.map((id, index) => {
        // Parse pivot config from requisite 225 if present
        let pivotConfig = null
        if (reqs[id] && reqs[id][225]) {
          try {
            pivotConfig = typeof reqs[id][225] === 'string'
              ? JSON.parse(reqs[id][225])
              : reqs[id][225]
          } catch (e) {
            console.warn('Failed to parse pivot config for panel', id, e)
          }
        }

        return {
          id: id,
          val: data.val[index],
          type: reqs[id] ? reqs[id][0] : '',
          typeName: reqs[id] ? reqs[id][0] : '',
          report: reqs[id] ? reqs[id][1] : '',
          bgcolor: reqs[id] ? reqs[id][5] : '',
          color: reqs[id] ? reqs[id][4] : '',
          nextAction: reqs[id] ? reqs[id][6] : '',
          filter: reqs[id] ? reqs[id][7] : '',
          pivotConfig: pivotConfig,
          fields: [],
          buttons: []
        }
      })

      // Load fields and buttons for each panel
      for (const panel of panels.value) {
        await loadPanelFields(panel)
        await loadPanelButtons(panel)
      }
    }
  } catch (error) {
    console.error('Error loading panels:', error)
  }
}

// Load fields for panel
async function loadPanelFields(panel) {
  try {
    const response = await axios.get(`${API_BASE.value}/object/139?F_U=${panel.id}`, {
      headers: getHeaders()
    })

    if (response.data && response.data['&main.a.&uni_obj.&uni_obj_all']) {
      const data = response.data['&main.a.&uni_obj.&uni_obj_all']
      const reqs = response.data['&object_reqs']

      panel.fields = data.id.map((id, index) => ({
        id: id,
        fieldName: reqs[id] ? reqs[id][0] : '',
        fieldAlias: data.val[index],
        fieldValue: reqs[id] ? reqs[id][1] : ''
      }))
    }
  } catch (error) {
    console.error('Error loading panel fields:', error)
  }
}

// Load buttons for panel
async function loadPanelButtons(panel) {
  try {
    const response = await axios.get(`${API_BASE.value}/object/150?F_U=${panel.id}`, {
      headers: getHeaders()
    })

    if (response.data && response.data['&main.a.&uni_obj.&uni_obj_all']) {
      const data = response.data['&main.a.&uni_obj.&uni_obj_all']
      const reqs = response.data['&object_reqs']

      panel.buttons = data.id.map((id, index) => ({
        id: id,
        buttonAlias: data.val[index],
        buttonAction: reqs[id] ? reqs[id][0] : '',
        buttonClass: reqs[id] ? reqs[id][1] : ''
      }))
    }
  } catch (error) {
    console.error('Error loading panel buttons:', error)
  }
}

// View form (preview)
function viewForm(formId) {
  toast.add({
    severity: 'info',
    summary: 'Просмотр формы',
    detail: `Форма ID: ${formId}`,
    life: 3000
  })
  // TODO: Implement form preview
}

// Delete form
async function deleteForm(formId) {
  if (!confirm('Удалить форму?')) return

  try {
    await axios.post(
      `${API_BASE.value}/_m_delete/${formId}`,
      '_xsrf=',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Форма удалена',
      life: 3000
    })

    await loadFormsList()
  } catch (error) {
    console.error('Error deleting form:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить форму',
      life: 3000
    })
  }
}

// Close form editor
function closeFormEditor() {
  currentForm.value = null
  panels.value = []
}

// Update form name
async function updateFormName() {
  if (!currentForm.value) return

  try {
    await axios.post(
      `${API_BASE.value}/_m_save/${currentForm.value.id}`,
      `t100=${encodeURIComponent(currentForm.value.val)}`,
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Сохранено',
      detail: 'Название формы обновлено',
      life: 3000
    })
  } catch (error) {
    console.error('Error updating form name:', error)
  }
}

// Panel management
function editPanel(panel) {
  editingPanel.value = panel
  panelData.name = panel.val
  panelData.typeId = panel.type
  panelData.reportId = panel.report
  panelData.bgcolor = panel.bgcolor
  panelData.color = panel.color
  panelData.filter = panel.filter
  panelData.nextAction = panel.nextAction
  showAddPanelDialog.value = true
}

async function savePanel() {
  loading.savePanel = true
  try {
    if (editingPanel.value) {
      // Update existing panel
      await axios.post(
        `${API_BASE.value}/_m_save/${editingPanel.value.id}`,
        `t100=${encodeURIComponent(panelData.name)}&t102=${panelData.typeId}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    } else {
      // Create new panel
      await axios.post(
        `${API_BASE.value}/_m_new`,
        `typ=138&t100=${encodeURIComponent(panelData.name)}&t101=${currentForm.value.id}&t102=${panelData.typeId}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: editingPanel.value ? 'Панель обновлена' : 'Панель добавлена',
      life: 3000
    })

    closeAddPanelDialog()
    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error saving panel:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить панель',
      life: 3000
    })
  } finally {
    loading.savePanel = false
  }
}

function closeAddPanelDialog() {
  showAddPanelDialog.value = false
  editingPanel.value = null
  Object.assign(panelData, {
    name: '',
    typeId: '',
    reportId: '',
    bgcolor: '',
    color: '',
    filter: '',
    nextAction: ''
  })
}

async function deletePanel(panelId) {
  if (!confirm('Удалить панель?')) return

  try {
    await axios.post(
      `${API_BASE.value}/_m_delete/${panelId}`,
      '_xsrf=',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Панель удалена',
      life: 3000
    })

    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error deleting panel:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить панель',
      life: 3000
    })
  }
}

function movePanelUp(index) {
  if (index > 0) {
    const temp = panels.value[index]
    panels.value[index] = panels.value[index - 1]
    panels.value[index - 1] = temp
    // TODO: Save order to API
  }
}

function movePanelDown(index) {
  if (index < panels.value.length - 1) {
    const temp = panels.value[index]
    panels.value[index] = panels.value[index + 1]
    panels.value[index + 1] = temp
    // TODO: Save order to API
  }
}

// Field management
function openAddFieldDialog(panel) {
  currentPanelForField.value = panel
  showAddFieldDialog.value = true
}

function editField(panel, field) {
  currentPanelForField.value = panel
  editingField.value = field
  fieldData.fieldId = field.fieldName
  fieldData.fieldAlias = field.fieldAlias
  fieldData.fieldValue = field.fieldValue
  showAddFieldDialog.value = true
}

async function saveField() {
  loading.saveField = true
  try {
    if (editingField.value) {
      // Update existing field
      await axios.post(
        `${API_BASE.value}/_m_save/${editingField.value.id}`,
        `t100=${encodeURIComponent(fieldData.fieldAlias)}&t102=${fieldData.fieldId}&t103=${encodeURIComponent(fieldData.fieldValue)}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    } else {
      // Create new field
      await axios.post(
        `${API_BASE.value}/_m_new`,
        `typ=139&t100=${encodeURIComponent(fieldData.fieldAlias)}&t101=${currentPanelForField.value.id}&t102=${fieldData.fieldId}&t103=${encodeURIComponent(fieldData.fieldValue)}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: editingField.value ? 'Поле обновлено' : 'Поле добавлено',
      life: 3000
    })

    closeAddFieldDialog()
    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error saving field:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить поле',
      life: 3000
    })
  } finally {
    loading.saveField = false
  }
}

function closeAddFieldDialog() {
  showAddFieldDialog.value = false
  editingField.value = null
  currentPanelForField.value = null
  Object.assign(fieldData, {
    fieldId: '',
    fieldAlias: '',
    fieldValue: ''
  })
}

async function deleteField(panel, fieldId) {
  if (!confirm('Удалить поле?')) return

  try {
    await axios.post(
      `${API_BASE.value}/_m_delete/${fieldId}`,
      '_xsrf=',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Поле удалено',
      life: 3000
    })

    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error deleting field:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить поле',
      life: 3000
    })
  }
}

// Button management
function openAddButtonDialog(panel) {
  currentPanelForButton.value = panel
  showAddButtonDialog.value = true
}

function editButton(panel, button) {
  currentPanelForButton.value = panel
  editingButton.value = button
  buttonData.buttonAlias = button.buttonAlias
  buttonData.buttonAction = button.buttonAction
  buttonData.buttonClass = button.buttonClass
  showAddButtonDialog.value = true
}

async function saveButton() {
  loading.saveButton = true
  try {
    if (editingButton.value) {
      // Update existing button
      await axios.post(
        `${API_BASE.value}/_m_save/${editingButton.value.id}`,
        `t100=${encodeURIComponent(buttonData.buttonAlias)}&t102=${encodeURIComponent(buttonData.buttonAction)}&t103=${encodeURIComponent(buttonData.buttonClass)}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    } else {
      // Create new button
      await axios.post(
        `${API_BASE.value}/_m_new`,
        `typ=150&t100=${encodeURIComponent(buttonData.buttonAlias)}&t101=${currentPanelForButton.value.id}&t102=${encodeURIComponent(buttonData.buttonAction)}&t103=${encodeURIComponent(buttonData.buttonClass)}`,
        {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: editingButton.value ? 'Кнопка обновлена' : 'Кнопка добавлена',
      life: 3000
    })

    closeAddButtonDialog()
    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error saving button:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить кнопку',
      life: 3000
    })
  } finally {
    loading.saveButton = false
  }
}

function closeAddButtonDialog() {
  showAddButtonDialog.value = false
  editingButton.value = null
  currentPanelForButton.value = null
  Object.assign(buttonData, {
    buttonAlias: '',
    buttonAction: '',
    buttonClass: ''
  })
}

async function deleteButton(panel, buttonId) {
  if (!confirm('Удалить кнопку?')) return

  try {
    await axios.post(
      `${API_BASE.value}/_m_delete/${buttonId}`,
      '_xsrf=',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Кнопка удалена',
      life: 3000
    })

    await loadPanels(currentForm.value.id)
  } catch (error) {
    console.error('Error deleting button:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить кнопку',
      life: 3000
    })
  }
}

// Pivot Config management
function openPivotConfig(panel) {
  currentPanelForPivot.value = panel
  pivotAvailableFields.value = []

  // Load existing config if any
  if (panel.pivotConfig) {
    Object.assign(pivotData, {
      rows: panel.pivotConfig.rows || [],
      cols: panel.pivotConfig.cols || [],
      vals: panel.pivotConfig.vals || [],
      aggregatorName: panel.pivotConfig.aggregatorName || 'Count',
      rendererName: panel.pivotConfig.rendererName || 'Table',
      rowOrder: panel.pivotConfig.rowOrder || 'key_a_to_z',
      colOrder: panel.pivotConfig.colOrder || 'key_a_to_z',
      showTotals: panel.pivotConfig.showTotals !== false,
      enableFiltering: panel.pivotConfig.enableFiltering !== false
    })
  } else {
    // Reset to defaults
    Object.assign(pivotData, {
      rows: [],
      cols: [],
      vals: [],
      aggregatorName: 'Count',
      rendererName: 'Table',
      rowOrder: 'key_a_to_z',
      colOrder: 'key_a_to_z',
      showTotals: true,
      enableFiltering: true
    })
  }

  showPivotConfigDialog.value = true
}

function closePivotConfigDialog() {
  showPivotConfigDialog.value = false
  currentPanelForPivot.value = null
  pivotAvailableFields.value = []
}

async function loadReportFields() {
  if (!currentPanelForPivot.value?.report) {
    toast.add({
      severity: 'warn',
      summary: 'Внимание',
      detail: 'У панели не указан отчет',
      life: 3000
    })
    return
  }

  loading.pivotFields = true
  try {
    // Execute report to get column headers
    const response = await axios.get(
      `${API_BASE.value}/report/${currentPanelForPivot.value.report}?LIMIT=1`,
      { headers: getHeaders() }
    )

    if (response.data) {
      // Extract field names from the report response
      // Reports return data in format: { '&rep.XXX': { col: [...], data: [...] } }
      const reportData = response.data
      const reportKey = Object.keys(reportData).find(key => key.startsWith('&rep.'))

      if (reportKey && reportData[reportKey]?.col) {
        pivotAvailableFields.value = reportData[reportKey].col.filter(col => col && col.trim())
        toast.add({
          severity: 'success',
          summary: 'Загружено',
          detail: `Найдено полей: ${pivotAvailableFields.value.length}`,
          life: 3000
        })
      } else {
        // Try to extract from headers or alternative structure
        const keys = Object.keys(reportData).filter(k => !k.startsWith('&'))
        if (keys.length > 0) {
          pivotAvailableFields.value = keys
        } else {
          toast.add({
            severity: 'warn',
            summary: 'Внимание',
            detail: 'Не удалось извлечь поля из отчета',
            life: 3000
          })
        }
      }
    }
  } catch (error) {
    console.error('Error loading report fields:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить поля отчета',
      life: 3000
    })
  } finally {
    loading.pivotFields = false
  }
}

function addFieldToPivot(field) {
  // Add to rows by default, if rows has content add to cols
  if (!pivotData.rows.includes(field) && !pivotData.cols.includes(field)) {
    if (pivotData.rows.length === 0) {
      pivotData.rows.push(field)
    } else if (pivotData.cols.length === 0) {
      pivotData.cols.push(field)
    } else {
      // Add to vals if both rows and cols have values
      if (!pivotData.vals.includes(field)) {
        pivotData.vals.push(field)
      }
    }
    toast.add({
      severity: 'success',
      summary: 'Добавлено',
      detail: `Поле "${field}" добавлено`,
      life: 2000
    })
  } else {
    toast.add({
      severity: 'info',
      summary: 'Информация',
      detail: `Поле "${field}" уже добавлено`,
      life: 2000
    })
  }
}

async function savePivotConfig() {
  if (!currentPanelForPivot.value) return

  loading.savePivot = true
  try {
    // Build pivot config object (compatible with pivotTable.js format)
    const config = {
      rows: pivotData.rows,
      cols: pivotData.cols,
      vals: pivotData.vals,
      aggregatorName: pivotData.aggregatorName,
      rendererName: pivotData.rendererName,
      rowOrder: pivotData.rowOrder,
      colOrder: pivotData.colOrder,
      showTotals: pivotData.showTotals,
      enableFiltering: pivotData.enableFiltering,
      // Add metadata for legacy compatibility
      rendererOptions: {
        localeStrings: {
          renderError: 'Ошибка отрисовки сводной таблицы.',
          computeError: 'Ошибка вычисления сводной таблицы.',
          uiRenderError: 'Ошибка отрисовки интерфейса сводной таблицы.',
          selectAll: 'Выбрать все',
          selectNone: 'Снять выбор',
          tooMany: '(слишком много для отображения)',
          filterResults: 'Фильтровать результаты',
          apply: 'Применить',
          cancel: 'Отмена',
          totals: 'Итого',
          vs: 'vs',
          by: 'по'
        }
      }
    }

    // Save to requisite 225 (Pivot Config) via _m_set
    const configJson = JSON.stringify(config)
    await axios.post(
      `${API_BASE.value}/_m_set/${currentPanelForPivot.value.id}?t225=${encodeURIComponent(configJson)}`,
      '',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    // Update local panel data
    currentPanelForPivot.value.pivotConfig = config

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Конфигурация Pivot сохранена',
      life: 3000
    })

    closePivotConfigDialog()
  } catch (error) {
    console.error('Error saving pivot config:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось сохранить конфигурацию Pivot',
      life: 3000
    })
  } finally {
    loading.savePivot = false
  }
}

async function clearPivotConfig(panel) {
  if (!confirm('Очистить настройки сводной таблицы?')) return

  try {
    // Clear requisite 225
    await axios.post(
      `${API_BASE.value}/_m_set/${panel.id}?t225=`,
      '',
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    // Update local panel data
    panel.pivotConfig = null

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Настройки Pivot очищены',
      life: 3000
    })
  } catch (error) {
    console.error('Error clearing pivot config:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось очистить настройки Pivot',
      life: 3000
    })
  }
}
</script>

<style scoped>
.integram-form-builder {
  /* Component styles */
}

.cursor-pointer {
  cursor: pointer;
}

.cursor-pointer:hover {
  opacity: 0.8;
}

:deep(.p-chips-token) {
  margin: 0.125rem;
}

:deep(.p-chip) {
  transition: all 0.2s;
}

:deep(.p-chip:hover) {
  background: var(--primary-100);
  transform: scale(1.02);
}
</style>
