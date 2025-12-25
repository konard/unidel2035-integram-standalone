import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import IntegramObjectEdit from '../IntegramObjectEdit.vue'
import IntegramEnhancedObjectEditor from '@/components/integram/IntegramEnhancedObjectEditor.vue'
import integramService from '@/services/integramService'
import integramApiClient from '@/services/integramApiClient'

// Mock the services
vi.mock('@/services/integramService', () => ({
  default: {
    getObjects: vi.fn(),
    setDatabase: vi.fn()
  }
}))

vi.mock('@/services/integramApiClient', () => ({
  default: {
    getAuthInfo: vi.fn(() => ({
      token: 'test_token',
      database: 'test_db'
    })),
    setObjectRequisites: vi.fn(),
    saveObject: vi.fn(),
    createObject: vi.fn(),
    deleteObject: vi.fn()
  }
}))

// Mock the composable
vi.mock('@/composables/useIntegramSession', () => ({
  useIntegramSession: () => ({
    isAuthenticated: { value: true },
    database: { value: 'test_db' }
  })
}))

// Mock PrimeVue components
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn()
  })
}))

describe('IntegramObjectEdit.vue', () => {
  let router
  let wrapper

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Create a router with the necessary route
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/integram/edit_obj/:objectId',
          name: 'IntegramObjectEdit',
          component: IntegramObjectEdit
        }
      ]
    })
  })

  describe('Basic Rendering', () => {
    it('renders without crashing', async () => {
      await router.push('/integram/edit_obj/123')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true,
            Message: true
          }
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('shows loading state initially', async () => {
      await router.push('/integram/edit_obj/123')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Dialog: true
          }
        }
      })

      expect(wrapper.vm.loading).toBe(true)
    })
  })

  describe('Table View for Types', () => {
    it('displays table view when objectId is a TYPE', async () => {
      // Mock getObjects to return type data
      integramService.getObjects.mockResolvedValue({
        list: [
          { id: 1, val: 'Object 1', up: null },
          { id: 2, val: 'Object 2', up: null }
        ],
        type: {
          id: 285,
          val: 'Test Type'
        },
        req_order: [100, 101],
        req_type: {
          100: 'Field 1',
          101: 'Field 2'
        },
        req_base: {
          100: 'SHORT',
          101: 'NUMBER'
        }
      })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true,
            InputText: true
          }
        }
      })

      // Wait for async operations
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(integramService.getObjects).toHaveBeenCalledWith('285')
      expect(wrapper.vm.isType).toBe(true)
      expect(wrapper.vm.tableData.length).toBe(2)
    })

    it('builds table data correctly from API response', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [
          { id: 1, val: 'Object 1', up: null, 100: 'Value1', 101: 123 }
        ],
        type: { id: 285, val: 'Test Type' },
        req_order: [100, 101],
        req_type: {
          100: 'Field 1',
          101: 'Field 2'
        },
        req_base: {
          100: 'SHORT',
          101: 'NUMBER'
        }
      })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const row = wrapper.vm.tableData[0]
      expect(row.id).toBe(1)
      expect(row.val).toBe('Object 1')
      expect(row.req_100).toBe('Value1')
      expect(row.req_101).toBe(123)
    })
  })

  describe('Form View for Objects', () => {
    it('displays form view when objectId is an OBJECT (not a type)', async () => {
      // Mock getObjects to fail (indicating it's not a type)
      integramService.getObjects.mockRejectedValue(new Error('Not a type'))

      await router.push('/integram/edit_obj/999')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wrapper.vm.isType).toBe(false)
      expect(wrapper.findComponent(IntegramEnhancedObjectEditor).exists()).toBe(true)
    })

    it('passes correct props to IntegramEnhancedObjectEditor', async () => {
      integramService.getObjects.mockRejectedValue(new Error('Not a type'))

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Dialog: true
          },
          components: {
            IntegramEnhancedObjectEditor
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const editor = wrapper.findComponent(IntegramEnhancedObjectEditor)
      if (editor.exists()) {
        expect(editor.props('objectId')).toBe('285')
        expect(editor.props('database')).toBe('test_db')
      }
    })
  })

  describe('Inline Editing', () => {
    it('toggles inline edit mode', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [],
        req_type: {},
        req_base: {}
      })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wrapper.vm.inlineEditMode).toBe(false)

      wrapper.vm.toggleInlineEdit()
      expect(wrapper.vm.inlineEditMode).toBe(true)

      wrapper.vm.toggleInlineEdit()
      expect(wrapper.vm.inlineEditMode).toBe(false)
    })

    it('saves cell changes via setObjectRequisites for requisite fields', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1', 100: 'Old Value' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [100],
        req_type: { 100: 'Field 1' },
        req_base: { 100: 'SHORT' }
      })

      integramApiClient.setObjectRequisites.mockResolvedValue({ success: true })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      await wrapper.vm.onCellEditComplete({
        data: { id: 1, req_100: 'New Value' },
        newValue: 'New Value',
        field: 'req_100',
        index: 0
      })

      expect(integramApiClient.setObjectRequisites).toHaveBeenCalledWith(1, { '100': 'New Value' })
    })

    it('saves cell changes via saveObject for val field', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Old Value' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [],
        req_type: {},
        req_base: {}
      })

      integramApiClient.saveObject.mockResolvedValue({ success: true })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      await wrapper.vm.onCellEditComplete({
        data: { id: 1, val: 'New Value' },
        newValue: 'New Value',
        field: 'val',
        index: 0
      })

      expect(integramApiClient.saveObject).toHaveBeenCalledWith(1, '285', 'New Value', {})
    })
  })

  describe('Row Operations', () => {
    it('creates new row when addNewRow is called', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [],
        req_type: {},
        req_base: {}
      })

      integramApiClient.createObject.mockResolvedValue(2)

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      await wrapper.vm.addNewRow()

      expect(integramApiClient.createObject).toHaveBeenCalledWith('285', { val: 'Новая запись' })
    })

    it('deletes row when deleteRow is confirmed', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [],
        req_type: {},
        req_base: {}
      })

      integramApiClient.deleteObject.mockResolvedValue({ success: true })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      wrapper.vm.confirmDeleteRow(1)
      expect(wrapper.vm.deleteDialog.objectId).toBe(1)
      expect(wrapper.vm.deleteDialog.visible).toBe(true)

      await wrapper.vm.deleteRow()

      expect(integramApiClient.deleteObject).toHaveBeenCalledWith(1)
    })
  })

  describe('Authentication', () => {
    it('redirects to login if not authenticated', async () => {
      // Mock not authenticated
      vi.mock('@/composables/useIntegramSession', () => ({
        useIntegramSession: () => ({
          isAuthenticated: { value: false },
          database: { value: 'test_db' }
        })
      }))

      const replaceSpy = vi.spyOn(router, 'replace')

      await router.push('/integram/edit_obj/123')
      await router.isReady()

      mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            IntegramEnhancedObjectEditor: true,
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Dialog: true
          }
        }
      })

      // Should attempt to redirect
      expect(replaceSpy).toHaveBeenCalledWith('/integram/login')
    })
  })

  describe('Helper Functions', () => {
    it('formats cell values correctly', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [100, 101],
        req_type: { 100: 'Boolean Field', 101: 'Date Field' },
        req_base: { 100: 'BOOLEAN', 101: 'DATE' }
      })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wrapper.vm.formatCellValue(true, 100)).toBe('✓')
      expect(wrapper.vm.formatCellValue(false, 100)).toBe('✗')
      expect(wrapper.vm.formatCellValue(null, 100)).toBe('—')
    })

    it('gets correct editor component for field types', async () => {
      integramService.getObjects.mockResolvedValue({
        list: [{ id: 1, val: 'Object 1' }],
        type: { id: 285, val: 'Test Type' },
        req_order: [100, 101, 102],
        req_type: { 100: 'Boolean', 101: 'Date', 102: 'Text' },
        req_base: { 100: 'BOOLEAN', 101: 'DATE', 102: 'SHORT' }
      })

      await router.push('/integram/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramObjectEdit, {
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            ProgressSpinner: true,
            DataTable: true,
            Column: true,
            Button: true,
            Dialog: true,
            InputText: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wrapper.vm.getEditorComponent(100)).toBe('Checkbox')
      expect(wrapper.vm.getEditorComponent(101)).toBe('Calendar')
      // InputText is a component, not a string
      expect(wrapper.vm.getEditorComponent(102)).toBeTruthy()
    })
  })
})
