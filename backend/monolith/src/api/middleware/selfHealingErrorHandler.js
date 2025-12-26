/**
 * Self-Healing Error Handler Middleware
 *
 * Additional layer for automatic error recovery and monitoring
 * Works in conjunction with the main errorHandler middleware
 *
 * @module selfHealingErrorHandler
 */

import logger from '../../utils/logger.js';
import { errorHandler } from './errorHandler.js';

/**
 * Track error patterns for self-healing detection
 */
const errorStats = {
  byPath: new Map(),
  byType: new Map(),
  total: 0,
  lastReset: Date.now()
};

/**
 * Reset error statistics (runs every hour)
 */
function resetErrorStats() {
  errorStats.byPath.clear();
  errorStats.byType.clear();
  errorStats.total = 0;
  errorStats.lastReset = Date.now();
  logger.info('Error statistics reset');
}

// Reset stats every hour
setInterval(resetErrorStats, 60 * 60 * 1000);

/**
 * Track error occurrence
 *
 * @param {Error} error - Error object
 * @param {string} path - Request path
 */
function trackError(error, path) {
  // Track by path
  const pathCount = errorStats.byPath.get(path) || 0;
  errorStats.byPath.set(path, pathCount + 1);

  // Track by error type
  const errorType = error.name || 'UnknownError';
  const typeCount = errorStats.byType.get(errorType) || 0;
  errorStats.byType.set(errorType, typeCount + 1);

  // Track total
  errorStats.total++;

  // Alert if error rate is high for a specific path
  if (pathCount > 10) {
    logger.warn({
      path,
      count: pathCount,
      errorType
    }, 'High error rate detected for path');
  }
}

/**
 * Self-healing error handler
 * Wraps the main error handler with additional monitoring and recovery logic
 *
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function selfHealingErrorHandler(err, req, res, next) {
  // Track this error
  trackError(err, req.path);

  // Delegate to main error handler
  errorHandler(err, req, res, next);
}

/**
 * Setup global process error handlers
 * Prevents the application from crashing on unhandled errors
 */
export function setupProcessErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      type: 'uncaughtException'
    }, 'Uncaught exception occurred');

    // In production, keep the process running
    // In development, exit to make errors visible
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Process continuing despite uncaught exception (production mode)');
    } else {
      logger.error('Exiting process due to uncaught exception (development mode)');
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      type: 'unhandledRejection'
    }, 'Unhandled promise rejection');

    // In production, log and continue
    // In development, exit to make errors visible
    if (process.env.NODE_ENV !== 'production') {
      logger.error('Exiting process due to unhandled rejection (development mode)');
      process.exit(1);
    }
  });

  // Handle warnings
  process.on('warning', (warning) => {
    logger.warn({
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    }, 'Process warning');
  });

  logger.info('Process error handlers initialized');
}

/**
 * Get current error statistics
 *
 * @returns {Object} Error statistics
 */
export function getErrorStats() {
  return {
    total: errorStats.total,
    byPath: Array.from(errorStats.byPath.entries()).map(([path, count]) => ({
      path,
      count
    })),
    byType: Array.from(errorStats.byType.entries()).map(([type, count]) => ({
      type,
      count
    })),
    lastReset: new Date(errorStats.lastReset).toISOString()
  };
}

export default selfHealingErrorHandler;
