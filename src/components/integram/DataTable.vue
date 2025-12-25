<template>
  <div class="coda-style-datatable">
    <Popover ref="dirOverlay" class="dir-preview-popover">
      <div v-if="currentDirRow" class="dir-preview-card">
        <!-- Header with type badge -->
        <div class="dir-preview-header">
          <span class="dir-preview-type">{{ currentDirHeader }}</span>
        </div>

        <!-- Main value - large and prominent -->
        <div class="dir-preview-main">
          {{ currentDirRow.rows[0]?.val || '—' }}
        </div>

        <!-- Items in order (values and subordinates mixed) -->
        <div v-if="currentDirRow.rows[0]?.items?.length > 0" class="dir-preview-items">
          <template v-for="(item, idx) in currentDirRow.rows[0].items.slice(0, 10)" :key="idx">
            <!-- Regular value -->
            <div v-if="item.itemType === 'value'" class="dir-preview-item">
              <span class="dir-preview-label">{{ item.alias }}:</span>
              <span class="dir-preview-value" v-html="formatCellValue(item.value, item.type)"></span>
            </div>

            <!-- Subordinate table - just name and count -->
            <div v-else-if="item.itemType === 'subordinate'" class="dir-preview-item">
              <span class="dir-preview-label">{{ item.alias }}:</span>
              <span class="dir-preview-value dir-preview-count">{{ item.count }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Loading state -->
      <div v-else class="dir-preview-loading">
        <i class="pi pi-spin pi-spinner"></i>
      </div>
    </Popover>

    <!-- Nested Table Preview Popover -->
    <Popover ref="nestedOverlay" class="nested-preview-popover">
      <div v-if="currentNestedPreview" class="nested-preview-card">
        <!-- Header with table name -->
        <div class="nested-preview-header">
          <i class="pi pi-table"></i>
          <span class="nested-preview-type">{{ currentNestedPreview.tableName }}</span>
          <span class="nested-preview-count-badge">{{ currentNestedPreview.totalCount }}</span>
        </div>

        <!-- Preview items list -->
        <div v-if="currentNestedPreview.items?.length > 0" class="nested-preview-items">
          <div
            v-for="(item, idx) in currentNestedPreview.items.slice(0, 5)"
            :key="idx"
            class="nested-preview-item"
          >
            <span class="nested-preview-item-number">{{ idx + 1 }}.</span>
            <span class="nested-preview-item-value">{{ item.val || item.value || '—' }}</span>
          </div>
          <div v-if="currentNestedPreview.totalCount > 5" class="nested-preview-more">
            +{{ currentNestedPreview.totalCount - 5 }} ещё...
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="nested-preview-empty">
          <i class="pi pi-inbox"></i>
          <span>Нет записей</span>
        </div>

      </div>

      <!-- Loading state -->
      <div v-else class="nested-preview-loading">
        <i class="pi pi-spin pi-spinner"></i>
      </div>
    </Popover>

    <!-- Quick Column Filter Popovers -->
    <Popover
      v-for="header in localHeaders"
      :key="'filter-' + header.id"
      :ref="el => { if (el) columnFilterPopovers[header.id] = el }"
      :style="{ width: '280px', maxHeight: '400px' }"
      class="column-filter-popover"
    >
      <div class="column-filter-content">
        <div class="filter-header">
          <span class="filter-title">Фильтр: {{ header.value }}</span>
        </div>

        <div class="filter-search">
          <InputText
            v-model="columnFilterSearch[header.id]"
            placeholder="Поиск..."
            class="w-full"
            size="small"
          >
            <template #prefix>
              <i class="pi pi-search"></i>
            </template>
          </InputText>
        </div>

        <div class="filter-actions">
          <Button
            label="Все"
            size="small"
            text
            @click="selectAllFilterValues(header.id)"
          />
          <Button
            label="Очистить"
            size="small"
            text
            @click="clearColumnFilter(header.id)"
          />
        </div>

        <div class="filter-values-list">
          <div
            v-for="value in getFilteredUniqueValues(header.id)"
            :key="value"
            class="filter-value-item"
            @click="toggleFilterValue(header.id, value)"
          >
            <Checkbox
              :model-value="columnFilters[header.id]?.has(value)"
              :binary="true"
              @click.stop="toggleFilterValue(header.id, value)"
            />
            <span class="filter-value-text">{{ value || '(Пусто)' }}</span>
          </div>
        </div>
      </div>
    </Popover>

    <Dialog v-model:visible="isRowEditDialogVisible" header="Редактировать строку" :style="{ width: '50vw' }" :modal="true" class="row-edit-dialog" @show="onRowEditDialogShow">
      <div class="row-edit-form">
        <div v-for="header in editingRow?.headers" :key="header.headerId" class="form-field" :class="{'has-expanding-content': isExpandingField(header.type)}" @dblclick.stop="handleCellDoubleClick(header, row.cells[header.id])">
          <label>
            {{localHeaders.find(h => h.id === header.headerId)?.value}}
            <i :class="getTypeIconClass(header.type, header)"></i>
          </label>

          <!-- Nested/subordinate table - show button to open -->
          <template v-if="header.isNested">
            <Button
              :label="'Открыть (' + (header.value || 0) + ')'"
              icon="fas fa-table"
              class="w-full"
              severity="secondary"
              @click="openNestedFromRowEdit(header)"
            />
          </template>

          <template v-else-if="header.dirTableId">
            <MultiSelect v-if="header.columnType === 'multi'" v-model="header.dirValues" :options="getDirectoryOptions(header.dirTableId)" option-label="value" option-value="id" :multiple="true" :loading="isDirectoryLoading(header.dirTableId)" :disabled="isDirectoryLoading(header.dirTableId)" :placeholder="isDirectoryLoading(header.dirTableId) ? 'Загрузка...' : 'Выберите...'" class="w-full" @change="updateMultiDirValue(header)" />
            <Dropdown v-else v-model="header.dirRowId" :options="getDirectoryOptions(header.dirTableId)" option-label="value" option-value="id" :filter="true" :show-clear="true" :loading="isDirectoryLoading(header.dirTableId)" :disabled="isDirectoryLoading(header.dirTableId)" :placeholder="isDirectoryLoading(header.dirTableId) ? 'Загрузка...' : 'Выберите...'" class="w-full" @change="updateDirValue(header)" />
          </template>

          <template v-else>
            <component :is="getEditorComponent(header.type)" v-model="header.value" :class="['w-full', { 'p-invalid': fieldErrors[header.headerId] }]" :binary="header.type === 11" :show-icon="true" :dateFormat="header.type === 9 ? 'dd.mm.yy' : 'dd.mm.yy HH:mm'" :show-time="header.type === 4" :show-seconds="header.type === 4" v-bind="getEditorProps(header.type, header.dirTableId, editingOptions, props.database)" @update:modelValue="handleFieldUpdate(header, $event)" ref="fieldRefs" />
          </template>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="cancelRowEdit" text />
        <Button ref="rowEditSaveButton" label="Сохранить" icon="pi pi-check" @click="saveRowEdit" />
      </template>
    </Dialog>

    <Dialog v-model:visible="isConfirmDialogVisible" header="Подтверждение" :style="{ width: '400px' }" :modal="true" @show="onConfirmDialogShow">
      <div class="confirmation-content">
        <i class="pi pi-exclamation-triangle mr-3" style="font-size: 2rem" />
        <span>{{ confirmMessage }}</span>
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="isConfirmDialogVisible = false" text />
        <Button ref="confirmYesButton" label="Да" icon="pi pi-check" @click="confirmAction" />
      </template>
    </Dialog>

    <!-- MEMO (type 12) and HTML (type 2) Edit Dialog -->
    <MemoEditDialog
      v-model:visible="isMemoDialogVisible"
      v-model="memoEditingValue"
      :header="memoDialogHeader"
      @save="saveMemoEdit"
      @cancel="cancelMemoEdit"
    />

    <!-- Change Parent Dialog -->
    <ChangeParentDialog
      v-model:visible="isChangeParentDialogVisible"
      v-model="newParentId"
      :row="changeParentRow"
      :parent-options="parentOptions"
      :first-header-id="localHeaders?.[0]?.id"
      @confirm="confirmChangeParent"
      @make-independent="makeRowIndependent"
      @cancel="closeChangeParentDialog"
    />

    <!-- Button Action Dialog (for BUTTON type columns) -->
    <ButtonActionDialog
      v-model:visible="isButtonActionDialogVisible"
      v-model:button-label="buttonLabelInput"
      v-model:selected-action="selectedButtonAction"
      :actions="BUTTON_ACTIONS"
      :initial-params="buttonActionParams"
      @confirm="applyButtonAction"
      @cancel="closeButtonActionDialog"
    />

    <!-- Conditional Formatting Dialog (Phase 2) -->
    <ConditionalFormattingDialog
      v-model:visible="isFormattingDialogVisible"
      v-model:rule="editingRule"
      :existing-rules="formattingRules"
      @save="saveFormattingRule"
      @delete-rule="deleteFormattingRule"
      @cancel="isFormattingDialogVisible = false"
    />

    <!-- Image Preview Dialog -->
    <ImagePreviewDialog
      v-model:visible="isImagePreviewVisible"
      :image-url="imagePreviewUrl"
      :filename="imagePreviewFilename"
      @download="downloadPreviewImage"
      @error="onImagePreviewError"
    />

    <ContextMenu ref="headerContextMenu" :model="headerMenuItems" />
    <ContextMenu ref="rowContextMenu" :model="rowMenuItems" />
    <ContextMenu ref="footerContextMenu" :model="footerMenuItems" />

    <Popover ref="typeMenu" :style="{ width: '320px' }" :target="currentHeaderTarget">
      <div class="type-menu">
        <div v-for="type in filteredTypes" :key="type.value" class="type-item" @click="changeColumnType(type.value)" :class="{ 'active-type': currentHeader?.type === type.value }">
          <i class="fa" :class="type.icon"></i>
          <span>{{ type.label }}</span>
        </div>
      </div>
    </Popover>

    <!-- Bulk Actions Toolbar -->
    <Transition name="slide-down">
      <div v-if="bulkActionsVisible" class="bulk-actions-toolbar">
        <div class="bulk-actions-content">
          <span class="bulk-selection-count">
            Выбрано: {{ selectedRowIds.size }}
          </span>
          <div class="bulk-actions-buttons">
            <Button
              label="Удалить"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              @click="bulkDeleteSelected"
              :disabled="props?.disableEditing"
            />
            <Button
              label="Экспорт"
              icon="pi pi-file-excel"
              severity="secondary"
              size="small"
              @click="bulkExportSelected"
            />
            <Button
              label="Отменить"
              icon="pi pi-times"
              text
              size="small"
              @click="clearSelection"
            />
          </div>
        </div>
      </div>
    </Transition>

    <div class="table-container" :id="'table-container-' + $attrs['data-tab-id']" style="max-height: 600px" @scroll="handleScroll" @mousedown="startSelection" @mousemove="handleDragSelection" @mouseup="endSelection">
      <table ref="table" :style="tableStyle" @click="handleTableClick">
        <thead>
          <tr>
            <th class="row-counter-header" :style="rowCounterStyle">
              <div class="header-content">
                <Checkbox
                  v-if="selectionModeEnabled"
                  :model-value="isAllRowsSelected"
                  :binary="true"
                  @change="toggleSelectAll"
                  class="select-all-checkbox"
                  v-tooltip.bottom="'Выбрать все'"
                />
                <i v-else class="pi pi-hashtag"></i>
              </div>
            </th>
<th 
  v-for="header in localHeaders"
  :key="header.id"
  :data-header-id="header.id"
  :data-term-id="header.termId"
  :data-is-main="header.isMain"
  :data-type="header.type"
  :data-dir-table-id="header.dirTableId"
  :data-nested="header.nested"
  :style="{
    width: `${header.width}px`,
    ...(isPinnedColumn(header.id) ? { left: `${pinnedColumnsOffsets[header.id]}px` } : {})
  }"
  draggable="true"
  @dragstart="handleDragStart($event, header.id)"
  @dragover.prevent="handleDragOver($event, header.id)"
  @drop="handleDrop($event, header.id)"
  @dragend="handleDragEnd"
  @contextmenu.prevent="onHeaderContextMenu($event, header)"
  class="draggable-column"
  :class="{
    'drop-left': dropPosition === 'left' && header.id === dropTargetColumnId,
    'drop-right': dropPosition === 'right' && header.id === dropTargetColumnId,
    'non-editable': disableEditing,
    'pinned-column': isPinnedColumn(header.id)
  }"
  :title="header.value"
>
  <div class="header-content">
    <template v-if="header.id === editingHeaderId">
      <InputText
        ref="headerEditorInput"
        v-model="editingHeaderName"
        @keydown.enter="saveHeaderRename"
        @keydown.esc="cancelHeaderRename"
        @blur="saveHeaderRename"
        class="header-editor"
      />
    </template>
    <template v-else>
      <div
        class="header-actions"
        :class="{ 'disabled-sorting': !props.allDataLoaded }"
        @click.stop="handleHeaderSort(header.id, $event)"
        v-tooltip.top="!props.allDataLoaded ? 'Сортировка доступна только при загрузке всех данных' : ''"
      >
        <span class="header-text">{{ header.value }}</span>
        <span v-if="isColumnSorted(header.id)" class="sort-indicator">
          <span class="sort-order">{{ getSortInfo(header.id).order }}</span>
          <i :class="getSortInfo(header.id).direction === 'asc' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"></i>
        </span>
        <span
          v-if="!props?.disableTypeEditing"
          class="type-icon"
          @click.stop="toggleHeaderMenu($event, header)"
          :title="getTypeLabel(header.type, header)"
        >
          <i :class="getTypeIconClass(header.type, header)"></i>
          <i class="fas fa-caret-down"></i>
        </span>
        <Button
          :icon="hasActiveColumnFilter(header.id) ? 'pi pi-filter-fill' : 'pi pi-filter'"
          class="p-button-text p-button-sm filter-button"
          :class="{ 'filter-active': hasActiveColumnFilter(header.id) }"
          :disabled="!props.allDataLoaded"
          @click.stop="toggleColumnFilter(header.id, $event)"
          v-tooltip.top="!props.allDataLoaded ? 'Фильтры доступны только при загрузке всех данных' : 'Фильтровать'"
        />
        <Button
          icon="pi pi-bars"
          class="p-button-text p-button-sm group-button"
          @click.stop="toggleGroupBy(header.id)"
          :title="'Группировать по этому столбцу'"
        />
      </div>
    </template>
  </div>
  <div
    class="resizer"
    @mousedown="startResize($event, header.id)"
    @dblclick.stop="autoFitColumn(header.id)"
    @click.stop
    v-tooltip.left="{ value: 'Двойной клик — автоподбор ширины', showDelay: 1000 }"
  ></div>
</th>
            <!-- Add column button - Notion/Coda style -->
            <!-- Hidden during loading (global preloader or background loading) to avoid flicker -->
            <th class="add-column-header" v-if="!props?.disableEditing && !props?.disableTypeEditing && !props?.isLoading && !props?.isLoadingMore && props?.rows?.length > 0">
              <button
                class="add-column-btn"
                :class="{ 'is-loading': props?.isAddingColumn }"
                :disabled="props?.isAddingColumn || props?.disableEditing"
                @click="emitAddColumn"
                title="Добавить колонку"
              >
                <i v-if="props?.isAddingColumn" class="pi pi-spin pi-spinner"></i>
                <i v-else class="pi pi-plus"></i>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Virtual scroll top spacer -->
          <tr v-if="isVirtualScrollEnabled && visibleRowRange.offset > 0" class="virtual-scroll-spacer">
            <td :colspan="localHeaders.length + 1" :style="{ height: `${visibleRowRange.offset}px`, padding: 0 }"></td>
          </tr>

          <template v-for="(item, itemIndex) in visibleRows" :key="item.type === 'group' ? `group-${item.key}` : item.data.id">
            <!-- Group header row -->
            <tr v-if="item.type === 'group'" class="group-header" @click="toggleGroup(item.key)">
              <td :colspan="localHeaders.length + 1">
                <i :class="['pi', expandedGroups[item.key] ? 'pi-chevron-down' : 'pi-chevron-right']"></i>
                {{ formatMultiGroupHeader(item.key) }} ({{ item.data.rows.length }})
              </td>
            </tr>

            <!-- Data row -->
            <tr
              v-else
              :data-row-id="item.data.id"
              class="data-row"
              :style="rowHeights[item.data.id] ? { height: `${rowHeights[item.data.id]}px` } : {}"
              @focusin="handleRowFocus($event, item.data, props.autoLoadDirs)"
              @mouseenter="handleRowHover(item.data, true)"
              @contextmenu.prevent="onRowContextMenu($event, item.data)"
            >
              <td class="row-counter-cell" :style="{ ...rowCounterStyle, ...(rowHeights[item.data.id] ? { height: `${rowHeights[item.data.id]}px` } : {}) }" :class="{'row-selected': selectionModeEnabled && selectedRowIds.has(item.data.id)}">
                <!-- Row Resizer Handle -->
                <div
                  class="row-resizer"
                  @mousedown="startRowResize($event, item.data.id)"
                  @dblclick.stop="resetRowHeight(item.data.id)"
                  title="Перетащите для изменения высоты строки (двойной клик - сброс)"
                ></div>
                <div v-if="selectionModeEnabled" class="cell-content row-counter-with-checkbox">
                  <Checkbox
                    :model-value="selectedRowIds.has(item.data.id)"
                    :binary="true"
                    @click.stop="toggleRowSelection(item.data.id, $event, visibleRowRange.start + itemIndex)"
                    class="row-select-checkbox"
                  />
                  <span class="row-number" @click="startRowEdit(item.data)">
                    {{ findRowIndex(item.data.id) + 1 }}
                  </span>
                </div>
                <div v-else class="cell-content row-counter-hover">
                  <span class="row-number-text">{{ findRowIndex(item.data.id) + 1 }}</span>
                  <i
                    v-if="!props?.disableEditing"
                    class="pi pi-pencil text-primary cursor-pointer row-edit-icon"
                    @click="startRowEdit(item.data)"
                    v-tooltip.right="{ value: 'Редактировать строку', showDelay: 1000 }"
                  ></i>
                </div>
              </td>
              <td
                v-for="header in localHeaders"
                :key="header.id"
                :data-cell-id="item.data.cells[header.id]?.id"
                :data-row-id="item.data.id"
                :data-header-id="header.id"
                :data-label="header.value"
                v-tooltip.top="isCellChanged(header.id, item.data.id) ? `Ячейка изменена` : ''"
                :style="{
                  width: `${header.width}px`,
                  ...(isPinnedColumn(header.id) ? { left: `${pinnedColumnsOffsets[header.id]}px` } : {}),
                  ...getCellStyle(header.id, item.data.cells[header.id]?.value, item.data.id),
                  ...(rowHeights[item.data.id] ? { height: `${rowHeights[item.data.id]}px` } : {})
                }"
                :class="{
                  'selected-cell': isCellSelected(header.id, item.data.id),
                  'selected-range': isInSelectionRange(header.id, item.data.id),
                  'editing-cell': isEditingCell(header.id, item.data.id),
                  'pinned-column': isPinnedColumn(header.id),
                  'cell-changed': isCellChanged(header.id, item.data.id)
                }"
                @mousedown.stop="handleCellClick($event, header.id, item.data.id)"
                @dblclick.stop="startCellEdit(header.id, item.data.id)"
              >
                <div class="cell-content">
                  <template v-if="!isInlineEditing(header.id, item.data.id)">
                    <template v-if="header.columnType === 'regular'">
                      <!-- Boolean (type 11) - показываем реальный Checkbox PrimeVue -->
                      <div v-if="header.type === 11" class="cell-boolean-checkbox" @click.stop>
                        <Checkbox
                          :modelValue="getBooleanValue(item.data.cells[header.id].value)"
                          :binary="true"
                          @update:modelValue="toggleBooleanValue(header.id, item.data.id, $event)"
                        />
                      </div>
                      <span v-else-if="!item.data.cells[header.id].nested">
                        <!-- Display mentions for text fields (type 3 and 8) -->
                        <MentionDisplay
                          v-if="[3, 8].includes(header.type)"
                          :text="item.data.cells[header.id].value"
                          :database="database"
                        />
                        <!-- Regular display for other types -->
                        <div v-else class="cell-value" v-html="formatCellValue(item.data.cells[header.id].value, header.type, item.data.id, header.id)"></div>
                      </span>
                      <div v-else class="cell-nested" @dblclick.stop="handleCellDoubleClick(header, item.data.cells[header.id])" @mouseenter="showNestedPreview($event, header, item.data.cells[header.id], item.data.id)" @mouseleave="hideNestedPreview">
                        <i class="fas fa-table"></i> ({{ formatCellValue(item.data.cells[header.id]?.value, header.type, item.data.id, header.id) }})
                      </div>
                    </template>

                    <div v-else-if="header.columnType === 'dir'" class="cell-dir" @dblclick.stop="startCellEdit(header.id, item.data.id)">
                      <span v-if="item.data.cells[header.id].dirRowId && item.data.cells[header.id].value" class="dir" @click.stop="openDirectory(header, item.data.cells[header.id].dirRowId)" @mouseenter="showDirInfo($event, header, item.data.cells[header.id].dirRowId)" @mouseleave="hideDirInfo">{{ item.data.cells[header.id].value }}</span>
                      <span v-else class="cell-empty-placeholder"></span>
                    </div>

                    <div v-else-if="header.columnType === 'multi'" class="cell-multi-dir" @dblclick.stop="startCellEdit(header.id, item.data.id)">
                      <template v-if="item.data.cells[header.id].dirValues && item.data.cells[header.id].dirValues.length > 0">
                        <span v-for="(dirValue, idx) in item.data.cells[header.id].dirValues" :key="idx" class="dir-tag" @click.stop="openDirectory(header, dirValue.dirRowId)" @mouseenter="showDirInfo($event, header, dirValue.dirRowId)" @mouseleave="hideDirInfo">
                          {{ getTagDisplayValue(header, dirValue.dirRowId, dirValue) }}
                        </span>
                      </template>
                      <span v-else class="cell-empty-placeholder"></span>
                    </div>

                    <div v-else-if="header.columnType === 'nested'" class="cell-nested" @click.stop="handleCellDoubleClick(header, item.data.cells[header.id])" @mouseenter="showNestedPreview($event, header, item.data.cells[header.id], item.data.id)" @mouseleave="hideNestedPreview">
                      <span class="nested-badge" :class="getNestedBadgeClass(item.data.cells[header.id]?.value)">
                        {{ item.data.cells[header.id]?.value || 0 }}
                      </span>
                      <span class="nested-label">{{ getNestedLabel(item.data.cells[header.id]?.value, header.label) }}</span>
                      <i class="pi pi-chevron-right nested-arrow"></i>
                    </div>
                  </template>

                  <template v-else>
                    <MultiSelect
                      v-if="currentEditingHeader?.dirTableId && currentEditingHeader.columnType === 'multi'"
                      ref="multiselectRef"
                      v-model="editingMultiValue"
                      :options="editingOptions"
                      optionLabel="value"
                      optionValue="id"
                      :multiple="true"
                      :filter="true"
                      :autoFilterFocus="true"
                      :showToggleAll="true"
                      display="chip"
                      :maxSelectedLabels="3"
                      :loading="isLoadingDirectory"
                      :disabled="isLoadingDirectory"
                      placeholder="Выберите значения..."
                      class="cell-editor seamless-editor"
                      @keydown="handleMultiSelectKeydown"
                      @show="isDropdownOpen = true"
                      @hide="handleMultiSelectHide"
                      @click="handleDropdownClick"
                    />

                    <Dropdown v-else-if="currentEditingHeader?.dirTableId" v-model="editingValue" :options="editingOptions" optionLabel="value" optionValue="id" :filter="true" :showClear="true" :loading="isLoadingDirectory" :disabled="isLoadingDirectory" :placeholder="isLoadingDirectory ? 'Загрузка...' : 'Выберите...'" class="cell-editor seamless-editor" @keydown="handleDropdownKeydown" @show="isDropdownOpen = true" @hide="handleDropDownHide" @click="handleDropdownClick" />

                    <!-- GRANT (5) - GRANT access dropdown with system grants, tables, and requisites -->
                    <Dropdown
                      v-else-if="header.type === 5"
                      ref="cellEditorInput"
                      v-model="editingValue"
                      :options="editingOptions"
                      optionLabel="label"
                      optionValue="value"
                      :filter="true"
                      :showClear="true"
                      :loading="grantOptionsLoading"
                      :disabled="grantOptionsLoading"
                      :placeholder="grantOptionsLoading ? 'Загрузка...' : 'Выберите уровень доступа...'"
                      class="cell-editor seamless-editor"
                      @keydown="handleDropdownKeydown"
                      @show="isDropdownOpen = true"
                      @hide="handleDropDownHide"
                      @click="handleDropdownClick"
                    >
                      <template #option="slotProps">
                        <div class="grant-option" :class="{ 'grant-option-system': isSystemGrant(slotProps.option.value) }">
                          <i :class="slotProps.option.icon || 'pi pi-shield'" class="grant-option-icon"></i>
                          <span class="grant-option-label">{{ slotProps.option.label }}</span>
                          <Badge
                            v-if="slotProps.option.severity"
                            :severity="slotProps.option.severity"
                            class="grant-option-badge"
                          />
                        </div>
                      </template>
                      <template #value="slotProps">
                        <div v-if="slotProps.value" class="grant-value">
                          <i :class="getGrantIcon(slotProps.value)" class="grant-value-icon"></i>
                          <span>{{ formatGrantValue(slotProps.value) }}</span>
                        </div>
                        <span v-else class="grant-placeholder">Выберите уровень доступа...</span>
                      </template>
                    </Dropdown>

                    <!-- FILE (10) - File upload (seamless style like dropdown) -->
                    <div v-else-if="header.type === 10" class="cell-editor seamless-editor file-editor-seamless">
                      <input
                        type="file"
                        :id="`file-input-${item.data.id}-${header.id}`"
                        class="file-input-hidden"
                        @change="(e) => handleNativeFileSelect(e, header, item.data)"
                      />
                      <label
                        :for="`file-input-${item.data.id}-${header.id}`"
                        class="file-editor-label"
                        :title="editingValue || 'Выберите файл'"
                      >
                        <i class="pi pi-upload file-editor-icon"></i>
                        <span class="file-editor-text">{{ editingValue ? getFileName(editingValue) : 'Выберите файл...' }}</span>
                      </label>
                      <i
                        v-if="editingValue"
                        class="pi pi-times file-editor-clear"
                        @click.stop="clearFileValue(header, item.data)"
                        title="Удалить файл"
                      ></i>
                    </div>

                    <!-- PATH (17) - Text input for file path (not file upload) -->
                    <InputText
                      v-else-if="header.type === 17"
                      ref="cellEditorInput"
                      v-model="editingValue"
                      @keydown.enter="saveAndCloseCellEdit(header.id, item.data.id)"
                      @keydown.esc="cancelCellEdit"
                      @blur="saveAndCloseCellEdit(header.id, item.data.id)"
                      class="cell-editor seamless-editor"
                      placeholder="Введите путь к файлу..."
                    />

                    <component v-else :is="getEditorComponent(header.type)" ref="cellEditorInput" v-model="editingValue" @keydown.enter="saveAndCloseCellEdit(header.id, item.data.id)" @keydown.esc="cancelCellEdit" @blur="saveAndCloseCellEdit(header.id, item.data.id)" :binary="header.type === 11" :showIcon="true" :dateFormat="header.type === 9 ? 'dd.mm.yy' : 'dd.mm.yy HH:mm'" :showTime="header.type === 4" :showSeconds="header.type === 4" class="cell-editor seamless-editor" v-bind="getEditorProps(header.type, header.dirTableId, getDirectoryOptions(header.dirTableId), props.database)" />
                  </template>
                </div>
              </td>
            </tr>
          </template>

          <!-- Virtual scroll bottom spacer -->
          <tr v-if="isVirtualScrollEnabled && totalRowsHeight" class="virtual-scroll-spacer">
            <td :colspan="localHeaders.length + 1" :style="{ height: `${totalRowsHeight - visibleRowRange.offset - (visibleRows.length * VIRTUAL_SCROLL_ROW_HEIGHT)}px`, padding: 0 }"></td>
          </tr>
        </tbody>

        <!-- Footer with aggregations (Phase 1 - Feature Roadmap) -->
        <tfoot v-if="showFooter">
          <tr class="footer-row">
            <td class="row-counter-footer" :style="rowCounterStyle">
              <div class="footer-cell-content">
                <i class="pi pi-calculator"></i>
              </div>
            </td>
            <td
              v-for="header in localHeaders"
              :key="`footer-${header.id}`"
              :style="{
                width: `${header.width}px`,
                ...(isPinnedColumn(header.id) ? { left: `${pinnedColumnsOffsets[header.id]}px` } : {})
              }"
              :class="{
                'footer-cell': true,
                'pinned-column': isPinnedColumn(header.id)
              }"
              @contextmenu.prevent="onFooterCellContextMenu($event, header)"
            >
              <div class="footer-cell-content">
                {{ getAggregationValue(header.id) }}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Coda-style add row button -->
      <!-- Hidden during loading (global preloader or background loading) to avoid flicker -->
      <div class="add-row-container coda-add-row" v-if="!props?.disableEditing && !props?.disableTypeEditing && !props?.isLoading && !props?.isLoadingMore">
        <button
          class="add-row-button coda-add-button"
          :class="{ 'is-loading': props?.isAddingRow }"
          :disabled="props?.isAddingRow || props?.disableEditing"
          @click="emitAddRow"
        >
          <span class="add-row-icon">
            <i v-if="props?.isAddingRow" class="pi pi-spin pi-spinner"></i>
            <i v-else class="pi pi-plus"></i>
          </span>
          <span class="add-row-text">Новая строка</span>
        </button>
      </div>
    </div>

    <!-- PrimeVue-style tooltip for data-tooltip elements -->
    <div
      ref="customTooltip"
      class="primevue-tooltip"
      :class="{ 'tooltip-visible': tooltipVisible }"
      :style="tooltipStyle"
    >
      <span class="tooltip-arrow"></span>
      <span class="tooltip-text">{{ tooltipText }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { TYPES } from '@/types.js'
import { loadFontAwesome } from '@/utils/lazyLoadFontAwesome'
import { evaluateMathExpression } from '@/utils/mathEvaluator'

// Import constants from DataTable module (for future use and external access)
import {
  MIN_COLUMN_WIDTH as _MIN_COLUMN_WIDTH,
  MAX_DEPTH as _MAX_DEPTH,
  FUNCTION_HANDLERS as _FUNCTION_HANDLERS,
  DUPLICATE_COLORS,
  WEEKDAYS_RU,
  WEEKDAYS_RU_SHORT,
  WEEKDAYS_EN,
  MONTHS_RU,
  MONTHS_EN
} from './DataTable/utils/constants.js'

// Import formatters from DataTable module
import {
  formatDate as formatDateUtil,
  pluralizeRecords,
  getNestedBadgeClass,
  getNestedLabel,
  formatTimeAgo,
  normalizeValue
} from './DataTable/utils/formatters.js'

// Lazy load FontAwesome on component mount (Issue #4432)
onMounted(async () => {
  await loadFontAwesome().catch(console.error)
  // Load row heights from localStorage
  rowHeights.value = loadRowHeights()
})

// PrimeVue компоненты для динамического использования в getEditorComponent
import InputText from 'primevue/inputtext'
import Calendar from 'primevue/calendar'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Dropdown from 'primevue/dropdown'
import MultiSelect from 'primevue/multiselect'
import Badge from 'primevue/badge'

// Mention components for user @mentions
import MentionAutocomplete from './MentionAutocomplete.vue'
import MentionDisplay from './MentionDisplay.vue'

// Extracted Dialog Components
import MemoEditDialog from './DataTable/dialogs/MemoEditDialog.vue'
import ChangeParentDialog from './DataTable/dialogs/ChangeParentDialog.vue'
import ButtonActionDialog from './DataTable/dialogs/ButtonActionDialog.vue'
import ConditionalFormattingDialog from './DataTable/dialogs/ConditionalFormattingDialog.vue'
import ImagePreviewDialog from './DataTable/dialogs/ImagePreviewDialog.vue'
import { useCellEditing } from './DataTable/composables/useCellEditing.js'
import { useDirectoryCache } from './DataTable/composables/useDirectoryCache.js'
import { useDirectoryPreload } from './DataTable/composables/useDirectoryPreload.js'
import { useRowEditing } from './DataTable/composables/useRowEditing.js'
import { useGrouping } from './DataTable/composables/useGrouping.js'
import { useVirtualScroll, VIRTUAL_SCROLL_ROW_HEIGHT, VIRTUAL_SCROLL_BUFFER } from './DataTable/composables/useVirtualScroll.js'
import { useDragDrop } from './DataTable/composables/useDragDrop.js'
import { useHeaderManagement } from './DataTable/composables/useHeaderManagement.js'
import { useGrants } from '@/composables/useGrants.js'

// Local constants (kept for backward compatibility, use imported ones for new code)
const MIN_COLUMN_WIDTH = _MIN_COLUMN_WIDTH
const MAX_DEPTH = _MAX_DEPTH

const FUNCTION_HANDLERS = {
  SUM: args => args.flat().map(arg => typeof arg === 'number' ? arg : parseFloat(arg))?.reduce((a, b) => a + b, 0),
  AVG: args => {
    const numbers = args.flat().map(arg => typeof arg === 'number' ? arg : parseFloat(arg))
    const sum = numbers.reduce((a, b) => a + b, 0)
    return numbers.length > 0 ? sum / numbers.length : 0
  },
  MIN: args => Math.min(...args.flat().map(arg => typeof arg === 'number' ? arg : parseFloat(arg))),
  MAX: args => Math.max(...args.flat().map(arg => typeof arg === 'number' ? arg : parseFloat(arg))),
  COUNT: args => args.flat().length,
  IF: ([condition, trueVal, falseVal]) => condition ? trueVal : falseVal,
  NUMBER: ([val]) => isNaN(parseFloat(val)) ? 0 : parseFloat(val)
}

// Predefined button actions for BUTTON type (type 7)
// Button actions with REAL Integram API macros
// Supports: [ID] (current row), [VAL] (first column value), or hardcoded IDs
const BUTTON_ACTIONS = [
  // === Cell/Requisite Operations ===
  {
    id: 'update-cell',
    label: 'Обновить ячейку',
    icon: 'pi pi-pencil',
    actionType: 'api-macro',
    method: 'POST',
    endpoint: '_m_set/[ID]',
    description: 'Обновить значение ячейки (можно указать любой ID строки и столбца)',
    params: ['headerId', 'value'],
    paramLabels: { headerId: 'ID столбца', value: 'Новое значение' }
  },

  // === Row/Object Operations ===
  {
    id: 'delete-row',
    label: 'Удалить строку',
    icon: 'pi pi-trash',
    actionType: 'api-macro',
    method: 'POST',
    endpoint: '_m_del/[ID]',
    description: 'Удалить строку (укажите [ID] для текущей или конкретный ID)',
    danger: true,
    params: [],
    refreshAction: 'delete-row'
  },
  {
    id: 'move-up',
    label: 'Переместить вверх',
    icon: 'pi pi-arrow-up',
    actionType: 'api-macro',
    method: 'POST',
    endpoint: '_m_up/[ID]',
    description: 'Переместить строку вверх в порядке сортировки',
    params: [],
    refreshAction: 'reload-table'
  },
  {
    id: 'move-to-parent',
    label: 'Изменить родителя',
    icon: 'pi pi-sitemap',
    actionType: 'api-macro',
    method: 'POST',
    endpoint: '_m_move/[ID]',
    description: 'Переместить строку к другому родителю',
    params: ['parentId'],
    paramLabels: { parentId: 'ID нового родителя' },
    refreshAction: 'reload-table'
  },

  // === Custom Action ===
  {
    id: 'custom-url',
    label: 'Кастомный URL',
    icon: 'pi pi-code',
    actionType: 'custom-url',
    description: 'Свой URL с поддержкой [ID] и [VAL] плейсхолдеров',
    params: ['customUrl'],
    paramLabels: { customUrl: 'URL (например: api/action/[ID]?val=[VAL])' }
  },

  // === No Action ===
  {
    id: 'none',
    label: 'Без действия',
    icon: 'pi pi-ban',
    actionType: 'none',
    description: 'Кнопка без действия (неактивна)',
    params: []
  }
]

const props = defineProps({
  headers: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  tableWidth: { type: Number, default: null },
  isLoading: { type: Boolean, default: false }, // Global page loading state (preloader)
  isLoadingMore: Boolean,
  disableEditing: { type: Boolean, default: false },
  report: { type: Boolean, default: false },
  disableTypeEditing: { type: Boolean, default: false },
  editMode: { type: String, default: 'double-click' }, // 'single-click' or 'double-click'
  isAddingRow: { type: Boolean, default: false },
  isAddingColumn: { type: Boolean, default: false },
  allDataLoaded: { type: Boolean, default: true }, // Все данные загружены (для клиентских операций)
  dateStyle: { type: String, default: 'relative' }, // classic, relative, chip, smart
  serverUrl: { type: String, default: '' }, // API server URL for file downloads (e.g., https://dronedoc.ru)
  typeId: { type: [Number, String], default: null }, // Table type ID for localStorage keys
  autoLoadDirs: { type: Boolean, default: true }, // Whether to auto-load directory metadata
  database: { type: String, default: 'my' } // Database name for mentions and other features
})

const emit = defineEmits([
  'update:headers',
  'update:table-config',
  'load-more',
  'cell-update',
  'row-update',
  'add-column',
  'add-row',
  'load-directory-list',
  'open-filter',
  'load-dir-row',
  'load-nested-preview',
  'cell-multi-update',
  'row-delete',
  'row-move-up',
  'open-nested',
  'row-change-parent',
  'bulk-delete',
  'open-directory',
  'button-action-change',
  'upload-file'
])

// const isConfirmDialogVisible = ref(false)
// const confirmMessage = ref('')
// const pendingAction = ref(null)
// const pendingActionData = ref(null)
// const isRowEditDialogVisible = ref(false)
// const editingRow = ref(null)
// const fieldErrors = ref({})

// Change parent dialog state
const isChangeParentDialogVisible = ref(false)
// const changeParentRow = ref(null)
const newParentId = ref(null)
const parentOptions = ref([])

// Button action dialog state (for BUTTON type columns)
const isButtonActionDialogVisible = ref(false)
const buttonActionHeader = ref(null)
const selectedButtonAction = ref(null)
const buttonLabelInput = ref('')
const buttonActionParams = ref({})

// MEMO (type 12) dialog state
// const isMemoDialogVisible = ref(false)
// const memoEditingValue = ref('')
// const memoEditingCell = ref(null) // { headerId, rowId }
// const memoDialogHeader = ref('Редактирование текста')
// const memoTextarea = ref(null)

// hoveredRowIndex removed - using CSS :hover instead for better performance
// const _focusedCell = ref(null) // { headerId, rowId } for keyboard navigation - reserved for future use
// const editingCell = ref(null)
// const editingValue = ref(null)
// Local cell overrides for immediate UI update after save (before props update)
// const localCellOverrides = ref(new Map()) // Map<"rowId:headerId", value>
// const editingOptions = ref([])
// const directoryLists = ref({})
// const directoryCache = ref({})
// const loadingDirectories = ref(new Set())
// const currentEditingHeader = ref(null)
// const editingMultiValue = ref([])
// const groupedData = ref(null)
// const currentGroupColumns = ref([])
// const expandedGroups = ref({})
// const currentGroupColumn = ref(null)
const localHeaders = ref([...props.headers])
const types = ref(TYPES)
const table = ref(null)
// const draggedColumnId = ref(null)
// const dropTargetColumnId = ref(null)
// const dropPosition = ref(null)
const isResizing = ref(false)
const resizeData = ref({ headerId: null, startX: 0, startWidth: 0, currentTh: null, tableStartWidth: 0 })
// const currentHeaderTarget = ref(null)
// const headerContextMenu = ref(null)
const rowContextMenu = ref(null)
// const contextMenuRow = ref(null)
// const copiedCellValue = ref(null)
// const typeMenu = ref()
// const showTypeSubmenu = ref(false)
// const currentHeader = ref(null)
// const editingHeaderId = ref(null)
// const editingHeaderName = ref('')
const rowCounterWidth = ref(56)
const dirOverlay = ref(null)
const currentDirRow = ref(null)
const currentDirHeader = ref('')

// Nested table preview refs
const nestedOverlay = ref(null)
const currentNestedPreview = ref(null)
let nestedPreviewTimeout = null
const NESTED_PREVIEW_DELAY = 300 // ms delay before showing preview

// Directory info timeout
let dirInfoTimeout = null

// Hide directory info function (must be declared before useCellEditing)
const hideDirInfo = () => {
  // Очищаем таймер показа Popover
  if (dirInfoTimeout) {
    clearTimeout(dirInfoTimeout)
    dirInfoTimeout = null
  }
  if (dirOverlay.value) dirOverlay.value.hide()
  currentDirRow.value = null
}

// Custom tooltip for data-tooltip elements (PrimeVue style)
const customTooltip = ref(null)
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipStyle = ref({})
let tooltipHideTimeout = null

const handleTooltipShow = (event) => {
  const target = event.target.closest('[data-tooltip]')
  if (!target) return

  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout)
    tooltipHideTimeout = null
  }

  const text = target.getAttribute('data-tooltip')
  if (!text) return

  tooltipText.value = text

  // Get element position
  const rect = target.getBoundingClientRect()
  const tooltipPadding = 8

  // Position tooltip above the element, centered
  tooltipStyle.value = {
    position: 'fixed',
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top - tooltipPadding}px`,
    transform: 'translate(-50%, -100%)',
    zIndex: 10000
  }

  tooltipVisible.value = true
}

const handleTooltipHide = (event) => {
  const target = event.target.closest('[data-tooltip]')
  if (!target) return

  // Small delay to prevent flickering when moving between elements
  tooltipHideTimeout = setTimeout(() => {
    tooltipVisible.value = false
  }, 100)
}

// Directory row preloading cache
// const dirRowCache = ref(new Map()) // Map<string, { data: object, timestamp: number }>
// const DIR_ROW_CACHE_TTL = 5 * 60 * 1000 // 5 minutes TTL

// Quick Column Filters (Phase 1 - Feature Roadmap)
const columnFilters = ref({}) // { headerId: Set(selectedValues) }
const columnFilterPopovers = ref({}) // { headerId: ref(popover) }

// Conditional Formatting (Phase 2 - Feature Roadmap)
const formattingRules = ref([]) // Array of { id, headerId, condition, value, style }
const isFormattingDialogVisible = ref(false)
const editingRule = ref(null)
const columnFilterSearch = ref({}) // { headerId: searchQuery }

// Image Preview Modal
const isImagePreviewVisible = ref(false)
const imagePreviewUrl = ref('')
const imagePreviewFilename = ref('')

// Row Height Resizer (per rowId, persisted to localStorage)
const MIN_ROW_HEIGHT = 28
const DEFAULT_ROW_HEIGHT = 36
const rowHeights = ref({}) // { rowId: height }
const isRowResizing = ref(false)
const rowResizeData = ref({ rowId: null, startY: 0, startHeight: 0, currentTr: null })

// localStorage key for row heights
const getRowHeightsStorageKey = () => props.typeId ? `integram_row_heights_${props.typeId}` : null

// Load row heights from localStorage
const loadRowHeights = () => {
  const key = getRowHeightsStorageKey()
  if (!key) return {}
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : {}
  } catch (e) {
    console.error('[DataTable] Failed to load row heights:', e)
    return {}
  }
}

// Save row heights to localStorage
const saveRowHeights = () => {
  const key = getRowHeightsStorageKey()
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(rowHeights.value))
  } catch (e) {
    console.error('[DataTable] Failed to save row heights:', e)
  }
}

// Get row height for a specific row
const getRowHeight = (rowId) => rowHeights.value[rowId] || DEFAULT_ROW_HEIGHT

const activeFilterColumn = ref(null) // Currently open filter popover

// Row Selection + Bulk Operations (Phase 1 - Feature Roadmap)
const selectionModeEnabled = ref(false) // Toggle selection mode on/off
const selectedRowIds = ref(new Set()) // Set of selected row IDs
const lastSelectedRowIndex = ref(null) // For Shift+Click range selection
const bulkActionsVisible = ref(false) // Show bulk actions toolbar

// Column Pinning (Phase 1 - Feature Roadmap)
const pinnedColumns = ref(new Set()) // Set of pinned column IDs (left-side sticky)

// Multi-level Sorting (Phase 1 - Feature Roadmap)
const sortColumns = ref([]) // Array of { headerId, direction: 'asc' | 'desc' }

// Column Footer Aggregations (Phase 1 - Feature Roadmap)
const showFooter = ref(false) // Toggle footer visibility (disabled by default)
const aggregationTypes = ref({}) // { headerId: 'sum' | 'avg' | 'count' }

// Excel-like Copy/Paste (Phase 1 - Feature Roadmap)
const clipboardData = ref(null) // Stores copied cell data for paste
// 
// const preloadingDirRows = ref(new Set()) // Currently being preloaded
// let rowHoverDebounceTimer = null
// const ROW_HOVER_DEBOUNCE_MS = 150 // Debounce time for row hover preloading

// // Background directory preloading (Phase 1 - Settings)
// const isBackgroundLoadingDirs = ref(false)
// const backgroundLoadProgress = ref({ loaded: 0, total: 0 })
// const BACKGROUND_LOAD_DELAY_MS = 500 // Delay between background requests (increased to reduce server load)
// const isDropdownOpen = ref(false)
// Issue #5005: Track if ESC was pressed to prevent saving when canceling
// const isCancellingEdit = ref(false)

// Issue #5005: Capture phase ESC handler - fires BEFORE PrimeVue's internal handlers
// This is necessary because PrimeVue Dropdown handles ESC internally and fires @hide
// before our Vue @keydown handler can set the isCancellingEdit flag
// const handleGlobalEscForDropdown = (event) => {
//   if (event.key === 'Escape' && isDropdownOpen.value) {
//     // Set flag IMMEDIATELY in capture phase - this runs before PrimeVue's handlers
//     isCancellingEdit.value = true
//     // Note: We don't preventDefault here because we want the dropdown to close naturally
//     // The flag being set is enough to prevent handleDropDownHide from saving
//   }
// }

// Issue #5005: Watch isDropdownOpen to add/remove capture phase listener
// watch(isDropdownOpen, (newVal, oldVal) => {
//   if (newVal && !oldVal) {
//     // Dropdown opened - add capture phase listener
//     document.addEventListener('keydown', handleGlobalEscForDropdown, true) // true = capture phase
//   } else if (!newVal && oldVal) {
//     // Dropdown closed - remove capture phase listener
//     document.removeEventListener('keydown', handleGlobalEscForDropdown, true)
//   }
// })

const fieldRefs = ref([])
const multiselectRef = ref(null)
const cacheRefreshInterval = ref(null)
const rowEditSaveButton = ref(null)
const confirmYesButton = ref(null)
const headerEditorInput = ref(null)
// const cellEditorInput = ref(null)

// Dialog show handlers for programmatic focus
const onRowEditDialogShow = async () => {
  await nextTick()
  rowEditSaveButton.value?.$el?.focus()
}

const onConfirmDialogShow = async () => {
  await nextTick()
  confirmYesButton.value?.$el?.focus()
}

// Formula caching for performance optimization
const formulaCache = ref(new Map())
const rangeCacheMap = ref(new Map())
const dependencyGraph = ref(new Map())
const reverseDependencyGraph = ref(new Map()) // Maps cell -> formulas that depend on it

// Virtual scrolling state and configuration
// FIX: Resolved white space issue during scrolling (Issue #5005)
// Changes made:
// 1. Adjusted VIRTUAL_SCROLL_ROW_HEIGHT from 40px to 32px to match comfortable row density
// 2. Reduced VIRTUAL_SCROLL_BUFFER from 50 to 20 (sufficient for smooth scrolling)
// 3. Lowered VIRTUAL_SCROLL_ENABLED_THRESHOLD from 1000 to 500 for better performance balance
// 4. Modified handleScroll to only update virtualScrollTop when virtual scrolling is enabled
// 5. Added CSS performance optimizations (contain, will-change, GPU acceleration)
//
// Row heights by density mode: Compact: 24px, Comfortable: 32px, Spacious: 48px
// const VIRTUAL_SCROLL_ROW_HEIGHT = 32 // Row height in pixels (matches comfortable density)
// const VIRTUAL_SCROLL_BUFFER = 20 // Extra rows to render above/below viewport
// Temporarily unused as virtual scrolling is disabled for debugging
 
// const _VIRTUAL_SCROLL_ENABLED_THRESHOLD = 500 // Enable virtual scrolling when rows > threshold
// const virtualScrollTop = ref(0)
// const containerHeight = ref(600)

const tableStyle = computed(() => ({
  width: props.tableWidth ? `${props.tableWidth}px` : 'auto',
  'table-layout': props.tableWidth ? 'fixed' : 'auto'
}))

const rowCounterStyle = computed(() => ({
  width: `${rowCounterWidth.value}px`,
  minWidth: `${rowCounterWidth.value}px`
}))

const filteredTypes = computed(() => types.value.filter(t => t.value !== 10))

const isLoadingDirectory = computed(() =>
  currentEditingHeader.value?.dirTableId &&
  loadingDirectories.value.has(currentEditingHeader.value.dirTableId)
)

// const isDirectoryLoading = dirTableId => {
//   const isLoading = loadingDirectories.value.has(dirTableId)
//   console.log('[isDirectoryLoading] dirTableId:', dirTableId, 'isLoading:', isLoading, 'loadingSet:', [...loadingDirectories.value])
//   return isLoading
// }

const selectedCells = ref({ start: null, end: null, isSelecting: false })

const selectionRange = computed(() => {
  if (!selectedCells.value.start || !selectedCells.value.end) return null

  const startRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.start.rowId)
  const endRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.end.rowId)
  const startColIndex = selectedCells.value.start.headerId === 'row-counter' ? -1 : localHeaders.value.findIndex(h => h.id === selectedCells.value.start.headerId)
  const endColIndex = selectedCells.value.end.headerId === 'row-counter' ? -1 : localHeaders.value.findIndex(h => h.id === selectedCells.value.end.headerId)

  return {
    minRow: Math.min(startRowIndex, endRowIndex),
    maxRow: Math.max(startRowIndex, endRowIndex),
    minCol: Math.min(startColIndex, endColIndex),
    maxCol: Math.max(startColIndex, endColIndex)
  }
})

// Phase 3 - Feature #15: Undo/Redo with command pattern
// History stack for tracking actions
const historyStack = ref([]) // Array of command objects
const historyIndex = ref(-1) // Current position in history (-1 = no history)
const MAX_HISTORY_SIZE = 50

// Command interface: { type, execute(), undo(), data }
// Types: 'cell-edit', 'row-delete', 'column-delete', 'fill'

// Add command to history stack
const addToHistory = command => {
  // Remove any commands after current index (when user undoes then does new action)
  historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)

  // Add new command
  historyStack.value.push(command)

  // Limit stack size
  if (historyStack.value.length > MAX_HISTORY_SIZE) {
    historyStack.value.shift()
  } else {
    historyIndex.value++
  }

  console.log('[History] Added command:', command.type, 'Stack size:', historyStack.value.length)
}

// Undo last action (Ctrl+Z)
const undo = () => {
  if (historyIndex.value < 0) {
    console.log('[History] Nothing to undo')
    return
  }

  const command = historyStack.value[historyIndex.value]
  console.log('[History] Undoing:', command.type)

  // Execute undo
  command.undo()

  historyIndex.value--
}

// Redo action (Ctrl+Y or Ctrl+Shift+Z)
const redo = () => {
  if (historyIndex.value >= historyStack.value.length - 1) {
    console.log('[History] Nothing to redo')
    return
  }

  historyIndex.value++
  const command = historyStack.value[historyIndex.value]
  console.log('[History] Redoing:', command.type)

  // Execute redo (re-execute the command)
  command.execute()
}

// Create command for cell edit
const createCellEditCommand = (headerId, rowId, oldValue, newValue) => {
  return {
    type: 'cell-edit',
    data: { headerId, rowId, oldValue, newValue },
    execute: () => {
      // Apply new value (already done, but needed for redo)
      emit('update-cell', { headerId, rowId, value: newValue })
    },
    undo: () => {
      // Restore old value
      emit('update-cell', { headerId, rowId, value: oldValue })
    }
  }
}

// Create command for row delete
const createRowDeleteCommand = (rowId, rowData) => {
  return {
    type: 'row-delete',
    data: { rowId, rowData },
    execute: () => {
      // Delete row (already done, but needed for redo)
      emit('delete-row', rowId)
    },
    undo: () => {
      // Restore row (would need API support to restore)
      // For now, just log
      console.warn('[History] Row restore not fully implemented - requires API support')
      // emit('restore-row', { id: rowId, ...rowData })
    }
  }
}

// Create command for fill operation
const createFillCommand = (cells, oldValues) => {
  return {
    type: 'fill',
    data: { cells, oldValues },
    execute: () => {
      // Apply fill (already done, but needed for redo)
      cells.forEach(({ headerId, rowId, value }) => {
        emit('update-cell', { headerId, rowId, value })
      })
    },
    undo: () => {
      // Restore old values
      oldValues.forEach(({ headerId, rowId, value }) => {
        emit('update-cell', { headerId, rowId, value })
      })
    }
  }
}

// Keyboard shortcut handler for Undo/Redo
const handleUndoRedoShortcut = event => {
  // Ctrl+Z or Cmd+Z (Mac) for Undo
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
    return
  }

  // Ctrl+Y or Cmd+Y for Redo
  // Also support Ctrl+Shift+Z or Cmd+Shift+Z (common alternative)
  if ((event.ctrlKey || event.metaKey) &&
      (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault()
    redo()
    return
  }
}

// Phase 3 - Feature #17: Cell change indicators
// Track changed cells in current session
// Map<cellKey, timestamp> where cellKey = `${headerId}_${rowId}`
const changedCells = ref(new Map())

// Mark cell as changed
const markCellAsChanged = (headerId, rowId) => {
  const cellKey = `${headerId}_${rowId}`
  changedCells.value.set(cellKey, Date.now())
  // Trigger reactivity
  changedCells.value = new Map(changedCells.value)
}

// Check if cell was changed
const isCellChanged = (headerId, rowId) => {
  const cellKey = `${headerId}_${rowId}`
  return changedCells.value.has(cellKey)
}

// Get change timestamp for cell
const getCellChangeTime = (headerId, rowId) => {
  const cellKey = `${headerId}_${rowId}`
  const timestamp = changedCells.value.get(cellKey)
  if (!timestamp) return null

  // Calculate time ago
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 60) return `${diffSec} сек назад`
  if (diffMin < 60) return `${diffMin} мин назад`
  if (diffHour < 24) return `${diffHour} ч назад`
  return 'сегодня'
}

// Create a Map for O(1) cell lookup instead of O(m) find operations
const cellsMap = computed(() => {
  const map = new Map()
  props.rows.forEach(row => {
    const rowMap = new Map()
    row.values.forEach(cell => {
      // Debug log for Payment column (req_957)
      if (cell.headerId === 'req_957') {
        console.log('[cellsMap] Storing cell for req_957 on row ' + row.id + ':', {
          headerId: cell.headerId,
          value: cell.value,
          nested: cell.nested,
          nestedTableId: cell.nestedTableId,
          nestedLink: cell.nestedLink
        })
      }
      rowMap.set(cell.headerId, cell)
    })
    map.set(row.id, rowMap)
  })
  return map
})

const processedRows = computed(() =>
  props.rows.map(row => ({
    id: row.id,
    cells: Object.fromEntries(
      localHeaders.value.map(header => {
        const cellFromMap = cellsMap.value.get(row.id)?.get(header.id)
        const cell = cellFromMap || { value: null }

        // Debug log for req_957 on row 194856
        if (header.id === 'req_957' && row.id === 194856) {
          console.log('[processedRows] Getting cell for req_957 on row 194856:', {
            cellFromMap: cellFromMap,
            cellFromMapHasNestedLink: cellFromMap?.nestedLink,
            fallbackUsed: !cellFromMap
          })
        }

        // Check for local override (immediate update after save)
        const overrideKey = `${row.id}:${header.id}`
        const localOverride = localCellOverrides.value.get(overrideKey)

        const processedCell = {
          ...cell,
          // Use local override if exists, otherwise use original value
          value: localOverride !== undefined ? localOverride : cell.value,
          nested: cell.nested || header.nested,
          nestedTableId: cell.nestedTableId || header.nestedTableId,
          nestedLink: cell.nestedLink  // CRITICAL: Preserve nestedLink for subordinate table navigation
        }

        // Debug log for Payment column (req_957) on user 'd' (194856)
        if (header.id === 'req_957' && row.id === 194856) {
          console.log('[processedRows] Cell for req_957 on row 194856:', {
            originalCell: cell,
            processedCell,
            hasNestedLink: 'nestedLink' in cell,
            nestedLinkValue: cell.nestedLink
          })
        }

        return [
          header.id,
          processedCell
        ]
      })
    )
  }))
)

// Quick Column Filters: Apply column-level filters
const filteredByColumnRows = computed(() => {
  // Если нет активных фильтров, вернуть все строки
  const activeFilters = Object.entries(columnFilters.value).filter(([, values]) => values && values.size > 0)
  if (activeFilters.length === 0) {
    return processedRows.value
  }

  // Фильтровать строки
  return processedRows.value.filter(row => {
    // Строка проходит фильтр если ВСЕ активные фильтры совпадают (AND логика)
    return activeFilters.every(([headerId, selectedValues]) => {
      const cellValue = row.cells[headerId]?.value
      // Проверить если значение ячейки входит в выбранные значения
      const normalizedCellValue = String(cellValue ?? '')
      return selectedValues.has(normalizedCellValue)
    })
  })
})

// Multi-level Sorting: Apply sorting to filtered rows
const sortedAndFilteredRows = computed(() => {
  if (sortColumns.value.length === 0) {
    return filteredByColumnRows.value
  }

  // Create a copy to avoid mutating original
  const rowsCopy = [...filteredByColumnRows.value]

  rowsCopy.sort((rowA, rowB) => {
    // Compare by each sort column in order
    for (const { headerId, direction } of sortColumns.value) {
      const valueA = rowA.cells[headerId]?.value
      const valueB = rowB.cells[headerId]?.value

      // Handle null/undefined values (sort to the end)
      if (valueA == null && valueB == null) continue
      if (valueA == null) return 1
      if (valueB == null) return -1

      // Compare values
      let comparison = 0
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        comparison = valueA - valueB
      } else {
        // String comparison
        const strA = String(valueA).toLowerCase()
        const strB = String(valueB).toLowerCase()
        comparison = strA.localeCompare(strB, 'ru')
      }

      if (comparison !== 0) {
        return direction === 'asc' ? comparison : -comparison
      }
    }
    return 0
  })

  return rowsCopy
})

// Column Footer Aggregations: Calculate aggregations for each column
const columnAggregations = computed(() => {
  // Aggregations require all data to be loaded
  if (!props.allDataLoaded) {
    const emptyAggregations = {}
    localHeaders.value.forEach(header => {
      emptyAggregations[header.id] = { sum: '⚠️', avg: '⚠️', count: '⚠️' }
    })
    return emptyAggregations
  }

  const aggregations = {}

  localHeaders.value.forEach(header => {
    const headerId = header.id
     
    const _aggregationType = aggregationTypes.value[headerId] || 'sum' // Default to SUM - reserved for future aggregation type selection

    // Collect all numeric values for this column
    const values = sortedAndFilteredRows.value
      .map(row => row.cells[headerId]?.value)
      .filter(value => value != null && !isNaN(Number(value)))
      .map(value => Number(value))

    if (values.length === 0) {
      aggregations[headerId] = { sum: null, avg: null, count: 0 }
      return
    }

    const sum = values.reduce((acc, val) => acc + val, 0)
    const avg = sum / values.length
    const count = values.length

    aggregations[headerId] = {
      sum: sum.toFixed(2),
      avg: avg.toFixed(2),
      count: count
    }
  })

  return aggregations
})

// Initialize grouping composable
const {
  groupedData,
  currentGroupColumns,
  expandedGroups,
  currentGroupColumn,
  flattenedRows,
  toggleMultiGroupBy,
  groupMultiData,
  toggleGroupBy,
  groupData,
  toggleGroup,
  formatMultiGroupHeader,
  cleanup: cleanupGrouping
} = useGrouping(localHeaders, sortedAndFilteredRows)

// Initialize virtual scrolling composable
const {
  virtualScrollTop,
  containerHeight,
  isVirtualScrollEnabled,
  visibleRowRange,
  visibleRows,
  totalRowsHeight,
  updateTableHeight,
  handleScroll
} = useVirtualScroll(flattenedRows, emit)

// Initialize drag-and-drop composable
const {
  draggedColumnId,
  dropTargetColumnId,
  dropPosition,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  resetDragState
} = useDragDrop(localHeaders, isResizing, table, emit)

// // Flattened rows for virtual scrolling with grouping support
// const flattenedRows = computed(() => {
//   if (!groupedData.value) {
//     return sortedAndFilteredRows.value.map(row => ({ type: 'row', data: row }))
//   }
//
//   const result = []
//   for (const [groupKey, group] of Object.entries(groupedData.value.groups)) {
//     result.push({ type: 'group', key: groupKey, data: group })
//     if (expandedGroups.value[groupKey]) {
//       result.push(...group.rows.map(row => ({ type: 'row', data: row })))
//     }
//   }
//   return result
// })

// Initialize directory cache composable
const {
  directoryLists,
  directoryCache,
  loadingDirectories,
  isLoadingAnyDirectory,
  isDirectoryLoading,
  getDirectoryOptions,
  loadDirectoryList,
  updateDirValue,
  updateMultiDirValue,
  preloadAllDirectories,
  loadAllDirectories,
  refreshDirectoryCache,
  clearDirectoryCache
} = useDirectoryCache(localHeaders, emit)

// Initialize directory preload composable
const {
  dirRowCache,
  preloadingDirRows,
  isBackgroundLoadingDirs,
  backgroundLoadProgress,
  DIR_ROW_CACHE_TTL,
  ROW_HOVER_DEBOUNCE_MS,
  BACKGROUND_LOAD_DELAY_MS,
  getDirRowCacheKey,
  isCacheValid,
  preloadSingleDirRow,
  preloadRowDirData,
  handleRowHover,
  handleRowFocus,
  cancelRowHoverPreload,
  loadAllDirDataInBackground,
  stopBackgroundLoading,
  clearDirRowCache,
  cleanup: cleanupDirectoryPreload
} = useDirectoryPreload(localHeaders, processedRows, emit)

// Initialize GRANT composable for type 5 (GRANT) editing (must be before useCellEditing)
const {
  grantOptions,
  loading: grantOptionsLoading,
  error: grantOptionsError,
  loadGrantOptions,
  formatGrantValue,
  getGrantSeverity,
  getGrantIcon,
  isSystemGrant,
  isRequisiteGrant,
  getGrantWarning
} = useGrants()

// Initialize cell editing composable
const {
  editingCell,
  editingValue,
  editingOptions,
  editingMultiValue,
  currentEditingHeader,
  cellEditorInput,
  isCancellingEdit,
  isDropdownOpen,
  memoEditingCell,
  memoEditingValue,
  isMemoDialogVisible,
  memoDialogHeader,
  memoTextarea,
  localCellOverrides,
  startCellEdit,
  saveCellEdit,
  cancelCellEdit,
  saveAndCloseCellEdit,
  isEditingCell,
  isInlineEditing,
  autoOpenMultiSelect,
  autoOpenDropdown,
  handleDropdownClick,
  handleMultiSelectHide,
  handleMultiSelectKeydown,
  handleDropdownKeydown,
  handleDropDownHide,
  handleDocumentClick,
  handleCellClick,
  handleCellDoubleClick,
  handleFileUpload,
  handleNativeFileSelect,
  clearFileValue,
  getFileName,
  saveMemoEdit,
  cancelMemoEdit,
  handleGlobalEscForDropdown,
  cleanup: cleanupCellEditing
} = useCellEditing(
  props,
  processedRows,
  localHeaders,
  selectedCells,
  emit,
  hideDirInfo,
  loadDirectoryList,
  markCellAsChanged,
  grantOptions,
  loadGrantOptions
)

// Initialize row editing composable
const {
  isRowEditDialogVisible,
  isConfirmDialogVisible,
  confirmMessage,
  pendingAction,
  pendingActionData,
  editingRow,
  fieldErrors,
  contextMenuRow,
  changeParentRow,
  copiedCellValue,
  showConfirmationDialog,
  confirmAction,
  onRowContextMenu,
  copyCellValue,
  pasteCellValue,
  editRow,
  deleteRow,
  startRowEdit,
  saveRowEdit,
  validateRow,
  cancelRowEdit,
  cleanup: cleanupRowEditing
} = useRowEditing(
  props,
  localHeaders,
  directoryCache,
  loadDirectoryList,
  emit
)

// Initialize header management composable (needs showConfirmationDialog from useRowEditing)
const {
  editingHeaderId,
  editingHeaderName,
  // headerEditorInput is a template ref, NOT destructured from composable
  currentHeaderTarget,
  headerContextMenu,
  currentHeader,
  typeMenu,
  showTypeSubmenu,
  onHeaderContextMenu,
  showTypeOverlay,
  emitHeaderAction,
  saveHeaderRename,
  cancelHeaderRename,
  changeColumnType,
  toggleHeaderMenu,
  deleteColumn,
  cleanup: cleanupHeaderManagement
} = useHeaderManagement(emit, showConfirmationDialog, headerEditorInput)

// Virtual scrolling computed properties
// const isVirtualScrollEnabled = computed(() => {
  // TEMPORARILY DISABLED for debugging white space issue
  // TODO: Re-enable after finding root cause
//   return false
// 
  // Original logic:
  // return flattenedRows.value.length > VIRTUAL_SCROLL_ENABLED_THRESHOLD
// })

// const visibleRowRange = computed(() => {
//   if (!isVirtualScrollEnabled.value) {
    // Return all rows if virtual scroll is disabled
//     return { start: 0, end: flattenedRows.value.length, offset: 0 }
//   }
// 
//   const scrollTop = virtualScrollTop.value
//   const startIndex = Math.floor(scrollTop / VIRTUAL_SCROLL_ROW_HEIGHT)
//   const visibleCount = Math.ceil(containerHeight.value / VIRTUAL_SCROLL_ROW_HEIGHT)
// 
//   const start = Math.max(0, startIndex - VIRTUAL_SCROLL_BUFFER)
//   const end = Math.min(flattenedRows.value.length, startIndex + visibleCount + VIRTUAL_SCROLL_BUFFER)
//   const offset = start * VIRTUAL_SCROLL_ROW_HEIGHT
// 
//   return { start, end, offset }
// })

// const visibleRows = computed(() => {
//   const { start, end } = visibleRowRange.value
//   return flattenedRows.value.slice(start, end)
// })

// const totalRowsHeight = computed(() => {
//   if (!isVirtualScrollEnabled.value) {
//     return null
//   }
//   return flattenedRows.value.length * VIRTUAL_SCROLL_ROW_HEIGHT
// })

const headerMenuItems = computed(() => [
  { label: 'Фильтровать', icon: 'pi pi-filter', command: () => emit('open-filter', currentHeader.value?.id), disabled: props?.disableEditing },
  { label: 'Переименовать', icon: 'pi pi-pencil', command: () => emitHeaderAction('rename'), disabled: props?.disableEditing },
  ...(props?.disableTypeEditing ? [] : [
    { label: 'Изменить тип', icon: 'pi pi-sync', command: e => showTypeOverlay(e.originalEvent), disabled: props?.disableEditing }
  ]),
  { label: 'Удалить', icon: 'pi pi-trash', command: () => deleteColumn(), class: 'text-red-500', disabled: props?.disableEditing },
  {
    label: currentGroupColumns.value.includes(currentHeader.value?.id)
      ? 'Убрать из группировки'
      : 'Сгруппировать',
    icon: 'pi pi-objects-column',
    command: () => {
      const headerId = currentHeader.value.id

      if (currentGroupColumns.value.includes(headerId)) {
        // Убрать колонку из группировки
        const newGroupColumns = currentGroupColumns.value.filter(id => id !== headerId)
        toggleMultiGroupBy(newGroupColumns)
      } else {
        // Создать новую группировку только по этой колонке
        toggleMultiGroupBy([headerId])
      }
    }
  },
  {
    label: 'Добавить к группировке',
    icon: 'pi pi-plus',
    visible: currentGroupColumns.value.length > 0 &&
             !currentGroupColumns.value.includes(currentHeader.value?.id),
    command: () => {
      // Добавить к существующей группировке
      const newGroupColumns = [...currentGroupColumns.value, currentHeader.value.id]
      toggleMultiGroupBy(newGroupColumns)
    }
  },
  {
    label: 'Очистить группировку',
    icon: 'pi pi-times',
    visible: currentGroupColumns.value.length > 0,
    command: () => {
      // Убрать всю группировку
      toggleMultiGroupBy([])
    }
  },
  { separator: true },
  {
    label: '🎨 Условное форматирование',
    icon: 'pi pi-palette',
    command: () => openFormattingDialog(currentHeader.value?.id)
  },
  {
    label: '⚡ Настроить действие кнопки',
    icon: 'pi pi-bolt',
    visible: currentHeader.value?.type === 7,
    command: () => openButtonActionDialog(currentHeader.value),
    disabled: props?.disableEditing
  },
  { separator: true },
  {
    label: pinnedColumns.value.has(currentHeader.value?.id)
      ? 'Открепить колонку'
      : '📌 Закрепить колонку',
    icon: pinnedColumns.value.has(currentHeader.value?.id) ? 'pi pi-times' : 'pi pi-lock',
    command: () => togglePinColumn(currentHeader.value?.id)
  },
  { separator: true },
  {
    label: 'Сортировать A→Z',
    icon: 'pi pi-arrow-up',
    command: () => {
      sortColumns.value = [{ headerId: currentHeader.value?.id, direction: 'asc' }]
    }
  },
  {
    label: 'Сортировать Z→A',
    icon: 'pi pi-arrow-down',
    command: () => {
      sortColumns.value = [{ headerId: currentHeader.value?.id, direction: 'desc' }]
    }
  },
  {
    label: 'Очистить сортировку',
    icon: 'pi pi-times',
    command: () => clearSort(),
    disabled: sortColumns.value.length === 0
  }
])

const rowMenuItems = computed(() => [
  { label: 'Копировать', icon: 'pi pi-copy', command: () => copyCellValue() },
  { label: 'Вставить', icon: 'pi pi-paste', command: () => pasteCellValue(), disabled: !copiedCellValue.value || props?.disableEditing },
  { label: 'Изменить строку', icon: 'pi pi-pencil', command: () => editRow(), disabled: props?.disableEditing },
  { label: 'Переместить вверх', icon: 'pi pi-arrow-up', command: () => moveRowUp(), disabled: props?.disableEditing },
  { separator: true },
  { label: 'Изменить подчинённость...', icon: 'pi pi-sitemap', command: () => openChangeParentDialog(), disabled: props?.disableEditing },
  { separator: true },
  { label: 'Удалить строку', icon: 'pi pi-trash', command: () => deleteRow(), class: 'text-red-500', disabled: props?.disableEditing }
])

function moveRowUp() {
  if (contextMenuRow.value) {
    emit('row-move-up', contextMenuRow.value.id)
  }
}

// Change parent dialog functions
function openChangeParentDialog() {
  if (contextMenuRow.value) {
    changeParentRow.value = contextMenuRow.value
    newParentId.value = null

    // Build parent options from current rows (excluding selected row)
    const currentRowId = contextMenuRow.value.id
    parentOptions.value = props.rows
      .filter(row => row.id !== currentRowId)
      .map(row => {
        // Get display name from first column (main value)
        const firstHeader = localHeaders.value[0]
        const displayName = row.cells?.[firstHeader?.id]?.value || row.values?.[0]?.value || `ID: ${row.id}`
        return {
          id: row.id,
          name: `${displayName} (ID: ${row.id})`
        }
      })

    isChangeParentDialogVisible.value = true
  }
}

function closeChangeParentDialog() {
  isChangeParentDialogVisible.value = false
  changeParentRow.value = null
  newParentId.value = null
  parentOptions.value = []
}

function confirmChangeParent() {
  if (changeParentRow.value) {
    emit('row-change-parent', {
      rowId: changeParentRow.value.id,
      newParentId: newParentId.value || 1  // 1 = make independent (no parent)
    })
    closeChangeParentDialog()
  }
}

function makeRowIndependent() {
  if (changeParentRow.value) {
    emit('row-change-parent', {
      rowId: changeParentRow.value.id,
      newParentId: 1  // 1 = independent
    })
    closeChangeParentDialog()
  }
}

// Button Action Dialog functions (for BUTTON type columns)
function openButtonActionDialog(header) {
  buttonActionHeader.value = header
  // Parse current attrs: :ALIAS=ButtonLabel:endpoint:param1=value1:param2=value2:
  const attrs = header?.attrs || ''
  const segments = attrs.split(':').filter(s => s.trim())
  let currentEndpoint = ''
  let currentLabel = ''
  const params = {}

  for (const segment of segments) {
    if (segment.includes('=')) {
      const [key, value] = segment.split('=')
      if (key === 'ALIAS' && value) {
        currentLabel = value
      } else if (key && value) {
        // Parameter like targetId=[ID], headerId=123, etc.
        params[key] = value
      }
    } else if (segment.trim()) {
      // First non-key-value segment is the endpoint
      if (!currentEndpoint) {
        currentEndpoint = segment.trim()
      }
    }
  }

  // Set button label (fallback to column name or default)
  buttonLabelInput.value = currentLabel || header?.value || 'Кнопка'

  // Find matching action by endpoint
  selectedButtonAction.value = BUTTON_ACTIONS.find(a => a.endpoint === currentEndpoint || a.id === currentEndpoint) || null

  // Set initial params (with defaults for new actions)
  buttonActionParams.value = {
    targetId: params.targetId || '[ID]',
    headerId: params.headerId || '',
    value: params.value || '',
    parentId: params.parentId || '',
    customUrl: params.customUrl || '',
    ...params
  }

  isButtonActionDialogVisible.value = true
}

function closeButtonActionDialog() {
  isButtonActionDialogVisible.value = false
  buttonActionHeader.value = null
  selectedButtonAction.value = null
  buttonLabelInput.value = ''
  buttonActionParams.value = {}
}

function applyButtonAction(data) {
  if (buttonActionHeader.value && data.action) {
    const label = buttonLabelInput.value.trim() || 'Кнопка'
    const action = data.action
    const params = data.params || {}

    // Serialize attrs: :ALIAS=Label:endpoint:param1=value1:param2=value2:
    let attrsStr = `:ALIAS=${label}`

    // Add endpoint (or action id for 'none' type)
    if (action.endpoint) {
      attrsStr += `:${action.endpoint}`
    } else if (action.id) {
      attrsStr += `:${action.id}`
    }

    // Add params (only non-empty values)
    for (const [key, value] of Object.entries(params)) {
      if (value && value !== '') {
        attrsStr += `:${key}=${value}`
      }
    }

    attrsStr += ':'

    emit('button-action-change', {
      headerId: buttonActionHeader.value.id,
      termId: buttonActionHeader.value.termId,
      action: action,
      label: label,
      params: params
    })

    // Update local header attrs for immediate UI feedback
    const headerIndex = localHeaders.value.findIndex(h => h.id === buttonActionHeader.value.id)
    if (headerIndex !== -1) {
      localHeaders.value[headerIndex].attrs = attrsStr
    }
    closeButtonActionDialog()
  }
}

// Handle table click events (event delegation)
function handleTableClick(event) {
  // Check if clicked element is a button with action data
  const button = event.target.closest('.data-table-action-button')
  if (button) {
    const rowId = button.dataset.rowId
    const headerId = button.dataset.headerId
    if (rowId && headerId) {
      handleButtonClick(event, rowId, headerId)
    }
  }
}

// Handle button click for BUTTON type columns
async function handleButtonClick(event, rowId, headerId) {
  event.stopPropagation()
  event.preventDefault()

  // Get header and attrs
  const header = localHeaders.value.find(h => h.id === headerId)
  if (!header) return

  const attrs = header.attrs || ''
  const segments = attrs.split(':').filter(s => s.trim())

  let endpoint = ''
  const params = {}

  for (const segment of segments) {
    if (segment.includes('=')) {
      const [key, value] = segment.split('=')
      if (key !== 'ALIAS' && key && value) {
        params[key] = value
      }
    } else if (segment.trim()) {
      if (!endpoint) endpoint = segment.trim()
    }
  }

  // Check if this is a 'none' action
  if (endpoint === 'none' || !endpoint) {
    return // Do nothing
  }

  // Get row data for [VAL] substitution
  const row = props.rows.find(r => r.id === rowId)
  const firstHeader = localHeaders.value[0]
  const rowVal = row?.cells?.[firstHeader?.id]?.value || row?.values?.[0]?.value || ''

  // Substitute [ID] and [VAL] in all params
  const substitutedParams = {}
  for (const [key, value] of Object.entries(params)) {
    substitutedParams[key] = String(value)
      .replace(/\[ID\]/g, String(rowId || ''))
      .replace(/\[VAL\]/g, String(rowVal || ''))
  }

  // Substitute in endpoint
  let finalEndpoint = endpoint
    .replace(/\[ID\]/g, String(rowId || ''))
    .replace(/\[VAL\]/g, String(rowVal || ''))

  // Find action definition to determine refresh behavior
  const actionDef = BUTTON_ACTIONS.find(a =>
    a.endpoint === endpoint || a.id === endpoint
  )

  try {
    // Make API call
    emit('button-click', {
      rowId,
      headerId,
      endpoint: finalEndpoint,
      params: substitutedParams,
      actionType: actionDef?.actionType || 'api-macro',
      refreshAction: actionDef?.refreshAction
    })
  } catch (error) {
    console.error('Button action failed:', error)
  }
}

const evaluateFormula = (formula, rows, currentRowId, currentHeaderId, depth = 0, visited = new Set()) => {
  if (depth > MAX_DEPTH) return '#ERROR!'
  if (!formula.startsWith('=')) return formula

  // Check cache first (only for top-level calls, depth === 0)
  if (depth === 0) {
    const cacheKey = `${currentRowId}-${currentHeaderId}-${formula}`
    if (formulaCache.value.has(cacheKey)) {
      return formulaCache.value.get(cacheKey)
    }
  }

  const expr = formula.slice(1).trim()
  const functionPattern = /([A-Z]+)\(([^)]*)\)/g
  let funcExpr = expr.replace(functionPattern, (match, funcName, argsStr) => {
    if (!FUNCTION_HANDLERS[funcName]) return match

    const args = []
    let currentArg = ''
    let parenCount = 0

    for (const char of argsStr) {
      if (char === ',' && parenCount === 0) {
        args.push(currentArg.trim())
        currentArg = ''
        continue
      }
      if (char === '(') parenCount++
      if (char === ')') parenCount--
      currentArg += char
    }
    args.push(currentArg.trim())

    const evaluatedArgs = args.map(arg => arg.includes('(') 
      ? evaluateFormula(`=${arg}`, rows, currentRowId, currentHeaderId, depth + 1, visited)
      : arg.includes(':') 
        ? parseRange(...arg.split(':').map(ref => ref.trim()), rows, currentRowId, currentHeaderId, depth, visited)
        : parseReference(arg, rows, currentRowId, currentHeaderId, depth, visited)
  ).flat()

  try {
    return FUNCTION_HANDLERS[funcName](evaluatedArgs)
  } catch (_e) {
    return '#ERROR!'
  }
})

  funcExpr = funcExpr.replace(/(\[[^\]]+\]:\[[^\]]+\])/g, range => {
    const [startRef, endRef] = range.split(':')
    return parseRange(startRef, endRef, rows, currentRowId, currentHeaderId, depth, visited)
  })

  funcExpr = funcExpr.replace(/\[(\d+|\*)\](?:\[([-+]?\d+|\*)\])?/g), (match, headerPart, rowRef) =>
    parseReference(match, rows, currentRowId, currentHeaderId, depth, visited)

  let result
  try {
    const mathExpr = funcExpr.replace(/÷/g, '/').replace(/×/g, '*')
    result = evaluateMathExpression(mathExpr)
    result = typeof result === 'number' ? result : mathExpr
  } catch (e) {
    result = funcExpr
  }

  // Cache the result (only for top-level calls)
  if (depth === 0) {
    const cacheKey = `${currentRowId}-${currentHeaderId}-${formula}`
    formulaCache.value.set(cacheKey, result)
  }

  return result
}

const parseReference = (ref, rows, currentRowId, currentHeaderId, depth, visited) => {
  const match = ref.match(/\[(\d+|\*)\](?:\[([-+]?\d+|\*)\])?/)
  if (!match) return ref

  const [, headerPart, rowRef] = match
  if (rowRef === '*') return parseColumnRange(headerPart, rows, '*', currentHeaderId, depth, visited)

  const headerId = headerPart === '*' ? currentHeaderId : parseInt(headerPart)
  let targetRowId

  if (!rowRef) targetRowId = currentRowId
  else if (rowRef.startsWith('+') || rowRef.startsWith('-')) {
    const offset = parseInt(rowRef)
    const currentRowIndex = rows.findIndex(r => r.id === currentRowId)
    if (currentRowIndex === -1) return '#REF!'
    const targetIndex = currentRowIndex + offset
    if (targetIndex < 0 || targetIndex >= rows.length) return '#REF!'
    targetRowId = rows[targetIndex].id
  } else if (rowRef === '*') return parseRowRange(headerId, rows, currentRowId, currentHeaderId, depth, visited)
  else targetRowId = parseInt(rowRef)

  const row = rows.find(r => r.id === targetRowId)
  if (!row) return '#REF!'
  const cell = row.values.find(v => v.headerId === headerId)
  if (!cell) return '#REF!'
  return getCellValue(cell, rows, targetRowId, headerId, depth, visited)
}

const parseRange = (startRef, endRef, rows, currentRowId, currentHeaderId, depth, visited) => {
  // Check range cache
  const rangeKey = `${currentRowId}-${currentHeaderId}-${startRef}:${endRef}`
  if (rangeCacheMap.value.has(rangeKey)) {
    return rangeCacheMap.value.get(rangeKey)
  }

  const startVal = parseReference(startRef, rows, currentRowId, currentHeaderId, depth, visited)
  const endVal = parseReference(endRef, rows, currentRowId, currentHeaderId, depth, visited)

  if (typeof startVal === 'number' && typeof endVal === 'number') {
    const result = [startVal, endVal]
    rangeCacheMap.value.set(rangeKey, result)
    return result
  }

  const startMatch = startRef.match(/\[(\d+)\](?:\[([-+]?\d+)\])?/)
  const endMatch = endRef.match(/\[(\d+)\](?:\[([-+]?\d+)\])?/)
  if (!startMatch || !endMatch) return [startVal, endVal]

  const [, startHeader, startRow] = startMatch
  const [, endHeader, endRow] = endMatch

  let result
  if (startRow === endRow && startRow !== '*') {
    result = parseColumnRange(`${startHeader}:${endHeader}`, rows, parseInt(startRow), currentHeaderId, depth, visited)
  } else if (startHeader === endHeader) {
    result = parseRowRange(parseInt(startHeader), rows, currentRowId, currentHeaderId, depth, visited, parseInt(startRow), parseInt(endRow))
  } else {
    result = parseMatrixRange(parseInt(startHeader), parseInt(startRow), parseInt(endHeader), parseInt(endRow), rows, currentHeaderId, depth, visited)
  }

  // Cache the range result
  rangeCacheMap.value.set(rangeKey, result)
  return result
}

const parseColumnRange = (colRef, rows, rowId, currentHeaderId, depth, visited) => {
  let startCol, endCol
  if (colRef.includes(':')) [startCol, endCol] = colRef.split(':').map(Number)
  else startCol = endCol = parseInt(colRef)

  if (rowId === '*') {
    const values = []
    for (const row of rows) {
      for (const cell of row.values) {
        if (cell.headerId >= startCol && cell.headerId <= endCol) {
          values.push(getCellValue(cell, rows, row.id, cell.headerId, depth, visited))
        }
      }
    }
    return values
  }

  const row = rows.find(r => r.id === rowId)
  if (!row) return []
  return row.values.filter(cell => cell.headerId >= startCol && cell.headerId <= endCol)
    .map(cell => getCellValue(cell, rows, rowId, cell.headerId, depth, visited))
}

const parseRowRange = (headerId, rows, currentRowId, currentHeaderId, depth, visited, startRow, endRow) => {
  const startIndex = startRow ? rows.findIndex(r => r.id === startRow) : rows.findIndex(r => r.id === currentRowId)
  const endIndex = endRow ? rows.findIndex(r => r.id === endRow) : startIndex
  if (startIndex === -1 || endIndex === -1) return []

  return rows.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1)
    .map(row => {
      const cell = row.values.find(v => v.headerId === headerId)
      return cell ? getCellValue(cell, rows, row.id, headerId, depth, visited) : 0
    })
}

const parseMatrixRange = (startCol, startRow, endCol, endRow, rows, currentHeaderId, depth, visited) => {
  const result = []
  for (let rowId = startRow; rowId <= endRow; rowId++) {
    const row = rows.find(r => r.id === rowId)
    if (!row) continue
    const rowValues = []
    for (let headerId = startCol; headerId <= endCol; headerId++) {
      const cell = row.values.find(v => v.headerId === headerId)
      rowValues.push(cell ? getCellValue(cell, rows, rowId, headerId, depth, visited) : 0)
    }
    result.push(rowValues)
  }
  return result
}

const getCellValue = (cell, rows, rowId, headerId, depth, visited) => {
  const cellKey = `${rowId}-${headerId}`
  if (visited.has(cellKey)) return '#CYCLE!'

  const newVisited = new Set(visited)
  newVisited.add(cellKey)
  let value = cell.value

  if (typeof value === 'string' && value.startsWith('=')) {
    value = evaluateFormula(value, rows, rowId, headerId, depth + 1, newVisited)
  }

  if (cell.type === 4 || cell.type === 9) return typeof value === 'string' ? parseDate(value) : value
  return isNaN(parseFloat(value)) ? value : parseFloat(value)
}

const parseDate = dateString => {
  const patterns = [
    /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})/,
    /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/,
    /(\d{2})\.(\d{2})\.(\d{4})/
  ]

  for (const pattern of patterns) {
    const match = dateString.match(pattern)
    if (match) {
      const [_, day, month, year, hours, minutes, seconds] = match
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hours ? parseInt(hours) : 0,
        minutes ? parseInt(minutes) : 0,
        seconds ? parseInt(seconds) : 0
      )
      return Math.floor(date.getTime() / 1000)
    }
  }
  return 0
}

// Dependency tracking functions for incremental cache invalidation
const extractDependencies = (formula, currentRowId, rows) => {
  if (!formula || !formula.startsWith('=')) return []

  const deps = []
  const expr = formula.slice(1)

  // Pattern for cell references: [headerId][rowId] or [headerId] (uses currentRowId)
  // Also supports [*][rowId] and [headerId][*] for ranges
  const refPattern = /\[(\d+|\*)\](?:\[([-+]?\d+|\*)\])?/g
  let match

  while ((match = refPattern.exec(expr)) !== null) {
    const [, headerPart, rowRef] = match

    // Skip wildcard ranges for dependency tracking (they're too broad)
    if (headerPart === '*' || rowRef === '*') {
      // For wildcard references, we need to mark all cells in that column/row
      if (rowRef === '*' && headerPart !== '*') {
        // Reference to all rows in a column [headerId][*]
        const headerId = parseInt(headerPart)
        rows.forEach(row => {
          deps.push(`${row.id}-${headerId}`)
        })
      } else if (headerPart === '*' && rowRef) {
        // Reference to all columns in a row [*][rowId]
        const targetRowId = rowRef.startsWith('+') || rowRef.startsWith('-')
          ? currentRowId + parseInt(rowRef)
          : parseInt(rowRef)
        const row = rows.find(r => r.id === targetRowId)
        if (row) {
          row.values.forEach(cell => {
            deps.push(`${targetRowId}-${cell.headerId}`)
          })
        }
      }
      continue
    }

    // Parse specific cell reference
    const headerId = headerPart === '*' ? null : parseInt(headerPart)
    let targetRowId

    if (!rowRef) {
      // [headerId] - reference to current row
      targetRowId = currentRowId
    } else if (rowRef.startsWith('+') || rowRef.startsWith('-')) {
      // [headerId][+n] or [headerId][-n] - relative reference
      targetRowId = currentRowId + parseInt(rowRef)
    } else {
      // [headerId][rowId] - absolute reference
      targetRowId = parseInt(rowRef)
    }

    if (headerId !== null && targetRowId !== null) {
      deps.push(`${targetRowId}-${headerId}`)
    }
  }

  // Pattern for range references: [h1][r1]:[h2][r2]
  const rangePattern = /\[(\d+)\](?:\[(\d+)\])?\s*:\s*\[(\d+)\](?:\[(\d+)\])?/g
  while ((match = rangePattern.exec(expr)) !== null) {
    const [, startHeader, startRow, endHeader, endRow] = match
    const startH = parseInt(startHeader)
    const endH = parseInt(endHeader)
    const startR = startRow ? parseInt(startRow) : currentRowId
    const endR = endRow ? parseInt(endRow) : currentRowId

    // Add all cells in the range
    for (let rowId = Math.min(startR, endR); rowId <= Math.max(startR, endR); rowId++) {
      for (let headerId = Math.min(startH, endH); headerId <= Math.max(startH, endH); headerId++) {
        deps.push(`${rowId}-${headerId}`)
      }
    }
  }

  return [...new Set(deps)] // Remove duplicates
}

const buildDependencyGraph = () => {
  const graph = new Map()
  const reverseGraph = new Map()

  props.rows.forEach(row => {
    row.values.forEach(cell => {
      if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
        const cellKey = `${row.id}-${cell.headerId}`
        const deps = extractDependencies(cell.value, row.id, props.rows)

        graph.set(cellKey, deps)

        // Build reverse dependency graph
        deps.forEach(depKey => {
          if (!reverseGraph.has(depKey)) {
            reverseGraph.set(depKey, [])
          }
          reverseGraph.get(depKey).push(cellKey)
        })
      }
    })
  })

  dependencyGraph.value = graph
  reverseDependencyGraph.value = reverseGraph
}

const invalidateDependentFormulas = (changedCellKeys) => {
  if (!Array.isArray(changedCellKeys)) {
    changedCellKeys = [changedCellKeys]
  }

  const toInvalidate = new Set()

  // Find all formulas that depend on the changed cells
  changedCellKeys.forEach(cellKey => {
    const dependentFormulas = reverseDependencyGraph.value.get(cellKey) || []
    dependentFormulas.forEach(formulaKey => toInvalidate.add(formulaKey))
  })

  // Clear cache only for affected formulas
  toInvalidate.forEach(formulaKey => {
    // Remove all cache entries for this cell (all formula variants)
    const [rowId, headerId] = formulaKey.split('-')
    for (const cacheKey of formulaCache.value.keys()) {
      if (cacheKey.startsWith(`${rowId}-${headerId}-`)) {
        formulaCache.value.delete(cacheKey)
      }
    }

    // Also clear range cache entries that might involve this cell
    for (const rangeKey of rangeCacheMap.value.keys()) {
      if (rangeKey.startsWith(`${rowId}-${headerId}-`)) {
        rangeCacheMap.value.delete(rangeKey)
      }
    }
  })

  return toInvalidate.size
}

// Helper functions (pluralizeRecords, getNestedBadgeClass, getNestedLabel) imported from DataTable/utils/formatters.js at line 629

/**
 * Integram Type IDs:
 * 2  - HTML       - HTML content (render as HTML)
 * 3  - SHORT      - Short string (<255 chars, parse phone/email)
 * 4  - DATETIME   - Date and time (timestamp)
 * 5  - GRANT      - System permissions (0=Type editor, 1=All objects, 10=Files)
 * 6  - PWD        - Password (show masked ******)
 * 7  - BUTTON     - Action button
 * 8  - CHARS      - Long string (no length limit, parse phone/email)
 * 9  - DATE       - Date only (YYYYMMDD format)
 * 10 - FILE       - File attachment (link with icon)
 * 11 - BOOLEAN    - Boolean (checkbox)
 * 12 - MEMO       - Multiline text (textarea)
 * 13 - NUMBER     - Integer number
 * 14 - SIGNED     - Decimal number (with sign)
 * 15 - CALCULATABLE - Calculated field (formula result)
 * 16 - REPORT_COLUMN - Report column reference
 * 17 - PATH       - File path
 */

/**
 * Convert value to boolean for Checkbox component
 * Integram API uses 'X' for true and empty string for false
 */
const getBooleanValue = (value) => {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    // Integram uses 'X' for true
    return value === 'X' || value === '1' || value === 'true' || value.toLowerCase() === 'да'
  }
  return Boolean(value)
}

/**
 * Toggle boolean value and save via API
 * Integram API uses 'X' for true and empty string for false
 */
const toggleBooleanValue = async (headerId, rowId, newValue) => {
  console.log('[DataTable] toggleBooleanValue', { headerId, rowId, newValue })

  // Find the row and cell
  const row = processedRows.value.find(r => r.id === rowId)
  if (!row) {
    console.error('[DataTable] toggleBooleanValue: row not found', rowId)
    return
  }

  const cell = row.cells[headerId]
  if (!cell) {
    console.error('[DataTable] toggleBooleanValue: cell not found', headerId)
    return
  }

  // Convert boolean to Integram API format: 'X' for true, empty string for false
  const apiValue = newValue ? 'X' : ''

  // Immediate local update for reactive UI
  const overrideKey = `${rowId}:${headerId}`
  localCellOverrides.value.set(overrideKey, apiValue)

  // Mark cell as changed
  markCellAsChanged(headerId, rowId)

  // Emit cell-update event to save via API
  emit('cell-update', {
    rowId,
    headerId,
    value: apiValue
  })
}

const formatCellValue = (value, type, rowId, headerId) => {
  let displayValue = value
  if (rowId !== null && typeof value === 'string' && value.startsWith('=')) {
    displayValue = evaluateFormula(value, props.rows, rowId, headerId, 0, new Set())
  }
  if (displayValue === null || displayValue === undefined || displayValue === '') return ''

  // Helper function to parse phone numbers and emails
  const parseContactInfo = (str) => {
    // Phone number starting with + (international format)
    // Matches: +7 (495) 123-45-67, +79051234567, +7-495-123-45-67, etc.
    const phoneRegex = /(\+\d{1,3}[-.\s]?\(?\d{1,4}\)?(?:[-.\s]?\d{1,4}){2,4})/g
    // Email pattern
    const emailRegex = /([\w.-]+@[\w.-]+\.\w{2,})/gi

    let result = str

    // Replace phone numbers with clickable chips
    result = result.replace(phoneRegex, (match) => {
      const cleanPhone = match.replace(/[-.\s()]/g, '')
      return `<a href="tel:${cleanPhone}" class="cell-chip cell-phone" title="Позвонить: ${match}" onclick="event.stopPropagation()"><i class="pi pi-phone"></i><span>${match}</span></a>`
    })

    // Replace emails with clickable chips
    result = result.replace(emailRegex, (match) => {
      return `<a href="mailto:${match}" class="cell-chip cell-email" title="Написать: ${match}" onclick="event.stopPropagation()"><i class="pi pi-envelope"></i><span>${match}</span></a>`
    })

    return result
  }

  switch (type) {
    // Type 2: HTML - Render as HTML content
    case 2: {
      const strVal = String(displayValue)
      // If it looks like HTML (contains tags), render as-is with HTML chip style
      if (/<[^>]+>/.test(strVal)) {
        return `<span class="cell-html" title="HTML контент">${strVal}</span>`
      }
      // Otherwise treat like MEMO - parse contacts
      return parseContactInfo(strVal)
    }

    // Type 3: SHORT - Short text with phone/email parsing
    case 3: {
      return parseContactInfo(String(displayValue))
    }

    // Type 5: GRANT - System permissions
    case 5: {
      const val = parseInt(displayValue, 10)
      if (val === 0) {
        return `<span class="cell-chip cell-grant cell-grant-editor" title="Редактор типов"><i class="pi pi-cog"></i><span>Type editor</span></span>`
      }
      if (val === 1) {
        return `<span class="cell-chip cell-grant cell-grant-all" title="Все объекты"><i class="pi pi-database"></i><span>All objects</span></span>`
      }
      if (val === 10) {
        return `<span class="cell-chip cell-grant cell-grant-files" title="Файлы"><i class="pi pi-folder"></i><span>Files</span></span>`
      }
      // Other grant values - show as ID
      return `<span class="cell-chip cell-grant" title="Права доступа: ${val}"><i class="pi pi-shield"></i><span>Grant #${val}</span></span>`
    }

    // Type 6: PWD - Password (masked)
    case 6: {
      if (!displayValue || displayValue === '') return ''
      return `<span class="cell-chip cell-password" title="Пароль скрыт"><i class="pi pi-lock"></i><span>******</span></span>`
    }

    // Type 7: BUTTON - Action button with configurable actions
    // Attrs format: ":ALIAS=ButtonLabel:endpoint:param1=value1:param2=value2:"
    case 7: {
      // Find header to get attrs (contains ALIAS, endpoint, and params)
      const header = localHeaders.value.find(h => h.id === headerId)
      const attrs = header?.attrs || ''

      // Parse attrs format: ":ALIAS=Label:endpoint:targetId=[ID]:headerId=123:"
      const segments = attrs.split(':').filter(s => s.trim())
      let buttonLabel = displayValue || 'Действие'
      let endpoint = ''
      let actionType = 'api-macro'

      for (const segment of segments) {
        if (segment.includes('=')) {
          const [key, value] = segment.split('=')
          if (key === 'ALIAS' && value) {
            buttonLabel = value
          }
        } else if (segment.trim()) {
          // First non-key-value segment is the endpoint
          if (!endpoint) {
            endpoint = segment.trim()
          }
        }
      }

      // Check if this is a 'none' action
      if (endpoint === 'none' || !endpoint) {
        return `<button class="cell-button cell-button-disabled" onclick="event.stopPropagation()" disabled title="Кнопка без действия"><i class="pi pi-ban"></i><span>${buttonLabel}</span></button>`
      }

      // Check if this is a custom URL (starts with http or is a full path)
      if (endpoint.startsWith('http') || endpoint.startsWith('/')) {
        actionType = 'custom-url'
      } else {
        // Check if it matches a known action
        const actionDef = BUTTON_ACTIONS.find(a => a.endpoint === endpoint || a.id === endpoint)
        if (actionDef) {
          actionType = actionDef.actionType
        }
      }

      // Render button with data attributes for click handler
      const dataAttrs = `data-row-id="${rowId}" data-header-id="${headerId}" data-action-type="${actionType}"`
      const isDanger = endpoint.includes('_m_del') || endpoint.includes('delete')
      const buttonClass = isDanger ? 'cell-button cell-button-danger' : 'cell-button cell-button-action'
      const icon = isDanger ? 'pi-trash' : (actionType === 'custom-url' ? 'pi-external-link' : 'pi-bolt')

      return `<button class="${buttonClass} data-table-action-button" ${dataAttrs} title="${buttonLabel}" onclick="event.stopPropagation()"><i class="pi ${icon}"></i><span>${buttonLabel}</span></button>`
    }

    // Type 8: CHARS - Long string (like SHORT)
    case 8: {
      return parseContactInfo(String(displayValue))
    }

    // Type 10: FILE - File attachment with preview
    case 10: {
      const strVal = String(displayValue)
      if (!strVal) return ''

      let fileUrl = ''
      let filename = strVal

      // Check if value is already HTML anchor from API (Format_Val_View)
      const anchorMatch = strVal.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i)
      if (anchorMatch) {
        fileUrl = anchorMatch[1]
        filename = anchorMatch[2]
      } else if (strVal.includes(':')) {
        // Parse format: "id:filename.ext"
        const colonPos = strVal.indexOf(':')
        const fileId = strVal.substring(0, colonPos)
        filename = strVal.substring(colonPos + 1)
        // Use API endpoint for file download (legacy format with ID)
        fileUrl = strVal // Keep raw value - URL not available without server
      } else if (strVal.startsWith('/')) {
        // Already a path
        fileUrl = strVal
        filename = strVal.split('/').pop() || strVal
      } else {
        filename = strVal
      }

      // Get file extension for icon and preview
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
      const isVideo = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'ogv'].includes(ext)
      const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)

      let icon = 'pi-file'
      if (isImage) icon = 'pi-image'
      else if (['pdf'].includes(ext)) icon = 'pi-file-pdf'
      else if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) icon = 'pi-file-word'
      else if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) icon = 'pi-file-excel'
      else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) icon = 'pi-box'
      else if (isAudio) icon = 'pi-volume-up'
      else if (isVideo) icon = 'pi-video'

      // Build full URL with API server prefix for relative paths
      const fullFileUrl = (fileUrl && fileUrl.startsWith('/') && props.serverUrl)
        ? `${props.serverUrl}${fileUrl}`
        : fileUrl

      // If image and we have URL - show preview thumbnail (opens in modal on click)
      if (isImage && fullFileUrl && (fullFileUrl.startsWith('/') || fullFileUrl.startsWith('http'))) {
        const escapedUrl = fullFileUrl.replace(/'/g, "\\'")
        const escapedFilename = filename.replace(/'/g, "\\'")
        return `<a href="javascript:void(0)" class="cell-file cell-file-preview" title="Открыть: ${filename}" onclick="event.stopPropagation(); window.__dataTableOpenImagePreview && window.__dataTableOpenImagePreview('${escapedUrl}', '${escapedFilename}')"><img src="${fullFileUrl}" alt="${filename}" class="cell-file-thumbnail" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="cell-file-fallback" style="display:none"><i class="pi ${icon}"></i><span>${filename}</span></span></a>`
      }

      // For other files with URL - clickable link
      if (fullFileUrl && (fullFileUrl.startsWith('/') || fullFileUrl.startsWith('http'))) {
        return `<a href="${fullFileUrl}" class="cell-chip cell-file" target="_blank" rel="noopener" title="Скачать: ${filename}" onclick="event.stopPropagation()"><i class="pi ${icon}"></i><span>${filename}</span></a>`
      }

      // No URL available - just display filename with icon
      return `<span class="cell-chip cell-file" title="Файл: ${filename}"><i class="pi ${icon}"></i><span>${filename}</span></span>`
    }

    // Type 11: BOOLEAN - Checkbox
    case 11: {
      if (displayValue && displayValue !== '' && displayValue !== '0' && displayValue !== 'false') {
        return `<span class="cell-boolean cell-boolean-true" title="Да"><i class="pi pi-check-circle"></i></span>`
      }
      return `<span class="cell-boolean cell-boolean-false" title="Нет"><i class="pi pi-times-circle"></i></span>`
    }

    // Type 12: MEMO - Multiline text
    case 12: {
      const strVal = String(displayValue)
      // Truncate long text but preserve newlines hint
      const hasNewlines = strVal.includes('\n')
      const truncated = strVal.length > 100 ? strVal.substring(0, 100) + '...' : strVal
      const parsed = parseContactInfo(truncated.replace(/\n/g, ' '))

      if (hasNewlines || strVal.length > 100) {
        return `<span class="cell-memo" title="${strVal.replace(/"/g, '&quot;').substring(0, 500)}"><i class="pi pi-align-left"></i>${parsed}</span>`
      }
      return parsed
    }

    // Type 15: CALCULATABLE - Calculated/formula field
    case 15: {
      const strVal = String(displayValue)
      return `<span class="cell-chip cell-calculated" title="Вычисляемое поле"><i class="pi pi-calculator"></i><span>${strVal}</span></span>`
    }

    // Type 16: REPORT_COLUMN - Report column reference
    case 16: {
      const strVal = String(displayValue)
      // Special values
      if (strVal === '0') {
        return `<span class="cell-chip cell-report-col" title="Вычисляемая колонка отчёта"><i class="pi pi-table"></i><span>Вычисляемое</span></span>`
      }
      return `<span class="cell-chip cell-report-col" title="Колонка отчёта: ${strVal}"><i class="pi pi-table"></i><span>${strVal}</span></span>`
    }

    // Type 17: PATH - File path (clickable link)
    case 17: {
      const strVal = String(displayValue)
      if (!strVal) return ''

      // PATH type returns the full path from API (Format_Val_View)
      // Format: /download/database/subdir/filename.ext
      let path = strVal

      // If value contains ":" (raw format id:filename.ext), extract just filename for display
      let displayName = path
      if (strVal.includes(':') && !strVal.startsWith('/')) {
        const colonPos = strVal.indexOf(':')
        displayName = strVal.substring(colonPos + 1)
      } else {
        // Use just the filename part for display
        displayName = path.split('/').pop() || path
      }

      // Build full URL with API server prefix for relative paths
      const fullPath = (path.startsWith('/') && props.serverUrl)
        ? `${props.serverUrl}${path}`
        : path

      // If path starts with "/" or is full URL - it's valid, make it clickable
      if (path.startsWith('/') || fullPath.startsWith('http')) {
        return `<a href="${fullPath}" class="cell-path-link" target="_blank" rel="noopener" title="Открыть: ${path}" onclick="event.stopPropagation()"><i class="pi pi-external-link"></i><span>${displayName}</span></a>`
      }

      // No valid path - just display as text
      return `<span class="cell-path" title="Путь: ${strVal}"><i class="pi pi-folder-open"></i><span>${displayName}</span></span>`
    }
    case 9: {
      // Handle both numeric timestamps and string timestamps
      let timestamp = null
      if (typeof displayValue === 'number') {
        timestamp = displayValue
      } else if (typeof displayValue === 'string') {
        if (/^\d+$/.test(displayValue)) {
          timestamp = parseInt(displayValue, 10)
        } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(displayValue)) {
          // Parse dd.mm.yyyy format
          const parts = displayValue.split('.')
          const day = parseInt(parts[0], 10)
          const month = parseInt(parts[1], 10) - 1
          const year = parseInt(parts[2], 10)
          const date = new Date(year, month, day)
          timestamp = Math.floor(date.getTime() / 1000)
        } else {
          // Unknown format - return as-is
          return displayValue
        }
      }
      if (timestamp) {
        return formatDateStyled(timestamp, props.dateStyle)
      }
      return displayValue
    }
    case 4: {
      // Handle both numeric timestamps and string timestamps
      let timestamp = null
      if (typeof displayValue === 'number') {
        timestamp = displayValue
      } else if (typeof displayValue === 'string') {
        // If it looks like a numeric timestamp string, parse and format it
        if (/^\d+$/.test(displayValue)) {
          timestamp = parseInt(displayValue, 10)
        } else if (/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(displayValue)) {
          // Parse dd.mm.yyyy HH:mm:ss format
          const [datePart, timePart] = displayValue.split(/\s+/)
          const [day, month, year] = datePart.split('.').map(n => parseInt(n, 10))
          const [hours, mins, secs] = timePart.split(':').map(n => parseInt(n, 10))
          const date = new Date(year, month - 1, day, hours, mins, secs)
          timestamp = Math.floor(date.getTime() / 1000)
        } else {
          // Unknown format - return as-is
          return displayValue
        }
      }
      if (timestamp) {
        return formatDateTimeStyled(timestamp, props.dateStyle)
      }
      return displayValue
    }
    case 13: { // INTEGER - целое число
      const num = typeof displayValue === 'number' ? displayValue : parseInt(displayValue, 10)
      if (isNaN(num)) return displayValue
      const formatted = num.toLocaleString('ru-RU')
      const negativeClass = num < 0 ? ' cell-number-negative' : ''
      return `<span class="cell-number cell-number-integer${negativeClass}">${formatted}</span>`
    }
    case 14: { // DECIMAL - число с десятичной частью
      const num = typeof displayValue === 'number' ? displayValue : parseFloat(displayValue)
      if (isNaN(num)) return displayValue
      const formatted = num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const negativeClass = num < 0 ? ' cell-number-negative' : ''
      return `<span class="cell-number cell-number-decimal${negativeClass}">${formatted}</span>`
    }
    default: return displayValue
  }
}

const formatDate = (timestamp, format) => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  return format
    .replace('dd', String(date.getDate()).padStart(2, '0'))
    .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
    .replace('yyyy', date.getFullYear())
    .replace('HH', String(date.getHours()).padStart(2, '0'))
    .replace('mm', String(date.getMinutes()).padStart(2, '0'))
    .replace('ss', String(date.getSeconds()).padStart(2, '0'))
}

// Date styling functions
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS_OF_WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

const getFullDateTooltip = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const dayOfWeek = DAYS_OF_WEEK[date.getDay()]
  const day = date.getDate()
  const month = MONTHS_FULL[date.getMonth()]
  const year = date.getFullYear()
  return `${dayOfWeek}, ${day} ${month} ${year}`
}

const getFullDateTimeTooltip = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const dayOfWeek = DAYS_OF_WEEK[date.getDay()]
  const day = date.getDate()
  const month = MONTHS_FULL[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  return `${dayOfWeek}, ${day} ${month} ${year}, ${hours}:${mins}`
}

const getRelativeDateInfo = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  const diffTime = date.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  let label, cssClass
  if (diffDays === 0) {
    label = 'Сегодня'
    cssClass = 'date-today'
  } else if (diffDays === -1) {
    label = 'Вчера'
    cssClass = 'date-past'
  } else if (diffDays === 1) {
    label = 'Завтра'
    cssClass = 'date-future'
  } else if (diffDays > 1 && diffDays <= 7) {
    label = `Через ${diffDays} ${pluralizeDays(diffDays)}`
    cssClass = 'date-future'
  } else if (diffDays < -1 && diffDays >= -7) {
    label = `${Math.abs(diffDays)} ${pluralizeDays(Math.abs(diffDays))} назад`
    cssClass = 'date-past'
  } else if (diffDays > 7) {
    label = `Через ${diffDays} ${pluralizeDays(diffDays)}`
    cssClass = 'date-far-future'
  } else {
    label = `${Math.abs(diffDays)} ${pluralizeDays(Math.abs(diffDays))} назад`
    cssClass = 'date-far-past'
  }

  return { label, cssClass, diffDays }
}

const pluralizeDays = (n) => {
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 11 && lastTwo <= 19) return 'дней'
  if (lastOne === 1) return 'день'
  if (lastOne >= 2 && lastOne <= 4) return 'дня'
  return 'дней'
}

const formatDateStyled = (timestamp, style) => {
  if (!timestamp) return ''

  const date = new Date(timestamp * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const monthShort = MONTHS_SHORT[date.getMonth()]
  const info = getRelativeDateInfo(timestamp)
  const tooltip = getFullDateTooltip(timestamp)

  // Unified pill style with calendar icon for all formats
  let displayText
  switch (style) {
    case 'classic':
      displayText = `${day}.${month}.${year}`
      break
    case 'relative':
      displayText = info.label
      break
    case 'pill':
    default:
      displayText = Math.abs(info.diffDays) <= 7 ? info.label : `${date.getDate()} ${monthShort}`
      break
  }

  return `<span class="cell-chip cell-date ${info.cssClass}" data-tooltip="${tooltip}"><i class="pi pi-calendar"></i><span>${displayText}</span></span>`
}

const formatDateTimeStyled = (timestamp, style) => {
  if (!timestamp) return ''

  const date = new Date(timestamp * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  const monthShort = MONTHS_SHORT[date.getMonth()]
  const info = getRelativeDateInfo(timestamp)
  const timeStr = `${hours}:${mins}`
  const tooltip = getFullDateTimeTooltip(timestamp)

  // Unified pill style with clock icon for all formats
  let displayText
  switch (style) {
    case 'classic':
      displayText = `${day}.${month}.${year} ${timeStr}`
      break
    case 'relative':
      displayText = `${info.label}, ${timeStr}`
      break
    case 'pill':
    default:
      displayText = Math.abs(info.diffDays) <= 7 ? `${info.label}, ${timeStr}` : `${date.getDate()} ${monthShort}, ${timeStr}`
      break
  }

  return `<span class="cell-chip cell-datetime ${info.cssClass}" data-tooltip="${tooltip}"><i class="pi pi-clock"></i><span>${displayText}</span></span>`
}

const getHeaderDirTableId = headerId => localHeaders.value.find(h => h.id === headerId)?.dirTableId
// const getDirectoryOptions = dirTableId => {
//   const options = directoryCache.value[dirTableId] || []
//   console.log('[getDirectoryOptions] dirTableId:', dirTableId, 'options:', options.length, 'sample:', options[0])
//   return options
// }

// const loadDirectoryList = dirTableId => {
//   console.log('[DataTable.loadDirectoryList] dirTableId:', dirTableId, 'cached:', !!directoryCache.value[dirTableId])
//   if (!directoryCache.value[dirTableId]) {
//     loadingDirectories.value.add(dirTableId)
//     console.log('[DataTable.loadDirectoryList] Emitting load-directory-list for:', dirTableId)
//     emit('load-directory-list', {
//       dirTableId,
//       callback: list => {
//         console.log('[DataTable.loadDirectoryList] Callback received for:', dirTableId, 'items:', list?.length)
//         directoryCache.value[dirTableId] = list
//         loadingDirectories.value.delete(dirTableId)
//       }
//     })
//   }
// }

// const updateDirValue = header => {
//   const dirTableId = header.dirTableId
//   const selectedItem = directoryCache.value[dirTableId]?.find(item => item.id === header.dirRowId)
//   header.value = selectedItem ? selectedItem.value : ''
// }

// const updateMultiDirValue = header => {
//   const dirTableId = header.dirTableId
//   const selectedItems = directoryCache.value[dirTableId]?.filter(item => header.dirValues.includes(item.id))
//   header.value = selectedItems.map(item => item.value).join(', ') || ''
// }

// const showConfirmationDialog = (message, action, data = null) => {
//   confirmMessage.value = message
//   pendingAction.value = action
//   pendingActionData.value = data
//   isConfirmDialogVisible.value = true
// }

// const confirmAction = () => {
//   if (pendingAction.value) pendingAction.value(pendingActionData.value)
//   isConfirmDialogVisible.value = false
// }

// const onHeaderContextMenu = (event, header) => {
//   currentHeader.value = header
//   currentHeaderTarget.value = event.currentTarget
//   headerContextMenu.value.show(event)
// }

// const showTypeOverlay = event => {
//   if (event) typeMenu.value.show(event, currentHeaderTarget.value)
//   else typeMenu.value.toggle(event, currentHeaderTarget.value)
//   headerContextMenu.value.hide()
// }

// const emitHeaderAction = async action => {
//   if (action === 'rename') {
//     editingHeaderId.value = currentHeader.value.id
//     editingHeaderName.value = currentHeader.value.value
//     await nextTick()
    // Focus the header editor input
//     if (headerEditorInput.value) {
//       const inputEl = headerEditorInput.value.$el || headerEditorInput.value
//       if (inputEl && inputEl.focus) {
//         inputEl.focus()
//       }
//     }
//   } else {
//     emit('header-action', {
//       action,
//       headerId: currentHeader.value?.id,
//       termId: currentHeader.value?.termId,
//       value: currentHeader.value?.value,
//       type: currentHeader.value?.type
//     })
//   }
// }

// const saveHeaderRename = () => {
//   if (editingHeaderName.value.trim()) {
//     emit('header-action', {
//       action: 'rename',
//       headerId: currentHeader.value.id,
//       termId: currentHeader.value.termId,
//       value: editingHeaderName.value.trim(),
//       type: currentHeader.value?.type
//     })
//     editingHeaderId.value = null
//     editingHeaderName.value = ''
//   }
// }

// const cancelHeaderRename = () => {
//   editingHeaderId.value = null
//   editingHeaderName.value = ''
// }

// const changeColumnType = typeId => {
//   showConfirmationDialog(
//     'Вы уверены, что хотите изменить тип колонки? Это может привести к потере данных.',
//     () => {
//       emit('header-action', {
//         action: 'change-type',
//         headerId: currentHeader.value?.id,
//         termId: currentHeader.value?.termId,
//         value: currentHeader.value?.value,
//         type: typeId
//       })
//       typeMenu.value.hide()
//     }
//   )
// }

// const onRowContextMenu = (event, row) => {
//   contextMenuRow.value = row
//   rowContextMenu.value.show(event)
// }

// const copyCellValue = () => {
//   if (!contextMenuRow.value || !selectedCells.value.start) return
//   const headerId = selectedCells.value.start.headerId
//   if (headerId === 'row-counter') return
//   const cell = contextMenuRow.value.cells[headerId]
//   if (cell) copiedCellValue.value = cell.value
// }

// const pasteCellValue = () => {
//   if (!contextMenuRow.value || !selectedCells.value.start || !copiedCellValue.value) return
//   const headerId = selectedCells.value.start.headerId
//   if (headerId === 'row-counter') return
//   emit('cell-update', {
//     rowId: contextMenuRow.value.id,
//     headerId: headerId,
//     value: copiedCellValue.value
//   })
// }

// const editRow = () => {
//   if (!contextMenuRow.value) return
//   startRowEdit(contextMenuRow.value)
// }

// const deleteRow = () => {
//   if (!contextMenuRow.value) return
//   showConfirmationDialog(
//     'Вы уверены, что хотите удалить эту строку? Данные будут потеряны.',
//     () => emit('row-delete', contextMenuRow.value.id)
//   )
// }

// const toggleHeaderMenu = (event, header) => {
//   currentHeader.value = header
//   typeMenu.value.toggle(event)
//   showTypeSubmenu.value = false
// }

// const deleteColumn = () => {
//   showConfirmationDialog(
//     'Вы уверены, что хотите удалить эту колонку? Все данные в ней будут потеряны.',
//     () => {
//       emit('header-action', {
//         action: 'delete',
//         headerId: currentHeader.value.id,
//         termId: currentHeader.value.termId
//       })
//       typeMenu.value.hide()
//     }
//   )
// }
// const toggleMultiGroupBy = (headerIds) => {
//   const validHeaderIds = headerIds.filter(id => 
//     id && localHeaders.value.some(header => header.id === id)
//   )
//   
//   if (validHeaderIds.length === 0 || 
//       (currentGroupColumns.value.length === validHeaderIds.length && 
//        currentGroupColumns.value.every(id => validHeaderIds.includes(id)))) {
//     groupedData.value = null
//     currentGroupColumns.value = []
//     expandedGroups.value = {}
//   } else {
//     currentGroupColumns.value = validHeaderIds
//     groupMultiData(validHeaderIds)
//   }
// }
// const groupMultiData = (headerIds) => {
//   const groups = {}
// 
//   sortedAndFilteredRows.value.forEach(row => {
//     const groupKey = headerIds.map(headerId => {
//       const cell = row.cells[headerId]
//       const value = cell?.value
//       return value !== null && value !== undefined ? value : '(Пусто)'
//     }).join('|')
// 
//     if (!groups[groupKey]) groups[groupKey] = { rows: [], count: 0 }
//     groups[groupKey].rows.push(row)
//     groups[groupKey].count++
//   })
// 
//   groupedData.value = { columns: headerIds, groups: groups }
//   expandedGroups.value = Object.keys(groups).reduce((acc, key) => {
//     acc[key] = true
//     return acc
//   }, {})
// }
// const toggleGroupBy = headerId => {
//   if (currentGroupColumn.value === headerId) {
//     groupedData.value = null
//     currentGroupColumn.value = null
//     expandedGroups.value = {}
//   } else {
//     currentGroupColumn.value = headerId
//     groupData(headerId)
//   }
// }

// const groupData = headerId => {
//   const groups = {}
//   sortedAndFilteredRows.value.forEach(row => {
//     const cell = row.cells[headerId]
//     const groupKey = cell?.value || '(Пусто)'
//     if (!groups[groupKey]) groups[groupKey] = { rows: [], count: 0 }
//     groups[groupKey].rows.push(row)
//     groups[groupKey].count++
//   })
//   groupedData.value = { column: headerId, groups }
//   expandedGroups.value = Object.keys(groups).reduce((acc, key) => {
//     acc[key] = true
//     return acc
//   }, {})
// }
// const toggleGroup = groupKey => expandedGroups.value[groupKey] = !expandedGroups.value[groupKey]

// Cached row index map for O(1) lookup instead of O(n²)
const rowIndexMap = computed(() => {
  const map = new Map()
  let displayIndex = 0
  flattenedRows.value.forEach(item => {
    if (item.type === 'row') {
      map.set(item.data.id, displayIndex)
      displayIndex++
    }
  })
  return map
})

// Find row index in the CURRENT display order - O(1) using cached Map
const findRowIndex = rowId => {
  const cachedIndex = rowIndexMap.value.get(rowId)
  return cachedIndex !== undefined ? cachedIndex : -1
}
const isCellSelected = (headerId, rowId) => selectedCells.value.start?.headerId === headerId && selectedCells.value.start?.rowId === rowId

// Quick Column Filters functions
function getUniqueValuesForColumn(headerId) {
  const values = new Set()
  processedRows.value.forEach(row => {
    const cellValue = row.cells[headerId]?.value
    values.add(String(cellValue ?? ''))
  })
  return Array.from(values).sort((a, b) => {
    // Sort with empty strings at the end
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b, 'ru')
  })
}

function toggleColumnFilter(headerId, event) {
  // Закрыть другие фильтры
  if (activeFilterColumn.value && activeFilterColumn.value !== headerId) {
    const prevPopover = columnFilterPopovers.value[activeFilterColumn.value]
    if (prevPopover) {
      prevPopover.hide()
    }
  }

  activeFilterColumn.value = headerId

  // Инициализировать фильтр для колонки если еще не создан
  if (!columnFilters.value[headerId]) {
    columnFilters.value[headerId] = new Set()
  }

  // Инициализировать поиск
  if (!columnFilterSearch.value[headerId]) {
    columnFilterSearch.value[headerId] = ''
  }

  // Toggle popover
  const popover = columnFilterPopovers.value[headerId]
  if (popover) {
    popover.toggle(event)
  }
}

function getFilteredUniqueValues(headerId) {
  const allValues = getUniqueValuesForColumn(headerId)
  const searchQuery = columnFilterSearch.value[headerId]?.toLowerCase() || ''

  if (!searchQuery) return allValues

  return allValues.filter(value =>
    value.toLowerCase().includes(searchQuery)
  )
}

function toggleFilterValue(headerId, value) {
  const filters = columnFilters.value[headerId]

  if (filters.has(value)) {
    filters.delete(value)
  } else {
    filters.add(value)
  }

  // Обновить группировку если активна
  if (currentGroupColumns.value.length > 0) {
    groupMultiData(currentGroupColumns.value)
  } else if (currentGroupColumn.value) {
    groupData(currentGroupColumn.value)
  }
}

function clearColumnFilter(headerId) {
  columnFilters.value[headerId] = new Set()
  columnFilterSearch.value[headerId] = ''

  // Обновить группировку если активна
  if (currentGroupColumns.value.length > 0) {
    groupMultiData(currentGroupColumns.value)
  } else if (currentGroupColumn.value) {
    groupData(currentGroupColumn.value)
  }
}

function selectAllFilterValues(headerId) {
  const allValues = getFilteredUniqueValues(headerId)
  columnFilters.value[headerId] = new Set(allValues)

  // Обновить группировку если активна
  if (currentGroupColumns.value.length > 0) {
    groupMultiData(currentGroupColumns.value)
  } else if (currentGroupColumn.value) {
    groupData(currentGroupColumn.value)
  }
}

function hasActiveColumnFilter(headerId) {
  const filters = columnFilters.value[headerId]
  return filters && filters.size > 0
}

// Row Selection + Bulk Operations functions
const isAllRowsSelected = computed(() => {
  if (filteredByColumnRows.value.length === 0) return false
  return filteredByColumnRows.value.every(row => selectedRowIds.value.has(row.id))
})

function toggleSelectAll() {
  if (isAllRowsSelected.value) {
    // Deselect all
    selectedRowIds.value.clear()
  } else {
    // Select all visible (filtered) rows
    filteredByColumnRows.value.forEach(row => {
      selectedRowIds.value.add(row.id)
    })
  }
  bulkActionsVisible.value = selectedRowIds.value.size > 0
}

function toggleRowSelection(rowId, event, rowIndex) {
  if (event.shiftKey && lastSelectedRowIndex.value !== null) {
    // Shift+Click: Select range
    const start = Math.min(lastSelectedRowIndex.value, rowIndex)
    const end = Math.max(lastSelectedRowIndex.value, rowIndex)

    for (let i = start; i <= end; i++) {
      const row = filteredByColumnRows.value[i]
      if (row) {
        selectedRowIds.value.add(row.id)
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl+Click: Toggle individual
    if (selectedRowIds.value.has(rowId)) {
      selectedRowIds.value.delete(rowId)
    } else {
      selectedRowIds.value.add(rowId)
    }
    lastSelectedRowIndex.value = rowIndex
  } else {
    // Regular click: Toggle single
    if (selectedRowIds.value.has(rowId)) {
      selectedRowIds.value.delete(rowId)
    } else {
      selectedRowIds.value.add(rowId)
    }
    lastSelectedRowIndex.value = rowIndex
  }

  bulkActionsVisible.value = selectedRowIds.value.size > 0
}

function toggleSelectionMode() {
  selectionModeEnabled.value = !selectionModeEnabled.value

  if (!selectionModeEnabled.value) {
    // Выключаем режим - очищаем выделение
    clearSelection()
  }
}

function clearSelection() {
  selectedRowIds.value.clear()
  lastSelectedRowIndex.value = null
  bulkActionsVisible.value = false
  selectionModeEnabled.value = false
}

function bulkDeleteSelected() {
  if (selectedRowIds.value.size === 0) return

  const count = selectedRowIds.value.size
  confirmMessage.value = `Удалить ${count} выбранных записей?`
  pendingAction.value = () => {
    // Emit bulk delete event
    emit('bulk-delete', Array.from(selectedRowIds.value))
    clearSelection()
  }
  isConfirmDialogVisible.value = true
}

function bulkExportSelected() {
  if (selectedRowIds.value.size === 0) return

  // Filter rows by selected IDs
  const selectedRows = props.rows.filter(row => selectedRowIds.value.has(row.id))

  // TODO: Implement export logic (Excel/CSV)
  console.log('Exporting', selectedRows.length, 'rows')
}

// Column Pinning (Phase 1 - Feature Roadmap)
function togglePinColumn(headerId) {
  if (!headerId) return

  if (pinnedColumns.value.has(headerId)) {
    pinnedColumns.value.delete(headerId)
  } else {
    pinnedColumns.value.add(headerId)
  }
}

// Conditional Formatting (Phase 2 - Feature Roadmap)
function openFormattingDialog(headerId) {
  if (!headerId) return

  editingRule.value = {
    id: Date.now().toString(),
    headerId: headerId,
    condition: 'greater', // greater, less, equal, contains, empty, notEmpty
    value: '',
    backgroundColor: '#dcfce7', // Light green
    textColor: '#166534' // Dark green
  }

  isFormattingDialogVisible.value = true
}

function saveFormattingRule() {
  if (!editingRule.value) return

  // Check if rule already exists for this column and condition
  const existingIndex = formattingRules.value.findIndex(
    r => r.headerId === editingRule.value.headerId && r.id === editingRule.value.id
  )

  if (existingIndex >= 0) {
    // Update existing rule
    formattingRules.value[existingIndex] = { ...editingRule.value }
  } else {
    // Add new rule
    formattingRules.value.push({ ...editingRule.value })
  }

  isFormattingDialogVisible.value = false
  editingRule.value = null
}

function deleteFormattingRule(ruleId) {
  formattingRules.value = formattingRules.value.filter(r => r.id !== ruleId)
}

// Image Preview Modal functions
function openImagePreview(url, filename) {
  imagePreviewUrl.value = url
  imagePreviewFilename.value = filename || 'Изображение'
  isImagePreviewVisible.value = true
}

function onImagePreviewError() {
  console.error('[DataTable] Image preview failed to load:', imagePreviewUrl.value)
}

function downloadPreviewImage() {
  if (!imagePreviewUrl.value) return
  const link = document.createElement('a')
  link.href = imagePreviewUrl.value
  link.download = imagePreviewFilename.value || 'image'
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Expose openImagePreview to window for onclick handlers in formatted HTML
if (typeof window !== 'undefined') {
  window.__dataTableOpenImagePreview = openImagePreview
}

// Apply formatting rules to cell value
function getCellStyle(headerId, value) {
  const rules = formattingRules.value.filter(r => r.headerId === headerId)

  for (const rule of rules) {
    let matches = false

    switch (rule.condition) {
      case 'greater':
        matches = parseFloat(value) > parseFloat(rule.value)
        break
      case 'less':
        matches = parseFloat(value) < parseFloat(rule.value)
        break
      case 'equal':
        matches = String(value).toLowerCase() === String(rule.value).toLowerCase()
        break
      case 'contains':
        matches = String(value).toLowerCase().includes(String(rule.value).toLowerCase())
        break
      case 'empty':
        matches = !value || String(value).trim() === ''
        break
      case 'notEmpty':
        matches = value && String(value).trim() !== ''
        break
    }

    if (matches) {
      return {
        backgroundColor: rule.backgroundColor,
        color: rule.textColor
      }
    }
  }

  return {}
}

// Computed: Calculate left offset for each pinned column
const pinnedColumnsOffsets = computed(() => {
  const offsets = {}
  let cumulativeOffset = 0

  // Add row counter width first (if present)
  const rowCounterWidth = 80 // Default row counter width

  // Calculate offsets for each pinned column
  localHeaders.value.forEach((header, index) => {
    if (pinnedColumns.value.has(header.id)) {
      offsets[header.id] = cumulativeOffset + rowCounterWidth
      // Assume default column width of 150px (can be enhanced later with actual widths)
      const columnWidth = header.width || 150
      cumulativeOffset += columnWidth
    }
  })

  return offsets
})

// Helper: Check if column is pinned
const isPinnedColumn = (headerId) => {
  return pinnedColumns.value.has(headerId)
}

// Multi-level Sorting (Phase 1 - Feature Roadmap)
function handleHeaderSort(headerId, event) {
  if (!headerId) return

  // Client-side sorting requires all data to be loaded
  if (!props.allDataLoaded) {
    console.warn('Sorting requires all data to be loaded. Enable "Auto-load all data" in settings.')
    return
  }

  // Shift+Click: Add to sort columns (max 3)
  if (event.shiftKey) {
    const existingIndex = sortColumns.value.findIndex(col => col.headerId === headerId)

    if (existingIndex >= 0) {
      // Toggle direction if already in sort list
      const currentDir = sortColumns.value[existingIndex].direction
      sortColumns.value[existingIndex].direction = currentDir === 'asc' ? 'desc' : 'asc'
    } else {
      // Add to sort list (max 3 columns)
      if (sortColumns.value.length < 3) {
        sortColumns.value.push({ headerId, direction: 'asc' })
      } else {
        // Replace the oldest sort column
        sortColumns.value.shift()
        sortColumns.value.push({ headerId, direction: 'asc' })
      }
    }
  } else {
    // Regular click: Replace all sorts with this column
    const existingIndex = sortColumns.value.findIndex(col => col.headerId === headerId)

    if (existingIndex === 0 && sortColumns.value.length === 1) {
      // Toggle direction if it's the only sort
      const currentDir = sortColumns.value[0].direction
      sortColumns.value[0].direction = currentDir === 'asc' ? 'desc' : 'asc'
    } else {
      // Replace with new sort
      sortColumns.value = [{ headerId, direction: 'asc' }]
    }
  }
}

function clearSort() {
  sortColumns.value = []
}

// Helper: Get sort info for a column
function getSortInfo(headerId) {
  const index = sortColumns.value.findIndex(col => col.headerId === headerId)
  if (index < 0) return null

  return {
    order: index + 1, // 1-based for display
    direction: sortColumns.value[index].direction
  }
}

// Helper: Check if column is sorted
function isColumnSorted(headerId) {
  return sortColumns.value.some(col => col.headerId === headerId)
}

// Column Footer Aggregations (Phase 1 - Feature Roadmap)
function setAggregationType(headerId, type) {
  if (!headerId) return
  aggregationTypes.value[headerId] = type
}

function toggleFooter() {
  showFooter.value = !showFooter.value
}

function getAggregationValue(headerId) {
  const agg = columnAggregations.value[headerId]
  if (!agg) return ''

  const type = aggregationTypes.value[headerId] || 'sum'
  const value = agg[type]

  if (value == null || value === 0) return ''

  // Format based on type
  if (type === 'count') return `n=${value}`
  if (type === 'sum') return `Σ=${value}`
  if (type === 'avg') return `x̄=${value}`

  return value
}

function onFooterCellContextMenu(event, header) {
  // Show context menu for changing aggregation type
  footerContextMenu.value?.show(event)
  currentFooterHeader.value = header
}

const currentFooterHeader = ref(null)
const footerContextMenu = ref(null)

const footerMenuItems = computed(() => [
  {
    label: 'Сумма (SUM)',
    icon: 'pi pi-plus',
    command: () => setAggregationType(currentFooterHeader.value?.id, 'sum')
  },
  {
    label: 'Среднее (AVG)',
    icon: 'pi pi-chart-line',
    command: () => setAggregationType(currentFooterHeader.value?.id, 'avg')
  },
  {
    label: 'Количество (COUNT)',
    icon: 'pi pi-hashtag',
    command: () => setAggregationType(currentFooterHeader.value?.id, 'count')
  },
  { separator: true },
  {
    label: showFooter.value ? 'Скрыть футер' : 'Показать футер',
    icon: showFooter.value ? 'pi pi-eye-slash' : 'pi pi-eye',
    command: () => toggleFooter()
  }
])

// Excel-like Copy/Paste (Phase 1 - Feature Roadmap)
async function copySelectedCells() {
  if (!selectedCells.value.start) return

  const start = selectedCells.value.start
  const end = selectedCells.value.end || start

  // Get selection range
  const startRowIdx = processedRows.value.findIndex(r => r.id === start.rowId)
  const endRowIdx = processedRows.value.findIndex(r => r.id === end.rowId)
  const startColIdx = localHeaders.value.findIndex(h => h.id === start.headerId)
  const endColIdx = localHeaders.value.findIndex(h => h.id === end.headerId)

  const minRow = Math.min(startRowIdx, endRowIdx)
  const maxRow = Math.max(startRowIdx, endRowIdx)
  const minCol = Math.min(startColIdx, endColIdx)
  const maxCol = Math.max(startColIdx, endColIdx)

  // Build TSV data (Tab-Separated Values for Excel compatibility)
  const rows = []
  for (let r = minRow; r <= maxRow; r++) {
    const row = processedRows.value[r]
    const cells = []
    for (let c = minCol; c <= maxCol; c++) {
      const header = localHeaders.value[c]
      const cellValue = row.cells[header.id]?.value ?? ''
      cells.push(String(cellValue))
    }
    rows.push(cells.join('\t'))
  }

  const tsvData = rows.join('\n')

  // Copy to clipboard using modern Clipboard API
  try {
    await navigator.clipboard.writeText(tsvData)

    // Store for internal paste
    clipboardData.value = {
      data: tsvData,
      rows: maxRow - minRow + 1,
      cols: maxCol - minCol + 1
    }

    console.log('Copied to clipboard:', tsvData)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function pasteToSelectedCells() {
  if (!selectedCells.value.start) return

  try {
    // Read from clipboard
    const text = await navigator.clipboard.readText()

    if (!text) return

    // Parse TSV data
    const rows = text.split('\n').map(row => row.split('\t'))

    // Get starting position
    const start = selectedCells.value.start
    const startRowIdx = processedRows.value.findIndex(r => r.id === start.rowId)
    const startColIdx = localHeaders.value.findIndex(h => h.id === start.headerId)

    if (startRowIdx === -1 || startColIdx === -1) return

    // Paste data
    const updates = []
    for (let r = 0; r < rows.length; r++) {
      const targetRowIdx = startRowIdx + r
      if (targetRowIdx >= processedRows.value.length) break

      const row = processedRows.value[targetRowIdx]
      const cells = rows[r]

      for (let c = 0; c < cells.length; c++) {
        const targetColIdx = startColIdx + c
        if (targetColIdx >= localHeaders.value.length) break

        const header = localHeaders.value[targetColIdx]
        const newValue = cells[c]

        // Update cell value
        updates.push({
          rowId: row.id,
          headerId: header.id,
          cellId: row.cells[header.id]?.id,
          value: newValue
        })
      }
    }

    // Emit updates
    for (const update of updates) {
      emit('cell-update', {
        cellId: update.cellId,
        headerId: update.headerId,
        value: update.value,
        rowId: update.rowId
      })
    }

    console.log('Pasted', updates.length, 'cells')
  } catch (err) {
    console.error('Failed to paste:', err)
  }
}

const isInSelectionRange = (headerId, rowId) => {
  if (!selectionRange.value) return false
  const rowIndex = processedRows.value.findIndex(r => r.id === rowId)
  const colIndex = headerId === 'row-counter' ? -1 : localHeaders.value.findIndex(h => h.id === headerId)
  return (
    rowIndex >= selectionRange.value.minRow &&
    rowIndex <= selectionRange.value.maxRow &&
    colIndex >= selectionRange.value.minCol &&
    colIndex <= selectionRange.value.maxCol
  )
}

// const handleDocumentClick = event => {
//   if (isDropdownOpen.value) return
// 
//   if (editingCell.value) {
//     const cellElement = document.querySelector(`td[data-row-id="${editingCell.value.rowId}"][data-header-id="${editingCell.value.headerId}"]`)
//     const rowCounterCell = document.querySelector(`td.row-counter-cell[data-row-id="${editingCell.value.rowId}"]`)
//     if (!cellElement && !rowCounterCell) return
// 
//     let isClickInsideEditor = false
//     if (cellElement && cellElement.contains(event.target)) isClickInsideEditor = true
//     if (rowCounterCell && rowCounterCell.contains(event.target)) isClickInsideEditor = true
// 
//     if (!isClickInsideEditor) {
//       saveAndCloseCellEdit(editingCell.value.headerId, editingCell.value.rowId)
//     }
//   }
// }

// const handleCellClick = (event, headerId, rowId) => {
  // Prevent native text selection on Shift+Click
//   if (event.shiftKey) {
//     event.preventDefault()
//   }
// 
  // Ignore selection for row-counter column
//   if (headerId === 'row-counter') {
//     return
//   }
// 
  // Save editing cell if clicking on different cell
//   if (editingCell.value && (editingCell.value.headerId !== headerId || editingCell.value.rowId !== rowId)) {
//     saveAndCloseCellEdit(editingCell.value.headerId, editingCell.value.rowId)
//   }
// 
  // If clicking on the same cell that's being edited, do nothing
//   if (editingCell.value && editingCell.value.headerId === headerId && editingCell.value.rowId === rowId) {
//     return
//   }
// 
  // Single-click edit mode
//   if (props.editMode === 'single-click' && !props?.disableEditing) {
//     if (event.shiftKey && selectedCells.value.start) {
      // Shift+click for range selection
//       selectedCells.value.end = { headerId, rowId }
//     } else if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle cell in multi-selection
      // For now, just select the cell (multi-cell selection can be complex)
//       selectedCells.value = {
//         start: { headerId, rowId },
//         end: null,
//         isSelecting: false
//       }
//     } else {
      // Single click - select and start editing
//       selectedCells.value = {
//         start: { headerId, rowId },
//         end: null,
//         isSelecting: false
//       }
      // Start editing immediately on single click
//       startCellEdit(headerId, rowId)
//     }
//     return
//   }
// 
  // Handle cell selection (double-click is handled via native @dblclick event)
//   if (event.shiftKey && selectedCells.value.start) {
    // Shift+click: Extend selection to range
//     selectedCells.value.end = { headerId, rowId }
//   } else if (event.ctrlKey || event.metaKey) {
    // Ctrl+click: Start new selection point (for now, same as regular click)
    // TODO: Could implement multi-range selection here
//     selectedCells.value = {
//       start: { headerId, rowId },
//       end: null,
//       isSelecting: false
//     }
//   } else {
    // Regular click: Select single cell
//     selectedCells.value = {
//       start: { headerId, rowId },
//       end: null,
//       isSelecting: false
//     }
//   }
// }

const startSelection = event => {
  const cell = getCellFromEvent(event)
  if (cell) {
    selectedCells.value = {
      start: { headerId: cell.headerId, rowId: cell.rowId },
      end: null,
      isSelecting: true
    }
  }
}

const handleDragSelection = event => {
  if (!selectedCells.value.isSelecting) return
  const cell = getCellFromEvent(event)
  if (cell) selectedCells.value.end = { headerId: cell.headerId, rowId: cell.rowId }
}

const endSelection = () => selectedCells.value.isSelecting = false

const getCellFromEvent = event => {
  const td = event.target.closest('td')
  if (!td) return null
  return {
    headerId: td.dataset.headerId || 'row-counter',
    rowId: td.closest('tr').dataset.rowId
  }
}

// Keyboard navigation helpers
const scrollToCell = (headerId, rowId) => {
  const tableContainer = document.getElementById(`table-container-${props['data-tab-id']}`)
  if (!tableContainer) return

  // Find cell element
  const cellElement = tableContainer.querySelector(
    `tr[data-row-id="${rowId}"] td[data-header-id="${headerId}"]`
  )

  if (cellElement) {
    // Check if cell is visible
    const containerRect = tableContainer.getBoundingClientRect()
    const cellRect = cellElement.getBoundingClientRect()

    // Scroll only if cell is not visible
    if (cellRect.top < containerRect.top || cellRect.bottom > containerRect.bottom) {
      cellElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      })
    }
  }
}

const navigateToCell = (direction) => {
  if (!selectedCells.value.start) return

  const currentRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.start.rowId)
  const currentColIndex = localHeaders.value.findIndex(h => h.id === selectedCells.value.start.headerId)

  let newRowIndex = currentRowIndex
  let newColIndex = currentColIndex

  switch (direction) {
    case 'up':
      newRowIndex = Math.max(0, currentRowIndex - 1)
      break
    case 'down':
      newRowIndex = Math.min(processedRows.value.length - 1, currentRowIndex + 1)
      break
    case 'left':
      newColIndex = Math.max(0, currentColIndex - 1)
      break
    case 'right':
      newColIndex = Math.min(localHeaders.value.length - 1, currentColIndex + 1)
      break
  }

  if (newRowIndex !== currentRowIndex || newColIndex !== currentColIndex) {
    const newRow = processedRows.value[newRowIndex]
    const newHeader = localHeaders.value[newColIndex]

    if (newRow && newHeader) {
      selectedCells.value = {
        start: { headerId: newHeader.id, rowId: newRow.id },
        end: null,
        isSelecting: false
      }

      // Auto-scroll to the newly selected cell
      scrollToCell(newHeader.id, newRow.id)
    }
  }
}

// Navigate to first cell (top-left corner)
const navigateToFirstCell = () => {
  if (processedRows.value.length === 0 || localHeaders.value.length === 0) return

  const firstRow = processedRows.value[0]
  const firstHeader = localHeaders.value[0]

  selectedCells.value = {
    start: { headerId: firstHeader.id, rowId: firstRow.id },
    end: null,
    isSelecting: false
  }

  scrollToCell(firstHeader.id, firstRow.id)
}

// Navigate to last cell (bottom-right corner)
const navigateToLastCell = () => {
  if (processedRows.value.length === 0 || localHeaders.value.length === 0) return

  const lastRow = processedRows.value[processedRows.value.length - 1]
  const lastHeader = localHeaders.value[localHeaders.value.length - 1]

  selectedCells.value = {
    start: { headerId: lastHeader.id, rowId: lastRow.id },
    end: null,
    isSelecting: false
  }

  scrollToCell(lastHeader.id, lastRow.id)
}

// Scroll by one page (viewport height)
const scrollByPage = (direction) => {
  if (!table.value) return

  const tableContainer = table.value.closest('.table-container')
  if (!tableContainer) return

  const viewportHeight = tableContainer.clientHeight
  const currentScrollTop = tableContainer.scrollTop
  const rowHeight = 32 // Approximate row height (can be enhanced with actual measurement)
  const rowsPerPage = Math.floor(viewportHeight / rowHeight)

  const currentRowIndex = processedRows.value.findIndex(r => r.id === selectedCells.value.start.rowId)
  let newRowIndex = currentRowIndex

  if (direction === 'up') {
    newRowIndex = Math.max(0, currentRowIndex - rowsPerPage)
    tableContainer.scrollTop = Math.max(0, currentScrollTop - viewportHeight)
  } else if (direction === 'down') {
    newRowIndex = Math.min(processedRows.value.length - 1, currentRowIndex + rowsPerPage)
    tableContainer.scrollTop = currentScrollTop + viewportHeight
  }

  const newRow = processedRows.value[newRowIndex]
  const currentHeader = localHeaders.value.find(h => h.id === selectedCells.value.start.headerId)

  if (newRow && currentHeader) {
    selectedCells.value = {
      start: { headerId: currentHeader.id, rowId: newRow.id },
      end: null,
      isSelecting: false
    }

    // Scroll to ensure the new cell is visible
    scrollToCell(currentHeader.id, newRow.id)
  }
}

const handleKeyboardNavigation = (event) => {
  // Excel-like Copy/Paste (Phase 1 - Feature Roadmap)
  // Handle Ctrl+C and Ctrl+V regardless of editing state
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    event.preventDefault()
    copySelectedCells()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
    event.preventDefault()
    if (!props?.disableEditing) {
      pasteToSelectedCells()
    }
    return
  }

  // Don't handle navigation if we're editing
  if (editingCell.value) return

  // Don't handle if no cell is selected
  if (!selectedCells.value.start) return

  switch (event.key) {
    case 'Enter':
      // Enter key - start editing selected cell
      if (!props?.disableEditing) {
        event.preventDefault()
        startCellEdit(selectedCells.value.start.headerId, selectedCells.value.start.rowId)
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      navigateToCell('up')
      break
    case 'ArrowDown':
      event.preventDefault()
      navigateToCell('down')
      break
    case 'ArrowLeft':
      event.preventDefault()
      navigateToCell('left')
      break
    case 'ArrowRight':
      event.preventDefault()
      navigateToCell('right')
      break
    case 'Tab':
      // Tab - move to next cell
      event.preventDefault()
      navigateToCell(event.shiftKey ? 'left' : 'right')
      break
    case 'Home':
      // Ctrl+Home - jump to first cell (top-left)
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        navigateToFirstCell()
      }
      break
    case 'End':
      // Ctrl+End - jump to last cell (bottom-right)
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        navigateToLastCell()
      }
      break
    case 'PageUp':
      // PageUp - scroll up by viewport height
      event.preventDefault()
      scrollByPage('up')
      break
    case 'PageDown':
      // PageDown - scroll down by viewport height
      event.preventDefault()
      scrollByPage('down')
      break
  }
}

// const handleDragStart = (event, columnId) => {
//   draggedColumnId.value = columnId
//   event.dataTransfer.effectAllowed = 'move'
//   event.currentTarget.classList.add('dragging')
//   event.dataTransfer.setDragImage(new Image(), 0, 0)
// }

// const handleDragOver = (event, columnId) => {
//   if (draggedColumnId.value === columnId || isResizing.value) return
//   const targetRect = event.currentTarget.getBoundingClientRect()
//   const offsetX = event.clientX - targetRect.left
//   const isLeftHalf = offsetX < targetRect.width / 2
//   dropTargetColumnId.value = columnId
//   dropPosition.value = isLeftHalf ? 'left' : 'right'
// }

// const handleDrop = (event, columnId) => {
//   if (isResizing.value) return
//   event.preventDefault()
//   if (draggedColumnId.value && draggedColumnId.value !== columnId) {
//     const headers = [...localHeaders.value]
//     const fromIndex = headers.findIndex(h => h.id === draggedColumnId.value)
//     const toIndex = headers.findIndex(h => h.id === columnId)
//     const insertIndex = dropPosition.value === 'left' ? toIndex : toIndex + 1
//     if (fromIndex !== -1 && toIndex !== -1) {
//       const [removed] = headers.splice(fromIndex, 1)
//       headers.splice(insertIndex, 0, removed)
//       localHeaders.value = headers
//       emit('update:table-config', { headers: headers, tableWidth: table.value.offsetWidth })
//     }
//   }
//   resetDragState()
// }

// const handleDragEnd = event => {
//   event.currentTarget.classList.remove('dragging')
//   resetDragState()
// }

// const resetDragState = () => {
//   draggedColumnId.value = null
//   dropTargetColumnId.value = null
//   dropPosition.value = null
// }

const startResize = (event, headerId) => {
  isResizing.value = true
  event.preventDefault()
  event.stopPropagation()
  const th = event.currentTarget.closest('th')
  if (!th) return

  resizeData.value = {
    headerId,
    startX: event.clientX,
    startWidth: th.offsetWidth,
    currentTh: th,
    tableStartWidth: table.value.offsetWidth
  }

  th.classList.add('resizing')
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

const handleResize = event => {
  if (!isResizing.value) return
  event.preventDefault()
  const { headerId, startX, startWidth, tableStartWidth } = resizeData.value
  const deltaX = event.clientX - startX
  let newWidth = startWidth + deltaX
  if (newWidth < MIN_COLUMN_WIDTH) newWidth = MIN_COLUMN_WIDTH

  const currentTh = document.querySelector(`th[data-header-id="${headerId}"]`)
  if (currentTh) {
    currentTh.style.width = `${newWidth}px`
    currentTh.style.minWidth = `${newWidth}px`
    currentTh.style.maxWidth = `${newWidth}px`

    document.querySelectorAll(`td[data-header-id="${headerId}"]`).forEach(td => {
      td.style.width = `${newWidth}px`
      td.style.minWidth = `${newWidth}px`
      td.style.maxWidth = `${newWidth}px`
    })

    if (newWidth > MIN_COLUMN_WIDTH) table.value.style.width = `${tableStartWidth + deltaX}px`
  }
}

const stopResize = () => {
  if (!isResizing.value) return
  const { headerId } = resizeData.value
  const currentTh = document.querySelector(`th[data-header-id="${headerId}"]`)
  const currentWidth = currentTh?.offsetWidth || 0
  const currentTableWidth = table.value.offsetWidth

  const updatedHeaders = localHeaders.value.map(header => 
    header.id === headerId ? { ...header, width: currentWidth } : header
  )

  localHeaders.value = updatedHeaders
  emit('update:table-config', { headers: updatedHeaders, tableWidth: currentTableWidth })
  cleanupResize()
}

const cleanupResize = () => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (resizeData.value.currentTh) resizeData.value.currentTh.classList.remove('resizing')
  isResizing.value = false
  resizeData.value = { headerId: null, startX: 0, startWidth: 0, currentTh: null, tableStartWidth: 0 }
}

// Row Height Resizer functions
const startRowResize = (event, rowId) => {
  event.preventDefault()
  event.stopPropagation()
  const tr = event.currentTarget.closest('tr')
  if (!tr) return

  isRowResizing.value = true
  rowResizeData.value = {
    rowId,
    startY: event.clientY,
    startHeight: tr.offsetHeight,
    currentTr: tr
  }

  tr.classList.add('row-resizing')
  document.addEventListener('mousemove', handleRowResize)
  document.addEventListener('mouseup', stopRowResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleRowResize = (event) => {
  if (!isRowResizing.value) return
  event.preventDefault()

  const { rowId, startY, startHeight } = rowResizeData.value
  const deltaY = event.clientY - startY
  let newHeight = startHeight + deltaY
  if (newHeight < MIN_ROW_HEIGHT) newHeight = MIN_ROW_HEIGHT

  // Update row height in state
  rowHeights.value[rowId] = newHeight

  // Apply height to the row
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`)
  if (tr) {
    tr.style.height = `${newHeight}px`
    // Also update all cells in the row
    tr.querySelectorAll('td').forEach(td => {
      td.style.height = `${newHeight}px`
    })
  }
}

const stopRowResize = () => {
  if (!isRowResizing.value) return

  // Save to localStorage
  saveRowHeights()

  cleanupRowResize()
}

const cleanupRowResize = () => {
  document.removeEventListener('mousemove', handleRowResize)
  document.removeEventListener('mouseup', stopRowResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (rowResizeData.value.currentTr) {
    rowResizeData.value.currentTr.classList.remove('row-resizing')
  }
  isRowResizing.value = false
  rowResizeData.value = { rowId: null, startY: 0, startHeight: 0, currentTr: null }
}

// Reset row height to default (double-click on row resizer)
const resetRowHeight = (rowId) => {
  delete rowHeights.value[rowId]
  saveRowHeights()
  // Apply default height
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`)
  if (tr) {
    tr.style.height = ''
    tr.querySelectorAll('td').forEach(td => {
      td.style.height = ''
    })
  }
}

// Auto-fit column width based on content (double-click on resizer)
const autoFitColumn = (headerId) => {
  const th = document.querySelector(`th[data-header-id="${headerId}"]`)
  const cells = document.querySelectorAll(`td[data-header-id="${headerId}"]`)

  if (!th) return

  // Create temporary element for measuring text width
  const measurer = document.createElement('div')
  measurer.style.position = 'absolute'
  measurer.style.visibility = 'hidden'
  measurer.style.whiteSpace = 'nowrap'
  measurer.style.font = window.getComputedStyle(th).font
  measurer.style.padding = '0'
  measurer.style.margin = '0'
  document.body.appendChild(measurer)

  let maxWidth = 0

  // Measure header text width
  const headerContent = th.querySelector('.header-content')
  if (headerContent) {
    const headerText = headerContent.textContent || ''
    measurer.textContent = headerText
    maxWidth = Math.max(maxWidth, measurer.offsetWidth)
  }

  // Measure all cell text widths (limit to first 100 rows for performance)
  const cellsArray = Array.from(cells).slice(0, 100)
  cellsArray.forEach(cell => {
    // Get text content, excluding child elements like buttons/icons
    const cellText = cell.textContent || ''
    measurer.textContent = cellText
    maxWidth = Math.max(maxWidth, measurer.offsetWidth)
  })

  document.body.removeChild(measurer)

  // Add padding for icons, buttons, and spacing (adjust based on header content)
  const basePadding = 40 // Base padding for cell content
  const hasFilter = th.querySelector('.filter-button') ? 30 : 0
  const hasSorting = th.querySelector('.sort-indicator') ? 20 : 0
  const totalPadding = basePadding + hasFilter + hasSorting

  const optimalWidth = Math.max(MIN_COLUMN_WIDTH, maxWidth + totalPadding)

  // Apply width to header
  th.style.width = `${optimalWidth}px`
  th.style.minWidth = `${optimalWidth}px`
  th.style.maxWidth = `${optimalWidth}px`

  // Apply width to all cells
  cells.forEach(td => {
    td.style.width = `${optimalWidth}px`
    td.style.minWidth = `${optimalWidth}px`
    td.style.maxWidth = `${optimalWidth}px`
  })

  // Update local headers config
  const updatedHeaders = localHeaders.value.map(header =>
    header.id === headerId ? { ...header, width: optimalWidth } : header
  )

  localHeaders.value = updatedHeaders
  emit('update:table-config', { headers: updatedHeaders, tableWidth: table.value.offsetWidth })
}

// const isEditingCell = (headerId, rowId) => {
  // Check both regular editing and MEMO dialog editing (for cell highlighting)
//   return (editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId) ||
//          (memoEditingCell.value?.headerId === headerId && memoEditingCell.value?.rowId === rowId)
// }

// Only checks inline editing (NOT MEMO dialog) - used for showing inline editors
// const isInlineEditing = (headerId, rowId) => {
//   return editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId
// }

// const startCellEdit = async (headerId, rowId) => {
//   console.log('[DataTable] startCellEdit called', { headerId, rowId, disableEditing: props?.disableEditing })
//   if (props?.disableEditing) return
// 
  // Issue #5005: Skip if already editing this exact cell (prevents double-click triggering multiple times)
//   if (editingCell.value?.headerId === headerId && editingCell.value?.rowId === rowId) {
//     console.log('[DataTable] startCellEdit: already editing this cell, skipping')
//     return
//   }
// 
  // Issue #5005: Reset cancelling flag when starting new edit
//   isCancellingEdit.value = false
// 
  // Hide directory info popover when starting edit
//   hideDirInfo()
// 
//   const cell = processedRows.value.find(r => r.id === rowId)?.cells[headerId]
//   const header = localHeaders.value.find(h => h.id === headerId)
// 
  // Allow editing for dir and multi columns even if nested flag is set
//   const isDirectoryColumn = header?.columnType === 'dir' || header?.columnType === 'multi'
//   const isNestedColumn = header?.nested || header?.columnType === 'nested' || cell?.nested
//   if (isNestedColumn && !isDirectoryColumn) {
//     console.log('[DataTable] startCellEdit: nested cell, calling handleCellDoubleClick')
//     handleCellDoubleClick(header, cell)
//     return
//   }
// 
  // Type 11 (Boolean) - не входим в режим редактирования, чекбокс уже интерактивный
//   if (header?.type === 11) {
//     console.log('[DataTable] startCellEdit: Boolean type, skipping inline edit (checkbox handles it)')
//     return
//   }
// 
  // Type 12 (MEMO) - открываем модалку вместо inline редактирования
//   if (header?.type === 12) {
//     console.log('[DataTable] startCellEdit: MEMO type, opening dialog')
//     memoEditingCell.value = { headerId, rowId }
//     memoEditingValue.value = cell?.value || ''
//     memoDialogHeader.value = header.value || 'Редактирование текста'
//     isMemoDialogVisible.value = true
    // Focus textarea after dialog opens
//     nextTick(() => {
//       memoTextarea.value?.$el?.focus()
//     })
//     return
//   }
// 
  // Type 2 (HTML) - открываем модалку вместо inline редактирования (Issue #5130)
//   if (header?.type === 2) {
//     console.log('[DataTable] startCellEdit: HTML type, opening dialog')
//     memoEditingCell.value = { headerId, rowId }
//     memoEditingValue.value = cell?.value || ''
//     memoDialogHeader.value = header.value || 'Редактирование HTML'
//     isMemoDialogVisible.value = true
    // Focus textarea after dialog opens
//     nextTick(() => {
//       memoTextarea.value?.$el?.focus()
//     })
//     return
//   }
// 
//   currentEditingHeader.value = header
//   console.log('[DataTable] startCellEdit: header set', { header, dirTableId: header?.dirTableId, columnType: header?.columnType })
// 
//   if (cell) {
//     editingCell.value = { headerId, rowId }
//     console.log('[DataTable] startCellEdit: editingCell set', editingCell.value)
// 
//     if (header.dirTableId) {
//       console.log('[DataTable] startCellEdit: dirTableId detected, will load directory list')
//       if (header.columnType === 'multi') {
//         editingMultiValue.value = cell.dirValues ? cell.dirValues.map(v => v.dirRowId) : []
//       } else {
//         editingValue.value = cell.dirRowId || null
//       }
// 
//       if (!directoryLists.value[header.dirTableId]) {
//         loadingDirectories.value.add(header.dirTableId)
//         emit('load-directory-list', {
//           dirTableId: header.dirTableId,
//           callback: list => {
//             directoryLists.value[header.dirTableId] = list
//             editingOptions.value = list
//             loadingDirectories.value.delete(header.dirTableId)
//             if (header.columnType === 'multi') {
//               autoOpenMultiSelect()
//             } else {
//               autoOpenDropdown()
//             }
//           }
//         })
//       } else {
//         editingOptions.value = directoryLists.value[header.dirTableId]
//         if (header.columnType === 'multi') {
//           autoOpenMultiSelect()
//         } else {
//           autoOpenDropdown()
//         }
//       }
//     } else {
//       if ([4, 9].includes(header.type) && typeof cell.value === 'number') {
//         editingValue.value = new Date(cell.value * 1000)
//       } else {
//         editingValue.value = cell.value
//       }
      // Issue #5005: Focus the cell editor after it's mounted
      // Use double nextTick to ensure DOM is fully rendered
//       await nextTick()
//       await nextTick()
// 
//       if (cellEditorInput.value) {
        // Issue #5005: Handle both single ref and array of refs (from v-for)
//         const refValue = Array.isArray(cellEditorInput.value)
//           ? cellEditorInput.value[0]
//           : cellEditorInput.value
//         if (!refValue) return
//         const inputEl = refValue.$el || refValue
//         if (inputEl) {
//           const focusTarget = inputEl.querySelector ? inputEl.querySelector('input, textarea') : inputEl
          // Issue #5005: Defensive check - ensure focusTarget has focus method
//           if (focusTarget && typeof focusTarget.focus === 'function') {
            // Issue #5005: Focus and select immediately without delays
//             focusTarget.focus()
            // Select all text immediately after focus
//             try {
//               if (focusTarget.select && typeof focusTarget.select === 'function') {
//                 focusTarget.select()
//               } else if (focusTarget.setSelectionRange && focusTarget.value !== undefined) {
//                 focusTarget.setSelectionRange(0, String(focusTarget.value).length)
//               }
//             } catch (err) {
              // Silently ignore selection errors
//             }
//           }
//         }
//       }
//     }
//   }
// }

// Issue #5005: Improved multiselect auto-open with focus
// const autoOpenMultiSelect = async () => {
//   await nextTick()
//   await nextTick()
  // Use requestAnimationFrame for reliable timing after DOM paint
//   requestAnimationFrame(() => {
//     setTimeout(() => {
      // Try multiple selectors for PrimeVue 4 compatibility
//       const multiselect = document.querySelector('.seamless-editor .p-multiselect') ||
//                           document.querySelector('.seamless-editor.p-multiselect') ||
//                           document.querySelector('.cell-editor .p-multiselect')
//       if (multiselect) {
        // Click on the multiselect itself to open
//         multiselect.click()
//       }
//     }, 30)
//   })
// }

// Issue #5005: Improved dropdown auto-open with focus
// const autoOpenDropdown = async () => {
//   console.log('[DataTable] autoOpenDropdown called')
//   await nextTick()
  // Use requestAnimationFrame for reliable timing after DOM paint
//   requestAnimationFrame(() => {
//     setTimeout(() => {
//       const dropdown = document.querySelector('.seamless-editor.p-dropdown')
//       console.log('[DataTable] autoOpenDropdown: looking for dropdown', dropdown)
//       if (dropdown) {
        // Focus the dropdown first
//         const input = dropdown.querySelector('input')
//         if (input) input.focus()
        // Then click to open
//         const trigger = dropdown.querySelector('.p-dropdown-trigger')
//         console.log('[DataTable] autoOpenDropdown: found trigger', trigger)
//         if (trigger) {
//           trigger.click()
//         }
//       } else {
//         console.log('[DataTable] autoOpenDropdown: dropdown NOT found')
//       }
//     }, 20)
//   })
// }

// const handleDropdownClick = (event) => {
//   event.stopPropagation()
// }

// Issue #5005: Handle multiselect hide - only save if not cancelling
// const handleMultiSelectHide = () => {
//   isDropdownOpen.value = false
  // Only auto-save if user is not cancelling (ESC key)
//   if (!isCancellingEdit.value && editingCell.value && currentEditingHeader.value?.columnType === 'multi') {
    // Save changes immediately without canceling edit state first
    // This prevents the cell from disappearing briefly
//     saveCellEdit(editingCell.value.headerId, editingCell.value.rowId)
    // Small delay before clearing edit state to ensure UI updates
//     setTimeout(() => {
//       cancelCellEdit()
//     }, 0)
//   }
// }

// const handleMultiSelectKeydown = (event) => {
//   if (event.key === 'Escape') {
    // Issue #5005: Set flag IMMEDIATELY to prevent hide handlers from saving
    // This MUST happen before PrimeVue processes the ESC and fires @hide
//     isCancellingEdit.value = true
//     event.stopPropagation()
//     event.preventDefault() // Prevent PrimeVue from handling ESC
//     cancelCellEdit()
//   } else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    // Select all options with Ctrl+A
//     event.preventDefault()
//     if (editingOptions.value.length > 0) {
//       editingMultiValue.value = editingOptions.value.map(option => option.id)
//     }
//   } else if (event.key === 'Enter' && !event.shiftKey) {
    // Close dropdown on Enter (will trigger auto-save via handleMultiSelectHide)
//     const multiselect = document.querySelector('.seamless-editor .p-multiselect')
//     if (multiselect) {
//       const overlay = document.querySelector('.p-multiselect-panel')
//       if (overlay) {
//         const trigger = multiselect.querySelector('.p-multiselect-trigger')
//         if (trigger) {
//           trigger.click() // Close dropdown
//         }
//       }
//     }
//   }
// }

// Issue #5005: Handle dropdown keydown - backup handler (main ESC handling via capture phase listener)
// The capture phase listener (handleGlobalEscForDropdown) sets isCancellingEdit before this runs
// const handleDropdownKeydown = (event) => {
//   if (event.key === 'Escape') {
    // Redundant flag setting (capture phase already set it, but safety first)
//     isCancellingEdit.value = true
    // Call cancelCellEdit to properly clean up edit state
//     cancelCellEdit()
//   } else if (event.key === 'Enter') {
    // Let PrimeVue handle Enter (select option)
    // The hide handler will save the value
//   }
// }

// Issue #5005: Handle dropdown hide - only save if not cancelling
// const handleDropDownHide = () => {
//   isDropdownOpen.value = false
  // Only auto-save if user is not cancelling (ESC key)
//   if (!isCancellingEdit.value && editingCell.value && currentEditingHeader.value?.dirTableId && currentEditingHeader.value?.columnType !== 'multi') {
    // Save changes immediately
//     saveCellEdit(editingCell.value.headerId, editingCell.value.rowId)
    // Small delay before clearing edit state to ensure UI updates
//     setTimeout(() => {
//       cancelCellEdit()
//     }, 0)
//   }
// }

// Issue #5005: Save and close cell edit - also checks cancelling flag
// const saveAndCloseCellEdit = (headerId, rowId) => {
  // Guard: don't save if editing was already canceled (prevents double-save on Enter + blur)
  // Also don't save if ESC was pressed (isCancellingEdit flag)
//   if (!editingCell.value || isCancellingEdit.value) {
//     return
//   }
//   saveCellEdit(headerId, rowId)
//   cancelCellEdit()
// }

// File upload handlers for FILE (10) and PATH (17) types
// const getFileName = (value) => {
//   if (!value) return ''
//   const str = String(value)
  // Handle HTML anchor format from API
//   const anchorMatch = str.match(/<a[^>]*>([^<]*)<\/a>/i)
//   if (anchorMatch) return anchorMatch[1]
  // Handle path format
//   if (str.includes('/')) return str.split('/').pop() || str
  // Handle id:filename format
//   if (str.includes(':')) return str.split(':').pop() || str
//   return str
// }

// const handleFileUpload = (event, header, rowData) => {
//   const file = event.files?.[0]
//   if (!file) return
// 
  // Emit event for wrapper to handle upload via API
  // termId is the requisite ID in the database (used for _m_save)
  // header.type is the base type (10=FILE, 17=PATH)
//   emit('upload-file', {
//     rowId: rowData.id,
//     headerId: header.id,
//     termId: header.termId, // Requisite ID for API
//     baseType: header.type, // 10 for FILE, 17 for PATH
//     file: file,
//     callback: (result) => {
      // Update local value after successful upload
//       if (result?.success) {
//         editingValue.value = result.filename || file.name
        // Close edit mode after upload
//         cancelCellEdit()
//       }
//     }
//   })
// }

// Native file input handler (for seamless file editor)
// const handleNativeFileSelect = (event, header, rowData) => {
//   const file = event.target?.files?.[0]
//   if (!file) return
// 
  // Emit event for wrapper to handle upload via API
//   emit('upload-file', {
//     rowId: rowData.id,
//     headerId: header.id,
//     termId: header.termId,
//     baseType: header.type,
//     file: file,
//     callback: (result) => {
//       if (result?.success) {
//         editingValue.value = result.filename || file.name
//         cancelCellEdit()
//       }
//     }
//   })
// 
  // Reset input value so same file can be selected again
//   event.target.value = ''
// }

// const clearFileValue = (header, rowData) => {
  // Clear the file value by setting it to empty string
//   emit('cell-update', {
//     rowId: rowData.id,
//     headerId: header.id,
//     value: '',
//     type: header.type
//   })
//   editingValue.value = ''
//   cancelCellEdit()
// }

// const saveCellEdit = (headerId, rowId) => {
//   const header = localHeaders.value.find(h => h.id === headerId)
//   let valueToSave, dirRowIdToSave, dirValuesToSave
// 
//   if (header?.dirTableId) {
//     if (header.columnType === 'multi') {
//       const selectedIds = editingMultiValue.value
//       const selectedItems = editingOptions.value.filter(item => selectedIds.includes(item.id))
//       valueToSave = selectedItems.map(item => item.value).join(', ')
//       dirValuesToSave = selectedIds.map(id => ({ dirRowId: id }))
// 
      // Immediate local update for reactive UI
//       const overrideKey = `${rowId}:${headerId}`
//       localCellOverrides.value.set(overrideKey, valueToSave)
// 
//       emit('cell-multi-update', {
//         rowId,
//         headerId,
//         dirTableId: header.dirTableId,
//         dirValues: dirValuesToSave
//       })
// 
      // Phase 3 - Feature #17: Mark cell as changed
//       markCellAsChanged(headerId, rowId)
//       return
//     } else {
//       const selectedId = editingValue.value
//       const selectedItem = editingOptions.value.find(item => item.id === selectedId)
//       valueToSave = selectedItem ? selectedItem.value : ''
//       dirRowIdToSave = selectedId
//     }
// 
    // Immediate local update for reactive UI
//     const overrideKey = `${rowId}:${headerId}`
//     localCellOverrides.value.set(overrideKey, valueToSave)
// 
//     emit('cell-update', {
//       rowId,
//       headerId,
//       value: valueToSave,
//       type: header.type,
//       dirRowId: dirRowIdToSave,
//       dirValues: dirValuesToSave
//     })
// 
    // Phase 3 - Feature #17: Mark cell as changed
//     markCellAsChanged(headerId, rowId)
//   } else {
//     valueToSave = editingValue.value
// 
    // Immediate local update for reactive UI
//     const overrideKey = `${rowId}:${headerId}`
//     localCellOverrides.value.set(overrideKey, valueToSave)
// 
//     emit('cell-update', {
//       rowId,
//       headerId,
//       value: valueToSave,
//       type: header.type
//     })
// 
    // Phase 3 - Feature #17: Mark cell as changed
//     markCellAsChanged(headerId, rowId)
//   }
// }

// Issue #5005: Cancel cell edit without saving changes
// const cancelCellEdit = () => {
  // Set cancelling flag to prevent hide handlers from saving
//   isCancellingEdit.value = true
// 
//   const multiselect = document.querySelector('.seamless-editor .p-multiselect')
//   if (multiselect) {
//     multiselect.removeEventListener('click', handleDropdownClick)
//   }
//   editingCell.value = null
//   editingValue.value = null
//   editingMultiValue.value = []
//   currentEditingHeader.value = null
// 
  // Reset the flag after a short delay (to allow hide events to process)
//   setTimeout(() => {
//     isCancellingEdit.value = false
//   }, 100)
// }

// MEMO (type 12) and HTML (type 2) dialog functions
// const saveMemoEdit = () => {
//   if (!memoEditingCell.value) return
// 
//   const { headerId, rowId } = memoEditingCell.value
//   const header = localHeaders.value.find(h => h.id === headerId)
// 
  // Immediate local update for reactive UI
//   const overrideKey = `${rowId}:${headerId}`
//   localCellOverrides.value.set(overrideKey, memoEditingValue.value)
// 
//   emit('cell-update', {
//     rowId,
//     headerId,
//     value: memoEditingValue.value,
//     type: header?.type || 12
//   })
// 
  // Mark cell as changed
//   markCellAsChanged(headerId, rowId)
// 
  // Close dialog
//   isMemoDialogVisible.value = false
//   memoEditingCell.value = null
//   memoEditingValue.value = ''
// }

// const cancelMemoEdit = () => {
//   isMemoDialogVisible.value = false
//   memoEditingCell.value = null
//   memoEditingValue.value = ''
// }

// const startRowEdit = async row => {
//   if (props?.disableEditing) return
//   localHeaders.value.forEach(header => {
//     if (header.dirTableId) loadDirectoryList(header.dirTableId)
//   })
// 
//   editingRow.value = {
//     id: row.id,
//     headers: localHeaders.value.map(header => {
//       const cell = row.cells[header.id] || { value: null, dirRowId: null, dirValues: [] }
//       const isNested = header.nested || header.columnType === 'nested' || cell?.nested
//       let cellValue = cell.value
//       if ([4, 9].includes(header.type) && typeof cellValue === 'number') cellValue = new Date(cellValue * 1000)
//       if (header.dirTableId) {
//         console.log('[startRowEdit] header:', header.value, 'dirTableId:', header.dirTableId, 'cell.dirRowId:', cell.dirRowId, 'type:', typeof cell.dirRowId)
//       }
//       return {
//         headerId: header.id,
//         value: cellValue,
//         dirRowId: cell.dirRowId,
//         dirValues: cell.dirValues ? cell.dirValues.map(v => v.dirRowId) : [],
//         columnType: header.columnType,
//         type: header.type,
//         dirTableId: header.dirTableId,
        // Nested/subordinate column info
//         isNested,
//         nestedTableId: header.nestedTableId || header.id,
//         nestedLink: cell.nestedLink
//       }
//     })
//   }
//   isRowEditDialogVisible.value = true
// }

// const saveRowEdit = () => {
//   if (validateRow()) {
//     const updatedRow = {
//       id: editingRow.value.id,
//       headers: editingRow.value.headers
        // Filter out nested columns - they can't be saved
//         .filter(header => !header.isNested)
//         .map(header => {
//           let value = header.value
//           let dirRowId = null
//           let dirValues = []
//           const headerType = header.type
// 
//           if (header.dirTableId) {
//             if (header.columnType === 'multi') {
//               const dirRowIds = header.dirValues
//               const dirItems = directoryCache.value[header.dirTableId]?.filter(item => dirRowIds.includes(item.id))
//               value = dirItems.map(item => item.value).join(', ')
//               dirValues = dirRowIds.map(id => ({ dirRowId: id }))
//             } else {
//               dirRowId = header.dirRowId
//               const dirItem = directoryCache.value[header.dirTableId]?.find(item => item.id === dirRowId)
//               value = dirItem?.value || ''
//             }
//           } else if ([4, 9].includes(headerType)) {
//             if (value instanceof Date) value = Math.floor(value.getTime() / 1000)
//             else if (value === null || value === '') value = null
//           }
// 
//           return {
//             headerId: header.headerId,
//             value: value,
//             dirRowId: dirRowId,
//             dirValues: dirValues,
//             type: headerType
//           }
//         })
//     }
//     emit('row-update', updatedRow)
//     isRowEditDialogVisible.value = false
//   }
// }

// const validateRow = () => {
//   fieldErrors.value = {}
//   let isValid = true
//   editingRow.value.headers.forEach(header => {
    // Skip nested columns - they're not editable
//     if (header.isNested) return
//     if (header.required && !header.value) {
//       fieldErrors.value[header.headerId] = 'Это поле обязательно'
//       isValid = false
//     }
//   })
//   return isValid
// }

// const cancelRowEdit = () => {
//   isRowEditDialogVisible.value = false
//   editingRow.value = null
// }

const getTypeIconClass = (value, header = null) => {
  // If header is a reference/directory column, show reference icon
  if (header && header.columnType === 'dir') {
    return 'fas fa-link me-2'
  }
  if (header && header.columnType === 'multi') {
    return 'fas fa-list me-2'
  }
  const type = types.value.find(item => item.value == value)
  return `fas ${type ? type.icon : 'fa-question-circle'} me-2`
}

const getTypeLabel = (type, header = null) => {
  // If header is a reference/directory column, show "Справочник" label
  if (header && header.columnType === 'dir') {
    return 'Справочник'
  }
  if (header && header.columnType === 'multi') {
    return 'Множественный выбор'
  }
  const typeInfo = TYPES.find(t => t.value == type)
  return typeInfo ? typeInfo.label : 'Unknown type'
}

const emitAddColumn = () => {
  if (props?.isAddingColumn) return
  emit('add-column')
}

const emitAddRow = () => {
  if (props?.isAddingRow) return
  emit('add-row')
}
// const handleCellDoubleClick = (header, cell) => {
//   if (header.nested || header.columnType === 'nested') {
//     emit('open-nested', {
//       tableId: header.nestedTableId || header.id,
//       parentRowId: cell.nestedLink,
//       tableName: header.value || cell.value
//     })
//   }
// }

// Open nested table from row edit dialog
const openNestedFromRowEdit = (header) => {
  const originalHeader = localHeaders.value.find(h => h.id === header.headerId)
  isRowEditDialogVisible.value = false
  emit('open-nested', {
    tableId: header.nestedTableId || originalHeader?.nestedTableId || header.headerId,
    parentRowId: header.nestedLink,
    tableName: originalHeader?.value || header.value
  })
}
const getEditorComponent = (type, dirTableId, columnType) => {
  if (dirTableId && columnType === 'multi') return MultiSelect
  else if (dirTableId) return Dropdown

  const componentMap = {
    3: MentionAutocomplete,  // SHORT text - with @mentions support
    8: MentionAutocomplete,  // CHARS text - with @mentions support
    9: Calendar,
    11: Checkbox,
    12: Textarea,
    13: InputNumber,
    14: InputNumber,
    4: Calendar
  }
  return componentMap[type] || MentionAutocomplete  // Default to MentionAutocomplete for text
}

const getEditorProps = (type, dirTableId, options = [], databaseName = props.database) => {
  if (dirTableId) return {
    options: options,
    optionLabel: 'value',
    optionValue: 'id',
    filter: true,
    showClear: true,
    placeholder: 'Выберите значение',
    focusOnShow: true,
    autoFocus: true,
    onChange: e => {
      if (editingCell.value) saveCellEdit(editingCell.value.headerId, editingCell.value.rowId)
    }
  }

  const editorProps = {}
  switch (type) {
    case 3:
    case 8:
      // SHORT and CHARS text - with mentions support
      editorProps.database = databaseName
      editorProps.placeholder = 'Введите текст (@ для упоминаний)'
      break
    case 4:
      editorProps.showTime = true
      editorProps.showSeconds = true
      editorProps.dateFormat = 'dd.mm.yy'
      editorProps.timeFormat = 'HH:mm:ss'
      break
    case 9:
      editorProps.dateFormat = 'dd.mm.yy'
      break
    case 11:
      editorProps.binary = true
      break
  }
  return editorProps
}

const getTagDisplayValue = (header, dirRowId, dirValue = null) => {
  // First, check if dirValue has displayValue from Integram (preferred)
  if (dirValue?.displayValue) {
    return dirValue.displayValue
  }
  // Fallback to directory cache lookup
  const dirTableId = header.dirTableId
  if (directoryCache.value[dirTableId]) {
    const item = directoryCache.value[dirTableId].find(item => item.id === dirRowId)
    return item ? item.value : `ID: ${dirRowId}`
  }
  return '...'
}

// const updateTableHeight = () => {
//   const tableContainer = document.querySelector('.table-container')
//   if (!tableContainer) return
// 
//   const tabview = document.querySelector('.p-tabview-tablist-container')
//   const tabviewHeight = tabview ? tabview.offsetHeight : 0
//   const layoutMain = document.querySelector('.layout-main')
//   const layoutMainHeight = layoutMain ? layoutMain.offsetHeight : 0
//   const panels = document.querySelector('.p-tabview-panels')
//   const styles = panels ? window.getComputedStyle(panels) : null
//   const paddingTop = styles ? parseFloat(styles.paddingTop) : 0
//   const paddingBottom = styles ? parseFloat(styles.paddingBottom) : 0
//   const layoutMainStyles = layoutMain ? window.getComputedStyle(layoutMain) : null
//   const layoutMainPaddingBottom = layoutMainStyles ? parseFloat(layoutMainStyles.paddingBottom) : 0
// 
//   let heightDifference = layoutMainHeight - tabviewHeight - paddingTop - paddingBottom - layoutMainPaddingBottom
// 
  // Fallback: if layoutMain doesn't exist or heightDifference is invalid,
  // use the container's actual clientHeight or a reasonable default
//   if (!layoutMain || heightDifference <= 0) {
    // Use actual container height if available, otherwise use viewport-based fallback
//     const actualHeight = tableContainer.clientHeight
//     if (actualHeight > 0) {
//       heightDifference = actualHeight
//     } else {
      // Fallback to window height minus some padding for header/footer
//       heightDifference = Math.max(400, window.innerHeight - 200)
//     }
//   }
// 
//   tableContainer.style.setProperty('max-height', `${heightDifference}px`)
//   containerHeight.value = heightDifference
// }

// const handleScroll = event => {
//   const container = event.target
//   const { scrollTop, scrollHeight, clientHeight } = container
// 
  // Update virtual scroll position only when virtual scrolling is enabled
  // This prevents unnecessary reactive updates for small tables
//   if (isVirtualScrollEnabled.value) {
//     virtualScrollTop.value = scrollTop
//   }
// 
  // Load more data when near bottom
//   const threshold = 100
//   if (scrollHeight - (scrollTop + clientHeight) < threshold) emit('load-more')
// }

// Таймер для задержки показа Popover - чтобы двойной клик успел сработать до появления диалога

// Get cache key for directory row
// const getDirRowCacheKey = (dirTableId, dirRowId) => `${dirTableId}:${dirRowId}`
// 
// Check if cache entry is still valid
// const isCacheValid = (cacheEntry) => {
//   if (!cacheEntry) return false
//   return Date.now() - cacheEntry.timestamp < DIR_ROW_CACHE_TTL
// }
// 
// Open directory table in modal
const openDirectory = (header, dirRowId) => {
  if (!header.dirTableId) return
  emit('open-directory', {
    typeId: header.dirTableId,
    typeName: header.value || header.alias || `Справочник ${header.dirTableId}`,
    dirRowId: dirRowId
  })
}

const showDirInfo = async (event, header, dirRowId) => {
  if (!dirRowId) return

  // Очищаем предыдущий таймер если есть
  if (dirInfoTimeout) {
    clearTimeout(dirInfoTimeout)
    dirInfoTimeout = null
  }

  // Сохраняем ссылку на target элемент ДО таймера - иначе event.target может стать null
  const targetElement = event.currentTarget || event.target

  // Check if data is already in cache
  const cacheKey = getDirRowCacheKey(header.dirTableId, dirRowId)
  const cached = dirRowCache.value.get(cacheKey)

  // Function to show the popover with data
  const showPopover = (data) => {
    if (!targetElement || !document.body.contains(targetElement)) return
    currentDirHeader.value = header.value
    currentDirRow.value = data
    if (dirOverlay.value) {
      dirOverlay.value.show({ currentTarget: targetElement, target: targetElement })
    }
  }

  // If data is cached and valid - show immediately with minimal delay (for double-click detection)
  if (isCacheValid(cached)) {
    // Не показывать popover если данных нет (cached.data === null)
    if (cached.data) {
      dirInfoTimeout = setTimeout(() => {
        showPopover(cached.data)
      }, 100) // Shorter delay since data is ready
      return
    }
    // If cached.data is null, continue to try loading again
  }

  // Data not cached - load with standard delay
  dirInfoTimeout = setTimeout(() => {
    if (!targetElement || !document.body.contains(targetElement)) return

    currentDirHeader.value = header.value

    // Check cache again (might have been preloaded while waiting)
    const cachedNow = dirRowCache.value.get(cacheKey)
    if (isCacheValid(cachedNow)) {
      currentDirRow.value = cachedNow.data
    } else {
      // Load and cache the data
      // NOTE: We always load on hover, even if autoLoadDirs is disabled
      // because hover is an explicit user action (moving mouse over cell)
      emit('load-dir-row', {
        dirTableId: header.dirTableId,
        dirRowId: dirRowId,
        callback: (data) => {
          // Кэшируем даже пустые ответы, чтобы не запрашивать их снова
          dirRowCache.value.set(cacheKey, {
            data: data || null, // null означает что данных нет или ошибка
            timestamp: Date.now()
          })
          currentDirRow.value = data
        }
      })
    }

    if (dirOverlay.value) {
      dirOverlay.value.show({ currentTarget: targetElement, target: targetElement })
    }
  }, 300)
}

const findHeaderValue = headerId => {
  const header = currentDirRow.value?.headers?.find(header => header.id === headerId)
  return header ? header.value : ''
}

// Smart icon detection for directory preview values
const getDirValueIcon = (value, type) => {
  const strValue = String(value || '').trim().toLowerCase()

  // Check by type first
  if (type === 4 || type === 5) return 'pi pi-calendar' // DateTime/Date
  if (type === 6) return 'pi pi-clock' // Time
  if (type === 7) return 'pi pi-check-square' // Boolean

  // Check by value patterns
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(strValue)) return 'pi pi-envelope' // Email
  if (/^(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/.test(strValue)) return 'pi pi-phone' // Phone
  if (/^https?:\/\//i.test(strValue)) return 'pi pi-link' // URL
  if (/^\d+([.,]\d+)?$/.test(strValue)) return 'pi pi-hashtag' // Number

  return 'pi pi-circle-fill' // Default dot
}


// === Nested Table Preview Functions ===

const showNestedPreview = async (event, header, cell, parentRowId) => {
  // Get nested table ID from header or cell
  const nestedTableId = cell?.nestedTableId || header?.nestedTableId || header?.nested
  if (!nestedTableId) return

  // Clear previous timeout
  if (nestedPreviewTimeout) {
    clearTimeout(nestedPreviewTimeout)
  }

  const targetElement = event.currentTarget

  // Delay to prevent flickering on fast mouse movements
  nestedPreviewTimeout = setTimeout(async () => {
    if (!targetElement || !document.body.contains(targetElement)) return

    // Set initial loading state
    currentNestedPreview.value = null

    // Show popover immediately with loading state
    if (nestedOverlay.value) {
      nestedOverlay.value.show({ currentTarget: targetElement, target: targetElement })
    }

    // Emit event to load nested data
    emit('load-nested-preview', {
      nestedTableId: nestedTableId,
      parentRowId: parentRowId,
      tableName: header.label || header.value || 'Подчинённая таблица',
      callback: (data) => {
        if (!targetElement || !document.body.contains(targetElement)) return
        currentNestedPreview.value = {
          tableName: header.label || header.value || 'Подчинённая таблица',
          totalCount: cell?.value || data?.totalCount || 0,
          items: data?.items || []
        }
      }
    })
  }, NESTED_PREVIEW_DELAY)
}

const hideNestedPreview = () => {
  if (nestedPreviewTimeout) {
    clearTimeout(nestedPreviewTimeout)
    nestedPreviewTimeout = null
  }
  if (nestedOverlay.value) nestedOverlay.value.hide()
  currentNestedPreview.value = null
}

// Preload a single directory row data
// const preloadSingleDirRow = (dirTableId, dirRowId) => {
//   const cacheKey = getDirRowCacheKey(dirTableId, dirRowId)
// 
  // Skip if already cached and valid
//   if (isCacheValid(dirRowCache.value.get(cacheKey))) return
// 
  // Skip if already loading
//   if (preloadingDirRows.value.has(cacheKey)) return
// 
//   preloadingDirRows.value.add(cacheKey)
// 
//   emit('load-dir-row', {
//     dirTableId,
//     dirRowId,
//     callback: (data) => {
      // Кэшируем даже пустые ответы, чтобы не запрашивать их снова
//       dirRowCache.value.set(cacheKey, {
//         data: data || null, // null означает что данных нет или ошибка
//         timestamp: Date.now()
//       })
//       preloadingDirRows.value.delete(cacheKey)
//     }
//   })
// }

// Background loading of all directory references in table
// const loadAllDirDataInBackground = async () => {
//   if (isBackgroundLoadingDirs.value) {
//     console.log('Background loading already in progress')
//     return
//   }
// 
  // Collect all unique directory references from all rows
//   const dirRefsMap = new Map() // Map<cacheKey, {dirTableId, dirRowId}>
// 
//   processedRows.value.forEach(row => {
//     if (!row?.cells) return
// 
//     localHeaders.value.forEach(header => {
//       if (!header.dirTableId) return
// 
//       const cell = row.cells[header.id]
//       if (!cell) return
// 
      // Single directory reference
//       if (cell.dirRowId) {
//         const cacheKey = getDirRowCacheKey(header.dirTableId, cell.dirRowId)
//         if (!dirRefsMap.has(cacheKey) && !isCacheValid(dirRowCache.value.get(cacheKey))) {
//           dirRefsMap.set(cacheKey, { dirTableId: header.dirTableId, dirRowId: cell.dirRowId })
//         }
//       }
// 
      // Multi-select directory references
//       if (cell.dirValues?.length > 0) {
//         cell.dirValues.forEach(dv => {
//           if (dv.dirRowId) {
//             const cacheKey = getDirRowCacheKey(header.dirTableId, dv.dirRowId)
//             if (!dirRefsMap.has(cacheKey) && !isCacheValid(dirRowCache.value.get(cacheKey))) {
//               dirRefsMap.set(cacheKey, { dirTableId: header.dirTableId, dirRowId: dv.dirRowId })
//             }
//           }
//         })
//       }
//     })
//   })
// 
//   const dirRefs = Array.from(dirRefsMap.values())
// 
//   if (dirRefs.length === 0) {
//     console.log('All directory data already cached')
//     return
//   }
// 
//   isBackgroundLoadingDirs.value = true
//   backgroundLoadProgress.value = { loaded: 0, total: dirRefs.length }
// 
//   console.log(`Starting background load of ${dirRefs.length} directory references...`)
// 
  // Load with delay between requests
//   for (let i = 0; i < dirRefs.length; i++) {
//     const ref = dirRefs[i]
//     const cacheKey = getDirRowCacheKey(ref.dirTableId, ref.dirRowId)
// 
    // Skip if already cached (might have been cached by hover)
//     if (isCacheValid(dirRowCache.value.get(cacheKey))) {
//       backgroundLoadProgress.value.loaded++
//       continue
//     }
// 
    // Skip if already loading
//     if (preloadingDirRows.value.has(cacheKey)) {
//       backgroundLoadProgress.value.loaded++
//       continue
//     }
// 
    // Load directory row
//     await new Promise(resolve => {
//       preloadingDirRows.value.add(cacheKey)
// 
//       emit('load-dir-row', {
//         dirTableId: ref.dirTableId,
//         dirRowId: ref.dirRowId,
//         callback: (data) => {
          // Кэшируем даже пустые ответы, чтобы не запрашивать их снова
//           dirRowCache.value.set(cacheKey, {
//             data: data || null, // null означает что данных нет или ошибка
//             timestamp: Date.now()
//           })
//           preloadingDirRows.value.delete(cacheKey)
//           backgroundLoadProgress.value.loaded++
//           resolve()
//         }
//       })
//     })
// 
    // Delay before next request
//     if (i < dirRefs.length - 1) {
//       await new Promise(resolve => setTimeout(resolve, BACKGROUND_LOAD_DELAY_MS))
//     }
//   }
// 
//   isBackgroundLoadingDirs.value = false
//   console.log(`Background loading completed: ${backgroundLoadProgress.value.loaded}/${backgroundLoadProgress.value.total}`)
// }

// Stop background loading
// const stopBackgroundLoading = () => {
//   isBackgroundLoadingDirs.value = false
//   backgroundLoadProgress.value = { loaded: 0, total: 0 }
// }

// Preload all directory links in a row (called on row hover/focus)
// const preloadRowDirData = (rowData) => {
//   if (!rowData?.cells) return
// 
  // Collect all directory references in this row
//   const dirRefs = []
// 
//   localHeaders.value.forEach(header => {
//     if (!header.dirTableId) return
// 
//     const cell = rowData.cells[header.id]
//     if (!cell) return
// 
    // Single directory reference
//     if (cell.dirRowId) {
//       dirRefs.push({ dirTableId: header.dirTableId, dirRowId: cell.dirRowId })
//     }
// 
    // Multi-select directory references
//     if (cell.dirValues?.length > 0) {
//       cell.dirValues.forEach(dv => {
//         if (dv.dirRowId) {
//           dirRefs.push({ dirTableId: header.dirTableId, dirRowId: dv.dirRowId })
//         }
//       })
//     }
//   })
// 
  // Preload all directory rows
//   dirRefs.forEach(ref => preloadSingleDirRow(ref.dirTableId, ref.dirRowId))
// }

// Handle row hover with debouncing
// const handleRowHover = (rowData) => {
//   if (rowHoverDebounceTimer) {
//     clearTimeout(rowHoverDebounceTimer)
//   }
// 
//   rowHoverDebounceTimer = setTimeout(() => {
//     preloadRowDirData(rowData)
//   }, ROW_HOVER_DEBOUNCE_MS)
// }

// Handle row focus (keyboard navigation)
// const handleRowFocus = (event, rowData) => {
  // Only preload if focus came from keyboard navigation (tab)
  // Check if the focus is on a focusable element within the row
//   const focusedElement = event.target
//   if (focusedElement && rowData) {
//     preloadRowDirData(rowData)
//   }
// }

// Cancel row hover preloading
// const cancelRowHoverPreload = () => {
//   if (rowHoverDebounceTimer) {
//     clearTimeout(rowHoverDebounceTimer)
//     rowHoverDebounceTimer = null
//   }
// }

const preloadDirectories = async () => {
  console.log('[preloadDirectories] CALLED! autoLoadDirs:', props.autoLoadDirs, 'localHeaders count:', localHeaders.value.length)
  // КРИТИЧНЫЙ ФИХ: Проверяем флаг autoLoadDirs перед загрузкой справочников
  // Если отключена автоматическая загрузка - не загружаем справочники
  const isAutoLoadDirsDisabled = props.autoLoadDirs === false || props.autoLoadDirs === 'false'
  if (isAutoLoadDirsDisabled) {
    console.log('[preloadDirectories] autoLoadDirs DISABLED - skipping directory preload (value:', props.autoLoadDirs, ')')
    return
  }

  const dirTableIds = [...new Set(
    localHeaders.value
      .map(h => h.dirTableId)
      .filter(Boolean)
  )]

  if (dirTableIds.length === 0) return

  console.log('[preloadDirectories] Starting preload of', dirTableIds.length, 'directories')

  // Load all directories in parallel
  await Promise.all(
    dirTableIds.map(id => new Promise(resolve => {
      if (!directoryCache.value[id]) {
        loadingDirectories.value.add(id)
        emit('load-directory-list', {
          dirTableId: id,
          callback: list => {
            directoryCache.value[id] = list
            directoryLists.value[id] = list
            loadingDirectories.value.delete(id)
            resolve()
          }
        })
      } else {
        resolve()
      }
    }))
  )
}

// const loadAllDirectories = () => {
//   const dirTableIds = new Set()
//   localHeaders.value.forEach(header => {
//     if (header.dirTableId) dirTableIds.add(header.dirTableId)
//   })
//   dirTableIds.forEach(id => loadDirectoryList(id))
// }

// const refreshDirectoryCache = () => {
//   const dirTableIds = Object.keys(directoryCache.value)
// 
//   dirTableIds.forEach(id => {
//     loadingDirectories.value.add(parseInt(id))
//     emit('load-directory-list', {
//       dirTableId: parseInt(id),
//       callback: list => {
//         directoryCache.value[id] = list
//         directoryLists.value[id] = list
//         loadingDirectories.value.delete(parseInt(id))
//       }
//     })
//   })
// }

const startCacheRefresh = () => {
  // Refresh cache every 5 minutes
  cacheRefreshInterval.value = setInterval(() => {
    refreshDirectoryCache()
  }, 5 * 60 * 1000)
}

const stopCacheRefresh = () => {
  if (cacheRefreshInterval.value) {
    clearInterval(cacheRefreshInterval.value)
    cacheRefreshInterval.value = null
  }
}

const isExpandingField = (type) => {
  return [3, 8, 12].includes(type)
}

const handleFieldUpdate = (header, value) => {
  header.value = value
  
  if (isExpandingField(header.type)) {
    nextTick(() => {
      adjustFieldHeight(header)
    })
  }
}

const adjustFieldHeight = (header) => {
  const fieldIndex = editingRow.value.headers.findIndex(h => h.headerId === header.headerId)
  if (fieldIndex === -1) return
  
  const fieldElement = fieldRefs.value[fieldIndex]?.$el
  if (!fieldElement) return
  
  if (header.type === 12) {
    fieldElement.style.height = 'auto'
    fieldElement.style.height = `${fieldElement.scrollHeight}px`
  }
}

watch(editingRow, (newVal) => {
  if (newVal) {
    nextTick(() => {
      newVal.headers.forEach(header => {
        if (isExpandingField(header.type)) {
          adjustFieldHeight(header)
        }
      })
    })
  }
}, { deep: true })

watch(() => props.headers, (newHeaders) => {
  localHeaders.value = newHeaders.map(header => ({
    ...header,
    width: header.width || 150,
    columnType: header.columnType || 'regular'
  }))
  console.log('[DataTable] Headers updated, columnTypes:', newHeaders.map(h => ({ id: h.id, name: h.value, columnType: h.columnType, dirTableId: h.dirTableId })))
}, { immediate: true, deep: true })
watch(() => props.tableWidth, newWidth => {
  if (table.value && newWidth !== null) table.value.style.width = `${newWidth}px`
})

// Build dependency graph on initial load and when rows structure changes significantly
watch(() => props.rows, (newRows, oldRows) => {
  // Clear local cell overrides when props update (parent has applied changes)
  localCellOverrides.value.clear()

  // If this is initial load or structure changed significantly (row count change)
  if (!oldRows || newRows.length !== oldRows.length) {
    // Rebuild dependency graph
    buildDependencyGraph()
    // Clear all caches on structural changes
    formulaCache.value.clear()
    rangeCacheMap.value.clear()
    return
  }

  // Detect which cells actually changed
  const changedCellKeys = []

  newRows.forEach((newRow, index) => {
    const oldRow = oldRows[index]
    if (!oldRow || oldRow.id !== newRow.id) {
      // Row structure changed, rebuild everything
      buildDependencyGraph()
      formulaCache.value.clear()
      rangeCacheMap.value.clear()
      return
    }

    newRow.values.forEach((newCell, cellIndex) => {
      const oldCell = oldRow.values[cellIndex]
      if (!oldCell || oldCell.headerId !== newCell.headerId) return

      // Check if cell value changed
      if (newCell.value !== oldCell.value) {
        const cellKey = `${newRow.id}-${newCell.headerId}`
        changedCellKeys.push(cellKey)

        // If the changed cell is a formula, rebuild graph (dependencies might have changed)
        if (typeof newCell.value === 'string' && newCell.value.startsWith('=')) {
          buildDependencyGraph()
        }
      }
    })
  })

  // Use incremental invalidation for changed cells
  if (changedCellKeys.length > 0) {
    invalidateDependentFormulas(changedCellKeys)
  }
}, { deep: true })

watch(editingCell, newVal => {
  if (newVal && newVal.headerId) {
    const header = localHeaders.value.find(h => h.id === newVal.headerId)
    if (header?.dirTableId) {
      nextTick(() => {
        const dropdown = document.querySelector('.seamless-editor .p-dropdown, .seamless-editor .p-multiselect')
        if (dropdown) {
          const trigger = dropdown.querySelector('.p-dropdown-trigger, .p-multiselect-trigger')
          if (trigger) trigger.click()
        }
      })
    }
  }
})

// const formatMultiGroupHeader = (groupKey) => {
//   const values = groupKey.split('|')
//   return values.map((value, index) => {
//     const headerId = currentGroupColumns.value[index]
//     const header = localHeaders.value.find(h => h.id === headerId)
//     return header ? `${header.value}: ${value}` : value
//   }).join('; ')
// }
const cleanup = () => {
  // Очистить event listeners
  window.removeEventListener('resize', updateTableHeight)
  // document.removeEventListener('mousedown', handleDocumentClick)
  document.removeEventListener('keydown', handleKeyboardNavigation)
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)

  // Очистить кеши
  // directoryLists.value = {}
  // directoryCache.value = {}
  clearDirectoryCache()
  cleanupDirectoryPreload()

  // Сбросить состояния редактирования
  cleanupCellEditing()
  cleanupRowEditing()
  cleanupGrouping()
  cleanupHeaderManagement()
  // editingCell.value = null
  // editingValue.value = null
  // editingOptions.value = []
  // editingMultiValue.value = []
  // currentEditingHeader.value = null

  // Закрыть открытые меню и диалоги
  // if (headerContextMenu.value) headerContextMenu.value.hide()  // Now in cleanupHeaderManagement
  if (rowContextMenu.value) rowContextMenu.value.hide()
  // if (typeMenu.value) typeMenu.value.hide()  // Now in cleanupHeaderManagement
  if (dirOverlay.value) dirOverlay.value.hide()
  // isRowEditDialogVisible.value = false
  // isConfirmDialogVisible.value = false

  // Очистить состояния выделения
  selectedCells.value = { start: null, end: null, isSelecting: false }

  // Сбросить resize данные
  if (isResizing.value) {
    cleanupResize()
  }
}

onMounted(() => {
  console.log('[DataTable.onMounted] autoLoadDirs prop value:', props.autoLoadDirs, 'type:', typeof props.autoLoadDirs)
  table.value = document.querySelector('.coda-style-datatable table')
  updateTableHeight()
  window.addEventListener('resize', updateTableHeight)
  document.addEventListener('mousedown', handleDocumentClick)
  document.addEventListener('keydown', handleKeyboardNavigation)
  console.log('[DataTable.onMounted] Calling preloadDirectories with autoLoadDirs:', props.autoLoadDirs)
  preloadDirectories()
  startCacheRefresh()

  // Build initial dependency graph for formula cache invalidation
  buildDependencyGraph()

  // Tooltip event delegation for data-tooltip elements
  const container = document.querySelector('.coda-style-datatable')
  if (container) {
    container.addEventListener('mouseenter', handleTooltipShow, true)
    container.addEventListener('mouseleave', handleTooltipHide, true)
  }
})

onBeforeUnmount(() => {
  stopCacheRefresh()
  cleanup()
  // Issue #5005: Remove capture phase ESC listener if still attached
  document.removeEventListener('keydown', handleGlobalEscForDropdown, true)

  // Cleanup row resize handlers if active
  if (isRowResizing.value) {
    cleanupRowResize()
  }

  // Cleanup tooltip event listeners
  const container = document.querySelector('.coda-style-datatable')
  if (container) {
    container.removeEventListener('mouseenter', handleTooltipShow, true)
    container.removeEventListener('mouseleave', handleTooltipHide, true)
  }

  // Clear any pending tooltip hide timeout
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout)
    tooltipHideTimeout = null
  }
})

// Экспортировать методы для внешнего вызова (например, из глобального ESC handler)
defineExpose({
  cleanup,
  cancelCellEdit,
  startCellEdit,
  // Issue #5005: Expose edit state for external checks
  isEditing: () => editingCell.value !== null,
  // Phase 1: Row selection mode toggle
  toggleSelectionMode,
  selectionModeEnabled: () => selectionModeEnabled.value,
  // Phase 1: Footer aggregations toggle
  toggleFooter,
  isFooterVisible: () => showFooter.value,
  // Phase 1: Background directory loading
  loadAllDirDataInBackground,
  stopBackgroundLoading,
  isBackgroundLoadingDirs: () => isBackgroundLoadingDirs.value,
  backgroundLoadProgress: () => backgroundLoadProgress.value
})
</script>

<style scoped>
.coda-style-datatable {
  --header-bg: var(--surface-ground);
  --row-hover: var(--surface-hover);
  --border-color: var(--surface-border);
  --text-color: var(--text-color-primary);
  --counter-color: var(--text-color-secondary);
  --cell-padding: 12px 16px;
  --font-size: 14px;
  --line-height: 20px;
  --drag-hover-bg: var(--surface-border);
  --drop-indicator-color: var(--primary-color);
  --resizer-active-color: var(--primary-color);
  --primary-rgb: var(--primary-500);

  /* Force block display and constrain width for horizontal scroll */
  display: block !important;
  /* Position relative for loading spinner overlay */
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}
.table-container {
  overflow-x: auto;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--surface-a);
  position: relative;
  scrollbar-color: var(--text-color-secondary) transparent;

  /* Performance optimizations for smooth scrolling */
  /* Removed: transform: translateZ(0) - can cause rendering issues */
  /* Removed: will-change - let browser decide */
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
}

table {
  width: max-content;
  border-collapse: collapse;
  font-size: var(--font-size);
  line-height: var(--line-height);
  table-layout: auto;
  position: relative;
}

th,
td {
  text-align: left;
  padding: var(--cell-padding);
  border-bottom: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--header-bg);
  font-weight: 500;
  color: var(--text-color);
  user-select: none;
}

td {
  background: var(--surface-a);
  color: var(--text-color);
  max-width: 0; /* Prevent cell expansion */
  overflow: hidden; /* Prevent overflow */
}

tr:hover td {
  background: var(--row-hover);
}

/* Performance optimization for table rows */
tbody tr {
  /* contain: layout style paint - disabled, was causing white space during fast scroll */
  /* content-visibility: auto - disabled, browser lazy rendering causes flicker on scroll */
}

.row-counter-header {
  z-index: 4;
  position: sticky;
}

.row-counter-cell {
  z-index: 1;
  color: var(--counter-color);
  border-right: none;
  position: relative;
}

/* Row Resizer - drag handle at bottom of each row */
.row-resizer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: row-resize;
  background: transparent;
  z-index: 10;
  transition: background-color 0.15s ease;
}

.row-resizer:hover,
.row-resizer:active,
.row-resizing .row-resizer {
  background-color: var(--resizer-active-color, var(--primary-color, #6366f1));
}

tr.row-resizing {
  user-select: none;
}

tr.row-resizing td {
  user-select: none;
}

/* CSS-based hover for row edit icon - no JavaScript re-renders */
.row-counter-hover {
  position: relative;
}

.row-counter-hover .row-number-text {
  display: inline;
}

.row-counter-hover .row-edit-icon {
  display: none;
}

/* Show edit icon on row hover using pure CSS */
tr.data-row:hover .row-counter-hover .row-number-text {
  display: none;
}

tr.data-row:hover .row-counter-hover .row-edit-icon {
  display: inline;
}

.header-content,
.cell-content {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draggable-column {
  cursor: move;
  position: relative;
}

.draggable-column:hover {
  background: var(--drag-hover-bg);
}

.draggable-column.dragging {
  opacity: 0.6;
}

.draggable-column.drop-left::after,
.draggable-column.drop-right::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--drop-indicator-color);
  z-index: 2;
}

.draggable-column.drop-left::after {
  left: -1px;
}

.draggable-column.drop-right::before {
  right: -1px;
}

.type-icon {
  margin-left: 8px;
  color: var(--text-color-primary);
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
  font-size: 1.2em;
  vertical-align: middle;
}

.draggable-column:hover .type-icon {
  opacity: 0.6;
}

.draggable-column.dragging .type-icon {
  opacity: 1;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  z-index: 10;
  background: transparent;
  transition: background-color 0.2s;
}

.resizer:hover,
.resizer:active,
.resizing .resizer {
  background-color: var(--resizer-active-color);
}

.dark .coda-style-datatable {
  --header-bg: var(--surface-800);
  --row-hover: var(--surface-700);
  --border-color: var(--surface-600);
  --drag-hover-bg: var(--surface-700);
  --drop-indicator-color: var(--primary-400);
  --resizer-active-color: var(--primary-400);
}

.dark .row-counter-cell {
  border-right: none;
}

.dragging .header-content::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface-a);
  opacity: 0.8;
  z-index: 1;
}

th:not(.row-counter-header) {
  position: sticky;
  left: calc(var(--row-counter-width) + var(--current-left-offset, 0px));
  z-index: 2;
}

.dir {
  display: inline-block;
  background: var(--p-indigo-50, #eef2ff);
  border: 1px solid var(--p-indigo-200, #c7d2fe);
  color: var(--p-indigo-700, #4338ca);
  padding: 3px 10px;
  border-radius: 12px;
  text-align: center;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dir:hover {
  background: var(--p-indigo-100, #e0e7ff);
  border-color: var(--p-indigo-300, #a5b4fc);
}

.cell-empty-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 24px;
  cursor: pointer;
}

/* Add row - styled like API docs table row */
.add-row-container.coda-add-row {
  display: flex;
  align-items: center;
}

.add-row-button.coda-add-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 44px;
  padding: 0 0.75rem;
  background: transparent;
  border: none;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.add-row-button.coda-add-button:hover:not(:disabled) {
  background-color: var(--p-surface-hover, var(--surface-hover));
}

.add-row-button.coda-add-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--p-primary-color, var(--primary-color));
}

.add-row-icon i {
  font-size: 14px;
}

.add-row-text {
  font-weight: 400;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}

/* Add column header - Notion/Coda style */
.add-column-header {
  position: sticky !important;
  right: 0;
  top: 0;
  z-index: 4 !important;
  width: 44px !important;
  min-width: 44px !important;
  max-width: 44px !important;
  padding: 0 !important;
  background: var(--header-bg) !important;
  border-left: 1px solid var(--p-surface-200, var(--surface-border)) !important;
}

.add-column-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 38px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-column-btn:hover:not(:disabled) {
  background: var(--p-surface-100, var(--surface-hover));
  color: var(--p-primary-color, var(--primary-color));
}

.add-column-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-column-btn i {
  font-size: 14px;
}

.add-column-btn.is-loading i {
  font-size: 12px;
}

/* Loading spinner overlay - fixed at bottom center of viewport during background loading */
.loading-spinner-overlay {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--p-surface-0);
  border-radius: 50px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.selected-cell {
  position: relative;
  z-index: 1; /* Lower than header (z-index: 3) to prevent overlap when scrolling */
}

.selected-cell::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid var(--p-primary-color);
  pointer-events: none;
}

.selected-range {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  position: relative;
}

.selected-range::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid var(--p-primary-color);
  pointer-events: none;
  opacity: 0.5;
}

.cell-editor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
}

.seamless-editor {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  height: 100%;
  min-height: 24px;
}

/* File editor seamless style (like dropdown/input) */
.file-editor-seamless {
  display: flex;
  align-items: center;
  height: 100%;
  min-height: 24px;
  position: relative;
}

.file-editor-seamless .file-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.file-editor-seamless .file-editor-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  cursor: pointer;
  padding: 0 4px;
  height: 100%;
  font: inherit;
  color: inherit;
  overflow: hidden;
}

.file-editor-seamless .file-editor-label:hover {
  background: var(--p-surface-100, rgba(0, 0, 0, 0.04));
}

.file-editor-seamless .file-editor-icon {
  font-size: 0.85rem;
  color: var(--p-slate-500, #64748b);
  flex-shrink: 0;
}

.file-editor-seamless .file-editor-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: inherit;
}

.file-editor-seamless .file-editor-text:empty::before {
  content: 'Выберите файл...';
  color: var(--p-text-muted-color, #9ca3af);
}

.file-editor-seamless .file-editor-clear {
  flex-shrink: 0;
  cursor: pointer;
  padding: 4px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #6b7280);
  border-radius: 50%;
  transition: all 0.15s;
}

.file-editor-seamless .file-editor-clear:hover {
  background: var(--p-red-100, #fee2e2);
  color: var(--p-red-600, #dc2626);
}

.seamless-editor :deep(.p-inputtext) {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  height: 100%;
  font: inherit;
  color: inherit;
  cursor: text !important;
}

.seamless-editor :deep(.p-inputtext:focus) {
  outline: none !important;
  box-shadow: none !important;
  caret-color: currentColor !important;
}

.seamless-editor :deep(.p-calendar) {
  height: 100%;
}

.seamless-editor :deep(.p-inputnumber-input) {
  padding: 0 !important;
}

.seamless-editor :deep(.p-checkbox .p-checkbox-box) {
  width: 18px;
  height: 18px;
}

.seamless-editor :deep(.p-checkbox) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.editing-cell {
  position: relative;
  z-index: 1; /* Lower than header (z-index: 3) to prevent overlap when scrolling */
}

.editing-cell::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px solid var(--p-green-500);
  background: color-mix(in srgb, var(--p-green-500) 5%, transparent);
  animation: editing-pulse 1.5s ease-in-out infinite;
}

@keyframes editing-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--p-green-500) 40%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--p-green-500) 0%, transparent);
  }
}

.row-edit-form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
  padding: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field label {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.cell-content {
  position: relative;
  height: 100%;
  min-height: 24px;
  display: flex;
  align-items: center;
}

.cell-value,
.cell-nested,
.cell-dir {
  height: 100%;
  display: flex;
  align-items: center;
}

.cell-nested {
  cursor: pointer;
  padding: 6px 10px;
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  border: 1px solid var(--p-surface-200);
  border-radius: 20px;
  gap: 8px;
  color: var(--p-text-color);
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  min-width: fit-content;
}

.cell-nested:hover {
  background: linear-gradient(135deg, var(--p-primary-50) 0%, var(--p-primary-100) 100%);
  border-color: var(--p-primary-200);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.cell-nested .nested-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: white;
}

.cell-nested .nested-badge.badge-empty {
  background: var(--p-surface-400);
}

.cell-nested .nested-badge.badge-few {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.cell-nested .nested-badge.badge-some {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.cell-nested .nested-badge.badge-many {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
}

.cell-nested .nested-label {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.cell-nested .nested-arrow {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  opacity: 0.5;
  transition: opacity 0.2s, transform 0.2s;
}

.cell-nested:hover .nested-arrow {
  opacity: 1;
  color: var(--p-primary-color);
}

.p-invalid {
  border-color: var(--red-500) !important;
}

.p-invalid:focus {
  box-shadow: 0 0 0 2px var(--red-300) !important;
}

.header-menu {
  padding: 0.5rem 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 0.75rem;
}

.menu-item:hover {
  background-color: var(--surface-hover);
}

.type-submenu {
  margin-left: 1rem;
  border-left: 2px solid var(--surface-border);
}

.type-item {
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.type-item:hover {
  background-color: var(--surface-hover);
}

.active-type {
  color: var(--primary-color);
  background-color: var(--primary-color-light);
}

.text-red-500 {
  color: var(--red-500);
}

.type-item i {
  width: 1.25rem;
  text-align: center;
}

.pi-chevron-right {
  margin-left: auto;
  font-size: 0.875rem;
}

.fa-caret-down {
  font-size: 0.75rem;
  margin-left: 0.5rem;
  opacity: 0.7;
}

.type-menu {
  padding: 0.5rem 0;
}

.type-item {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: background 0.2s;
}

.type-item:hover {
  background: var(--surface-hover);
}

.active-type {
  color: var(--primary-color);
  background: var(--primary-color-light);
}

.p-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.p-field label {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.confirmation-content {
  display: flex;
  align-items: center;
}

/* MEMO (type 12) dialog styles */
.memo-edit-content {
  display: flex;
  flex-direction: column;
}

.memo-edit-content :deep(.p-inputtextarea) {
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  min-height: 200px;
  resize: vertical;
}

.memo-hint {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.pi-exclamation-triangle {
  color: var(--yellow-500);
}

.header-editor {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  margin: 0;
  height: 100%;
}

.header-editor :deep(.p-inputtext) {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  font: inherit !important;
  color: inherit !important;
  height: 100%;
}

.header-editor :deep(.p-inputtext:focus) {
  box-shadow: none !important;
}

.cell-value :deep(*) {
  margin: 0;
  line-height: inherit;
  font-size: inherit;
}

.cell-value :deep(ul),
.cell-value :deep(ol) {
  padding-left: 1.5em;
}

.cell-value :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}

.cell-value :deep(th),
.cell-value :deep(td) {
  border: 1px solid var(--surface-border);
  padding: 0.25em 0.5em;
}

.cell-multi-dir {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dir-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin: 1px 2px;
  border-radius: 12px;
  font-size: 0.85em;
  white-space: nowrap;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.dir-tag:hover {
  filter: brightness(0.92);
}

/* Color palette for dir-tags by index (using PrimeVue colors) */
.dir-tag:nth-child(8n+1) { background: var(--p-blue-100, #dbeafe); color: var(--p-blue-700, #1d4ed8); }
.dir-tag:nth-child(8n+2) { background: var(--p-green-100, #dcfce7); color: var(--p-green-700, #15803d); }
.dir-tag:nth-child(8n+3) { background: var(--p-amber-100, #fef3c7); color: var(--p-amber-700, #b45309); }
.dir-tag:nth-child(8n+4) { background: var(--p-purple-100, #f3e8ff); color: var(--p-purple-700, #7e22ce); }
.dir-tag:nth-child(8n+5) { background: var(--p-pink-100, #fce7f3); color: var(--p-pink-700, #be185d); }
.dir-tag:nth-child(8n+6) { background: var(--p-cyan-100, #cffafe); color: var(--p-cyan-700, #0e7490); }
.dir-tag:nth-child(8n+7) { background: var(--p-orange-100, #ffedd5); color: var(--p-orange-700, #c2410c); }
.dir-tag:nth-child(8n+8) { background: var(--p-teal-100, #ccfbf1); color: var(--p-teal-700, #0f766e); }

.seamless-editor .p-multiselect,
.seamless-editor :deep(.p-multiselect) {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--p-surface-300, var(--surface-300)) !important;
  border-radius: 4px;
  background: var(--p-surface-0, var(--surface-card, #fff)) !important;
  box-shadow: none !important;
}

.seamless-editor .p-multiselect:hover,
.seamless-editor :deep(.p-multiselect:hover) {
  border-color: var(--p-primary-color, var(--primary-color)) !important;
}

.seamless-editor .p-multiselect:focus,
.seamless-editor .p-multiselect:focus-within,
.seamless-editor :deep(.p-multiselect:focus),
.seamless-editor :deep(.p-multiselect:focus-within) {
  border-color: var(--p-primary-color, var(--primary-color)) !important;
  box-shadow: 0 0 0 1px var(--p-primary-color, var(--primary-color)) !important;
  outline: none !important;
}

/* Multiselect label area - must show chips */
.seamless-editor :deep(.p-multiselect-label-container) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 4px;
  padding: 4px 8px !important;
  min-height: 24px;
  align-items: center;
}

.seamless-editor .p-multiselect .p-multiselect-label,
.seamless-editor :deep(.p-multiselect-label) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 4px;
  padding: 0 !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
}

/* Chips/tokens must be visible with colors by index */
.seamless-editor :deep(.p-multiselect-token),
.seamless-editor :deep(.p-chip) {
  display: inline-flex !important;
  align-items: center;
  padding: 2px 8px !important;
  margin: 0 !important;
  border-radius: 12px !important;
  font-size: 12px !important;
  white-space: nowrap !important;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.seamless-editor :deep(.p-multiselect-token:hover),
.seamless-editor :deep(.p-chip:hover) {
  filter: brightness(0.95);
}

/* Color palette for chips by index (using PrimeVue colors) */
/* PrimeVue 3 class names */
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+1)) { background: var(--p-blue-100, #dbeafe) !important; color: var(--p-blue-700, #1d4ed8) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+2)) { background: var(--p-green-100, #dcfce7) !important; color: var(--p-green-700, #15803d) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+3)) { background: var(--p-amber-100, #fef3c7) !important; color: var(--p-amber-700, #b45309) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+4)) { background: var(--p-purple-100, #f3e8ff) !important; color: var(--p-purple-700, #7e22ce) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+5)) { background: var(--p-pink-100, #fce7f3) !important; color: var(--p-pink-700, #be185d) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+6)) { background: var(--p-cyan-100, #cffafe) !important; color: var(--p-cyan-700, #0e7490) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+7)) { background: var(--p-orange-100, #ffedd5) !important; color: var(--p-orange-700, #c2410c) !important; }
.seamless-editor :deep(.p-multiselect-token:nth-child(8n+8)) { background: var(--p-teal-100, #ccfbf1) !important; color: var(--p-teal-700, #0f766e) !important; }

/* PrimeVue 4 class names (.p-chip inside multiselect) */
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+1)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+1)) { background: var(--p-blue-100, #dbeafe) !important; color: var(--p-blue-700, #1d4ed8) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+2)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+2)) { background: var(--p-green-100, #dcfce7) !important; color: var(--p-green-700, #15803d) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+3)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+3)) { background: var(--p-amber-100, #fef3c7) !important; color: var(--p-amber-700, #b45309) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+4)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+4)) { background: var(--p-purple-100, #f3e8ff) !important; color: var(--p-purple-700, #7e22ce) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+5)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+5)) { background: var(--p-pink-100, #fce7f3) !important; color: var(--p-pink-700, #be185d) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+6)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+6)) { background: var(--p-cyan-100, #cffafe) !important; color: var(--p-cyan-700, #0e7490) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+7)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+7)) { background: var(--p-orange-100, #ffedd5) !important; color: var(--p-orange-700, #c2410c) !important; }
.seamless-editor :deep(.p-multiselect-chip:nth-child(8n+8)),
.seamless-editor :deep(.p-multiselect-label .p-chip:nth-child(8n+8)) { background: var(--p-teal-100, #ccfbf1) !important; color: var(--p-teal-700, #0f766e) !important; }

.seamless-editor :deep(.p-multiselect-token-icon),
.seamless-editor :deep(.p-chip-remove-icon) {
  margin-left: 4px;
  font-size: 10px;
  cursor: pointer;
}

.seamless-editor :deep(.p-multiselect-trigger) {
  width: 28px;
  flex-shrink: 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}

.seamless-editor .p-multiselect-panel {
  position: fixed;
}

.group-header {
  background-color: var(--surface-100);
  font-weight: bold;
  cursor: pointer;
}

.group-header td {
  padding: 8px 16px;
}

.group-header:hover {
  background-color: var(--surface-200);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-button {
  opacity: 0;
  transition: opacity 0.2s;
}

.draggable-column:hover .group-button {
  opacity: 1;
}

.row-edit-dialog .p-dialog-content {
  overflow-y: visible;
}

.row-edit-form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
  padding: 1rem;
  align-items: start;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: min-content;
}

.form-field.has-expanding-content {
  min-height: auto;
}

.form-field label {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.row-edit-form .p-inputtextarea) {
  resize: vertical;
  min-height: 60px;
  transition: height 0.2s;
}

:deep(.row-edit-form .p-dropdown) {
  min-height: 40px;
}

:deep(.row-edit-form .p-multiselect) {
  min-height: 40px;
}

:deep(.row-edit-form .p-multiselect .p-multiselect-label) {
  white-space: normal;
  overflow-wrap: break-word;
}

@media screen and (max-width: 768px) {
  .row-edit-form {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

/* Virtual scrolling styles */
.virtual-scroll-spacer {
  pointer-events: none;
}

.virtual-scroll-spacer td {
  border: none !important;
  background: transparent !important;
}

/* Mobile responsiveness - Card layout for tables */
@media (max-width: 768px) {
  /* Hide table structure on mobile */
  .coda-style-datatable table,
  .coda-style-datatable thead,
  .coda-style-datatable tbody {
    display: block;
  }

  .coda-style-datatable thead {
    display: none;
  }

  /* Convert rows to cards */
  .coda-style-datatable tbody tr {
    display: block;
    background: var(--surface-a);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  /* Hide group header rows on mobile */
  .coda-style-datatable tbody tr.group-header {
    display: flex;
    padding: 8px 16px;
    margin-bottom: 8px;
    border-radius: 4px;
  }

  /* Style cells as blocks with labels */
  .coda-style-datatable tbody td {
    display: block;
    padding: 8px 0;
    border: none !important;
    text-align: left !important;
    max-width: 100%;
  }

  /* Add label before each cell using data-label attribute */
  .coda-style-datatable tbody td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--counter-color);
    display: block;
    margin-bottom: 4px;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* Hide row counter cell on mobile */
  .coda-style-datatable .row-counter-cell {
    display: none !important;
  }

  /* Make cell content wrap */
  .cell-content {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    word-break: break-word;
  }

  /* Adjust cell values for mobile */
  .cell-value {
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  /* Adjust nested cells for mobile */
  .cell-nested {
    padding: 6px 10px;
    border-radius: 16px;
    gap: 6px;
  }

  .cell-nested .nested-badge {
    min-width: 22px;
    height: 22px;
    font-size: 0.75rem;
  }

  .cell-nested .nested-label {
    font-size: 0.8rem;
  }

  /* Adjust directory cells for mobile */
  .cell-dir,
  .cell-multi-dir {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .dir-tag {
    padding: 4px 8px;
    background: var(--surface-ground);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  /* Adjust table container for mobile */
  .table-container {
    max-height: none !important;
    border-radius: 0;
  }

  /* Make context menus full-width on mobile */
  .p-contextmenu {
    max-width: calc(100vw - 32px);
  }

  /* Adjust type menu for mobile */
  .type-menu {
    max-height: 300px;
    overflow-y: auto;
  }

  .type-item {
    padding: 12px;
    font-size: 0.9375rem;
  }
}

/* Quick Column Filters - Phase 1 Feature Roadmap */
.filter-button {
  opacity: 0;
  transition: opacity 0.2s;
}

th:hover .filter-button {
  opacity: 1;
}

.filter-button.filter-active {
  opacity: 1 !important;
  color: var(--primary-color);
}

.column-filter-popover {
  z-index: 1100;
}

.column-filter-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--surface-border);
}

.filter-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--text-color);
}

.filter-search {
  width: 100%;
}

.filter-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.filter-values-list {
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-value-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.filter-value-item:hover {
  background-color: var(--surface-hover);
}

.filter-value-text {
  flex: 1;
  font-size: 0.875rem;
  color: var(--text-color);
  user-select: none;
}

.filter-value-text:empty::before {
  content: '(Пусто)';
  color: var(--text-color-secondary);
  font-style: italic;
}

/* Row Selection + Bulk Operations - Phase 1 Feature Roadmap */
.select-all-checkbox {
  cursor: pointer;
}

.row-counter-with-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-select-checkbox {
  cursor: pointer;
  flex-shrink: 0;
}

.row-number {
  flex: 1;
  cursor: pointer;
  user-select: none;
}

.row-selected {
  background-color: var(--primary-50) !important;
}

.dark .row-selected {
  background-color: rgba(var(--primary-500-rgb), 0.1) !important;
}

.bulk-actions-toolbar {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.bulk-actions-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}

.bulk-selection-count {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--text-color);
}

.bulk-actions-buttons {
  display: flex;
  gap: 8px;
}

/* Transition for bulk toolbar */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Column Pinning - Phase 1 Feature Roadmap */
.pinned-column {
  position: sticky;
  z-index: 10;
  background: var(--surface-card);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.08);
}

/* Darker shadow for pinned headers */
th.pinned-column {
  z-index: 11;
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.12);
}

/* Ensure pinned columns stay above regular content */
th.pinned-column::after,
td.pinned-column::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;
  background: var(--surface-border);
}

/* Multi-level Sorting - Phase 1 Feature Roadmap */
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.header-actions:hover {
  opacity: 0.8;
}

.header-actions.disabled-sorting {
  cursor: not-allowed;
  opacity: 0.5;
}

.header-actions.disabled-sorting:hover {
  opacity: 0.5;
}

.header-text {
  flex: 1;
}

.sort-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  color: var(--primary-color);
  font-weight: 600;
}

.sort-order {
  background: var(--primary-color);
  color: white;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.sort-indicator .pi {
  font-size: 0.875rem;
}

/* Column Footer Aggregations - Phase 1 Feature Roadmap */
tfoot {
  position: sticky;
  bottom: 0;
  z-index: 5;
  background: var(--surface-card);
  border-top: 2px solid var(--surface-border);
}

.footer-row {
  background: var(--surface-100);
  font-weight: 600;
  font-size: 0.875rem;
}

.footer-cell,
.row-counter-footer {
  padding: 10px 12px;
  background: var(--surface-100);
  border-bottom: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  text-align: center;
}

.footer-cell-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

.row-counter-footer {
  text-align: center;
  color: var(--primary-color);
}

.footer-cell:hover {
  background: var(--surface-200);
  cursor: context-menu;
}

/* Prevent native text selection during Shift+Click cell selection */
.coda-style-datatable table {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* Allow text selection in editing mode */
.coda-style-datatable input,
.coda-style-datatable textarea,
.coda-style-datatable .p-dropdown,
.coda-style-datatable .p-multiselect {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

/* Conditional Formatting Dialog (Phase 2) */
.color-box {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-box:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-box.selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.2);
}

.preview-box {
  border: 1px solid var(--surface-border);
  margin-top: 1rem;
}

.existing-rule {
  border: 1px solid var(--surface-border);
  font-size: 0.875rem;
}

/* Phase 3 - Feature #17: Cell change indicators */
.cell-changed {
  position: relative;
}

.cell-changed::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 12px 12px 0;
  border-color: transparent #22c55e transparent transparent;
  z-index: 5;
  pointer-events: none;
}

.cell-changed:hover::before {
  border-width: 0 14px 14px 0;
  transition: all 0.2s ease;
}

/* Directory Preview Popover - Modern Card Style */
:deep(.dir-preview-popover) {
  .p-popover-content {
    padding: 0;
  }
}

.dir-preview-card {
  min-width: 220px;
  max-width: 320px;
  padding: 0;
  background: var(--surface-ground);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.dir-preview-header {
  padding: 8px 12px;
  background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 70%, #000));
}

.dir-preview-type {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  opacity: 0.9;
}

.dir-preview-main {
  padding: 12px 16px 8px;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.3;
  word-break: break-word;
}

.dir-preview-items {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dir-preview-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.85rem;
  line-height: 1.4;
}

.dir-preview-label {
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.dir-preview-value {
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.dir-preview-count {
  color: var(--primary-color);
  font-weight: 600;
}

.dir-preview-item a {
  color: var(--primary-color);
  text-decoration: none;
}

.dir-preview-item a:hover {
  text-decoration: underline;
}

.dir-preview-loading {
  padding: 24px 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.dir-preview-loading i {
  font-size: 1.5rem;
}

/* Subordinate tables in preview */
.dir-preview-subordinates {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dir-preview-sub {
  background: var(--surface-hover);
  border-radius: 8px;
  padding: 8px 10px;
}

.dir-preview-sub-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}

.dir-preview-sub-header i {
  font-size: 0.7rem;
  color: var(--primary-color);
  opacity: 0.7;
}

.dir-preview-sub-count {
  background: var(--primary-color);
  color: white;
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 10px;
  margin-left: auto;
}

.dir-preview-sub-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dir-preview-sub-item {
  background: var(--surface-ground);
  color: var(--text-color);
  font-size: 0.8rem;
  padding: 3px 8px;
  border-radius: 4px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-preview-sub-more {
  background: var(--surface-border);
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.dir-preview-sub-empty {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-style: italic;
  opacity: 0.6;
}

/* === Nested Table Preview Popover Styles === */
:deep(.nested-preview-popover) {
  .p-popover-content {
    padding: 0;
  }
}

.nested-preview-card {
  min-width: 200px;
  max-width: 280px;
  background: var(--surface-card);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.nested-preview-header {
  padding: 10px 14px;
  background: linear-gradient(135deg, var(--p-blue-500), var(--p-blue-600));
  display: flex;
  align-items: center;
  gap: 8px;
}

.nested-preview-header i {
  color: white;
  font-size: 0.9rem;
}

.nested-preview-type {
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nested-preview-count-badge {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 24px;
  text-align: center;
}

.nested-preview-items {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nested-preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--surface-border);
}

.nested-preview-item:last-child {
  border-bottom: none;
}

.nested-preview-item-number {
  color: var(--text-color-secondary);
  font-size: 0.8rem;
  min-width: 20px;
}

.nested-preview-item-value {
  color: var(--text-color);
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.nested-preview-more {
  color: var(--primary-color);
  font-size: 0.8rem;
  font-weight: 500;
  text-align: center;
  padding: 4px 0;
  background: var(--surface-ground);
  border-radius: 4px;
  margin-top: 4px;
}

.nested-preview-empty {
  padding: 20px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
}

.nested-preview-empty i {
  font-size: 1.5rem;
  opacity: 0.5;
}

.nested-preview-empty span {
  font-size: 0.85rem;
}

.nested-preview-loading {
  padding: 24px 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.nested-preview-loading i {
  font-size: 1.5rem;
}

/* === Cell Links (Phone & Email) Styles === */
.cell-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--primary-color);
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
  font-weight: 500;
}

.cell-link:hover {
  background: var(--primary-color);
  color: white;
  text-decoration: none;
}

/* Chip style for phone and email */
:deep(.cell-chip) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s ease;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;
  overflow: visible;
}

:deep(.cell-chip) i {
  font-size: 0.8rem;
}

:deep(.cell-phone) {
  background: var(--p-emerald-50, #ecfdf5);
  border: 1px solid var(--p-emerald-200, #a7f3d0);
  color: var(--p-emerald-700, #047857);
}

:deep(.cell-phone:hover) {
  background: var(--p-emerald-100, #d1fae5);
  border-color: var(--p-emerald-300, #6ee7b7);
}

:deep(.cell-email) {
  background: var(--p-sky-50, #f0f9ff);
  border: 1px solid var(--p-sky-200, #bae6fd);
  color: var(--p-sky-700, #0369a1);
}

:deep(.cell-email:hover) {
  background: var(--p-sky-100, #e0f2fe);
  border-color: var(--p-sky-300, #7dd3fc);
}

/* Number styling - Clean display like Notion/Airtable */
:deep(.cell-number) {
  display: inline-block;
  font-variant-numeric: tabular-nums; /* Monospaced digits for alignment */
  font-family: 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-align: right;
  padding: 2px 4px;
  transition: all 0.15s ease;
}

/* Integer - neutral dark color */
:deep(.cell-number-integer) {
  color: var(--p-text-color, #1e293b);
}

/* Decimal - slightly muted */
:deep(.cell-number-decimal) {
  color: var(--p-text-color, #475569);
}

/* Negative numbers - red color (like Airtable) */
:deep(.cell-number-negative) {
  color: var(--p-red-600, #dc2626) !important;
}

/* Hover effect - subtle background */
:deep(.cell-number:hover) {
  background-color: var(--p-surface-100, #f1f5f9);
  border-radius: 4px;
}

/* === NEW INTEGRAM TYPES STYLING === */

/* Type 2: HTML content */
:deep(.cell-html) {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--p-surface-50, #f8fafc);
  border: 1px dashed var(--p-surface-300, #cbd5e1);
}

/* Type 5: GRANT - System permissions */
:deep(.cell-grant) {
  background: var(--p-purple-50, #faf5ff);
  border: 1px solid var(--p-purple-200, #e9d5ff);
  color: var(--p-purple-700, #7e22ce);
}

:deep(.cell-grant:hover) {
  background: var(--p-purple-100, #f3e8ff);
  border-color: var(--p-purple-300, #d8b4fe);
}

:deep(.cell-grant-editor) {
  background: var(--p-amber-50, #fffbeb);
  border-color: var(--p-amber-200, #fde68a);
  color: var(--p-amber-700, #b45309);
}

:deep(.cell-grant-all) {
  background: var(--p-blue-50, #eff6ff);
  border-color: var(--p-blue-200, #bfdbfe);
  color: var(--p-blue-700, #1d4ed8);
}

:deep(.cell-grant-files) {
  background: var(--p-teal-50, #f0fdfa);
  border-color: var(--p-teal-200, #99f6e4);
  color: var(--p-teal-700, #0f766e);
}

/* Type 6: PWD - Password */
:deep(.cell-password) {
  background: var(--p-zinc-100, #f4f4f5);
  border: 1px solid var(--p-zinc-300, #d4d4d8);
  color: var(--p-zinc-500, #71717a);
  letter-spacing: 2px;
}

:deep(.cell-password:hover) {
  background: var(--p-zinc-200, #e4e4e7);
  border-color: var(--p-zinc-400, #a1a1aa);
}

/* Type 7: BUTTON - Action button */
:deep(.cell-button) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--p-primary-color, #3b82f6);
  border: none;
  color: var(--p-primary-contrast-color, white);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

:deep(.cell-button:hover) {
  background: var(--p-primary-hover-color, #2563eb);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

:deep(.cell-button i) {
  font-size: 0.8rem;
}

/* BUTTON with action link */
:deep(.cell-button-link) {
  text-decoration: none;
  display: inline-flex;
}

:deep(.cell-button-action) {
  background: var(--p-green-500, #22c55e);
}

:deep(.cell-button-action:hover) {
  background: var(--p-green-600, #16a34a);
}

:deep(.cell-button-danger) {
  background: var(--p-red-500, #ef4444);
}

:deep(.cell-button-danger:hover) {
  background: var(--p-red-600, #dc2626);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

:deep(.cell-button-disabled) {
  background: var(--p-surface-300, #d1d5db);
  color: var(--p-surface-500, #6b7280);
  cursor: not-allowed;
}

:deep(.cell-button-disabled:hover) {
  background: var(--p-surface-300, #d1d5db);
  transform: none;
  box-shadow: none;
}

/* Button Action Dialog */
.button-action-content {
  padding: 0.5rem 0;
}

.button-action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.button-action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 2px solid var(--p-surface-200, #e5e7eb);
  background: var(--p-surface-0, #ffffff);
  cursor: pointer;
  transition: all 0.2s ease;
}

.button-action-item:hover {
  border-color: var(--p-primary-200, #bfdbfe);
  background: var(--p-primary-50, #eff6ff);
}

.button-action-item.selected {
  border-color: var(--p-primary-500, #3b82f6);
  background: var(--p-primary-50, #eff6ff);
}

.button-action-item.danger:hover {
  border-color: var(--p-red-200, #fecaca);
  background: var(--p-red-50, #fef2f2);
}

.button-action-item.danger.selected {
  border-color: var(--p-red-500, #ef4444);
  background: var(--p-red-50, #fef2f2);
}

.button-action-item .action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--p-surface-100, #f3f4f6);
  color: var(--p-surface-600, #4b5563);
  font-size: 1.2rem;
}

.button-action-item.selected .action-icon {
  background: var(--p-primary-500, #3b82f6);
  color: white;
}

.button-action-item.danger.selected .action-icon {
  background: var(--p-red-500, #ef4444);
}

.button-action-item .action-info {
  flex: 1;
}

.button-action-item .action-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--p-surface-800, #1f2937);
  margin-bottom: 2px;
}

.button-action-item .action-description {
  font-size: 0.8rem;
  color: var(--p-surface-500, #6b7280);
}

.button-action-item .action-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--p-primary-500, #3b82f6);
  color: white;
  font-size: 0.75rem;
}

.button-action-item.danger .action-check {
  background: var(--p-red-500, #ef4444);
}

/* Type 10: FILE - File attachment (slate/gray - unique color, not in multiselect palette) */
:deep(.cell-file) {
  background: var(--p-slate-100, #f1f5f9);
  border: 1px solid var(--p-slate-300, #cbd5e1);
  color: var(--p-slate-700, #334155);
}

:deep(.cell-file:hover) {
  background: var(--p-slate-200, #e2e8f0);
  border-color: var(--p-slate-400, #94a3b8);
}

/* Type 11: BOOLEAN - Checkbox style */
:deep(.cell-boolean) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 1rem;
}

:deep(.cell-boolean-true) {
  background: var(--p-green-100, #dcfce7);
  color: var(--p-green-600, #16a34a);
}

:deep(.cell-boolean-true i) {
  font-size: 1rem;
}

:deep(.cell-boolean-false) {
  background: var(--p-red-100, #fee2e2);
  color: var(--p-red-400, #f87171);
}

:deep(.cell-boolean-false i) {
  font-size: 1rem;
}

/* Boolean checkbox in cell */
.cell-boolean-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.cell-boolean-checkbox :deep(.p-checkbox) {
  width: 20px;
  height: 20px;
}

.cell-boolean-checkbox :deep(.p-checkbox-box) {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

/* Type 12: MEMO - Multiline text */
:deep(.cell-memo) {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.cell-memo i) {
  color: var(--p-text-color-secondary, #64748b);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Type 15: CALCULATABLE - Calculated field */
:deep(.cell-calculated) {
  background: var(--p-orange-50, #fff7ed);
  border: 1px solid var(--p-orange-200, #fed7aa);
  color: var(--p-orange-700, #c2410c);
}

:deep(.cell-calculated:hover) {
  background: var(--p-orange-100, #ffedd5);
  border-color: var(--p-orange-300, #fdba74);
}

/* Type 16: REPORT_COLUMN - Report column */
:deep(.cell-report-col) {
  background: var(--p-cyan-50, #ecfeff);
  border: 1px solid var(--p-cyan-200, #a5f3fc);
  color: var(--p-cyan-700, #0e7490);
}

:deep(.cell-report-col:hover) {
  background: var(--p-cyan-100, #cffafe);
  border-color: var(--p-cyan-300, #67e8f9);
}

/* Type 17: PATH - File path */
:deep(.cell-path) {
  background: var(--p-stone-50, #fafaf9);
  border: 1px solid var(--p-stone-200, #e7e5e4);
  color: var(--p-stone-700, #44403c);
  font-family: monospace;
  font-size: 0.8rem;
}

:deep(.cell-path:hover) {
  background: var(--p-stone-100, #f5f5f4);
  border-color: var(--p-stone-300, #d6d3d1);
}

/* Type 17: PATH - Clickable link */
:deep(.cell-path-link) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  background: var(--p-blue-50, #eff6ff);
  border: 1px solid var(--p-blue-200, #bfdbfe);
  border-radius: 4px;
  color: var(--p-blue-700, #1d4ed8);
  font-family: monospace;
  font-size: 0.8rem;
  text-decoration: none;
  transition: all 0.15s ease;
}

:deep(.cell-path-link:hover) {
  background: var(--p-blue-100, #dbeafe);
  border-color: var(--p-blue-300, #93c5fd);
  color: var(--p-blue-800, #1e40af);
}

:deep(.cell-path-link i) {
  font-size: 0.75rem;
}

/* Type 10: FILE - Image preview */
:deep(.cell-file-preview) {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

:deep(.cell-file-thumbnail) {
  max-width: 60px;
  max-height: 40px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

:deep(.cell-file-preview:hover .cell-file-thumbnail) {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  border-color: var(--p-primary-300, #93c5fd);
}

:deep(.cell-file-fallback) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  background: var(--p-indigo-50, #eef2ff);
  border: 1px solid var(--p-indigo-200, #c7d2fe);
  border-radius: 4px;
  color: var(--p-indigo-700, #4338ca);
}

/* Image Preview Modal */
.image-preview-dialog :deep(.p-dialog-content) {
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--p-surface-900, #1e293b);
}

.image-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 300px;
  min-height: 200px;
  background: var(--p-surface-900, #1e293b);
}

.image-preview-img {
  max-width: 85vw;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 4px;
}

.image-preview-dialog :deep(.p-dialog-header) {
  background: var(--p-surface-800, #334155);
  color: var(--p-surface-0, #fff);
  border-bottom: 1px solid var(--p-surface-700, #475569);
}

.image-preview-dialog :deep(.p-dialog-header-close) {
  color: var(--p-surface-300, #cbd5e1);
}

.image-preview-dialog :deep(.p-dialog-header-close:hover) {
  background: var(--p-surface-700, #475569);
  color: var(--p-surface-0, #fff);
}

.image-preview-dialog :deep(.p-dialog-footer) {
  background: var(--p-surface-800, #334155);
  border-top: 1px solid var(--p-surface-700, #475569);
  padding: 0.75rem 1rem;
}

/* Date and DateTime styling - unified chip style */
:deep(.cell-date),
:deep(.cell-datetime) {
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-surface-200, #e2e8f0);
  color: var(--p-text-color);
}

:deep(.cell-date:hover),
:deep(.cell-datetime:hover) {
  background: var(--p-surface-100, #f1f5f9);
  border-color: var(--p-surface-300, #cbd5e1);
}

/* Date color states */
:deep(.cell-date.date-today),
:deep(.cell-datetime.date-today) {
  background: var(--p-green-50, #f0fdf4);
  border-color: var(--p-green-200, #bbf7d0);
  color: var(--p-green-700, #15803d);
}

:deep(.cell-date.date-today:hover),
:deep(.cell-datetime.date-today:hover) {
  background: var(--p-green-100, #dcfce7);
  border-color: var(--p-green-300, #86efac);
}

:deep(.cell-date.date-past),
:deep(.cell-datetime.date-past),
:deep(.cell-date.date-far-past),
:deep(.cell-datetime.date-far-past) {
  background: var(--p-surface-50, #f8fafc);
  border-color: var(--p-surface-200, #e2e8f0);
  color: var(--p-text-muted-color);
}

:deep(.cell-date.date-future),
:deep(.cell-datetime.date-future) {
  background: var(--p-blue-50, #eff6ff);
  border-color: var(--p-blue-200, #bfdbfe);
  color: var(--p-blue-700, #1d4ed8);
}

:deep(.cell-date.date-future:hover),
:deep(.cell-datetime.date-future:hover) {
  background: var(--p-blue-100, #dbeafe);
  border-color: var(--p-blue-300, #93c5fd);
}

:deep(.cell-date.date-far-future),
:deep(.cell-datetime.date-far-future) {
  background: var(--p-cyan-50, #ecfeff);
  border-color: var(--p-cyan-200, #a5f3fc);
  color: var(--p-cyan-700, #0e7490);
}

:deep(.cell-date.date-far-future:hover),
:deep(.cell-datetime.date-far-future:hover) {
  background: var(--p-cyan-100, #cffafe);
  border-color: var(--p-cyan-300, #67e8f9);
}

/* PrimeVue-style tooltip (JavaScript-controlled, position: fixed) */
.primevue-tooltip {
  position: fixed;
  padding: 8px 12px;
  background: var(--p-tooltip-background, var(--p-surface-900, #1e293b));
  color: var(--p-tooltip-color, var(--p-surface-0, white));
  font-size: 0.875rem;
  font-weight: normal;
  line-height: 1.4;
  border-radius: var(--p-tooltip-border-radius, 6px);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s ease;
  z-index: 10000;
  pointer-events: none;
}

.primevue-tooltip.tooltip-visible {
  opacity: 1;
  visibility: visible;
}

.primevue-tooltip .tooltip-arrow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--p-tooltip-background, var(--p-surface-900, #1e293b));
}

.primevue-tooltip .tooltip-text {
  display: block;
}

/* Date styling */
:deep(.date-dir) {
  display: inline-block;
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  border: 1px solid var(--p-surface-200);
  color: var(--p-text-color);
  padding: 3px 10px;
  border-radius: 12px;
  text-align: center;
  font-weight: normal;
  white-space: nowrap;
  transition: all 0.15s ease;
}

:deep(.date-dir:hover) {
  filter: brightness(0.97);
}

:deep(.date-dir.date-relative) {
  font-style: normal;
}

:deep(.date-dir.date-today) {
  background: linear-gradient(135deg, var(--p-green-50) 0%, var(--p-green-100) 100%);
  border-color: var(--p-green-200);
  color: var(--p-green-700);
}

:deep(.date-dir.date-past),
:deep(.date-dir.date-far-past) {
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  color: var(--p-text-muted-color);
}

:deep(.date-dir.date-future) {
  background: linear-gradient(135deg, var(--p-blue-50) 0%, var(--p-blue-100) 100%);
  border-color: var(--p-blue-200);
  color: var(--p-blue-700);
}

:deep(.date-dir.date-far-future) {
  background: linear-gradient(135deg, var(--p-cyan-50) 0%, var(--p-cyan-100) 100%);
  border-color: var(--p-cyan-200);
  color: var(--p-cyan-700);
}

.date-relative {
  font-style: italic;
  color: var(--text-color-secondary);
}

.date-relative.date-today {
  color: var(--green-600);
  font-weight: 500;
  font-style: normal;
}

.date-relative.date-past,
.date-relative.date-far-past {
  color: var(--text-color-secondary);
}

.date-relative.date-future {
  color: var(--blue-600);
}

.date-relative.date-far-future {
  color: var(--blue-500);
}

/* Date badge styles - consistent with multiselect tokens */
/* Using :deep() because these styles need to apply to v-html content */
:deep(.date-badge) {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  cursor: default;
  transition: filter 0.15s ease;
  /* Default: neutral gray like surface */
  background: var(--p-surface-200, #e2e8f0);
  color: var(--p-surface-700, #334155);
}

:deep(.date-badge:hover) {
  filter: brightness(0.95);
}

/* Today - green (same as multiselect green) */
:deep(.date-badge.date-today) {
  background: var(--p-green-100, #dcfce7);
  color: var(--p-green-700, #15803d);
}

/* Yesterday/Past - gray */
:deep(.date-badge.date-past) {
  background: var(--p-surface-200, #e2e8f0);
  color: var(--p-surface-600, #475569);
}

/* Tomorrow/Future - blue (same as multiselect blue) */
:deep(.date-badge.date-future) {
  background: var(--p-blue-100, #dbeafe);
  color: var(--p-blue-700, #1d4ed8);
}

/* Far past - muted gray */
:deep(.date-badge.date-far-past) {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--p-surface-500, #64748b);
}

/* Far future - cyan (same as multiselect cyan) */
:deep(.date-badge.date-far-future) {
  background: var(--p-cyan-100, #cffafe);
  color: var(--p-cyan-700, #0e7490);
}

/* ========================================
   NEW DATE STYLES - Modern & Beautiful
   ======================================== */

/* Style 1: PILL - Nested cell style */
:deep(.date-pill) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: normal;
  white-space: nowrap;
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  border: 1px solid var(--p-surface-200);
  color: var(--p-text-color);
  transition: all 0.2s ease;
}

:deep(.date-pill:hover) {
  background: linear-gradient(135deg, var(--p-primary-50) 0%, var(--p-primary-100) 100%);
  border-color: var(--p-primary-200);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.date-pill.date-today) {
  background: linear-gradient(135deg, var(--p-green-50) 0%, var(--p-green-100) 100%);
  border-color: var(--p-green-200);
  color: var(--p-green-700);
}

:deep(.date-pill.date-past) {
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  border-color: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

:deep(.date-pill.date-future) {
  background: linear-gradient(135deg, var(--p-blue-50) 0%, var(--p-blue-100) 100%);
  border-color: var(--p-blue-200);
  color: var(--p-blue-700);
}

:deep(.date-pill.date-far-past) {
  background: linear-gradient(135deg, var(--p-surface-50) 0%, var(--p-surface-100) 100%);
  border-color: var(--p-surface-200);
  color: var(--p-surface-500);
}

:deep(.date-pill.date-far-future) {
  background: linear-gradient(135deg, var(--p-cyan-50) 0%, var(--p-cyan-100) 100%);
  border-color: var(--p-cyan-200);
  color: var(--p-cyan-700);
}

/* Style 2: OUTLINE - Bordered, transparent background */
:deep(.date-outline) {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  background: transparent;
  border: 1.5px solid var(--p-surface-300, #cbd5e1);
  color: var(--p-surface-600, #475569);
  transition: all 0.2s ease;
}

:deep(.date-outline:hover) {
  background: var(--p-surface-50, #f8fafc);
}

:deep(.date-outline.date-today) {
  border-color: var(--p-green-400, #4ade80);
  color: var(--p-green-600, #16a34a);
  background: var(--p-green-50, #f0fdf4);
}

:deep(.date-outline.date-past) {
  border-color: var(--p-surface-300, #cbd5e1);
  color: var(--p-surface-500, #64748b);
}

:deep(.date-outline.date-future) {
  border-color: var(--p-blue-400, #60a5fa);
  color: var(--p-blue-600, #2563eb);
  background: var(--p-blue-50, #eff6ff);
}

:deep(.date-outline.date-far-past) {
  border-color: var(--p-surface-200, #e2e8f0);
  color: var(--p-surface-400, #94a3b8);
}

:deep(.date-outline.date-far-future) {
  border-color: var(--p-cyan-400, #22d3ee);
  color: var(--p-cyan-600, #0891b2);
  background: var(--p-cyan-50, #ecfeff);
}

/* Style 3: TAG - PrimeVue tag style with icon */
:deep(.date-tag) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: var(--p-surface-200, #e2e8f0);
  color: var(--p-surface-700, #334155);
  transition: all 0.15s ease;
}

:deep(.date-tag i) {
  font-size: 11px;
  opacity: 0.8;
}

:deep(.date-tag:hover) {
  filter: brightness(0.95);
}

:deep(.date-tag.date-today) {
  background: var(--p-green-500, #22c55e);
  color: white;
}

:deep(.date-tag.date-past) {
  background: var(--p-surface-300, #cbd5e1);
  color: var(--p-surface-700, #334155);
}

:deep(.date-tag.date-future) {
  background: var(--p-blue-500, #3b82f6);
  color: white;
}

:deep(.date-tag.date-far-past) {
  background: var(--p-surface-200, #e2e8f0);
  color: var(--p-surface-500, #64748b);
}

:deep(.date-tag.date-far-future) {
  background: var(--p-indigo-500, #6366f1);
  color: white;
}

/* Style 4: CALENDAR - Mini calendar card */
:deep(.date-calendar) {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  min-width: 44px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  background: white;
  border: 1px solid var(--p-surface-200, #e2e8f0);
  transition: all 0.2s ease;
}

:deep(.date-calendar:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

:deep(.date-calendar-month) {
  width: 100%;
  padding: 2px 8px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: center;
  background: var(--p-surface-600, #475569);
  color: white;
}

:deep(.date-calendar-day) {
  padding: 2px 8px 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--p-surface-800, #1e293b);
}

:deep(.date-calendar-time) {
  padding: 0 8px 3px;
  font-size: 9px;
  color: var(--p-surface-500, #64748b);
  border-top: 1px solid var(--p-surface-100, #f1f5f9);
  width: 100%;
  text-align: center;
}

:deep(.date-calendar.date-today .date-calendar-month) {
  background: var(--p-green-600, #16a34a);
}

:deep(.date-calendar.date-today .date-calendar-day) {
  color: var(--p-green-700, #15803d);
}

:deep(.date-calendar.date-future .date-calendar-month) {
  background: var(--p-blue-600, #2563eb);
}

:deep(.date-calendar.date-future .date-calendar-day) {
  color: var(--p-blue-700, #1d4ed8);
}

:deep(.date-calendar.date-far-future .date-calendar-month) {
  background: var(--p-purple-600, #9333ea);
}

:deep(.date-calendar.date-far-future .date-calendar-day) {
  color: var(--p-purple-700, #7e22ce);
}

:deep(.date-calendar.date-past .date-calendar-month),
:deep(.date-calendar.date-far-past .date-calendar-month) {
  background: var(--p-surface-400, #94a3b8);
}

:deep(.date-calendar.date-far-past .date-calendar-day) {
  color: var(--p-surface-400, #94a3b8);
}

/* Style 5: MODERN - Glassmorphism effect */
:deep(.date-modern) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: var(--p-surface-700, #334155);
  transition: all 0.25s ease;
}

:deep(.date-modern:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

:deep(.date-modern-icon) {
  font-size: 14px;
}

:deep(.date-modern-text) {
  font-weight: 500;
}

:deep(.date-modern.date-today) {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.3);
  color: var(--p-green-700, #15803d);
}

:deep(.date-modern.date-past) {
  background: rgba(148, 163, 184, 0.15);
  border-color: rgba(148, 163, 184, 0.3);
  color: var(--p-surface-600, #475569);
}

:deep(.date-modern.date-future) {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--p-blue-700, #1d4ed8);
}

:deep(.date-modern.date-far-past) {
  background: rgba(226, 232, 240, 0.5);
  border-color: rgba(226, 232, 240, 0.5);
  color: var(--p-surface-500, #64748b);
}

:deep(.date-modern.date-far-future) {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
  color: var(--p-violet-700, #6d28d9);
}

/* Style 6: MINIMAL - Clean text with accent */
:deep(.date-minimal) {
  display: inline-flex;
  align-items: center;
  padding: 2px 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--p-surface-600, #475569);
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

:deep(.date-minimal:hover) {
  color: var(--p-surface-800, #1e293b);
}

:deep(.date-minimal.date-today) {
  color: var(--p-green-600, #16a34a);
  border-bottom-color: var(--p-green-400, #4ade80);
}

:deep(.date-minimal.date-past) {
  color: var(--p-surface-500, #64748b);
  border-bottom-color: var(--p-surface-300, #cbd5e1);
}

:deep(.date-minimal.date-future) {
  color: var(--p-blue-600, #2563eb);
  border-bottom-color: var(--p-blue-400, #60a5fa);
}

:deep(.date-minimal.date-far-past) {
  color: var(--p-surface-400, #94a3b8);
  border-bottom-color: transparent;
}

:deep(.date-minimal.date-far-future) {
  color: var(--p-purple-600, #9333ea);
  border-bottom-color: var(--p-purple-400, #c084fc);
}

/* Dark mode support for new date styles */
:deep(.p-datatable-dark .date-pill),
.dark :deep(.date-pill) {
  background: var(--p-surface-800, #1e293b);
  color: var(--p-surface-200, #e2e8f0);
}

:deep(.p-datatable-dark .date-calendar),
.dark :deep(.date-calendar) {
  background: var(--p-surface-800, #1e293b);
  border-color: var(--p-surface-700, #334155);
}

:deep(.p-datatable-dark .date-calendar-day),
.dark :deep(.date-calendar-day) {
  color: var(--p-surface-100, #f1f5f9);
}

:deep(.p-datatable-dark .date-modern),
.dark :deep(.date-modern) {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(51, 65, 85, 0.5);
  color: var(--p-surface-200, #e2e8f0);
}

/* GRANT dropdown styling */
.grant-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.grant-option-system {
  font-weight: 600;
  border-left: 3px solid var(--p-red-500, #ef4444);
  padding-left: 8px;
}

.grant-option-icon {
  font-size: 14px;
  color: var(--p-primary-color, var(--primary-color));
  flex-shrink: 0;
}

.grant-option-label {
  flex: 1;
  font-size: 13px;
}

.grant-option-badge {
  margin-left: auto;
  font-size: 10px;
  padding: 2px 6px;
}

.grant-value {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.grant-value-icon {
  font-size: 12px;
  color: var(--p-primary-color, var(--primary-color));
}

.grant-placeholder {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 13px;
}
</style>