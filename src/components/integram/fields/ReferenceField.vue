<template>
  <div class="reference-field comp-control">
    <!--
      Multi-select Reference Field Implementation (Issue #3378)
      ==========================================================

      This component implements the multiselect pattern from backend/legacy_integram/templates/edit_obj.html

      Pattern: "Bubbles + List"
      - Bubbles: Selected items displayed as colored badge pills with remove (×) icons
      - List: Dropdown <select> for choosing additional items

      Key Requirements (matching edit_obj.html):
      1. Selected items appear as colored badges above the dropdown
      2. Each badge has a background color based on item ID (24 colors, rotating)
      3. Badges have (×) icon for removal
      4. Dropdown below for selecting new items (native <select>, not PrimeVue MultiSelect)
      5. Custom `multi` attribute on select (not HTML5 `multiple`)
      6. Uses _m_set API to add items, _m_del API to remove items

      NOTE: "A multiselect isn't JUST a list - it's bubbles AND a list" (Issue #3378)
    -->

    <!-- Badges container for selected items (only visible when multi=true) -->
    <div v-if="multi" :id="`mst${reqId}`" class="multiselect-badges mb-2">
      <span
        v-for="item in selectedItems"
        :key="item.msId || item.id"
        :id="item.msId"
        :data-ref="item.id"
        :data-ord="item.ord || 0"
        :data-color="getColor(item.id)"
        class="badge badge-pill text-dark p-2 ml-0 mt-0 mb-2 mr-1"
        :style="{ backgroundColor: getColor(item.id), opacity: removing === item.id ? 0.5 : 1 }"
      >
        <font>{{ item.text }}</font>
        <a
          v-if="removing !== item.id"
          @click="removeItem(item.id)"
          class="ml-1"
          style="cursor: pointer;"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" class="flex-none ml-1" style="shape-rendering: geometricprecision;">
            <path fill-rule="evenodd" fill="currentColor" d="M7.41421356,6 L9.88226406,3.5319495 C10.0816659,3.33254771 10.0828664,3.01179862 9.88577489,2.81470708 L9.18529292,2.11422511 C8.97977275,1.90870494 8.66708101,1.91870543 8.4680505,2.11773594 L6,4.58578644 L3.5319495,2.11773594 C3.33254771,1.91833414 3.01179862,1.91713357 2.81470708,2.11422511 L2.11422511,2.81470708 C1.90870494,3.02022725 1.91870543,3.33291899 2.11773594,3.5319495 L4.58578644,6 L2.11773594,8.4680505 C1.91833414,8.66745229 1.91713357,8.98820138 2.11422511,9.18529292 L2.81470708,9.88577489 C3.02022725,10.0912951 3.33291899,10.0812946 3.5319495,9.88226406 L6,7.41421356 L8.4680505,9.88226406 C8.66745229,10.0816659 8.98820138,10.0828664 9.18529292,9.88577489 L9.88577489,9.18529292 C10.0912951,8.97977275 10.0812946,8.66708101 9.88226406,8.4680505 L7.41421356,6 L7.41421356,6 Z"></path>
          </svg>
        </a>
      </span>
    </div>

    <!--
      Native HTML <select> dropdown (matching edit_obj.html pattern)

      IMPORTANT: This is NOT a PrimeVue MultiSelect component!
      - Uses native HTML <select> element for compatibility with legacy Integram API
      - Custom `multi` attribute (not HTML5 `multiple`) indicates multiselect mode
      - When multi="1": onChange calls _m_set API to add selected item to badges
      - When multi="0": Standard single-select behavior
      - Class "select2-replacement" indicates it replaces legacy select2 jQuery plugin
    -->
    <select
      :id="`t${reqId}`"
      :name="`t${reqId}`"
      v-model="localValue"
      :multi="multi ? '1' : '0'"
      :i-orig="refTypeId"
      :i-restrict="restrict"
      :granted="allowCreate ? reqId : undefined"
      class="form-control select2-replacement"
      :disabled="adding || removing !== null"
      @change="onChange"
    >
      <option value=""></option>
      <option
        v-for="option in options"
        :key="option.id"
        :value="option.id"
        :r="option.r || ''"
        :selected="!multi && localValue == option.id"
      >
        {{ option.text }}
      </option>
    </select>

    <!-- Create New Reference Dialog -->
    <Dialog
      v-model:visible="showCreateDialog"
      header="Создать новое значение"
      :style="{ width: '400px' }"
      modal
    >
      <div class="field">
        <label for="newRefValue">Значение</label>
        <InputText
          id="newRefValue"
          v-model="newRefValue"
          class="w-full"
          autofocus
          @keyup.enter="createNewReference"
        />
      </div>

      <template #footer>
        <Button label="Отмена" @click="showCreateDialog = false" text />
        <Button
          label="Создать"
          @click="createNewReference"
          :loading="creating"
          autofocus
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'

import integramApiClient from '@/services/integramApiClient'

const props = defineProps({
  modelValue: {
    type: [String, Number, Array],
    default: null
  },
  reqId: {
    type: [String, Number],
    required: true
  },
  refTypeId: {
    type: [String, Number],
    required: true
  },
  database: {
    type: String,
    required: true
  },
  objectId: {
    type: [String, Number],
    required: true
  },
  multi: {
    type: Boolean,
    default: false
  },
  allowCreate: {
    type: Boolean,
    default: false
  },
  restrict: {
    type: [String, Number],
    default: null
  },
  currentDisplayName: {
    type: String,
    default: null
  },
  initialMultiselectItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const toast = useToast()

// State
const localValue = ref(null)
const options = ref([])
const selectedItems = ref([])
const loading = ref(false)
const creating = ref(false)
const adding = ref(false) // Loading state for multiselect add
const removing = ref(null) // ID of item being removed

const showCreateDialog = ref(false)
const newRefValue = ref('')

// Methods
async function loadOptions(searchTerm = '') {
  try {
    loading.value = true

    integramApiClient.setDatabase(props.database)

    const result = await integramApiClient.getReferenceOptions(
      props.reqId, // Use requisite ID (not ref type ID) for API call
      props.objectId, // Pass the actual object ID being edited
      props.restrict,
      searchTerm
    )

    // Check for API error
    if (result && result.failed) {
      throw new Error(result.failed)
    }

    // Parse options - result should be an object with id:text pairs
    if (result && typeof result === 'object') {
      const allOptions = Object.entries(result).map(([id, text]) => ({
        id: parseInt(id),
        text: text.toString()
      }))

      // Check for selected items that aren't in options (for multi-select)
      if (props.multi && selectedItems.value.length > 0) {
        const selectedIds = selectedItems.value.map(item => item.id)
        const beforeFilterCount = allOptions.length
        options.value = allOptions.filter(opt => !selectedIds.includes(opt.id))
        const afterFilterCount = options.value.length

      } else {
        options.value = allOptions
        // console.log('[ReferenceField] loadOptions: No filtering needed (single select or no selected items)')
      }
    } else {
      if (import.meta.env.DEV) {
        console.warn('[ReferenceField] loadOptions: Unexpected reference options format:', result)
      }
      options.value = []
    }

  } catch (error) {
    console.error('[ReferenceField] loadOptions: Failed:', error)
    toast.add({
      severity: 'error',
      summary: 'Ошибка загрузки',
      detail: 'Не удалось загрузить варианты',
      life: 3000
    })
  } finally {
    loading.value = false
  }
}

async function onFilter(event) {
  await loadOptions(event.value)
}

async function onChange(event) {
  const selectedValue = event.target ? event.target.value : event.value

  if (props.multi) {
    // Add to multiselect - must call API immediately
    const selectedId = parseInt(selectedValue)
    const selected = options.value.find(opt => opt.id === selectedId)

    if (selected && !selectedItems.value.find(item => item.id === selected.id)) {
      try {
        adding.value = true
        integramApiClient.setDatabase(props.database)

        // Call _m_set API to add multiselect item
        const result = await integramApiClient.addMultiselectItem(
          props.objectId,
          props.reqId,
          selected.id
        )

        // Check for API error
        if (result && result.failed) {
          throw new Error(result.failed)
        }

        // The API returns the multiselect item ID (NOT the same as the selected object ID)
        // This ID is needed for deletion
        const multiselectItemId = result.id

        if (!multiselectItemId) {
          throw new Error('API did not return multiselect item ID')
        }

        // Add to selected items with the multiselect item ID
        selectedItems.value.push({
          id: selected.id, // Referenced object ID (for display)
          text: selected.text,
          msId: multiselectItemId // Multiselect item ID (for deletion)
        })

        // Remove from options
        options.value = options.value.filter(opt => opt.id !== selected.id)

        // Emit array of object IDs (not multiselect IDs)
        emit('update:modelValue', selectedItems.value.map(item => item.id))

        toast.add({
          severity: 'success',
          summary: 'Добавлено',
          detail: `${selected.text} добавлен`,
          life: 2000
        })
      } catch (error) {
        console.error('Failed to add multiselect item:', error)
        toast.add({
          severity: 'error',
          summary: 'Ошибка добавления',
          detail: error.message || 'Не удалось добавить элемент',
          life: 5000
        })
      } finally {
        adding.value = false
      }
    }

    // Reset select
    localValue.value = null
  } else {
    // Single select - emit immediately without API call
    // The parent form will handle saving via _m_save
    emit('update:modelValue', selectedValue)
  }
}

async function removeItem(itemId) {
  const item = selectedItems.value.find(i => i.id === itemId)

  if (item) {
    // For multiselect, must call _m_del API with the multiselect item ID (NOT the object ID)
    const multiselectItemId = item.msId

    if (!multiselectItemId) {
      console.error('No multiselect item ID found for deletion:', item)
      toast.add({
        severity: 'error',
        summary: 'Ошибка удаления',
        detail: 'Не найден ID элемента для удаления',
        life: 5000
      })
      return
    }

    try {
      removing.value = itemId // Set loading state for this specific item
      integramApiClient.setDatabase(props.database)

      // Call _m_del API to remove multiselect item
      const result = await integramApiClient.removeMultiselectItem(multiselectItemId)

      // Check for API error
      if (result && result.failed) {
        throw new Error(result.failed)
      }

      // Remove from selected items
      selectedItems.value = selectedItems.value.filter(i => i.id !== itemId)

      // Add back to options
      options.value.push({
        id: item.id,
        text: item.text
      })
      options.value.sort((a, b) => a.text.localeCompare(b.text))

      // Emit updated value
      emit('update:modelValue', selectedItems.value.map(i => i.id))

      toast.add({
        severity: 'success',
        summary: 'Удалено',
        detail: `${item.text} удален`,
        life: 2000
      })
    } catch (error) {
      console.error('Failed to remove multiselect item:', error)
      toast.add({
        severity: 'error',
        summary: 'Ошибка удаления',
        detail: error.message || 'Не удалось удалить элемент',
        life: 5000
      })
    } finally {
      removing.value = null
    }
  }
}

function getColor(id) {
  // Generate color based on ID (like in legacy implementation)
  const colors = [
    '#78AAD2', '#78AAFF', '#78D2AA', '#78D2FF', '#78FFAA', '#78FFD2',
    '#AA78D2', '#AA78FF', '#AAD278', '#AAD2FF', '#AAFF78', '#AAFFD2',
    '#D278AA', '#D278FF', '#D2AA78', '#D2AAFF', '#D2FF78', '#D2FFAA',
    '#FF78AA', '#FF78D2', '#FFAA78', '#FFAAD2', '#FFD278', '#FFD2AA'
  ]

  // Defensive: Handle undefined, null, or invalid IDs
  // Convert to number and use modulo to get color index
  const numericId = parseInt(id) || 0
  const colorIndex = Math.abs(numericId) % colors.length

  return colors[colorIndex]
}

async function createNewReference() {
  if (!newRefValue.value) {
    toast.add({
      severity: 'warn',
      summary: 'Введите значение',
      life: 3000
    })
    return
  }

  try {
    creating.value = true

    integramApiClient.setDatabase(props.database)

    // Note: integramApiClient.createObject has different parameter order:
    // createObject(typeId, value, requisites, parentId)
    const result = await integramApiClient.createObject(
      props.refTypeId,
      newRefValue.value,
      {}, // No requisites
      null // No parent
    )

    if (result && !result.failed) {
      // Extract ID from result (Integram API may return different formats)
      const newId = result.id || result.obj?.id

      toast.add({
        severity: 'success',
        summary: 'Значение создано',
        life: 3000
      })

      // Add to options
      options.value.unshift({
        id: newId,
        text: newRefValue.value
      })

      // Select it
      if (props.multi) {
        selectedItems.value.push({
          id: newId,
          text: newRefValue.value
        })
        emit('update:modelValue', selectedItems.value.map(item => item.id))
      } else {
        localValue.value = newId
        emit('update:modelValue', newId)
      }

      showCreateDialog.value = false
      newRefValue.value = ''
    } else {
      throw new Error(result.failed || 'Failed to create object')
    }

  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка создания',
      detail: error.message,
      life: 5000
    })
  } finally {
    creating.value = false
  }
}

// Watch for initialMultiselectItems prop (for multiselect initialization)
watch(() => props.initialMultiselectItems, (newItems) => {
  if (props.multi && newItems && newItems.length > 0) {
    // Only update if selectedItems is empty (avoid overwriting user changes)
    if (selectedItems.value.length === 0) {
      selectedItems.value = [...newItems]
    }
  }
}, { immediate: true, deep: true })

// Watch for external value changes (for single select)
watch(() => props.modelValue, async (newVal) => {
  // console.log('[ReferenceField] watch(modelValue): triggered with', newVal, 'multi:', props.multi)

  if (props.multi) {
    // For multiselect, we rely on initialMultiselectItems prop (watched above)
    // Only handle modelValue if initialMultiselectItems is not provided
    if (!props.initialMultiselectItems || props.initialMultiselectItems.length === 0) {
      // Load selected items info if we have IDs but no initialMultiselectItems
      if (Array.isArray(newVal) && newVal.length > 0 && selectedItems.value.length === 0) {
        // console.log('[ReferenceField] watch(modelValue): Loading multiselect items from IDs:', newVal)
        // Load actual item names from API
        try {
          integramApiClient.setDatabase(props.database)

          const result = await integramApiClient.getReferenceOptions(
            props.reqId,
            props.objectId,
            props.restrict,
            null
          )

          if (result && !result.failed && typeof result === 'object') {
            selectedItems.value = newVal
              .filter(id => result[id]) // Only include IDs that exist in result
              .map(id => ({
                id: parseInt(id),
                text: result[id].toString(),
                msId: null // No msId available when loading this way
              }))
            // console.log('[ReferenceField] watch(modelValue): Loaded selectedItems:', selectedItems.value)
          } else {
            throw new Error(result.failed || 'Failed to load options')
          }
        } catch (error) {
          console.error('[ReferenceField] watch(modelValue): Failed to load selected item names:', error)
          // Fallback to displaying IDs
          selectedItems.value = newVal.map(id => ({
            id,
            text: `#${id}`,
            msId: null
          }))
        }
      } else if (!newVal || (Array.isArray(newVal) && newVal.length === 0)) {
        // Clear selected items if modelValue becomes empty
        // console.log('[ReferenceField] watch(modelValue): Clearing selectedItems')
        selectedItems.value = []
      }
    }
  } else {
    // Single select - just update local value
    localValue.value = newVal
    // console.log('[ReferenceField] watch(modelValue): Set localValue for single select:', localValue.value)
  }
}, { immediate: true })

// Watch for restrict changes (dependent selects)
watch(() => props.restrict, () => {
  loadOptions()
})

// Lifecycle - Initialize component
onMounted(async () => {
  // console.log('[ReferenceField] onMounted: Starting initialization', {
  //   multi: props.multi,
  //   hasInitialMultiselectItems: !!(props.initialMultiselectItems && props.initialMultiselectItems.length > 0),
  //   selectedItemsCount: selectedItems.value.length,
  //   modelValue: props.modelValue
  // })

  // STEP 1: Initialize multiselect items from prop (if provided)
  // This MUST happen before loading options to ensure selected items are excluded from options
  // NOTE: The watch may have already initialized this, so check first
  if (props.multi && props.initialMultiselectItems && props.initialMultiselectItems.length > 0) {
    // Only initialize if not already set by watch
    if (selectedItems.value.length === 0) {
      selectedItems.value = [...props.initialMultiselectItems]

    } else {
      // console.log('[ReferenceField] onMounted: Items already initialized by watch, skipping (count:', selectedItems.value.length, ')')
    }
  }

  // STEP 2: Load initial options

  await loadOptions()

  // STEP 3: If there's a current value for single-select and it's not in options, ensure it's added
  // This handles the case where the current selected value should be shown
  if (props.modelValue && !props.multi) {
    const currentId = parseInt(props.modelValue)
    const existsInOptions = options.value.some(opt => opt.id === currentId)

    if (!existsInOptions) {
      // If we have currentDisplayName prop, use it directly (fast path)
      if (props.currentDisplayName) {
        options.value.unshift({
          id: currentId,
          text: props.currentDisplayName
        })
        // console.log('[ReferenceField] onMounted: Added current value to options (from prop):', currentId)
      } else {
        // Otherwise, try to fetch the display name from API (slow path)
        try {
          integramApiClient.setDatabase(props.database)

          const allOptions = await integramApiClient.getReferenceOptions(
            props.reqId,
            props.objectId,
            props.restrict,
            ''
          )

          if (allOptions && allOptions[currentId]) {
            // Add the current value to options so it can be displayed
            options.value.unshift({
              id: currentId,
              text: allOptions[currentId].toString()
            })
            // console.log('[ReferenceField] onMounted: Added current value to options (from API):', currentId)
          }
        } catch (error) {
          console.error('[ReferenceField] onMounted: Failed to load current value display name:', error)
        }
      }
    }
  }

})
</script>

<style scoped>
/* Comp-control layout matching edit_obj.html */
.comp-control {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* Multiselect badges matching edit_obj.html */
.multiselect-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1;
  cursor: default;
}

.badge-pill {
  border-radius: 16px;
}

.text-dark {
  color: #1a1a1a !important;
}

/* Select styling */
.form-control {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  color: #495057;
  background-color: #fff;
  background-clip: padding-box;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-control:focus {
  color: #495057;
  background-color: #fff;
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.form-control:disabled {
  background-color: #e9ecef;
  opacity: 1;
}

/* SVG close icon in badge */
.badge a {
  text-decoration: none;
  color: inherit;
  display: inline-flex;
  align-items: center;
}

.badge svg {
  cursor: pointer;
}
</style>
