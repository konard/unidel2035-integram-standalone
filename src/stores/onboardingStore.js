/**
 * Onboarding Store
 *
 * Manages user onboarding state, progress, and completion tracking
 * Implements the onboarding flow for new users as per Issue #72
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useOnboardingStore = defineStore('onboarding', () => {
  // Onboarding state
  const onboardingCompleted = ref(false)
  const currentStep = ref(0)
  const hasSeenWelcome = ref(false)
  const hasCompletedTour = ref(false)
  const selectedRole = ref(null)
  const selectedUseCase = ref(null)

  // Checklist progress
  const checklistItems = ref([
    { id: 'profile', label: 'Завершить профиль', completed: false, route: '/profile/edit' },
    { id: 'explore_dashboard', label: 'Изучить дашборд', completed: false, route: '/dashboard' },
    { id: 'create_workspace', label: 'Создать рабочее пространство', completed: false, route: '/workspaces' },
    { id: 'invite_team', label: 'Пригласить команду', completed: false, route: '/settings' },
    { id: 'first_agent', label: 'Создать первого агента', completed: false, route: '/agents/constructor' },
  ])

  // Tour progress tracking
  const tourSteps = ref([
    { id: 'dashboard', completed: false, name: 'Обзор дашборда' },
    { id: 'navigation', completed: false, name: 'Навигация' },
    { id: 'workspaces', completed: false, name: 'Рабочие пространства' },
    { id: 'agents', completed: false, name: 'Агенты' },
    { id: 'settings', completed: false, name: 'Настройки' },
  ])

  // User preferences
  const preferences = ref({
    skipTour: false,
    showHints: true,
    emailNotifications: true,
    tourLanguage: 'ru',
  })

  // Metrics
  const metrics = ref({
    startTime: null,
    completionTime: null,
    timeToFirstValue: null,
    activationTime: null,
    featureInteractions: [],
  })

  // Computed properties
  const completedChecklistCount = computed(() =>
    checklistItems.value.filter(item => item.completed).length
  )

  const checklistProgress = computed(() =>
    (completedChecklistCount.value / checklistItems.value.length) * 100
  )

  const completedTourStepsCount = computed(() =>
    tourSteps.value.filter(step => step.completed).length
  )

  const tourProgress = computed(() =>
    (completedTourStepsCount.value / tourSteps.value.length) * 100
  )

  const overallProgress = computed(() => {
    const weights = {
      welcome: 10,
      role: 10,
      tour: 30,
      checklist: 50,
    }

    let progress = 0
    if (hasSeenWelcome.value) progress += weights.welcome
    if (selectedRole.value) progress += weights.role
    progress += (tourProgress.value / 100) * weights.tour
    progress += (checklistProgress.value / 100) * weights.checklist

    return Math.round(progress)
  })

  const isOnboardingActive = computed(() =>
    !onboardingCompleted.value && overallProgress.value < 100
  )

  /**
   * Initialize store from localStorage
   */
  function initFromLocalStorage() {
    const savedState = localStorage.getItem('onboarding_state')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        onboardingCompleted.value = parsed.onboardingCompleted || false
        currentStep.value = parsed.currentStep || 0
        hasSeenWelcome.value = parsed.hasSeenWelcome || false
        hasCompletedTour.value = parsed.hasCompletedTour || false
        selectedRole.value = parsed.selectedRole || null
        selectedUseCase.value = parsed.selectedUseCase || null
        checklistItems.value = parsed.checklistItems || checklistItems.value
        tourSteps.value = parsed.tourSteps || tourSteps.value
        preferences.value = parsed.preferences || preferences.value
        metrics.value = parsed.metrics || metrics.value
      } catch (error) {
        console.error('Failed to parse onboarding state from localStorage:', error)
      }
    }

    // Initialize metrics start time if not set
    if (!metrics.value.startTime) {
      metrics.value.startTime = new Date().toISOString()
      saveToLocalStorage()
    }
  }

  /**
   * Save state to localStorage
   */
  function saveToLocalStorage() {
    const state = {
      onboardingCompleted: onboardingCompleted.value,
      currentStep: currentStep.value,
      hasSeenWelcome: hasSeenWelcome.value,
      hasCompletedTour: hasCompletedTour.value,
      selectedRole: selectedRole.value,
      selectedUseCase: selectedUseCase.value,
      checklistItems: checklistItems.value,
      tourSteps: tourSteps.value,
      preferences: preferences.value,
      metrics: metrics.value,
    }
    localStorage.setItem('onboarding_state', JSON.stringify(state))
  }

  /**
   * Mark welcome screen as seen
   */
  function markWelcomeSeen() {
    hasSeenWelcome.value = true
    saveToLocalStorage()
  }

  /**
   * Set user role and use case
   */
  function setUserRole(role, useCase = null) {
    selectedRole.value = role
    if (useCase) {
      selectedUseCase.value = useCase
    }
    saveToLocalStorage()
  }

  /**
   * Complete a checklist item
   */
  function completeChecklistItem(itemId) {
    const item = checklistItems.value.find(i => i.id === itemId)
    if (item && !item.completed) {
      item.completed = true

      // Track feature interaction
      metrics.value.featureInteractions.push({
        feature: itemId,
        timestamp: new Date().toISOString(),
      })

      saveToLocalStorage()
    }
  }

  /**
   * Complete a tour step
   */
  function completeTourStep(stepId) {
    const step = tourSteps.value.find(s => s.id === stepId)
    if (step && !step.completed) {
      step.completed = true

      // Check if all tour steps are completed
      if (completedTourStepsCount.value === tourSteps.value.length) {
        hasCompletedTour.value = true
      }

      saveToLocalStorage()
    }
  }

  /**
   * Skip the tour
   */
  function skipTour() {
    preferences.value.skipTour = true
    hasCompletedTour.value = true
    tourSteps.value.forEach(step => {
      step.completed = true
    })
    saveToLocalStorage()
  }

  /**
   * Reset tour (allow user to restart)
   */
  function resetTour() {
    hasCompletedTour.value = false
    preferences.value.skipTour = false
    tourSteps.value.forEach(step => {
      step.completed = false
    })
    saveToLocalStorage()
  }

  /**
   * Complete onboarding
   */
  function completeOnboarding() {
    onboardingCompleted.value = true
    metrics.value.completionTime = new Date().toISOString()

    // Calculate time to activation
    if (metrics.value.startTime) {
      const start = new Date(metrics.value.startTime)
      const end = new Date(metrics.value.completionTime)
      metrics.value.activationTime = Math.round((end - start) / 1000 / 60) // minutes
    }

    saveToLocalStorage()
  }

  /**
   * Reset onboarding (for testing or re-onboarding)
   */
  function resetOnboarding() {
    onboardingCompleted.value = false
    currentStep.value = 0
    hasSeenWelcome.value = false
    hasCompletedTour.value = false
    selectedRole.value = null
    selectedUseCase.value = null

    checklistItems.value.forEach(item => {
      item.completed = false
    })

    tourSteps.value.forEach(step => {
      step.completed = false
    })

    metrics.value = {
      startTime: new Date().toISOString(),
      completionTime: null,
      timeToFirstValue: null,
      activationTime: null,
      featureInteractions: [],
    }

    preferences.value = {
      skipTour: false,
      showHints: true,
      emailNotifications: true,
      tourLanguage: 'ru',
    }

    saveToLocalStorage()
  }

  /**
   * Update preferences
   */
  function updatePreferences(newPreferences) {
    preferences.value = {
      ...preferences.value,
      ...newPreferences,
    }
    saveToLocalStorage()
  }

  /**
   * Track feature interaction
   */
  function trackFeatureInteraction(featureName) {
    metrics.value.featureInteractions.push({
      feature: featureName,
      timestamp: new Date().toISOString(),
    })
    saveToLocalStorage()
  }

  /**
   * Get onboarding analytics data
   */
  function getAnalytics() {
    return {
      progress: overallProgress.value,
      completedChecklistItems: completedChecklistCount.value,
      completedTourSteps: completedTourStepsCount.value,
      startTime: metrics.value.startTime,
      completionTime: metrics.value.completionTime,
      activationTime: metrics.value.activationTime,
      featureInteractions: metrics.value.featureInteractions,
      role: selectedRole.value,
      useCase: selectedUseCase.value,
    }
  }

  return {
    // State
    onboardingCompleted,
    currentStep,
    hasSeenWelcome,
    hasCompletedTour,
    selectedRole,
    selectedUseCase,
    checklistItems,
    tourSteps,
    preferences,
    metrics,

    // Computed
    completedChecklistCount,
    checklistProgress,
    completedTourStepsCount,
    tourProgress,
    overallProgress,
    isOnboardingActive,

    // Actions
    initFromLocalStorage,
    markWelcomeSeen,
    setUserRole,
    completeChecklistItem,
    completeTourStep,
    skipTour,
    resetTour,
    completeOnboarding,
    resetOnboarding,
    updatePreferences,
    trackFeatureInteraction,
    getAnalytics,
  }
})
