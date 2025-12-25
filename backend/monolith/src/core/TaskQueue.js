// TaskQueue.js - Task queue management with priority support
import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import metrics from '../utils/metrics.js';
import { BoundedMap, limitArraySize } from '../utils/memoryOptimization.js';

/**
 * Task statuses
 */
export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Task priorities
 */
export const TaskPriority = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * TaskQueue manages the queue of tasks for agent processing
 * Issue #2157: Added memory optimization to prevent unbounded growth
 */
export class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    // Use BoundedMap to limit memory usage
    this.maxTasks = options.maxTasks || 10000;
    this.tasks = new BoundedMap(this.maxTasks);
    this.queues = {
      [TaskPriority.CRITICAL]: [],
      [TaskPriority.HIGH]: [],
      [TaskPriority.NORMAL]: [],
      [TaskPriority.LOW]: []
    };
    this.maxRetries = options.maxRetries || 3;
    this.taskTimeout = options.taskTimeout || 300000; // 5 minutes default
    this.deadLetterQueue = [];
    this.maxDeadLetterSize = options.maxDeadLetterSize || 1000;
    this.taskRetentionMs = options.taskRetentionMs || 86400000; // 24 hours
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour

    // Start periodic cleanup
    this._startCleanupTimer();

    logger.info('TaskQueue initialized', {
      maxRetries: this.maxRetries,
      taskTimeout: this.taskTimeout,
      maxTasks: this.maxTasks,
      maxDeadLetterSize: this.maxDeadLetterSize,
      taskRetentionMs: this.taskRetentionMs
    });
  }

  /**
   * Create a new task
   */
  createTask(taskData) {
    const task = {
      id: randomUUID(),
      status: TaskStatus.PENDING,
      priority: taskData.priority || TaskPriority.NORMAL,
      type: taskData.type,
      payload: taskData.payload,
      retries: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedAgent: null,
      result: null,
      error: null
    };

    this.tasks.set(task.id, task);
    this.queues[task.priority].push(task.id);
    metrics.increment('tasksCreated');

    logger.info({ taskId: task.id, type: task.type, priority: task.priority }, 'Task created');
    this.emit('task:created', task);

    return task;
  }

  /**
   * Get next task from queue (highest priority first)
   */
  getNextTask() {
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const taskId = queue.shift();
        const task = this.tasks.get(taskId);
        if (task && task.status === TaskStatus.PENDING) {
          return task;
        }
      }
    }
    return null;
  }

  /**
   * Assign task to an agent
   */
  assignTask(taskId, agentId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new Error(`Task ${taskId} is not in pending state`);
    }

    task.status = TaskStatus.IN_PROGRESS;
    task.assignedAgent = agentId;
    task.updatedAt = new Date();
    task.startedAt = new Date();
    metrics.increment('tasksInProgress');

    logger.info({ taskId, agentId }, 'Task assigned to agent');
    this.emit('task:assigned', task);

    // Set timeout for task
    this._setTaskTimeout(taskId);

    return task;
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = TaskStatus.COMPLETED;
    task.result = result;
    task.updatedAt = new Date();
    task.completedAt = new Date();
    metrics.decrement('tasksInProgress');
    metrics.increment('tasksCompleted');

    logger.info({ taskId, duration: task.completedAt - task.startedAt }, 'Task completed');
    this.emit('task:completed', task);

    this._clearTaskTimeout(taskId);

    return task;
  }

  /**
   * Mark task as failed
   */
  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.retries++;
    task.error = error;
    task.updatedAt = new Date();

    if (task.retries < this.maxRetries) {
      // Retry task
      task.status = TaskStatus.PENDING;
      task.assignedAgent = null;
      this.queues[task.priority].push(task.id);
      metrics.decrement('tasksInProgress');

      logger.warn({ taskId, retries: task.retries, error }, 'Task failed, retrying');
      this.emit('task:retry', task);
    } else {
      // Move to dead letter queue
      task.status = TaskStatus.FAILED;
      this.deadLetterQueue.push(task.id);
      metrics.decrement('tasksInProgress');
      metrics.increment('tasksFailed');

      logger.error({ taskId, error }, 'Task failed permanently');
      this.emit('task:failed', task);
    }

    this._clearTaskTimeout(taskId);

    return task;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const wasInProgress = task.status === TaskStatus.IN_PROGRESS;
    task.status = TaskStatus.CANCELLED;
    task.updatedAt = new Date();

    if (wasInProgress) {
      metrics.decrement('tasksInProgress');
    }

    // Remove from queues
    Object.values(this.queues).forEach(queue => {
      const index = queue.indexOf(taskId);
      if (index > -1) {
        queue.splice(index, 1);
      }
    });

    logger.info({ taskId }, 'Task cancelled');
    this.emit('task:cancelled', task);

    this._clearTaskTimeout(taskId);

    return task;
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status) {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue() {
    return this.deadLetterQueue.map(id => this.tasks.get(id));
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      total: this.tasks.size,
      pending: this.getTasksByStatus(TaskStatus.PENDING).length,
      inProgress: this.getTasksByStatus(TaskStatus.IN_PROGRESS).length,
      completed: this.getTasksByStatus(TaskStatus.COMPLETED).length,
      failed: this.getTasksByStatus(TaskStatus.FAILED).length,
      cancelled: this.getTasksByStatus(TaskStatus.CANCELLED).length,
      deadLetter: this.deadLetterQueue.length
    };
  }

  /**
   * Set task timeout
   * @private
   */
  _setTaskTimeout(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.timeoutId = setTimeout(() => {
      logger.warn({ taskId }, 'Task timeout reached');
      this.failTask(taskId, 'Task timeout reached');
    }, this.taskTimeout);
  }

  /**
   * Clear task timeout
   * @private
   */
  _clearTaskTimeout(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.timeoutId) {
      clearTimeout(task.timeoutId);
      delete task.timeoutId;
    }
  }

  /**
   * Start periodic cleanup of old tasks
   * Issue #2157: Prevent unbounded memory growth
   * @private
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);

    logger.debug('TaskQueue cleanup timer started');
  }

  /**
   * Cleanup old completed/failed tasks
   * Issue #2157: Prevent memory leaks
   * @private
   */
  _cleanup() {
    const initialSize = this.tasks.size;

    // Clean up old completed/failed/cancelled tasks
    const now = Date.now();
    const taskIdsToRemove = [];

    for (const [taskId, task] of this.tasks.entries()) {
      // Keep pending and in-progress tasks
      if (task.status === TaskStatus.PENDING || task.status === TaskStatus.IN_PROGRESS) {
        continue;
      }

      // Remove old completed/failed/cancelled tasks
      const age = now - new Date(task.updatedAt).getTime();
      if (age > this.taskRetentionMs) {
        taskIdsToRemove.push(taskId);
      }
    }

    // Remove old tasks
    for (const taskId of taskIdsToRemove) {
      this.tasks.delete(taskId);
    }

    // Limit dead letter queue size
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      const removed = this.deadLetterQueue.length - this.maxDeadLetterSize;
      this.deadLetterQueue.splice(0, removed);
    }

    // Limit queue sizes (remove orphaned task IDs)
    for (const [priority, queue] of Object.entries(this.queues)) {
      // Remove task IDs that no longer exist
      this.queues[priority] = queue.filter(taskId => this.tasks.has(taskId));
    }

    if (taskIdsToRemove.length > 0) {
      logger.info({
        removedTasks: taskIdsToRemove.length,
        initialSize,
        finalSize: this.tasks.size,
        deadLetterSize: this.deadLetterQueue.length
      }, 'TaskQueue cleanup completed');
    }
  }

  /**
   * Stop cleanup timer and clear resources
   * Issue #2157: Proper shutdown
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all task timeouts
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
    }

    logger.info('TaskQueue shutdown complete');
  }
}
