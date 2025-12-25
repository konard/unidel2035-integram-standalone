/**
 * Logger Utility
 * Simple logging utility for client-side debugging
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

class Logger {
  constructor(namespace = 'app') {
    this.namespace = namespace
    this.level = import.meta.env.DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.debug(`[${this.namespace}]`, ...args)
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.info(`[${this.namespace}]`, ...args)
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn(`[${this.namespace}]`, ...args)
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error(`[${this.namespace}]`, ...args)
    }
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO
    } else {
      this.level = level
    }
  }
}

// Create default logger instance
const logger = new Logger('integram')

// Export both the class and default instance
export { Logger, LOG_LEVELS, logger }
export default logger
