/**
 * Tests for ReferenceField component
 *
 * Tests the reference field dropdown functionality including:
 * - Loading options from API
 * - Displaying current value
 * - Single and multi-select modes
 * - Creating new references
 * - Dependent/restricted selects
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReferenceField from '../ReferenceField.vue'
import integramApiClient from '@/services/integramApiClient'
import PrimeVue from 'primevue/config'

// Mock integramApiClient
vi.mock('@/services/integramApiClient', () => ({
  default: {
    setDatabase: vi.fn(),
    getReferenceOptions: vi.fn(),
    createObject: vi.fn()
  }
}))

// Mock PrimeVue toast
const mockToast = {
  add: vi.fn()
}

describe('ReferenceField', () => {
  let wrapper

  const defaultProps = {
    modelValue: null,
    refTypeId: 100,
    database: 'a2025',
    objectId: 285,
    multi: false,
    allowCreate: false,
    restrict: null,
    currentDisplayName: null
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock responses
    integramApiClient.getReferenceOptions.mockResolvedValue({
      '1': 'Option 1',
      '2': 'Option 2',
      '3': 'Option 3'
    })
  })

  it('renders select component', async () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('loads reference options on mount', async () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    expect(integramApiClient.setDatabase).toHaveBeenCalledWith('a2025')
    expect(integramApiClient.getReferenceOptions).toHaveBeenCalledWith(
      100, // refTypeId
      285, // objectId
      null, // restrict
      '' // searchTerm
    )
  })

  it('displays current value when provided', async () => {
    integramApiClient.getReferenceOptions.mockResolvedValue({
      '1': 'Option 1',
      '2': 'Option 2',
      '5': 'Currently Selected'
    })

    wrapper = mount(ReferenceField, {
      props: {
        ...defaultProps,
        modelValue: 5,
        currentDisplayName: 'Currently Selected'
      },
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()
    await nextTick() // Wait for async loading

    // Component should have loaded the current value
    expect(wrapper.vm.localValue).toBe(5)
  })

  it('handles multi-select mode', async () => {
    wrapper = mount(ReferenceField, {
      props: {
        ...defaultProps,
        multi: true,
        modelValue: [1, 2]
      },
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()
    await nextTick() // Wait for async loading

    // Should display selected items as tags
    expect(wrapper.vm.selectedItems.length).toBe(2)
  })

  it('emits update:modelValue when selection changes', async () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    // Simulate selecting an option
    wrapper.vm.onChange({ value: 2 })

    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([2])
  })

  it('filters options based on search term', async () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    // Simulate search
    await wrapper.vm.onFilter({ value: 'test' })

    expect(integramApiClient.getReferenceOptions).toHaveBeenCalledWith(
      100,
      285,
      null,
      'test'
    )
  })

  it('creates new reference when allowCreate is true', async () => {
    integramApiClient.createObject.mockResolvedValue({
      id: 99,
      obj: { id: 99 }
    })

    wrapper = mount(ReferenceField, {
      props: {
        ...defaultProps,
        allowCreate: true
      },
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    // Set new value and create
    wrapper.vm.newRefValue = 'New Item'
    await wrapper.vm.createNewReference()

    await nextTick()

    expect(integramApiClient.createObject).toHaveBeenCalledWith(
      100, // refTypeId
      'New Item',
      {},
      null
    )

    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: 'Значение создано'
      })
    )
  })

  it('handles API errors gracefully', async () => {
    integramApiClient.getReferenceOptions.mockRejectedValue(
      new Error('API Error')
    )

    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()
    await nextTick() // Wait for async error handling

    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'Ошибка загрузки'
      })
    )
  })

  it('removes item in multi-select mode', async () => {
    wrapper = mount(ReferenceField, {
      props: {
        ...defaultProps,
        multi: true,
        modelValue: [1, 2, 3]
      },
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()
    await nextTick() // Wait for async loading

    // Remove item
    wrapper.vm.removeItem(2)

    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const emittedValue = wrapper.emitted('update:modelValue').slice(-1)[0][0]
    expect(emittedValue).not.toContain(2)
    expect(emittedValue.length).toBe(2)
  })

  it('reloads options when restrict prop changes', async () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()

    const initialCallCount = integramApiClient.getReferenceOptions.mock.calls.length

    // Change restrict prop
    await wrapper.setProps({ restrict: 50 })
    await nextTick()

    expect(integramApiClient.getReferenceOptions.mock.calls.length).toBeGreaterThan(
      initialCallCount
    )
  })

  it('generates correct color for badge based on ID', () => {
    wrapper = mount(ReferenceField, {
      props: defaultProps,
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    const color1 = wrapper.vm.getColor(0)
    const color2 = wrapper.vm.getColor(1)
    const color25 = wrapper.vm.getColor(24)

    expect(color1).toBe('#78AAD2')
    expect(color2).toBe('#78AAFF')
    expect(color25).toBe('#78AAD2') // Wraps around
  })

  it('uses currentDisplayName for initial value if provided', async () => {
    integramApiClient.getReferenceOptions.mockResolvedValue({
      '1': 'Option 1',
      '2': 'Option 2'
    })

    wrapper = mount(ReferenceField, {
      props: {
        ...defaultProps,
        modelValue: 999,
        currentDisplayName: 'Custom Display Name'
      },
      global: {
        plugins: [PrimeVue],
        mocks: {
          $toast: mockToast
        }
      }
    })

    await nextTick()
    await nextTick() // Wait for async loading

    // Should have added the current value with display name to options
    const optionWith999 = wrapper.vm.options.find(opt => opt.id === 999)
    expect(optionWith999).toBeDefined()
    expect(optionWith999.text).toBe('Custom Display Name')
  })
})
