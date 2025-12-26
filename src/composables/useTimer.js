/**
 * Composable for managing timers (setTimeout/setInterval) with automatic cleanup
 * Prevents memory leaks by ensuring all timers are cleared when component unmounts
 *
 * @example
 * import { useTimer } from '@/composables/useTimer'
 *
 * const { setTimeout, setInterval, clearTimeout, clearInterval, clearAll } = useTimer()
 *
 * // Use just like native setTimeout/setInterval
 * const timerId = setTimeout(() => {
 *   console.log('This will be auto-cleaned on unmount')
 * }, 1000)
 *
 * // Manually clear if needed
 * clearTimeout(timerId)
 *
 * // All timers are automatically cleared on component unmount
 */

import { onUnmounted } from 'vue'

export function useTimer() {
  const timeouts = new Set()
  const intervals = new Set()

  /**
   * Set a timeout that will be automatically cleaned up on unmount
   * @param {Function} callback - Function to execute after delay
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  const setTimeout = (callback, delay) => {
    const id = window.setTimeout(() => {
      callback()
      // Auto-remove from tracking after execution
      timeouts.delete(id)
    }, delay)

    timeouts.add(id)
    return id
  }

  /**
   * Set an interval that will be automatically cleaned up on unmount
   * @param {Function} callback - Function to execute repeatedly
   * @param {number} delay - Delay in milliseconds between executions
   * @returns {number} Timer ID
   */
  const setInterval = (callback, delay) => {
    const id = window.setInterval(callback, delay)
    intervals.add(id)
    return id
  }

  /**
   * Clear a specific timeout
   * @param {number} id - Timer ID to clear
   */
  const clearTimeout = (id) => {
    if (id !== undefined && id !== null) {
      window.clearTimeout(id)
      timeouts.delete(id)
    }
  }

  /**
   * Clear a specific interval
   * @param {number} id - Timer ID to clear
   */
  const clearInterval = (id) => {
    if (id !== undefined && id !== null) {
      window.clearInterval(id)
      intervals.delete(id)
    }
  }

  /**
   * Manually clear all timers (normally happens automatically on unmount)
   */
  const clearAll = () => {
    timeouts.forEach(id => window.clearTimeout(id))
    intervals.forEach(id => window.clearInterval(id))
    timeouts.clear()
    intervals.clear()
  }

  // Automatically cleanup on component unmount
  onUnmounted(() => {
    clearAll()
  })

  return {
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    clearAll
  }
}
