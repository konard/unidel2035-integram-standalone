// logger.js - Centralized logging utility (Issue #2140, #3728)
// IMPORTANT: Load environment variables FIRST before checking DISABLE_LOGGING
import '../config/env.js';

import pino from 'pino';
import fs from 'fs';
import path from 'path';

// Check if logging is disabled via environment variable
const LOGGING_DISABLED = process.env.DISABLE_LOGGING === 'true' || process.env.DISABLE_LOGGING === '1';

// Ensure log directory exists
const LOG_DIR = process.env.LOG_DIR || '/var/log/dronedoc';
const LOG_FILE = path.join(LOG_DIR, 'backend-app.log');

// Try to create log directory if it doesn't exist (unless logging is disabled)
if (!LOGGING_DISABLED) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.warn(`Failed to create log directory ${LOG_DIR}:`, error.message);
  }
}

// Disable console logging globally if DISABLE_LOGGING is true (Issue #3728)
// This intercepts console.log, console.warn, console.error, console.info, console.debug
if (LOGGING_DISABLED) {
  const noop = () => {}; // No-operation function

  // Store original console methods (in case they need to be restored)
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  // Override console methods with no-ops
  console.log = noop;
  console.warn = noop;
  console.error = noop;
  console.info = noop;
  console.debug = noop;

  // Export function to restore console if needed
  globalThis.__restoreConsole = () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  };
}

// Configure logger with file output (or silent logger if disabled)
const logger = LOGGING_DISABLED ? pino({
  level: 'silent' // Silent level disables all logging
}) : pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    // Development: pretty console output + file
    targets: [
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      },
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: LOG_FILE,
          mkdir: true
        }
      }
    ]
  } : {
    // Production: file output only (JSON format)
    target: 'pino/file',
    options: {
      destination: LOG_FILE,
      mkdir: true
    }
  }
});

/**
 * Create a child logger with a specific module name
 * @param {string} moduleName - Name of the module
 * @returns {object} Child logger instance
 */
export function createLogger(moduleName) {
  const childLogger = logger.child({ module: moduleName });
  // Add .log() method alias for compatibility
  childLogger.log = childLogger.info.bind(childLogger);
  return childLogger;
}

/**
 * Check if logging is disabled
 * @returns {boolean} True if logging is disabled
 */
export function isLoggingDisabled() {
  return LOGGING_DISABLED;
}

// Add .log() method alias for compatibility (maps to .info())
// Some code might expect logger.log() to exist
logger.log = logger.info.bind(logger);

export default logger;
