/**
 * Logger Utility
 *
 * Simple logging utility for debugging and monitoring
 */

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = {
  debug(...args) {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  info(...args) {
    console.log('[INFO]', ...args);
  },

  warn(...args) {
    console.warn('[WARN]', ...args);
  },

  error(...args) {
    console.error('[ERROR]', ...args);
  }
};

export default logger;
