<template>
  <div class="integram-enhanced-editor integram-touch-friendly">
    <!--
      Integram Enhanced Object Editor
      ================================
      Comprehensive form-based editor for Integram objects with support for all field types.

      Supported Field Types:
      - SHORT: Short text (up to 255 chars)
      - CHARS: Long text
      - MEMO: Multi-line text
      - HTML: Rich text with WYSIWYG editor
      - DATE: Date picker with mobile-friendly text mode
      - DATETIME: Date and time picker
      - NUMBER: Decimal number input
      - SIGNED: Integer input
      - BOOLEAN: Checkbox
      - FILE: File upload/download with delete
      - PWD: Password with generator
      - REFERENCE: Searchable dropdown with create support
      - ARRAY: Link to subordinate table
      - CALCULATABLE: Read-only computed field
      - BUTTON: Action button
      - PATH: File path
      - REPORT_COLUMN: Report column selector

      Features:
      - Tab support for organized fields
      - Required field validation
      - Dependent/restricted selects
      - Multiselect references
      - Grid/List view toggle
      - Copy ID to clipboard
      - Duplicate object
      - Delete with confirmation
      - Breadcrumb navigation
    -->

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-5">
      <ProgressSpinner />
    </div>

    <!-- Editor -->
    <Card v-else-if="objectData">
      <template #title>
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <span>{{ objectData.val }}</span>
            <Badge :value="objectData.typ_name" severity="secondary" class="text-xs" />
            <span class="text-500 text-sm cursor-pointer" @click="copyId(objectData.id)" v-tooltip.right="'Копировать ID'">
              #{{ objectData.id }}
            </span>
          </div>
          <div class="flex gap-2 align-items-center ml-auto">
            <Button
              :icon="gridMode ? 'pi pi-list' : 'pi pi-th-large'"
              @click="toggleGridMode"
              size="small"
              rounded
              :outlined="!gridMode"
              :severity="gridMode ? 'primary' : 'secondary'"
              v-tooltip.bottom="gridMode ? 'Список' : 'Сетка'"
            />
          </div>
        </div>
      </template>

      <template #content>
        <!-- User Guide Message - компактная версия -->
        <Message severity="secondary" :closable="true" class="mb-3 text-sm">
          Обязательные поля отмечены <span class="text-red-500 font-bold">*</span>
        </Message>

        <!-- Tabs (if configured) -->
        <TabView v-if="tabs.length > 0" v-model:activeIndex="activeTab">
          <TabPanel v-for="tab in tabs" :key="tab.id" :header="tab.name">
            <div class="grid gap-3" :class="{ 'grid-list-mode': gridMode }">
              <div
                v-for="req in getRequisitesForTab(tab.id)"
                :key="req.id"
                :class="gridMode ? 'col-12' : getFieldClass(req)"
              >
                <div class="integram-field">
                  <label :for="`req_${req.id}`" class="block mb-2">
                    <span v-if="req.required" class="text-red-500 mr-1">*</span>
                    {{ req.name }}
                  </label>

                  <!-- Reference Field with Search -->
                  <div v-if="req.isReference">
                    <ReferenceField
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :req-id="req.id"
                      :ref-type-id="req.refTypeId"
                      :database="database"
                      :object-id="objectData.id"
                      :multi="req.multi"
                      :allow-create="req.allowCreate"
                      :restrict="req.restrict"
                      :current-display-name="req.currentDisplayName"
                      :initial-multiselect-items="req.multiselectItems"
                      @update:modelValue="onReferenceChange(req.id, $event)"
                    />
                  </div>

                  <!-- Array/Subordinate Link -->
                  <div v-else-if="req.isArray">
                    <div class="flex gap-2 align-items-center">
                      <router-link
                        v-if="req.refTypeId"
                        :to="`/integram/${database}/object/${req.refTypeId}?F_U=${objectData.id}`"
                        class="text-primary font-semibold"
                      >
                        <Badge :value="req.count || 0" /> Перейти к списку
                      </router-link>
                      <Button
                        v-if="req.refTypeId"
                        icon="pi pi-plus"
                        label="Добавить"
                        @click="addSubordinateItem(req)"
                        size="small"
                        outlined
                        v-tooltip.top="'Добавить запись в подчиненную таблицу'"
                      />
                    </div>
                    <InputText
                      v-if="req.showValue"
                      v-model="formData[`t${req.id}`]"
                      class="w-full mt-2"
                    />
                  </div>

                  <!-- File Upload -->
                  <div v-else-if="req.baseType === 'FILE'">
                    <FileField
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :current-file="req.currentFile"
                      :object-id="objectData.id"
                      :req-id="req.id"
                      :database="database"
                      @delete="deleteFile(req.id)"
                    />
                  </div>

                  <!-- Date Field with Mode Switcher -->
                  <div v-else-if="req.baseType === 'DATE'">
                    <DateField
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :mode="dateMode[req.id] || 'calendar'"
                      @toggle-mode="toggleDateMode(req.id)"
                    />
                  </div>

                  <!-- DateTime Field -->
                  <div v-else-if="req.baseType === 'DATETIME'">
                    <DateTimeField
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                    />
                  </div>

                  <!-- Password with Generator -->
                  <div v-else-if="req.baseType === 'PWD'">
                    <PasswordField
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :show-generator="true"
                      @generate="generatePassword(req.id)"
                      @copy-invite="copyInvite"
                    />
                  </div>

                  <!-- Boolean -->
                  <div v-else-if="req.baseType === 'BOOLEAN'">
                    <Checkbox
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :binary="true"
                    />
                    <input type="hidden" :name="`b${req.id}`" value="1" />
                  </div>

                  <!-- HTML Editor -->
                  <div v-else-if="req.baseType === 'HTML'">
                    <Editor
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      editorStyle="height: 200px"
                    />
                  </div>

                  <!-- Memo/Textarea -->
                  <div v-else-if="req.baseType === 'MEMO'">
                    <Textarea
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      rows="5"
                      class="w-full"
                    />
                  </div>

                  <!-- Short Text -->
                  <div v-else-if="req.baseType === 'SHORT'">
                    <InputText
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      class="w-full"
                    />
                  </div>

                  <!-- Number Types -->
                  <div v-else-if="['NUMBER', 'SIGNED'].includes(req.baseType)">
                    <InputNumber
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      :min-fraction-digits="req.baseType === 'NUMBER' ? 2 : 0"
                      :max-fraction-digits="req.baseType === 'NUMBER' ? 2 : 0"
                      class="w-full"
                    />
                  </div>

                  <!-- Calculatable (Read-only) -->
                  <div v-else-if="req.baseType === 'CALCULATABLE'">
                    <div class="p-3 surface-100 border-round">
                      {{ formData[`t${req.id}`] }}
                    </div>
                  </div>

                  <!-- Default: Text Input -->
                  <div v-else>
                    <InputText
                      :id="`req_${req.id}`"
                      v-model="formData[`t${req.id}`]"
                      class="w-full"
                    />
                  </div>

                  <small v-if="req.hint" class="block mt-1 text-500">
                    {{ req.hint }}
                  </small>
                </div>
              </div>
            </div>
          </TabPanel>
        </TabView>

        <!-- No Tabs: Single Form -->
        <div v-else class="grid gap-3" :class="{ 'grid-list-mode': gridMode }">
          <div
            v-for="req in requisites"
            :key="req.id"
            :class="gridMode ? 'col-12' : getFieldClass(req)"
          >
            <div class="integram-field">
              <label :for="`req_${req.id}`" class="block mb-2">
                <span v-if="req.required" class="text-red-500 mr-1">*</span>
                {{ req.name }}
              </label>

              <!-- Reference Field with Search -->
              <div v-if="req.isReference">
                <ReferenceField
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :req-id="req.id"
                  :ref-type-id="req.refTypeId"
                  :database="database"
                  :object-id="objectData.id"
                  :multi="req.multi"
                  :allow-create="req.allowCreate"
                  :restrict="req.restrict"
                  :current-display-name="req.currentDisplayName"
                  :initial-multiselect-items="req.multiselectItems"
                  @update:modelValue="onReferenceChange(req.id, $event)"
                />
              </div>

              <!-- Array/Subordinate Link -->
              <div v-else-if="req.isArray">
                <div class="flex gap-2 align-items-center">
                  <router-link
                    v-if="req.refTypeId"
                    :to="`/integram/${database}/object/${req.refTypeId}?F_U=${objectData.id}`"
                    class="text-primary font-semibold"
                  >
                    <Badge :value="req.count || 0" /> Перейти к списку
                  </router-link>
                  <div v-else class="text-500">
                    <Badge :value="req.count || 0" /> Подчиненная таблица (тип не определен)
                  </div>
                  <Button
                    v-if="req.refTypeId"
                    icon="pi pi-plus"
                    label="Добавить"
                    @click="addSubordinateItem(req)"
                    size="small"
                    outlined
                    v-tooltip.top="'Добавить запись в подчиненную таблицу'"
                  />
                </div>
                <InputText
                  v-if="req.showValue"
                  v-model="formData[`t${req.id}`]"
                  class="w-full mt-2"
                />
              </div>

              <!-- File Upload -->
              <div v-else-if="req.baseType === 'FILE'">
                <FileField
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :current-file="req.currentFile"
                  :object-id="objectData.id"
                  :req-id="req.id"
                  :database="database"
                  @delete="deleteFile(req.id)"
                />
              </div>

              <!-- Date Field with Mode Switcher -->
              <div v-else-if="req.baseType === 'DATE'">
                <DateField
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :mode="dateMode[req.id] || 'calendar'"
                  @toggle-mode="toggleDateMode(req.id)"
                />
              </div>

              <!-- DateTime Field -->
              <div v-else-if="req.baseType === 'DATETIME'">
                <DateTimeField
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                />
              </div>

              <!-- Password with Generator -->
              <div v-else-if="req.baseType === 'PWD'">
                <PasswordField
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :show-generator="true"
                  @generate="generatePassword(req.id)"
                  @copy-invite="copyInvite"
                />
              </div>

              <!-- Boolean -->
              <div v-else-if="req.baseType === 'BOOLEAN'">
                <Checkbox
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :binary="true"
                />
                <input type="hidden" :name="`b${req.id}`" value="1" />
              </div>

              <!-- HTML Editor -->
              <div v-else-if="req.baseType === 'HTML'">
                <Editor
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  editorStyle="height: 200px"
                />
              </div>

              <!-- Memo/Textarea -->
              <div v-else-if="req.baseType === 'MEMO'">
                <Textarea
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  rows="5"
                  class="w-full"
                />
              </div>

              <!-- Short Text -->
              <div v-else-if="req.baseType === 'SHORT'">
                <InputText
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  class="w-full"
                />
              </div>

              <!-- Chars (Long Text) -->
              <div v-else-if="req.baseType === 'CHARS'">
                <InputText
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  class="w-full"
                />
              </div>

              <!-- Number Types -->
              <div v-else-if="['NUMBER', 'SIGNED'].includes(req.baseType)">
                <InputNumber
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  :min-fraction-digits="req.baseType === 'NUMBER' ? 2 : 0"
                  :max-fraction-digits="req.baseType === 'NUMBER' ? 2 : 0"
                  class="w-full"
                />
              </div>

              <!-- Calculatable (Read-only) -->
              <div v-else-if="req.baseType === 'CALCULATABLE'">
                <div class="p-3 surface-100 border-round">
                  {{ formData[`t${req.id}`] }}
                </div>
              </div>

              <!-- Default: Text Input -->
              <div v-else>
                <InputText
                  :id="`req_${req.id}`"
                  v-model="formData[`t${req.id}`]"
                  class="w-full"
                />
              </div>

              <small v-if="req.hint" class="block mt-1 text-500">
                {{ req.hint }}
              </small>
            </div>
          </div>
        </div>

        <!-- Custom Buttons (from metadata) -->
        <div v-if="customButtons.length > 0" class="mt-4 flex gap-2">
          <Button
            v-for="btn in customButtons"
            :key="btn.id"
            :label="btn.label"
            :class="btn.class"
            @click="executeButtonAction(btn)"
          />
        </div>

        <!-- Actions - кнопки с правильными размерами для touch -->
        <div class="mt-4 integram-actions">
          <Button
            label="Сохранить"
            icon="pi pi-save"
            @click="saveObject"
            :loading="saving"
            severity="primary"
          />
          <Button
            label="Дублировать"
            icon="pi pi-copy"
            @click="duplicateObject"
            outlined
          />
          <Button
            label="Отмена"
            icon="pi pi-times"
            @click="cancel"
            outlined
          />
          <!-- Кнопка удаления визуально отделена (margin-left: auto в CSS) -->
          <Button
            v-if="!confirmDelete"
            label="Удалить"
            icon="pi pi-trash"
            @click="confirmDelete = true"
            severity="danger"
            outlined
            v-tooltip.top="'Удалить запись'"
          />
        </div>

        <!-- Delete Confirmation -->
        <div v-if="confirmDelete" class="mt-3 p-3 surface-border border-1 border-round">
          <p class="font-semibold mb-3">
            Подтвердите удаление записи: {{ objectData.val }}
          </p>
          <div class="flex gap-2">
            <Button
              label="Да, удалить"
              icon="pi pi-trash"
              @click="deleteObject"
              :loading="deleting"
              severity="danger"
            />
            <Button
              label="Отмена"
              @click="confirmDelete = false"
              outlined
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import integramService from '@/services/integramService'
import integramApiClient from '@/services/integramApiClient'

// Import PrimeVue components

// Import custom field components
import ReferenceField from './fields/ReferenceField.vue'
import FileField from './fields/FileField.vue'
import DateField from './fields/DateField.vue'
import DateTimeField from './fields/DateTimeField.vue'
import PasswordField from './fields/PasswordField.vue'

const props = defineProps({
  database: {
    type: String,
    required: true
  },
  objectId: {
    type: [String, Number],
    required: true
  }
})

const emit = defineEmits(['objectLoaded'])

const route = useRoute()
const router = useRouter()
const toast = useToast()

// State
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)

const objectData = ref(null)
const parentType = ref(null)
const metadata = ref(null)
const requisites = ref([])
const tabs = ref([])
const customButtons = ref([])

const formData = ref({})
const dateMode = ref({}) // calendar or text mode per date field
const gridMode = ref(false)
const activeTab = ref(0)
const confirmDelete = ref(false)
const idCopied = ref(false)

const hasArrayFields = computed(() => {
  return requisites.value.some(r => r.isArray)
})

// Methods
async function loadObject() {
  try {
    loading.value = true

    // Initialize integramService session from integramApiClient if available
    const authInfo = integramApiClient.getAuthInfo()
    if (authInfo && authInfo.token) {
      // Sync session from integramApiClient to integramService
      integramService.setSession({
        token: authInfo.token,
        xsrf: authInfo.xsrf,
        database: props.database
      })
    }

    integramService.setDatabase(props.database)

    // Load object data
    const response = await integramService.getEditObject(props.objectId, route.query.tab)

    // Parse object - validate response
    if (!response || !response.obj) {
      throw new Error(`Объект #${props.objectId} не найден или ответ пустой`)
    }

    objectData.value = response.obj
    metadata.value = response.metadata

    // Load metadata for detailed requisite info
    if (!objectData.value.typ) {
      throw new Error(`Объект #${props.objectId} не содержит тип (typ)`)
    }

    const metaData = await integramService.getMetadata(objectData.value.typ)

    // Extract arr_type mapping from response if available
    // The API response includes arr_type: {"reqId": "subordinateTypeId", ...}
    // This maps requisite IDs to their subordinate table type IDs
    const arrTypeMapping = response.arr_type || {}

    if (metaData && metaData.reqs) {
      // First pass: parse all requisites
      const requisitesData = metaData.reqs.map(req => {
        // Detect field type based on Integram type codes:
        // Type '4' = ARRAY (subordinate table)
        // Type with req.ref = REFERENCE (foreign key to another table)
        // IMPORTANT: Check isArray FIRST, because ARRAY fields might also have req.ref
        const isArray = req.type === '4' // Array type
        const isReference = !isArray && (req.ref !== undefined)

        // Get current value and parse it properly
        let currentValue = null
        let currentFile = null
        let currentDisplayName = null // For REF fields, store the display name
        let multiselectItems = [] // For MULTI REF fields, store array with msId
        const rawValue = response.reqs ? response.reqs[req.id] : undefined

        // Detect if this is a multiselect field
        const isMulti = req.attrs && req.attrs.includes(':MULTI:')

        if (rawValue !== undefined) {
          // CRITICAL: Check if this is an array FIRST (for multiselect data)
          // This must be checked before the object property checks below
          if (Array.isArray(rawValue)) {
            // For multiselect, the array contains objects with structure:
            // [{id: msItemId, ref: refObjectId, ord: order, val: displayName}, ...]
            // where 'id' is the multiselect item ID (for deletion)
            // and 'ref' is the referenced object ID
            if (isMulti) {
              multiselectItems = rawValue.map(item => ({
                id: item.ref || item.id, // Referenced object ID
                text: item.val || item.name || String(item.ref || item.id),
                msId: item.id, // Multiselect item ID (for deletion)
                ord: item.ord || 0
              }))
              // Extract just the IDs for currentValue
              currentValue = multiselectItems.map(item => item.id)
            } else {
              currentValue = rawValue
            }
          }
          // Handle multiselect data in OBJECT format with parallel arrays (Issue #3459)
          // API format: {id: [...], val: [...], ord: [...], ref_val: [...]}
          // where id[i] = multiselect item ID (for deletion)
          //       val[i] = referenced object ID (for colors and display)
          //       ref_val[i] = display name
          else if (isMulti && isReference && rawValue !== null && typeof rawValue === 'object' && 'multiselect' in rawValue) {
            const ms = rawValue.multiselect

            // Validate multiselect structure
            if (ms && ms.id && Array.isArray(ms.id) && ms.val && Array.isArray(ms.val) && ms.ref_val && Array.isArray(ms.ref_val)) {
              // Convert parallel arrays to array of objects
              multiselectItems = ms.id.map((msId, index) => ({
                id: ms.val[index], // Referenced object ID (for color calculation)
                text: ms.ref_val[index] || `#${ms.val[index]}`, // Display name
                msId: msId, // Multiselect item ID (for deletion)
                ord: ms.ord ? ms.ord[index] : index + 1
              }))

              // Extract just the referenced object IDs for currentValue
              currentValue = multiselectItems.map(item => item.id)
            } else {
              if (import.meta.env.DEV) {
                console.warn(`[IntegramEnhancedObjectEditor] Invalid multiselect structure for req ${req.id}:`, rawValue)
              }
              currentValue = null
            }
          }
          // Handle multiselect data in string format (for backwards compatibility)
          // Format: ref_{reqId} = "typeId:id1,id2,id3", {reqId} = "Name1,Name2,Name3"
          else if (isMulti && isReference && typeof rawValue === 'string' && rawValue.length > 0) {
            const refField = response.reqs ? response.reqs[`ref_${req.id}`] : undefined

            if (refField && typeof refField === 'string') {
              // Parse ref field format: "typeId:id1,id2,id3"
              const refMatch = refField.match(/^(\d+):(.+)$/)

              if (refMatch) {
                const refTypeId = refMatch[1]
                const refIds = refMatch[2].split(',')
                const displayNames = rawValue.split(',')

                // Build array of multiselect items
                multiselectItems = refIds.map((refId, index) => ({
                  id: refId.trim(), // Referenced object ID
                  text: displayNames[index] ? displayNames[index].trim() : `#${refId.trim()}`,
                  msId: null, // Not available in this format
                  ord: index + 1
                }))

                // Extract just the IDs for currentValue
                currentValue = multiselectItems.map(item => item.id)
              } else {
                // Fallback: just use the display text
                currentValue = rawValue
                if (import.meta.env.DEV) {
                  console.warn(`[IntegramEnhancedObjectEditor] Could not parse ref field format for req ${req.id}:`, refField)
                }
              }
            } else {
              // No ref field, just use the raw value
              currentValue = rawValue
              if (import.meta.env.DEV) {
                console.warn(`[IntegramEnhancedObjectEditor] Multiselect req ${req.id} has string value but no ref_ field:`, rawValue)
              }
            }
          }
          else if (rawValue !== null && typeof rawValue === 'object') {
            // Parse object values based on Integram API format
            // The API returns: {"type":"...", "order":"...", "value":"actual_value", "base":"...", "arr":"...", "arr_type":...}

            // Check for 'value' property first (Integram API standard format)
            if ('value' in rawValue) {
              currentValue = rawValue.value
            }
            // For REF fields, check for both 'id' and 'val' properties
            // Format: {id: 123, val: "Display Name"}
            else if ('id' in rawValue && 'val' in rawValue) {
              currentValue = rawValue.id
              currentDisplayName = rawValue.val

            }
            // Then check for 'val' property (alternative format for references)
            else if ('val' in rawValue) {
              currentValue = rawValue.val
            }
            // Then check for 'id' property (references)
            else if ('id' in rawValue) {
              currentValue = rawValue.id
            }
            // Fallback to the whole object
            else {
              currentValue = rawValue
            }

            // Check for file metadata
            if (rawValue.file) {
              currentFile = rawValue.file
            }
          } else {
            // Primitive value - use as is
            currentValue = rawValue
          }
        }

        // Determine refTypeId based on field type:
        // - For ARRAY fields: Use arr_type mapping first, then fallback to req.arr or req.arr_id
        //   The subordinate objects are of this type and filtered by F_U (parent ID)
        // - For REFERENCE fields: Use req.ref which points to the referenced type
        //
        // IMPORTANT: For ARRAY fields in Integram:
        //   - The ARRAY field itself has an ID (req.id) - this is the requisite ID
        //   - The subordinate table type is in arrTypeMapping[req.id] or req.arr or req.arr_id
        //   - Navigation: /object/{subordinateTypeId}?F_U={parent_object_id}
        //   - This is different from REF fields where req.ref points to another type
        //
        // FIX for issue #3341: Use arr_type mapping from API response
        let refTypeId = null
        if (isArray) {
          // For ARRAY fields: Check arr_type mapping first, then fallbacks
          refTypeId = arrTypeMapping[req.id] || req.arr || req.arr_id || req.ref || null
        } else {
          // For REFERENCE fields: Use req.ref
          refTypeId = req.ref || null
        }

        // Debug log for ARRAY and REF fields
        if (isArray || isReference) {
          // console.log(`[IntegramEnhancedObjectEditor] Field ${req.id} (${req.val}):`, {
          //   isArray,
          //   isReference,
          //   'req.id': req.id,
          //   'req.arr': req.arr,
          //   'req.arr_id': req.arr_id,
          //   'req.ref': req.ref,
          //   'req.type': req.type,
          //   refTypeId,
          //   rawValue
          // })
        }

        const requisiteData = {
          id: req.id,
          name: req.val,
          baseType: getBaseType(req.type),
          required: req.attrs && req.attrs.includes(':!NULL:'),
          multi: req.attrs && req.attrs.includes(':MULTI:'),
          isReference,
          isArray,
          refTypeId,
          restrict: req.ref_restrict,
          allowCreate: req.attrs && req.attrs.includes(':!CREATE:'),
          currentValue,
          currentDisplayName,
          currentFile,
          multiselectItems, // Array of {id, text, msId} for multiselect fields
          count: response.arrCounts ? response.arrCounts[req.id] : 0,
          hint: getHintFromAttrs(req.attrs),
          tabId: req.tab || null
        }

        // Multiselect fields initialization complete

        return requisiteData
      })

      // Second pass: for REF fields with string/number currentValue but no displayName,
      // fetch the display name from the API
      for (const req of requisitesData) {
        if (req.isReference && req.currentValue && !req.currentDisplayName && !req.isArray) {
          try {
            // Fetch reference options to get the display name
            const options = await integramService.getReferenceOptions(
              req.id, // Use requisite ID (not ref type ID) for API call
              props.objectId,
              req.restrict,
              '' // Empty query to get all/initial options
            )

            // Find the display name for the current value
            if (options && options[req.currentValue]) {
              req.currentDisplayName = options[req.currentValue].toString()
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn(`Failed to load display name for REF field ${req.id}:`, error)
            }
            // Continue without display name - ReferenceField will handle it
          }
        }
      }

      requisites.value = requisitesData
    }

    // Initialize form data
    if (response.reqs) {
      for (const [reqId, value] of Object.entries(response.reqs)) {
        // Parse value properly - handle objects, arrays, and primitives
        // The API returns: {"type":"...", "order":"...", "value":"actual_value", "base":"...", "arr":"...", "arr_type":...}

        // CRITICAL: Check if this is an array FIRST (before checking object properties)
        // Arrays are also objects in JavaScript, so this check must come first
        if (Array.isArray(value)) {
          // For multiselect, extract the referenced object IDs (not the multiselect item IDs)
          // The array structure is: [{id: msItemId, ref: refObjectId, val: displayName}, ...]
          formData.value[`t${reqId}`] = value.map(v => {
            if (typeof v === 'object' && v !== null) {
              // Extract based on priority: ref (for multiselect), id, value
              return v.ref || ('value' in v ? v.value : ('id' in v && 'val' in v ? v.id : ('val' in v ? v.val : ('id' in v ? v.id : JSON.stringify(v)))))
            }
            return v
          })

        }
        else if (value !== null && typeof value === 'object') {
          // Handle multiselect in OBJECT format (Issue #3459)
          // Format: {multiselect: {id: [...], val: [...], ref_val: [...]}, ...}
          if ('multiselect' in value && value.multiselect && value.multiselect.val && Array.isArray(value.multiselect.val)) {
            // Extract referenced object IDs (not multiselect item IDs)
            formData.value[`t${reqId}`] = value.multiselect.val
          }
          // Check for 'value' property first (Integram API standard format)
          else if ('value' in value) {
            formData.value[`t${reqId}`] = value.value
          }
          // For REF fields with both 'id' and 'val', use the ID (val is the display name)
          // Format: {id: 123, val: "Display Name"}
          else if ('id' in value && 'val' in value) {
            // Use the ID for the form data (this is what gets saved)
            formData.value[`t${reqId}`] = value.id
          }
          // If it's an object with 'val' property only (alternative format), use that
          else if ('val' in value) {
            formData.value[`t${reqId}`] = value.val
          }
          // If it's an object with 'id' property only (reference), use the ID
          else if ('id' in value) {
            formData.value[`t${reqId}`] = value.id
          }
          // Otherwise, log warning and use empty string
          else {
            if (import.meta.env.DEV) {
              console.warn(`Unknown value format for requisite ${reqId}:`, value)
            }
            formData.value[`t${reqId}`] = ''
          }
        } else {
          // Primitive value - use as is
          formData.value[`t${reqId}`] = value
        }
      }
    }

    // Load tabs if any
    if (response.tabs) {
      tabs.value = response.tabs
    }

    // Load custom buttons
    if (response.buttons) {
      customButtons.value = response.buttons
    }

    // Load parent type
    if (objectData.value.up && objectData.value.up !== '0') {
      try {
        parentType.value = await integramService.getMetadata(objectData.value.up)
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Could not load parent type:', err)
        }
      }
    }

    // Emit object data to parent for breadcrumb
    emit('objectLoaded', {
      objectData: objectData.value,
      parentType: parentType.value,
      typeName: objectData.value?.typ_name
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: error.message,
      life: 5000
    })
  } finally {
    loading.value = false
  }
}

function getBaseType(typeCode) {
  const types = {
    '3': 'SHORT',
    '8': 'CHARS',
    '9': 'DATE',
    '4': 'DATETIME',
    '13': 'SIGNED',
    '14': 'NUMBER',
    '11': 'BOOLEAN',
    '12': 'MEMO',
    '10': 'FILE',
    '15': 'HTML',
    '6': 'PWD',
    '16': 'CALCULATABLE',
    '17': 'BUTTON',
    '18': 'PATH',
    '19': 'REPORT_COLUMN'
  }
  return types[typeCode] || 'SHORT'
}

function getHintFromAttrs(attrs) {
  if (!attrs) return ''

  // Extract default value hint
  if (attrs.includes('[TODAY]')) return 'По умолчанию: сегодня'
  if (attrs.includes('[NOW]')) return 'По умолчанию: текущее время'

  return ''
}

function getRequisitesForTab(tabId) {
  return requisites.value.filter(r => r.tabId === tabId)
}

function getFieldClass(req) {
  if (gridMode.value) return 'col-12'

  // Responsive column classes based on field type
  // Using wider columns for better readability and touch targets
  if (req.baseType === 'MEMO' || req.baseType === 'HTML') {
    return 'col-12'
  }

  if (req.baseType === 'FILE') {
    return 'col-12 md:col-8 lg:col-6'
  }

  if (['DATE', 'DATETIME'].includes(req.baseType)) {
    return 'col-12 md:col-6 lg:col-4'
  }

  if (['SIGNED', 'NUMBER'].includes(req.baseType)) {
    return 'col-12 md:col-6 lg:col-4'
  }

  if (req.baseType === 'BOOLEAN') {
    return 'col-12 md:col-6 lg:col-4'
  }

  if (req.baseType === 'SHORT' || req.baseType === 'CHARS') {
    return 'col-12 md:col-6'
  }

  // References get more space for dropdown
  if (req.isReference) {
    return 'col-12 md:col-6'
  }

  return 'col-12'
}

async function onReferenceChange(reqId, value) {
  // Handle dependent selects (fields that have restriction based on this field)
  // Find all fields that are restricted by this field
  const dependentFields = requisites.value.filter(r => r.restrict === reqId)

  if (dependentFields.length > 0) {

    for (const dependent of dependentFields) {
      // Clear dependent field value
      formData.value[`t${dependent.id}`] = null

      // Emit a custom event that the ReferenceField component can listen to
      // This will trigger the dependent field to reload its options based on the new restriction value
      // The ReferenceField component will handle this via the restrict prop changing
    }
  }
}

function toggleGridMode() {
  gridMode.value = !gridMode.value
  // Save to cookie
  document.cookie = `gridMode${objectData.value.typ}=${gridMode.value ? '1' : '0'}; path=/`
  // Visual feedback
  toast.add({
    severity: 'info',
    summary: gridMode.value ? 'Режим: Список' : 'Режим: Сетка',
    detail: gridMode.value ? 'Все поля в один столбец' : 'Адаптивная сетка полей',
    life: 2000
  })
}

function toggleDateMode(reqId) {
  dateMode.value[reqId] = dateMode.value[reqId] === 'text' ? 'calendar' : 'text'
}

function copyId(id) {
  navigator.clipboard.writeText(id.toString())
  idCopied.value = true
  setTimeout(() => {
    idCopied.value = false
  }, 2500)
}

function generatePassword(reqId) {
  const pwd = Math.random().toString(36).replace(/\./g, '').substr(1, 8)
    + Math.random().toString(36).replace(/\./g, '').substr(1, 8)

  formData.value[`t${reqId}`] = pwd
  navigator.clipboard.writeText(pwd)

  toast.add({
    severity: 'success',
    summary: 'Пароль сгенерирован',
    detail: 'Скопирован в буфер обмена',
    life: 3000
  })
}

function copyInvite() {
  const username = formData.value.t18 || ''
  const password = formData.value.t20 || ''
  const invite = `Ссылка для входа: https://${window.location.host}/${props.database}?u=${username}\nпароль: ${password}`

  navigator.clipboard.writeText(invite)

  toast.add({
    severity: 'success',
    summary: 'Приглашение скопировано',
    detail: 'Отправьте пользователю',
    life: 3000
  })
}

async function saveObject() {
  try {
    saving.value = true

    // Validate required fields
    const missingRequired = requisites.value
      .filter(r => r.required && !formData.value[`t${r.id}`])

    if (missingRequired.length > 0) {
      toast.add({
        severity: 'warn',
        summary: 'Заполните обязательные поля',
        detail: missingRequired.map(r => r.name).join(', '),
        life: 5000
      })
      return
    }

    // Save
    const result = await integramService.saveObject(props.objectId, formData.value)

    if (result.id) {
      toast.add({
        severity: 'success',
        summary: 'Объект сохранен',
        life: 3000
      })

      // Reload to show updated values
      await loadObject()
    }

  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка сохранения',
      detail: error.message,
      life: 5000
    })
  } finally {
    saving.value = false
  }
}

async function duplicateObject() {
  try {
    const result = await integramService.createObject(
      objectData.value.typ,
      `${objectData.value.val} (copy)`,
      objectData.value.up,
      formData.value
    )

    if (result.id) {
      toast.add({
        severity: 'success',
        summary: 'Объект скопирован',
        detail: `ID: ${result.id}`,
        life: 3000
      })

      // Navigate to new object
      router.push(`/integram/${props.database}/edit/${result.id}`)
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка копирования',
      detail: error.message,
      life: 5000
    })
  }
}

async function deleteObject() {
  try {
    deleting.value = true

    await integramService.deleteObject(props.objectId)

    toast.add({
      severity: 'success',
      summary: 'Объект удален',
      life: 3000
    })

    // Navigate back to object list
    router.push(`/integram/${props.database}/object/${objectData.value.typ}`)

  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления',
      detail: error.message,
      life: 5000
    })
  } finally {
    deleting.value = false
  }
}

async function deleteFile(reqId) {
  try {
    await integramService.setRequisites(props.objectId, {
      [`t${reqId}`]: ''
    })

    toast.add({
      severity: 'success',
      summary: 'Файл удален',
      life: 3000
    })

    await loadObject()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка удаления файла',
      detail: error.message,
      life: 5000
    })
  }
}

function executeButtonAction(btn) {
  // Navigate to button action
  router.push(`/integram/${props.database}/${btn.action}`)
}

function cancel() {
  router.push(`/integram/${props.database}/object/${objectData.value.typ}`)
}

function addSubordinateItem(req) {
  // Navigate to the subordinate table with the current object as parent
  // This will open the create form for the subordinate table
  router.push({
    path: `/integram/${props.database}/object/${req.refTypeId}`,
    query: {
      F_U: props.objectId,
      action: 'add'
    }
  })
}

// Watch for object ID changes
watch(() => props.objectId, () => {
  loadObject()
})

// Lifecycle
onMounted(() => {
  loadObject()
})

// Initialize gridMode from cookie after object is loaded
watch(() => objectData.value?.typ, (typ) => {
  if (typ) {
    const cookies = document.cookie.split(';')
    const gridCookie = cookies.find(c => c.trim().startsWith(`gridMode${typ}=`))
    if (gridCookie) {
      const value = gridCookie.split('=')[1]
      gridMode.value = value === '1'
    }
  }
})
</script>

<style scoped>
.integram-enhanced-editor {
  padding: 1rem;
  width: 100%;
  /* Убран max-width для согласованности с другими компонентами Integram */
}

.breadcrumb {
  background: var(--surface-ground);
  border-radius: var(--border-radius);
}

.breadcrumb a {
  color: var(--primary-color);
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

/* Улучшенные отступы для полей формы */
.integram-field {
  margin-bottom: 1.25rem;
}

.integram-field label {
  font-weight: 600;
  color: var(--p-text-color);
  margin-bottom: 0.5rem;
  display: block;
}

/* Убираем отступ для последнего поля в колонке */
.grid > div:last-child .integram-field {
  margin-bottom: 0;
}

/* Улучшенный вид для checkbox */
:deep(.p-checkbox) {
  margin-top: 0.25rem;
}

/* Улучшенные инпуты */
:deep(.p-inputtext),
:deep(.p-dropdown),
:deep(.p-multiselect),
:deep(.p-inputnumber) {
  width: 100%;
}

/* Grid mode - все поля в строку */
.grid:not(.grid-list-mode) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

/* List mode - все поля в один столбец */
.grid.grid-list-mode {
  display: flex;
  flex-direction: column;
}

.grid.grid-list-mode > div {
  width: 100% !important;
  flex: none;
}
</style>
