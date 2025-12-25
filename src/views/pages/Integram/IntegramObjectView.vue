<template>
  <div class="integram-object-view-container">
    <!-- Breadcrumb -->
    <IntegramBreadcrumb :items="breadcrumbItems" />

    <Card>
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <span>{{ typeData?.val || 'Загрузка...' }}</span>
          <div class="flex gap-2 align-items-center ml-auto">
            <!-- Main controls -->
            <Button
              icon="pi pi-plus"
              label="Добавить"
              size="small"
              @click="addRecord"
              v-tooltip.bottom="'Добавить запись в таблицу'"
              :disabled="loading"
            />

            <Button
              icon="pi pi-filter"
              size="small"
              outlined
              @click="showFilters = !showFilters"
              v-tooltip.bottom="'Показать/скрыть фильтры'"
            />

            <Button
              icon="pi pi-filter-slash"
              size="small"
              outlined
              @click="clearFilters"
              v-tooltip.bottom="'Очистить фильтры'"
              v-if="hasActiveFilters"
            />

            <Button
              icon="pi pi-refresh"
              size="small"
              outlined
              @click="loadObjects"
              v-tooltip.bottom="'Обновить'"
              :loading="loading"
            />

            <Button
              icon="pi pi-pencil"
              size="small"
              outlined
              @click="toggleInlineEdit"
              :class="{ 'button-on': inlineEditEnabled }"
              v-tooltip.bottom="'Редактировать ячейки'"
            />

            <Dropdown
              v-model="compactMode"
              :options="compactModes"
              optionLabel="label"
              optionValue="value"
              placeholder="Режим"
              size="small"
              @change="applyCompactMode"
            />

            <Button
              :icon="infiniteScrollEnabled ? 'pi pi-arrows-v' : 'pi pi-list'"
              size="small"
              :outlined="!infiniteScrollEnabled"
              @click="toggleInfiniteScroll"
              v-tooltip.bottom="infiniteScrollEnabled ? 'Infinite Scroll (вкл)' : 'Обычная пагинация'"
              :class="{ 'button-on': infiniteScrollEnabled }"
            />

            <Button
              icon="pi pi-ellipsis-h"
              size="small"
              text
              @click="toggleExtraControls"
              v-tooltip.bottom="'Ещё'"
            />
          </div>
        </div>

        <!-- Extra Controls Panel -->
        <div v-if="showExtraControls" class="extra-controls-panel mt-2 p-2 surface-50 border-round flex gap-2 flex-wrap">
          <Button
            label="Скачать CSV"
            icon="pi pi-file-export"
            size="small"
            outlined
            @click="exportToCSV"
            v-tooltip.bottom="'Скачать данные в формате CSV'"
          />
          <Button
            label="Экспорт BKI"
            icon="pi pi-download"
            size="small"
            outlined
            @click="exportToBKI"
            v-tooltip.bottom="'Экспортировать в BKI формат'"
          />
          <Button
            label="Импорт BKI"
            icon="pi pi-upload"
            size="small"
            outlined
            @click="triggerBKIFileInput"
            v-tooltip.bottom="'Импортировать из BKI файла'"
          />
          <input
            ref="bkiFileInput"
            type="file"
            accept=".bki"
            style="display: none"
            @change="handleBKIFileSelect"
          />
          <Button
            label="Удалить по фильтру"
            icon="pi pi-trash"
            size="small"
            outlined
            severity="danger"
            @click="showDeleteByFilterDialog = true"
            v-tooltip.bottom="'Удалить все записи, соответствующие текущему фильтру'"
            :disabled="filteredObjects.length === 0"
          />
          <Button
            label="Добавить колонку"
            icon="pi pi-plus-circle"
            size="small"
            outlined
            @click="showAddColumnDialog = true"
            v-tooltip.bottom="'Добавить новую колонку в таблицу'"
          />
        </div>
      </template>

      <template #content>
        <div v-if="loading && !objectsData" class="text-center py-5">
          <ProgressSpinner />
        </div>

        <div v-else-if="error" class="text-center py-5">
          <Message severity="error" :closable="false">{{ error }}</Message>
        </div>

        <div v-else-if="objectsData" ref="tableWrapperRef" class="table-wrapper">
          <!-- Filter row -->
          <div v-if="showFilters && requisites.length > 0" class="filter-panel mb-3 p-3 border-round surface-50">
            <div class="grid">
              <div class="col-12 md:col-3">
                <label class="text-sm mb-2 block">Значение</label>
                <InputText
                  v-model="filters.val"
                  placeholder="Фильтр по значению"
                  class="w-full"
                  size="small"
                />
              </div>
              <div v-for="req in requisites" :key="req.id" class="col-12 md:col-3">
                <label class="text-sm mb-2 block">{{ req.val }}</label>
                <InputText
                  v-model="filters[`req_${req.id}`]"
                  :placeholder="`Filter by ${req.val}`"
                  class="w-full"
                  size="small"
                />
              </div>
            </div>
          </div>

          <!-- Objects Table -->
          <DataTable
            :value="filteredObjects"
            :paginator="false"
            sortMode="multiple"
            removableSort
            stripedRows
            :class="['integram-table', `mode-${compactMode}`]"
            tableStyle="min-width: 50rem"
            @row-click="onRowClick"
          >
            <!-- Column N (Order number) -->
            <Column
              field="ord"
              header="N"
              style="width: 60px; text-align: center"
              headerStyle="text-align: center"
              sortable
            >
              <template #body="slotProps">
                <span class="text-color-secondary text-sm">{{ slotProps.index + 1 }}</span>
              </template>
            </Column>

            <!-- Main Value Column (with type name as header) -->
            <Column
              field="val"
              :header="typeData?.val || 'Value'"
              sortable
              style="min-width: 200px"
            >
              <template #body="slotProps">
                <div
                  :class="{
                    'editable-cell': inlineEditEnabled,
                    'editing': editingCell?.rowId === slotProps.data.id && editingCell?.field === 'val'
                  }"
                  @click="handleCellClick(slotProps.data, 'val', slotProps.data.val, 'TEXT')"
                >
                  <template v-if="editingCell?.rowId === slotProps.data.id && editingCell?.field === 'val'">
                    <InputText
                      v-model="editingValue"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data)"
                      @keydown.enter="saveEdit(slotProps.data)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <router-link
                      :to="`/integram/${database}/edit_obj/${slotProps.data.id}`"
                      class="value-link"
                    >
                      {{ slotProps.data.val }}
                    </router-link>
                  </template>
                </div>
              </template>
            </Column>

            <!-- Requisite columns -->
            <Column
              v-for="req in requisites"
              :key="req.id"
              :field="`req_${req.id}`"
              :header="req.val"
              sortable
            >
              <template #body="slotProps">
                <div
                  :class="{
                    'editable-cell': inlineEditEnabled,
                    'editing': editingCell?.rowId === slotProps.data.id && editingCell?.field === `req_${req.id}`,
                    'cell-dir': req.refType
                  }"
                  @click="handleCellClick(slotProps.data, `req_${req.id}`, getRequisiteValue(slotProps.data.id, req.id), req.base || 'TEXT', req)"
                >
                  <template v-if="editingCell?.rowId === slotProps.data.id && editingCell?.field === `req_${req.id}`">
                    <!-- GRANT type - special dropdown with system grants + tables -->
                    <Dropdown
                      v-if="req.base === 'GRANT' || req.baseId === 5"
                      v-model="editingValue"
                      :options="grantOptions"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Select grant..."
                      class="inline-edit w-full"
                      :loading="loadingGrants"
                      @change="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      filter
                      showClear
                      autofocus
                    >
                      <template #option="slotProps">
                        <div class="flex align-items-center gap-2">
                          <i :class="slotProps.option.icon"></i>
                          <span>{{ slotProps.option.label }}</span>
                        </div>
                      </template>
                    </Dropdown>
                    <!-- Reference/Directory field - show Dropdown -->
                    <Dropdown
                      v-else-if="req.refType"
                      v-model="editingValue"
                      :options="referenceOptions[req.refType] || []"
                      optionLabel="val"
                      optionValue="id"
                      placeholder="Select..."
                      class="inline-edit w-full"
                      :loading="loadingReferenceOptions"
                      @change="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      filter
                      showClear
                      autofocus
                    />
                    <!-- Different input types based on requisite base type -->
                    <InputNumber
                      v-else-if="req.base === 'NUMBER' || req.base === 'SIGNED'"
                      v-model="editingValue"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Checkbox
                      v-else-if="req.base === 'BOOLEAN'"
                      v-model="editingValue"
                      binary
                      @change="saveEdit(slotProps.data, req.id)"
                    />
                    <Calendar
                      v-else-if="req.base === 'DATE'"
                      v-model="editingValue"
                      dateFormat="yy-mm-dd"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Calendar
                      v-else-if="req.base === 'DATETIME'"
                      v-model="editingValue"
                      showTime
                      dateFormat="yy-mm-dd"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <Textarea
                      v-else-if="req.base === 'MEMO'"
                      v-model="editingValue"
                      class="inline-edit w-full"
                      rows="3"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                    <InputText
                      v-else
                      v-model="editingValue"
                      class="inline-edit w-full"
                      @blur="saveEdit(slotProps.data, req.id)"
                      @keydown.enter="saveEdit(slotProps.data, req.id)"
                      @keydown.esc="cancelEdit"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <!-- GRANT type - show Badge with severity -->
                    <template v-if="req.base === 'GRANT' || req.baseId === 5">
                      <Badge
                        :value="formatGrantValue(getRequisiteValue(slotProps.data.id, req.id))"
                        :severity="getGrantSeverity(getRequisiteValue(slotProps.data.id, req.id))"
                        v-tooltip.top="getGrantWarning(getRequisiteValue(slotProps.data.id, req.id))"
                      >
                        <template #default>
                          <i :class="getGrantIcon(getRequisiteValue(slotProps.data.id, req.id))" class="mr-1"></i>
                          {{ formatGrantValue(getRequisiteValue(slotProps.data.id, req.id)) }}
                        </template>
                      </Badge>
                    </template>
                    <span v-else-if="req.base === 'BOOLEAN'">
                      {{ getRequisiteValue(slotProps.data.id, req.id) === 'X' ? '✓' : '' }}
                    </span>
                    <span v-else :class="{ 'dir': req.refType }">
                      {{ getRequisiteValue(slotProps.data.id, req.id) }}
                    </span>
                  </template>
                </div>
              </template>
            </Column>

            <!-- Actions Column -->
            <Column header="" style="width: 160px">
              <template #body="slotProps">
                <div class="flex gap-1 justify-content-end action-buttons">
                  <Button
                    icon="pi pi-arrow-up"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    @click.stop="moveObjectUp(slotProps.data.id)"
                    v-tooltip.bottom="'Переместить вверх'"
                  />
                  <Button
                    icon="pi pi-link"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    @click.stop="showReferences(slotProps.data)"
                    v-tooltip.bottom="'Показать ссылки'"
                  />
                  <Button
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    @click.stop="editObject(slotProps.data.id)"
                    v-tooltip.bottom="'Редактировать'"
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    rounded
                    size="small"
                    severity="danger"
                    @click.stop="confirmDelete(slotProps.data)"
                    v-tooltip.bottom="'Удалить'"
                  />
                </div>
              </template>
            </Column>

            <template #empty>
              <div class="text-center py-4">
                <i class="pi pi-inbox text-4xl text-color-secondary mb-2"></i>
                <p class="text-color-secondary">Объекты не найдены</p>
              </div>
            </template>
          </DataTable>

          <!-- Infinite Scroll: Loading indicator -->
          <div v-if="infiniteScrollEnabled && loadingMore" class="mt-3 text-center py-3">
            <ProgressSpinner style="width: 30px; height: 30px" />
            <span class="ml-2 text-color-secondary">Загрузка...</span>
          </div>

          <!-- Infinite Scroll: End of data indicator -->
          <div v-if="infiniteScrollEnabled && !hasMoreData && objectsList.length > 0" class="mt-3 text-center text-color-secondary text-sm py-2">
            <i class="pi pi-check-circle mr-2"></i>Все данные загружены ({{ objectsList.length }} записей)
          </div>

          <!-- Custom Pagination (hidden in infinite scroll mode) -->
          <div v-if="!infiniteScrollEnabled && (totalPages > 1 || objectsList.length >= rowsPerPage)" class="mt-3 flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="text-color-secondary text-sm">
              Страница {{ currentPage }} из {{ totalPages }}
              <span v-if="totalObjects">
                ({{ totalObjects }} объектов)
              </span>
            </div>
            <div class="flex gap-2 align-items-center">
              <Button
                icon="pi pi-angle-left"
                size="small"
                outlined
                :disabled="currentPage === 1"
                @click="goToPage(currentPage - 1)"
                v-tooltip.bottom="'Предыдущая'"
              />
              <span class="text-sm">{{ currentPage }}</span>
              <Button
                icon="pi pi-angle-right"
                size="small"
                outlined
                :disabled="currentPage >= totalPages || objectsList.length < rowsPerPage"
                @click="goToPage(currentPage + 1)"
                v-tooltip.bottom="'Следующая'"
              />
              <Dropdown
                v-model="rowsPerPage"
                :options="[10, 20, 25, 50, 100]"
                @change="handleRowsPerPageChange"
                size="small"
                class="w-auto"
              />
            </div>
          </div>

          <!-- Summary -->
          <div class="mt-3 text-color-secondary text-sm">
            Показано {{ filteredObjects.length }} объектов
            <span v-if="infiniteScrollEnabled"> (infinite scroll)</span>
            <span v-if="hasActiveFilters">
              (фильтры применены)
            </span>
          </div>
        </div>
      </template>
    </Card>

    <!-- Create Object Dialog -->
    <Dialog
      v-model:visible="showCreateDialog"
      modal
      :header="'Создать: ' + (typeData?.val || 'Объект')"
      :style="{ width: '50rem' }"
      :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
    >
      <div class="flex flex-column gap-3">
        <div class="field">
          <label for="objectValue">Значение *</label>
          <InputText
            id="objectValue"
            v-model="createForm.value"
            placeholder="Введите значение"
            class="w-full"
          />
        </div>

        <!-- Parent info (auto-detected from F_U URL param) -->
        <div v-if="typeData?.up !== '0'" class="field">
          <label>Родитель</label>
          <div class="p-inputgroup">
            <span class="p-inputgroup-addon">
              <i class="pi pi-link"></i>
            </span>
            <InputText
              :value="route.query.F_U || 'Не указан'"
              disabled
              class="w-full"
            />
          </div>
          <small v-if="route.query.F_U" class="text-green-500">
            <i class="pi pi-check"></i> Родитель определён автоматически из контекста
          </small>
          <small v-else class="text-orange-500">
            <i class="pi pi-exclamation-triangle"></i> Откройте таблицу из родительской записи для создания подчинённых объектов
          </small>
        </div>

        <!-- Requisites -->
        <Divider v-if="requisites.length > 0" />
        <div v-for="req in requisites" :key="req.id" class="field">
          <label :for="'req_' + req.id">{{ req.val }}</label>

          <!-- GRANT type - special dropdown -->
          <Dropdown
            v-if="req.base === 'GRANT' || req.baseId === 5"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :options="grantOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="'Выберите ' + req.val"
            class="w-full"
            :loading="loadingGrants"
            filter
            showClear
          >
            <template #option="slotProps">
              <div class="flex align-items-center gap-2">
                <i :class="slotProps.option.icon"></i>
                <span>{{ slotProps.option.label }}</span>
              </div>
            </template>
          </Dropdown>
          <InputNumber
            v-else-if="req.base === 'NUMBER' || req.base === 'SIGNED'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
          />
          <Checkbox
            v-else-if="req.base === 'BOOLEAN'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            binary
          />
          <Calendar
            v-else-if="req.base === 'DATE'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            dateFormat="yy-mm-dd"
            class="w-full"
          />
          <Calendar
            v-else-if="req.base === 'DATETIME'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            showTime
            dateFormat="yy-mm-dd"
            class="w-full"
          />
          <Textarea
            v-else-if="req.base === 'MEMO'"
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
            rows="3"
          />
          <InputText
            v-else
            :id="'req_' + req.id"
            v-model="createForm.requisites[req.id]"
            :placeholder="'Введите ' + req.val"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" text @click="showCreateDialog = false" />
        <Button
          label="Создать"
          :loading="creating"
          @click="handleCreate"
          :disabled="!createForm.value || (typeData?.up !== '0' && !route.query.F_U)"
        />
      </template>
    </Dialog>

    <!-- Delete by Filter Dialog -->
    <Dialog
      v-model:visible="showDeleteByFilterDialog"
      header="Удаление по фильтру"
      :style="{ width: '450px' }"
      :modal="true"
      @hide="deleteByFilterConfirmText = ''"
    >
      <div class="p-3">
        <Message severity="warn" :closable="false" class="mb-3">
          <p class="font-bold mb-2">⚠️ Внимание!</p>
          <p>Будут удалены все записи, соответствующие текущему фильтру.</p>
          <p class="mt-2">Количество записей для удаления: <strong>{{ filteredObjects.length }}</strong></p>
        </Message>

        <div v-if="hasActiveFilters" class="mb-3 p-2 surface-100 border-round">
          <p class="text-sm font-medium mb-1">Активные фильтры:</p>
          <p class="text-sm text-color-secondary">
            <span v-if="filters.val">Значение: "{{ filters.val }}"</span>
            <span v-for="(value, key) in filters" :key="key" v-if="key.startsWith('req_') && value">
              , {{ getRequisiteName(key) }}: "{{ value }}"
            </span>
          </p>
        </div>
        <div v-else class="mb-3 p-2 surface-100 border-round">
          <p class="text-sm text-orange-500 font-bold">⚠️ Фильтры не активны - будут удалены ВСЕ записи!</p>
        </div>

        <p class="mb-2">Для подтверждения введите <strong>УДАЛИТЬ</strong>:</p>
        <InputText
          v-model="deleteByFilterConfirmText"
          placeholder="Введите УДАЛИТЬ"
          class="w-full"
        />
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showDeleteByFilterDialog = false"
          text
        />
        <Button
          label="Удалить"
          icon="pi pi-trash"
          severity="danger"
          @click="executeDeleteByFilter"
          :disabled="deleteByFilterConfirmText !== 'УДАЛИТЬ'"
          :loading="deletingByFilter"
        />
      </template>
    </Dialog>

    <!-- Show References Dialog -->
    <Dialog
      v-model:visible="showReferencesDialog"
      :header="'Ссылки на: ' + (selectedObjectForReferences?.val || '')"
      :style="{ width: '600px' }"
      :modal="true"
    >
      <div v-if="loadingReferences" class="text-center py-4">
        <ProgressSpinner style="width: 50px; height: 50px" />
        <p class="mt-2 text-color-secondary">Загрузка ссылок...</p>
      </div>

      <div v-else-if="referencesData.length === 0" class="text-center py-4">
        <i class="pi pi-check-circle text-4xl text-green-500 mb-3"></i>
        <p class="text-color-secondary">На этот объект нет ссылок</p>
        <p class="text-sm text-color-secondary">Объект можно безопасно удалить</p>
      </div>

      <div v-else>
        <Message severity="info" :closable="false" class="mb-3">
          Найдено {{ referencesData.length }} ссылок на этот объект
        </Message>

        <DataTable :value="referencesData" :paginator="referencesData.length > 10" :rows="10" class="p-datatable-sm">
          <Column field="typeName" header="Таблица" style="width: 40%">
            <template #body="slotProps">
              <router-link :to="`/integram/${database}/object/${slotProps.data.typeId}`" class="text-primary">
                {{ slotProps.data.typeName }}
              </router-link>
            </template>
          </Column>
          <Column field="objectName" header="Объект" style="width: 40%">
            <template #body="slotProps">
              <router-link :to="`/integram/${database}/edit_obj/${slotProps.data.objectId}`" class="text-primary">
                {{ slotProps.data.objectName }}
              </router-link>
            </template>
          </Column>
          <Column field="fieldName" header="Поле" style="width: 20%">
            <template #body="slotProps">
              <span class="text-color-secondary">{{ slotProps.data.fieldName }}</span>
            </template>
          </Column>
        </DataTable>
      </div>

      <template #footer>
        <Button
          label="Закрыть"
          icon="pi pi-times"
          @click="showReferencesDialog = false"
          text
        />
      </template>
    </Dialog>

    <!-- Add Column Dialog -->
    <Dialog
      v-model:visible="showAddColumnDialog"
      header="Добавить колонку"
      :style="{ width: '450px' }"
      :modal="true"
      @hide="resetAddColumnForm"
    >
      <div class="flex flex-column gap-3 p-2">
        <div class="field">
          <label class="font-semibold mb-2 block">Название колонки</label>
          <InputText
            v-model="addColumnForm.name"
            placeholder="Введите название"
            class="w-full"
            @keyup="validateAddColumnForm"
          />
        </div>

        <div class="field">
          <label class="font-semibold mb-2 block">Тип данных</label>
          <Dropdown
            v-model="addColumnForm.baseTypeId"
            :options="columnBaseTypes"
            optionLabel="name"
            optionValue="id"
            placeholder="Выберите тип"
            class="w-full"
            @change="validateAddColumnForm"
          />
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox
            v-model="addColumnForm.isDictionary"
            :binary="true"
            inputId="isDictionary"
          />
          <label for="isDictionary" class="cursor-pointer">
            Справочник (создать отдельную таблицу для значений)
          </label>
        </div>

        <div v-if="addColumnForm.isDictionary" class="field flex align-items-center gap-2 ml-4">
          <Checkbox
            v-model="addColumnForm.isMultiSelect"
            :binary="true"
            inputId="isMultiSelect"
          />
          <label for="isMultiSelect" class="cursor-pointer">
            Мульти-выбор (можно выбрать несколько значений)
          </label>
        </div>
      </div>

      <template #footer>
        <Button
          label="Отмена"
          icon="pi pi-times"
          @click="showAddColumnDialog = false"
          text
        />
        <Button
          label="Добавить"
          icon="pi pi-plus"
          @click="executeAddColumn"
          :disabled="!isAddColumnFormValid"
          :loading="addingColumn"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useIntegramSession } from '@/composables/useIntegramSession';
import { useGrants } from '@/composables/useGrants';
import integramApiClient from '@/services/integramApiClient';
import IntegramBreadcrumb from '@/components/integram/IntegramBreadcrumb.vue';

// PrimeVue Components

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { isAuthenticated } = useIntegramSession();

// GRANT composable for handling GRANT type (type 5)
const {
  grantOptions,
  loading: loadingGrants,
  formatGrantValue,
  getGrantSeverity,
  getGrantIcon,
  isSystemGrant,
  getGrantWarning
} = useGrants();

// Props from route
const typeId = ref(route.params.typeId);

// Computed - database from route params
const database = computed(() => route.params.database || integramApiClient.getDatabase() || '');

// State
const loading = ref(false);
const error = ref(null);
const creating = ref(false);
const saving = ref(false);
const showCreateDialog = ref(false);
const showFilters = ref(false);
const showExtraControls = ref(false);
const inlineEditEnabled = ref(false);
const showDeleteByFilterDialog = ref(false);
const deleteByFilterConfirmText = ref('');
const deletingByFilter = ref(false);
const bkiFileInput = ref(null);
const importingBKI = ref(false);
const showReferencesDialog = ref(false);
const referencesData = ref([]);
const loadingReferences = ref(false);
const selectedObjectForReferences = ref(null);

// Add Column state
const showAddColumnDialog = ref(false);
const addingColumn = ref(false);
const addColumnForm = ref({
  name: '',
  baseTypeId: 3, // Default: SHORT text
  isDictionary: false,
  isMultiSelect: false
});

// Column base types for dropdown
const columnBaseTypes = [
  { id: 3, name: 'Текст (SHORT)' },
  { id: 2, name: 'Длинный текст (LONG)' },
  { id: 13, name: 'Число (NUMBER)' },
  { id: 4, name: 'Дата и время (DATETIME)' },
  { id: 9, name: 'Дата (DATE)' },
  { id: 7, name: 'Да/Нет (BOOL)' }
];

// Editing state
const editingCell = ref(null);
const editingValue = ref(null);

// Data
const objectsData = ref(null);
const typeData = ref(null);
const requisites = ref([]);
const objectsList = ref([]);
const requisitesData = ref({});
const referenceOptions = ref({}); // Cache for reference/directory options by refType ID
const loadingReferenceOptions = ref(false);

// View modes
const compactMode = ref('normal');
const compactModes = [
  { label: 'Обычный', value: 'normal' },
  { label: 'Компактный', value: 'compact' },
  { label: 'Фикс. высота', value: 'fixed' },
  { label: 'Фикс. ширина', value: 'ultra' }
];

const rowsPerPage = ref(25);
const currentPage = ref(1);
const totalPages = ref(1);
const totalObjects = ref(0);

// Infinite scroll state
const infiniteScrollEnabled = ref(false);
const loadingMore = ref(false);
const hasMoreData = ref(true);
const tableWrapperRef = ref(null);

// Filters
const filters = ref({
  val: ''
});

// Create form
const createForm = ref({
  value: '',
  up: '',
  requisites: {}
});

// Computed
// Breadcrumb items
const breadcrumbItems = computed(() => {
  const tablePath = `/integram/${database.value}/table`;

  return [
    { label: 'Таблицы', to: tablePath, icon: 'pi pi-table' },
    { label: typeData.value?.val || 'Объекты', icon: 'pi pi-bars' }
  ];
});

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v && v.length > 0);
});

// Add Column form validation
const isAddColumnFormValid = computed(() => {
  return addColumnForm.value.name.trim().length > 0 && addColumnForm.value.baseTypeId;
});

const filteredObjects = computed(() => {
  if (!hasActiveFilters.value) {
    return objectsList.value;
  }

  return objectsList.value.filter(obj => {
    // Filter by val
    if (filters.value.val && !obj.val.toLowerCase().includes(filters.value.val.toLowerCase())) {
      return false;
    }

    // Filter by requisites
    for (const key in filters.value) {
      if (key.startsWith('req_') && filters.value[key]) {
        const reqId = key.replace('req_', '');
        const value = getRequisiteValue(obj.id, reqId);
        if (!value || !value.toLowerCase().includes(filters.value[key].toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  });
});

// Methods
async function loadObjects(page = 1, append = false) {
  if (!isAuthenticated.value) {
    router.replace('/integram/login');
    return;
  }

  try {
    // Use loading for initial load, loadingMore for appending
    if (!append) {
      loading.value = true;
    }
    error.value = null;

    // Build filters including pagination
    const queryFilters = {
      pg: page,
      LIMIT: rowsPerPage.value,
      ...route.query // Include any query params from URL
    };

    // Remove duplicate pg if it exists in route.query
    if (queryFilters.pg === page) {
      delete queryFilters.pg;
      queryFilters.pg = page;
    }

    const data = await integramApiClient.getObjectList(typeId.value, queryFilters);
    objectsData.value = data;
    typeData.value = data.type;

    // Append mode: add to existing list
    if (append && infiniteScrollEnabled.value) {
      const newObjects = data.object || [];
      if (newObjects.length === 0) {
        hasMoreData.value = false;
      } else {
        objectsList.value = [...objectsList.value, ...newObjects];
        // Merge requisites data
        const newReqs = data.reqs || {};
        requisitesData.value = { ...requisitesData.value, ...newReqs };

        // Check if we got less than requested - means no more data
        if (newObjects.length < rowsPerPage.value) {
          hasMoreData.value = false;
        }
      }
    } else {
      // Replace mode
      objectsList.value = data.object || [];
      requisitesData.value = data.reqs || {};
      hasMoreData.value = (data.object || []).length >= rowsPerPage.value;
    }

    // Update current page from response if available
    if (data.current_page !== undefined) {
      currentPage.value = data.current_page;
    }

    // Parse pagination metadata if available
    if (data.total_objects !== undefined) {
      totalObjects.value = data.total_objects;
    } else {
      // Fallback: estimate based on current data
      // If we got a full page, assume there might be more
      if ((data.object || []).length >= rowsPerPage.value) {
        totalObjects.value = (data.object || []).length * 2; // Conservative estimate
      } else {
        totalObjects.value = (data.object || []).length;
      }
    }

    // Calculate total pages
    if (data.total_pages !== undefined) {
      totalPages.value = data.total_pages;
    } else if (rowsPerPage.value > 0 && totalObjects.value > 0) {
      totalPages.value = Math.ceil(totalObjects.value / rowsPerPage.value);
    } else if ((data.object || []).length >= rowsPerPage.value) {
      // If we got a full page, assume there's at least one more page
      totalPages.value = page + 1;
    } else {
      totalPages.value = page;
    }

    // Extract requisites from response
    if (data.req_type && data.req_order) {
      requisites.value = data.req_order.map(reqId => ({
        id: reqId,
        val: data.req_type[reqId] || `Req ${reqId}`,
        base: data.req_base?.[reqId] || 'TEXT',
        baseId: data.req_base_id?.[reqId],
        // Reference/directory type support
        refType: data.ref_type?.[reqId] || null,
        isMulti: data.req_attrs?.[reqId]?.includes(':MULTI:') || false
      }));
    }
  } catch (err) {
    error.value = err.message;
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить объекты: ' + err.message,
      life: 5000
    });
  } finally {
    loading.value = false;
  }
}

function getRequisiteValue(objectId, requisiteId) {
  return requisitesData.value[objectId]?.[requisiteId] || '';
}

function clearFilters() {
  filters.value = { val: '' };
}

function toggleInlineEdit() {
  inlineEditEnabled.value = !inlineEditEnabled.value;
  if (!inlineEditEnabled.value) {
    cancelEdit();
  }
}

function toggleExtraControls() {
  showExtraControls.value = !showExtraControls.value;
}

function applyCompactMode() {
  // Applied via CSS classes
}

/**
 * Toggle infinite scroll mode
 */
function toggleInfiniteScroll() {
  infiniteScrollEnabled.value = !infiniteScrollEnabled.value;

  if (infiniteScrollEnabled.value) {
    // Reset to first page and load fresh data
    currentPage.value = 1;
    hasMoreData.value = true;
    loadObjects(1, false); // Load fresh, don't append
    // Add window scroll listener
    window.addEventListener('scroll', handleWindowScroll);
  } else {
    // Remove window scroll listener
    window.removeEventListener('scroll', handleWindowScroll);
    // Switch back to pagination mode - reload current page
    loadObjects(currentPage.value, false);
  }
}

/**
 * Handle scroll event for infinite scroll (window-based)
 */
function handleWindowScroll() {
  if (!infiniteScrollEnabled.value || loadingMore.value || !hasMoreData.value) {
    return;
  }

  const threshold = 200; // pixels from bottom of page

  // Check if scrolled near bottom of the page
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;

  if (documentHeight - scrollTop - windowHeight < threshold) {
    loadMoreData();
  }
}

/**
 * Load more data for infinite scroll
 */
async function loadMoreData() {
  if (loadingMore.value || !hasMoreData.value) return;

  loadingMore.value = true;
  const nextPage = currentPage.value + 1;

  try {
    await loadObjects(nextPage, true); // Append mode
    currentPage.value = nextPage;
  } catch (err) {
    console.error('Failed to load more data:', err);
  } finally {
    loadingMore.value = false;
  }
}

function addRecord() {
  showCreateDialog.value = true;
}

function onRowClick(event) {
  // Row click handling if needed
}

function goToPage(page) {
  if (page < 1 || page === currentPage.value) return;

  currentPage.value = page;

  // Update URL with new page number
  router.push({
    path: route.path,
    query: { ...route.query, pg: page }
  });

  // Load objects for the new page
  loadObjects(page);
}

function handleRowsPerPageChange() {
  // Reset to page 1 when changing rows per page
  currentPage.value = 1;

  // Update URL
  router.push({
    path: route.path,
    query: { ...route.query, pg: 1, limit: rowsPerPage.value }
  });

  // Reload data
  loadObjects(1);
}

async function handleCellClick(rowData, field, value, baseType, req = null) {
  if (!inlineEditEnabled.value) return;

  // Don't allow editing ID or certain system fields
  if (field === 'id') return;

  editingCell.value = {
    rowId: rowData.id,
    field: field,
    baseType: baseType,
    req: req // Store requisite info for reference fields
  };

  // If this is a reference field, load options
  if (req?.refType) {
    await loadReferenceOptions(req.refType);
    // For reference fields, store the current value (object ID) if available
    // The display text is shown, but we need the ID for saving
    const objectId = rowData.id;
    const reqId = req.id;
    // Try to get the actual object ID from reqs data
    const rawValue = requisitesData.value[objectId]?.[reqId];
    editingValue.value = rawValue || '';
  } else if (baseType === 'BOOLEAN') {
    editingValue.value = value === 'X';
  } else if (baseType === 'DATE' || baseType === 'DATETIME') {
    editingValue.value = value ? new Date(value) : null;
  } else if (baseType === 'NUMBER' || baseType === 'SIGNED') {
    editingValue.value = value ? parseFloat(value) : null;
  } else {
    editingValue.value = value || '';
  }
}

// Load reference/directory options for a given type
async function loadReferenceOptions(refTypeId) {
  if (!refTypeId || referenceOptions.value[refTypeId]) {
    return; // Already loaded or no type ID
  }

  try {
    loadingReferenceOptions.value = true;
    // Load objects from the reference table
    const data = await integramApiClient.getObjectList(refTypeId, { LIMIT: 500 });

    // Convert to dropdown options format
    referenceOptions.value[refTypeId] = (data.object || []).map(obj => ({
      id: obj.id,
      val: obj.val,
      label: obj.val,
      value: obj.id
    }));
  } catch (err) {
    console.error('Failed to load reference options:', err);
    referenceOptions.value[refTypeId] = [];
  } finally {
    loadingReferenceOptions.value = false;
  }
}

function cancelEdit() {
  editingCell.value = null;
  editingValue.value = null;
}

async function saveEdit(rowData, reqId = null) {
  if (!editingCell.value) return;

  try {
    saving.value = true;

    let valueToSave = editingValue.value;

    // Format value based on type
    if (editingCell.value.baseType === 'BOOLEAN') {
      valueToSave = editingValue.value ? 'X' : '';
    } else if (editingCell.value.baseType === 'DATE') {
      if (editingValue.value) {
        const date = new Date(editingValue.value);
        valueToSave = date.toISOString().split('T')[0];
      } else {
        valueToSave = '';
      }
    } else if (editingCell.value.baseType === 'DATETIME') {
      if (editingValue.value) {
        valueToSave = new Date(editingValue.value).toISOString();
      } else {
        valueToSave = '';
      }
    }

    // Determine what we're updating
    if (editingCell.value.field === 'val') {
      // Update main value - need to get current requisites
      const currentReqs = requisitesData.value[rowData.id] || {};
      await integramApiClient.saveObject(rowData.id, typeId.value, valueToSave, currentReqs);

      // Update local data
      const objIndex = objectsList.value.findIndex(o => o.id === rowData.id);
      if (objIndex !== -1) {
        objectsList.value[objIndex].val = valueToSave;
      }
    } else if (reqId) {
      // Update requisite
      const requisites = {};
      requisites[reqId] = valueToSave;

      await integramApiClient.setObjectRequisites(rowData.id, requisites);

      // Update local data
      if (!requisitesData.value[rowData.id]) {
        requisitesData.value[rowData.id] = {};
      }
      requisitesData.value[rowData.id][reqId] = valueToSave;
    }

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Ячейка обновлена',
      life: 2000
    });

    cancelEdit();
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось обновить: ' + err.message,
      life: 5000
    });
  } finally {
    saving.value = false;
  }
}

function editObject(objectId) {
  router.push(`/integram/${database.value}/edit_obj/${objectId}`);
}

async function moveObjectUp(objectId) {
  try {
    await integramApiClient.moveObjectUp(objectId);
    toast.add({
      severity: 'success',
      summary: 'Объект перемещён',
      detail: 'Объект успешно перемещён вверх',
      life: 2000
    });
    await loadObjects(currentPage.value);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка перемещения',
      detail: error.message || 'Не удалось переместить объект',
      life: 5000
    });
  }
}

/**
 * Show references dialog for an object
 * Displays all objects that reference this object via foreign keys
 */
async function showReferences(object) {
  selectedObjectForReferences.value = object;
  showReferencesDialog.value = true;
  loadingReferences.value = true;
  referencesData.value = [];

  try {
    const response = await integramApiClient.getReferences(object.id);

    // Parse references response
    // Format may vary - handle different response structures
    if (response && response.references) {
      referencesData.value = response.references.map(ref => ({
        typeId: ref.type_id || ref.typeId,
        typeName: ref.type_name || ref.typeName || `Тип ${ref.type_id}`,
        objectId: ref.object_id || ref.objectId,
        objectName: ref.object_name || ref.objectName || `Объект ${ref.object_id}`,
        fieldName: ref.field_name || ref.fieldName || ref.requisite_alias || ''
      }));
    } else if (Array.isArray(response)) {
      // If response is directly an array
      referencesData.value = response.map(ref => ({
        typeId: ref.type_id || ref.typeId || ref.t,
        typeName: ref.type_name || ref.typeName || ref.type || `Тип ${ref.type_id || ref.t}`,
        objectId: ref.object_id || ref.objectId || ref.id,
        objectName: ref.object_name || ref.objectName || ref.val || `Объект ${ref.object_id || ref.id}`,
        fieldName: ref.field_name || ref.fieldName || ref.requisite_alias || ''
      }));
    } else if (response && typeof response === 'object') {
      // Try to extract any reference data from object
      const refs = response.refs || response.data || [];
      if (Array.isArray(refs)) {
        referencesData.value = refs.map(ref => ({
          typeId: ref.type_id || ref.typeId || ref.t,
          typeName: ref.type_name || ref.typeName || `Тип ${ref.type_id}`,
          objectId: ref.object_id || ref.objectId || ref.id,
          objectName: ref.object_name || ref.objectName || ref.val,
          fieldName: ref.field_name || ref.fieldName || ''
        }));
      }
    }
  } catch (error) {
    // If API endpoint doesn't exist or returns error, show empty state
    console.warn('Failed to load references:', error);
    referencesData.value = [];

    // Show info message that API may not support this feature
    if (error.message?.includes('404') || error.message?.includes('не найден')) {
      toast.add({
        severity: 'info',
        summary: 'Функция недоступна',
        detail: 'API не поддерживает получение ссылок на объект',
        life: 3000
      });
    }
  } finally {
    loadingReferences.value = false;
  }
}

function getRequisiteName(key) {
  const reqId = key.replace('req_', '');
  const req = requisites.value.find(r => r.id === reqId);
  return req?.val || reqId;
}

function exportToCSV() {
  if (!filteredObjects.value || filteredObjects.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Нет данных',
      detail: 'Нет данных для экспорта',
      life: 3000
    });
    return;
  }

  // Build CSV headers
  const headers = ['ID', 'Значение'];
  requisites.value.forEach(req => {
    headers.push(req.val || `Реквизит ${req.id}`);
  });

  // Build CSV rows
  const rows = filteredObjects.value.map(obj => {
    const row = [obj.id, obj.val];
    requisites.value.forEach(req => {
      const value = obj.reqs?.[req.id] || '';
      row.push(typeof value === 'string' ? value.replace(/"/g, '""') : value);
    });
    return row;
  });

  // Create CSV content
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${typeData.value?.val || 'export'}_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();

  toast.add({
    severity: 'success',
    summary: 'Экспорт завершён',
    detail: `Экспортировано ${filteredObjects.value.length} записей`,
    life: 3000
  });
}

/**
 * Export to BKI format (Integram native export format)
 * Format:
 * - Header: requisite structure with types (semicolon-delimited)
 * - Marker: "DATA\r\n"
 * - Data rows: "typeId::value;req1;req2;...\r\n"
 */
function exportToBKI() {
  if (!filteredObjects.value || filteredObjects.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Нет данных',
      detail: 'Нет данных для экспорта',
      life: 3000
    });
    return;
  }

  // Build BKI header - requisite structure
  // Format: reqId:alias:baseId:refType;reqId:alias:baseId:refType;...
  const headerParts = [];

  // First column is always the main value (type name)
  headerParts.push(`0:${typeData.value?.val || 'Значение'}:3:`);

  // Add requisites structure
  requisites.value.forEach(req => {
    const alias = req.val || `Req${req.id}`;
    const baseId = req.baseId || '3'; // Default to SHORT (3)
    const refType = req.refType || '';
    headerParts.push(`${req.id}:${alias}:${baseId}:${refType}`);
  });

  // Build BKI content
  let bkiContent = '';

  // Header line with structure
  bkiContent += headerParts.join(';') + '\r\n';

  // DATA marker
  bkiContent += 'DATA\r\n';

  // Data rows
  filteredObjects.value.forEach(obj => {
    const rowParts = [];

    // typeId::value (main column)
    rowParts.push(`${typeId.value}::${escapeValue(obj.val)}`);

    // Requisite values
    requisites.value.forEach(req => {
      const value = getRequisiteValue(obj.id, req.id);
      rowParts.push(escapeValue(value));
    });

    bkiContent += rowParts.join(';') + '\r\n';
  });

  // Download BKI file
  const blob = new Blob([bkiContent], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${typeData.value?.val || 'export'}_${new Date().toISOString().slice(0,10)}.bki`;
  link.click();

  toast.add({
    severity: 'success',
    summary: 'Экспорт BKI завершён',
    detail: `Экспортировано ${filteredObjects.value.length} записей`,
    life: 3000
  });
}

/**
 * Escape value for BKI format
 * BKI uses semicolon as delimiter, so we need to handle special characters
 */
function escapeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  // Convert to string and escape problematic characters
  let str = String(value);
  // Replace newlines with spaces
  str = str.replace(/[\r\n]+/g, ' ');
  // BKI uses semicolon delimiter, replace with safe char
  str = str.replace(/;/g, ',');
  return str;
}

/**
 * Trigger BKI file input dialog
 */
function triggerBKIFileInput() {
  if (bkiFileInput.value) {
    bkiFileInput.value.click();
  }
}

/**
 * Handle BKI file selection
 */
async function handleBKIFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset file input for re-selection
  event.target.value = '';

  try {
    importingBKI.value = true;

    const content = await readFileAsText(file);
    await importBKI(content);

  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка импорта',
      detail: err.message || 'Не удалось импортировать BKI файл',
      life: 5000
    });
  } finally {
    importingBKI.value = false;
  }
}

/**
 * Read file as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}

/**
 * Import data from BKI content
 * Format:
 * - Header: reqId:alias:baseId:refType;reqId:alias:baseId:refType;...
 * - Marker: "DATA\r\n"
 * - Data rows: "typeId::value;req1;req2;...\r\n"
 */
async function importBKI(content) {
  // Normalize line endings
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('BKI файл пуст или имеет неверный формат');
  }

  // Find DATA marker
  const dataMarkerIndex = lines.findIndex(line => line.trim().toUpperCase() === 'DATA');
  if (dataMarkerIndex === -1) {
    throw new Error('Не найден маркер DATA в BKI файле');
  }

  // Parse header (everything before DATA marker)
  const headerLines = lines.slice(0, dataMarkerIndex);
  const headerLine = headerLines[headerLines.length - 1]; // Last line before DATA is the structure

  // Parse requisite structure from header
  const reqStructure = parseHeaderStructure(headerLine);

  // Get data rows (everything after DATA marker)
  const dataRows = lines.slice(dataMarkerIndex + 1);

  if (dataRows.length === 0) {
    throw new Error('Нет данных для импорта');
  }

  // Map BKI requisite IDs to current table requisite IDs
  const reqMapping = mapRequisites(reqStructure);

  // Import each row
  let imported = 0;
  let errors = 0;

  for (const row of dataRows) {
    if (!row.trim()) continue;

    try {
      await importBKIRow(row, reqMapping);
      imported++;
    } catch (err) {
      console.error('Failed to import row:', row, err);
      errors++;
    }
  }

  // Reload objects after import
  await loadObjects(currentPage.value);

  if (errors > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Импорт завершён с ошибками',
      detail: `Импортировано: ${imported}, ошибок: ${errors}`,
      life: 5000
    });
  } else {
    toast.add({
      severity: 'success',
      summary: 'Импорт BKI завершён',
      detail: `Импортировано ${imported} записей`,
      life: 3000
    });
  }
}

/**
 * Parse BKI header structure
 * Format: reqId:alias:baseId:refType;reqId:alias:baseId:refType;...
 */
function parseHeaderStructure(headerLine) {
  const parts = headerLine.split(';');
  const structure = [];

  for (const part of parts) {
    const segments = part.split(':');
    if (segments.length >= 2) {
      structure.push({
        id: segments[0],
        alias: segments[1],
        baseId: segments[2] || '3',
        refType: segments[3] || ''
      });
    }
  }

  return structure;
}

/**
 * Map BKI requisite structure to current table requisites by alias matching
 */
function mapRequisites(bkiStructure) {
  const mapping = {};

  // Skip first element (main value) - index 0
  for (let i = 1; i < bkiStructure.length; i++) {
    const bkiReq = bkiStructure[i];

    // Try to find matching requisite by alias (case-insensitive)
    const matchingReq = requisites.value.find(req =>
      req.val.toLowerCase() === bkiReq.alias.toLowerCase()
    );

    if (matchingReq) {
      mapping[i] = matchingReq.id; // Map BKI column index to requisite ID
    }
  }

  return mapping;
}

/**
 * Import single BKI row
 * Format: typeId::value;req1;req2;...
 */
async function importBKIRow(row, reqMapping) {
  const parts = row.split(';');
  if (parts.length === 0) return;

  // First part: typeId::value
  const firstPart = parts[0];
  const valueParts = firstPart.split('::');
  const value = valueParts.length > 1 ? valueParts[1] : valueParts[0];

  if (!value || !value.trim()) {
    throw new Error('Пустое значение');
  }

  // Build requisites object
  const requisitesData = {};
  for (let i = 1; i < parts.length; i++) {
    const reqId = reqMapping[i];
    if (reqId && parts[i]) {
      requisitesData[reqId] = parts[i];
    }
  }

  // Get parent ID from URL if it's a subordinate table
  const parentId = route.query.F_U || null;

  // Create object
  await integramApiClient.createObject(
    typeId.value,
    value,
    requisitesData,
    parentId
  );
}

async function executeDeleteByFilter() {
  if (deleteByFilterConfirmText.value !== 'УДАЛИТЬ') return;

  const objectsToDelete = filteredObjects.value;
  if (objectsToDelete.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Нет объектов',
      detail: 'Нет объектов для удаления',
      life: 3000
    });
    return;
  }

  deletingByFilter.value = true;

  try {
    let deleted = 0;
    let errors = 0;

    for (const obj of objectsToDelete) {
      try {
        await integramApiClient.deleteObject(obj.id);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete object ${obj.id}:`, err);
        errors++;
      }
    }

    showDeleteByFilterDialog.value = false;
    deleteByFilterConfirmText.value = '';

    if (errors > 0) {
      toast.add({
        severity: 'warn',
        summary: 'Удаление завершено с ошибками',
        detail: `Удалено: ${deleted}, ошибок: ${errors}`,
        life: 5000
      });
    } else {
      toast.add({
        severity: 'success',
        summary: 'Удаление завершено',
        detail: `Удалено ${deleted} объектов`,
        life: 3000
      });
    }

    await loadObjects(1);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления',
      detail: error.message || 'Произошла ошибка при удалении',
      life: 5000
    });
  } finally {
    deletingByFilter.value = false;
  }
}

async function handleCreate() {
  try {
    creating.value = true;

    // Get parent ID from URL parameter F_U (auto-detected)
    const parentId = route.query.F_U || null;

    // Validate parent for subordinate types
    if (typeData.value?.up !== '0' && !parentId) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Для создания записи в подчинённой таблице откройте её из родительской записи',
        life: 5000
      });
      return;
    }

    // Build requisites object (key = reqId, value = formatted value)
    const requisitesData = {};
    if (Object.keys(createForm.value.requisites).length > 0) {
      Object.keys(createForm.value.requisites).forEach(reqId => {
        const value = createForm.value.requisites[reqId];
        if (value !== null && value !== undefined && value !== '') {
          // Format value based on type
          const req = requisites.value.find(r => r.id === reqId);
          if (req) {
            if (req.base === 'BOOLEAN') {
              requisitesData[reqId] = value ? 'X' : '';
            } else if (req.base === 'DATE' || req.base === 'DATETIME') {
              if (value instanceof Date) {
                requisitesData[reqId] = req.base === 'DATE'
                  ? value.toISOString().split('T')[0]
                  : value.toISOString();
              }
            } else {
              requisitesData[reqId] = value;
            }
          }
        }
      });
    }

    // createObject(typeId, value, requisites, parentId)
    // parentId from F_U URL param, or null for independent tables (API will use up=1)
    const result = await integramApiClient.createObject(
      typeId.value,
      createForm.value.value,
      requisitesData,
      parentId
    );

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Объект создан!',
      life: 3000
    });

    showCreateDialog.value = false;
    createForm.value = { value: '', up: '', requisites: {} };

    // Reload objects
    await loadObjects();

    // Navigate to edit if ID returned
    if (result.id) {
      router.push(`/integram/${database.value}/edit_obj/${result.id}`);
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось создать объект: ' + err.message,
      life: 5000
    });
  } finally {
    creating.value = false;
  }
}

function confirmDelete(object) {
  confirm.require({
    message: `Вы уверены, что хотите удалить "${object.val}" (ID: ${object.id})?`,
    header: 'Подтверждение удаления',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => {
      handleDelete(object.id);
    }
  });
}

async function handleDelete(objectId) {
  try {
    await integramApiClient.deleteObject(objectId);

    toast.add({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Объект удалён!',
      life: 3000
    });

    // Reload objects
    await loadObjects();
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось удалить объект: ' + err.message,
      life: 5000
    });
  }
}

// ==================== Add Column Functions ====================

function resetAddColumnForm() {
  addColumnForm.value = {
    name: '',
    baseTypeId: 3,
    isDictionary: false,
    isMultiSelect: false
  };
}

function validateAddColumnForm() {
  // Form validation is handled by computed property isAddColumnFormValid
}

/**
 * Add a new column to the current table
 *
 * Workflow:
 * 1. If isDictionary: Create a new lookup table (type), make it a reference, then add as requisite
 * 2. Otherwise: Directly add a requisite of the selected base type
 */
async function executeAddColumn() {
  if (!isAddColumnFormValid.value) return;

  addingColumn.value = true;

  try {
    const columnName = addColumnForm.value.name.trim();
    let requisiteId = null;

    if (addColumnForm.value.isDictionary) {
      // Step 1: Create a new lookup table (type) with unique=true
      const newTypeResult = await integramApiClient.createType(columnName, 3, true);
      const newTypeId = newTypeResult.obj || newTypeResult.id;

      if (!newTypeId) {
        throw new Error('Не удалось создать справочник');
      }

      // Step 2: Make it a reference type
      await integramApiClient.createTypeReference(newTypeId);

      // Step 3: Add as requisite to current table
      const reqResult = await integramApiClient.addRequisite(typeId.value, newTypeId);
      requisiteId = reqResult.id;

      // Step 4: If multi-select, toggle multi
      if (addColumnForm.value.isMultiSelect && requisiteId) {
        await integramApiClient.toggleRequisiteMulti(requisiteId);
      }

      toast.add({
        severity: 'success',
        summary: 'Колонка добавлена',
        detail: `Создан справочник "${columnName}" и добавлен как колонка`,
        life: 3000
      });
    } else {
      // Direct column add - create requisite of selected type
      const reqResult = await integramApiClient.addRequisite(typeId.value, addColumnForm.value.baseTypeId);
      requisiteId = reqResult.id;

      if (requisiteId) {
        // Set the alias (column name)
        await integramApiClient.saveRequisiteAlias(requisiteId, columnName);
      }

      toast.add({
        severity: 'success',
        summary: 'Колонка добавлена',
        detail: `Колонка "${columnName}" успешно добавлена`,
        life: 3000
      });
    }

    // Close dialog and reset form
    showAddColumnDialog.value = false;
    resetAddColumnForm();

    // Reload objects to see the new column
    await loadObjects();

  } catch (err) {
    console.error('Error adding column:', err);
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось добавить колонку: ' + (err.message || 'Неизвестная ошибка'),
      life: 5000
    });
  } finally {
    addingColumn.value = false;
  }
}

// Lifecycle
onMounted(async () => {
  if (!isAuthenticated.value) {
    router.replace('/integram/login');
    return;
  }

  // Read page number and limit from URL query
  const pageFromQuery = parseInt(route.query.pg) || 1;
  const limitFromQuery = parseInt(route.query.LIMIT || route.query.limit) || 25;

  currentPage.value = pageFromQuery;
  rowsPerPage.value = limitFromQuery;

  await loadObjects(pageFromQuery);
});

// Cleanup on unmount
onUnmounted(() => {
  // Remove window scroll listener if active
  window.removeEventListener('scroll', handleWindowScroll);
});

// Watch for route changes
watch(() => route.params.typeId, async (newTypeId) => {
  if (newTypeId && newTypeId !== typeId.value) {
    typeId.value = newTypeId;
    await loadObjects();
  }
});
</script>

<style scoped>
.integram-object-view-container {
  /* No extra padding - IntegramMain .content provides 1rem */
}

.button-on {
  background-color: var(--surface-200) !important;
}

.table-wrapper {
  overflow-x: auto;
}

.integram-table.mode-compact :deep(.p-datatable-tbody > tr > td) {
  padding: 0.25rem 0.5rem;
  font-size: 0.9rem;
}

.integram-table.mode-fixed :deep(.p-datatable-tbody > tr > td) {
  max-height: 3rem;
  overflow: hidden;
}

.integram-table.mode-ultra :deep(.p-datatable-tbody > tr > td) {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editable-cell {
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.editable-cell:hover {
  background-color: var(--surface-50);
}

.editable-cell.editing {
  padding: 0;
  background-color: var(--highlight-bg);
}

.inline-edit {
  border: 1px solid var(--surface-300) !important;
  padding: 0.5rem !important;
  font-size: inherit;
}

.inline-edit:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.value-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 500;
}

.value-link:hover {
  text-decoration: underline;
}

/* Reference/Directory field styles */
.cell-dir {
  cursor: pointer;
}

.dir {
  color: var(--primary-500);
  font-weight: 500;
}

.cell-dir:hover .dir {
  text-decoration: underline;
}

.action-buttons {
  opacity: 0;
  transition: opacity 0.2s;
}

:deep(.p-datatable-tbody > tr:hover) .action-buttons {
  opacity: 1;
}

.filter-panel {
  border: 1px solid var(--surface-300);
}

:deep(.p-datatable) a {
  color: var(--primary-color);
  text-decoration: none;
}

:deep(.p-datatable) a:hover {
  text-decoration: underline;
}
</style>
