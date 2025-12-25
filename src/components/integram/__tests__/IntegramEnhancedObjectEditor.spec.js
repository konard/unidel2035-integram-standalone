import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import IntegramEnhancedObjectEditor from '../IntegramEnhancedObjectEditor.vue'
import integramService from '@/services/integramService'

// Mock the integramService
vi.mock('@/services/integramService', () => ({
  default: {
    setDatabase: vi.fn(),
    getEditObject: vi.fn(),
    getMetadata: vi.fn(),
    getReferenceOptions: vi.fn(),
    saveObject: vi.fn(),
    deleteObject: vi.fn()
  }
}))

// Mock PrimeVue components
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn()
  })
}))

describe('IntegramEnhancedObjectEditor.vue', () => {
  let router
  let wrapper

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create a minimal router
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/integram/:database/edit_obj/:objectId',
          name: 'IntegramEditObject',
          component: IntegramEnhancedObjectEditor
        }
      ]
    })
  })

  describe('Subordinate Table Type ID Extraction (Issue #3341)', () => {
    it('should extract subordinate table type ID from arr_type mapping', async () => {
      // Mock API response similar to the issue example
      // This simulates the real Integram API response format
      const mockEditObjectResponse = {
        obj: {
          id: '285',
          typ: '18',
          typ_name: 'Пользователь',
          val: 'a2025',
          up: '1'
        },
        reqs: {
          728: 4, // Transaction count (subordinate table)
          964482: 12 // Another subordinate table
        },
        // CRITICAL: arr_type mapping that was missing before fix
        arr_type: {
          '728': '732',      // Transaction requisite -> Transaction type
          '964482': '964484' // Task requisite -> Task type
        },
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '728',
            val: 'Транзакция',
            type: '4', // ARRAY type
            arr: null, // Not provided in metadata
            arr_id: null, // Not provided in metadata
            attrs: ''
          },
          {
            id: '964482',
            val: 'Задача игрока',
            type: '4', // ARRAY type
            arr: null,
            arr_id: null,
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      // Navigate to the edit page
      await router.push('/integram/a2025/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'a2025',
          objectId: '285'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true,
            InputText: true,
            InputNumber: true,
            Textarea: true,
            Calendar: true,
            Checkbox: true,
            Editor: true,
            ReferenceField: true,
            FileField: true,
            DateField: true,
            PasswordField: true
          }
        }
      })

      // Wait for component to load data
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify the arr_type mapping was extracted
      const requisites = wrapper.vm.requisites

      // Find the Transaction requisite
      const transactionReq = requisites.find(r => r.id === '728')
      expect(transactionReq).toBeDefined()
      expect(transactionReq.isArray).toBe(true)
      // CRITICAL CHECK: refTypeId should be extracted from arr_type mapping
      expect(transactionReq.refTypeId).toBe('732')

      // Find the Task requisite
      const taskReq = requisites.find(r => r.id === '964482')
      expect(taskReq).toBeDefined()
      expect(taskReq.isArray).toBe(true)
      expect(taskReq.refTypeId).toBe('964484')
    })

    it('should fallback to req.arr if arr_type mapping is not available', async () => {
      const mockEditObjectResponse = {
        obj: {
          id: '100',
          typ: '10',
          typ_name: 'TestType',
          val: 'Test Object'
        },
        reqs: {
          50: 3
        },
        // No arr_type mapping provided
        arr_type: null,
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '50',
            val: 'Items',
            type: '4',
            arr: '51', // Fallback value in metadata
            arr_id: null,
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      await router.push('/integram/test/edit_obj/100')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'test',
          objectId: '100'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      const requisites = wrapper.vm.requisites
      const itemsReq = requisites.find(r => r.id === '50')

      expect(itemsReq).toBeDefined()
      expect(itemsReq.isArray).toBe(true)
      // Should use req.arr as fallback
      expect(itemsReq.refTypeId).toBe('51')
    })

    it('should render subordinate table link when refTypeId is available', async () => {
      const mockEditObjectResponse = {
        obj: {
          id: '285',
          typ: '18',
          typ_name: 'Пользователь',
          val: 'Test User'
        },
        reqs: {
          728: 4
        },
        arr_type: {
          '728': '732'
        },
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '728',
            val: 'Транзакция',
            type: '4',
            arr: null,
            arr_id: null,
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      await router.push('/integram/a2025/edit_obj/285')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'a2025',
          objectId: '285'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      // The component should render a router-link for subordinate table
      // instead of the error message "Подчиненная таблица (тип не определен)"
      const html = wrapper.html()

      // Should NOT contain the error message
      expect(html).not.toContain('тип не определен')

      // Should contain a link to the subordinate table
      // The link format: /integram/a2025/object/732?F_U=285
      expect(html).toContain('/integram/a2025/object/732')
      expect(html).toContain('F_U=285')
    })

    it('should show error message when refTypeId is not available', async () => {
      const mockEditObjectResponse = {
        obj: {
          id: '100',
          typ: '10',
          typ_name: 'TestType',
          val: 'Test Object'
        },
        reqs: {
          50: 2
        },
        // No arr_type mapping
        arr_type: null,
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '50',
            val: 'Items',
            type: '4',
            // No arr, arr_id, or ref values
            arr: null,
            arr_id: null,
            ref: null,
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      await router.push('/integram/test/edit_obj/100')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'test',
          objectId: '100'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      // When refTypeId is null, should show error message
      const html = wrapper.html()
      expect(html).toContain('тип не определен')
    })
  })

  describe('String Field Editing', () => {
    it('should handle SHORT text field editing', async () => {
      const mockEditObjectResponse = {
        obj: {
          id: '100',
          typ: '10',
          typ_name: 'TestType',
          val: 'Test Object'
        },
        reqs: {
          33: 'John Doe'
        },
        arr_type: null,
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '33',
            val: 'Имя',
            type: '3', // SHORT type
            base: 'SHORT',
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      await router.push('/integram/test/edit_obj/100')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'test',
          objectId: '100'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true,
            InputText: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify the formData is initialized with the string value
      expect(wrapper.vm.formData.t33).toBe('John Doe')
    })

    it('should handle MEMO text field editing', async () => {
      const mockEditObjectResponse = {
        obj: {
          id: '100',
          typ: '10',
          typ_name: 'TestType',
          val: 'Test Object'
        },
        reqs: {
          39: 'This is a long text note\nwith multiple lines'
        },
        arr_type: null,
        metadata: {}
      }

      const mockMetadata = {
        reqs: [
          {
            id: '39',
            val: 'Примечание',
            type: '12', // MEMO type
            base: 'MEMO',
            attrs: ''
          }
        ]
      }

      integramService.getEditObject.mockResolvedValue(mockEditObjectResponse)
      integramService.getMetadata.mockResolvedValue(mockMetadata)

      await router.push('/integram/test/edit_obj/100')
      await router.isReady()

      wrapper = mount(IntegramEnhancedObjectEditor, {
        props: {
          database: 'test',
          objectId: '100'
        },
        global: {
          plugins: [router],
          stubs: {
            Card: true,
            Badge: true,
            Message: true,
            Button: true,
            TabView: true,
            TabPanel: true,
            ProgressSpinner: true,
            Textarea: true
          }
        }
      })

      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify the formData is initialized with the MEMO value
      expect(wrapper.vm.formData.t39).toBe('This is a long text note\nwith multiple lines')
    })
  })
})
